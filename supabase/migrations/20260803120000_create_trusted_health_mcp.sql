-- Victoria Trusted Health MCP v0.1 — governance schema.
-- Spec: docs/trusted-health-mcp-v0.1.md
--
-- Four new tables, all admin-only by RLS. The MCP server reads them through the
-- service-role client; nothing here is reachable from the browser.
--
--   trusted_sources   allowlist registry. NOTHING is returned by the MCP unless
--                     it traces back to an `approved` row here.
--   directory_links   approved deep links into first-party Victorian service
--                     directories. Deliberately NOT a clinic table — no provider
--                     records are copied, cached, or re-published (see the v1
--                     constraint in CLAUDE.md).
--   verified_events   manually curated events. Visible only after admin approval
--                     and only until they expire.
--   mcp_call_logs     one row per MCP tool call, for audit. Carries no chat text,
--                     no user id, and no health information.

-- ───── trusted_sources ────────────────────────────────────────────────────────

create table public.trusted_sources (
  id                uuid primary key default gen_random_uuid(),

  organisation      text not null,
  -- Registrable host, lowercased, no scheme/port/path (e.g. 'health.vic.gov.au').
  -- Subdomain matching is applied in lib/mcp/sources.ts, not here.
  canonical_host    text not null unique,

  source_class      text not null check (source_class in (
                      'commonwealth_health_authority',
                      'state_health_authority',
                      'clinical_nonprofit',
                      'directory_provider',
                      'event_organiser'
                    )),
  jurisdiction      text not null check (jurisdiction in ('AU', 'VIC')),

  -- What this source may be used for. A source can serve more than one purpose
  -- (Cancer Council Victoria is education + directory + events).
  permitted_content text[] not null default '{}'
                      check (permitted_content <@ array['health_content', 'directory', 'events']::text[]),

  terms_url         text,
  notes             text,

  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'revoked')),
  approved_by       uuid references public.profiles(id) on delete set null,
  approved_at       timestamptz,
  -- Last governance review + when the next one is due (6-month cadence, spec §6).
  reviewed_at       timestamptz,
  next_review_at    date,

  created_at        timestamptz not null default now()
);

create index on public.trusted_sources (status, canonical_host);
create index on public.trusted_sources (next_review_at) where status = 'approved';

-- ───── directory_links ────────────────────────────────────────────────────────

create table public.directory_links (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references public.trusted_sources(id) on delete restrict,

  directory_name      text not null,
  -- First-party search URL. May contain the literal token `{location}`, which
  -- lib/mcp/directory.ts URL-encodes and substitutes. Templates without the
  -- token are returned verbatim — that is the safe default until an admin has
  -- confirmed a directory's real query-string format.
  search_url_template text not null,

  coverage            text not null default 'VIC' check (coverage = 'VIC'),
  -- Free-form capability tags matched against the tool's `preferences` input,
  -- e.g. {self_collection, accessibility, interpreter}.
  supports            text[] not null default '{}',

  -- Surfaced verbatim to the user. v0.1 never asserts provider availability.
  confirmation_notice text not null,

  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'retired')),
  reviewed_at         timestamptz,
  -- 3-month cadence for directory links (spec §6).
  next_review_at      date,
  sort_order          int not null default 100,

  created_at          timestamptz not null default now()
);

create index on public.directory_links (status, sort_order);

-- ───── verified_events ────────────────────────────────────────────────────────

create table public.verified_events (
  id               uuid primary key default gen_random_uuid(),
  -- The organiser. `on delete restrict` so revoking a source can never orphan a
  -- published event.
  source_id        uuid not null references public.trusted_sources(id) on delete restrict,

  name             text not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  location_label   text not null,
  suburb           text,
  postcode         text,
  format           text not null check (format in ('in_person', 'online', 'hybrid')),
  topic            text check (topic in ('cervical_screening', 'hpv_vaccination', 'womens_health')),

  registration_url text not null,
  source_url       text not null,

  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  created_by       uuid references public.profiles(id) on delete set null,
  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,

  created_at       timestamptz not null default now(),

  constraint verified_events_ends_after_starts
    check (ends_at is null or ends_at >= starts_at)
);

-- Expiry is derived, never hand-maintained: an event expires at its end time, or
-- at its start time when no end time was supplied (spec §5.3). `coalesce` is
-- immutable, so this can be a stored generated column.
alter table public.verified_events
  add column expires_at timestamptz
    generated always as (coalesce(ends_at, starts_at)) stored;

create index on public.verified_events (status, expires_at, starts_at);

-- ───── mcp_call_logs ──────────────────────────────────────────────────────────

create table public.mcp_call_logs (
  id             uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  tool_name      text not null,

  -- Sanitised summary only — bounded scalars such as topic, hasLocation, and the
  -- resolved Victorian scope. Never the raw query, chat text, or health data.
  input_summary  jsonb not null default '{}'::jsonb,
  result_ids     text[] not null default '{}',
  source_ids     uuid[] not null default '{}',

  outcome        text not null check (outcome in (
                   'ok', 'no_result', 'out_of_scope', 'invalid_input', 'error'
                 )),
  latency_ms     int not null,

  created_at     timestamptz not null default now()
);

