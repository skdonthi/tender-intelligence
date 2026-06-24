import type { ProcurementExtraction } from "./extractionSchema";

/**
 * Field-completeness scoring — shared by the Claude and Vertex extractors.
 *
 * ⚠️ This is a COMPLETENESS heuristic, NOT a correctness/precision measure.
 * It answers "did the model populate the key fields?" — the weighted fraction
 * of important fields that came back non-null. A document where every field is
 * filled but *wrong* still scores 100% here.
 *
 * Measured precision against ground truth is a separate concern, handled by the
 * eval loop (scripts/eval.ts + the eval_runs table), which compares extracted
 * values to a labeled test set. Don't conflate the two:
 *   - completeness (this file) → "did we get a value?"   — gated at ingest
 *   - precision (eval loop)    → "is the value correct?" — measured offline
 */
export const FIELD_WEIGHTS: Record<string, number> = {
  referenceNumber: 1.5,
  title: 2.0,
  "contractingAuthority.name": 2.0,
  "contractingAuthority.country": 1.0,
  cpvCodes: 1.5,
  procedureType: 1.0,
  deadlineSubmission: 1.5,
  "estimatedValue.amount": 1.5,
  description: 0.5,
  contractDuration: 0.5,
};

export interface CompletenessResult {
  /** Weighted fraction of key fields present, 0–1. NOT a correctness score. */
  completeness: number;
  /** Weighted fields that were null / empty / "unknown". */
  missingFields: string[];
}

export function scoreCompleteness(data: ProcurementExtraction): CompletenessResult {
  const missingFields: string[] = [];
  let totalWeight = 0;
  let presentWeight = 0;

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    totalWeight += weight;
    const value = getNestedValue(data as Record<string, unknown>, field);
    const isMissing =
      value === null ||
      value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      value === "unknown";

    if (isMissing) missingFields.push(field);
    else presentWeight += weight;
  }

  // Honest 0–1 fraction. No floor — a half-populated doc reads as 50%, not 92%.
  return {
    completeness: totalWeight > 0 ? presentWeight / totalWeight : 0,
    missingFields,
  };
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
