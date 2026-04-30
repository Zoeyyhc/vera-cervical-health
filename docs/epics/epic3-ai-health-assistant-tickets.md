# Epic 3 — AI Health Assistant — Ticket Breakdown

> Derived from `docs/sprints.md` §Epic 3. Sprint 2 covers all `M` items (basic chat, single-agent, no RAG). Sprint 4 covers all `S` items (multi-agent orchestrator + citations + intent routing). `C` items (e.g. Chinese AI responses) are out of scope for this breakdown.

Each ticket is scoped to a single PR. Dependencies reference other tickets by ID. Acceptance criteria (AC) are the minimum bar for "done".

---

## Sprint 2 — Basic chat (single-agent, no RAG)

### EPIC3-01 — Chat DB schema migration
**MoSCoW:** M (implicit — required by persistence)
**Depends on:** Epic 2 / profiles + RLS

Create `chat_sessions` and `chat_messages` tables with full RLS.

**AC:**
- New migration `supabase/migrations/NNNN_chat_tables.sql`
- `chat_sessions`: `id uuid pk`, `user_id uuid fk auth.users on delete cascade`, `title text null`, `created_at`, `updated_at`
- `chat_messages`: `id uuid pk`, `session_id uuid fk chat_sessions on delete cascade`, `role text check in ('user','assistant')`, `content text`, `metadata jsonb null`, `created_at`
- Indexes on `chat_messages(session_id)` and `chat_messages(session_id, created_at)`
- RLS enabled on both tables; policies allow the owner (`auth.uid() = user_id`) to select/insert/update/delete their own rows
- `supabase db reset` succeeds; `types/supabase.ts` regenerates cleanly
- Vitest integration test: a second user cannot read the first user's session (verifies RLS)

**Technical Notes:**
- The `'system'` role is intentionally excluded from the `role` enum: system prompts are loaded fresh per request from `lib/ai/system-prompt.ts` (EPIC3-02) and are not persisted. Adding it later is a one-line `ALTER TABLE` if the architecture changes.
- `metadata jsonb` is reserved for agent traces, retrieved sources, and tool-call records — used by EPIC3-12 source citations.

---

### EPIC3-02 — Anthropic client + safety system prompt
**MoSCoW:** M (covers "Claude Sonnet 4.6 integration" + "Safety guardrails")
**Depends on:** —

Install the SDK, wire the env var, add a typed client factory, and draft the safety-first system prompt used by every chat call.

**AC:**
- `@anthropic-ai/sdk` added (version pinned) in `package.json`
- `ANTHROPIC_API_KEY` documented in `docs/env-vars.md` and `.env.example`
- `lib/ai/anthropic.ts` exports a typed client factory; model string `claude-sonnet-4-6` hard-coded (not read from env)
- `lib/ai/system-prompt.ts` exports `DEFAULT_SYSTEM_PROMPT` including clauses:
  - Never offer a diagnosis
  - Always recommend professional medical consultation for symptom-level questions
  - Be empathetic, non-judgemental, plain language
- Vitest unit test snapshots the prompt and asserts the guardrail clauses are present by regex — prevents accidental deletion during refactors

---

### EPIC3-03 — `/api/chat` single-turn endpoint (non-streaming)
**MoSCoW:** M
**Depends on:** EPIC3-02

POST handler with Zod input validation that calls Claude once and returns the full response as JSON. Persistence and streaming land in later tickets.

**AC:**
- `app/api/chat/route.ts` POST handler (App Router)
- Zod schema validates `{ message: string (1..4000) }`
- Returns 401 when no Supabase user
- Calls Claude with `DEFAULT_SYSTEM_PROMPT` + single user message
- Returns `Response.json({ reply: string })`
- 500 on upstream error; error logged server-side without leaking the API key
- Vitest route-level test mocks the Anthropic client and asserts the request body shape + auth guard

---

### EPIC3-04 — Conversation history persistence
**MoSCoW:** M
**Depends on:** EPIC3-01, EPIC3-03

Every `/api/chat` POST creates (or reuses) a `chat_sessions` row and writes both the user and assistant `chat_messages`.

