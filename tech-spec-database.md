# Tech Spec — Database Schema & RAG Pipeline

**Version:** 0.1 | **Author:** Zoey Cao | **Last Updated:** 2026-04-07 | **Status:** Draft

← [Back to index](tech-spec.md)

---

## 4. Database Schema

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
embedding   vector(1536)   -- pgvector column
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

#### pgvector index

```sql
create index on knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Note: hnsw is preferred over ivfflat at low-medium document volumes (< ~100k chunks).
-- ivfflat requires lists × 10 rows to be effective; hnsw has no minimum row count.
-- Revisit and tune ef_construction when knowledge base exceeds 50k chunks.
```

---

## 7. RAG Pipeline

### Knowledge Base Ingestion

```
Source documents (PDF, MD, web)
        │
        ▼
  Text extraction
        │
        ▼
  Chunking (512 tokens, 64-token overlap)
        │
        ▼
  Embedding (OpenAI text-embedding-3-small)
        │
        ▼
  Upsert into knowledge_chunks (pgvector)
```

Source documents will include:

- Cancer Council Australia cervical screening guidelines
- WHO HPV vaccine / screening factsheets
- HealthDirect.gov.au articles
- Custom authored content

### Retrieval at Query Time

```typescript
// 1. Embed query
const queryEmbedding = await embedText(userMessage);

// 2. pgvector similarity search
const { data } = await supabase.rpc("match_knowledge_chunks", {
  query_embedding: queryEmbedding,
  match_threshold: 0.75,
  match_count: 5,
});

// 3. Inject into agent context
const context = data.map((c) => `[${c.source}]: ${c.content}`).join("\n\n");
```
