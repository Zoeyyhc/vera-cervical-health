# Epic 3 — #27 Multi-Agent Orchestrator Wiring (RAG + Response) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `runOrchestrator(supabase, ctx)` to `lib/agents/orchestrator.ts` that classifies the user's intent and dispatches: `health_question` → `runRagAgent` → `runResponseAgent` (with `ragContext` + `ragSources` from RAG), `general_chat` → `runResponseAgent` directly, `news_request` / `events_request` → stub text. Rewire `/api/chat/route.ts` to call the orchestrator instead of `runResponseAgent` directly. Lights up the citation pipeline end-to-end (#28's chip rendering finally has live data once the KB is seeded).

**Architecture:** The orchestrator becomes an `AsyncIterable<AgentChunk>` async generator — same shape as `runResponseAgent`. The route doesn't change its iteration loop; it just imports `runOrchestrator` instead. Internally the orchestrator classifies the intent, logs it, then dispatches:

```
runOrchestrator
├─ classifyIntent (mocked-anthropic call)
├─ health_question → runRagAgent (returns ragContext + ragSources)
│                  → yield* runResponseAgent({ ..., ragContext, ragSources })
├─ general_chat    → yield* runResponseAgent({ ... })
├─ news_request    → yield { type: "text", text: <stub> }
└─ events_request  → yield { type: "text", text: <stub> }
```

The route's `console.info(intent)` log moves into the orchestrator (it owns the decision). Stub text for news/events explicitly says "support is coming soon" so users aren't confused; #29 swaps in real agents.

**Tech Stack:** TypeScript strict, `@supabase/supabase-js`, Vitest (mock the agents at module level for orchestrator tests; mock the orchestrator at module level for route tests), Biome.

