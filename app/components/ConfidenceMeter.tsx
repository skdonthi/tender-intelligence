interface Props {
  value: number; // 0–1 field-completeness score (not a precision measure)
}

const SEGMENTS = 10;

export function ConfidenceMeter({ value }: Props) {
  const filled  = Math.round(value * SEGMENTS);
  const pct     = Math.round(value * 100);
  const tier    = value >= 0.8 ? "high" : value >= 0.5 ? "mid" : "low";
  const color   = tier === "high" ? "var(--green)" : tier === "mid" ? "var(--amber)" : "var(--red)";

  return (
    <div className="conf-meter">
      <div className="conf-meter-label">Field completeness</div>
      <div className="conf-meter-segments">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <div
            key={i}
            className={`conf-seg ${i < filled ? `filled-${tier}` : ""}`}
          />
        ))}
      </div>
      <div className="conf-meter-value" style={{ color }}>{pct}%</div>
    </div>
  );
}
