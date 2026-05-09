-- Adds soft-delete and starring to chat sessions.
-- starred_at: NULL = not starred; non-NULL = starred at that time. Sorting by
-- starred_at desc surfaces recently starred items first.
-- deleted_at: NULL = active; non-NULL = soft-deleted. v1 keeps soft-deleted
-- rows indefinitely (no Trash UI yet); the field is the foundation for that
-- and lets the 6-second Undo toast on the client restore by clearing it.

alter table public.chat_sessions
  add column starred_at timestamptz,
  add column deleted_at timestamptz;

-- Hot path: list a user's active sessions, starred-first.
create index chat_sessions_user_starred_idx
  on public.chat_sessions (user_id, starred_at desc nulls last)
  where deleted_at is null;

-- Cold path: look up a soft-deleted session by user (Undo flow / future trash).
create index chat_sessions_user_deleted_idx
  on public.chat_sessions (user_id, deleted_at)
  where deleted_at is not null;