create index on public.mcp_call_logs (tool_name, created_at desc);
create index on public.mcp_call_logs (correlation_id);

-- ───── knowledge_candidates: source-governance field ──────────────────────────
-- Per spec §6, v0.1 adds governance to the EXISTING knowledge review workflow
-- rather than standing up a second clinical-content pipeline. Nullable: seed and
-- manually-added documents predate the registry, and the MCP falls back to host
-- matching regardless.

alter table public.knowledge_candidates
  add column trusted_source_id uuid references public.trusted_sources(id) on delete set null;

-- ───── RLS: admin-only on all four ────────────────────────────────────────────
-- Same pattern as knowledge_candidates / abuse_events. public.is_admin() is
-- SECURITY DEFINER, defined in the pgvector migration. The MCP server reads
-- through the service-role client, which bypasses RLS.

alter table public.trusted_sources enable row level security;
alter table public.directory_links enable row level security;
alter table public.verified_events enable row level security;
alter table public.mcp_call_logs   enable row level security;

create policy "trusted_sources: admin all"
  on public.trusted_sources for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "directory_links: admin all"
  on public.directory_links for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "verified_events: admin all"
  on public.verified_events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Audit log: admins read, nobody writes through a user session.
create policy "mcp_call_logs: admin select"
  on public.mcp_call_logs for select
  to authenticated
  using (public.is_admin());

-- ───── v0.1 registry bootstrap ────────────────────────────────────────────────
-- These are the sources approved in docs/trusted-health-mcp-v0.1.md §4. The spec
-- sign-off is the approval record, so approved_by is null; the next scheduled
-- review is six months out per the §6 cadence. Any further source must be added
-- and approved through /admin/trusted-health.

insert into public.trusted_sources
  (organisation, canonical_host, source_class, jurisdiction, permitted_content, terms_url, status, approved_at, reviewed_at, next_review_at, notes)
values
  ('Department of Health, Disability and Ageing — National Cervical Screening Program',
   'health.gov.au', 'commonwealth_health_authority', 'AU',
   '{health_content,events}', 'https://www.health.gov.au/copyright',
   'approved', now(), now(), (now() + interval '6 months')::date,
   'National program facts and patient resources.'),

  ('Department of Health, Disability and Ageing — Cancer Screening',
   'cancerscreening.gov.au', 'commonwealth_health_authority', 'AU',
   '{health_content}', 'https://www.health.gov.au/copyright',
   'approved', now(), now(), (now() + interval '6 months')::date,
   'Legacy NCSP host; still serves program pages.'),

  ('Victorian Department of Health',
   'health.vic.gov.au', 'state_health_authority', 'VIC',
   '{health_content,events}', null,
   'approved', now(), now(), (now() + interval '6 months')::date,
   'Victorian policy and public-health information.'),

  ('Better Health Channel (Victorian Department of Health)',
   'betterhealth.vic.gov.au', 'state_health_authority', 'VIC',
   '{health_content}', null,
   'approved', now(), now(), (now() + interval '6 months')::date,
   'Victorian consumer health education.'),

  ('Cancer Council Australia',
   'cancer.org.au', 'clinical_nonprofit', 'AU',
   '{health_content}', null,
   'approved', now(), now(), (now() + interval '6 months')::date,
   'Consumer education and campaigns.'),

  ('Cancer Council Victoria',
   'cancervic.org.au', 'clinical_nonprofit', 'VIC',
   '{health_content,directory,events}', null,
   'approved', now(), now(), (now() + interval '6 months')::date,
   'Consumer education, cervical screening directory, and event organiser.'),

  ('healthdirect Australia',
   'healthdirect.gov.au', 'clinical_nonprofit', 'AU',
   '{health_content,directory}', null,
   'approved', now(), now(), (now() + interval '6 months')::date,
   'Consumer education and the national Service Finder directory.');

-- Directory links. v0.1 seeds first-party landing URLs that are known-good and
-- carry no `{location}` token: substituting an unverified query-string format
-- would send users to a broken search. An admin adds `{location}` to a template
-- once they have confirmed that directory's real query format.

insert into public.directory_links
  (source_id, directory_name, search_url_template, supports, confirmation_notice, status, reviewed_at, next_review_at, sort_order)
select
  s.id,
  'healthdirect Service Finder',
  'https://www.healthdirect.gov.au/australian-health-services',
  '{accessibility,interpreter}',
  'This is a directory listing, not a booking. Availability, cost, and whether a service offers cervical screening change often — please confirm directly with the provider before attending.',
  'approved', now(), (now() + interval '3 months')::date, 10
from public.trusted_sources s
where s.canonical_host = 'healthdirect.gov.au';

insert into public.directory_links
  (source_id, directory_name, search_url_template, supports, confirmation_notice, status, reviewed_at, next_review_at, sort_order)
select
  s.id,
  'Cancer Council Victoria — Cervical Screening',
  'https://www.cancervic.org.au/cancer-information/screening/cervical-screening',
  '{self_collection}',
  'This is a directory listing, not a booking. Availability, cost, and whether a service offers self-collection change often — please confirm directly with the provider before attending.',
  'approved', now(), (now() + interval '3 months')::date, 20
from public.trusted_sources s
where s.canonical_host = 'cancervic.org.au';
