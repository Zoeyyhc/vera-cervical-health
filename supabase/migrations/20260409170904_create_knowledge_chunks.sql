-- Knowledge base chunks - stores document excerpts with embeddings
create table public.knowledge_chunks (
  id         uuid primary key default gen_random_uuid(),
  source     text,          -- document name or URL
  content    text not null,
  embedding  vector(1536) not null,  -- OpenAI text-embedding-3-small output
  metadata   jsonb,         -- page number, section, tags
  created_at timestamptz default now()
);

-- HNSW index for fast cosine similarity search.
-- m = 16 (max connections per layer), ef_construction = 64 (build-time search width).
-- Revisit ef_construction when knowledge base exceeds 50k chunks.
create index on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RPC used by the RAG agent at query time.
-- Returns chunks whose cosine similarity to query_embedding exceeds match_threshold,
-- ordered by closest match, limited to match_count results.
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
returns table (
  id             uuid,
  source         text,
  content        text,
  similarity_score float,
  metadata       jsonb
)
language sql stable
set search_path = public
as $$
  select
    id,
    source,
    content,
    1 - (embedding <=> query_embedding) as similarity_score,
    metadata
  from public.knowledge_chunks
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