**Issue:** [#27](https://github.com/Zoeyyhc/cervix-assistant/issues/27)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-11
**Depends on:** #25 (response agent), #26 (classifier), #46 (RAG agent) — all merged on `main`.

---

## Pre-existing scaffolding

- ✅ `classifyIntent` from `lib/agents/orchestrator.ts` (#26)
- ✅ `runResponseAgent` accepts `ragContext` + `ragSources` (#28/#41)
- ✅ `runRagAgent` returns `{ ragContext, ragSources }` (#46)
- ✅ `Intent` type in `types/agents.ts` (#26)
- ✅ `AgentChunk` type in `lib/agents/response-agent.ts` (#28)
- ✅ `/api/chat/route.ts` already iterates over `AsyncIterable<AgentChunk>` (#28); only the source of the iterable changes

## Gaps vs #27 acceptance criteria

| AC | Status | Action |
|---|---|---|
| Dispatch table in `lib/agents/orchestrator.ts` | ❌ | **Task 2** |
| `health_question` branch → `runRagAgent` → `runResponseAgent` with ragContext/ragSources | ❌ | Task 2 |
| `general_chat` branch → `runResponseAgent` directly | ❌ | Task 2 |
| `news_request` / `events_request` stubs | ❌ | Task 2 |
| Integration tests cover each branch with mocked sub-agents | ❌ | Task 2 |
| `docs/architecture.md` diagram updated if dispatch shape differs | ✅ — diagram already shows the four-way dispatch | None (diagram still accurate; news/events show "Agent" but stub-vs-real is a code detail) |

## Decisions documented in this plan

- **Orchestrator returns `AsyncIterable<AgentChunk>`** — same shape as `runResponseAgent`. The route doesn't need to know whether the generator is RAG-driven or just the response agent. Clean swap.
- **`runOrchestrator` becomes the route's only agent-side import.** The route no longer imports `runResponseAgent` or `classifyIntent` directly. Single seam = easier to test the route in isolation later.
- **Logging moves into the orchestrator.** The route's `console.info(...)` line goes away; the orchestrator does `console.info("[orchestrator] dispatch: <intent>")` after classification.
- **News/events stubs are static text yields.** `{ type: "text", text: "..." }` — user sees a friendly "coming soon" message via the existing streaming UI, no special-case logic in route or client.
- **Stubs do not go through the response agent.** Two reasons: (a) they're deterministic — no need for Claude; (b) #29 will replace them with real agent calls anyway. Static text now, real agents later.
- **No `done`-event-equivalent yielded by stubs.** The route always sends `done` after the iterator exhausts; the orchestrator just yields what it has.
- **Route tests pivot from mocking the SDK to mocking the orchestrator.** Cleaner separation: the route's tests verify routing/persistence/wire-format; the orchestrator's tests verify dispatch; the agents' tests verify their own logic. Each layer tested in isolation.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/agents/orchestrator.ts` | **Modify** | Add `runOrchestrator(supabase, ctx)` async generator + `OrchestratorContext` type. Existing `classifyIntent` stays. |
| `lib/agents/orchestrator.test.ts` | **Modify** | Append a `describe("runOrchestrator")` block: 5+ tests covering each branch and edge cases. Mock `classifyIntent`, `runRagAgent`, `runResponseAgent` at module level. |
| `app/api/chat/route.ts` | **Modify** | Swap `runResponseAgent` import for `runOrchestrator`. Remove the `classifyIntent` pre-step + console.info (orchestrator owns those now). Iterator body unchanged. |
| `tests/api/chat.test.ts` | **Modify** | Pivot from mocking `@/lib/ai/anthropic` to mocking `@/lib/agents/orchestrator`. Replace SDK-level mock helpers with a single `mockOrchestrator(...)` helper that controls what the orchestrator yields. Existing test cases adapted to the new mock shape. |

**Files not touched:**
- `lib/agents/response-agent.ts`, `lib/agents/rag-agent.ts` — consumed as-is.
- `lib/ai/streaming.ts`, `lib/ai/system-prompt.ts`, `lib/ai/anthropic.ts`, `lib/ai/openai.ts` — unaffected.
- `docs/architecture.md` — already shows the dispatch shape (diagram from CLAUDE.md is accurate; the news/events boxes will become real agents in #29).

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/orchestrator-wiring-27`.

- [ ] **Step B: Confirm dependencies are on `main`**

```bash
ls lib/agents/orchestrator.ts lib/agents/response-agent.ts lib/agents/rag-agent.ts
```
Expected: all three present.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 209/209 with real Supabase env (after #46 merged), or 197/209 (12 skipped) without. All clean.

---

## Task 1: Decide and document the orchestrator's contract

**Files:** none — design notes that flow into Tasks 2–4.

These decisions are explicit so the executor doesn't have to make them mid-implementation:

1. **Function signature**: `runOrchestrator(supabase, ctx): AsyncIterable<AgentChunk>` where `ctx = { userMessage, history }`. Same `ctx` shape the response agent already accepts (minus `ragContext`/`ragSources`/`systemPrompt`/`ragSources` — orchestrator decides those).
2. **`AgentChunk`** is reused from `lib/agents/response-agent.ts` — same wire shape downstream.
3. **`history`** is the prior conversation (does NOT include the current user message). Same convention as `runResponseAgent` (#25). The route already loads it correctly.
4. **News/events stub copy** (final wording — change later if needed):
   - `news_request`: `"Latest health news support is coming soon. For now I can answer general questions about cervical health — what would you like to know?"`
   - `events_request`: `"Health events support is coming soon. For now I can answer general questions about cervical health — what would you like to know?"`
5. **Orchestrator never throws** for routing decisions (relies on `classifyIntent`'s never-throws guarantee). Errors from `runRagAgent` or `runResponseAgent` DO propagate (as before).

- [ ] **Step 1: Acknowledge the decisions** — no code yet.

---

## Task 2: Build `runOrchestrator` (TDD)

**Files:** `lib/agents/orchestrator.ts`, `lib/agents/orchestrator.test.ts`.

- [ ] **Step 1: Append failing tests to `lib/agents/orchestrator.test.ts`**

Open the existing file. Below the `describe("classifyIntent", ...)` block, add the new tests:

```typescript
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import type { AgentChunk } from "@/lib/agents/response-agent";

vi.mock("@/lib/agents/response-agent", () => ({
  runResponseAgent: vi.fn(),
}));

vi.mock("@/lib/agents/rag-agent", () => ({
  runRagAgent: vi.fn(),
}));

import { runRagAgent } from "@/lib/agents/rag-agent";
import { runResponseAgent } from "@/lib/agents/response-agent";
import { type OrchestratorContext, runOrchestrator } from "./orchestrator";

const fakeSupabase = {} as unknown as Parameters<typeof runOrchestrator>[0];

function fakeAgentStream(chunks: AgentChunk[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

async function collectOrchestrator(
  ctx: OrchestratorContext,
): Promise<AgentChunk[]> {
  const out: AgentChunk[] = [];
  for await (const c of runOrchestrator(fakeSupabase, ctx)) out.push(c);
  return out;
}

const baseCtx: OrchestratorContext = {
  userMessage: "What is HPV?",
  history: [] as ChatHistoryMessage[],
};

describe("runOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default classifier mock: general_chat. Tests override per case.
    const classifierAnthropic = mockAnthropicCreate("general_chat");
    vi.mocked(getAnthropicClient).mockReturnValue(classifierAnthropic as never);
  });

  // ───── general_chat ────────────────────────────────────────────────────

  test("general_chat: skips RAG and yields response-agent chunks directly", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(
      mockAnthropicCreate("general_chat") as never,
    );
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([{ type: "text", text: "Hello!" }]) as never,
    );

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).toHaveBeenCalledTimes(1);
    expect(runResponseAgent).toHaveBeenCalledWith({
      userMessage: baseCtx.userMessage,
      history: baseCtx.history,
    });
    expect(chunks).toEqual([{ type: "text", text: "Hello!" }]);
  });

  // ───── health_question ─────────────────────────────────────────────────

  test("health_question: calls runRagAgent and threads ragContext + ragSources into the response agent", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(
      mockAnthropicCreate("health_question") as never,
    );
    const ragContext = "[1] (Source A) HPV is a common virus.";
    const ragSources = [
      { id: "1", title: "Source A", chunkId: "uuid-1" },
    ];
    vi.mocked(runRagAgent).mockResolvedValue({ ragContext, ragSources });
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([
        { type: "text", text: "HPV is..." },
        { type: "sources", sources: ragSources },
      ]) as never,
    );

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).toHaveBeenCalledTimes(1);
    expect(runRagAgent).toHaveBeenCalledWith(fakeSupabase, {
      userMessage: baseCtx.userMessage,
    });
    expect(runResponseAgent).toHaveBeenCalledTimes(1);
    expect(runResponseAgent).toHaveBeenCalledWith({
      userMessage: baseCtx.userMessage,
      history: baseCtx.history,
      ragContext,
      ragSources,
    });
    expect(chunks).toEqual([
      { type: "text", text: "HPV is..." },
      { type: "sources", sources: ragSources },
    ]);
  });

  test("health_question with empty RAG result: still calls response agent (with empty ragContext/ragSources)", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(
      mockAnthropicCreate("health_question") as never,
    );
    vi.mocked(runRagAgent).mockResolvedValue({ ragContext: "", ragSources: [] });
    vi.mocked(runResponseAgent).mockReturnValue(
      fakeAgentStream([{ type: "text", text: "I don't have specific info..." }]) as never,
    );

    await collectOrchestrator(baseCtx);

    expect(runResponseAgent).toHaveBeenCalledWith({
      userMessage: baseCtx.userMessage,
      history: baseCtx.history,
      ragContext: "",
      ragSources: [],
    });
  });

  // ───── news_request / events_request stubs ─────────────────────────────

  test("news_request: yields a stub text chunk; never calls RAG or response agent", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(
      mockAnthropicCreate("news_request") as never,
    );

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      type: "text",
      text: expect.stringContaining("news"),
    });
  });

  test("events_request: yields a stub text chunk; never calls RAG or response agent", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(
      mockAnthropicCreate("events_request") as never,
    );

    const chunks = await collectOrchestrator(baseCtx);

    expect(runRagAgent).not.toHaveBeenCalled();
    expect(runResponseAgent).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      type: "text",
      text: expect.stringContaining("events"),
    });
  });

  // ───── error propagation ───────────────────────────────────────────────

  test("propagates errors thrown by runRagAgent on the health_question path", async () => {
    vi.mocked(getAnthropicClient).mockReturnValue(
      mockAnthropicCreate("health_question") as never,
    );
    vi.mocked(runRagAgent).mockRejectedValue(new Error("rag exploded"));

    await expect(collectOrchestrator(baseCtx)).rejects.toThrow("rag exploded");
    expect(runResponseAgent).not.toHaveBeenCalled();
  });
});
```

(Note: the existing `classifyIntent` tests use `mockAnthropicCreate(...)` from earlier in the file. The new tests reuse that helper.)

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/agents/orchestrator.test.ts 2>&1 | tail -10
```
Expected: import-resolution failures for `runOrchestrator` and `OrchestratorContext`.

