-- Epic 3 · #24 · Bump chat_sessions.updated_at when a message is added to it.
--
-- The chat sidebar orders sessions by updated_at desc. Without this trigger
-- updated_at is frozen at session-creation time, so an active conversation
-- doesn't bubble to the top of the list.
--
-- No SECURITY DEFINER: RLS already permits the session owner to UPDATE their
-- own row, so the trigger UPDATE inherits that scope safely. SECURITY DEFINER
-- would over-grant — any caller with INSERT permission on chat_messages
-- could bump arbitrary chat_sessions.

create or replace function public.bump_chat_session_updated_at()
returns trigger as $$
begin
  update public.chat_sessions
  set updated_at = now()
  where id = new.session_id;
  return new;
end;
$$ language plpgsql
   set search_path = '';

create trigger chat_messages_bump_session_updated_at
  after insert on public.chat_messages
  for each row execute function public.bump_chat_session_updated_at();
