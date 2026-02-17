-- Initialize pgvector schema for LibreChat RAG API (langchain_community PGVector)
-- Run this against your pgvector PostgreSQL database ONCE before using RAG embeddings.
--
-- Connection: Use your Railway pgvector DATABASE_URL or:
--   postgres://postgres:PASSWORD@pgvector.railway.internal:5432/railway
-- For external: Use DATABASE_PUBLIC_URL from Railway pgvector service variables

-- 1. Enable pgvector extension (required)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create langchain_pg_collection (stores collection metadata)
CREATE TABLE IF NOT EXISTS langchain_pg_collection (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(256) NOT NULL,
    cmetadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_langchain_pg_collection_name 
ON langchain_pg_collection (name);

-- 3. Create langchain_pg_embedding (stores embeddings; vector size 1536 = text-embedding-3-small)
CREATE TABLE IF NOT EXISTS langchain_pg_embedding (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES langchain_pg_collection(uuid) ON DELETE CASCADE,
    embedding vector(1536) NOT NULL,
    document TEXT,
    cmetadata JSONB,
    custom_id VARCHAR(256)
);

CREATE INDEX IF NOT EXISTS idx_langchain_pg_embedding_collection_id 
ON langchain_pg_embedding (collection_id);

CREATE INDEX IF NOT EXISTS idx_langchain_pg_embedding_custom_id 
ON langchain_pg_embedding (custom_id);

-- Optional: IVFFlat index for faster similarity search (run after you have data)
-- CREATE INDEX ON langchain_pg_embedding USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
