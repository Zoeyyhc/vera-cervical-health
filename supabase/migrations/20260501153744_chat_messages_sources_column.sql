-- Epic 3 · #28 · Add a sources column to chat_messages for citation storage.
--
-- jsonb (not a typed table) for v1 — flexible for the small structured Source[]
-- array, easy to write/read from the response agent + the chat client. The
-- column is nullable so legacy rows (general_chat replies, pre-#28 inserts)
-- stay null cleanly.

alter table public.chat_messages
  add column sources jsonb;