**AC:**
- Zod schema extended: `{ message: string, sessionId?: string }`
- If no `sessionId`, create a new session with `title = null`
- Write user message *before* calling Claude
- Write assistant message *after* receiving the reply
- Response shape: `Response.json({ sessionId, reply })`
- RLS verified: a second user cannot read another user's session via the Supabase browser client
- Vitest test against local Supabase: after POST, one session + two messages exist for the caller

---

### EPIC3-05 — Multi-turn context window management
**MoSCoW:** M
**Depends on:** EPIC3-04

Load the last N messages for the session and send them as Claude message history. Trim when context exceeds a configurable budget.

**AC:**
- `lib/ai/context-window.ts` exports `loadRecentMessages(sessionId, budget)` and `trimToBudget(messages, budget)`
- Budget expressed as an approximate character count for v1 (swap to token count later if needed)
- Oldest messages dropped first; system prompt always kept
- `/api/chat` uses the helper before calling Claude
- Vitest unit tests cover: empty history, under-budget, exact budget, over-budget trimming, role ordering preserved

---

### EPIC3-06 — Streaming responses (token-by-token)
**MoSCoW:** M
**Depends on:** EPIC3-03, EPIC3-04, EPIC3-05

Convert `/api/chat` to stream tokens via `ReadableStream`. Persist the full assistant message at stream end.

**AC:**
- `/api/chat` uses `anthropic.messages.stream(...)`
- Returns `text/event-stream` with `data: <json chunk>\n\n` framing (document the shape in `docs/api-routes.md`)
- On stream completion, the full assistant content is written to `chat_messages`
- On mid-stream error, partial content is persisted with a clear error marker appended, and the stream closes cleanly (no unhandled promise rejections)
- Manual curl confirms tokens arriving incrementally; browser fetch + `ReadableStream` confirmed in the UI ticket

---

### EPIC3-07 — Chat UI page — message list + input box
**MoSCoW:** M
**Depends on:** EPIC3-06

`/chat` route with a message list and composer that consumes the streaming endpoint.

**AC:**
- `app/(app)/chat/page.tsx` (Server Component shell) + `chat-client.tsx` (client)
- Uses shadcn primitives; cream background (`bg-cream`), no pure white
- Enter submits; Shift+Enter inserts a newline
- Streaming tokens render progressively into the latest assistant bubble
- Loading state shown until the first token arrives
- Error toast on fetch/stream failure
- Middleware already gates `/chat/*` (verify; add to `PROTECTED_PATHS` if missing)
- Biome passes; no new warnings
- Manual verification: can start a new session and send a message; reply streams in

---

## Sprint 4 — Full Epic 3 (multi-agent orchestrator, S-priority)

### EPIC3-08 — Chat session list + switching
**MoSCoW:** S
**Depends on:** EPIC3-04

Sidebar listing the user's sessions ordered by `updated_at desc`; click to load, "new chat" button to start a fresh session.

**AC:**
- `app/(app)/chat/page.tsx` lays out a sidebar + chat pane
- Server-side fetches sessions for the current user (RLS enforces ownership)
- Session row shows: title (fallback = first user message truncated to 60 chars) + relative updated_at
- Selecting a session loads its messages into the chat pane
- "New chat" creates a fresh session on next send (no empty row)
- `trigger update_updated_at on chat_sessions` (via migration) or updated client-side on every message — pick one, document in `docs/database.md`
- Vitest unit test for the title-derivation helper

---

### EPIC3-09 — Response agent extraction
**MoSCoW:** S (prerequisite for orchestration)
**Depends on:** EPIC3-06

Move Claude-invocation logic out of `/api/chat` into `lib/agents/response-agent.ts` as a pure function. No behavioral change.

**AC:**
- `lib/agents/response-agent.ts` exports `runResponseAgent(ctx)` returning an async iterable of text chunks
- Accepts `{ userMessage, history, ragContext?, systemPrompt? }`; no DB or HTTP concerns inside the agent
- `/api/chat` wires it up; streaming behavior from EPIC3-06 is unchanged
- Vitest unit test mocks the Anthropic client and asserts each yielded chunk matches the mock stream

---