- [ ] **Step 3: Add the implementation**

Append to `lib/agents/orchestrator.ts` (below the existing `fallbackIntent` function):

```typescript
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { runRagAgent } from "@/lib/agents/rag-agent";
import { type AgentChunk, runResponseAgent } from "@/lib/agents/response-agent";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const NEWS_STUB =
  "Latest health news support is coming soon. For now I can answer general questions about cervical health — what would you like to know?";
const EVENTS_STUB =
  "Health events support is coming soon. For now I can answer general questions about cervical health — what would you like to know?";

export type OrchestratorContext = {
  /** The new user turn. Same shape as the response agent's ctx. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
};

/**
 * Multi-agent orchestrator. Classifies the user's intent and dispatches:
 *
 * - `health_question` → `runRagAgent` → `runResponseAgent` (with ragContext + ragSources)
 * - `general_chat`    → `runResponseAgent` directly
 * - `news_request`    → static stub text (real agent lands in #29)
 * - `events_request`  → static stub text (real agent lands in #29)
 *
 * Returns an AsyncIterable<AgentChunk> with the same wire shape as
 * `runResponseAgent` so the route doesn't need to know about dispatch.
 *
 * Per CLAUDE.md: agents don't call each other directly — the orchestrator
 * coordinates. This function takes the auth-bound Supabase client (used by
 * RAG); the route still owns the connection.
 */
export async function* runOrchestrator(
  supabase: SupabaseClient<Database>,
  ctx: OrchestratorContext,
): AsyncIterable<AgentChunk> {
  const { intent } = await classifyIntent(ctx.userMessage);
  console.info(`[orchestrator] dispatch: ${intent}`);

  if (intent === "health_question") {
    const { ragContext, ragSources } = await runRagAgent(supabase, {
      userMessage: ctx.userMessage,
    });
    yield* runResponseAgent({
      userMessage: ctx.userMessage,
      history: ctx.history,
      ragContext,
      ragSources,
    });
    return;
  }

  if (intent === "news_request") {
    yield { type: "text", text: NEWS_STUB };
    return;
  }

  if (intent === "events_request") {
    yield { type: "text", text: EVENTS_STUB };
    return;
  }

  // general_chat (default)
  yield* runResponseAgent({
    userMessage: ctx.userMessage,
    history: ctx.history,
  });
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test lib/agents/orchestrator.test.ts 2>&1 | tail -10
```
Expected: existing 11 `classifyIntent` tests + new 6 `runOrchestrator` tests = 17 passing.

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write lib/agents/orchestrator.ts lib/agents/orchestrator.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: tsc may flag the route since it still imports `runResponseAgent` directly with the wrong shape; that's Task 3.

