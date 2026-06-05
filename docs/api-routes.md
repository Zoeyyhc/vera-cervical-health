# API Routes

All route handlers are in `app/api/` using Next.js App Router conventions (`route.ts`). Return `Response.json()` — not `NextResponse`. Validate all inputs with Zod.

## Route Reference

| Route | Method | Auth Required | Description |
|---|---|---|---|
| `/api/chat` | POST | `user` | Main agent orchestration entry point. Streams token-by-token. |
| `/api/chat/[sessionId]` | GET | `user` | Fetch message history for a session. |
| `/api/clinics/search` | GET | None (public) | Proxy to Google Places API (New) — Text Search endpoint. |
| `/api/news` | GET | None (public) | Proxy to NewsAPI. Keeps `NEWS_API_KEY` server-side. |
| `/api/events` | GET | None (public) | Proxy to SerpAPI Google Events. Keeps `SERPAPI_KEY` server-side. |
| `/api/embeddings/ingest` | POST | `admin` | Ingest a knowledge document into pgvector. |
| `/api/analytics/event` | POST | `user` | Log an analytics event. |
| `/api/admin/users` | GET | `admin` | List all users. |
| `/api/admin/users` | PATCH | `admin` | Update user role or details. |
| `/api/webhooks/supabase` | POST | Webhook secret | Supabase webhook receiver. |

## Route Details

### `POST /api/chat`

**Auth:** `user` role required  
**Body:** `{ sessionId: string, message: string }`  
**Response:** Streamed NDJSON of `start` / `text` / `sources` / `done` / `error` events.  
**Notes:** Entry point for the full agent pipeline. The orchestrator classifies intent and dispatches:

- `health_question` → RAG agent → response agent (RAG chunks injected as grounding context)
- `news_request` → news agent → response agent (news headlines injected as grounding context). Static fallback text when NewsAPI returns nothing.
- `events_request` → events agent → response agent (events injected as grounding context). The route reads `profiles.locale` and threads it as a location hint. Static fallback text when (a) no location can be resolved, or (b) SerpAPI returns nothing.
- `general_chat` → response agent directly

### `GET /api/chat/[sessionId]`

**Auth:** `user` role (own sessions only — enforced by RLS)  
**Response:** `{ messages: ChatMessage[] }`

### `GET /api/clinics/search`

**Auth:** None  
**Query params:** `location: string`, `keyword?: string`  
**Proxied to:** Google Places API (New) — Text Search (`POST https://places.googleapis.com/v1/places:searchText`). `NEXT_PUBLIC_GOOGLE_MAPS_KEY` injected server-side via `X-Goog-Api-Key` header. Field mask set via `X-Goog-FieldMask` header.  
**Response:** `{ clinics: ClinicResult[] }`  
**Notes:** The `/clinics` UI page calls this directly — no agent involvement.

### `GET /api/news`

**Auth:** None  
**Query params:** `q?: string`, `max?: number` (default 5)  
**Proxied to:** NewsAPI `/v2/everything` (`NEWS_API_KEY` injected server-side)  
**Fixed query terms:** `cervical health OR HPV OR "women's health"`  
**Date range:** Last 7 days  
**Response:** `NewsArticle[]` — `{ title, source, url, published_at, description }`

### `GET /api/events`

**Auth:** None  
**Query params:** `location: string`, `q?: string`, `max?: number` (default 5)  
**Proxied to:** SerpAPI Google Events (`SERPAPI_KEY` injected server-side)  
**Default keywords appended:** `women's health cervical screening HPV`  
**Response:** `HealthEvent[]` — `{ name, date, location, url, description }`

### `POST /api/embeddings/ingest`

**Auth:** `admin` role required (server-side role check)  
**Body:** `{ content: string, source: string, metadata?: object }`  
**Process:** Extract text → chunk (512 tokens, 64-token overlap) → embed → upsert into `knowledge_chunks`  
**Response:** `{ chunks_created: number }`

### `GET /api/embeddings/discover`

**Auth:** Vercel Cron bearer (`Authorization: Bearer ${CRON_SECRET}` → trigger `cron`) **or** an `admin` session (→ trigger `manual`). 401 if neither; 403 for a non-admin session.  
**Schedule:** Vercel Cron every 3 days (`0 3 */3 * *`, UTC — see `vercel.json`).  
**Process:** Mine `rag_gap` events → search authoritative sources → score + extract + dedup → stage `pending` rows in `knowledge_candidates` for admin review. Bounded per run by `MAX_CANDIDATES_PER_RUN` and `RUN_BUDGET_MS`.  
**Response:** `{ gapsProcessed: number, candidatesStaged: number }`

### `/admin/knowledge` (page, not an API route)

**Auth:** `admin` role (server-side gate via `requireAdmin`, enforced in `app/(app)/admin/layout.tsx`).  
**Purpose:** Review queue for pending `knowledge_candidates`. **Approve** → server action `approveCandidate` ingests the content into `knowledge_chunks` via `ingestDocument` and marks the row `approved`. **Reject** → `rejectCandidate` marks it `rejected`. **Run discovery now** → calls `GET /api/embeddings/discover`.

### `POST /api/analytics/event`

**Auth:** `user` role  
**Body:** `{ event_type: string, payload?: object }`  
**Response:** `{ ok: true }`

### `GET /api/admin/users` / `PATCH /api/admin/users`

**Auth:** `admin` role required (server-side role check on every request)  
**GET Response:** `{ users: Profile[] }`  
**PATCH Body:** `{ userId: string, role?: string, ... }`

## Proxy Pattern

All external API keys are server-side only. Never expose them in the response body or as a client-accessible value.

```
Browser → /api/<service> → External API (key injected server-side only)
```

Services using this pattern: Google Places API (New), NewsAPI, SerpAPI.
