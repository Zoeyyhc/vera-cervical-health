-- Analytics events - platform usage tracking
create table public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  event_type text not null,   -- page_view | chat_query | clinic_search | etc.
  payload    jsonb,
  created_at timestamptz default now()
);

-- Index for common admin queries: all events by a specific user
create index on public.analytics_events (user_id);

-- Index for common admin queries: events by type over time
create index on public.analytics_events (event_type, created_at desc);

-- RLS: analytics_events
alter table public.analytics_events enable row level security;

-- Authenticated users can log their own events
create policy "analytics_events: users can insert own"
  on public.analytics_events for insert
  with check (auth.uid() = user_id);

-- Only admins can read events (for the analytics dashboard)
create policy "analytics_events: admins can read all"
  on public.analytics_events for select
  using (public.is_admin());
