# Epic 3 — #21 Multi-Turn Context Window Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small `lib/ai/context-window.ts` module with two pure functions — `trimToBudget(messages, budget)` and `loadRecentMessages(supabase, sessionId, budget)` — and wire `loadRecentMessages` into `/api/chat` so the route sends the full session history (already in the DB after #20) to Claude on every call. Trimming uses character count as a token proxy for v1.

**Architecture:** The user message is already persisted before the Claude call (per #20). After the user-message insert, the route loads the full session history (which now includes that just-inserted user turn) ordered by `created_at ASC`, trims it to a configurable character budget, and passes the result as Claude's `messages` array. The system prompt continues to ride on `system`, never in `messages` — so "system prompt is never dropped" is a structural property, not something `trimToBudget` has to enforce. Trimming drops oldest messages first; if the trim leaves a leading `assistant` message, that's also dropped (Claude's first message must be `user`).

**Tech Stack:** TypeScript strict, `@supabase/supabase-js` types via `@/types/supabase`, `@anthropic-ai/sdk` `MessageParam`, Vitest (mostly jsdom; `node` env for the route test), Biome.

**Issue:** [#21](https://github.com/Zoeyyhc/cervix-assistant/issues/21)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-05
**Depends on:** #17 (chat tables), #18 (Anthropic client + system prompt), #19 (route), #20 (persistence) — all on `main`.

---

## Pre-existing scaffolding

- ✅ `chat_messages` table with composite `(session_id, created_at)` index (#17)
- ✅ User and assistant messages persisted on every POST (#20) — so by the time we load history, the latest user turn is already in the DB
- ✅ `app/api/chat/route.ts` orchestration (#20)

## Gaps vs #21 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `lib/ai/context-window.ts` exports `loadRecentMessages(sessionId, budget)` and `trimToBudget(messages, budget)` | ❌ | **Tasks 1, 2** |
| Budget expressed as approximate character count for v1 | ❌ | Task 1 — `BUDGET_CHARS` constant (default 32000 ≈ 8k tokens) |
| Oldest messages dropped first; system prompt always kept | ❌ for trim; ✅ structurally for system prompt (never in `messages`) | Task 1 |
| `/api/chat` uses the helper before calling Claude | ❌ | **Task 3** |
| Vitest unit tests cover: empty, under-budget, exact-budget, over-budget, role-ordering | ❌ | Task 1 |

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/ai/context-window.ts` | **Create** | Exports `ChatHistoryMessage` type, `BUDGET_CHARS` default constant, `trimToBudget()` pure function, `loadRecentMessages()` async function |
| `lib/ai/context-window.test.ts` | **Create** | Vitest unit tests for `trimToBudget` (pure, jsdom env fine) and `loadRecentMessages` (mocked Supabase chain). |
| `app/api/chat/route.ts` | **Modify** | After persisting the user message, call `loadRecentMessages` and pass the result to `anthropic.messages.create` instead of just `[{ role: "user", content: parsed.data.message }]`. |
| `tests/api/chat.test.ts` | **Modify** | Extend `mockSupabaseChain` to also mock `select(...).eq(...).order(...)` for the messages-history read. Update existing happy-path test to assert the full history is passed; add one test that verifies a multi-turn session sends old turns to Claude. |

**Files not touched:**
- `supabase/migrations/*` — `chat_messages_session_created_idx` already exists from #17, which is exactly what `loadRecentMessages` needs.
- `lib/ai/anthropic.ts`, `lib/ai/system-prompt.ts` — reused unchanged.
- `lib/validations/chat.ts` — request body shape doesn't change.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/multi-turn-context-window-21`.

- [ ] **Step B: Confirm #20's surface is on `main`**

```bash
grep -n "session_id, role, content" app/api/chat/route.ts
```
Expected: hits — the route already persists user + assistant messages.

- [ ] **Step C: Baseline tests green**

```bash
pnpm test 2>&1 | tail -5
```
Expected: 107/107 with real Supabase env, or 95/107 (12 skipped) without.

- [ ] **Step D: Biome + tsc clean**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

---

## Task 1: `trimToBudget` (TDD, pure function)

**Files:** `lib/ai/context-window.ts`, `lib/ai/context-window.test.ts`.

This is the core algorithmic piece. Pure function, no I/O — easy to TDD comprehensively.

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/context-window.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { type ChatHistoryMessage, trimToBudget } from "./context-window";

const u = (content: string): ChatHistoryMessage => ({ role: "user", content });
const a = (content: string): ChatHistoryMessage => ({ role: "assistant", content });

describe("trimToBudget", () => {
  it("returns an empty array unchanged", () => {
    expect(trimToBudget([], 1000)).toEqual([]);
  });

  it("returns the input unchanged when total chars fit the budget", () => {
    const msgs = [u("hi"), a("hello"), u("how are you")];
    // total content chars: 2 + 5 + 11 = 18
    expect(trimToBudget(msgs, 1000)).toEqual(msgs);
  });

  it("returns the input unchanged when total chars equal the budget exactly", () => {
    const msgs = [u("ab"), a("cd"), u("ef")];
    // 2 + 2 + 2 = 6
    expect(trimToBudget(msgs, 6)).toEqual(msgs);
  });

  it("drops oldest messages first when over budget", () => {
    const msgs = [
      u("aaaaaaaaaa"), // 10
      a("bbbbbbbbbb"), // 10
      u("cccccccccc"), // 10
      a("dddddddddd"), // 10
    ];
    // budget 25 → only the last two messages (20 total) fit; trying to add the third-newest
    // (the assistant block) would push to 30 > 25, so we stop.
    const result = trimToBudget(msgs, 25);
    expect(result).toEqual([msgs[2], msgs[3]]);
  });

  it("drops a leading 'assistant' message after trimming so the first role is 'user'", () => {
    const msgs = [
      u("aaaaa"), // 5
      a("bbbbbbbbbb"), // 10
      u("ccccc"), // 5
    ];
    // budget 18 → newest fits (5), next-newest fits (5+10=15), but the original first
    // (user, 5) would push to 20 > 18 → drop it. That leaves [assistant, user]. The leading
    // assistant must be dropped too (Claude requires first role: 'user').
    const result = trimToBudget(msgs, 18);
    expect(result).toEqual([msgs[2]]);
  });

  it("preserves the original order of kept messages", () => {
    const msgs = [u("a"), a("b"), u("c"), a("d"), u("e")];
    const result = trimToBudget(msgs, 100); // all fit
    expect(result).toEqual(msgs);
  });

  it("never returns a result that starts with 'assistant'", () => {
    // Pathological case: only assistant messages.
    const msgs = [a("foo"), a("bar")];
    expect(trimToBudget(msgs, 1000)).toEqual([]);
  });

  it("returns at most one message when budget only fits the newest", () => {
    const msgs = [
      u("aaaaaaaaaa"), // 10
      a("bbbbbbbbbb"), // 10
      u("cccccccccc"), // 10
    ];
    // budget 10 → only the newest (10 chars) fits.
    expect(trimToBudget(msgs, 10)).toEqual([msgs[2]]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/ai/context-window.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./context-window`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/ai/context-window.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

/**
 * Default character budget for the messages array sent to Claude. Treated as an
 * approximate proxy for tokens (~4 chars/token) — close enough for v1 to bound
 * cost without pulling in a real tokenizer. Per-call override is supported via
 * the `budget` argument on both helpers.
 */
export const BUDGET_CHARS = 32_000;

/**
 * Drop oldest messages until the total content character count fits the budget.
 *
 * Properties:
 * - Pure: no I/O, no side effects.
 * - Stable: input array order is preserved among kept messages.
 * - Anchored on the newest: oldest messages are dropped first.
 * - Leading-assistant guard: if trimming leaves the first message as
 *   role: "assistant", that message is also dropped — Claude's API requires
 *   the first message to be role: "user".
 *
 * The system prompt is never in this list (it lives on the `system` field of
 * the Messages API), so it is structurally exempt from trimming.
 */
export function trimToBudget(
  messages: ChatHistoryMessage[],
  budget: number,
): ChatHistoryMessage[] {
  if (messages.length === 0) return [];

  // Walk from newest backward, accumulating until adding the next would exceed budget.
  const kept: ChatHistoryMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const cost = msg.content.length;
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(msg);
  }

  // Drop a leading assistant turn if trimming created one — Claude requires
  // the first message in `messages` to be a user turn.
  while (kept.length > 0 && kept[0].role !== "user") {
    kept.shift();
  }

  return kept;
}

/**
 * Load the user/assistant messages for a session in chronological order
 * (oldest first), then trim to the budget. Returned shape is exactly what the
 * Anthropic SDK expects in `messages.create({ messages })`.
 *
 * RLS scopes the read to the caller — passing this function a Supabase client
 * authenticated as user A cannot return user B's messages.
 */
export async function loadRecentMessages(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  budget: number = BUDGET_CHARS,
): Promise<ChatHistoryMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`loadRecentMessages: ${error.message}`);
  }

  // The DB role check constraint is ('user', 'assistant') so this cast is
  // safe — the schema (#17) prevents any other value.
  const messages = (data ?? []).map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
  }));

  return trimToBudget(messages, budget);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm test lib/ai/context-window.test.ts 2>&1 | tail -5
