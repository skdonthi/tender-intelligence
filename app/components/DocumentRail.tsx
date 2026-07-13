import { useRef } from "react";
import type { DocSummary } from "../lib/api";

interface Props {
  docs: DocSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
  onTedPull: () => void;
  tedPulling: boolean;
}

export function DocumentRail({
  docs,
  activeId,
  onSelect,
  onUpload,
  uploading,
  onTedPull,
  tedPulling,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files?.[0]) return;
    if (files[0].type !== "application/pdf") {
      alert("PDF files only");
      return;
    }
    onUpload(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    handleFiles(e.dataTransfer.files);
  }

  return (
    <aside className="rail">
      <div className="rail-header">
        <span className="rail-title">Documents</span>
        <span className="doc-count">{docs.length || "—"}</span>
      </div>

      {/* Upload zone */}
      <div
        className={`upload-zone ${uploading ? "uploading" : ""}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("drag-over");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="Upload procurement PDF"
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="upload-icon">
          {uploading ? <span className="spinner" /> : "⊕"}
        </div>
        <div className="upload-label">
          {uploading ? (
            <span>Ingesting document…</span>
          ) : (
            <>
              <strong>Upload PDF</strong>
              <br />
              procurement · tender · defence
            </>
          )}
        </div>
      </div>

      {/* Live TED pull — official EU Publications Office API, defence CPV 35* */}
      <button
        type="button"
        onClick={onTedPull}
        disabled={tedPulling || uploading}
        aria-label="Pull recent defence notices from TED"
        style={{
          margin: "0 12px 8px",
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          background: "transparent",
          border: "1px dashed var(--border, #ccc)",
          borderRadius: "6px",
          cursor: tedPulling || uploading ? "wait" : "pointer",
          font: "inherit",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}
      >
        {tedPulling ? (
          <>
            <span className="spinner" /> Pulling from TED
          </>
        ) : (
          <>⇣ Pull live defence tenders (TED)</>
        )}
      </button>

      {/* Document list */}
      <div className="doc-list">
        {docs.length === 0 ? (
          <div
            style={{
              padding: "16px",
              fontSize: "12px",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            No documents yet
          </div>
        ) : (
          docs.map((d) => {
            const conf = d.extractionConfidence ?? 0;
            const tier = conf >= 0.8 ? "high" : conf >= 0.5 ? "mid" : "low";
            const pct = Math.round(conf * 100);
            const date = new Date(d.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            });
            return (
              <div
                key={d.id}
                className={`doc-item ${d.id === activeId ? "active" : ""}`}
                onClick={() => onSelect(d.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelect(d.id)}
              >
                <div className="doc-name">{d.filename}</div>
                <div className="doc-meta">
                  <span className="doc-date">{date}</span>
                  <span className={`conf-badge conf-${tier}`}>{pct}%</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
