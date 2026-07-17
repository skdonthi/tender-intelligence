import { useState } from "react";
import type { DocDetail, RelevanceResponse } from "../lib/api";
import { api } from "../lib/api";
import { ConfidenceMeter } from "./ConfidenceMeter";

interface Props {
  doc: DocDetail;
}

export function ExtractionView({ doc }: Props) {
  const ex   = doc.extracted;
  const conf = doc.extractionConfidence ?? 0;

  if (!ex) {
    return (
      <div style={{ padding: "24px", color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "12px" }}>
        Extraction data unavailable
      </div>
    );
  }

  const nullFields: string[] = [];
  if (!ex.referenceNumber)           nullFields.push("REF");
  if (!ex.deadlineSubmission)        nullFields.push("DEADLINE");
  if (!ex.estimatedValue?.amount)    nullFields.push("VALUE");
  if (!ex.contractingAuthority?.nutsCode) nullFields.push("NUTS");

  const procLabel: Record<string, string> = {
    open:                    "Open Procedure",
    restricted:              "Restricted",
    competitive_dialogue:    "Competitive Dialogue",
    negotiated:              "Negotiated",
    innovation_partnership:  "Innovation Partnership",
    unknown:                 "—",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header */}
      <div className="doc-header">
        <div className="doc-title-block">
          <div className="doc-filename">{doc.filename}</div>
          <div className="doc-proc-title">{ex.title ?? "Untitled procurement"}</div>
        </div>
        <ConfidenceMeter value={conf} />
      </div>

      {/* Missing fields notice */}
      {nullFields.length > 0 && (
        <div className="missing-notice">
          <span className="missing-notice-icon">△</span>
          <div>
            <div style={{ fontSize: "11px", marginBottom: "2px", fontWeight: 500 }}>
              Fields not found in document
            </div>
            <div className="missing-list">{nullFields.join(" · ")}</div>
          </div>
        </div>
      )}

      {/* Procurement details */}
      <div>
        <div className="section-label">Procurement details</div>
        <div className="fields-grid">
          <Field label="Reference" mono>{ex.referenceNumber}</Field>
          <Field label="Procedure">{procLabel[ex.procedureType] ?? "—"}</Field>
          <Field label="Submission deadline" mono>
            {ex.deadlineSubmission ? formatDate(ex.deadlineSubmission) : null}
          </Field>
          <Field label="Contract start" mono>
            {ex.contractStartDate ? formatDate(ex.contractStartDate) : null}
          </Field>
          <Field label="Estimated value" mono>
            {ex.estimatedValue?.amount != null
              ? formatCurrency(ex.estimatedValue.amount, ex.estimatedValue.currency ?? undefined)
              : null}
          </Field>
          <Field label="Duration">{ex.contractDuration}</Field>
          <Field label="Description" fullWidth small>{ex.description}</Field>
        </div>
      </div>

      {/* Contracting authority */}
      <div>
        <div className="section-label">Contracting authority</div>
        <div className="fields-grid">
          <Field label="Name" fullWidth>{ex.contractingAuthority?.name}</Field>
          <Field label="Country" mono>{ex.contractingAuthority?.country}</Field>
          <Field label="NUTS code" mono>{ex.contractingAuthority?.nutsCode}</Field>
        </div>
      </div>

      {/* CPV codes */}
      <div>
        <div className="section-label">CPV codes</div>
        {ex.cpvCodes?.length ? (
          <div className="cpv-list">
            {ex.cpvCodes.map((c) => <span key={c} className="cpv-tag">{c}</span>)}
          </div>
        ) : <Null />}
      </div>

      {/* Lots */}
      <div>
        <div className="section-label">Lots</div>
        {ex.lots?.length ? (
          <div className="lots-list">
            {ex.lots.map((l) => (
              <div key={l.lotNumber} className="lot-row">
                <span className="lot-num">LOT {formatLotNumber(l.lotNumber)}</span>
                <span className="lot-title">{l.title}</span>
                {l.value?.amount != null && (
                  <span className="lot-value">
                    {formatCurrency(l.value.amount, l.value.currency ?? undefined)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0" }}>
            No lots — single-lot procurement
          </div>
        )}
      </div>

      {/* Per-lot relevance — "X von Y Losen relevant" */}
      <LotRelevancePanel doc={doc} />

    </div>
  );
}

// ── Lot relevance ─────────────────────────────────────────────────────────────
// Scores each lot against a free-text search profile via an LLM judge (not vector
// similarity) — the "X von Y Losen relevant" metric.

function LotRelevancePanel({ doc }: { doc: DocDetail }) {
  const [profile, setProfile] = useState("");
  const [result, setResult]   = useState<RelevanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function run() {
    if (!profile.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.scoreRelevance(doc.id, profile));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const tier =
    result && result.totalCount > 0
      ? result.relevantCount === 0
        ? "low"
        : result.relevantCount === result.totalCount
          ? "high"
          : "mid"
      : "mid";
  const badgeColor =
    tier === "high" ? "var(--green)" : tier === "low" ? "var(--text-muted)" : "var(--amber)";

  return (
    <div className="relevance">
      <div className="section-label">Lot relevance</div>

      <div style={{ display: "flex", gap: "8px", marginBottom: result || error ? "12px" : 0 }}>
        <input
          className="relevance-input"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="Your search profile — what does your company bid on?"
          disabled={loading}
          style={{
            flex: 1, background: "var(--surface-hi)", border: "1px solid var(--border-hi)",
            borderRadius: "var(--radius)", padding: "8px 10px", fontFamily: "var(--sans)",
            fontSize: "12px", color: "var(--text)", outline: "none",
          }}
        />
        <button
          onClick={run}
          disabled={loading || !profile.trim()}
          style={{
            background: "var(--ink)", color: "#fff", border: "none",
            borderRadius: "var(--radius)", padding: "0 14px", fontSize: "12px",
            fontWeight: 500, cursor: loading || !profile.trim() ? "default" : "pointer",
            opacity: loading || !profile.trim() ? 0.5 : 1,
          }}
        >
          {loading ? "Scoring…" : "Score lots"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--mono)" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span
            className="relevance-badge"
            style={{
              alignSelf: "flex-start", fontFamily: "var(--mono)", fontSize: "11px",
              fontWeight: 500, padding: "3px 8px", borderRadius: "var(--radius)",
              color: badgeColor, border: `1px solid ${badgeColor}`,
            }}
          >
            {result.relevantCount} von {result.totalCount} Losen relevant
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {result.lots.map((l) => (
              <div
                key={l.lotNumber}
                className="relevance-lot"
                style={{
                  padding: "8px 12px", background: "var(--surface)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  borderLeft: `2px solid ${l.relevant ? "var(--green)" : "var(--border-hi)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "10px", color: l.relevant ? "var(--green)" : "var(--text-muted)", minWidth: "44px" }}>
                    {l.relevant ? "RELEVANT" : "—"}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text)", flex: 1 }}>
                    {l.lotNumber !== "—" ? `LOT ${formatLotNumber(l.lotNumber)} · ` : ""}{l.title}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "var(--text-muted)" }}>
                    {Math.round(l.score * 100)}%
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "3px", lineHeight: 1.45 }}>
                  {l.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Null() {
  return <span className="field-null">—</span>;
}

interface FieldProps {
  label:      string;
  children?:  React.ReactNode;
  mono?:      boolean;
  fullWidth?: boolean;
  small?:     boolean;
}

function Field({ label, children, mono, fullWidth, small }: FieldProps) {
  const isEmpty = children === null || children === undefined || children === "";
  return (
    <div className={`field ${fullWidth ? "full-width" : ""}`}>
      <div className="field-label">{label}</div>
      <div
        className="field-value"
        style={{
          fontFamily: mono ? "var(--mono)" : undefined,
          fontSize:   mono ? "12px" : small ? "12px" : undefined,
          fontWeight: small ? 400 : undefined,
          color:      small ? "var(--text-dim)" : undefined,
        }}
      >
        {isEmpty ? <Null /> : children}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eForms lot identifiers are already "LOT-0001"; strip the prefix so UI labels
// ("LOT …") don't render as "LOT LOT-0001".
function formatLotNumber(lotNumber: string) {
  return lotNumber.replace(/^LOT[-\s]*/i, "");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(amount: number, currency?: string) {
  return new Intl.NumberFormat("de-DE", {
    style:                currency ? "currency" : "decimal",
    currency:             currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
