# Epic 3 — #28 Source Citation Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the full citation pipeline end-to-end — DB column, type, agent output, NDJSON wire event, route persistence, UI chip renderer — so that when #27 (orchestrator + RAG) lands, sources flow through automatically. For #28 itself, the route never passes `ragSources` to the agent so the chip-rendering path is dormant in production traffic; the infrastructure is verified at every layer via unit tests.

**Architecture:** Sources travel through five layers:
1. **DB**: new `chat_messages.sources jsonb null` column.
2. **Type**: `Source` exported from `types/agents.ts`.
3. **Agent**: `runResponseAgent` ctx gets optional `ragSources?: Source[]`; return type changes from `AsyncIterable<string>` to `AsyncIterable<AgentChunk>` where `AgentChunk = { type: "text", text } | { type: "sources", sources }`. Agent emits a single `sources` chunk after all text chunks when `ragSources` is non-empty.
4. **Wire format**: `ChatStreamEvent` gets a `sources` variant. Encoder/decoder round-trip it.
5. **Route**: handles agent's chunk discrimination, forwards `sources` events to client, persists `sources` jsonb on assistant insert. **The `[sessionId]` page** also selects `sources` from DB and threads it into `initialMessages`.
6. **UI**: `CitationChips` component renders 1-indexed clickable chips below assistant bubbles. Empty array / null = no chips. Missing URL = non-clickable `<span>` instead of `<a>`.

**Production data path is dormant.** Until #27 plugs the RAG agent into the orchestrator and threads `ragSources` into `runResponseAgent(ctx)`, the agent never emits a sources chunk and the route's sources-forwarding/persistence code is unreachable. Each layer is unit-tested in isolation; integration is exercised end-to-end when #27 ships.

**Tech Stack:** Supabase Postgres + RLS, TypeScript strict, `@anthropic-ai/sdk`, Vitest + `@testing-library/react`, Tailwind, Biome.

