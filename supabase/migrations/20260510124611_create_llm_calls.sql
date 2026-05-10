-- LLM audit log — one row per Anthropic API call.
-- Wrapper inserts via service-role client (bypasses RLS).
-- Reads are admin-only; no policy lets users see this data.

create table public.llm_calls (
  id                 uuid primary key default gen_random_uuid(),

  -- Both nullable so non-chat (e.g. admin ingest) calls log too. No
  -- chat_message_id FK because the assistant chat_messages row is inserted
  -- AFTER streaming ends, racing the audit write. Correlate via
  -- (session_id, started_at) instead.
  user_id            uuid references public.profiles(id)      on delete set null,
  session_id         uuid references public.chat_sessions(id) on delete set null,

  agent              text not null,        -- 'classifier' | 'response' | future agents
  prompt_id          text not null,        -- 'classifier' | 'response.default' | 'response.override'
  prompt_version     text not null,        -- 'v1' — manual bump on intentional change
  prompt_hash        text not null,        -- sha256 hex of the base system prompt text

  model              text not null,        -- 'claude-sonnet-4-6'
  temperature        numeric(4,3),         -- nullable: SDK default when caller omits
  max_tokens         integer not null,
  streamed           boolean not null default false,

  input_tokens       integer not null,
  output_tokens      integer not null,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(10,6),

  started_at         timestamptz not null,
  duration_ms        integer not null,
  status             text not null check (status in ('ok','error')),
  error_message      text,

  created_at         timestamptz not null default now()
);

create index on public.llm_calls (user_id, created_at desc);
create index on public.llm_calls (agent,   created_at desc);
create index on public.llm_calls (session_id);
create index on public.llm_calls (created_at desc);

alter table public.llm_calls enable row level security;

create policy llm_calls_admin_select on public.llm_calls
  for select using (public.is_admin());
