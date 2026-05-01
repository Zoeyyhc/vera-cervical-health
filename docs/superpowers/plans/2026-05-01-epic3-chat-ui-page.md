# Epic 3 — #23 Chat UI Page (Message List + Input Box) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/chat` UI — a single-conversation chat surface that reads the NDJSON stream from `/api/chat` and renders Claude's reply token-by-token. Composer with Enter-submit / Shift+Enter-newline, typing indicator until the first token arrives, error toast on failure. Closes Sprint 2 end-to-end.

**Architecture:** A thin Server Component (`app/(app)/chat/page.tsx`) renders a Client Component (`chat-client.tsx`) that owns local state. State: `messages: ChatMessage[]`, `input: string`, `isStreaming: boolean`, `sessionId: string | null`. The client `fetch`es `/api/chat`, consumes the body via a new `parseChatStream(body)` async generator added to `lib/ai/streaming.ts` (a symmetric counterpart to the existing `encodeChatStreamEvent` from #22), and updates message state on each `text` chunk. Out-of-scope per the ticket and CLAUDE.md: session list/switching (#24), source citations (#28), markdown rendering, component-level Vitest tests (project policy is to skip those — manual browser verification is the bar).

**Tech Stack:** Next.js 14 App Router (Server + Client Components), TypeScript strict, Tailwind CSS with the project's design tokens (`bg-cream`, `text-charcoal`, `text-muted-gray`, `border-border`), shadcn `Button` already in `components/ui/`, sonner `toast` (already wired in `app/layout.tsx`), lucide-react icons, Biome.

**Issue:** [#23](https://github.com/Zoeyyhc/cervix-assistant/issues/23)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-07
**Depends on:** #22 (NDJSON streaming endpoint) — on `main`.

---

## Pre-existing scaffolding

- ✅ `/chat` is in `PROTECTED_PATHS` in `lib/auth/route-rules.ts` (line 1) — middleware already gates the route, redirecting unauthenticated users to `/login`
- ✅ `app/(app)/chat/page.tsx` exists as a "Coming soon" placeholder — we replace it
- ✅ `app/(app)/chat/sign-out-button.tsx` exists — we keep it visible in the chat header
- ✅ `Toaster` is mounted in `app/layout.tsx` (already imported and rendered) — `toast()` from `sonner` works anywhere
- ✅ `Button` component in `components/ui/button.tsx` (shadcn over `@base-ui/react`)
- ✅ Design tokens already on the body: `bg-cream` `text-charcoal` `font-sans antialiased`
- ✅ `lib/ai/streaming.ts` already exports `ChatStreamEvent` and `encodeChatStreamEvent` (#22) — we add the decoder here for symmetry

## Gaps vs #23 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `app/(app)/chat/page.tsx` + client component | ⚠️ Page is a placeholder, no client component | **Tasks 3, 4** |
| Uses shadcn primitives, cream background, no white | ❌ | Tasks 3 — design tokens on every surface |
| Enter submits, Shift+Enter newlines | ❌ | Task 3 |
| Streaming tokens render progressively | ❌ — needs the new `parseChatStream` | **Task 2** + Task 3 |
| Loading state while waiting for first token | ❌ | Task 3 |
| Basic error toast on failure | ❌ | Task 3 |
| Middleware gates `/chat/*` | ✅ Already in `PROTECTED_PATHS` | None |
| Biome passes | ❌ | Final verification |

**Test policy:** per `CLAUDE.md` §"Workflow", component-level Vitest tests are not part of this project's bar. The only unit-tested piece is the pure `parseChatStream` generator (Task 2). UI behavior is verified manually in a browser (Task 5).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/ai/streaming.ts` | **Modify** | Add `parseChatStream(body): AsyncIterable<ChatStreamEvent>` — pure async generator, symmetric counterpart to `encodeChatStreamEvent`. |
| `lib/ai/streaming.test.ts` | **Modify** | Append unit tests for `parseChatStream`: single event, multiple events split across chunks, blank lines skipped, malformed JSON throws. |
| `app/(app)/chat/page.tsx` | **Modify** (replace placeholder) | Server Component shell. Renders `<ChatClient />` and a header with the existing `<SignOutButton />`. Auth is already enforced by middleware; nothing extra to do here. |
| `app/(app)/chat/chat-client.tsx` | **Create** | `"use client"` component owning state, composer, message list, streaming `fetch` consumer. |
| `tests/api/chat.test.ts` | **Modify** | Replace the inline `readNdjsonStream` helper with `parseChatStream` from `@/lib/ai/streaming` — DRY win. |

**Files not touched:**
- `middleware.ts` — `/chat/*` already gated.
- `app/(app)/chat/sign-out-button.tsx` — reused as-is from the placeholder page.
- `lib/ai/anthropic.ts`, `lib/ai/system-prompt.ts`, `lib/ai/context-window.ts`, `app/api/chat/route.ts` — server-side, unaffected.
- `app/layout.tsx` — `Toaster` already mounted.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/chat-ui-23`.

- [ ] **Step B: Confirm the API surface from #22 is on `main`**

```bash
grep -n "encodeChatStreamEvent\|application/x-ndjson" app/api/chat/route.ts lib/ai/streaming.ts
```
Expected: hits in both files.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 128/128 with real Supabase env (or 116/128 skipped without). Biome and tsc clean.

---

## Task 1: Decide and document the chat-client design

**Files:** none — design notes that flow into Task 3.

These decisions are explicit so the executor doesn't have to make them mid-implementation:

1. **Single-conversation v1.** No session list, no "new chat" button. Page-load = fresh session (the route auto-creates one when no `sessionId` is sent). Reload = new session. Session-management UI lands in #24.
2. **Optimistic user message + assistant placeholder** on submit, then mutate the placeholder as text chunks arrive. Stable React keys via `crypto.randomUUID()` so updates don't remount.
3. **State, not refs, for `sessionId`.** No race because `isStreaming` blocks rapid double-submits; setState propagates before the next submit can fire.
4. **Submission gating:** Enter (no Shift) submits; Shift+Enter inserts a newline; the composer disables while `isStreaming`. Empty/whitespace-only input is a no-op.
5. **Auto-scroll** the messages container to its bottom whenever `messages` changes — common chat-UI pattern, `useEffect` + `ref.current.scrollTop = ref.current.scrollHeight`.
6. **Typing indicator** for the placeholder assistant message: when `content === ""` and `status === "streaming"`, render three animated dots instead of an empty bubble.
7. **Error path:** any thrown error during `fetch` or stream consumption → `toast.error(...)`; mark the placeholder assistant message as `status: "error"` (subdued style). The `error` event from the server also triggers a toast.
8. **Sign-out button** stays visible in a thin header above the messages — preserves the existing flow until a global app-shell header lands later.

- [ ] **Step 1: Acknowledge the decisions** — no code yet, no commit. They flow into Task 3's component code.

---

## Task 2: `parseChatStream` async generator (TDD, pure)

**Files:** `lib/ai/streaming.ts`, `lib/ai/streaming.test.ts`.

Symmetric counterpart to `encodeChatStreamEvent`. Pure async generator over a `ReadableStream<Uint8Array>` — works in browser, Node, and tests.

- [ ] **Step 1: Append failing tests to `lib/ai/streaming.test.ts`**

Add at the end of the file (outside the existing `describe`):

```typescript
import { parseChatStream } from "./streaming";

function streamFromString(s: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(s));
      controller.close();
    },
  });
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const ev of parseChatStream(stream)) events.push(ev);
  return events;
}

