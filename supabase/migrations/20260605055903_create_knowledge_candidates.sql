-- Knowledge discovery pipeline — staging tables.
-- knowledge_candidates: discovered content awaiting admin review before it is
--   chunked + embedded into knowledge_chunks (via ingestDocument on approval).
-- discovery_runs: one row per pipeline run, for admin visibility + debugging.
-- Both are admin-only; the discovery route (Plan 2) writes via the service-role
-- client, which bypasses RLS.

create table public.knowledge_candidates (
  id              uuid primary key default gen_random_uuid(),
  source_url      text not null,
  title           text,
  raw_content     text not null,                 -- extracted main article text
  summary         text,                          -- LLM-generated
  authority_score real,                          -- 0–1
  relevance_score real,                          -- 0–1
  domain_tags     text[] not null default '{}',  -- e.g. {hpv-vaccine}
  gap_refs        jsonb  not null default '[]'::jsonb,  -- analytics_events ids addressed
  content_hash    text not null unique,          -- dedup guard
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.profiles(id) on delete set null
);

create index on public.knowledge_candidates (status, created_at desc);

create table public.discovery_runs (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running'
                      check (status in ('running', 'completed', 'failed')),
  gaps_processed    int not null default 0,
  candidates_staged int not null default 0,
  trigger           text not null check (trigger in ('cron', 'manual'))
);

create index on public.discovery_runs (started_at desc);

-- ───── RLS: admin-only on both tables ─────────────────────────────────────
-- Depends on public.is_admin() (SECURITY DEFINER) defined in the pgvector
-- migration. Same pattern as abuse_events / knowledge_chunks admin policies.
alter table public.knowledge_candidates enable row level security;
alter table public.discovery_runs       enable row level security;

create policy "knowledge_candidates: admin all"
  on public.knowledge_candidates for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "discovery_runs: admin all"
  on public.discovery_runs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
