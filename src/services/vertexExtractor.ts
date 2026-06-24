import { VertexAI } from "@google-cloud/vertexai";
import { ProcurementExtraction } from "./extractionSchema.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { scoreCompleteness } from "./scoring";

const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || "us-central1";

// Vertex AI initialization is lazy so we don't crash if env vars are missing at boot
let vertexAIInstance: VertexAI | null = null;
function getVertexAI(): VertexAI {
  if (!vertexAIInstance) {
    if (!projectId) {
      console.warn("[vertex] GCP_PROJECT_ID not set — make sure Google Application Default Credentials are configured.");
    }
    vertexAIInstance = new VertexAI({
      project: projectId || undefined,
      location: location,
    });
  }
  return vertexAIInstance;
}

export interface VertexExtractionResult {
  data: ProcurementExtraction;
  confidence: number;
  missingFields: string[];
  rawText: string;
}

/**
 * Extracts structured data from a PDF buffer using GCP Vertex AI Gemini 1.5 Pro.
 * Gemini natively supports multi-modal PDF inputs (including scanned OCR)
 * and guarantees output matching our Zod schema using structured JSON.
 */
export async function extractProcurementDataVertex(
  pdfBuffer: Buffer
): Promise<VertexExtractionResult> {
  const vertex = getVertexAI();
  const model = vertex.getGenerativeModel({
    model: "gemini-1.5-pro-002",
  });

  // Convert PDF buffer to Base64 part for Gemini multimodal API
  const pdfPart = {
    inlineData: {
      data: pdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    },
  };

  const textPrompt = `You are a procurement intelligence system. 
Extract structured procurement fields from the attached PDF document.
Rules:
- If a field is not present or cannot be found, set it to null. Do not invent or infer values.
- For dates, always output ISO 8601 (YYYY-MM-DD) format.
- For monetary values, separate the amount and the currency.
- If the document is in German, extract standard ISO country and NUTS codes if mentioned, and translate titles and descriptions to English.`;

  // Compile Zod schema to JSON schema for Gemini structured output constraint
  const openApiSchema = zodToJsonSchema(ProcurementExtraction);
  // Clean schema metadata which is not supported in the Gemini OpenAPI block
  delete openApiSchema.$schema;
  delete openApiSchema.definitions;

  console.log("[vertex] Submitting PDF to Gemini 1.5 Pro...");
  const response = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          pdfPart,
          { text: textPrompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: openApiSchema as any,
      temperature: 0.1,
    },
  });

  const textResponse = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error("Empty response received from Vertex AI Gemini");
  }

  // Parse structured JSON
  const rawInput = JSON.parse(textResponse);

  // Validate with Zod
  const parseResult = ProcurementExtraction.safeParse(rawInput);
  if (!parseResult.success) {
    console.warn("[vertex] Schema validation failed:", parseResult.error.flatten());
    return {
      data: rawInput as ProcurementExtraction,
      confidence: 0,
      missingFields: ["schema_validation_failed"],
      rawText: "[PDF analyzed natively by Gemini]",
    };
  }

  const data = parseResult.data;

  // Field-completeness heuristic (shared with the Claude extractor) — NOT precision.
  const { completeness, missingFields } = scoreCompleteness(data);

  return {
    data,
    confidence: completeness,
    missingFields,
    rawText: "[PDF analyzed natively by Gemini]",
  };
}

// Completeness scoring is shared with the Claude extractor — see ./scoring.ts.
