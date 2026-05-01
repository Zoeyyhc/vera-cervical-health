# Epic 3 — #25 Response Agent Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the Claude-invocation logic out of `app/api/chat/route.ts` into a pure function `runResponseAgent(ctx)` in `lib/agents/response-agent.ts`. The agent yields text chunks; the route handles HTTP, auth, persistence, and the NDJSON wire format. No behavioral change visible to the client. Prerequisite refactor for the orchestrator wiring in #27.

**Architecture:** The agent is an async generator that takes `{ userMessage, history, ragContext?, systemPrompt? }` and yields text deltas (`AsyncIterable<string>`). It owns the SDK call, the model string, and `max_tokens`. The route owns the request/response shape, the streaming controller, the DB writes, and the `assistantText` accumulator. The route's order of operations changes to match the agent's input contract: **load history → persist user message → call agent with `userMessage` + `history`** (where `history` is now strictly the *prior* conversation, so the agent appends the new user turn). This is cleaner than the prior "persist → load (including current)" ordering and removes the implicit "the last item in `history` is the current turn" rule the route relied on. Durability is preserved (user message is still persisted before the Claude call); the chat-tests assertion that the user-msg insert precedes the Claude call still holds.

**Tech Stack:** TypeScript strict, `@anthropic-ai/sdk` `messages.stream()`, Vitest, Biome.

