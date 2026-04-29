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
