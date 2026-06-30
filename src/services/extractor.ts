import { ProcurementExtraction, buildExtractionTool } from "./extractionSchema";
import { scoreCompleteness } from "./scoring";
import { getAnthropic } from "./llm";

// We extract from the first N tokens of the document for the structured pass.
// For long docs (>100 pages), a separate "section routing" step would identify
// the most relevant chunks first — intentionally kept simple here for the demo.
const MAX_EXTRACTION_CHARS = 12_000; // ~3000 tokens, fits in one Claude call

export interface ExtractionResult {
  data: ProcurementExtraction;
  /**
   * 0–1 field-completeness score (see src/services/scoring.ts).
   * NOT a correctness/precision measure — measured precision lives in the
   * eval loop (scripts/eval.ts). Surfaced in the UI as "field completeness".
   */
  confidence: number;
  /** Which fields were null / missing */
  missingFields: string[];
  /** Raw model response for debugging */
  rawToolInput: unknown;
}

/**
 * Main extraction entry point.
 *
 * Uses Claude tool_use (function calling) to enforce output shape.
 * The Zod schema validates the response — a parse failure means the model
 * deviated from the schema, which we surface as a low-confidence result
 * rather than silently returning bad data.
 */
export async function extractProcurementData(
  rawText: string
): Promise<ExtractionResult> {
  const truncated = rawText.slice(0, MAX_EXTRACTION_CHARS);

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [buildExtractionTool()],
    // Force the tool — this is always a structured-extraction call, so we never
    // want a free-text reply. Avoids the "model didn't call the tool" failure path.
    tool_choice: { type: "tool", name: "extract_procurement_data" },
    system: `You are a procurement intelligence system specialising in EU and German government tender documents.
Your job is to extract structured data accurately. Rules:
- Return null for any field not explicitly stated in the document. Do NOT infer or guess.
- For dates, always output ISO 8601 (YYYY-MM-DD). If only month/year is given, use the first day.
- For CPV codes, include the full 8-digit code if present.
- For monetary values, extract the number and currency separately.
- Never hallucinate reference numbers, dates, or values.`,
    messages: [
      {
        role: "user",
        content: `Extract structured procurement data from this document:\n\n${truncated}`,
      },
    ],
  });

  // Find the tool_use block
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not call the extraction tool — unexpected response");
  }

  const rawInput = toolUse.input;

  // Validate with Zod — catches model deviations from the schema
  const parseResult = ProcurementExtraction.safeParse(rawInput);
  if (!parseResult.success) {
    console.warn("Extraction schema validation failed:", parseResult.error.flatten());
    // Shape is wrong — we can't trust any field. Completeness 0, flagged.
    return {
      data: rawInput as ProcurementExtraction,
      confidence: 0,
      missingFields: ["schema_validation_failed"],
      rawToolInput: rawInput,
    };
  }

  const data = parseResult.data;
  const { completeness, missingFields } = scoreCompleteness(data);

  return { data, confidence: completeness, missingFields, rawToolInput: rawInput };
}

// Completeness scoring (FIELD_WEIGHTS, scoreCompleteness) lives in ./scoring.ts,
// shared with the Vertex extractor. It is a field-completeness heuristic, not a
// precision measure — precision is measured by the eval loop in scripts/eval.ts.
