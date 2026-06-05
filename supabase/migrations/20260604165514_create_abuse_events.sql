-- Abuse events — one row per detected abuse attempt (e.g. prompt injection).
-- Wrapper inserts via service-role client (bypasses RLS).
-- Reads are admin-only; no policy lets users see this data.

create table public.abuse_events (
  id              uuid primary key default gen_random_uuid(),

  -- Both nullable so the row survives user/session deletion for trend analysis.
  user_id         uuid references public.profiles(id)      on delete set null,
  session_id      uuid references public.chat_sessions(id) on delete set null,

  type            text not null,        -- 'injection_attempt'
  message_excerpt text,                 -- truncated user text, low-PII

  created_at      timestamptz not null default now()
);

create index on public.abuse_events (user_id,    created_at desc);
create index on public.abuse_events (type,       created_at desc);
create index on public.abuse_events (created_at desc);

alter table public.abuse_events enable row level security;

create policy abuse_events_admin_select on public.abuse_events
  for select using (public.is_admin());
