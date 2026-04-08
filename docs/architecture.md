# Architecture

## Agent Pipeline

```
User message
      │
      ▼
┌─────────────────────────────────────────────┐
│   Orchestrator                              │
│   (Claude Sonnet 4.6)                       │
│                                             │
│   Intent: health_question                   │
│          | news_request                     │
│          | events_request                   │
│          | general_chat                     │
└─────────────────────────────────────────────┘
        │
        ├─────────────────────┬──────────────────────┐
        ▼                     ▼                      ▼
┌──────────────┐    ┌──────────────────┐   ┌──────────────────┐
│  RAG Agent   │    │   News Agent     │   │  Events Agent    │
│              │    │                  │   │                  │
│ - Embed query│    │ - Call NewsAPI   │   │ - Call SerpAPI   │
│ - pgvector   │    │ - Filter ±7 days │   │   Google Events  │
│   similarity │    │ - Return up to   │   │ - Filter by      │
│   search     │    │   5 headlines    │   │   user location  │
│ - Return top │    │                  │   │ - Return up to   │
│   k chunks   │    │                  │   │   5 events       │
└──────────────┘    └──────────────────┘   └──────────────────┘
        │                     │                      │
        └─────────────────────┴──────────────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │   Response Agent     │
                  │   (Claude Sonnet 4.6)│
                  │                      │
                  │   Synthesises context│
                  │   into a grounded,   │
                  │   cited response.    │
                  │   Enforces safety    │
                  │   guardrails.        │
                  └──────────────────────┘
                              │
                              ▼
                        User response
                        (with sources)
```

## Intent Classification

| Intent | Trigger examples | Routed to |
|---|---|---|
| `health_question` | "What is HPV?", "When should I get screened?" | RAG Agent → Response Agent |
| `news_request` | "Any news about cervical cancer?", "Latest women's health headlines" | News Agent → Response Agent |
| `events_request` | "Women's health events near me?", "Cervical screening events in Sydney" | Events Agent → Response Agent |
| `general_chat` | "Hello", "Thank you", "Can you explain that again?" | Response Agent directly |

## Agent Responsibilities

**Orchestrator** (`lib/agents/orchestrator.ts`)
- Classifies intent from user message
- Routes to the appropriate specialist agent(s)
- Manages conversation history window
- Injects user locale from `profiles.locale` for language preference

**RAG Agent** (`lib/agents/rag-agent.ts`)
- Embeds the user query via OpenAI `text-embedding-3-small`
- Runs pgvector cosine similarity search against `knowledge_chunks`
- Returns top-k chunks with source metadata
- Similarity threshold: > 0.75; fallback message: "I don't have reliable information on this"

**News Agent** (`lib/agents/news-agent.ts`)
- Calls `fetchHealthNews` tool → proxies NewsAPI
- Fixed query terms appended: `cervical health OR HPV OR "women's health"`
- Filters to last 7 days; returns up to 5 headlines (title, source, URL, published_at)
- Falls back gracefully if NewsAPI is unavailable

**Events Agent** (`lib/agents/events-agent.ts`)
- Calls `findHealthEvents` tool → proxies SerpAPI Google Events
- Requires user location; uses `profiles.locale` as a hint if set
- Default keywords appended: `women's health OR cervical screening OR HPV`
- Returns up to 5 upcoming events (name, date, location, URL)
- Falls back gracefully if no events found

**Response Agent** (`lib/agents/response-agent.ts`)
- Receives retrieved context (chunks, headlines, or events)
- Generates a grounded response citing sources
- Enforces safety guardrails: no diagnosis, always recommend professional consultation

## Clinic Finder — Standalone (No Agent Involvement)

The `/clinics` page is **completely separate** from the agent pipeline. It calls `/api/clinics/search` directly.

```
/clinics page
      │  user submits location + keyword
      ▼
/api/clinics/search (Next.js route handler)
      │  server-side fetch — NEXT_PUBLIC_GOOGLE_MAPS_KEY never exposed to browser
      ▼
Google Places Text Search API
      │
      ▼
Clinic list → rendered on Google Map + list view
```

No Supabase `clinics` table is used in v1. Results are returned directly from Google Places.

## RAG Pipeline

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
  Embedding — OpenAI text-embedding-3-small (1536 dimensions)
        │
        ▼
  Upsert into knowledge_chunks (pgvector column)
```

Triggered via `POST /api/embeddings/ingest` (admin only).

Source documents include: Cancer Council Australia cervical screening guidelines, WHO HPV/vaccine factsheets, HealthDirect.gov.au articles, custom authored content.

### Retrieval at Query Time

```typescript
// 1. Embed query
const queryEmbedding = await embedText(userMessage);

// 2. pgvector cosine similarity search
const { data } = await supabase.rpc("match_knowledge_chunks", {
  query_embedding: queryEmbedding,
  match_threshold: 0.75,
  match_count: 5,
});

// 3. Inject into Response Agent context
const context = data.map((c) => `[${c.source}]: ${c.content}`).join("\n\n");
```

## Tool Call Chain

| Tool | File | Function | External API | API Route |
|---|---|---|---|---|
| `health-kb` | `lib/tools/health-kb.ts` | `retrieveHealthContext` | Supabase pgvector (internal) | — |
| `news` | `lib/tools/news.ts` | `fetchHealthNews` | NewsAPI `/v2/everything` | `/api/news` |
| `events` | `lib/tools/events.ts` | `findHealthEvents` | SerpAPI Google Events | `/api/events` |

All external API keys are injected server-side in the route handler. The tool functions call `/api/<service>` — they never hold API keys directly.

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| MCP transport | Tools inlined into Next.js API routes | Simpler for v1; extract to HTTP SSE MCP server in v2 if multi-consumer access needed |
| Embedding model | OpenAI `text-embedding-3-small` | Cost/quality balance; revisit Voyage AI `voyage-3` as alternative |
| Vector index | HNSW (`m=16`, `ef_construction=64`) | Preferred over ivfflat at low-medium volume (<100k chunks); no minimum row count |
| Clinic data | Google Places API (no local cache) | Avoids stale data; add cache layer in v2 if API costs become a concern |
| AI responses | English only in v1 | i18n UI strings included via `next-intl`; AI response i18n deferred to v2 |
