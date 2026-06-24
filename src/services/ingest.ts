import pdf from "pdf-parse";
import { db } from "../db/client";
import { documents, chunks } from "../db/schema";
import { chunkDocument } from "./chunker";
import { extractProcurementData } from "./extractor";
import { embedTexts } from "./search";
import { extractProcurementDataVertex } from "./vertexExtractor";

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  extraction: Awaited<ReturnType<typeof extractProcurementData | typeof extractProcurementDataVertex>>;
}

/**
 * Full ingestion pipeline for a procurement PDF.
 *
 * Steps:
 *  1. Parse PDF → raw text (pdf-parse)
 *  2. Structure-aware chunking
 *  3. Claude structured extraction on full text
 *  4. Batch embed all chunks (OpenAI)
 *  5. Persist to PostgreSQL / pgvector
 *
 * Each step is independently observable — confidence scores and missing fields
 * are stored per document so the eval loop can aggregate them.
 */
export async function ingestDocument(
  buffer: Buffer,
  filename: string
): Promise<IngestResult> {
  // ── 1. Parse PDF ───────────────────────────────────────────────────────────
  const parsed = await pdf(buffer);
  const rawText = parsed.text;

  if (!rawText || rawText.trim().length < 100) {
    throw new Error("PDF appears to be empty or scanned without OCR text");
  }

  // ── 2. Structure-aware chunking ────────────────────────────────────────────
  const textChunks = chunkDocument(rawText);
  console.log(`[ingest] ${filename}: ${textChunks.length} chunks from ${rawText.length} chars`);
  const chunkContents = textChunks.map((c) => c.content);

  // ── 3. Parallel Execution: Extraction + Embeddings ─────────────────────────
  const useVertex = !!process.env.GCP_PROJECT_ID;
  const [extraction, embeddings] = await Promise.all([
    useVertex ? extractProcurementDataVertex(buffer) : extractProcurementData(rawText),
    embedTexts(chunkContents),
  ]);

  console.log(
    `[ingest] Extraction confidence: ${(extraction.confidence * 100).toFixed(1)}%`,
    extraction.missingFields.length > 0
      ? `| Missing: ${extraction.missingFields.join(", ")}`
      : "| All key fields present"
  );

  // ── 4. Persist document & chunks in transaction ────────────────────────────
  const result = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        filename,
        rawText,
        extracted: extraction.data as Record<string, unknown>,
        extractionConfidence: extraction.confidence,
      })
      .returning({ id: documents.id });

    const chunkRows = textChunks.map((chunk, i) => ({
      documentId: doc.id,
      chunkIndex: chunk.index,
      content: chunk.content,
      embedding: embeddings[i],
    }));

    // Insert in batches to avoid hitting PostgreSQL parameter limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
      await tx.insert(chunks).values(chunkRows.slice(i, i + BATCH_SIZE));
    }

    return {
      documentId: doc.id,
      chunkCount: textChunks.length,
      extraction,
    };
  });

  return result;
}
