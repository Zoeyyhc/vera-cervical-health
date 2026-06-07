-- Read-only aggregate over knowledge_chunks for the admin document manager.
-- A "document" = all chunks sharing one `source`. Grouping happens in the DB so
-- the 1536-dim embedding column is never pulled into the app layer.
--
-- SECURITY INVOKER (default): runs as the caller, so the knowledge_chunks SELECT
-- RLS policy applies. Any authenticated user may already SELECT chunks (needed
-- for RAG), and source names are not sensitive; the admin-only surface is
-- enforced at the page/action layer. Same exposure model as match_knowledge_chunks.
create or replace function public.list_knowledge_documents()
returns table (
  source      text,
  title       text,
  chunk_count bigint,
  created_at  timestamptz
)
language sql
stable
as $$
  select
    source,
    min(metadata->>'title') as title,
    count(*)                as chunk_count,
    min(created_at)         as created_at
  from public.knowledge_chunks
  group by source
  order by min(created_at) desc;
$$;