### EPIC3-10 — Intent classification (orchestrator-lite)
**MoSCoW:** S
**Depends on:** EPIC3-09

Lightweight `lib/agents/orchestrator.ts` classifies user input into one of: `health_question | news_request | events_request | general_chat`.

**AC:**
- Implementation: a dedicated non-streaming Claude call with a short classifier prompt (temperature 0). Rule-based fallback (keyword match) when the classifier errors
- Returns `{ intent: Intent, confidence?: number }`
- Unit tests cover: clear health question, "latest news on HPV vaccine", "events near me", small talk
- Orchestrator remains a pure function — no DB or HTTP calls
- Integrated into `/api/chat` as a pre-step that logs the intent but still routes *everything* to the response agent (real dispatch lands in EPIC3-11)

---

### EPIC3-11 — Multi-agent orchestrator wiring (RAG + Response)
**MoSCoW:** S
**Depends on:** EPIC3-10, Epic 4 (RAG agent must exist)

Orchestrator dispatches `health_question` → RAG agent → response agent; other intents → response agent directly.

**AC:**
- Dispatch table in `lib/agents/orchestrator.ts`
- `health_question` branch: calls `runRagAgent` (Epic 4) and injects the returned chunks as `ragContext` into the response agent
- `general_chat` branch: skips RAG entirely
- `news_request` / `events_request` branches return a stub "news/events support is coming soon" reply until EPIC3-13 lands
- Integration tests cover each branch with mocked sub-agents
- `docs/architecture.md` diagram updated if the dispatch shape changes

---

### EPIC3-12 — Source citation display
**MoSCoW:** S
**Depends on:** EPIC3-11

Store and render citations returned from the RAG agent in chat messages.

**AC:**
- Migration extends `chat_messages` with `sources jsonb null`
- Response agent output shape extended: `{ text, sources: Array<{ id, title, url?, chunkId }> }`
- `/api/chat` persists `sources` alongside the assistant message
- Chat UI renders numbered chips under assistant bubbles; clicking opens the source URL in a new tab
- No citations shown for `general_chat` replies (empty array)
- Vitest unit test for the chip renderer

---

### EPIC3-13 — `news_request` / `events_request` intent routing
**MoSCoW:** S
**Depends on:** EPIC3-11, Epic 9 (news + events agents)

Replace the stub branches from EPIC3-11 with real dispatch to the news and events agents.

**AC:**
- `news_request` → `runNewsAgent` → response agent (news items injected as context)
- `events_request` → `runEventsAgent` → response agent (event items injected as context)
- Graceful fallback message when the external API is unavailable (see Epic 9 fallback requirement)
- Integration tests cover both branches with mocked upstream responses
- `docs/api-routes.md` updated if orchestrator-visible behavior changes

---

## Dependency graph (shorthand)

```
EPIC3-01 ─┐
          ├─► EPIC3-04 ─► EPIC3-05 ─► EPIC3-06 ─► EPIC3-07
EPIC3-02 ─► EPIC3-03 ─┘                    │
                                           ├─► EPIC3-09 ─► EPIC3-10 ─► EPIC3-11 ─► EPIC3-12
                                           │                                 │
                                           │                                 └─► EPIC3-13
                                           └─► EPIC3-08
```

## Coverage check vs `docs/sprints.md` §Epic 3

| Feature (from sprints.md) | Ticket(s) |
|---|---|
| `/api/chat` basic endpoint (single-turn) | EPIC3-03 |
| Claude Sonnet 4.6 integration | EPIC3-02 |
| Conversation history persistence | EPIC3-01, EPIC3-04 |
| Streaming responses (token-by-token) | EPIC3-06 |
| Safety guardrails (no diagnosis, recommend consultation) | EPIC3-02 |
| Multi-turn context window management | EPIC3-05 |
| Chat UI page (message list + input box) | EPIC3-07 |
| Chat session list + switching | EPIC3-08 |
| Source citation display | EPIC3-12 |
| Intent classification (health / general) | EPIC3-10 |
| Multi-agent orchestrator (RAG + Response Agent) | EPIC3-09, EPIC3-11 |
| `news_request` / `events_request` intent routing | EPIC3-13 |
