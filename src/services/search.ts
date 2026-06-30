import OpenAI from "openai";
import { CohereClient } from "cohere-ai";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { getAnthropic } from "./llm";

// Lazy clients — construct on first use, not at import. A missing key then
// fails at the point of use with a clear message, instead of crashing the whole
// server module (and every route) the moment it's imported.
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set — required for embeddings");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

let _cohere: CohereClient | null = null;
function cohere(): CohereClient {
  if (!_cohere) _cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
  return _cohere;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

// ── Retrieval pipeline constants ───────────────────────────────────────────────
//
// Two-stage retrieval: wide hybrid search → cross-encoder rerank → top-K to LLM
//
// CANDIDATE_LIMIT: how many chunks hybrid search retrieves before reranking.
// Cast a wide net — the reranker is cheap and fast; missing a good chunk at
// this stage can't be recovered. 20 is a safe default for typical doc sizes.
//
// RERANK_TOP_K: how many chunks survive reranking and get passed to Claude.
// 5 keeps the context window tight and forces the reranker to do real work.
// Increase to 8 for very long-answer queries.
const CANDIDATE_LIMIT = 20;
const RERANK_TOP_K = 5;

// Cap per-request inputs — OpenAI's embeddings endpoint limits array size (and
// total tokens). Long PDFs can exceed that, so chunk the call.
const EMBED_BATCH_SIZE = 256;

/**
 * Embed texts in order. Batches to stay under the endpoint's input-array limit,
 * and sorts each response by `index` rather than trusting array position, so the
 * returned vectors line up 1:1 with the input chunks.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const response = await openai().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMS,
    });
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    out.push(...ordered.map((d) => d.embedding));
  }
  return out;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  /** Cosine similarity score from pgvector (0–1) */
  semanticScore: number;
  /** BM25-style ts_rank from PostgreSQL full-text search */
  keywordRank: number | null;
  /** Weighted combination of semantic + keyword scores */
  hybridScore: number;
  /**
   * Cross-encoder relevance score from Cohere rerank (0–1).
   * null if reranking was skipped (e.g. COHERE_API_KEY not set).
   *
   * This is the score that actually determines final chunk ordering.
   * Unlike hybridScore (query vs. chunk independently), the reranker
   * sees query + chunk *together* — much richer relevance signal.
   */
  rerankScore: number | null;
}

// ── Stage 1: Hybrid search ─────────────────────────────────────────────────────

/**
 * Retrieves candidate chunks using pgvector cosine similarity + PostgreSQL
 * full-text search (BM25-style ts_rank), combined as a weighted sum.
 *
 * Why hybrid?
 * - Semantic (embeddings): finds conceptually similar text despite different
 *   wording. "closing date" ≈ "submission deadline".
 * - Keyword (ts_rank): exact match for legal codes, reference numbers, and
 *   regulated terminology that embeddings tend to blur together.
 *
 * This stage is deliberately over-inclusive (CANDIDATE_LIMIT=20).
 * The reranker in stage 2 handles precision.
 */
export async function hybridSearch(
  query: string,
  documentId?: string,
  limit = CANDIDATE_LIMIT
): Promise<SearchResult[]> {
  const [queryEmbedding] = await embedTexts([query]);
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  const documentFilter = documentId
    ? sql`AND c.document_id = ${documentId}::uuid`
    : sql``;

  const results = await db.execute(sql`
    SELECT
      c.id            AS chunk_id,
      c.document_id,
      c.content,
      1 - (c.embedding <=> ${embeddingLiteral}::vector)   AS semantic_score,
      ts_rank(
        c.search_vector,
        plainto_tsquery('simple', ${query})
      )                                                     AS keyword_rank,
      (
        0.6 * (1 - (c.embedding <=> ${embeddingLiteral}::vector)) +
        0.4 * ts_rank(
          c.search_vector,
          plainto_tsquery('simple', ${query})
        )
      )                                                     AS hybrid_score
    FROM chunks c
    WHERE c.embedding IS NOT NULL
    ${documentFilter}
    ORDER BY hybrid_score DESC
    LIMIT ${limit}
  `);

  return (results.rows as Array<Record<string, unknown>>).map((row) => ({
    chunkId: row.chunk_id as string,
    documentId: row.document_id as string,
    content: row.content as string,
    semanticScore: Number(row.semantic_score),
    keywordRank: row.keyword_rank != null ? Number(row.keyword_rank) : null,
    hybridScore: Number(row.hybrid_score),
    rerankScore: null,
  }));
}

