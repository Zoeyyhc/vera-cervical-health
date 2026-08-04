# API Routes

All route handlers are in `app/api/` using Next.js App Router conventions (`route.ts`). Return `Response.json()` — not `NextResponse`. Validate all inputs with Zod.

## Route Reference

| Route | Method | Auth Required | Description |
|---|---|---|---|
| `/api/chat` | POST | `user` | Main agent orchestration entry point. Streams token-by-token. |
| `/api/chat/[sessionId]` | GET | `user` | Fetch message history for a session. |
| `/api/geocode/reverse` | POST | `user` | Reverse-geocodes a lat/lng to suburb/state/postcode via Google Maps. |
| `/api/clinics/search` | GET | None (public) | Proxy to Google Places API (New) — Text Search endpoint. |
| `/api/news` | GET | None (public) | Proxy to NewsAPI. Keeps `NEWS_API_KEY` server-side. |
| `/api/events` | GET | None (public) | Proxy to SerpAPI Google Events. Keeps `SERPAPI_KEY` server-side. |
| `/api/mcp` | POST/GET/DELETE | `MCP_AUTH_TOKEN` bearer (server-to-server) | Private, read-only Victoria Trusted Health MCP endpoint. Never callable from a browser. |
| `/api/embeddings/ingest` | POST | `admin` | Ingest a knowledge document into pgvector. |
| `/api/analytics/event` | POST | `user` | Log an analytics event. |
| `/api/admin/users` | GET | `admin` | List all users. |
| `/api/admin/users` | PATCH | `admin` | Update user role or details. |
| `/api/webhooks/supabase` | POST | Webhook secret | Supabase webhook receiver. |

## Route Details

### `POST /api/chat`

**Auth:** `user` role required  
**Body:**

```ts
{
  message: string;
  sessionId?: string;
  // Reverse-geocoded browser position. The state is the load-bearing field:
  // a suburb name alone confirms nothing for the 457 shared with another state.
  geo?: { suburb?: string; state?: string; postcode?: string };
  // The client tried geolocation and got nothing — denied, timed out,
  // unsupported, or the reverse geocode failed.
  geolocationAttempted?: boolean;
  // Resend of a turn the server asked the client to complete with a location.
  // The user message is already persisted, so it is not written again.
  continuation?: boolean;
}
```

**Response:** Streamed NDJSON of `start` / `text` / `sources` / `location_request` / `done` / `error` events.  
**Notes:** Entry point for the full agent pipeline. The orchestrator classifies intent and dispatches:

- `health_question` → RAG agent → response agent (RAG chunks injected as grounding context)
- `news_request` → news agent → response agent (news headlines injected as grounding context). Static fallback text when NewsAPI returns nothing.
- `services_request` → Victoria MCP → response agent, once a location is confirmed
- `events_request` → verified Victorian events (MCP), then the general events agent, once a location is confirmed
- `general_chat` → response agent directly

Both location-scoped paths confirm a location **before** calling any tool. A
shared suburb name is asked about rather than guessed, and an out-of-Victoria
request gets the scope explained rather than an empty result. See
`docs/trusted-health-mcp.md`.

`location_request` is emitted instead of text when a "near me" turn needs a
position: nothing is said and nothing is persisted, the client raises the browser
permission prompt, and the same turn is resent as a `continuation`.

An assistant turn that asks for a location records a `pendingAction` in
`chat_messages.metadata`, so a bare `3151` reply resumes the original request.

### `POST /api/geocode/reverse`

**Auth:** `user` role required  
**Body:** `{ lat: number, lng: number }`  
**Response:** `{ suburb: string | null, state: string | null, postcode: string | null }`  
**Notes:** Called by the chat client after a "near me" question, never on page
load. `state` is the short form (`"VIC"`), because that is what the location
resolver matches on and what makes a shared suburb name usable.

Fields are read independently across all returned results: the most specific
result is often a street address carrying no postcode while the suburb-level one
behind it does. Missing fields come back `null` rather than being filled with a
region or a state — a state is not a suburb, and substituting one is how a weak
location used to reach the tools.

