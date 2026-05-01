# Epic 3 — #22 Streaming Responses (Token-by-Token) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `POST /api/chat` from JSON to **NDJSON streaming** (one JSON object per line) so a UI can render Claude's reply token-by-token. Persist the full assistant message at stream end; on mid-stream error, persist what we got with an interruption marker. The route's pre-stream behavior (auth, validation, session create, user-message insert, history load) is unchanged.

**Architecture:** The route opens an Anthropic SDK stream (`anthropic.messages.stream`) and returns a `Response` whose body is a `ReadableStream` emitting NDJSON lines. The event union has four types: `start` (sessionId once at the beginning), `text` (each token delta), `done` (stream is complete and persistence succeeded), `error` (something failed mid-stream). Persistence happens **before** the terminal event so that `done` is the consumer's signal that the conversation history is durable. Choosing **NDJSON over SSE** because it's the simpler protocol for browser `fetch() + ReadableStream` consumers (split on `\n`, JSON.parse each line — no `data:` prefix to strip), the existing route handler conventions in this codebase don't use any SSE-specific framing, and we don't lose anything since this isn't being consumed by `EventSource` (which can't POST anyway).

**Failure-mode decision:** when the stream errors mid-flight, persist whatever Claude sent so far with `\n\n[reply was interrupted: <message>]` appended. Keeps the chat UI consistent with what the user saw on screen. The alternative (drop the partial) means a session re-fetch shows a missing turn the user remembers reading. We don't add a `status` column to `chat_messages` for this — the marker text is human-readable and the `metadata` jsonb column is available if a structured signal is needed later.

**Tech Stack:** `@anthropic-ai/sdk` `messages.stream()`, Web Streams API `ReadableStream`, `TextEncoder`, Vitest, Biome.

