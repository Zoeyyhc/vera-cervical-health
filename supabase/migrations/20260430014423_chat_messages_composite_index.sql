-- Epic 3 · #17 · Composite index for ordered chat-message reads.
--
-- The single-column index on chat_messages(session_id) added in
-- 20260409170402_create_chat_tables.sql is sufficient for filtering by session,
-- but EPIC3-05 ("load the last N messages for a session") sorts by created_at
-- as well. Postgres can use the existing index plus a sort, but a composite
-- index lets it skip the sort entirely on the hot path.
--
-- The single-column index is intentionally left in place — Postgres can pick
-- whichever leading-column subset it prefers and the storage cost is small at
-- v1 scale.

create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);