- [ ] **Step 6: Commit (orchestrator + tests together)**

```bash
git add lib/agents/orchestrator.ts lib/agents/orchestrator.test.ts
git commit -m "feat(agents): add runOrchestrator dispatching health_question / general_chat / stubs"
```

---

## Task 3: Wire `runOrchestrator` into `/api/chat/route.ts`

**Files:** `app/api/chat/route.ts`.

- [ ] **Step 1: Update the imports**

Replace the agent imports at the top:

```typescript
// Remove:
//   import { classifyIntent } from "@/lib/agents/orchestrator";
//   import { runResponseAgent } from "@/lib/agents/response-agent";
//
// Add:
import { runOrchestrator } from "@/lib/agents/orchestrator";
```

- [ ] **Step 2: Remove the classifier pre-step block**

The route currently has:

```typescript
  // Pre-step: classify the user's intent. Logged for now; #27 wires it into
  // dispatch. classifyIntent never throws — on internal failure it returns a
  // fallback intent — so we don't gate the rest of the request on it.
  const { intent } = await classifyIntent(parsed.data.message);
  console.info(`[/api/chat] classified intent: ${intent}`);
```

Delete it. The orchestrator owns classification + logging now.

- [ ] **Step 3: Update the agent iteration**

Find the existing `for await (const chunk of runResponseAgent(...))` loop and replace with:

```typescript
        for await (const chunk of runOrchestrator(supabase, {
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
```

(Only the iterable changes — `runResponseAgent({...})` becomes `runOrchestrator(supabase, {...})`. The chunk-handling loop body is identical.)

- [ ] **Step 4: Biome + tsc**

```bash
pnpm biome check --write app/api/chat/route.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: tsc clean for the route. The existing chat-route tests will fail at this point — that's Task 4.

(No commit yet — route + tests change together.)

---

## Task 4: Update chat-route tests to mock the orchestrator

**Files:** `tests/api/chat.test.ts`.

The existing tests mock `@/lib/ai/anthropic` and stub Anthropic SDK calls — that exercises the full agent stack inside the route. With the orchestrator wrapping everything, mocking at the orchestrator boundary is cleaner: route tests verify routing/persistence/wire-format, not agent internals.

- [ ] **Step 1: Replace the mock setup**

At the top of `tests/api/chat.test.ts`, replace:

```typescript
vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return {
    ...actual,
    getAnthropicClient: vi.fn(),
  };
});

import { POST } from "@/app/api/chat/route";
import { getAnthropicClient } from "@/lib/ai/anthropic";
import { parseChatStream } from "@/lib/ai/streaming";
import { createClient } from "@/lib/supabase/server";
```

With:

```typescript
vi.mock("@/lib/agents/orchestrator", () => ({
  runOrchestrator: vi.fn(),
}));

import { POST } from "@/app/api/chat/route";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { parseChatStream } from "@/lib/ai/streaming";
import { createClient } from "@/lib/supabase/server";
```

- [ ] **Step 2: Replace the agent-mock helpers**

Delete the `MockedAnthropic`, `mockAnthropic`, `mockAnthropicStream`, and `DEFAULT_CLASSIFIER_REPLY` definitions. Replace with a single helper:

```typescript
import type { AgentChunk } from "@/lib/agents/response-agent";