```
Expected: 8/8 passing.

- [ ] **Step 5: Biome**

```bash
pnpm biome check --write lib/ai/context-window.ts lib/ai/context-window.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/context-window.ts lib/ai/context-window.test.ts
git commit -m "feat(ai): add trimToBudget + loadRecentMessages context-window helpers"
```

---

## Task 2: Add `loadRecentMessages` tests with a mocked Supabase chain

**Files:** `lib/ai/context-window.test.ts` (extend).

Task 1's commit already shipped `loadRecentMessages` — but the only test coverage so far is for `trimToBudget`. Add unit tests that verify the function calls Supabase with the right shape and trims the result.

- [ ] **Step 1: Extend the test file**

Append to `lib/ai/context-window.test.ts`:

```typescript
import { vi } from "vitest";
import { loadRecentMessages } from "./context-window";

type SelectChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
};

function mockSupabaseSelect(rows: Array<{ role: string; content: string }> | null, error: Error | null = null) {
  const order = vi.fn().mockResolvedValue({ data: rows, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const supabase = { from } as unknown as Parameters<typeof loadRecentMessages>[0];
  return { supabase, from, select, eq, order };
}

describe("loadRecentMessages", () => {
  it("queries chat_messages by session_id ordered by created_at ASC", async () => {
    const { supabase, from, select, eq, order } = mockSupabaseSelect([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);

    const result = await loadRecentMessages(supabase, "session-x", 1000);

    expect(from).toHaveBeenCalledWith("chat_messages");
    expect(select).toHaveBeenCalledWith("role, content");
    expect(eq).toHaveBeenCalledWith("session_id", "session-x");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("returns an empty array when the session has no messages", async () => {
    const { supabase } = mockSupabaseSelect([]);
    const result = await loadRecentMessages(supabase, "session-empty", 1000);
    expect(result).toEqual([]);
  });

  it("trims to the budget when the history is too large", async () => {
    const { supabase } = mockSupabaseSelect([
      { role: "user", content: "aaaaaaaaaa" }, // 10
      { role: "assistant", content: "bbbbbbbbbb" }, // 10
      { role: "user", content: "cccccccccc" }, // 10
    ]);
    const result = await loadRecentMessages(supabase, "s", 10);
    expect(result).toEqual([{ role: "user", content: "cccccccccc" }]);
  });

  it("uses BUDGET_CHARS by default when no budget is passed", async () => {
    const { supabase } = mockSupabaseSelect([{ role: "user", content: "hi" }]);
    const result = await loadRecentMessages(supabase, "s");
    expect(result).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws if the underlying query errors", async () => {
    const { supabase } = mockSupabaseSelect(null, new Error("db down"));
    await expect(loadRecentMessages(supabase, "s", 1000)).rejects.toThrow("db down");
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test lib/ai/context-window.test.ts 2>&1 | tail -5
```
Expected: 13/13 passing (8 for `trimToBudget` + 5 for `loadRecentMessages`).

- [ ] **Step 3: Biome + commit**

```bash
pnpm biome check --write lib/ai/context-window.test.ts
git add lib/ai/context-window.test.ts
git commit -m "test(ai): cover loadRecentMessages query shape and trim integration"
```

---

## Task 3: Wire `loadRecentMessages` into `/api/chat`

**Files:** `app/api/chat/route.ts`, `tests/api/chat.test.ts`.

The user message is already persisted **before** the Claude call (#20 invariant). So loading after that insert returns history that includes the just-asked question — exactly what we want to send to Claude.

- [ ] **Step 1: Update the route**

Edit `app/api/chat/route.ts`. Add the import at the top:

```typescript
import { loadRecentMessages } from "@/lib/ai/context-window";
```

In the route body, between step 4 (user-message insert) and step 5 (Claude call), load the history. Then replace the existing `messages: [{ role: "user", content: parsed.data.message }]` with the loaded history:

```typescript
  // 5. Load the session's history so Claude has the full conversation context.
  // The user message we just inserted is included in this read — that's how it
  // ends up in the messages array sent to Claude (no manual append needed).
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

  // 6. Call Claude
  let reply: string;
  try {
    const anthropic = getAnthropicClient();
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: history,
    });
    // ... existing extraction
```

(Re-number the existing comments — what was step 5 becomes step 6, and step 6 becomes step 7. Or leave them alphabetical — pick whichever reads cleaner; the executor's call.)

- [ ] **Step 2: Extend the chat-route test mock**

Open `tests/api/chat.test.ts`. The existing `mockSupabaseChain` only mocks `from(...).insert(...)` and `from(...).insert(...).select(...).single()`. Extend it to also mock the read chain `from("chat_messages").select(...).eq(...).order(...)`. Update the `from` function so the `chat_messages` branch returns both `insert` AND `select`:

```typescript
type SupabaseChainOpts = {
  newSessionId?: string;
  sessionInsertError?: Error | null;
  messageInsertError?: Error | null;
  historyRows?: Array<{ role: string; content: string }>;
  historyError?: Error | null;
};

function mockSupabaseChain(opts: SupabaseChainOpts = {}): SupabaseFromMock {
  // ... existing session mock setup unchanged ...
  // ... existing messageInsert mock unchanged ...

  const historyOrder = vi.fn().mockResolvedValue({
    data: opts.historyRows ?? [],
    error: opts.historyError ?? null,
  });
  const historyEq = vi.fn().mockReturnValue({ order: historyOrder });
  const messageSelect = vi.fn().mockReturnValue({ eq: historyEq });

  const from = vi.fn((table: string) => {
    if (table === "chat_sessions") return { insert: sessionInsert };
    if (table === "chat_messages") return { insert: messageInsert, select: messageSelect };
    throw new Error(`Unmocked table: ${table}`);
  });

  return { from, sessionInsert, sessionSingle, messageInsert, historyOrder };
}
```

Update the `SupabaseFromMock` type alias to include `historyOrder`. The default `historyRows: []` keeps the existing tests passing — Claude is still called, just with an empty `messages` array … wait, **actually** the user message is inserted before history load, so the default has to **at least** include the just-inserted user turn for the Claude call to be valid. Update the helper's default to `[{ role: "user", content: <something> }]` — or, simpler, have each test pass `historyRows` explicitly.

The pragmatic move: in the helper, default `historyRows` to `undefined` and have each test that exercises the success path pass an explicit `historyRows: [{ role: "user", content: "Hi" }]`. This makes the test intent obvious and avoids "magic" defaults.

- [ ] **Step 3: Update the existing happy-path test**

Replace the assertion on `messages` with:

```typescript
expect(callArgs[0].messages).toEqual([{ role: "user", content: "Hi" }]);
```

…and configure the chain:

```typescript
const fromChain = mockSupabaseChain({
  newSessionId: "22222222-2222-4222-8222-222222222222",
  historyRows: [{ role: "user", content: "Hi" }],
});
```

(The history that's loaded reflects what's in the DB after the insert — for this test, just the single user message we just wrote.)

- [ ] **Step 4: Add a multi-turn history test**

After the happy-path test, add:

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
  const anthropic = mockAnthropic("It's transmitted via skin-to-skin contact...");
  vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

  await POST(
    postRequest({
      message: "How is it transmitted?",
      sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
    }),
  );

  const [callArgs] = anthropic.messages.create.mock.calls;
  expect(callArgs[0].messages).toEqual([
    { role: "user", content: "What is HPV?" },
    { role: "assistant", content: "HPV stands for human papillomavirus..." },
    { role: "user", content: "How is it transmitted?" },
  ]);
});
```

- [ ] **Step 5: Update the other tests that hit the success path**

The existing **"with a provided sessionId, reuses it"** test calls Claude — it needs `historyRows`. Add `historyRows: [{ role: "user", content: "Hi" }]` to its `mockSupabaseChain` opts.

The **"logs but does not fail the request if the assistant-message insert errors"** test also reaches Claude — same fix.

The 401/400-validation/400-invalid-JSON tests bail before the history load, so they're unaffected.

The 500-session-create-failure and 404-RLS-denial tests bail before the history load, so they're unaffected.

The 500-Anthropic-error test reaches the Claude call, so it needs `historyRows: [{ role: "user", content: "Hi" }]`.

- [ ] **Step 6: Add a test for the history-load-failure path**

```typescript
test("returns 500 when loading session history fails", async () => {
  const fromChain = mockSupabaseChain({
    historyError: new Error("history query exploded"),
  });
  vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const res = await POST(postRequest({ message: "Hi" }));

  expect(res.status).toBe(500);
  expect(getAnthropicClient).not.toHaveBeenCalled();
  errSpy.mockRestore();
});
```

- [ ] **Step 7: Run the full chat-route test file to confirm everything passes**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -5
```
Expected: 11/11 passing (9 existing + 2 new: multi-turn history + history-load-failure).

- [ ] **Step 8: Biome + tsc**

```bash
pnpm biome check --write app/api/chat/route.ts tests/api/chat.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "feat(api): load and trim session history before each Claude call

/api/chat now loads the full session history (oldest first, trimmed to a
character budget) and sends it as Claude's messages array. The user message
inserted in step 4 is part of that load — no manual append is needed.

History-load failure surfaces as a 500 with the error logged server-side.
The system prompt continues to ride on the system field, so trimming is
naturally exempt from touching it."
```

---

## Task 4: Final verification + push + PR

- [ ] **Step 1: Full test sweep (with real Supabase env)**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: previously-passing count + **15 new tests** (8 trim + 5 loadRecentMessages + 2 route).

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 3: Commit the plan file**

```bash
git add docs/superpowers/plans/2026-05-01-epic3-multi-turn-context-window.md
git commit -m "docs(plan): add Epic 3 #21 multi-turn context window implementation plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/multi-turn-context-window-21
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/multi-turn-context-window-21 \
  --title "feat(ai): #21 — multi-turn context window management" \
  --body "$(cat <<'EOF'
## Summary
- Add `lib/ai/context-window.ts` — exports `trimToBudget()` (pure) + `loadRecentMessages(supabase, sessionId, budget?)` (async) + `BUDGET_CHARS = 32_000` default
- `/api/chat` loads the session's full history after persisting the user message, trims to budget, and sends the result as Claude's `messages` array — so multi-turn conversations actually work end-to-end
- History-load failure surfaces as 500 with the error logged server-side
- The system prompt continues to ride on `system` (never in `messages`), so it is structurally exempt from trimming — no special-casing needed

## Trim algorithm
- Walks from newest backward, accumulating until adding the next message would exceed the character budget
- Drops a leading `assistant` message if trimming created one (Claude's API requires the first message to be `user`)
- Pure, stable, no I/O

## Tests added
- `trimToBudget` (8): empty, under-budget, exact-budget, over-budget oldest-first, leading-assistant guard, order preservation, all-assistants pathological case, single-message edge
- `loadRecentMessages` (5): query shape, empty result, trims to budget, default budget, throws on query error
- Route (2 new): multi-turn history sent to Claude, 500 on history-load failure
- Modified existing route tests to pass explicit `historyRows` when they exercise the success path

## Test plan
- [x] `pnpm test` — full suite green (~122/122 with real Supabase env)
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean

Closes #21.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #21 maps to a Task in this plan — `trimToBudget` (Task 1), `loadRecentMessages` with all four trim cases including empty (Tasks 1+2), `/api/chat` integration (Task 3), unit tests covering all five spec cases.
- **Placeholder scan:** no TBD/TODO. Concrete numbers throughout: `BUDGET_CHARS = 32_000`, exact char counts in test inputs (`"aaaaaaaaaa"` = 10), exact UUIDs in route test sessionIds.
- **Type consistency:** `ChatHistoryMessage = { role: "user" | "assistant"; content: string }` is used identically in `trimToBudget` (input/output), `loadRecentMessages` (return type), and the route's `messages` parameter to `anthropic.messages.create`. The DB role-check constraint at `('user', 'assistant')` makes the `as` cast in `loadRecentMessages` safe.
- **Trim correctness:** the leading-assistant guard handles the edge case the existing PR-shaped trim algorithm in the wild often misses ("oldest-first" logically should preserve role alternation, but a pure char-budget walk doesn't — so we explicitly fix it post-hoc). The "all-assistants" pathological test ensures the guard runs to exhaustion.
- **Order in the route:** loading history AFTER persisting the user message is deliberate — it means we don't have to manually append the new turn to whatever we loaded. The DB read sees the just-inserted row because both ops use the same connection-bound RLS scope.