// ── Stage 2: Cross-encoder rerank ──────────────────────────────────────────────

/**
 * Reranks hybrid search candidates using Cohere's cross-encoder model.
 *
 * WHY RERANKING MATTERS for procurement accuracy:
 *
 * Hybrid search scores each chunk *independently* against the query using
 * bag-of-words (BM25) and vector similarity. It has no understanding of the
 * relationship between the query and the chunk as a whole.
 *
 * A cross-encoder reads the query and chunk *together* as a single input and
 * outputs a relevance score. This lets it catch things like:
 *
 *   Query: "What is the submission deadline?"
 *   Chunk A (hybrid rank #1): mentions "deadline" 4 times in a table of contents
 *   Chunk B (hybrid rank #4): "Tenders must be submitted no later than 15 Sept 2024"
 *
 * The reranker will correctly promote Chunk B — the embedding/BM25 scores
 * couldn't see that Chunk A was just an index entry.
 *
 * For Patterno's 95%+ precision target, this is one of the highest-leverage
 * improvements in the retrieval pipeline.
 *
 * Falls back gracefully if COHERE_API_KEY is not set — returns hybrid results
 * trimmed to RERANK_TOP_K. This keeps the demo runnable without all API keys.
 */
export async function rerank(
  query: string,
  candidates: SearchResult[],
  topK = RERANK_TOP_K
): Promise<SearchResult[]> {
  if (!process.env.COHERE_API_KEY) {
    console.warn("[rerank] COHERE_API_KEY not set — skipping rerank, using hybrid scores");
    return candidates.slice(0, topK);
  }

  if (candidates.length === 0) return [];

  const response = await cohere().rerank({
    model: "rerank-v3.5",
    query,
    documents: candidates.map((c) => c.content),
    topN: topK,
    returnDocuments: false, // we already have the content
  });

  return response.results.map((result) => ({
    ...candidates[result.index],
    rerankScore: result.relevanceScore,
  }));
}

// ── Full pipeline: hybrid → rerank ─────────────────────────────────────────────

/**
 * Two-stage retrieval: hybrid search (recall) + rerank (precision).
 *
 * Use this everywhere instead of calling hybridSearch directly.
 * The separation of stages makes it easy to A/B test in the eval loop:
 * compare askDocument() with and without reranking to quantify the gain.
 */
export async function retrieve(
  query: string,
  documentId?: string
): Promise<SearchResult[]> {
  const candidates = await hybridSearch(query, documentId, CANDIDATE_LIMIT);
  return rerank(query, candidates, RERANK_TOP_K);
}

// ── RAG Q&A ────────────────────────────────────────────────────────────────────

/**
 * Answer a natural language question about a document using RAG.
 *
 * Pipeline:
 *  1. retrieve() — hybrid search + rerank → top-5 chunks
 *  2. Claude — grounded answer from chunks only, with source citations
 *
 * The sources array in the response includes all pipeline scores
 * (semanticScore, hybridScore, rerankScore) — useful for debugging
 * retrieval quality and for the eval loop.
 */
export async function askDocument(
  question: string,
  documentId: string
): Promise<{ answer: string; sources: SearchResult[] }> {
  const sources = await retrieve(question, documentId);

  if (sources.length === 0) {
    return {
      answer: "No relevant sections found in this document for your question.",
      sources: [],
    };
  }

  const context = sources
    .map((s, i) => `[Source ${i + 1}]\n${s.content}`)
    .join("\n\n---\n\n");

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a procurement analyst. Answer questions about procurement documents accurately and concisely.
Only use information from the provided document excerpts.
If the answer is not in the excerpts, say so clearly — do not guess.
Cite sources by referring to [Source N].`,
    messages: [
      {
        role: "user",
        content: `Document excerpts:\n\n${context}\n\n---\n\nQuestion: ${question}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const answer = textBlock?.type === "text" ? textBlock.text : "No answer generated.";

  return { answer, sources };
}
