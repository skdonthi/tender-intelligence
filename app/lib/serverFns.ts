import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { documents } from "../../src/db/schema";
import { ingestDocument } from "../../src/services/ingest";
import { askDocument as runAsk } from "../../src/services/search";
import { scoreLotRelevance } from "../../src/services/relevance";
import type { ProcurementExtraction } from "../../src/services/extractionSchema";

// Cap upload size. The endpoint is unauthenticated; a size limit is the minimum
// guard against running expensive LLM/embedding calls on huge inputs.
// (Rate limiting + auth are the real fix — out of scope for the demo.)
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

// Raw DB errors can carry sensitive detail (connection string, stack). Log the
// real error server-side and surface a generic message to the client.
function sanitize(scope: string, err: unknown): never {
  console.error(`[serverFn] ${scope}:`, err);
  // Surface the real cause in dev; keep it generic (no internal detail) in prod.
  const detail = import.meta.env.DEV && err instanceof Error ? ` (${err.message})` : "";
  throw new Error(`Failed to ${scope}. Please try again.${detail}`);
}

// Server functions replace the old app/api/* REST routes. The Start plugin
// turns these into RPC stubs on the client, so DATABASE_URL / API keys and the
// db + service imports below stay server-only and never reach the browser.

export const listDocuments = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const rows = await db
      .select({
        id: documents.id,
        filename: documents.filename,
        extractionConfidence: documents.extractionConfidence,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .orderBy(desc(documents.createdAt))
      .limit(50);

    // Drizzle returns Date objects; serialize createdAt for the client.
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  } catch (err) {
    sanitize("load documents", err);
  }
});

export const getDocument = createServerFn({ method: "GET" })
  .validator((id: unknown) => {
    if (typeof id !== "string" || !id) throw new Error("document id is required");
    return id;
  })
  .handler(async ({ data: id }) => {
    try {
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) throw new Error("Document not found");
      // `extracted` is jsonb (typed unknown by Drizzle); it holds a ProcurementExtraction.
      return {
        ...doc,
        createdAt: doc.createdAt.toISOString(),
        extracted: doc.extracted as ProcurementExtraction | null,
      };
    } catch (err) {
      // "Not found" is a safe, intentional message — let it through.
      if (err instanceof Error && err.message === "Document not found") throw err;
      sanitize("load document", err);
    }
  });

export const askDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { documentId?: string; question?: string };
    if (!d?.documentId) throw new Error("documentId is required");
    if (!d?.question?.trim()) throw new Error("question is required");
    return { documentId: d.documentId, question: d.question };
  })
  .handler(async ({ data }) => runAsk(data.question, data.documentId));

export const scoreRelevance = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { documentId?: string; profile?: string };
    if (!d?.documentId) throw new Error("documentId is required");
    if (!d?.profile?.trim()) throw new Error("a search profile is required");
    return { documentId: d.documentId, profile: d.profile };
  })
  .handler(async ({ data }) => {
    let ex: ProcurementExtraction | null;
    try {
      const [doc] = await db
        .select({ extracted: documents.extracted })
        .from(documents)
        .where(eq(documents.id, data.documentId));
      if (!doc) throw new Error("Document not found");
      ex = doc.extracted as ProcurementExtraction | null;
    } catch (err) {
      if (err instanceof Error && err.message === "Document not found") throw err;
      sanitize("load document", err);
    }
    const lots = (ex?.lots ?? []).map((l) => ({
      lotNumber: l.lotNumber,
      title: l.title,
      description: l.description,
    }));
    // Single-lot procurements have no lots array — score the procurement itself.
    const items =
      lots.length > 0
        ? lots
        : ex
          ? [{ lotNumber: "—", title: ex.title ?? "Procurement", description: ex.description }]
          : [];
    try {
      return await scoreLotRelevance(data.profile, items);
    } catch (err) {
      sanitize("score relevance", err);
    }
  });

export const uploadDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("expected multipart form data");
    return data;
  })
  .handler(async ({ data }) => {
    const file = data.get("file");
    if (!file || typeof file === "string") throw new Error("No file uploaded");
    if (file.type !== "application/pdf") throw new Error("Only PDF files are supported");
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ingestDocument(buffer, file.name);
    return {
      documentId: result.documentId,
      chunkCount: result.chunkCount,
      confidence: result.extraction.confidence,
      missingFields: result.extraction.missingFields,
      extracted: result.extraction.data,
    };
  });