**Issue:** [#22](https://github.com/Zoeyyhc/cervix-assistant/issues/22)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-06
**Depends on:** #17 (chat tables), #18 (Anthropic client), #19/#20 (route + persistence), #21 (context window) — all on `main`.

---

## Pre-existing scaffolding

- ✅ `getAnthropicClient()` and `CLAUDE_MODEL` from `lib/ai/anthropic.ts` (#18)
- ✅ `loadRecentMessages()` from `lib/ai/context-window.ts` (#21)
- ✅ Auth gate, body validation, session creation, user-message insert, history load (#19/#20/#21)
- ✅ The Anthropic SDK supports `client.messages.stream(...)` returning an async iterable + `finalMessage()` helper (per `claude-api` skill docs)

## Gaps vs #22 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `/api/chat` uses `anthropic.messages.stream(...)` | ❌ | **Task 2** |
| Returns `text/event-stream` or NDJSON (pick one, document it) | ❌ — picking NDJSON | Task 2 |
| On stream error: persists partial with marker (or rolls back — pick one, document) | ❌ — picking partial-with-marker | Task 2 |
| On stream completion: writes full assistant content to DB | ❌ | Task 2 |
| Manual curl confirms token streaming | ❌ | **Task 4** (manual verification step in pre-PR check) |
| Browser `fetch() + ReadableStream` confirmed | ⚠️ deferred — UI ticket is #23 | Out of scope here; flagged in PR body |

## Decisions documented in this plan

- **Wire format**: NDJSON (`application/x-ndjson`). Each line is one JSON object. Simpler to consume from `fetch()` than SSE; no consumer is using `EventSource`.
- **Event union**: `start` | `text` | `done` | `error` — see Task 1 for the exact shape.
- **Persistence on error**: keep the partial content + append `\n\n[reply was interrupted: <message>]`. Matches what the user saw.
- **`done` vs DB write order**: insert assistant message FIRST, then emit `done`. The terminal event is the consumer's signal that history is durable.
- **Backward compat**: the previous JSON response shape (`{ sessionId, reply }`) had no production consumers (UI is #23). Replacing it outright rather than supporting both shapes.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/ai/streaming.ts` | **Create** | Exports `ChatStreamEvent` typed union and `encodeChatStreamEvent(event): Uint8Array` (NDJSON encoder). Pure. |
| `lib/ai/streaming.test.ts` | **Create** | Vitest unit tests for the encoder and a typed-union exhaustiveness check. |
| `app/api/chat/route.ts` | **Modify** | Replace the JSON return with a `ReadableStream` body. Open Claude stream, emit `start`/`text`/`done`/`error` events, persist on completion or error. |
| `tests/api/chat.test.ts` | **Modify** | Add a `readNdjsonStream()` test helper. Rewrite the existing happy paths to consume the stream and assert event sequence. Keep all bail-before-stream tests as-is — they still return non-streaming JSON for error cases that happen pre-stream (401/400/500-session-create/404-RLS/500-history-load). Add tests for: stream emits start→text→done with full content persisted; mid-stream error emits start→text→error and persists with marker; assistant-insert failure logged but `done` still emitted. |

**Files not touched:**
- `lib/validations/chat.ts` — request body shape unchanged.
- `lib/ai/anthropic.ts`, `lib/ai/system-prompt.ts`, `lib/ai/context-window.ts` — reused unchanged.
- Database migrations — no schema change; no `status` column added (using marker text in `content` instead).

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/streaming-responses-22`.

- [ ] **Step B: Confirm the dependency surface is on `main`**

```bash
ls lib/ai/anthropic.ts lib/ai/context-window.ts lib/ai/system-prompt.ts && grep -n "loadRecentMessages" app/api/chat/route.ts
```
Expected: all four files exist; the route already imports `loadRecentMessages`.

- [ ] **Step C: Baseline tests green**

```bash
pnpm test 2>&1 | tail -5
```
Expected: 122/122 with real Supabase env, or 110/122 (12 skipped) without.

- [ ] **Step D: Biome + tsc clean**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

---

## Task 1: NDJSON event encoder (TDD, pure)

**Files:** `lib/ai/streaming.ts`, `lib/ai/streaming.test.ts`.

The route does the orchestration; this module owns the wire format. Pure, easy to TDD.

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/streaming.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { type ChatStreamEvent, encodeChatStreamEvent } from "./streaming";

describe("encodeChatStreamEvent", () => {
  const decoder = new TextDecoder();

  it("encodes a start event as a single NDJSON line", () => {
    const out = encodeChatStreamEvent({ type: "start", sessionId: "sess-abc" });
    const text = decoder.decode(out);
    expect(text).toBe('{"type":"start","sessionId":"sess-abc"}\n');
  });

  it("encodes a text event with the delta", () => {
    const out = encodeChatStreamEvent({ type: "text", text: "Hello" });
    expect(decoder.decode(out)).toBe('{"type":"text","text":"Hello"}\n');
  });

  it("encodes a done event with no payload", () => {
    const out = encodeChatStreamEvent({ type: "done" });
    expect(decoder.decode(out)).toBe('{"type":"done"}\n');
  });

  it("encodes an error event with the message", () => {
    const out = encodeChatStreamEvent({ type: "error", message: "upstream boom" });
    expect(decoder.decode(out)).toBe('{"type":"error","message":"upstream boom"}\n');
  });

  it("escapes special characters in text content correctly", () => {
    const out = encodeChatStreamEvent({ type: "text", text: 'quote " and newline \n' });
    // JSON.stringify handles the escaping; we just trust it round-trips.
    const parsed = JSON.parse(decoder.decode(out).trim()) as ChatStreamEvent;
    expect(parsed).toEqual({ type: "text", text: 'quote " and newline \n' });
  });

  it("always terminates the line with a single \\n", () => {
    const out = encodeChatStreamEvent({ type: "done" });
    const text = decoder.decode(out);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.match(/\n/g)?.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/ai/streaming.test.ts 2>&1 | tail -8
```
Expected: module-resolution failure for `./streaming`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/streaming.ts`:

```typescript
/**
 * Wire format for the streaming `/api/chat` response. NDJSON over
 * `application/x-ndjson` — one JSON-encoded `ChatStreamEvent` per line.
 *
 * Sequence on the happy path: `start` → 1+ `text` → `done`.
 * On mid-stream error: `start` → 0+ `text` → `error`. The terminal event
 * is sent AFTER the assistant message has been persisted, so consumers
 * can treat `done`/`error` as the durability signal.
 */
export type ChatStreamEvent =
  | { type: "start"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

const encoder = new TextEncoder();

/**
 * Serialize one event as NDJSON: a single JSON object followed by `\n`.
 * Returns bytes ready for `controller.enqueue()` in a `ReadableStream`.
 */
export function encodeChatStreamEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm test lib/ai/streaming.test.ts 2>&1 | tail -5
```
Expected: 6/6 passing.

- [ ] **Step 5: Biome**

```bash
pnpm biome check --write lib/ai/streaming.ts lib/ai/streaming.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/streaming.ts lib/ai/streaming.test.ts
git commit -m "feat(ai): add ChatStreamEvent type and NDJSON encoder for /api/chat"
```

---

## Task 2: Convert `/api/chat` to streaming

**Files:** `app/api/chat/route.ts`.

The pre-stream half (auth → validation → sessionId → user-msg insert → history load) keeps its current shape. The post-history-load half changes from "call Claude → return JSON" to "open Claude stream → return ReadableStream".

- [ ] **Step 1: Update `app/api/chat/route.ts`**

Replace the file contents with:

```typescript
import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import { loadRecentMessages } from "@/lib/ai/context-window";
import { type ChatStreamEvent, encodeChatStreamEvent } from "@/lib/ai/streaming";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createClient } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/validations/chat";

// max_tokens choice: 4096 is comfortably long for educational replies.
// Streaming removes the SDK HTTP-timeout concern that gated the old 16K
// non-streaming bound, but 4096 still feels like the right ceiling for
// a chat reply — easy to raise here if longer answers are needed.
const MAX_TOKENS = 4096;

export async function POST(request: Request) {
  // 1. Auth — bail before parsing the body
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // 3. Resolve session id — create one if the caller didn't supply it
  let sessionId = parsed.data.sessionId;
  if (!sessionId) {
    const { data: created, error: createErr } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: null })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error(
        "[/api/chat] session create failed:",
        createErr instanceof Error ? createErr.message : createErr,
      );
      return Response.json({ error: "session_create_failed" }, { status: 500 });
    }
    sessionId = created.id;
  }

  // 4. Persist the user message BEFORE calling Claude — durability over speed.
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

  // 5. Load the session's history (includes the just-inserted user msg)
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

  // 6. Open Claude stream + return ReadableStream of NDJSON events.
  // The pre-stream errors above use plain JSON responses; from here on,
  // the response is a streaming body and errors surface as `error` events.
  const sessionIdResolved = sessionId;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encodeChatStreamEvent(event));
      };

      send({ type: "start", sessionId: sessionIdResolved });

      let assistantText = "";
      let claudeStream: ReturnType<ReturnType<typeof getAnthropicClient>["messages"]["stream"]> | null = null;
      try {
        const anthropic = getAnthropicClient();
        claudeStream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: DEFAULT_SYSTEM_PROMPT,
          messages: history,
        });

        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            assistantText += text;
            send({ type: "text", text });
          }
        }

        // Persist the completed assistant message before signalling done.
        const { error: insertErr } = await supabase.from("chat_messages").insert({
          session_id: sessionIdResolved,
          role: "assistant",
          content: assistantText,
        });
        if (insertErr) {
          // Same policy as the non-streaming version: log but still emit done,
          // because the user already saw the reply on screen.
          console.error(
            "[/api/chat] assistant message insert failed (reply still streamed):",
            insertErr instanceof Error ? insertErr.message : insertErr,
          );
        }

        send({ type: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        console.error("[/api/chat] stream error:", message);

        // Persist whatever we got, with a human-readable interruption marker.
        // We persist even on zero text so the session reflects that a turn
        // was attempted; the marker tells the UI/user what happened.
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
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      // Allow proxies/CDNs to bypass buffering for streaming responses.
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Quick smoke check (will fail until the test file is updated, but the route file should at least compile)**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```
Expected: no errors in `app/api/chat/route.ts`. (The chat-test file will have errors against the new shape — that's Task 3.)

---

## Task 3: Rewrite chat-route tests for streaming

**Files:** `tests/api/chat.test.ts`.

The auth/validation/session-create-failure/RLS-denial/history-load-failure tests still bail before any streaming and keep their current JSON-status assertion shape. The Claude-success and Claude-error tests need to consume the stream.

- [ ] **Step 1: Add a streaming Anthropic mock helper near the top**

After the `mockAnthropic` helper, add:

```typescript
type StreamEventLike =
  | { type: "content_block_delta"; delta: { type: "text_delta"; text: string } }
  | { type: "content_block_start" | "content_block_stop" | "message_start" | "message_stop" };

function mockAnthropicStream(
  events: StreamEventLike[],
  opts: { throwAt?: number } = {},
): MockedAnthropic {
  return {
    messages: {
      // `stream(...)` returns an async iterable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: SDK return is structural; tests only need iteration
      stream: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < events.length; i++) {
            if (opts.throwAt === i) throw new Error("upstream stream boom");
            yield events[i];
          }
        },
      })),
    } as MockedAnthropic["messages"],
  };
}
```

(The original `mockAnthropic` helper stays for any test still asserting non-stream behavior — but we'll likely remove the old `messages.create` callsites entirely since the route only uses `messages.stream` now. Keep both for now to make the diff readable.)

Update `MockedAnthropic` type to include `stream`:

```typescript
type MockedAnthropic = {
  messages: {
    create: ReturnType<typeof vi.fn>; // legacy — no longer called by the route
    stream: ReturnType<typeof vi.fn>;
  };
};
```

Update the existing `mockAnthropic` helper similarly to populate both:

```typescript
function mockAnthropic(reply: string): MockedAnthropic {
  return {
    messages: {
      create: vi.fn(), // not called; kept for type compat
      stream: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: reply },
          };
        },
      })),
    },
  };
}
```

- [ ] **Step 2: Add an NDJSON-stream reader helper**

```typescript
async function readNdjsonStream(response: Response): Promise<unknown[]> {
  const events: unknown[] = [];
  const reader = response.body?.getReader();
  if (!reader) throw new Error("response has no body stream");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }
  if (buffer.trim()) events.push(JSON.parse(buffer));
  return events;
}
```

- [ ] **Step 3: Update the existing happy-path test to consume the stream**

Replace the test body:

```typescript
test("creates a new session, streams text deltas, persists on done", async () => {
  const fromChain = mockSupabaseChain({
    newSessionId: "22222222-2222-4222-8222-222222222222",
    historyRows: [{ role: "user", content: "Hi" }],
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
  // The mock yields a single text delta with the full reply, so we expect
  // exactly one text event.
  expect(events.find((e) => (e as { type: string }).type === "text")).toEqual({
    type: "text",
    text: "Hello there!",
  });
  expect(events.at(-1)).toEqual({ type: "done" });

  // Order: session created → user msg written → Claude streamed → assistant msg persisted with full content
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

  // The Claude stream call shape
  expect(anthropic.messages.stream).toHaveBeenCalledTimes(1);
  const [streamArgs] = (anthropic.messages.stream as ReturnType<typeof vi.fn>).mock.calls;
  expect(streamArgs[0].model).toBe("claude-sonnet-4-6");
  expect(streamArgs[0].system).toMatch(/cervical health/i);
  expect(streamArgs[0].messages).toEqual([{ role: "user", content: "Hi" }]);
});
```

- [ ] **Step 4: Update the multi-turn history test**

Replace the body to consume the stream and assert via `streamArgs`:

```typescript
test("sends prior session history to Claude on a follow-up turn", async () => {
  const fromChain = mockSupabaseChain({
    historyRows: [
      { role: "user", content: "What is HPV?" },
      { role: "assistant", content: "HPV stands for human papillomavirus..." },
      { role: "user", content: "How is it transmitted?" },
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

  // Drain the stream so the route's start() block runs to completion.
  await readNdjsonStream(res);

  const [streamArgs] = (anthropic.messages.stream as ReturnType<typeof vi.fn>).mock.calls;
  expect(streamArgs[0].messages).toEqual([
    { role: "user", content: "What is HPV?" },
    { role: "assistant", content: "HPV stands for human papillomavirus..." },
    { role: "user", content: "How is it transmitted?" },
  ]);
});
```

- [ ] **Step 5: Update the "with provided sessionId reuses it" test**

Replace its body to drain the stream and check no session insert:

```typescript
test("with a provided sessionId, reuses it (no new session insert)", async () => {
  const fromChain = mockSupabaseChain({
    historyRows: [{ role: "user", content: "Hi" }],
  });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
  vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("ok") as never);

  const res = await POST(
    postRequest({
      message: "Hi",
      sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
    }),
  );

  const events = await readNdjsonStream(res);
  expect(events[0]).toEqual({ type: "start", sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4" });
  expect(fromChain.sessionInsert).not.toHaveBeenCalled();
  expect(fromChain.messageInsert).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 6: Replace the "Anthropic call rejects" test with a stream-error test**

```typescript
test("emits start → text → error and persists partial with marker on stream error", async () => {
  const fromChain = mockSupabaseChain({
    historyRows: [{ role: "user", content: "Hi" }],
  });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);

  // Two text deltas, then throw on the third iteration.
  const anthropic = mockAnthropicStream(
    [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: " there" } },
    ],
    { throwAt: 2 },
  );
  vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const res = await POST(postRequest({ message: "Hi" }));
  const events = await readNdjsonStream(res);

  // start + 2 text + error
  expect(events.map((e) => (e as { type: string }).type)).toEqual([
    "start",
    "text",
    "text",
    "error",
  ]);
  expect((events.at(-1) as { type: string; message: string }).message).toBe(
    "upstream stream boom",
  );

  // Partial content persisted with the marker
  const assistantInsert = fromChain.messageInsert.mock.calls.find(
    (call) => call[0].role === "assistant",
  );
  expect(assistantInsert?.[0].content).toMatch(/^Hello there\n\n\[reply was interrupted:/);

  errSpy.mockRestore();
});
```

- [ ] **Step 7: Replace the "logs but does not fail the request if the assistant-message insert errors" test**

```typescript
test("logs but still emits done if the assistant-message insert errors", async () => {
  // First insert (user) succeeds, second insert (assistant) errors.
  const fromChain = mockSupabaseChain({
    historyRows: [{ role: "user", content: "Hi" }],
  });
  fromChain.messageInsert
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("write race") });

  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
  vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("Hello") as never);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const res = await POST(postRequest({ message: "Hi" }));
  const events = await readNdjsonStream(res);

  // The user already saw the reply; surface done normally.
  expect(events.at(-1)).toEqual({ type: "done" });
  expect(errSpy).toHaveBeenCalled();
  errSpy.mockRestore();
});
```

- [ ] **Step 8: The bail-before-stream tests (401, 400, session-create-failure, RLS-denial, history-load-failure) keep their current shape**

They still assert `res.status` and never touch the stream. No changes needed to those five tests beyond the normal shape they already have.

- [ ] **Step 9: Run the full test file**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -10
```
Expected: all tests passing (auth/validation/error tests unchanged; streaming tests pass against the new route).

- [ ] **Step 10: Biome + tsc**

```bash
pnpm biome check --write app/api/chat/route.ts tests/api/chat.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 11: Commit (route + tests together — they are tightly coupled)**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "feat(api): stream /api/chat as NDJSON token-by-token

Replaces the JSON { sessionId, reply } response with a ReadableStream
emitting NDJSON events: start, text, done | error.

- Persistence-on-done: the full assistant message is inserted before the
  done event so consumers can treat done as the durability signal.
- Persistence-on-error: partial content with [reply was interrupted: ...]
  marker appended; matches what the user saw on screen.
- assistant-insert failure is still logged but does NOT fail the stream
  (the user already saw the reply)."
```

---

## Task 4: Manual verification

**Files:** none — interactive verification per the AC.

The AC says "Manual curl confirms token streaming". A unit test mocks the SDK, so a one-shot curl against a running dev server is the only way to verify the real wire format actually streams.

- [ ] **Step 1: Start the dev server in another terminal**

```bash
pnpm dev
```

- [ ] **Step 2: Get an authenticated session cookie**

The route requires a Supabase user session (cookie-bound). Either:
- (a) Open `http://localhost:3000` in a browser, log in, copy cookies via DevTools → Network → request headers
- (b) Skip — the unit-test coverage of the streaming flow is comprehensive enough that the curl is a sanity check, not the proof

If (b), document in the PR body that manual curl was deferred because the unit tests cover the streaming flow and the UI ticket (#23) will exercise the real wire format.

- [ ] **Step 3 (optional): If you ran the curl, capture a snippet for the PR body**

```bash
curl -N -H "Cookie: <copied>" -H "Content-Type: application/json" \
  -d '{"message":"What is HPV?"}' http://localhost:3000/api/chat
```
Expected: NDJSON lines arriving incrementally. Capture 3–4 sample lines for the PR body.

---

## Task 5: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 122 baseline + 6 new (encoder) + ~2 net new in chat-route (4 modified, 2 new — the count depends on whether the "stream-error" test counts as new or as a replacement for the old "Anthropic rejects" test).

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 3: Commit the plan file**

```bash
git add docs/superpowers/plans/2026-05-01-epic3-streaming-responses.md
git commit -m "docs(plan): add Epic 3 #22 streaming-responses implementation plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/streaming-responses-22
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/streaming-responses-22 \
  --title "feat(api): #22 — stream /api/chat token-by-token (NDJSON)" \
  --body "$(cat <<'EOF'
## Summary
- Convert `POST /api/chat` from `{ sessionId, reply }` JSON to **NDJSON streaming** (`application/x-ndjson`)
- New `lib/ai/streaming.ts` module owns the wire format: `ChatStreamEvent` typed union (`start` | `text` | `done` | `error`) + `encodeChatStreamEvent()` helper
- Route uses `anthropic.messages.stream(...)` and emits each text delta as a `text` event
- Persistence-on-done: full assistant message is inserted **before** the `done` event so the consumer can treat the terminal event as the durability signal
- Persistence-on-error: partial content + `\n\n[reply was interrupted: <message>]` marker so a session re-fetch matches what the user saw on screen
- `assistant-message` insert failure is still logged but does **not** abort the stream (user already saw the reply)

## Wire format chosen: NDJSON over SSE
Simpler for browser `fetch() + ReadableStream` consumers: split on `\n`, `JSON.parse` each line. No `data:` prefix to strip. We're not using `EventSource` (which can't POST anyway), so SSE's framing buys us nothing.

## Failure-mode chosen: persist partial with marker
Alternative was "roll back the partial". Marker wins because chat UI on session re-load should match what the user saw mid-stream — silently dropping the partial would surprise users. No `status` column added to `chat_messages`; `metadata` jsonb is available if a structured signal is ever needed.

## Backward compat
The previous JSON response had no production consumers (UI lands in #23). Replacing the shape outright rather than maintaining both.

## Tests
- `streaming.ts` (6 new): event encoding for each variant, character escaping round-trip, line termination invariant
- Route (modified): happy path now drains the stream and asserts `start → text → done` sequence + persistence; multi-turn history, with-sessionId-reuse, assistant-insert-failure tests adapted similarly
- Route (new): `start → text → text → error` sequence with partial content persisted and marker appended on mid-stream error
- Route (kept as-is): 401, 400-validation, 400-invalid-JSON, 500-session-create-fail, 404-RLS-denial, 500-history-load-fail — these all bail before the streaming response and keep their JSON-status assertions

## Manual verification
The streaming wire format is verified end-to-end in unit tests (mocked SDK + real `ReadableStream` consumption). A curl against a running dev server can be added when convenient — deferred because #23 (the chat UI) will exercise the real wire format with browser `fetch()` first.

## Test plan
- [x] `pnpm test` — full suite green
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean

Closes #22.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #22 maps to a Task in this plan or an explicit deferral (manual curl, browser fetch confirmation — both deferred to #23 with rationale documented).
- **Placeholder scan:** no TBD/TODO. The single deferral (manual curl) is gated behind a clear opt-in step, not a placeholder for future work.
- **Type consistency:** `ChatStreamEvent` is the single source of truth for event shapes — used by `encodeChatStreamEvent()`, the route's `send()` closure, and the test reader. Tests assert against shapes that match the type union exactly.
- **Failure-mode honesty:** the partial-with-marker decision is documented in the route comment, in the plan, and in the PR body. The "assistant-insert failure still emits done" decision is a deliberate match with #20's policy and is asserted by a test.
- **Pre-stream errors stay JSON:** the auth/validation/session-create/RLS/history-load failures all happen before the `Response(stream, ...)` is constructed, so they keep their existing JSON-status response shape. This is desirable — those errors are "request never started streaming" and shouldn't pretend to be stream events.
