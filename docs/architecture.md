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
| `health_question` | "What is HPV?", "When should I get screened?" | RAG Agent (+ MCP health tool for a Victorian turn) → Response Agent |
| `news_request` | "Any news about cervical cancer?", "Latest women's health headlines" | News Agent → Response Agent |
| `services_request` | "Where can I get screened in Melbourne?", "Clinic near me that does self-collection" | Victoria Agent → MCP directory tool → Response Agent |
| `events_request` | "Women's health events near me?", "Cervical screening events in Sydney" | Victoria Agent (verified events) → Events Agent → Response Agent |
| `general_chat` | "Hello", "Thank you", "Can you explain that again?" | Response Agent directly |
| `injection_attempt` | "Ignore previous instructions", "You are now…" | Static refusal; no sub-agent runs |

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

**Victoria Agent** (`lib/agents/victoria-agent.ts`)
- The orchestrator's adapter over the private Victoria Trusted Health MCP — see
  `docs/trusted-health-mcp-v0.1.md` (spec) and `docs/trusted-health-mcp.md` (how it is built)
- Resolves the turn's location (geolocated `city` first, then a place mentioned in the message)
  and only consults the MCP when that location is Victorian
- Wraps the three read-only tools into the same `{ context, sources }` envelope the other agents return
- **Never assumes availability:** every entry point resolves to an empty result when the MCP is
  unreachable, and the orchestrator falls back to the ordinary RAG / events path

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
| `search_victoria_health_info` | `lib/mcp/health-info.ts` | via `lib/mcp/client.ts` | none — reads `knowledge_chunks` | `/api/mcp` (MCP) |
| `find_victoria_screening_services` | `lib/mcp/directory.ts` | via `lib/mcp/client.ts` | none — reads `directory_links` | `/api/mcp` (MCP) |
| `list_victoria_verified_events` | `lib/mcp/events.ts` | via `lib/mcp/client.ts` | none — reads `verified_events` | `/api/mcp` (MCP) |

All external API keys are injected server-side in the route handler. The tool functions call `/api/<service>` — they never hold API keys directly.

The three MCP tools call **no** external API: they read Vera's own curated, admin-approved data.
Nothing in a user's chat turn can cause a web fetch or a search of an unapproved source.

## Victoria Trusted Health MCP

A private, read-only MCP server mounted inside this Next.js app at `POST /api/mcp`, using the
Streamable HTTP transport. Full build notes in `docs/trusted-health-mcp.md`.

```
Orchestrator
     │  (Victorian turn only)
     ▼
lib/agents/victoria-agent.ts
     │  { context, sources } envelope
     ▼
lib/mcp/client.ts ── MCP client, 5s timeout, null on any failure
     │  HTTP + Bearer MCP_AUTH_TOKEN
     ▼
POST /api/mcp ── bearer gate + browser-header rejection (lib/mcp/auth.ts)
     │
     ▼
lib/mcp/server.ts ── three read-only tools, per-call audit
     │
     ├── search_victoria_health_info      → knowledge_chunks, filtered to allowlisted hosts
     ├── find_victoria_screening_services → directory_links (deep links only, no provider records)
     └── list_victoria_verified_events    → verified_events (approved + unexpired only)
                                    │
                                    ▼
                            trusted_sources ── the allowlist every result traces back to
```

Load-bearing properties, each covered by tests:

- **Read-only.** No tool has a write path. `lib/mcp/no-write.test.ts` scans the module tree and
  fails if a mutation appears. The one insert in `lib/mcp/` is the audit row, unreachable from tool input.
- **Private.** The bearer token is a non-public env var, so it is never bundled into client JS.
  Requests carrying browser fetch-metadata headers are rejected outright. There is no cookie path.
- **Allowlist-only.** A chunk, link, or event is returned only when it traces back to an `approved`
  `trusted_sources` row. Revoking a source hides everything downstream of it immediately.
- **Victoria-only.** An unrecognised location resolves to *not* Victoria, so the failure mode is a
  clear non-result rather than a nationwide fallback.
- **Degrades silently.** MCP unavailable → the chat route runs exactly as it did before.

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| MCP transport | Streamable HTTP MCP server inside this Next.js app (`/api/mcp`), private to the server-side agent layer | Supersedes the original "tools inlined into API routes" decision for the Victoria Trusted Health capability. Governance (source allowlist, approval workflow, call audit) needed a real boundary; a separate deployable was rejected for v0.1 as premature. The News/Events/RAG tools remain inlined. |
| Embedding model | OpenAI `text-embedding-3-small` | Cost/quality balance; revisit Voyage AI `voyage-3` as alternative |
| Vector index | HNSW (`m=16`, `ef_construction=64`) | Preferred over ivfflat at low-medium volume (<100k chunks); no minimum row count |
| Clinic data | Google Places API (no local cache) | Avoids stale data; add cache layer in v2 if API costs become a concern |
| AI responses | English only in v1 | i18n UI strings included via `next-intl`; AI response i18n deferred to v2 |