**Issue:** [#28](https://github.com/Zoeyyhc/cervix-assistant/issues/28)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-12
**Depends on (logically):** #25 (response agent), #27 (orchestrator) — but we're building the citation infrastructure ahead of #27 so #27 lands as a 1-line change.

---

## Pre-existing scaffolding

- ✅ `runResponseAgent` returns `AsyncIterable<string>` (#25) — extend to `AsyncIterable<AgentChunk>`
- ✅ `ChatStreamEvent` union with `start | text | done | error` (#22)
- ✅ `chat_messages` table (#17) — extend with `sources jsonb null`
- ✅ `[sessionId]/page.tsx` loads messages with `id, role, content` (#24) — extend to also select `sources`
- ✅ `chat-client.tsx` `ChatMessage` shape (#23) — extend with optional `sources`
- ✅ `MessageBubble` renders content (#23) — render `CitationChips` below

## Gaps vs #28 acceptance criteria

| AC | Status | Action |
|---|---|---|
| Migration extends `chat_messages` with `sources jsonb null` | ❌ | **Task 2** |
| Response agent output shape extended: `{ text, sources }` | ❌ | **Task 4** |
| `/api/chat` persists sources alongside the assistant message | ❌ | **Task 6** |
| Chat UI renders numbered chips under assistant bubbles | ❌ | **Tasks 8, 9, 10** |
| No citations shown for `general_chat` (empty array → no chips) | ❌ | Task 9 (chip renderer guards on length) |
| Vitest unit test for chip renderer (empty, single, multiple, missing URL) | ❌ | Task 9 |

## Decisions documented in this plan

- **`Source` type lives in `types/agents.ts`** (alongside `Intent`) — both are chat/AI domain types shared across agents, route, and UI.
- **`AgentChunk` lives in `lib/agents/response-agent.ts`** — coupled to the agent's output shape; not a global type.
- **Agent emits sources only when `ctx.ragSources` is non-empty.** Skip the chunk for empty arrays to avoid wire-event noise.
- **Wire format: add a `sources` variant** to `ChatStreamEvent`. Sequence on the wire when sources are present: `start → text+ → sources → done`.
- **Persistence**: route writes `sources: collectedSources` (a `Source[]`) or `sources: null` if no sources event arrived. The DB column is nullable.
- **CitationChips contract**: accepts `Source[] | null | undefined`. Returns `null` for empty/null/undefined. Renders `<a>` when `url` exists, `<span>` when not. 1-indexed numbering: `[1]`, `[2]`, …
- **No route-level test for the sources path.** With #28's route not passing `ragSources`, the path is unreachable; testing it would require a different mocking strategy (mocking the agent module) that conflicts with the existing test setup. Coverage at agent + wire-format + UI levels + integration via #27. Documented in the PR body.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/<new>_chat_messages_sources_column.sql` | **Create** | `ALTER TABLE chat_messages ADD COLUMN sources jsonb` |
| `types/agents.ts` | **Modify** | Add `Source` type |
| `lib/agents/response-agent.ts` | **Modify** | Add `AgentChunk` type. Extend `ctx` with `ragSources?`. Change return type. Emit sources chunk when `ragSources` non-empty. |
| `lib/agents/response-agent.test.ts` | **Modify** | Update existing tests to assert against `AgentChunk` shape; add 2 new tests (sources emitted when ragSources present, sources NOT emitted when empty/absent). |
| `lib/ai/streaming.ts` | **Modify** | Extend `ChatStreamEvent` union with `sources` variant. Encoder/decoder transparently handle it. |
| `lib/ai/streaming.test.ts` | **Modify** | Add 2 tests: encode/decode `sources` event round-trip. |
| `app/api/chat/route.ts` | **Modify** | Loop over `AgentChunk`s, forward `sources` events, persist `sources` column. |
| `tests/api/chat.test.ts` | **Modify** | Update `mockSupabaseChain` so message inserts accept `sources: null` (no behavior change for current tests). |
| `app/(app)/chat/[sessionId]/page.tsx` | **Modify** | Add `sources` to the message select, pass through `initialMessages`. |
| `app/(app)/chat/chat-client.tsx` | **Modify** | Extend `ChatMessage` with optional `sources`. Handle `sources` wire event. Render `<CitationChips>` in `MessageBubble`. |
| `app/(app)/chat/citation-chips.tsx` | **Create** | Pure presentational component. |
| `app/(app)/chat/citation-chips.test.tsx` | **Create** | RTL tests: empty, single source, multiple, missing URL. |
| `types/supabase.ts` | **Regenerate** | After the migration applies, regenerate so `chat_messages.sources` typed. |

**Files not touched:**
- `lib/agents/orchestrator.ts` — `classifyIntent` doesn't deal with sources.
- `app/(app)/chat/page.tsx`, `chat-sidebar-*` — sidebar/landing don't render citations.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/source-citation-display-28`.

- [ ] **Step B: Confirm dependent surfaces are on `main`**

```bash
ls lib/agents/response-agent.ts lib/ai/streaming.ts types/agents.ts && grep -n "AgentChunk\|sources" app/api/chat/route.ts || echo "(no sources support yet — expected)"
```
Expected: agent + streaming + types files exist; the route has no sources support yet.

- [ ] **Step C: Baseline tests + Biome + tsc + build**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && supabase status 2>&1 | head -3
```
Expected: 167/167 with real Supabase env (or 155/167 skipped without). Biome and tsc clean. Supabase running.

---

## Task 1: Decide and document layer contracts

**Files:** none — design notes that flow into Tasks 2–10.

These decisions are explicit so the executor doesn't have to make them mid-implementation:

1. **`Source` shape**: `{ id: string; title: string; url?: string; chunkId: string }`. `id` is the citation marker (caller-assigned); `chunkId` is a foreign key to `knowledge_chunks` (Epic 4 will populate). For #28, callers pass any non-empty string for `id` — uniqueness within a single response is the caller's responsibility (the orchestrator in #27 will assign `"1"`, `"2"`, …).
2. **`AgentChunk` shape**: discriminated union — `{ type: "text"; text }` or `{ type: "sources"; sources: Source[] }`. Always at most one `sources` chunk per agent invocation, emitted after all text chunks.
3. **Wire `sources` event** mirrors the agent chunk shape: `{ type: "sources"; sources: Source[] }`.
4. **Sequence invariant**: `start → text+ → (sources)? → done` on the wire. The chip renderer attaches sources to whichever assistant message is currently streaming (the latest one in state).
5. **DB column type**: `jsonb` (not `text` or a typed table). Cheap to query, type-flexible, perfect for a small structured array.

- [ ] **Step 1: Acknowledge the decisions** — no code yet.

---

## Task 2: DB migration — `sources jsonb null` on `chat_messages`

**Files:** `supabase/migrations/<new>_chat_messages_sources_column.sql`.

- [ ] **Step 1: Generate the migration filename**

```bash
supabase migration new chat_messages_sources_column
```

- [ ] **Step 2: Write the migration**

Replace the empty file's contents with:

```sql
-- Epic 3 · #28 · Add a sources column to chat_messages for citation storage.
--
-- jsonb (not a typed table) for v1 — flexible for the small structured Source[]
-- array, easy to write/read from the response agent + the chat client. The
-- column is nullable so legacy rows (general_chat replies, pre-#28 inserts)
-- stay null cleanly.

alter table public.chat_messages
  add column sources jsonb;
```

- [ ] **Step 3: Apply the migration**

```bash
supabase db reset 2>&1 | tail -8
```
Expected: clean reset, the new migration applies.

- [ ] **Step 4: Regenerate `types/supabase.ts`**

```bash
supabase gen types typescript --local > types/supabase.ts
```
Expected: file regenerates; `chat_messages` row type now includes `sources: Json | null`.

- [ ] **Step 5: Smoke-check the column is present**

```bash
eval "$(supabase status -o env)"
psql "$DB_URL" -c "\d public.chat_messages" 2>&1 | grep -A2 "sources"
```
Expected: `sources | jsonb | | |` row.

- [ ] **Step 6: Run the existing RLS suite**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test tests/db/rls-policies.test.ts 2>&1 | tail -5
```
Expected: 25/25 pass — no policy regression.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*chat_messages_sources_column.sql types/supabase.ts
git commit -m "feat(db): add sources jsonb column to chat_messages for citations"
```

---

## Task 3: `Source` type in `types/agents.ts`

**Files:** `types/agents.ts`.

- [ ] **Step 1: Append the type**

In `types/agents.ts`, after the `Intent` declaration:

```typescript
/**
 * One citation attached to an assistant message. Populated by the RAG agent
 * (Epic 4) and threaded through the response agent + wire format. The chip
 * renderer treats `url`-less sources as non-clickable.
 */
export type Source = {
  /** Caller-assigned marker (e.g., "1", "2"). Unique within a single response. */
  id: string;
  title: string;
  url?: string;
  /** Foreign key to `knowledge_chunks` (Epic 4). */
  chunkId: string;
};
```

- [ ] **Step 2: Biome**

```bash
pnpm biome check --write types/agents.ts
```

(No commit yet — type is consumed by Tasks 4+.)

---

## Task 4: Agent emits sources

**Files:** `lib/agents/response-agent.ts`, `lib/agents/response-agent.test.ts`.

- [ ] **Step 1: Update existing tests to assert against the new chunk shape**

Replace all assertions of the form `expect(chunks).toEqual(["Hello", " world"])` with the chunk-shape:

```typescript
expect(chunks).toEqual([
  { type: "text", text: "Hello" },
  { type: "text", text: " world" },
]);
```

The `collect` helper now returns `AgentChunk[]` (the array type changes implicitly).

- [ ] **Step 2: Add two new tests**

Append to the existing `describe("runResponseAgent", ...)`:

```typescript
test("emits a sources chunk after text when ctx.ragSources is non-empty", async () => {
  const anthropic = mockAnthropic({
    events: [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } },
    ],
  });
  vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

  const chunks = await collect(
    runResponseAgent({
      userMessage: "What is HPV?",
      history: [],
      ragSources: [
        { id: "1", title: "Cancer Council", url: "https://example.com", chunkId: "c1" },
      ],
    }),
  );
  expect(chunks).toEqual([
    { type: "text", text: "Hi" },
    {
      type: "sources",
      sources: [
        { id: "1", title: "Cancer Council", url: "https://example.com", chunkId: "c1" },
      ],
    },
  ]);
});

test("does not emit a sources chunk when ctx.ragSources is empty or absent", async () => {
  const anthropic = mockAnthropic({
    events: [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } },
    ],
  });
  vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

  // ragSources omitted entirely
  const chunksNoField = await collect(
    runResponseAgent({ userMessage: "Hi", history: [] }),
  );
  expect(chunksNoField).toEqual([{ type: "text", text: "Hi" }]);

  // ragSources present but empty
  const chunksEmpty = await collect(
    runResponseAgent({ userMessage: "Hi", history: [], ragSources: [] }),
  );
  expect(chunksEmpty).toEqual([{ type: "text", text: "Hi" }]);
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
pnpm test lib/agents/response-agent.test.ts 2>&1 | tail -10
```
Expected: existing tests fail because of the chunk-shape change; new tests fail because the agent doesn't emit sources yet.

- [ ] **Step 4: Update the implementation**

Replace `lib/agents/response-agent.ts`:

```typescript
import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import type { Source } from "@/types/agents";

const MAX_TOKENS = 4096;

export type ResponseAgentContext = {
  /** The new user turn. The agent appends this to `history` before calling Claude. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
  /** Optional retrieved-context block. When present, appended to the system prompt. */
  ragContext?: string;
  /**
   * Optional structured citations from the RAG agent. When non-empty, the
   * agent yields one `sources` chunk after all text chunks. Wired by #27.
   */
  ragSources?: Source[];
  /** Optional system-prompt override. Defaults to `DEFAULT_SYSTEM_PROMPT`. */
  systemPrompt?: string;
};

export type AgentChunk =
  | { type: "text"; text: string }
  | { type: "sources"; sources: Source[] };

/**
 * Pure response-agent function. Yields each text delta from Claude as it
 * arrives, then optionally a single `sources` chunk at the end if
 * `ctx.ragSources` is non-empty.
 *
 * Per CLAUDE.md: agents are pure functions with no DB / HTTP awareness, and
 * the model string is hard-coded (never from env).
 */
export async function* runResponseAgent(
  ctx: ResponseAgentContext,
): AsyncIterable<AgentChunk> {
  const baseSystem = ctx.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const system = ctx.ragContext
    ? `${baseSystem}\n\nRetrieved context:\n${ctx.ragContext}`
    : baseSystem;

  const messages = [...ctx.history, { role: "user" as const, content: ctx.userMessage }];

  const anthropic = getAnthropicClient();
  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }

  if (ctx.ragSources && ctx.ragSources.length > 0) {
    yield { type: "sources", sources: ctx.ragSources };
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm test lib/agents/response-agent.test.ts 2>&1 | tail -5
```
Expected: 10/10 passing (8 existing updated + 2 new).

- [ ] **Step 6: Biome + tsc**

```bash
pnpm biome check --write lib/agents/response-agent.ts lib/agents/response-agent.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: clean (route may complain about chunk shape — that's Task 6).

- [ ] **Step 7: Commit (type + agent together)**

```bash
git add types/agents.ts lib/agents/response-agent.ts lib/agents/response-agent.test.ts
git commit -m "feat(agents): yield AgentChunk (text | sources) from runResponseAgent"
```

---

## Task 5: Add `sources` variant to the wire format

**Files:** `lib/ai/streaming.ts`, `lib/ai/streaming.test.ts`.

- [ ] **Step 1: Extend `ChatStreamEvent`**

In `lib/ai/streaming.ts`, update the union:

```typescript
import type { Source } from "@/types/agents";

export type ChatStreamEvent =
  | { type: "start"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "sources"; sources: Source[] }
  | { type: "done" }
  | { type: "error"; message: string };
```

(`encodeChatStreamEvent` and `parseChatStream` keep their existing JSON-stringify / JSON.parse logic — no code changes needed; the union now happens to include `sources`.)

- [ ] **Step 2: Add two encoder + decoder round-trip tests**

Append to the existing `describe("encodeChatStreamEvent", ...)`:

```typescript
it("encodes a sources event with the array payload", () => {
  const out = encodeChatStreamEvent({
    type: "sources",
    sources: [
      { id: "1", title: "Cancer Council", url: "https://example.com", chunkId: "c1" },
    ],
  });
  const parsed = JSON.parse(decoder.decode(out).trim()) as ChatStreamEvent;
  expect(parsed).toEqual({
    type: "sources",
    sources: [
      { id: "1", title: "Cancer Council", url: "https://example.com", chunkId: "c1" },
    ],
  });
});
```

And to `describe("parseChatStream", ...)`:

```typescript
it("yields a sources event from a serialized line", async () => {
  const events = await collect(
    streamFromString(
      '{"type":"sources","sources":[{"id":"1","title":"Cancer Council","chunkId":"c1"}]}\n',
    ),
  );
  expect(events).toEqual([
    {
      type: "sources",
      sources: [{ id: "1", title: "Cancer Council", chunkId: "c1" }],
    },
  ]);
});
```

- [ ] **Step 3: Run the streaming tests**

```bash
pnpm test lib/ai/streaming.test.ts 2>&1 | tail -5
```
Expected: 14/14 passing (12 existing + 2 new).

- [ ] **Step 4: Biome + tsc**

```bash
pnpm biome check --write lib/ai/streaming.ts lib/ai/streaming.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add lib/ai/streaming.ts lib/ai/streaming.test.ts
git commit -m "feat(ai): add sources variant to ChatStreamEvent + tests"
```

---

## Task 6: Route handles `sources` chunk + persists column

**Files:** `app/api/chat/route.ts`, `tests/api/chat.test.ts`.

- [ ] **Step 1: Update the route to handle the new chunk shape**

In `app/api/chat/route.ts`, replace the agent-streaming block inside `start(controller)`:

```typescript
      let assistantText = "";
      let collectedSources: import("@/types/agents").Source[] | null = null;
      try {
        for await (const chunk of runResponseAgent({
          userMessage,
          history,
        })) {
          if (chunk.type === "text") {
            assistantText += chunk.text;
            send({ type: "text", text: chunk.text });
          } else if (chunk.type === "sources") {
            collectedSources = chunk.sources;
            send({ type: "sources", sources: chunk.sources });
          }
        }

        // Persist the completed assistant message with sources before signalling done.
        const { error: insertErr } = await supabase.from("chat_messages").insert({
          session_id: sessionIdResolved,
          role: "assistant",
          content: assistantText,
          // biome-ignore lint/suspicious/noExplicitAny: jsonb column type erases shape; cast is intentional
          sources: collectedSources as any,
        });
        if (insertErr) {
          console.error(
            "[/api/chat] assistant message insert failed (reply still streamed):",
            insertErr instanceof Error ? insertErr.message : insertErr,
          );
        }

        send({ type: "done" });
      } catch (err) {
        // ... existing error block (interruption marker), unchanged
      }
```

(The `import` inside a type position is a TypeScript trick to avoid a top-of-file `import` if the codebase prefers minimal imports. Either pattern is fine — switch to a top-of-file `import type { Source } from "@/types/agents";` if Biome auto-organizes things differently.)

The `as any` cast on `sources` is needed because the Supabase generated type for `sources` is `Json | null` and TS doesn't auto-coerce a `Source[]` to that broader Json type. The `biome-ignore` is justified — the cast is correct at runtime; jsonb accepts any structured value.

- [ ] **Step 2: Update the chat-route tests**

Most existing tests don't pass through sources, so behavior is unchanged. The `mockSupabaseChain`'s `messageInsert` mock currently accepts any insert payload — verify that's still the case (it should be; the mock returns `{ data: null, error: null }` regardless).

The happy-path test currently asserts `messageInsert` was called with `{ session_id, role, content }`. After the route change, the assistant insert call now also includes `sources: null` (since no sources were collected). Update the assertion:

```typescript
expect(fromChain.messageInsert).toHaveBeenNthCalledWith(2, {
  session_id: "22222222-2222-4222-8222-222222222222",
  role: "assistant",
  content: "Hello there!",
  sources: null,
});
```

(Same pattern for any other test that asserts the second insert's exact shape — likely just the happy path.)

- [ ] **Step 3: Run the chat-route tests**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -8
```
Expected: 11/11 passing.

- [ ] **Step 4: Biome + tsc**

```bash
pnpm biome check --write app/api/chat/route.ts tests/api/chat.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "feat(api): handle and persist sources chunk on /api/chat"
```

---

## Task 7: `[sessionId]` page loads sources

**Files:** `app/(app)/chat/[sessionId]/page.tsx`.

- [ ] **Step 1: Update the message select**

Find the `messages` query, change the select to include `sources`:

```typescript
const { data: messages, error: msgErr } = await supabase
  .from("chat_messages")
  .select("id, role, content, sources")
  .eq("session_id", sessionId)
  .order("created_at", { ascending: true });
```

And the mapping:

```typescript
const initialMessages =
  messages?.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    status: "complete" as const,
    sources: (m.sources as import("@/types/agents").Source[] | null) ?? undefined,
  })) ?? [];
```

(Use the inline `import type` pattern or move to a top-level `import type`.)

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check --write "app/(app)/chat/[sessionId]/page.tsx"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

(No commit yet — chat-client extension lands together in Task 8.)

---

## Task 8: Chat client handles `sources` event + extends `ChatMessage`

**Files:** `app/(app)/chat/chat-client.tsx`.

- [ ] **Step 1: Extend `ChatMessage`**

Add an optional `sources` field:

```typescript
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "error";
  sources?: Source[];
};
```

Add the import: `import type { Source } from "@/types/agents";`.

- [ ] **Step 2: Handle the `sources` wire event**

Inside the `for await (const event of parseChatStream(response.body))` loop, add a branch:

```typescript
} else if (event.type === "sources") {
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId ? { ...m, sources: event.sources } : m,
    ),
  );
}
```

(Place it between the `text` and `done` branches.)

- [ ] **Step 3: Render `<CitationChips>` in `MessageBubble`**

Update the bubble to also render chips:

```tsx
import { CitationChips } from "./citation-chips";

function MessageBubble({ message }: { message: ChatMessage }) {
  // ... existing setup unchanged

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
        <div
          className={`whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm leading-relaxed ${bubbleClass}`}
        >
          {message.content || (isStreaming ? <TypingDots /> : null)}
        </div>
        {message.role === "assistant" && <CitationChips sources={message.sources} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Biome + tsc**

```bash
pnpm biome check --write "app/(app)/chat/chat-client.tsx"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

(No commit yet — chip component lands in Task 9, then we commit together.)

---

## Task 9: `CitationChips` component (TDD)

**Files:** `app/(app)/chat/citation-chips.tsx`, `app/(app)/chat/citation-chips.test.tsx`.

The AC mandates a Vitest test for the renderer. Use `@testing-library/react` (already in devDependencies).

- [ ] **Step 1: Write the failing tests**

Create `app/(app)/chat/citation-chips.test.tsx`:

```tsx
import type { Source } from "@/types/agents";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CitationChips } from "./citation-chips";

describe("CitationChips", () => {
  it("renders nothing for an empty array", () => {
    const { container } = render(<CitationChips sources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for null", () => {
    const { container } = render(<CitationChips sources={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for undefined", () => {
    const { container } = render(<CitationChips sources={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one numbered chip with a link for a single source with a URL", () => {
    const sources: Source[] = [
      { id: "1", title: "Cancer Council", url: "https://example.com/source", chunkId: "c1" },
    ];
    render(<CitationChips sources={sources} />);
    const link = screen.getByRole("link", { name: /\[1\]/ });
    expect(link).toHaveAttribute("href", "https://example.com/source");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("title", "Cancer Council");
  });

  it("renders multiple chips with sequential numbers", () => {
    const sources: Source[] = [
      { id: "1", title: "Source A", url: "https://a.com", chunkId: "c1" },
      { id: "2", title: "Source B", url: "https://b.com", chunkId: "c2" },
      { id: "3", title: "Source C", url: "https://c.com", chunkId: "c3" },
    ];
    render(<CitationChips sources={sources} />);
    expect(screen.getByRole("link", { name: /\[1\]/ })).toHaveAttribute("title", "Source A");
    expect(screen.getByRole("link", { name: /\[2\]/ })).toHaveAttribute("title", "Source B");
    expect(screen.getByRole("link", { name: /\[3\]/ })).toHaveAttribute("title", "Source C");
  });

  it("renders a non-clickable span when the URL is missing", () => {
    const sources: Source[] = [{ id: "1", title: "No URL Source", chunkId: "c1" }];
    render(<CitationChips sources={sources} />);
    // No link
    expect(screen.queryByRole("link")).toBeNull();
    // But the chip still appears with the marker
    expect(screen.getByText(/\[1\]/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test "app/(app)/chat/citation-chips.test.tsx" 2>&1 | tail -10
```
Expected: import-resolution failure for `./citation-chips`.

- [ ] **Step 3: Write the component**

Create `app/(app)/chat/citation-chips.tsx`:

```tsx
import type { Source } from "@/types/agents";

type Props = {
  sources: Source[] | null | undefined;
};

/**
 * Renders 1-indexed numbered chips for each source under an assistant
 * message bubble. Sources with a URL render as `<a>` opening in a new tab;
 * those without render as a non-clickable `<span>`. Returns null when there
 * are no sources to render.
 */
export function CitationChips({ sources }: Props) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => {
        const number = i + 1;
        const label = `[${number}]`;
        if (s.url) {
          return (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.title}
              className="border-border text-charcoal hover:bg-white/40 inline-flex items-center rounded-full border bg-white/20 px-2 py-0.5 text-xs leading-tight transition-colors"
            >
              {label}
            </a>
          );
        }
        return (
          <span
            key={s.id}
            title={s.title}
            className="border-border text-muted-gray inline-flex cursor-default items-center rounded-full border bg-white/10 px-2 py-0.5 text-xs leading-tight"
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test "app/(app)/chat/citation-chips.test.tsx" 2>&1 | tail -5
```
Expected: 6/6 passing.

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write "app/(app)/chat/citation-chips.tsx" "app/(app)/chat/citation-chips.test.tsx"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```

- [ ] **Step 6: Commit (chip component + chat-client + page wiring together — they're a coherent UI chunk)**

```bash
git add "app/(app)/chat/citation-chips.tsx" "app/(app)/chat/citation-chips.test.tsx" "app/(app)/chat/chat-client.tsx" "app/(app)/chat/[sessionId]/page.tsx"
git commit -m "feat(chat): render source citation chips under assistant messages

- New CitationChips component (1-indexed, URL → <a>, no URL → <span>)
- chat-client handles the new sources wire event, attaches to the message
- [sessionId] page selects sources from DB and threads through initialMessages
- Component-level Vitest tests cover empty/single/multiple/missing-URL"
```

---

## Task 10: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 167 baseline + **2** (agent sources) + **2** (streaming wire) + **6** (chips) = **177**.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | grep -E "/api/chat|/chat" | head -5
```
Expected: all clean; `/api/chat` + `/chat` + `/chat/[sessionId]` compile.

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-02-epic3-source-citation-display.md
git commit -m "docs(plan): add Epic 3 #28 source citation display implementation plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/source-citation-display-28
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/source-citation-display-28 \
  --title "feat(chat): #28 — source citation display (schema + agent + wire + UI)" \
  --body "$(cat <<'EOF'
## Summary
End-to-end citation infrastructure: DB column, type, agent shape, NDJSON wire variant, route persistence, UI chip renderer.

- Migration adds `chat_messages.sources jsonb null`
- New `Source` type in `types/agents.ts`
- `runResponseAgent` ctx accepts optional `ragSources?: Source[]`; return type changes from `AsyncIterable<string>` to `AsyncIterable<AgentChunk>` (text or sources). Sources chunk emitted only when `ragSources` is non-empty
- `ChatStreamEvent` extended with a `sources` variant. Encoder/decoder transparently round-trip the new shape
- `/api/chat` discriminates the agent's chunks, forwards `sources` events to the client, and persists the column on assistant insert
- `/chat/[sessionId]` selects `sources` and threads it through `initialMessages`
- Chat client handles the wire event by attaching sources to the streaming assistant message
- New `CitationChips` component renders 1-indexed chips under assistant bubbles. URL → `<a target="_blank">`; no URL → non-clickable `<span>`. Empty/null → renders nothing

## Production data path is dormant until #27
Without #27 (orchestrator + RAG agent), the route doesn't pass `ragSources` to `runResponseAgent`, so the agent never emits a sources chunk and no citations get persisted in production traffic. This PR builds the entire pipeline so #27 lands as a one-line change. Each layer is unit-tested in isolation.

## Tests added
- Agent (2): emits a sources chunk when `ragSources` is non-empty; doesn't emit when empty/absent. Existing 8 tests updated to assert `AgentChunk` shape (`{type: "text", text}` instead of bare strings)
- Streaming wire format (2): `sources` event encode + decode round-trip
- `CitationChips` (6): empty / null / undefined render nothing; single source with URL → `<a>` with `target="_blank"`, `rel="noopener noreferrer"`, and `title`; multiple sources → sequential 1-indexed labels; missing URL → non-clickable `<span>`

## Tests modified (no count change)
- `tests/api/chat.test.ts` happy-path now asserts the assistant insert includes `sources: null` (no behavior change since no test passes ragSources)

## Why no route-level test for the sources persistence path?
With #28's route not passing `ragSources` to the agent, the route's sources-forwarding/persistence code is unreachable from the test fixtures. Triggering it would require mocking the agent module instead of Anthropic — a different mocking strategy that conflicts with the existing test setup. Coverage at agent + wire-format + UI levels is sufficient; integration is exercised end-to-end when #27 ships.

## Test plan
- [x] `pnpm test` — full suite green (177/177 with real Supabase env)
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — `/api/chat` + `/chat` + `/chat/[sessionId]` all compile

Closes #28. Ready for #27 to wire RAG → response agent's `ragSources`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #28 maps to a Task — migration (2), agent shape (4), route persistence (6), UI chip renderer (9), `general_chat` empty-array → no chips (Task 9 chip renderer's null/empty guard), Vitest unit tests for empty/single/multiple/missing-URL (Task 9).
- **Placeholder scan:** no TBD/TODO. The `as any` cast on the sources insert payload is intentional (jsonb column type erases shape) and explained inline with a `biome-ignore`.
- **Type consistency:** `Source` is the single source of truth in `types/agents.ts`; agent + wire format + route + chat-client + chip renderer all import from there. `AgentChunk` is internal to the agent (defined and consumed in `lib/agents/response-agent.ts`); the wire format has a parallel but distinct `ChatStreamEvent` `sources` variant — they happen to have the same payload shape but are not the same type.
- **Production data path is dormant**: the PR body and plan are explicit about this. The chip renderer is unit-tested with realistic source arrays; production wiring lights up when #27 lands.
