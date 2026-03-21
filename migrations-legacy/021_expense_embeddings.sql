-- RAG: pgvector extension and expense embeddings for semantic search
-- Run via: psql $DATABASE_URL -f migrations/021_expense_embeddings.sql
--
-- Note: CREATE EXTENSION vector requires superuser on some Postgres instances.
-- Neon, Supabase, and most managed Postgres support it. If it fails, ask your
-- provider to enable the pgvector extension.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW index for cosine similarity (best for semantic search)
CREATE INDEX IF NOT EXISTS expenses_embedding_idx ON expenses
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
