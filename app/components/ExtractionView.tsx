import type { DocDetail } from "../lib/api";
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
                <span className="lot-num">LOT {l.lotNumber}</span>
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
