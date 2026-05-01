# Epic 3 — #20 Conversation History Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer DB persistence onto the `/api/chat` route from #19 — every successful POST creates (or reuses) a `chat_sessions` row and writes both the user and assistant `chat_messages`. Returns `{ sessionId, reply }` instead of just `{ reply }`. RLS does the per-user isolation; the route is naive about ownership beyond surfacing RLS errors as 404s.

**Architecture:** The route uses the same cookie-aware Supabase server client as the auth gate, so writes inherit the current user's RLS scope automatically — no service role, no explicit ownership checks. Writes happen in a deliberate order: **user message before** the Claude call (so the user's question is durable even if Claude fails), **assistant message after** (so the reply is captured atomically with its origin). Cross-user isolation is already verified by `tests/db/rls-policies.test.ts` (10 chat-table cases, including write/read denial across users) — this plan reuses that coverage rather than duplicating it. The route's orchestration logic is unit-tested with a chainable Supabase mock.

**Tech Stack:** Next.js 14 App Router POST handler, Zod, `@supabase/ssr` server client, `@anthropic-ai/sdk`, Vitest (`node` env), Biome.

**Issue:** [#20](https://github.com/Zoeyyhc/cervix-assistant/issues/20)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-04
**Depends on:** #17 (chat tables + RLS — on main) and #19 (`/api/chat` route — on main)

---

## Pre-existing scaffolding

- ✅ `chat_sessions` and `chat_messages` tables with owner RLS (#17, on main)
- ✅ `app/api/chat/route.ts` with auth, validation, Claude call, error logging (#19, on main)
- ✅ `lib/validations/chat.ts` with `chatRequestSchema` (#19, on main)
- ✅ Cross-user isolation verified by `tests/db/rls-policies.test.ts` (lines 148–249 — 10 chat-table cases including write/read denial)

## Gaps vs #20 acceptance criteria

| AC | Status | Action |
|---|---|---|
| Zod schema extended: `{ message, sessionId? }` | ❌ | **Task 1** |
| If no `sessionId`, create a new session with `title = null` | ❌ | **Task 2** |
| Write user message **before** calling Claude | ❌ | Task 2 |
| Write assistant message **after** receiving the reply | ❌ | Task 2 |
| Response shape: `{ sessionId, reply }` | ❌ | Task 2 |
| RLS verified: a second user cannot read another user's session | ✅ Already verified via `rls-policies.test.ts` | None — referenced in PR body |
| Vitest test against local Supabase: session + 2 messages exist | ⚠️ Partial — see decision note below | Task 2 covers via mocks; existing RLS suite covers DB-level guarantees |

**Test-strategy decision:** the spec calls for "Vitest test against local Supabase". The route handler relies on cookie-bound auth via `next/headers`, which can't be exercised cleanly in a Vitest test (no real request context, no cookie store). Two paths:

- **(a)** Refactor the persistence logic out of the route into a pure function (`persistTurn(supabase, userId, sessionId, userMsg, assistantMsg)`) and integration-test that against real Supabase.
- **(b)** Unit-test the route's orchestration with a chainable Supabase mock; rely on `tests/db/rls-policies.test.ts` for the DB-level isolation guarantee.

This plan picks **(b)** — it avoids a refactor introduced for testability alone, the DB-level guarantee is already covered, and the unit tests cover the orchestration order (user-msg-before-Claude, assistant-msg-after) which is the actual new behavior. If we later refactor for streaming (#22) and end up with a natural seam for `persistTurn`, the integration test becomes cheap and we can add it then.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/validations/chat.ts` | **Modify** | Add optional `sessionId` (UUID) to `chatRequestSchema`; export updated `ChatRequest` type |
| `lib/validations/chat.test.ts` | **Modify** | Add 3 cases: missing sessionId valid, valid UUID accepted, invalid string rejected |
| `app/api/chat/route.ts` | **Modify** | Resolve session id (create-if-missing), write user msg, call Claude, write assistant msg, return `{ sessionId, reply }` |
| `tests/api/chat.test.ts` | **Modify** | Update happy-path to assert new shape + DB call order; add tests for: with-sessionId reuse, session-create failure, user-msg insert RLS denial → 404, assistant-msg insert failure logged but reply returned |

**Files not touched:**
- `supabase/migrations/*` — schema is already on main (#17)
- `tests/db/rls-policies.test.ts` — already covers cross-user isolation
- `lib/ai/anthropic.ts`, `lib/ai/system-prompt.ts`, `lib/supabase/server.ts` — reused unchanged

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/conversation-history-persistence-20`.

- [ ] **Step B: Confirm #17 + #19 surfaces are on `main`**

```bash
ls app/api/chat/route.ts lib/validations/chat.ts && grep -n "chat_messages_session_created_idx\|chat_sessions" supabase/migrations/*.sql | head -5
```
Expected: route + schema files exist; migrations include the chat tables and the composite index.

- [ ] **Step C: Baseline tests green**

```bash
pnpm test 2>&1 | tail -5
```
Expected: 100/100 with real Supabase env, or 88/100 (12 skipped) without.

- [ ] **Step D: Biome + tsc clean**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

---

## Task 1: Extend the schema with optional `sessionId` (TDD)

**Files:** `lib/validations/chat.ts`, `lib/validations/chat.test.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/validations/chat.test.ts` (inside the existing `describe("chatRequestSchema")` block):

```typescript
  it("accepts a valid UUID sessionId", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hi",
      sessionId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a body without sessionId (optional)", () => {
    const result = chatRequestSchema.safeParse({ message: "Hi" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID sessionId", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hi",
      sessionId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/validations/chat.test.ts 2>&1 | tail -10
```
Expected: the new "rejects a non-UUID sessionId" case fails (the others may pass coincidentally because the current schema ignores extra fields, but the rejection case is the load-bearing one).

- [ ] **Step 3: Update `lib/validations/chat.ts`**

Replace the schema definition with:

```typescript
export const chatRequestSchema = z.object({
  message: z
    .string()
    .min(1, "message must not be empty")
    .max(4000, "message must be 4000 characters or fewer"),
  sessionId: z.string().uuid("sessionId must be a UUID").optional(),
});
```

(`ChatRequest` type still derives via `z.infer<typeof chatRequestSchema>` — no separate change needed.)

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm test lib/validations/chat.test.ts 2>&1 | tail -5
```
Expected: 10/10 passing (was 7/7 + 3 new).

- [ ] **Step 5: Biome**

```bash
pnpm biome check --write lib/validations/chat.ts lib/validations/chat.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/validations/chat.ts lib/validations/chat.test.ts
git commit -m "feat(validations): extend chatRequestSchema with optional sessionId UUID"
```

---

## Task 2: Persistence in the route handler (TDD)

**Files:** `app/api/chat/route.ts`, `tests/api/chat.test.ts`.

This task is the bulk of #20. Test changes and route changes are tightly coupled, so they land in one commit.

- [ ] **Step 1: Update the existing happy-path test + add new tests**

Open `tests/api/chat.test.ts`. Add a chainable Supabase mock helper near the top (alongside the existing `mockSupabase` / `mockAnthropic`):

```typescript
type SupabaseFromMock = {
  from: ReturnType<typeof vi.fn>;
  sessionInsert: ReturnType<typeof vi.fn>;
  sessionSingle: ReturnType<typeof vi.fn>;
  messageInsert: ReturnType<typeof vi.fn>;
};

type SupabaseChainOpts = {
  newSessionId?: string;
  sessionInsertError?: Error | null;
  messageInsertError?: Error | null; // applied to BOTH user and assistant inserts
};

function mockSupabaseChain(opts: SupabaseChainOpts = {}): SupabaseFromMock {
  const newSessionId = opts.newSessionId ?? "new-session-id-1234";

  const sessionSingle = vi.fn().mockResolvedValue(
    opts.sessionInsertError
      ? { data: null, error: opts.sessionInsertError }
      : { data: { id: newSessionId }, error: null },
  );
  const sessionSelect = vi.fn().mockReturnValue({ single: sessionSingle });
  const sessionInsert = vi.fn().mockReturnValue({ select: sessionSelect });

  const messageInsert = vi.fn().mockResolvedValue({
    data: null,
    error: opts.messageInsertError ?? null,
  });

  const from = vi.fn((table: string) => {
    if (table === "chat_sessions") return { insert: sessionInsert };
    if (table === "chat_messages") return { insert: messageInsert };
    throw new Error(`Unmocked table: ${table}`);
  });

  return { from, sessionInsert, sessionSingle, messageInsert };
}
```

Update the existing `mockSupabase` helper to also expose a chainable `from`:

```typescript
function mockSupabase(
  user: { id: string } | null,
  fromChain: SupabaseFromMock = mockSupabaseChain(),
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: fromChain.from,
  };
}
```

(The existing tests that don't reach the `from()` call site — 401 no user, 400 invalid body, 400 invalid JSON — keep working because their default `fromChain` is never invoked. The 500-Anthropic-error test is updated below to exercise the user-message write that now happens before Claude.)

Update the existing **"returns 200"** test:

```typescript
  test("creates a new session, writes user+assistant messages, returns { sessionId, reply }", async () => {
    const fromChain = mockSupabaseChain({ newSessionId: "sess-abc" });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);

    const anthropic = mockAnthropic("Hello there!");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ sessionId: "sess-abc", reply: "Hello there!" });

    // Order: session created → user msg written → Claude called → assistant msg written
    expect(fromChain.sessionInsert).toHaveBeenCalledWith({ user_id: "u1", title: null });
    expect(fromChain.messageInsert).toHaveBeenNthCalledWith(1, {
      session_id: "sess-abc",
      role: "user",
      content: "Hi",
    });
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
    expect(fromChain.messageInsert).toHaveBeenNthCalledWith(2, {
      session_id: "sess-abc",
      role: "assistant",
      content: "Hello there!",
    });
    // Strict ordering: user-msg insert came before the Claude call
    const userInsertOrder = fromChain.messageInsert.mock.invocationCallOrder[0];
    const claudeCallOrder = anthropic.messages.create.mock.invocationCallOrder[0];
    expect(userInsertOrder).toBeLessThan(claudeCallOrder);
  });
```

Add four new tests at the end of the `describe("POST /api/chat")` block:

```typescript
  test("with a provided sessionId, reuses it (no new session insert)", async () => {
    const fromChain = mockSupabaseChain();
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("ok") as never);

    const res = await POST(
      postRequest({ message: "Hi", sessionId: "11111111-1111-1111-1111-111111111111" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sessionId).toBe("11111111-1111-1111-1111-111111111111");
    expect(fromChain.sessionInsert).not.toHaveBeenCalled();
    expect(fromChain.messageInsert).toHaveBeenCalledTimes(2);
  });

  test("returns 500 if creating the chat_sessions row fails", async () => {
    const fromChain = mockSupabaseChain({ sessionInsertError: new Error("db down") });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));

    expect(res.status).toBe(500);
    expect(getAnthropicClient).not.toHaveBeenCalled();
    expect(fromChain.messageInsert).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test("returns 404 when the user-message insert fails (RLS denial / unowned session)", async () => {
    const fromChain = mockSupabaseChain({ messageInsertError: new Error("RLS violation") });
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(
      postRequest({ message: "Hi", sessionId: "22222222-2222-2222-2222-222222222222" }),
    );

    expect(res.status).toBe(404);
    expect(getAnthropicClient).not.toHaveBeenCalled();
    expect(fromChain.messageInsert).toHaveBeenCalledTimes(1); // only the failed user write
    errSpy.mockRestore();
  });

  test("logs but does not fail the request if the assistant-message insert errors", async () => {
    // First insert (user) succeeds, second insert (assistant) errors.
    const fromChain = mockSupabaseChain();
    fromChain.messageInsert
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("write race") });

    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropic("Hello") as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    // The user already paid for the Claude call; surface the reply.
    expect(res.status).toBe(200);
    expect(json.reply).toBe("Hello");
    expect(errSpy).toHaveBeenCalled(); // assistant-write failure must be logged
    errSpy.mockRestore();
  });
```

Update the existing **"returns 500 when the Anthropic call rejects"** test — the user-message insert now happens BEFORE the Claude call, so we need a chainable mock for it:

```typescript
  test("returns 500 when the Anthropic call rejects, without leaking the error", async () => {
    const fromChain = mockSupabaseChain();
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }, fromChain) as never);
    const anthropic: MockedAnthropic = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("upstream boom — secret_key=sk-leaked")),
      },
    };
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("sk-leaked");
    expect(JSON.stringify(json)).not.toContain("secret_key");

    // The user's message was persisted before the Claude call — that's deliberate.
    expect(fromChain.messageInsert).toHaveBeenCalledTimes(1);
    expect(fromChain.messageInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "Hi" }),
    );

    errSpy.mockRestore();
  });
```

The two trivial tests (401 no user, 400 invalid body, 400 invalid JSON) keep their existing form — they bail before any DB interaction.

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -15
```
Expected: most newly-written assertions fail (the route still returns just `{ reply }` and never touches `from()`).

- [ ] **Step 3: Update `app/api/chat/route.ts`**

Replace the file contents with:

```typescript
import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { createClient } from "@/lib/supabase/server";
import { chatRequestSchema } from "@/lib/validations/chat";

// max_tokens choice: 4096 is comfortably long for educational replies and
// well under the 16K non-streaming SDK-timeout threshold. See
// docs/superpowers/plans/2026-04-30-epic3-api-chat-single-turn.md §Task 1.
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
  // If the caller passed a sessionId they don't own, RLS will reject this
  // insert; surface as 404 (don't differentiate "not found" from "not yours").
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

  // 5. Call Claude
  let reply: string;
  try {
    const anthropic = getAnthropicClient();
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: parsed.data.message }],
    });
    reply = completion.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
  } catch (err) {
    console.error("[/api/chat] upstream error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "upstream_error" }, { status: 500 });
  }

  // 6. Persist the assistant message. Failure here is logged but does NOT
  // fail the request — the user already paid for the Claude call and the
  // reply is real; losing the assistant message is recoverable on a future
  // round-trip via session re-fetch (and #22 will need to handle this for
  // streaming anyway).
  const { error: assistantMsgErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: reply,
  });
  if (assistantMsgErr) {
    console.error(
      "[/api/chat] assistant message insert failed (reply still returned):",
      assistantMsgErr instanceof Error ? assistantMsgErr.message : assistantMsgErr,
    );
  }

  return Response.json({ sessionId, reply });
}
```

- [ ] **Step 4: Run the route tests to confirm they pass**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -10
```
Expected: 9/9 passing (5 existing + 4 new).

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write app/api/chat/route.ts tests/api/chat.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "feat(api): persist conversation history on /api/chat

Closes the persistence half of Epic 3:
- Optional sessionId in request body; new sessions auto-created with title=null
- User message persisted before the Claude call (durable even on Claude failure)
- Assistant message persisted after; failure logged but does not fail the request
- Returns { sessionId, reply }
- RLS handles cross-user isolation; an unowned sessionId surfaces as 404"
```

---

## Task 3: Final verification + push + PR

- [ ] **Step 1: Full test sweep (with real Supabase env so the existing RLS suite runs)**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: previously-passing count + **7 new tests** (3 schema + 4 route — note the existing happy-path and 500 tests are *modified*, not new).

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean.

- [ ] **Step 3: Commit the plan file itself**

```bash
git add docs/superpowers/plans/2026-04-30-epic3-conversation-history-persistence.md
git commit -m "docs(plan): add Epic 3 #20 conversation history persistence implementation plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/conversation-history-persistence-20
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/conversation-history-persistence-20 \
  --title "feat(api): #20 — conversation history persistence on /api/chat" \
  --body "$(cat <<'EOF'
## Summary
- Extend \`chatRequestSchema\` with optional \`sessionId\` (UUID)
- \`/api/chat\` now creates (or reuses) a \`chat_sessions\` row, writes the user message before the Claude call, writes the assistant message after, and returns \`{ sessionId, reply }\`
- User-message persistence happens **before** the Claude call so the user's question is durable even if Claude fails
- Assistant-message persistence failure is **logged but does not fail the request** — the user paid for the reply, so we surface it; the missing assistant row is recoverable on a future session re-fetch and #22's streaming will need to handle this anyway
- An unowned \`sessionId\` (or a non-existent one) surfaces as 404 via the natural RLS denial on the user-message insert; we don't differentiate "not yours" from "doesn't exist"

## Cross-user isolation
Already covered by \`tests/db/rls-policies.test.ts\` (10 chat-table cases including write/read denial across users). The route uses the cookie-aware Supabase client, so writes inherit the caller's RLS scope automatically — no service role, no explicit ownership checks. Re-verifying that here would duplicate the RLS suite.

## Why no integration test against the real route?
The route reads cookies via \`next/headers\`, which only works in a real request context. Hitting it from Vitest requires either spinning up a Next.js dev server or refactoring \`createClient\` to inject auth — both out of scope for #20. Chosen path: unit-test the route's orchestration with a chainable Supabase mock; rely on the existing RLS suite for the DB-level guarantee. If #22's streaming work creates a natural \`persistTurn\` seam, we can add an integration test cheaply then.

## Tests added
- Schema (3): valid UUID accepted, missing sessionId valid, invalid UUID rejected
- Route (4): with-sessionId reuses (no session insert), 500 on session-create failure, 404 on user-msg RLS denial, assistant-msg insert failure logged but reply returned
- Modified: existing happy-path now asserts \`{ sessionId, reply }\` shape + DB call order; existing 500-upstream test verifies user-msg was persisted first

## Test plan
- [x] \`pnpm test\` — full suite green (107/107 with real Supabase env)
- [x] \`pnpm biome check .\` — clean
- [x] \`pnpm exec tsc --noEmit\` — clean

Closes #20.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #20 maps to a Task in this plan, an existing test in `tests/db/rls-policies.test.ts`, or a documented decision.
- **Placeholder scan:** no TBD/TODO. The "writes happen in this exact order" requirement is enforced by an `invocationCallOrder` assertion in the happy-path test.
- **Type consistency:** `chatRequestSchema` extension preserves the existing `ChatRequest` type via `z.infer`. The route's `parsed.data.sessionId` is `string | undefined` after the schema change, narrowed to `string` after the if-no-sessionId branch.
- **Failure-mode honesty:** every failure path is tested — session-create error → 500, user-msg insert error → 404, Claude error → 500, assistant-msg insert error → log + 200 with reply. The 200 case for assistant-msg failure is a deliberate design call documented in both the route comment and the PR body.
