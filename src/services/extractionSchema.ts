import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ─── Extracted procurement fields ─────────────────────────────────────────────
// This schema is the source of truth for what Claude is asked to extract.
// It's also used to validate the model response and drive the eval loop.
//
// Design principle: be explicit about what "not found" looks like.
// null = field not present in document (not a hallucination).

export const ContractingAuthority = z.object({
  name: z.string().nullable().describe("Full legal name of the contracting authority"),
  country: z.string().nullable().describe("ISO 3166-1 alpha-2 country code"),
  nutsCode: z.string().nullable().describe("EU NUTS code for the contracting authority location"),
});

export const ProcurementExtraction = z.object({
  // Identity
  referenceNumber: z
    .string()
    .nullable()
    .describe("Official procurement / tender reference number"),
  title: z
    .string()
    .nullable()
    .describe("Short title of the procurement"),
  description: z
    .string()
    .nullable()
    .describe("Summary of what is being procured, max 3 sentences"),

  // Contracting party
  contractingAuthority: ContractingAuthority,

  // Classification
  cpvCodes: z
    .array(z.string())
    .describe("CPV codes (EU Common Procurement Vocabulary) found in the document"),
  procedureType: z
    .enum([
      "open",
      "restricted",
      "competitive_dialogue",
      "negotiated",
      "innovation_partnership",
      "unknown",
    ])
    .describe("EU procurement procedure type"),

  // Key dates
  deadlineSubmission: z
    .string()
    .nullable()
    .describe("Submission deadline in ISO 8601 format if present"),
  contractStartDate: z
    .string()
    .nullable()
    .describe("Contract start date in ISO 8601 format if present"),
  contractDuration: z
    .string()
    .nullable()
    .describe("Contract duration as stated in the document (e.g. '36 months')"),

  // Value
  estimatedValue: z
    .object({
      amount: z.number().nullable(),
      currency: z.string().nullable(),
    })
    .nullable()
    .describe("Estimated contract value"),

  // Lot structure — many procurement docs split into lots
  lots: z
    .array(
      z.object({
        lotNumber: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        value: z
          .object({ amount: z.number().nullable(), currency: z.string().nullable() })
          .nullable(),
      })
    )
    .describe("Procurement lots if the contract is divided"),

  // Eligibility
  suitableForSME: z
    .boolean()
    .nullable()
    .describe("Whether the contract is explicitly flagged as suitable for SMEs"),
});

export type ProcurementExtraction = z.infer<typeof ProcurementExtraction>;

// JSON schema for Claude tool_use — generated from the Zod schema
// We use zodToJsonSchema to keep a single source of truth.
export function buildExtractionTool() {
  const schema = zodToJsonSchema(ProcurementExtraction) as Record<string, any>;
  // Clean up metadata tags that aren't strictly part of the Anthropic input schema
  delete schema.$schema;
  delete schema.definitions;
  
  return {
    name: "extract_procurement_data",
    description:
      "Extract structured procurement fields from an official government or EU procurement document. " +
      "Return null for fields not found — never invent values.",
    input_schema: schema as any,
  };
}
