import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentRail } from "../components/DocumentRail";
import { ExtractionView } from "../components/ExtractionView";
import { QAPanel } from "../components/QAPanel";
import { api } from "../lib/api";
import type { DocDetail, DocSummary } from "../lib/api";
import { listDocuments } from "../lib/serverFns";

// Route-level loader runs the listDocuments server function (server-only).
export const Route = createFileRoute("/")({
  loader: () => listDocuments(),
  component: Dashboard,
});

function Dashboard() {
  const initialDocs               = Route.useLoaderData() as DocSummary[];
  const [docs, setDocs]           = useState<DocSummary[]>(initialDocs);
  const [activeId, setActiveId]   = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocDetail | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus]       = useState("ready");
  const [toast, setToast]         = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  const selectDocument = useCallback(async (id: string) => {
    setActiveId(id);
    setActiveDoc(null);
    setLoadingDoc(true);
    try {
      const doc = await api.getDocument(id);
      setActiveDoc(doc);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  const uploadDocument = useCallback(async (file: File) => {
    setUploading(true);
    setStatus("ingesting…");
    try {
      const result = await api.uploadDocument(file);
      showToast(`Ingested · ${Math.round(result.confidence * 100)}% confidence`, "success");
      const updated = await api.listDocuments();
      setDocs(updated);
      await selectDocument(result.documentId);
      setStatus("ready");
    } catch (e) {
      showToast((e as Error).message, "error");
      setStatus("error");
    } finally {
      setUploading(false);
    }
  }, [selectDocument]);

  return (
    <div className="app">
      <header>
        <span className="logo">
          <span className="logo-mark" />
          Patterno
        </span>
        <span className="header-tag">Procurement Intelligence</span>
        <div className="header-right">
          <span className="status-dot" />
          <span className="status-label">{status}</span>
        </div>
      </header>

      <DocumentRail
        docs={docs}
        activeId={activeId}
        onSelect={selectDocument}
        onUpload={uploadDocument}
        uploading={uploading}
      />

      <main className="centre">
        {loadingDoc ? (
          <div style={{ display:"flex", alignItems:"center", gap:"8px",
            padding:"16px", fontFamily:"var(--mono)", fontSize:"11px", color:"var(--text-muted)" }}>
            <span className="spinner" /> Loading document…
          </div>
        ) : activeDoc ? (
          <ExtractionView doc={activeDoc} />
        ) : (
          <div className="empty-state">
            <RedactionGrid />
            <span className="empty-title">No document selected</span>
            <span className="empty-sub">Upload a procurement PDF to extract structured intelligence</span>
          </div>
        )}
      </main>

      <QAPanel documentId={activeId} />

      <div id="toast" className={toast ? `show ${toast.type}` : ""}>{toast?.msg}</div>
    </div>
  );
}

function RedactionGrid() {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:"3px",
      opacity:0.12, marginBottom:"16px", width:"80px" }}>
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} style={{
          height:"3px", borderRadius:"1px",
          background: i % 5 === 0 ? "var(--blue)" : "var(--text-muted)",
          opacity: 0.3 + (i % 7) * 0.1,
        }} />
      ))}
    </div>
  );
}