**Issue:** [#25](https://github.com/Zoeyyhc/cervix-assistant/issues/25)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-09
**Depends on:** #22 (streaming route — on `main`).

---

## Pre-existing scaffolding

- ✅ `getAnthropicClient()` and `CLAUDE_MODEL` from `lib/ai/anthropic.ts` (#18)
- ✅ `DEFAULT_SYSTEM_PROMPT` from `lib/ai/system-prompt.ts` (#18)
- ✅ `ChatHistoryMessage` type from `lib/ai/context-window.ts` (#21) — agent reuses it for `history`
- ✅ The streaming route in `app/api/chat/route.ts` (#22) — its inner Claude loop is exactly what we extract

## Gaps vs #25 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `lib/agents/response-agent.ts` exports `runResponseAgent(ctx)` returning an async iterable of text chunks | ❌ | **Task 2** |
| `ctx` shape: `{ userMessage, history, ragContext?, systemPrompt? }` | ❌ | Task 2 |
| No DB / HTTP / Supabase concerns inside the agent | ❌ — currently all in the route | Task 2 (clean function) |
| `/api/chat` wires it up; streaming behavior unchanged | ❌ | **Task 3** |
| Vitest unit test mocks Anthropic + asserts each yielded chunk | ❌ | Task 2 |

## Decisions documented in this plan

- **Agent yields strings, not events.** `AsyncIterable<string>` — each value is a text delta. The route handles framing into NDJSON (`{type:"text", text}`). Keeps the agent provider-shape-agnostic; if we ever swap SDKs, only the agent changes.
- **`history` excludes the current user message; `userMessage` is the new turn.** The agent appends `{role: "user", content: ctx.userMessage}` to construct Claude's `messages` array. This requires the route to load history BEFORE persisting the new user message — see Architecture above.
- **`ragContext` injection point**: when provided, append to the system prompt as `${systemPrompt}\n\nRetrieved context:\n${ragContext}`. The orchestrator (#27) will be the first real consumer; for #25 we just wire the parameter end-to-end with one test.
- **`max_tokens` lives in the agent.** Hard-coded at `4096` (carried over from the route). The AC doesn't mention `max_tokens`, so it's not in the ctx — adding it would be feature creep.
- **Errors propagate.** The agent doesn't swallow exceptions from `messages.stream()` — the route's try/catch (which already handles "stream error" persistence + the `error` NDJSON event) still owns failure-mode behavior.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/agents/response-agent.ts` | **Create** | `runResponseAgent(ctx): AsyncIterable<string>`. Pure: takes ctx, returns text chunks. Owns model string + max_tokens + system prompt assembly + SDK call. |
| `lib/agents/response-agent.test.ts` | **Create** | Vitest unit tests: mocks the Anthropic SDK; asserts yielded chunks, system-prompt assembly with/without ragContext, default vs custom systemPrompt, error propagation. |
| `app/api/chat/route.ts` | **Modify** | Swap the inline Claude streaming for `runResponseAgent(...)`. Move `MAX_TOKENS` constant out (now lives in the agent). Reorder operations: load history before persisting the user message (so `history` excludes the current turn, matching the agent's contract). |
| `tests/api/chat.test.ts` | **Modify** | Update happy-path / multi-turn / sessionId-reuse / assistant-insert-fail / Anthropic-rejects tests so `historyRows` reflects PRIOR turns (not including the current user message). The `messages` argument that the agent passes to Claude becomes `[...historyRows, {role: "user", content: "Hi"}]` — assertion shape changes. Insert-order assertion (user-msg insert before Claude call) still holds. |

**Files not touched:**
- `lib/ai/*` — reused unchanged.
- `lib/ai/streaming.ts` — wire format is owned by the route, not the agent.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/response-agent-extraction-25`.

- [ ] **Step B: Confirm #22's surface is on `main`**

```bash
grep -n "messages.stream\|ChatStreamEvent\|loadRecentMessages" app/api/chat/route.ts
```
Expected: hits for all three.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 148/148 with real Supabase env, or 136/148 (12 skipped) without. Biome and tsc clean.

---

## Task 1: Decide and document the agent contract

**Files:** none — design notes that flow into Task 2.

These decisions are explicit so the executor doesn't have to make them mid-implementation:

1. **Return type: `AsyncIterable<string>`.** Each yielded value is one Claude text delta. Caller accumulates / forwards as it sees fit.
2. **Input type: `ResponseAgentContext = { userMessage, history, ragContext?, systemPrompt? }`.** `userMessage: string`, `history: ChatHistoryMessage[]` (reuses the existing type from `lib/ai/context-window.ts`), `ragContext?: string`, `systemPrompt?: string`.
3. **Messages assembly inside the agent**: `[...history, { role: "user", content: userMessage }]`. The agent does the append; callers don't.
4. **System prompt assembly**: `effectivePrompt = systemPrompt ?? DEFAULT_SYSTEM_PROMPT`. If `ragContext` is provided, append `\n\nRetrieved context:\n${ragContext}` to the effective prompt. (Naive concatenation is fine for v1; later tickets can add structured citation markers.)
5. **`max_tokens = 4096`** lives in the agent file as a private constant.
6. **Errors are not caught**: any throw from `anthropic.messages.stream(...)` or its iterator propagates to the caller. The route's existing try/catch handles them.
7. **Non-text events are filtered out**: only `content_block_delta` events with `delta.type === "text_delta"` produce yields. Everything else (start/stop blocks, message metadata, thinking, tool blocks) is ignored.

- [ ] **Step 1: Acknowledge the decisions** — no code yet.

---

## Task 2: Build the agent (TDD)

**Files:** `lib/agents/response-agent.ts`, `lib/agents/response-agent.test.ts`.

Pure function; can be fully tested with a mocked SDK.

- [ ] **Step 1: Make the directory**

```bash
mkdir -p lib/agents
```

(`lib/agents/` is the canonical location per `CLAUDE.md` § Structure — one file per agent.)

- [ ] **Step 2: Write the failing tests**

Create `lib/agents/response-agent.test.ts`:

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return {
    ...actual,
    getAnthropicClient: vi.fn(),
  };
});

import { getAnthropicClient } from "@/lib/ai/anthropic";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { runResponseAgent } from "./response-agent";

type StreamEventLike = {
  type: "content_block_delta";
  delta: { type: "text_delta"; text: string };
};

type StreamLike = {
  events: Array<StreamEventLike | { type: "message_stop" }>;
  throwAt?: number;
};

function mockAnthropic(stream: StreamLike) {
  return {
    messages: {
      create: vi.fn(),
      stream: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < stream.events.length; i++) {
            if (stream.throwAt === i) throw new Error("boom");
            yield stream.events[i];
          }
        },
      })),
    },
  };
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const c of iter) chunks.push(c);
  return chunks;
}

describe("runResponseAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("yields each text delta in order", async () => {
    const anthropic = mockAnthropic({
      events: [
        { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: ", " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "world!" } },
      ],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const chunks = await collect(
      runResponseAgent({ userMessage: "Hi", history: [] }),
    );
    expect(chunks).toEqual(["Hello", ", ", "world!"]);
  });

  test("ignores non-text events from the SDK", async () => {
    const anthropic = mockAnthropic({
      events: [
        { type: "message_stop" },
        { type: "content_block_delta", delta: { type: "text_delta", text: "only this" } },
        { type: "message_stop" },
      ],
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const chunks = await collect(
      runResponseAgent({ userMessage: "Hi", history: [] }),
    );
    expect(chunks).toEqual(["only this"]);
  });

  test("returns no chunks when the stream is empty", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const chunks = await collect(
      runResponseAgent({ userMessage: "Hi", history: [] }),
    );
    expect(chunks).toEqual([]);
  });

  test("calls Claude with model claude-sonnet-4-6 and the default system prompt by default", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(runResponseAgent({ userMessage: "Hi", history: [] }));

    const [args] = anthropic.messages.stream.mock.calls;
    expect(args[0].model).toBe("claude-sonnet-4-6");
    expect(args[0].system).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(args[0].max_tokens).toBeGreaterThan(0);
  });

  test("appends the userMessage to the history when calling Claude", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "How is it transmitted?",
        history: [
          { role: "user", content: "What is HPV?" },
          { role: "assistant", content: "HPV stands for human papillomavirus..." },
        ],
      }),
    );

    const [args] = anthropic.messages.stream.mock.calls;
    expect(args[0].messages).toEqual([
      { role: "user", content: "What is HPV?" },
      { role: "assistant", content: "HPV stands for human papillomavirus..." },
      { role: "user", content: "How is it transmitted?" },
    ]);
  });

  test("uses the explicit systemPrompt when provided", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "Hi",
        history: [],
        systemPrompt: "You are a custom assistant.",
      }),
    );

    const [args] = anthropic.messages.stream.mock.calls;
    expect(args[0].system).toBe("You are a custom assistant.");
  });

  test("appends ragContext to the system prompt when provided", async () => {
    const anthropic = mockAnthropic({ events: [] });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await collect(
      runResponseAgent({
        userMessage: "Hi",
        history: [],
        ragContext: "Source 1: HPV is...",
      }),
    );

    const [args] = anthropic.messages.stream.mock.calls;
    expect(args[0].system).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(args[0].system).toContain("Retrieved context:");
    expect(args[0].system).toContain("Source 1: HPV is...");
  });

  test("propagates errors thrown during streaming", async () => {
    const anthropic = mockAnthropic({
      events: [
        { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } },
      ],
      throwAt: 1,
    });
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    await expect(
      collect(runResponseAgent({ userMessage: "Hi", history: [] })),
    ).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
pnpm test lib/agents/response-agent.test.ts 2>&1 | tail -10
```
Expected: import-resolution failure for `runResponseAgent`.

- [ ] **Step 4: Write the implementation**

Create `lib/agents/response-agent.ts`:

```typescript
import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

const MAX_TOKENS = 4096;

export type ResponseAgentContext = {
  /** The new user turn. The agent appends this to `history` before calling Claude. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
  /** Optional retrieved-context block. When present, appended to the system prompt. */
  ragContext?: string;
  /** Optional system-prompt override. Defaults to `DEFAULT_SYSTEM_PROMPT`. */
  systemPrompt?: string;
};

/**
 * Pure response-agent function. Yields each text delta from Claude as it
 * arrives, in order. The caller handles HTTP framing, persistence, and any
 * downstream wire-format concerns.
 *
 * Per CLAUDE.md: agents are pure functions with no DB / HTTP awareness, and
 * the model string is hard-coded (never from env).
 */
export async function* runResponseAgent(
  ctx: ResponseAgentContext,
): AsyncIterable<string> {
  const baseSystem = ctx.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const system = ctx.ragContext
    ? `${baseSystem}\n\nRetrieved context:\n${ctx.ragContext}`
    : baseSystem;

  const messages = [
    ...ctx.history,
    { role: "user" as const, content: ctx.userMessage },
  ];

  const anthropic = getAnthropicClient();
  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
pnpm test lib/agents/response-agent.test.ts 2>&1 | tail -5
```
Expected: 8/8 passing.

- [ ] **Step 6: Biome**

```bash
pnpm biome check --write lib/agents/response-agent.ts lib/agents/response-agent.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add lib/agents/response-agent.ts lib/agents/response-agent.test.ts
git commit -m "feat(agents): extract runResponseAgent from /api/chat route"
```

---

## Task 3: Wire the route to use the agent

**Files:** `app/api/chat/route.ts`.

Three things change:
1. Replace the inline `anthropic.messages.stream(...)` block with a `for await (const text of runResponseAgent(...))` loop.
2. Move `MAX_TOKENS` out (now lives in the agent).
3. Reorder operations: load history BEFORE persisting the user message, so `history` excludes the current turn (matching the agent's contract).

- [ ] **Step 1: Update the route**

In `app/api/chat/route.ts`:

- Remove the `MAX_TOKENS` constant (the agent owns it now)
- Remove the imports for `CLAUDE_MODEL`, `getAnthropicClient`, `DEFAULT_SYSTEM_PROMPT` (the agent imports them)
- Add `import { runResponseAgent } from "@/lib/agents/response-agent";`
- Reorder steps so the order becomes: auth → validate → resolve sessionId → **load history** → **persist user message** → open stream → call agent → persist assistant message
- Replace the Claude streaming block with the agent call

The body of the `start(controller)` block becomes:

```typescript
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encodeChatStreamEvent(event));
      };

      send({ type: "start", sessionId: sessionIdResolved });

      let assistantText = "";
      try {
        for await (const text of runResponseAgent({
          userMessage: parsed.data.message,
          history,
        })) {
          assistantText += text;
          send({ type: "text", text });
        }

        // Persist the completed assistant message before signalling done.
        const { error: insertErr } = await supabase.from("chat_messages").insert({
          session_id: sessionIdResolved,
          role: "assistant",
          content: assistantText,
        });
        if (insertErr) {
          console.error(
            "[/api/chat] assistant message insert failed (reply still streamed):",
            insertErr instanceof Error ? insertErr.message : insertErr,
          );
        }

        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        console.error("[/api/chat] stream error:", message);

        const interrupted =
          assistantText.length > 0
            ? `${assistantText}\n\n[reply was interrupted: ${message}]`
            : `[reply was interrupted: ${message}]`;
        const { error: insertErr } = await supabase.from("chat_messages").insert({
          session_id: sessionIdResolved,
          role: "assistant",
          content: interrupted,
        });
        if (insertErr) {
          console.error(
            "[/api/chat] interrupted-message insert failed:",
            insertErr instanceof Error ? insertErr.message : insertErr,
          );
        }

        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
```

And reorder the pre-stream block so steps 4 and 5 swap:

```typescript
  // 4. Load the session's history (PRIOR turns; current turn is appended by
  //    the response agent below).
  let history: Awaited<ReturnType<typeof loadRecentMessages>>;
  try {
    history = await loadRecentMessages(supabase, sessionId);
  } catch (err) {
    console.error(
      "[/api/chat] history load failed:",
      err instanceof Error ? err.message : err,
    );
    return Response.json({ error: "history_load_failed" }, { status: 500 });
  }

  // 5. Persist the user message BEFORE calling Claude — durability over speed.
  //    Note: this insert bumps the session's updated_at via the trigger
  //    introduced in #24, so the sidebar reflects activity even if Claude fails.
  const { error: userMsgErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: parsed.data.message,
  });
  if (userMsgErr) {
    console.error(
      "[/api/chat] user message insert failed:",
      userMsgErr instanceof Error ? userMsgErr.message : userMsgErr,
    );
    return Response.json({ error: "session_not_found" }, { status: 404 });
  }
```

- [ ] **Step 2: tsc + Biome spot-check**

```bash
pnpm biome check --write app/api/chat/route.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: tsc may complain that the existing test asserts `historyRows` includes the current message — that's Task 4.

(No commit yet — route + tests change together in a single coherent commit.)

---

## Task 4: Update chat-route tests for the new ordering

**Files:** `tests/api/chat.test.ts`.

The agent appends the user message — so `historyRows` in tests should now contain only PRIOR turns, and the assertion on Claude's `messages` arg becomes `[...historyRows, { role: "user", content: ... }]`.

- [ ] **Step 1: Update the happy-path test**

Replace the body of "creates a new session, streams text deltas, persists on done":

```typescript
test("creates a new session, streams text deltas, persists on done", async () => {
  const fromChain = mockSupabaseChain({
    newSessionId: "22222222-2222-4222-8222-222222222222",
    historyRows: [], // no prior turns — this is a brand-new session
  });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);

  const anthropic = mockAnthropic("Hello there!");
  vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

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
  });

  expect(anthropic.messages.stream).toHaveBeenCalledTimes(1);
  const [streamArgs] = anthropic.messages.stream.mock.calls;
  expect(streamArgs[0].model).toBe("claude-sonnet-4-6");
  expect(streamArgs[0].system).toMatch(/cervical health/i);
  // Agent appends the current user message to (empty) history.
  expect(streamArgs[0].messages).toEqual([{ role: "user", content: "Hi" }]);
});
```

- [ ] **Step 2: Update the multi-turn test**

`historyRows` should now contain only the PRIOR turns; the agent appends the current message:

```typescript
test("sends prior session history to Claude on a follow-up turn", async () => {
  const fromChain = mockSupabaseChain({
    historyRows: [
      { role: "user", content: "What is HPV?" },
      { role: "assistant", content: "HPV stands for human papillomavirus..." },
    ],
  });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
  const anthropic = mockAnthropic("Skin-to-skin contact...");
  vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

  const res = await POST(
    postRequest({
      message: "How is it transmitted?",
      sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
    }),
  );

  await readNdjsonStream(res);

  const [streamArgs] = anthropic.messages.stream.mock.calls;
  expect(streamArgs[0].messages).toEqual([
    { role: "user", content: "What is HPV?" },
    { role: "assistant", content: "HPV stands for human papillomavirus..." },
    { role: "user", content: "How is it transmitted?" },
  ]);
});
```

- [ ] **Step 3: Update the with-sessionId-reuse test**

Drop the historyRows for "Hi" — there are no prior turns:

```typescript
test("with a provided sessionId, reuses it (no new session insert)", async () => {
  const fromChain = mockSupabaseChain({
    historyRows: [], // brand-new turn in an existing session — no prior messages
  });
  // ... rest unchanged
});
```

- [ ] **Step 4: Update the assistant-insert-fail test**

```typescript
test("logs but still emits done if the assistant-message insert errors", async () => {
  const fromChain = mockSupabaseChain({
    historyRows: [],
  });
  // ... rest unchanged
});
```

- [ ] **Step 5: Update the Anthropic-rejects test**

```typescript
test("returns 500 when the Anthropic call rejects, without leaking the error", async () => {
  const fromChain = mockSupabaseChain({
    historyRows: [],
  });
  // ... rest unchanged
});
```

- [ ] **Step 6: Run the chat-route tests**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -8
```
Expected: 11/11 passing — same count, updated assertions.

- [ ] **Step 7: Biome + tsc**

```bash
pnpm biome check --write tests/api/chat.test.ts app/api/chat/route.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 8: Commit (route + tests together)**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "refactor(api): use runResponseAgent in /api/chat

Move the inline anthropic.messages.stream loop into the response agent.
Reorder the pre-stream block so history is loaded BEFORE the user
message is persisted — the agent's contract takes userMessage + prior
history and appends the new turn itself.

No client-visible behavior change. Tests updated to reflect the new
historyRows shape (prior turns only)."
```

---

## Task 5: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 148 baseline + **8 new** (`runResponseAgent`) = 156.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5 && pnpm build 2>&1 | tail -8
```
Expected: all clean.

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-01-epic3-response-agent-extraction.md
git commit -m "docs(plan): add Epic 3 #25 response-agent extraction implementation plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/response-agent-extraction-25
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/response-agent-extraction-25 \
  --title "refactor(agents): #25 — extract runResponseAgent from /api/chat" \
  --body "$(cat <<'EOF'
## Summary
- Move the inline Claude streaming loop out of `app/api/chat/route.ts` into a new pure agent at `lib/agents/response-agent.ts`
- Agent shape per the AC: `runResponseAgent(ctx)` where `ctx = { userMessage, history, ragContext?, systemPrompt? }` returns `AsyncIterable<string>` (text deltas)
- Agent owns the model string, `max_tokens`, system-prompt assembly (with optional `ragContext` injection), and the SDK call
- Route owns HTTP framing, auth, persistence, and the NDJSON wire format
- Reorder route: `load history → persist user message → call agent`. The agent appends `userMessage` to `history` itself, so `history` is now strictly prior turns

## No client-visible behavior change
The streaming wire format, persistence ordering (user msg before Claude call), error handling, and `done`/`error` semantics from #22 are all preserved.

## Tests added
- `runResponseAgent` (8): yields text deltas in order, ignores non-text events, empty stream returns no chunks, calls Claude with `claude-sonnet-4-6` + default system prompt, appends `userMessage` to history, custom `systemPrompt` overrides default, `ragContext` is appended to the system prompt, errors propagate

## Tests modified (no count change)
- The chat-route tests now configure `historyRows` with PRIOR turns only; assertions on Claude's `messages` arg expect `[...historyRows, {role: "user", content}]`

## Test plan
- [x] `pnpm test` — 156/156 across 14 files (was 148 — +8 from the new agent)
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — `/api/chat` and `/chat` both compile

Closes #25. Prerequisite for the orchestrator wiring in #27.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #25 maps to a Task — agent at the documented path with the documented signature; pure function (no DB/HTTP/Supabase imports inside); route consumes it; behavior unchanged; SDK-mocking unit test asserts each yielded chunk.
- **Placeholder scan:** no TBD/TODO. The decision to hard-code `MAX_TOKENS = 4096` matches the route's prior value — no behavior change.
- **Type consistency:** the agent's `ResponseAgentContext` reuses `ChatHistoryMessage` from `lib/ai/context-window.ts` — single source of truth. The agent's return type `AsyncIterable<string>` matches what `for await (const text of ...)` expects in the route.
- **Ordering invariant:** the chat-tests assertion that user-msg insert precedes the Claude call still holds even after the load-then-persist reorder. The reorder swaps load and persist, but persist is still BEFORE the agent call.
- **`ragContext` integration**: minimal v1 implementation (string concat into system prompt) is enough to pass the unit test. The orchestrator (#27) will exercise this path with real RAG output.
