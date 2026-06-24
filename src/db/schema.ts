import { pgTable, uuid, text, jsonb, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";

// ─── Canonical DDL: drizzle/0000_init.sql ───────────────────────────────────────
// This file types the schema for the Drizzle ORM query layer. It is NOT the
// source of truth for the physical schema. `drizzle/0000_init.sql` is — it
// contains DDL that drizzle-kit cannot express: the `search_vector` GENERATED
// tsvector column, its GIN index, and the IVFFlat vector index with
// `vector_cosine_ops`. Apply migrations by running that SQL file.
//
// ⚠️ Do NOT run `drizzle-kit push` / `generate` against this schema as the
// source of truth — it would drop the generated column and both indexes,
// silently breaking hybrid search (ts_rank would run against a plain text
// column and the vector scan would lose its index).

// pgvector custom type — 1536 dims (OpenAI text-embedding-3-small)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/[\[\]]/g, "")
      .split(",")
      .map(Number);
  },
});

// ─── Documents ────────────────────────────────────────────────────────────────
// One row per uploaded PDF. Stores raw text + Claude-extracted structured fields.
export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  rawText: text("raw_text").notNull(),

  // Structured extraction result (typed via Zod in the service layer)
  extracted: jsonb("extracted"),

  // Field-completeness score computed at ingest (0–1) — see src/services/scoring.ts.
  // NOT a correctness measure; measured precision lives in eval_runs / scripts/eval.ts.
  // (Column name kept as extraction_confidence to avoid a migration rename.)
  extractionConfidence: real("extraction_confidence"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Chunks ───────────────────────────────────────────────────────────────────
// Document split into overlapping chunks, each with a pgvector embedding.
// Hybrid search: cosine similarity (pgvector) + keyword match (pg full-text).
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),

    // tsvector for BM25-style full-text search (handles exact legal terminology)
    searchVector: text("search_vector"), // stored as tsvector via raw SQL migration

    // Dense embedding for semantic similarity
    embedding: vector("embedding"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // Only the FK btree index is declared here. The two performance-critical
    // indexes are in drizzle/0000_init.sql (see the note at the top of this file):
    //   - chunks_embedding_idx: HNSW on embedding, vector_cosine_ops
    //   - chunks_search_vector_idx: GIN on the generated search_vector tsvector
    documentIdIdx: index("chunks_document_id_idx").on(t.documentId),
  })
);

// ─── Eval runs ────────────────────────────────────────────────────────────────
// Tracks precision / recall per field across eval runs.
// Run `npm run eval` to populate.
export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    expected: text("expected").notNull(),
    actual: text("actual"),
    match: text("match").notNull(), // 'exact' | 'partial' | 'miss'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    documentIdIdx: index("eval_runs_document_id_idx").on(t.documentId),
  })
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type EvalRun = typeof evalRuns.$inferSelect;
