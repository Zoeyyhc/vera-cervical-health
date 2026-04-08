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

| Role | Description | Key Permissions |
|---|---|---|
| `guest` | Unauthenticated or unregistered user | Read health hub, 5-message chat limit, clinic finder |
| `user` | Registered, authenticated user | Full chat history, profile management, save clinics |
| `admin` | Platform administrator | User management, analytics, knowledge base uploads |

RLS policies are enforced at the database level on all tables. Never bypass RLS with the service role key in routes accessible to non-admin users.

Admin routes check the `profiles.role` column server-side on every request before allowing access.

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