Every failure (upstream error, non-2xx, `ZERO_RESULTS`) returns
`{ suburb: null, state: null, postcode: null }` with status 200, so the client
asks the user to type a suburb instead of reporting an empty search.

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
**Proxied to:** SerpAPI Google Events (`SERPAPI_KEY` injected server-side), `gl=au&hl=en`. The
upstream query is sent as-is (`q` or a plain `"events"` fallback) — no forced health-domain
boolean clause, since Google Events returns nothing for those. Health relevance is filtered
locally, against title/description/address, after the upstream call.  
**Response:** `{ events: HealthEvent[] }` on a match, `{ events: [], error: "no_results" }` when
the search completed but nothing relevant came back, `{ events: [], error: "upstream_unavailable" }`
when the upstream call itself failed (network error, non-2xx, malformed JSON). `HealthEvent` is
`{ name, date, location, url, description }`.

### `POST /api/mcp`

**Auth:** `Authorization: Bearer ${MCP_AUTH_TOKEN}` — service-to-service only.
**Transport:** MCP Streamable HTTP (`WebStandardStreamableHTTPServerTransport`), stateless,
`enableJsonResponse: true`. A fresh server + transport per request.
**Tools (all read-only):** `search_victoria_health_info`, `find_victoria_screening_services`,
`list_victoria_verified_events`. Contracts in `docs/trusted-health-mcp-v0.1.md` §5.
**Caller:** `lib/mcp/client.ts` only, reached via `lib/agents/victoria-agent.ts`. 5-second
timeout; any failure resolves to `null` so the chat route degrades rather than erroring.

**Not browser-callable, by two independent guards** (`lib/mcp/auth.ts`):

1. `MCP_AUTH_TOKEN` is a non-public env var, so it is never bundled into client JS.
2. Any request carrying `Sec-Fetch-Site`, `Sec-Fetch-Dest`, or `Origin` — headers a browser
   attaches to every request and cannot suppress — is rejected regardless of its token.

   Deliberately **not** `Sec-Fetch-Mode`: Node's own undici HTTP stack sends `Sec-Fetch-Mode: cors`,
   so gating on it rejected 100% of our own agent-layer calls. `lib/mcp/auth.transport.test.ts`
   pins these header facts against the real MCP transport.

There is deliberately **no** session-cookie path: being signed in, even as an admin, grants nothing here.
Every rejection returns the same opaque `401 {"error":"unauthorized"}`.

**Audit:** every call writes one `mcp_call_logs` row — tool name, sanitised input summary, result
ids, source ids, outcome, latency, correlation id. Never the query text, the raw location, a user
id, or a session id. Calls rejected by the tool schema are logged as `invalid_input` by the
route's preflight (`lib/mcp/preflight.ts`).

**Local check:**

```bash
TOKEN=$(grep MCP_AUTH_TOKEN .env.local | cut -d= -f2)
curl -s -X POST http://localhost:3000/api/mcp \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### `/admin/trusted-health` (page, not an API route)

**Auth:** `admin` role (server-side gate via `requireAdmin`, enforced in `app/(app)/admin/layout.tsx`).
**Purpose:** the governance surface for the MCP. Approve/revoke registry **sources**; add, approve,
and reject **events**; approve/retire **directory links**. Events are created as `pending` and are
invisible to the MCP until approved; expired events are shown here with an `expired` badge and are
never returned by the MCP. Server actions live in `lib/mcp/admin-actions.ts`.

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

### `/admin/knowledge/documents` (page, not an API route)

**Auth:** `admin` role (server-side gate via `requireAdmin`, enforced in `app/(app)/admin/layout.tsx`).
**Purpose:** Manage the documents in `knowledge_chunks` directly. **Lists** every document (one row per `source`, via the `list_knowledge_documents()` RPC). **Add** — server action `addDocument` chunks + embeds pasted text via `ingestDocument` (`source` = the typed name, `metadata.origin = "manual"`). **Delete** — server action `deleteDocument` hard-deletes all chunks for a `source`. Covers seed, discovery-approved, and manually-added documents alike.

### `/admin/knowledge/gaps` (page, not an API route)

**Auth:** `admin` role (server-side gate via `requireAdmin`, enforced in `app/(app)/admin/layout.tsx`).
**Purpose:** View recent RAG coverage gaps and seed one by hand. **Lists** `rag_gap` events from the last `GAP_LOOKBACK_DAYS` (via `listRecentGaps`), each flagged `addressed` when its id appears in a `knowledge_candidates.gap_refs` array (the same test `mineGaps` uses), with a User/Manual source badge. **Add a gap** — server action `addManualGap` inserts a `rag_gap` event (`payload={ question, top_score: 0, source: "manual" }`, attributed to the admin) via the RLS-bound client, so it flows through `mineGaps` unchanged; `source` is display-only. **Run discovery now** — reuses the same `RunDiscoveryButton` as the review queue.

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