function mockOrchestrator(chunks: AgentChunk[] | { throwAt: number; chunks: AgentChunk[] }) {
  const config = Array.isArray(chunks) ? { chunks, throwAt: -1 } : chunks;

  return vi.mocked(runOrchestrator).mockReturnValue(
    {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < config.chunks.length; i++) {
          if (config.throwAt === i) throw new Error("upstream stream boom");
          yield config.chunks[i];
        }
        if (config.throwAt === config.chunks.length) {
          throw new Error("upstream stream boom");
        }
      },
    } as never,
  );
}
```

- [ ] **Step 3: Update each test that previously asserted Anthropic call shape**

The existing happy-path test asserts `streamArgs[0].model`, `streamArgs[0].system`, `streamArgs[0].messages`. Those become assertions on what `runOrchestrator` is called with:

```typescript
test("creates a new session, streams text deltas, persists on done", async () => {
  const fromChain = mockSupabaseChain({
    newSessionId: "22222222-2222-4222-8222-222222222222",
    historyRows: [],
  });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
  mockOrchestrator([{ type: "text", text: "Hello there!" }]);

  const res = await POST(postRequest({ message: "Hi" }));
  expect(res.headers.get("content-type")).toContain("application/x-ndjson");

  const events = await readNdjsonStream(res);
  expect(events[0]).toEqual({
    type: "start",
    sessionId: "22222222-2222-4222-8222-222222222222",
  });
  expect(events.find((e) => (e as { type: string }).type === "text")).toEqual({
    type: "text",
    text: "Hello there!",
  });
  expect(events.at(-1)).toEqual({ type: "done" });

  expect(fromChain.sessionInsert).toHaveBeenCalledWith({ user_id: "u1", title: null });
  expect(fromChain.messageInsert).toHaveBeenNthCalledWith(1, {
    session_id: "22222222-2222-4222-8222-222222222222",
    role: "user",
    content: "Hi",
  });
  expect(fromChain.messageInsert).toHaveBeenNthCalledWith(2, {
    session_id: "22222222-2222-4222-8222-222222222222",
    role: "assistant",
    content: "Hello there!",
    sources: null,
  });

  // Orchestrator was called with the supabase client + userMessage + (empty) history
  expect(runOrchestrator).toHaveBeenCalledTimes(1);
  const [supabaseArg, ctxArg] = vi.mocked(runOrchestrator).mock.calls[0];
  expect(supabaseArg).toBeDefined();
  expect(ctxArg).toEqual({ userMessage: "Hi", history: [] });
});
```

(The "sends prior session history" test follows the same pattern — assert `ctxArg.history` has the prior turns.)

The "stream error" test continues to use `throwAt`:

```typescript
test("emits start → text → error and persists partial with marker on stream error", async () => {
  const fromChain = mockSupabaseChain({ historyRows: [] });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
  mockOrchestrator({
    chunks: [
      { type: "text", text: "Hello" },
      { type: "text", text: " there" },
    ],
    throwAt: 2,
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const res = await POST(postRequest({ message: "Hi" }));
  const events = await readNdjsonStream(res);

  expect(events.map((e) => (e as { type: string }).type)).toEqual([
    "start",
    "text",
    "text",
    "error",
  ]);
  expect((events.at(-1) as { type: string; message: string }).message).toBe(
    "upstream stream boom",
  );

  const assistantInsert = fromChain.messageInsert.mock.calls.find(
    (call) => call[0].role === "assistant",
  );
  expect(assistantInsert?.[0].content).toMatch(/^Hello there\n\n\[reply was interrupted:/);

  errSpy.mockRestore();
});
```

- [ ] **Step 4: Update the bail-before-stream tests**

The 401, 400, session-create-fail, RLS-denial, history-load-fail tests bail BEFORE the orchestrator runs. They previously asserted `expect(anthropic.messages.stream).not.toHaveBeenCalled()` or `expect(getAnthropicClient).not.toHaveBeenCalled()`. Now assert `expect(runOrchestrator).not.toHaveBeenCalled()`:

```typescript
test("returns 401 when there is no Supabase user", async () => {
  vi.mocked(createClient).mockReturnValue(mockSupabase(null) as never);

  const res = await POST(postRequest({ message: "hi" }));

  expect(res.status).toBe(401);
  expect(runOrchestrator).not.toHaveBeenCalled();
});

// ... same pattern for 400 / 500-session-create / 404-RLS / 500-history-load
```

(The same change applies to those five tests.)

- [ ] **Step 5: Update the assistant-insert-failure test**

```typescript
test("logs but still emits done if the assistant-message insert errors", async () => {
  const fromChain = mockSupabaseChain({ historyRows: [] });
  fromChain.messageInsert
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("write race") });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
  mockOrchestrator([{ type: "text", text: "Hello" }]);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const res = await POST(postRequest({ message: "Hi" }));
  const events = await readNdjsonStream(res);

  expect(events.at(-1)).toEqual({ type: "done" });
  expect(errSpy).toHaveBeenCalled();
  errSpy.mockRestore();
});
```

- [ ] **Step 6: Run the chat-route tests**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -8
```
Expected: 11/11 passing.

- [ ] **Step 7: Biome + tsc**

```bash
pnpm biome check --write tests/api/chat.test.ts app/api/chat/route.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 8: Commit (route + tests together)**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "refactor(api): route /api/chat through runOrchestrator (RAG + dispatch)"
```

---

## Task 5: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 209 baseline + **6** new orchestrator tests = **215**.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -3
```

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-02-epic3-orchestrator-wiring.md
git commit -m "docs(plan): add Epic 3 #27 orchestrator wiring plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/orchestrator-wiring-27
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/orchestrator-wiring-27 \
  --title "feat(agents): #27 — multi-agent orchestrator wiring (RAG + Response)" \
  --body "$(cat <<'EOF'
## Summary
- Add `runOrchestrator(supabase, ctx)` to `lib/agents/orchestrator.ts` — async generator that classifies the user's intent and dispatches:
  - `health_question` → `runRagAgent` → `runResponseAgent` with `ragContext` + `ragSources` from RAG
  - `general_chat` → `runResponseAgent` directly
  - `news_request` → static stub text (real agent in #29)
  - `events_request` → static stub text (real agent in #29)
- Rewire `/api/chat/route.ts` to call `runOrchestrator` instead of `runResponseAgent` directly. Logging of the dispatch decision moves into the orchestrator
- Pivot `tests/api/chat.test.ts` from mocking the Anthropic SDK to mocking the orchestrator boundary. Cleaner separation: route tests test the route; orchestrator tests test dispatch; agent tests test agent logic

## End-to-end citation pipeline lights up
With the RAG agent (#46) in place AND the orchestrator wired in, the existing citation infrastructure from #28 finally has live data. Chip rendering, `sources` jsonb persistence, NDJSON `sources` event — all fire on `health_question` intents (assuming the KB has content; #44/#48 will populate it).

## Tests added (6)
- `general_chat`: skips RAG, calls response agent only
- `health_question`: calls RAG, threads `ragContext` + `ragSources` into response agent
- `health_question` with empty RAG result: still calls response agent with empty context
- `news_request`: yields stub text, no agent calls
- `events_request`: yields stub text, no agent calls
- Error propagation: RAG agent error bubbles up

## Tests modified
- `tests/api/chat.test.ts` (11 tests): swapped from mocking `@/lib/ai/anthropic` to mocking `@/lib/agents/orchestrator`. Each test now controls what the orchestrator yields via a `mockOrchestrator(...)` helper. Bail-before-stream tests now assert `runOrchestrator` was not called (was: assert SDK calls didn't happen)

## Test plan
- [x] `pnpm test` — full suite green (215+ tests)
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — succeeds

Closes #27. **Sprint 4 dispatch chain is now functional**: ✅ classifier → ✅ dispatch → ✅ RAG (when health_question) → ✅ response agent → ✅ NDJSON wire format → ✅ chip rendering. The chat surface now does Real RAG (with empty results until #44/#48 seed the KB).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #27 maps to a test case — `health_question` dispatch with ragContext threading, `general_chat` skips RAG, news/events stubs, integration tests at the orchestrator boundary.
- **Placeholder scan:** no TBD/TODO. The news/events stub strings are the final v1 wording — if the user wants different copy, that's a one-line change later.
- **Type consistency:** `OrchestratorContext` mirrors the route's existing iteration ctx (`{ userMessage, history }`). `AgentChunk` reused from `lib/agents/response-agent.ts`. Same wire format end-to-end.
- **Layer separation:** the `vi.mock("@/lib/agents/orchestrator")` in `tests/api/chat.test.ts` and the `vi.mock("@/lib/agents/response-agent")` + `vi.mock("@/lib/agents/rag-agent")` in `tests/lib/agents/orchestrator.test.ts` are mutually exclusive — the orchestrator's tests don't mock the orchestrator, the route's tests do. Clean isolation.
- **No CLAUDE.md violations:** orchestrator coordinates (doesn't have agents call each other directly); model strings remain hard-coded inside the agents they belong to; `Response.json(...)` already used in route's pre-stream errors; agents stay pure functions.
