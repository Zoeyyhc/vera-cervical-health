# Database

Supabase (PostgreSQL) with pgvector extension. All tables have Row Level Security (RLS) enabled.

## Schema

### `profiles`

```sql
id          uuid references auth.users primary key
email       text
role        text check (role in ('user', 'admin', 'guest')) default 'user'
full_name   text
avatar_url  text
locale      text default 'en'
created_at  timestamptz default now()
```

Auto-created on signup via Supabase Auth trigger.

### `chat_sessions`

```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references profiles(id)
title       text
created_at  timestamptz default now()
updated_at  timestamptz default now()
```

### `chat_messages`

```sql
id          uuid primary key default gen_random_uuid()
session_id  uuid references chat_sessions(id) on delete cascade
role        text check (role in ('user', 'assistant'))
content     text
metadata    jsonb          -- agent trace, sources used, tool calls
created_at  timestamptz default now()
```

**Indexes:** `(session_id)` for owner/session-scoped filtering; `(session_id, created_at)` for ordered-history reads (used by the chat context-window helper in EPIC3-05).

**Triggers:** `chat_messages_bump_session_updated_at` (AFTER INSERT) → bumps the parent `chat_sessions.updated_at` to `now()`. Keeps the chat sidebar's `ORDER BY updated_at DESC` reflecting actual conversation activity. Added in `20260501053623_chat_sessions_bump_updated_at.sql` (#24); not `SECURITY DEFINER` because RLS already permits the session owner to UPDATE their own row.

### `knowledge_chunks`

```sql
id          uuid primary key default gen_random_uuid()
source      text           -- document name / URL
content     text
embedding   vector(1536)   -- pgvector column (OpenAI text-embedding-3-small)
metadata    jsonb          -- page, section, tags
created_at  timestamptz default now()
```

### `analytics_events`

```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references profiles(id)
event_type  text           -- page_view | chat_query | clinic_search | etc.
payload     jsonb
created_at  timestamptz default now()
```

### Victoria Trusted Health MCP tables

Added by `20260803120000_create_trusted_health_mcp.sql`. All four are admin-only by RLS; the MCP
server reads them through the service-role client. Full context in `docs/trusted-health-mcp.md`.

| Table | Purpose | Notes |
|---|---|---|
| `trusted_sources` | The allowlist registry — nothing is returned by the MCP unless it traces back to an `approved` row here | `canonical_host` is unique; `permitted_content` is a `text[]` constrained to `{health_content, directory, events}` |
| `directory_links` | Approved deep links into first-party Victorian service directories | Deliberately **not** a clinic table — no provider records are stored. `search_url_template` may contain a `{location}` token |
| `verified_events` | Manually curated events, invisible until approved | `expires_at` is a **generated column**, `coalesce(ends_at, starts_at)`, so expiry can never drift from the entered dates |
| `mcp_call_logs` | One row per MCP tool call, for audit | Bounded scalars only — no chat text, no raw location, no `user_id`, no `session_id` |

`knowledge_candidates` also gains a nullable `trusted_source_id` FK: per spec §6, v0.1 adds
source governance to the existing knowledge review workflow rather than standing up a second
clinical-content pipeline.

## pgvector Index

```sql
create index on knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
```

HNSW is preferred over ivfflat at low-medium document volumes (<~100k chunks) because it has no minimum row count requirement. Revisit and tune `ef_construction` when the knowledge base exceeds 50k chunks.

## Supabase RPC — `match_knowledge_chunks`

```typescript
const { data } = await supabase.rpc("match_knowledge_chunks", {
  query_embedding: embedding,   // vector(1536)
  match_threshold: 0.75,        // cosine similarity minimum
  match_count: 5,               // top-k results
});
// Returns: Array<{ id, source, content, similarity_score, metadata }>
```

## RLS Roles & Permissions

Three roles, enforced at the database level via RLS policies in
`supabase/migrations/20260413143757_rls_policies.sql`:

| Role | Description | Key Permissions |
|---|---|---|
| `guest` | Unauthenticated visitor. JWT claim `role=anon` | No DB access — all policies require `to authenticated`. Guest UX (clinics finder, public learn pages) reads via server-side proxy routes. |
| `user` | Authenticated registered user (`profiles.role = 'user'`) | Read/update own profile. Full CRUD on own `chat_sessions` and `chat_messages`. Read `knowledge_chunks`. Insert own `analytics_events`. |
| `admin` | Platform administrator (`profiles.role = 'admin'`) | Everything `user` has, plus: read all profiles, read all chat sessions/messages, full CRUD on `knowledge_chunks`, read all `analytics_events`. Admins cannot mutate other users' chat rows via RLS — admin tooling that writes user data must use the service role key. |

### Per-table policy matrix

| Table | `anon` | `user` (self) | `user` (other) | `admin` |
|---|---|---|---|---|
| `profiles` | ✗ | SELECT, UPDATE | ✗ | SELECT all, UPDATE all |
| `chat_sessions` | ✗ | ALL (owned) | ✗ | SELECT all |
| `chat_messages` | ✗ | ALL (via owned session) | ✗ | SELECT all |
| `knowledge_chunks` | ✗ | SELECT (all rows) | — | SELECT, INSERT, UPDATE, DELETE |
| `analytics_events` | ✗ | INSERT (self-attributed) | ✗ | SELECT all |
| `trusted_sources` | ✗ | ✗ | ✗ | ALL |
| `directory_links` | ✗ | ✗ | ✗ | ALL |
| `verified_events` | ✗ | ✗ | ✗ | ALL |
| `mcp_call_logs` | ✗ | ✗ | ✗ | SELECT |

`profiles` has no INSERT/DELETE policy — rows are created by the
`handle_new_user` trigger on `auth.users` (SECURITY DEFINER, bypasses RLS)
and deleted by FK cascade when the auth user is removed.

`knowledge_chunks` has no `user_id` column — there is no per-user ownership.
All authenticated users share one read view; "self/other" distinction does not apply.

`analytics_events` INSERT uses a `WITH CHECK (auth.uid() = user_id)` constraint —
the DB rejects any insert where the submitted `user_id` does not match the caller's
UID. It is not a row-filter; it is a write guard. The table has no UPDATE/DELETE
policy — it is append-only for audit purposes. GDPR account-deletion nulls the
`user_id` via `ON DELETE SET NULL` rather than deleting the row.

**Never bypass RLS with the service role key in routes accessible to
non-admin users.** Admin routes check `profiles.role` server-side before
switching to the service role.

## Conventions

- All timestamps: `timestamptz` (timezone-aware)
- All primary keys: `uuid`
- Column naming: `snake_case`
- Never edit a migration file after it has been applied — create a new migration instead
- Migrations live in `supabase/migrations/` with sequential numbering
- Dev seed data lives in `supabase/seed.sql`

## Local Database Commands

```bash
supabase start                    # Start local Supabase (Docker)
supabase migration new <name>     # Create a new migration file
supabase db push                  # Apply pending migrations
supabase db reset                 # Reset DB and re-apply all migrations + seed.sql
```
