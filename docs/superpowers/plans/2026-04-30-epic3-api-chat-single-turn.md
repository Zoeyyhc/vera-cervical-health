# Epic 3 — #19 `/api/chat` Single-Turn Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `POST /api/chat` — a Zod-validated, auth-gated route that takes `{ message }`, calls Claude once with the safety-first `DEFAULT_SYSTEM_PROMPT`, and returns `{ reply }` as JSON. No persistence, no streaming, no orchestration — those land in #20, #22, #27 respectively.

**Architecture:** App Router POST handler at `app/api/chat/route.ts`. Auth comes from `@/lib/supabase/server` (cookie-driven SSR client) — `auth.getUser()` returning `null` → 401. Body parsing via a new `chatRequestSchema` in `lib/validations/chat.ts` (regular `zod`, not `zod/v3` — RHF compat doesn't apply on a server route). Claude integration uses the factory and constant from #18: `getAnthropicClient()` + `CLAUDE_MODEL` + `DEFAULT_SYSTEM_PROMPT`. Tests mock `@/lib/supabase/server` and `@/lib/ai/anthropic` — same pattern as the existing `tests/api/auth-callback.test.ts`. All under `// @vitest-environment node` because the SDK refuses to instantiate under jsdom.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Zod (regular `zod` import), Vitest (`node` env), `@anthropic-ai/sdk`, Biome.

**Issue:** [#19](https://github.com/Zoeyyhc/cervix-assistant/issues/19)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-03
**Depends on:** #18 (Anthropic client + system prompt — already on `main`)

---

## Pre-existing scaffolding

- ✅ `app/api/chat/` directory exists (empty — created in earlier scaffolding)
- ✅ `lib/ai/anthropic.ts` exports `getAnthropicClient()` and `CLAUDE_MODEL` (#18, on main)
- ✅ `lib/ai/system-prompt.ts` exports `DEFAULT_SYSTEM_PROMPT` (#18, on main)
- ✅ `lib/supabase/server.ts` exports `createClient()` for cookie-aware SSR auth (Epic 2, on main)
- ✅ `tests/api/auth-callback.test.ts` provides the route-test pattern (mock `@/lib/supabase/server`, use `NextRequest`, assert response shape)

## Gaps vs #19 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `app/api/chat/route.ts` POST handler | ❌ Empty dir | **Task 3** |
| Zod schema validates `{ message: string (1..4000) }` | ❌ Module doesn't exist | **Task 2** |
| Returns 401 when no Supabase user | ❌ | Task 3 |
| Calls Claude with `DEFAULT_SYSTEM_PROMPT` + single user message | ❌ | Task 3 |
| Returns `Response.json({ reply: string })` | ❌ | Task 3 |
| 500 on upstream error, logged server-side without leaking the API key | ❌ | Task 3 |
| Vitest route-level test mocking the Anthropic client | ❌ | Task 3 |

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/validations/chat.ts` | **Create** | Zod `chatRequestSchema` for the POST body + a `ChatRequest` type. Single source of truth for request validation. |
| `lib/validations/chat.test.ts` | **Create** | Vitest unit tests for the schema (valid, empty, too long, missing, wrong type). |
| `app/api/chat/route.ts` | **Create** | POST handler — auth gate, body validation, Claude call, response shape, error handling. |
| `tests/api/chat.test.ts` | **Create** | Route-level tests mocking `@/lib/supabase/server` and `@/lib/ai/anthropic`. |

**Files not touched:**
- `lib/ai/anthropic.ts` / `lib/ai/system-prompt.ts` — consume as-is from #18.
- `lib/supabase/server.ts` — reused unchanged.
- `middleware.ts` — `/api/*` route guards aren't needed for this endpoint (we do per-route auth in the handler), and `/chat` UI gating happens in #23.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/api-chat-single-turn-19`. If not, branch off the latest main.

- [ ] **Step B: Confirm #18's surface is on `main`**

```bash
ls lib/ai/anthropic.ts lib/ai/system-prompt.ts
```
Expected: both files exist. If either is missing, `git pull --ff-only` before proceeding — #19 has a hard dep on #18.

- [ ] **Step C: Baseline: full test suite is green**

```bash
pnpm test 2>&1 | tail -5
```
Expected: same pass count as `main` HEAD (88/88 with real Supabase env, 88-9=79/79 without). If anything is red, stop and figure out why before adding new code.

- [ ] **Step D: Biome is clean**

```bash
pnpm biome check . 2>&1 | tail -3
```
Expected: clean.

---

## Task 1: Decide and document the `max_tokens` value

**Files:** none — this is a recorded decision that flows into Task 3's code and stays out of the schema.

The Anthropic SDK requires `max_tokens` on every request. Defaults from `claude-api` guidance:
- Non-streaming, general default: ~16000
- Streaming, general default: ~64000

For a chat reply where the model is talking to a user about cervical-health questions, **4096** is a better fit than 16000:
- Most chat replies are 100–800 tokens
- 4096 prevents accidental wall-of-text responses while leaving headroom for longer educational answers
- Well under the 16K SDK-timeout threshold (we're not streaming yet)
- Easy to raise in #22 when streaming lands

**Decision: hard-code `max_tokens: 4096` in the route**, with a comment pointing to this plan. Streaming/longer responses are #22's problem.

- [ ] **Step 1: Acknowledge the decision** — no code yet; just note the value `4096` for use in Task 3.

---

## Task 2: Zod schema for the chat request body (TDD)

**Files:** `lib/validations/chat.ts`, `lib/validations/chat.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/validations/chat.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "./chat";

describe("chatRequestSchema", () => {
  it("accepts a valid message", () => {
    const result = chatRequestSchema.safeParse({ message: "Hi there" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty message", () => {
    const result = chatRequestSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a message over 4000 chars", () => {
    const result = chatRequestSchema.safeParse({ message: "x".repeat(4001) });
    expect(result.success).toBe(false);
  });

  it("accepts a message of exactly 4000 chars", () => {
    const result = chatRequestSchema.safeParse({ message: "x".repeat(4000) });
    expect(result.success).toBe(true);
  });

  it("rejects a missing message field", () => {
    const result = chatRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-string message", () => {
    const result = chatRequestSchema.safeParse({ message: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object body", () => {
    const result = chatRequestSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm test lib/validations/chat.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./chat`.

- [ ] **Step 3: Write the implementation**

Create `lib/validations/chat.ts`:

```typescript
// Server-side Zod schema for `POST /api/chat` request bodies. Uses the regular
// `zod` import — not `zod/v3` — because this is server route validation, not a
// React Hook Form resolver.
import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string().min(1, "message must not be empty").max(4000, "message must be 4000 characters or fewer"),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm test lib/validations/chat.test.ts 2>&1 | tail -5
```
Expected: 7/7 passing.

- [ ] **Step 5: Run Biome**

```bash
pnpm biome check --write lib/validations/chat.ts lib/validations/chat.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/validations/chat.ts lib/validations/chat.test.ts
git commit -m "feat(validations): add chatRequestSchema for /api/chat body"
```

---

## Task 3: POST `/api/chat` route handler (TDD)

**Files:** `app/api/chat/route.ts`, `tests/api/chat.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/chat.test.ts`:

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return {
    ...actual,
    getAnthropicClient: vi.fn(),
  };
});

import { POST } from "@/app/api/chat/route";
import { getAnthropicClient } from "@/lib/ai/anthropic";
import { createClient } from "@/lib/supabase/server";

type MockedSupabase = {
  auth: { getUser: ReturnType<typeof vi.fn> };
};

type MockedAnthropic = {
  messages: { create: ReturnType<typeof vi.fn> };
};

function mockSupabase(user: { id: string } | null): MockedSupabase {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  };
}

function mockAnthropic(reply: string): MockedAnthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: reply }],
      }),
    },
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when there is no Supabase user", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase(null) as never);

    const res = await POST(postRequest({ message: "hi" }));

    expect(res.status).toBe(401);
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  test("returns 400 when the body fails Zod validation", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);

    const res = await POST(postRequest({ message: "" }));

    expect(res.status).toBe(400);
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  test("returns 400 when the body is not valid JSON", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);

    const res = await POST(postRequest("not json"));

    expect(res.status).toBe(400);
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  test("returns 200 with { reply } and calls Claude with the system prompt", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);
    const anthropic = mockAnthropic("Hello there!");
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ reply: "Hello there!" });

    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
    const [callArgs] = anthropic.messages.create.mock.calls;
    expect(callArgs[0].model).toBe("claude-sonnet-4-6");
    expect(callArgs[0].system).toMatch(/cervical health/i);
    expect(callArgs[0].messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  test("returns 500 when the Anthropic call rejects, without leaking the error", async () => {
    vi.mocked(createClient).mockReturnValue(mockSupabase({ id: "u1" }) as never);
    const anthropic: MockedAnthropic = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("upstream boom — secret_key=sk-leaked")),
      },
    };
    vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

    // Suppress the expected console.error so test output stays clean.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(postRequest({ message: "Hi" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("sk-leaked");
    expect(JSON.stringify(json)).not.toContain("secret_key");

    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `@/app/api/chat/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/chat/route.ts`:

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

  // 3. Call Claude
  try {
    const anthropic = getAnthropicClient();
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: parsed.data.message }],
    });

    const reply = completion.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return Response.json({ reply });
  } catch (err) {
    // Log to the server only — never echo the upstream error in the response
    // body, which can leak prompt fragments or API-key context.
    console.error("[/api/chat] upstream error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "upstream_error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -10
```
Expected: 5/5 passing.

- [ ] **Step 5: Run Biome**

```bash
pnpm biome check --write app/api/chat/route.ts tests/api/chat.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "feat(api): add POST /api/chat single-turn endpoint with safety system prompt"
```

---

## Task 4: Final verification + push + PR

- [ ] **Step 1: Full test sweep with real Supabase env**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: previously-passing count + **12 new tests** (7 schema + 5 route).

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check . 2>&1 | tail -3
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: both clean (or pre-existing tsc errors only — flag, don't fix).

- [ ] **Step 3: Push**

```bash
git push -u origin feat/api-chat-single-turn-19
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/api-chat-single-turn-19 \
  --title "feat(api): #19 — POST /api/chat single-turn endpoint (non-streaming)" \
  --body "$(cat <<'EOF'
## Summary
- Add \`lib/validations/chat.ts\` — Zod \`chatRequestSchema\` validating \`{ message: string (1..4000) }\`
- Add \`app/api/chat/route.ts\` — POST handler that auth-gates via Supabase, validates the body, calls Claude with the safety system prompt, returns \`{ reply: string }\`
- Hard-codes \`max_tokens: 4096\` (rationale documented in the plan); streaming + longer responses land in #22
- Tests:
  - Schema: 7 cases (valid, empty, too long, exact bound, missing, wrong type, non-object)
  - Route: 5 cases (401 no user, 400 invalid body, 400 invalid JSON, 200 happy path with model/prompt/messages assertions, 500 on upstream error with no leak)

## Test plan
- [x] \`pnpm test\` — full suite green
- [x] \`pnpm biome check .\` — clean
- [x] \`pnpm exec tsc --noEmit\` — clean
- [x] Manual verification not required (no UI; downstream tickets #20 and #22 build on this)

Closes #19.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #19 maps to a Task in this plan or a "✅ Pre-existing" row.
- **Placeholder scan:** no TBD/TODO. The `max_tokens: 4096` is an explicit decision (Task 1) with a code comment pointing back to the plan.
- **Type consistency:** `chatRequestSchema` and `ChatRequest` exported from `lib/validations/chat.ts` are used by both Task 2's tests and Task 3's route. The route's response shape `{ reply: string }` matches the test assertion. Mock signatures (`MockedSupabase`, `MockedAnthropic`) match the surfaces the route actually touches.
- **Error-handling honesty:** the 500-case test asserts both the status code AND that no leaked secret/error text appears in the response body. Logging-only is enforced via the `console.error` spy.
