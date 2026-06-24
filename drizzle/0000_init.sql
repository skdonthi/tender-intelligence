-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- documents table
CREATE TABLE IF NOT EXISTS documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename              TEXT NOT NULL,
  raw_text              TEXT NOT NULL,
  extracted             JSONB,
  extraction_confidence REAL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- chunks table with vector embedding column
CREATE TABLE IF NOT EXISTS chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  -- 'simple' (no language stemming): the corpus is mixed German/EU and the
  -- keyword arm exists for exact legal codes, CPV codes and reference numbers.
  -- 'english' would mis-stem German text; a per-language router is a follow-up.
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for approximate nearest-neighbour search on embeddings.
-- Chosen over IVFFlat: IVFFlat must be built AFTER data exists (it trains its
-- lists on the current rows) — building it on an empty table gives poor recall
-- until rebuilt. HNSW needs no training, so it's correct from an empty start and
-- has a better recall/latency tradeoff. Build is slower; fine at demo scale.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS chunks_search_vector_idx
  ON chunks USING GIN (search_vector);

-- eval_runs table
CREATE TABLE IF NOT EXISTS eval_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field        TEXT NOT NULL,
  expected     TEXT NOT NULL,
  actual       TEXT,
  match        TEXT NOT NULL CHECK (match IN ('exact', 'partial', 'miss')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