describe("parseChatStream", () => {
  it("yields a single event from a complete NDJSON line", async () => {
    const events = await collect(streamFromString('{"type":"done"}\n'));
    expect(events).toEqual([{ type: "done" }]);
  });

  it("yields multiple events from one chunk", async () => {
    const events = await collect(
      streamFromString('{"type":"start","sessionId":"s1"}\n{"type":"text","text":"hi"}\n{"type":"done"}\n'),
    );
    expect(events).toEqual([
      { type: "start", sessionId: "s1" },
      { type: "text", text: "hi" },
      { type: "done" },
    ]);
  });

  it("reassembles a JSON object split across chunk boundaries", async () => {
    const events = await collect(
      streamFromChunks(['{"type":"text",', '"text":"par', 'tial"}\n']),
    );
    expect(events).toEqual([{ type: "text", text: "partial" }]);
  });

  it("yields a final event that lacks a trailing newline", async () => {
    // Some upstreams omit the trailing \n on the last line.
    const events = await collect(streamFromString('{"type":"done"}'));
    expect(events).toEqual([{ type: "done" }]);
  });

  it("skips blank lines", async () => {
    const events = await collect(
      streamFromString('{"type":"start","sessionId":"s1"}\n\n{"type":"done"}\n'),
    );
    expect(events).toEqual([
      { type: "start", sessionId: "s1" },
      { type: "done" },
    ]);
  });

  it("throws on malformed JSON so the UI can surface the error", async () => {
    await expect(collect(streamFromString("not json\n"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/ai/streaming.test.ts 2>&1 | tail -10
```
Expected: import-resolution failure for `parseChatStream` from `./streaming`.

- [ ] **Step 3: Add `parseChatStream` to `lib/ai/streaming.ts`**

Append below the existing `encodeChatStreamEvent`:

```typescript
const sharedDecoder = new TextDecoder();

/**
 * Async generator that parses an NDJSON `ReadableStream<Uint8Array>` into
 * `ChatStreamEvent`s. Symmetric with `encodeChatStreamEvent` — the wire
 * round-trips cleanly. Reassembles JSON objects split across chunk
 * boundaries and tolerates a missing trailing newline on the last line.
 *
 * Throws on malformed JSON so the consumer can surface a clear error
 * instead of silently dropping a half-parsed event.
 */
export async function* parseChatStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<ChatStreamEvent> {
  const reader = body.getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += sharedDecoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as ChatStreamEvent;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as ChatStreamEvent;
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test lib/ai/streaming.test.ts 2>&1 | tail -5
```
Expected: 12/12 passing (6 existing encoder + 6 new parser).

- [ ] **Step 5: Biome**

```bash
pnpm biome check --write lib/ai/streaming.ts lib/ai/streaming.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/streaming.ts lib/ai/streaming.test.ts
git commit -m "feat(ai): add parseChatStream NDJSON decoder for /api/chat consumers"
```

---

## Task 3: ChatClient component

**Files:** `app/(app)/chat/chat-client.tsx`.

The whole UI lives here. Follows the design decisions from Task 1.

- [ ] **Step 1: Create the client component**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { parseChatStream } from "@/lib/ai/streaming";
import { Loader2Icon, SendIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "error";
};

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on every messages change (covers both the optimistic
  // append and every per-token append during streaming).
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isStreaming) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setInput("");
    setIsStreaming(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      status: "complete",
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId: sessionId ?? undefined,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      for await (const event of parseChatStream(response.body)) {
        if (event.type === "start") {
          setSessionId(event.sessionId);
        } else if (event.type === "text") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + event.text } : m,
            ),
          );
        } else if (event.type === "done") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "complete" } : m)),
          );
        } else {
          // event.type === "error" — server-side stream error. The route
          // already persisted the partial with a marker; just notify the user.
          toast.error(event.message || "Something went wrong");
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)),
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't reach the chat service";
      toast.error(message);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Submit through the form so handleSubmit's gating runs.
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-border border-t bg-cream px-6 py-4"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask about cervical health…"
            rows={1}
            className="border-border placeholder:text-muted-gray text-charcoal min-h-[44px] flex-1 resize-none rounded-lg border bg-white/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-charcoal/10 disabled:opacity-60"
          />
          <Button type="submit" disabled={isStreaming || !input.trim()} aria-label="Send">
            {isStreaming ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-muted-gray pt-12 text-center text-sm">
      Ask a cervical-health question to get started. Replies are not a substitute for a clinician's
      advice — see a doctor for symptoms or specific situations.
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "text-charcoal border-border border bg-white/40"
            : isError
              ? "text-muted-gray border-border border bg-white/20"
              : "text-charcoal border-border border bg-white/60"
        }`}
      >
        {message.content || (isStreaming ? <TypingDots /> : null)}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Assistant is typing">
      <span className="bg-muted-gray inline-block size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
      <span className="bg-muted-gray inline-block size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
      <span className="bg-muted-gray inline-block size-1.5 animate-bounce rounded-full" />
    </span>
  );
}
```

- [ ] **Step 2: Biome**

```bash
pnpm biome check --write app/\(app\)/chat/chat-client.tsx
```

- [ ] **Step 3: tsc spot-check**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```
Expected: clean. (No commit yet — page wiring lands together with the client in Task 4 for a coherent diff.)

---

## Task 4: Server-component page wrapper

**Files:** `app/(app)/chat/page.tsx`.

Replaces the "Coming soon" placeholder. Renders the sign-out button (existing) + the new `ChatClient`. Auth is already enforced by middleware — nothing extra to do server-side here.

- [ ] **Step 1: Replace `app/(app)/chat/page.tsx`**

```tsx
import { ChatClient } from "./chat-client";
import { SignOutButton } from "./sign-out-button";

export default function ChatPage() {
  return (
    <main className="bg-cream flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-charcoal text-base font-medium">Chat</h1>
        <SignOutButton />
      </header>
      <ChatClient />
    </main>
  );
}
```

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check --write app/\(app\)/chat/page.tsx
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 3: Commit (page + client together)**

```bash
git add app/\(app\)/chat/page.tsx app/\(app\)/chat/chat-client.tsx
git commit -m "feat(chat): replace placeholder page with streaming chat UI

Single-conversation surface that consumes the NDJSON stream from #22:
optimistic user message, typing indicator until the first token, per-token
append for the assistant message, error toasts on stream/error events.

Out of scope (handled in later tickets): session list/switching (#24),
source citations (#28), markdown rendering. Component-level tests are
omitted per project policy — manual browser verification is the bar."
```

---

## Task 5: DRY the route test reader

**Files:** `tests/api/chat.test.ts`.

The route test currently has an inline `readNdjsonStream` helper that reimplements `parseChatStream`. Now that the parser is a real export, swap the helper to use it.

- [ ] **Step 1: Replace the inline helper**

In `tests/api/chat.test.ts`, change the import at the top to add `parseChatStream`:

```typescript
import { parseChatStream } from "@/lib/ai/streaming";
```

…and replace the existing `readNdjsonStream` body with:

```typescript
async function readNdjsonStream(response: Response): Promise<unknown[]> {
  if (!response.body) throw new Error("response has no body stream");
  const events: unknown[] = [];
  for await (const ev of parseChatStream(response.body)) events.push(ev);
  return events;
}
```

(Same external behavior; uses the shared parser.)

- [ ] **Step 2: Re-run the chat-route tests**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -5
```
Expected: 11/11 passing.

- [ ] **Step 3: Biome + commit**

```bash
pnpm biome check --write tests/api/chat.test.ts
git add tests/api/chat.test.ts
git commit -m "test(api): use shared parseChatStream in chat-route NDJSON reader"
```

---

## Task 6: Manual browser verification

**Files:** none — running app verification.

Per `CLAUDE.md` §"Doing tasks": *"For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete."*

- [ ] **Step 1: Start the dev server**

In one terminal:
```bash
pnpm dev
```
Expected: starts cleanly, no compile errors. If it errors with anything related to `chat-client.tsx`, fix before continuing.

- [ ] **Step 2: Confirm the local Supabase stack is up and seeded**

```bash
supabase status
```
Expected: running. If not: `supabase start && supabase db reset`.

- [ ] **Step 3: Sign in**

Open `http://localhost:3000/login` in a browser, log in with a test user from `seed.sql` (or register a new one at `/register`). After auth, you should land on `/chat`.

- [ ] **Step 4: Verify the golden path**

In the chat surface:
1. Empty state copy is visible
2. Type "What is HPV?" and press Enter
3. The user message appears immediately, right-aligned
4. A typing-dots indicator appears in the assistant bubble
5. Tokens stream in progressively (you should see partial text accumulating)
6. The dots disappear once the first token arrives; the bubble fills out
7. Composer re-enables when streaming finishes
8. Send a follow-up like "Is it transmitted sexually?" — the reply should reference the prior context (multi-turn from #21 wiring)

- [ ] **Step 5: Verify edge cases**

1. Press Shift+Enter inside the composer — should insert a newline, not submit
2. Press Enter on an empty composer — should be a no-op (button disabled, nothing sent)
3. Press the Send button while a stream is in flight — should be disabled (button + textarea both)
4. Manually break things: open DevTools, throttle the network, or stop the dev server mid-stream. Expected: an error toast at the bottom and the assistant bubble flips to the subdued (error) style. (If you can't easily simulate this, skip and document in the PR body.)

- [ ] **Step 6: Capture evidence for the PR body**

A 5–10 second screen recording (or 2–3 screenshots of the streaming flow) goes a long way. Optional but very helpful for the merger.

If any step doesn't work, return to Task 3 — fix and re-verify before moving on.

---

## Task 7: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 128 baseline + **6 new** (`parseChatStream`) = 134.

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 3: Commit the plan file**

```bash
git add docs/superpowers/plans/2026-05-01-epic3-chat-ui-page.md
git commit -m "docs(plan): add Epic 3 #23 chat UI implementation plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/chat-ui-23
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/chat-ui-23 \
  --title "feat(chat): #23 — chat UI page (message list + streaming composer)" \
  --body "$(cat <<'EOF'
## Summary
- Replace the `/chat` placeholder with a real chat UI: message list + composer + streaming consumer
- Add `parseChatStream(body): AsyncIterable<ChatStreamEvent>` to `lib/ai/streaming.ts` — symmetric with #22's `encodeChatStreamEvent` (round-trip the wire format with no special handling)
- DRY the chat-route test reader to use the new shared parser

## Behavior
- Single-conversation v1: page-load is a fresh session; the route auto-creates a `chat_sessions` row on the first POST. Session list / switching is #24
- Optimistic user message + assistant placeholder on submit
- Typing-dots indicator until the first token arrives; per-token append while streaming
- Enter submits, Shift+Enter inserts a newline; composer disables during streaming
- Auto-scroll to bottom on every message change (covers optimistic append + each token)
- Error toast on `error` events from the server OR client-side fetch failures; the assistant bubble flips to a subdued style
- Sign-out button kept in a thin header (preserves the existing flow until a global app-shell header lands later)

## Out of scope
- Session list / switching → #24
- Source citation chips → #28
- Markdown rendering → not a v1 ticket; messages render as plain text with `whitespace-pre-wrap`
- Component-level Vitest tests → project policy is to skip these and rely on manual browser verification (`CLAUDE.md` §Workflow). The pure `parseChatStream` IS unit-tested

## Tests added
- `parseChatStream` (6): single event, multiple events in one chunk, JSON object split across chunk boundaries, missing trailing newline, blank lines skipped, malformed JSON throws

## Manual verification
Per `CLAUDE.md`: dev server started, signed in as a test user, sent a message, watched tokens stream in. Multi-turn follow-up confirms the history wiring from #21. Edge cases verified: Shift+Enter newline, Enter on empty composer is a no-op, button disabled during streaming.

## Test plan
- [x] `pnpm test` — full suite green (134/134 with real Supabase env)
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] Manual browser verification

Closes #23. Sprint 2 (Epic 3 M-priority) ends here.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #23 maps to a Task in this plan or a "✅ Pre-existing" row.
- **Placeholder scan:** no TBD/TODO. The "out of scope" callouts (markdown rendering, component tests) cite specific tickets or project policy from `CLAUDE.md`.
- **Type consistency:** the client component's `event.type` discrimination uses the same union (`start | text | done | error`) as `ChatStreamEvent` from `lib/ai/streaming.ts` — no parallel type definition. The state shape (`ChatMessage`) is local to the client because no other module needs it (yet).
- **Streaming-loop correctness:** `for await (const event of parseChatStream(response.body))` runs to completion regardless of the terminal event type, so finalizers (`setIsStreaming(false)` in the `finally`) always fire. The `for await` + try/catch/finally pattern matches what the route uses on the server side.
- **Failure-mode honesty:** the AC says "basic error toast on failure" — implemented for both server-side `error` events AND client-side fetch failures. The assistant placeholder gets a subdued style on error so the conversation history is consistent (matches the persistence-with-marker policy from #22).
