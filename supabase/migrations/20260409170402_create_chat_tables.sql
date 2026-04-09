-- Trigger function to auto-update updated_at on chat_sessions
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
   set search_path = '';

-- Chat sessions - one per conversation thread
create table public.chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

create index on public.chat_sessions (user_id);

-- Chat messages - each message within a session
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  metadata   jsonb,             -- agent trace, sources used, tool calls
  created_at timestamptz default now()
);

create index on public.chat_messages (session_id);

-- RLS: chat_sessions
alter table public.chat_sessions enable row level security;

create policy "chat_sessions: owner or admin"
  on public.chat_sessions for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- RLS: chat_messages (access via session ownership)
alter table public.chat_messages enable row level security;

create policy "chat_messages: owner or admin"
  on public.chat_messages for all
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  );
