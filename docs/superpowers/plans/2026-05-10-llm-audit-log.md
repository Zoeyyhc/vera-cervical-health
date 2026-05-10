# LLM Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Solo-project note from CLAUDE.md:** Skip the strict per-step approval checkpoints. Execute tasks straight through, but still follow the plan in order and read the spec before deviating.

**Goal:** Persist a structured audit row for every Anthropic API call (model, params, prompt id+version+hash, tokens, cache tokens, cost USD, latency, status) with no impact on user-facing chat latency.

**Architecture:** A central SDK wrapper (`loggedMessagesCreate` / `loggedMessagesStream`) is the only sanctioned way to call Anthropic. Per-request context (user_id, session_id, service-role Supabase client) is plumbed through `AsyncLocalStorage` so agents stay pure. Writes are fire-and-forget — failures log to console, never break the response stream.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, `@anthropic-ai/sdk`, Supabase (Postgres + RLS), Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-05-10-llm-audit-log-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/<ts>_create_llm_calls.sql` | Create | New `llm_calls` table + admin-only RLS select policy |
| `lib/ai/prompts.ts` | Create | Prompt registry — `PromptDef` records and `promptHash` |
| `lib/ai/prompts.test.ts` | Create | Verifies prompt records and hash determinism |
| `lib/ai/pricing.ts` | Create | `computeCostUsd(model, usage)` from a hard-coded price table |
| `lib/ai/pricing.test.ts` | Create | Cost arithmetic + unknown-model handling |
| `lib/ai/audit-context.ts` | Create | `AsyncLocalStorage` wrapper exposing `auditContext.run` / `.get` |
| `lib/ai/audit-context.test.ts` | Create | Sanity test that store leaks/scopes correctly |
| `lib/supabase/admin.ts` | Create | Service-role Supabase client factory (server-only) |
| `lib/ai/anthropic.ts` | Modify | Add `loggedMessagesCreate` + `loggedMessagesStream`; existing exports stay |
| `lib/ai/anthropic.test.ts` | Modify | Tests for both wrappers (success, error, no-context, insert-failure) |
| `lib/agents/orchestrator.ts` | Modify | Classifier uses `loggedMessagesCreate`; prompt lifted to registry |
| `lib/agents/orchestrator.test.ts` | Modify | Mocks updated minimally to keep assertions green |
| `lib/agents/response-agent.ts` | Modify | Streaming uses `loggedMessagesStream`; prompt lifted to registry |
| `lib/agents/response-agent.test.ts` | Modify | Mocks updated minimally to keep assertions green |
| `app/api/chat/route.ts` | Modify | Wraps existing logic with `auditContext.run({ supabaseAdmin, userId, sessionId }, ...)` |
| `lib/agents/no-direct-anthropic.test.ts` | Create | Lint-style test forbidding `messages.create`/`messages.stream` in `lib/agents/` |

---

## Task 1: Database migration — create `llm_calls` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_llm_calls.sql` (use `supabase migration new create_llm_calls` to generate the timestamped filename)
- Verify: existing `public.is_admin()` security-definer helper from `supabase/migrations/20260409165311_enable_pgvector_and_create_profiles.sql`

- [ ] **Step 1: Generate the migration file**

```bash
supabase migration new create_llm_calls
```

Expected: prints the new file path under `supabase/migrations/`.

- [ ] **Step 2: Write the migration**

Paste into the new file:

```sql
-- LLM audit log — one row per Anthropic API call.
-- Wrapper inserts via service-role client (bypasses RLS).
-- Reads are admin-only; no policy lets users see this data.

create table public.llm_calls (
  id                 uuid primary key default gen_random_uuid(),

  -- Both nullable so non-chat (e.g. admin ingest) calls log too. No
  -- chat_message_id FK because the assistant chat_messages row is inserted
  -- AFTER streaming ends, racing the audit write. Correlate via
  -- (session_id, started_at) instead.
  user_id            uuid references public.profiles(id)      on delete set null,
  session_id         uuid references public.chat_sessions(id) on delete set null,

  agent              text not null,        -- 'classifier' | 'response' | future agents
  prompt_id          text not null,        -- 'classifier' | 'response.default' | 'response.override'
  prompt_version     text not null,        -- 'v1' — manual bump on intentional change
  prompt_hash        text not null,        -- sha256 hex of the base system prompt text

  model              text not null,        -- 'claude-sonnet-4-6'
  temperature        numeric(4,3),         -- nullable: SDK default when caller omits
  max_tokens         integer not null,
  streamed           boolean not null default false,

  input_tokens       integer not null,
  output_tokens      integer not null,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(10,6),

  started_at         timestamptz not null,
  duration_ms        integer not null,
  status             text not null check (status in ('ok','error')),
  error_message      text,

  created_at         timestamptz not null default now()
);

create index on public.llm_calls (user_id, created_at desc);
create index on public.llm_calls (agent,   created_at desc);
create index on public.llm_calls (session_id);
create index on public.llm_calls (created_at desc);

alter table public.llm_calls enable row level security;

create policy llm_calls_admin_select on public.llm_calls
  for select using (public.is_admin());
```

- [ ] **Step 3: Apply locally**

```bash
supabase db reset
```

Expected: completes without errors; reapplies all migrations + seed.

- [ ] **Step 4: Verify the schema**

```bash
supabase db diff --schema public
```

Expected: empty (DB matches migrations).

Spot-check the table directly via Supabase Studio or psql: `\d public.llm_calls` shows the 19 columns above; `\d+` confirms the four indexes; RLS is enabled.

- [ ] **Step 5: Regenerate Supabase types**

```bash
supabase gen types typescript --local > types/supabase.ts
```

Expected: `types/supabase.ts` now includes `llm_calls` under `public.Tables`. Do NOT hand-edit (per CLAUDE.md).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ types/supabase.ts
git commit -m "feat(db): add llm_calls audit table with admin-only RLS"
```

---

## Task 2: Prompt registry — `lib/ai/prompts.ts`

**Files:**
- Create: `lib/ai/prompts.ts`
- Create: `lib/ai/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/ai/prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CLASSIFIER_PROMPT,
  RESPONSE_DEFAULT_PROMPT,
  promptHash,
} from "@/lib/ai/prompts";

describe("prompt registry", () => {
  it("CLASSIFIER_PROMPT is a complete record", () => {
    expect(CLASSIFIER_PROMPT.id).toBe("classifier");
    expect(CLASSIFIER_PROMPT.version).toMatch(/^v\d+$/);
    expect(CLASSIFIER_PROMPT.text.length).toBeGreaterThan(0);
  });

  it("RESPONSE_DEFAULT_PROMPT is a complete record", () => {
    expect(RESPONSE_DEFAULT_PROMPT.id).toBe("response.default");
    expect(RESPONSE_DEFAULT_PROMPT.version).toMatch(/^v\d+$/);
    expect(RESPONSE_DEFAULT_PROMPT.text.length).toBeGreaterThan(0);
  });

  it("promptHash is deterministic 64-char hex", () => {
    const a = promptHash("hello");
    const b = promptHash("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(promptHash("world"));
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
pnpm exec vitest run lib/ai/prompts.test.ts
```

Expected: fails because `lib/ai/prompts.ts` does not exist yet.

- [ ] **Step 3: Implement the registry**

Create `lib/ai/prompts.ts`. The classifier prompt is lifted verbatim from `lib/agents/orchestrator.ts` (`CLASSIFIER_SYSTEM_PROMPT`). The response default is lifted from `lib/ai/system-prompt.ts` (`DEFAULT_SYSTEM_PROMPT`). Copy the exact strings, do not paraphrase.

```ts
import { createHash } from "node:crypto";

export type PromptDef = {
  id: string;
  version: string;
  text: string;
};

function defPrompt(id: string, version: string, text: string): PromptDef {
  return { id, version, text };
}

export const CLASSIFIER_PROMPT = defPrompt(
  "classifier",
  "v1",
  // Verbatim copy of CLASSIFIER_SYSTEM_PROMPT from lib/agents/orchestrator.ts.
  `You classify the user's message into exactly ONE of these categories. Return ONLY the category name (lowercase, with underscores), nothing else — no explanation, no punctuation.

Categories:
- health_question  : questions about cervical health, HPV, screening, vaccination, symptoms, treatments, anatomy
- news_request     : explicit requests for recent news, articles, headlines, or updates
- events_request   : questions about upcoming events, meetups, screening clinics, conferences, or local activity
- general_chat     : greetings, off-topic questions, or anything that doesn't fit above

If unsure, choose general_chat.`,
);

import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

export const RESPONSE_DEFAULT_PROMPT = defPrompt(
  "response.default",
  "v1",
  DEFAULT_SYSTEM_PROMPT,
);

export function promptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
```

Note: `system-prompt.ts` keeps its export — it's still imported by other code paths and existing tests. This module just re-wraps it as a `PromptDef`.

- [ ] **Step 4: Run the test — expect PASS**

```bash
pnpm exec vitest run lib/ai/prompts.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompts.ts lib/ai/prompts.test.ts
git commit -m "feat(ai): add prompt registry with versioned PromptDef records"
```

---

## Task 3: Pricing helper — `lib/ai/pricing.ts`

**Files:**
- Create: `lib/ai/pricing.ts`
- Create: `lib/ai/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/ai/pricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeCostUsd } from "@/lib/ai/pricing";

describe("computeCostUsd", () => {
  it("computes cost for claude-sonnet-4-6 with input/output tokens", () => {
    // 1M input tokens at $3.00, 1M output tokens at $15.00 = $18.00
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(cost).toBeCloseTo(18.0, 6);
  });

  it("includes cache read and cache write tokens", () => {
    // 1M cache_read at $0.30, 1M cache_write at $3.75 = $4.05
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(4.05, 6);
  });

  it("returns null for unknown model", () => {
    const cost = computeCostUsd("not-a-real-model", {
      input_tokens: 100,
      output_tokens: 100,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(cost).toBeNull();
  });

  it("handles missing cache fields gracefully", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing the null-safety of optional cache fields
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    } as any);
    expect(cost).toBeCloseTo(3.0, 6);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
pnpm exec vitest run lib/ai/pricing.test.ts
```

Expected: fails — module not found.

- [ ] **Step 3: Implement pricing**

Create `lib/ai/pricing.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";

type ModelPrices = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
};

// Source: https://www.anthropic.com/pricing (Claude Sonnet 4.x).
// Bumping requires a code change + commit so cost rows are reproducible.
const PRICES: Record<string, ModelPrices> = {
  "claude-sonnet-4-6": {
    inputPerMillion:      3.0,
    outputPerMillion:    15.0,
    cacheReadPerMillion:  0.3,
    cacheWritePerMillion: 3.75,
  },
};

type UsageLike = Pick<
  Anthropic.Usage,
  "input_tokens" | "output_tokens"
> & {
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function computeCostUsd(
  model: string,
  usage: UsageLike,
): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens   * p.inputPerMillion +
     usage.output_tokens  * p.outputPerMillion +
     cacheRead            * p.cacheReadPerMillion +
     cacheWrite           * p.cacheWritePerMillion) / 1_000_000
  );
}
```

Note: rates are confirmed against Anthropic's published pricing. If they differ at implementation time, update the constants and the test before committing.

- [ ] **Step 4: Run the test — expect PASS**

```bash
pnpm exec vitest run lib/ai/pricing.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/pricing.ts lib/ai/pricing.test.ts
git commit -m "feat(ai): add cost computation from token usage"
```

---

## Task 4: Audit context — `lib/ai/audit-context.ts`

**Files:**
- Create: `lib/ai/audit-context.ts`
- Create: `lib/ai/audit-context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/ai/audit-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { auditContext, type AuditContext } from "@/lib/ai/audit-context";

const fakeCtx = {
  // biome-ignore lint/suspicious/noExplicitAny: test fixture, not a real client
  supabaseAdmin: {} as any,
  userId: "u-1",
  sessionId: "s-1",
} satisfies AuditContext;

describe("auditContext", () => {
  it("returns undefined when no run() is active", () => {
    expect(auditContext.get()).toBeUndefined();
  });

  it("returns the active context inside run()", () => {
    const got = auditContext.run(fakeCtx, () => auditContext.get());
    expect(got).toEqual(fakeCtx);
  });

  it("scopes are isolated across run() boundaries", () => {
    auditContext.run(fakeCtx, () => {
      expect(auditContext.get()?.userId).toBe("u-1");
    });
    expect(auditContext.get()).toBeUndefined();
  });

  it("nested run() shadows the outer context", () => {
    auditContext.run(fakeCtx, () => {
      auditContext.run({ ...fakeCtx, userId: "u-2" }, () => {
        expect(auditContext.get()?.userId).toBe("u-2");
      });
      expect(auditContext.get()?.userId).toBe("u-1");
    });
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
pnpm exec vitest run lib/ai/audit-context.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement the context**

Create `lib/ai/audit-context.ts`:

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type AuditContext = {
  /** Service-role client. Insert-only use inside the wrapper. */
  supabaseAdmin: SupabaseClient<Database>;
  userId: string | null;
  sessionId: string | null;
};

const storage = new AsyncLocalStorage<AuditContext>();

export const auditContext = {
  run<T>(ctx: AuditContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): AuditContext | undefined {
    return storage.getStore();
  },
};
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
pnpm exec vitest run lib/ai/audit-context.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/audit-context.ts lib/ai/audit-context.test.ts
git commit -m "feat(ai): add AsyncLocalStorage-based audit context"
```

---

## Task 5: Service-role Supabase client — `lib/supabase/admin.ts`

**Files:**
- Create: `lib/supabase/admin.ts`
- Reference: `lib/env.ts:24` already exposes `env.supabaseServiceRoleKey`

- [ ] **Step 1: Implement the factory**

Create `lib/supabase/admin.ts`:

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Service-role Supabase client. BYPASSES RLS — server-only.
 *
 * Never import from a client component, never return the instance to the
 * browser, never use it on routes that handle untrusted user data without
 * an explicit authz check first. Today: only the LLM-audit wrapper uses it,
 * and only to insert into `llm_calls`.
 */
export function createServiceRoleClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    "";
  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL — required for the service-role client.",
    );
  }
  return createSupabaseClient<Database>(url, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

Note: this reads the URL from the same env vars `lib/supabase/server.ts` uses. Confirm with `grep -n SUPABASE_URL lib/supabase/server.ts` if the var name differs in this codebase, and adjust the lookup chain accordingly.

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/admin.ts
git commit -m "feat(supabase): add service-role client factory for server-only use"
```

---

## Task 6: SDK wrapper — non-streaming `loggedMessagesCreate`

**Files:**
- Modify: `lib/ai/anthropic.ts` (append; do NOT remove `getAnthropicClient` or `CLAUDE_MODEL`)
- Modify: `lib/ai/anthropic.test.ts` (existing file — extend)

- [ ] **Step 1: Write the failing test**

Append to `lib/ai/anthropic.test.ts` (or create if absent):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditContext, type AuditContext } from "@/lib/ai/audit-context";
import { CLASSIFIER_PROMPT, promptHash } from "@/lib/ai/prompts";

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return { ...actual, getAnthropicClient: vi.fn() };
});

import { getAnthropicClient, loggedMessagesCreate } from "@/lib/ai/anthropic";

function fakeCtx(insert: ReturnType<typeof vi.fn>): AuditContext {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: minimal supabase shape for assertions
    supabaseAdmin: { from: vi.fn(() => ({ insert })) } as any,
    userId: "u-1",
    sessionId: "s-1",
  };
}

describe("loggedMessagesCreate", () => {
  afterEach(() => vi.clearAllMocks());

  it("inserts an audit row on success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      usage: {
        input_tokens: 10,
        output_tokens: 3,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    await auditContext.run(fakeCtx(insert), async () => {
      await loggedMessagesCreate(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 16,
          temperature: 0,
          system: CLASSIFIER_PROMPT.text,
          messages: [{ role: "user", content: "hello" }],
        },
        { agent: "classifier", prompt: CLASSIFIER_PROMPT },
      );
    });

    // Wait one microtask so the void-ed insert promise resolves before we assert.
    await new Promise((r) => setImmediate(r));

    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: "u-1",
      session_id: "s-1",
      agent: "classifier",
      prompt_id: "classifier",
      prompt_version: "v1",
      prompt_hash: promptHash(CLASSIFIER_PROMPT.text),
      model: "claude-sonnet-4-6",
      temperature: 0,
      max_tokens: 16,
      streamed: false,
      input_tokens: 10,
      output_tokens: 3,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      status: "ok",
    });
    expect(row.duration_ms).toBeGreaterThanOrEqual(0);
    expect(row.cost_usd).toBeGreaterThan(0);
    expect(row.error_message).toBeNull();
  });

  it("inserts an error row and rethrows when the SDK throws", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const create = vi.fn().mockRejectedValue(new Error("boom"));
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    await expect(
      auditContext.run(fakeCtx(insert), () =>
        loggedMessagesCreate(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 16,
            system: "x",
            messages: [{ role: "user", content: "hi" }],
          },
          { agent: "classifier", prompt: CLASSIFIER_PROMPT },
        ),
      ),
    ).rejects.toThrow("boom");

    await new Promise((r) => setImmediate(r));
    const row = insert.mock.calls[0][0];
    expect(row.status).toBe("error");
    expect(row.error_message).toBe("boom");
    expect(row.input_tokens).toBe(0);
  });

  it("skips the insert when no audit context is active", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const create = vi.fn().mockResolvedValue({
      content: [],
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    await loggedMessagesCreate(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8,
        system: "x",
        messages: [{ role: "user", content: "hi" }],
      },
      { agent: "classifier", prompt: CLASSIFIER_PROMPT },
    );

    await new Promise((r) => setImmediate(r));
    expect(insert).not.toHaveBeenCalled();
  });

  it("never throws when supabase insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    const create = vi.fn().mockResolvedValue({
      content: [],
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { create },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      auditContext.run(fakeCtx(insert), () =>
        loggedMessagesCreate(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 8,
            system: "x",
            messages: [{ role: "user", content: "hi" }],
          },
          { agent: "classifier", prompt: CLASSIFIER_PROMPT },
        ),
      ),
    ).resolves.toBeDefined();

    await new Promise((r) => setImmediate(r));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
pnpm exec vitest run lib/ai/anthropic.test.ts
```

Expected: fails — `loggedMessagesCreate` not exported.

- [ ] **Step 3: Implement `loggedMessagesCreate`**

Append to `lib/ai/anthropic.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { auditContext } from "@/lib/ai/audit-context";
import { type PromptDef, promptHash } from "@/lib/ai/prompts";
import { computeCostUsd } from "@/lib/ai/pricing";

type LoggedCallMeta = {
  agent: string;
  prompt: PromptDef;
};

type AuditUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

const ZERO_USAGE: AuditUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

function buildRow(args: {
  params: { model: string; max_tokens: number; temperature?: number };
  meta: LoggedCallMeta;
  startedAt: Date;
  durationMs: number;
  usage: AuditUsage;
  status: "ok" | "error";
  streamed: boolean;
  error?: unknown;
}) {
  const u = args.usage;
  return {
    user_id:            null as string | null,        // overwritten below
    session_id:         null as string | null,
    agent:              args.meta.agent,
    prompt_id:          args.meta.prompt.id,
    prompt_version:     args.meta.prompt.version,
    prompt_hash:        promptHash(args.meta.prompt.text),
    model:              args.params.model,
    temperature:        args.params.temperature ?? null,
    max_tokens:         args.params.max_tokens,
    streamed:           args.streamed,
    input_tokens:       u.input_tokens,
    output_tokens:      u.output_tokens,
    cache_read_tokens:  u.cache_read_input_tokens,
    cache_write_tokens: u.cache_creation_input_tokens,
    cost_usd:           args.status === "ok"
                          ? computeCostUsd(args.params.model, u)
                          : null,
    started_at:         args.startedAt.toISOString(),
    duration_ms:        Math.round(args.durationMs),
    status:             args.status,
    error_message:      args.error instanceof Error ? args.error.message : null,
  };
}

async function writeAuditRow(row: ReturnType<typeof buildRow>): Promise<void> {
  const ctx = auditContext.get();
  if (!ctx) return;
  row.user_id = ctx.userId;
  row.session_id = ctx.sessionId;
  const { error } = await ctx.supabaseAdmin.from("llm_calls").insert(row);
  if (error) console.error("[llm-audit] insert failed:", error.message);
}

export async function loggedMessagesCreate(
  params: Anthropic.MessageCreateParamsNonStreaming,
  meta: LoggedCallMeta,
): Promise<Anthropic.Message> {
  const startedAt = new Date();
  const t0 = performance.now();
  try {
    const res = await getAnthropicClient().messages.create(params);
    const u = res.usage;
    const usage: AuditUsage = {
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    };
    void writeAuditRow(
      buildRow({
        params, meta, startedAt,
        durationMs: performance.now() - t0,
        usage, status: "ok", streamed: false,
      }),
    );
    return res;
  } catch (err) {
    void writeAuditRow(
      buildRow({
        params, meta, startedAt,
        durationMs: performance.now() - t0,
        usage: ZERO_USAGE, status: "error", streamed: false, error: err,
      }),
    );
    throw err;
  }
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
pnpm exec vitest run lib/ai/anthropic.test.ts
```

Expected: 4 new tests pass; existing `anthropic.test.ts` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/anthropic.ts lib/ai/anthropic.test.ts
git commit -m "feat(ai): add loggedMessagesCreate wrapper with audit-row insert"
```

---

## Task 7: SDK wrapper — streaming `loggedMessagesStream`

**Files:**
- Modify: `lib/ai/anthropic.ts`
- Modify: `lib/ai/anthropic.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/ai/anthropic.test.ts`:

```ts
import { RESPONSE_DEFAULT_PROMPT } from "@/lib/ai/prompts";
import { loggedMessagesStream } from "@/lib/ai/anthropic";

function makeStream(events: unknown[]) {
  // Mirrors the SDK's stream surface: AsyncIterable of events.
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const ev of events) yield ev;
    },
  };
}

describe("loggedMessagesStream", () => {
  afterEach(() => vi.clearAllMocks());

  it("yields all events to the consumer and writes one audit row", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const events = [
      { type: "message_start", message: { usage: { input_tokens: 12, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 } } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
      { type: "message_delta", usage: { output_tokens: 7 } },
      { type: "message_stop" },
    ];
    const streamFn = vi.fn(() => makeStream(events));
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { stream: streamFn },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    const collected: unknown[] = [];
    await auditContext.run(fakeCtx(insert), async () => {
      for await (const ev of loggedMessagesStream(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: RESPONSE_DEFAULT_PROMPT.text,
          messages: [{ role: "user", content: "hi" }],
        },
        { agent: "response", prompt: RESPONSE_DEFAULT_PROMPT },
      )) {
        collected.push(ev);
      }
    });
    await new Promise((r) => setImmediate(r));

    expect(collected).toEqual(events);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      agent: "response",
      streamed: true,
      input_tokens: 12,
      output_tokens: 7,
      cache_read_tokens: 4,
      cache_write_tokens: 0,
      status: "ok",
    });
  });

  it("writes an error row and rethrows when the upstream stream throws", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const failing = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: "message_start", message: { usage: { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
        throw new Error("upstream blew up");
      },
    };
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { stream: vi.fn(() => failing) },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    await expect(
      auditContext.run(fakeCtx(insert), async () => {
        for await (const _ev of loggedMessagesStream(
          { model: "claude-sonnet-4-6", max_tokens: 4096, system: "x", messages: [{ role: "user", content: "hi" }] },
          { agent: "response", prompt: RESPONSE_DEFAULT_PROMPT },
        )) {
          /* drain */
        }
      }),
    ).rejects.toThrow("upstream blew up");

    await new Promise((r) => setImmediate(r));
    const row = insert.mock.calls[0][0];
    expect(row.status).toBe("error");
    expect(row.error_message).toBe("upstream blew up");
    expect(row.input_tokens).toBe(5);   // partial usage from message_start is preserved
  });

  it("skips the insert when no audit context is active", async () => {
    const insert = vi.fn();
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: { stream: vi.fn(() => makeStream([{ type: "message_stop" }])) },
      // biome-ignore lint/suspicious/noExplicitAny: partial Anthropic surface
    } as any);

    for await (const _ev of loggedMessagesStream(
      { model: "claude-sonnet-4-6", max_tokens: 4096, system: "x", messages: [{ role: "user", content: "hi" }] },
      { agent: "response", prompt: RESPONSE_DEFAULT_PROMPT },
    )) {
      /* drain */
    }
    await new Promise((r) => setImmediate(r));
    expect(insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
pnpm exec vitest run lib/ai/anthropic.test.ts
```

Expected: fails — `loggedMessagesStream` not exported.

- [ ] **Step 3: Implement `loggedMessagesStream`**

Append to `lib/ai/anthropic.ts`:

```ts
export async function* loggedMessagesStream(
  params: Anthropic.MessageStreamParams,
  meta: LoggedCallMeta,
): AsyncIterable<Anthropic.MessageStreamEvent> {
  const startedAt = new Date();
  const t0 = performance.now();
  const usage: AuditUsage = { ...ZERO_USAGE };
  try {
    const stream = getAnthropicClient().messages.stream(params);
    for await (const ev of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
      // Read input + cache tokens from message_start; output tokens from message_delta.
      // Avoids depending on stream.finalMessage(), which complicates testing.
      if (ev.type === "message_start") {
        const m = ev.message.usage;
        usage.input_tokens = m.input_tokens;
        usage.cache_read_input_tokens = m.cache_read_input_tokens ?? 0;
        usage.cache_creation_input_tokens = m.cache_creation_input_tokens ?? 0;
      } else if (ev.type === "message_delta" && ev.usage) {
        usage.output_tokens = ev.usage.output_tokens;
      }
      yield ev;
    }
    void writeAuditRow(
      buildRow({
        params, meta, startedAt,
        durationMs: performance.now() - t0,
        usage, status: "ok", streamed: true,
      }),
    );
  } catch (err) {
    void writeAuditRow(
      buildRow({
        params, meta, startedAt,
        durationMs: performance.now() - t0,
        usage, status: "error", streamed: true, error: err,
      }),
    );
    throw err;
  }
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
pnpm exec vitest run lib/ai/anthropic.test.ts
```

Expected: streaming tests pass; non-streaming tests still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/anthropic.ts lib/ai/anthropic.test.ts
git commit -m "feat(ai): add loggedMessagesStream wrapper with token capture"
```

---

## Task 8: Migrate orchestrator to the wrapper

**Files:**
- Modify: `lib/agents/orchestrator.ts:9-17, 41-48`
- Modify: `lib/agents/orchestrator.test.ts` (only if its mocks break — most likely they do not)

- [ ] **Step 1: Lift the classifier prompt and switch to the wrapper**

In `lib/agents/orchestrator.ts`:

1. Delete the local `CLASSIFIER_SYSTEM_PROMPT` constant (lines 4-17 in the current file).
2. Replace the call site:

```ts
import { CLAUDE_MODEL, loggedMessagesCreate } from "@/lib/ai/anthropic";
import { CLASSIFIER_PROMPT } from "@/lib/ai/prompts";
import type { Intent } from "@/types/agents";

// ... keep VALID_INTENTS, NEWS_RE, EVENTS_RE, ClassifyResult, fallbackIntent ...

export async function classifyIntent(userMessage: string): Promise<ClassifyResult> {
  try {
    const response = await loggedMessagesCreate(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16,
        temperature: 0,
        system: CLASSIFIER_PROMPT.text,
        messages: [{ role: "user", content: userMessage }],
      },
      { agent: "classifier", prompt: CLASSIFIER_PROMPT },
    );

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim()
      .toLowerCase();

    if (VALID_INTENTS.has(raw as Intent)) {
      return { intent: raw as Intent };
    }
  } catch (err) {
    console.error(
      "[orchestrator] classifyIntent: Claude error, falling back to keyword rules:",
      err instanceof Error ? err.message : err,
    );
  }
  return { intent: fallbackIntent(userMessage) };
}
```

Leave the rest of the file (the `runOrchestrator` async generator and its dispatch logic) unchanged.

- [ ] **Step 2: Run the orchestrator tests — expect PASS**

```bash
pnpm exec vitest run lib/agents/orchestrator.test.ts
```

Expected: all tests still pass. The existing tests mock `getAnthropicClient`, which is still the underlying call inside `loggedMessagesCreate`, so the mocks chain through unchanged.

If a test fails because it asserts on a specific behaviour (e.g. expects `messages.create` to have been called via the old path), update the assertion to match — but do not change the test's intent.

- [ ] **Step 3: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/orchestrator.ts lib/agents/orchestrator.test.ts
git commit -m "refactor(orchestrator): route classifier through audit-logged wrapper"
```

---

## Task 9: Migrate response agent to the wrapper

**Files:**
- Modify: `lib/agents/response-agent.ts`
- Modify: `lib/agents/response-agent.test.ts` if mocks break

- [ ] **Step 1: Switch the streaming call to the wrapper**

In `lib/agents/response-agent.ts`:

```ts
import { CLAUDE_MODEL, loggedMessagesStream } from "@/lib/ai/anthropic";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { RESPONSE_DEFAULT_PROMPT } from "@/lib/ai/prompts";
import type { Source } from "@/types/agents";

const MAX_TOKENS = 4096;

export type ResponseAgentContext = {
  userMessage: string;
  history: ChatHistoryMessage[];
  groundingContext?: string;
  groundingSources?: Source[];
  systemPrompt?: string;
};

export type AgentChunk =
  | { type: "text"; text: string }
  | { type: "sources"; sources: Source[] };

export async function* runResponseAgent(
  ctx: ResponseAgentContext,
): AsyncIterable<AgentChunk> {
  const promptDef = ctx.systemPrompt
    ? { id: "response.override", version: "v1", text: ctx.systemPrompt }
    : RESPONSE_DEFAULT_PROMPT;

  const finalSystem = ctx.groundingContext
    ? `${promptDef.text}\n\nRetrieved context:\n${ctx.groundingContext}`
    : promptDef.text;

  const messages = [
    ...ctx.history,
    { role: "user" as const, content: ctx.userMessage },
  ];

  const stream = loggedMessagesStream(
    {
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: finalSystem,
      messages,
    },
    { agent: "response", prompt: promptDef },
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }

  if (ctx.groundingSources && ctx.groundingSources.length > 0) {
    yield { type: "sources", sources: ctx.groundingSources };
  }
}
```

Important: only the **base prompt** (`promptDef.text`) is hashed in the audit row. The grounding-context block is appended after-the-fact and intentionally NOT part of the hash, otherwise the drift detector would fire on every retrieval.

Note: `lib/ai/system-prompt.ts` and `DEFAULT_SYSTEM_PROMPT` are not deleted — `RESPONSE_DEFAULT_PROMPT` re-exports its text via the registry, and any other importers keep working.

- [ ] **Step 2: Run the response-agent tests — expect PASS**

```bash
pnpm exec vitest run lib/agents/response-agent.test.ts
```

Expected: pass. The existing tests mock `getAnthropicClient` and inspect `anthropic.messages.stream.mock.calls[0]`. Because the wrapper passes the same params straight through to the SDK, these assertions still hold.

If a test mock returns a stream object that lacks a `[Symbol.asyncIterator]`, update the mock to use the `makeStream(events)` pattern from Task 7. Do not change what the tests assert.

- [ ] **Step 3: Type-check + lint**

```bash
pnpm exec tsc --noEmit
pnpm biome check .
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/response-agent.ts lib/agents/response-agent.test.ts
git commit -m "refactor(response-agent): route streaming through audit-logged wrapper"
```

---

## Task 10: Open the audit context in `/api/chat`

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Wrap the streaming body in `auditContext.run`**

The current route's `start(controller)` body iterates `runOrchestrator` and writes the assistant message. Wrap that whole body. The audit-context object holds the service-role client, the user id, and the session id.

Add at the top of the file:

```ts
import { auditContext } from "@/lib/ai/audit-context";
import { createServiceRoleClient } from "@/lib/supabase/admin";
```

In the `start(controller)` body of the existing `ReadableStream`, wrap the entire async function body in a `await auditContext.run(...)`:

```ts
const stream = new ReadableStream({
  async start(controller) {
    const send = (event: ChatStreamEvent) => {
      controller.enqueue(encodeChatStreamEvent(event));
    };

    const supabaseAdmin = createServiceRoleClient();
    await auditContext.run(
      { supabaseAdmin, userId: user.id, sessionId: sessionIdResolved },
      async () => {
        send({ type: "start", sessionId: sessionIdResolved });

        let assistantText = "";
        let collectedSources: import("@/types/agents").Source[] | null = null;
        try {
          for await (const chunk of runOrchestrator(supabase, {
            userMessage,
            history,
            locale,
          })) {
            if (chunk.type === "text") {
              assistantText += chunk.text;
              send({ type: "text", text: chunk.text });
            } else if (chunk.type === "sources") {
              collectedSources = chunk.sources;
              send({ type: "sources", sources: chunk.sources });
            }
          }

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
    );
  },
});
```

This is the smallest possible diff — only an outer `auditContext.run(...)` is added; nothing inside the body changes shape.

- [ ] **Step 2: Manual smoke test**

```bash
pnpm dev
# In another shell, with `supabase start` already running:
# Send a chat message via the running app, then:
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c \
  "select agent, prompt_id, prompt_version, input_tokens, output_tokens, cost_usd, status from public.llm_calls order by started_at desc limit 5;"
```

Expected: at least two rows for the latest turn — one `agent='classifier'`, one `agent='response'`. Both with non-zero token counts and non-null `cost_usd`. `session_id` matches the user's chat session.

- [ ] **Step 3: Type-check + lint**

```bash
pnpm exec tsc --noEmit
pnpm biome check .
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): open llm-audit context for the chat stream"
```

---

## Task 11: Guardrail test — forbid direct SDK calls in `lib/agents/`

**Files:**
- Create: `lib/agents/no-direct-anthropic.test.ts`

- [ ] **Step 1: Write the test**

Create `lib/agents/no-direct-anthropic.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) yield full;
  }
}

describe("agent guardrails", () => {
  it("no agent file calls anthropic.messages.create or .stream directly", () => {
    const offenders: string[] = [];
    for (const file of walk(join(__dirname, "."))) {
      const src = readFileSync(file, "utf8");
      if (/\bmessages\.create\b/.test(src) || /\bmessages\.stream\b/.test(src)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `Direct Anthropic SDK calls found in lib/agents/. ` +
        `Use loggedMessagesCreate / loggedMessagesStream from @/lib/ai/anthropic instead.\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expect PASS**

```bash
pnpm exec vitest run lib/agents/no-direct-anthropic.test.ts
```

Expected: passes. If it fails, the offending file is the one to fix — go back to Task 8 or 9.

- [ ] **Step 3: Sanity-check the negative case**

Temporarily insert `// foo.messages.create` into any agent file. Re-run the test. Expected: it FAILS with the file listed. Revert the change.

- [ ] **Step 4: Commit**

```bash
git add lib/agents/no-direct-anthropic.test.ts
git commit -m "test(agents): forbid direct anthropic.messages.* calls in lib/agents/"
```

---

## Task 12: End-to-end verification

- [ ] **Step 1: Run the whole test suite**

```bash
pnpm exec vitest run
```

Expected: all green. If anything fails, fix the underlying issue before proceeding — do not skip.

- [ ] **Step 2: Lint clean**

```bash
pnpm biome check .
```

Expected: zero errors.

- [ ] **Step 3: Manual full-flow check**

With `supabase start` and `pnpm dev` running, in the app:

1. Sign in.
2. Send a health question (triggers classifier → RAG → response).
3. Send a news request (triggers classifier → news; news agent doesn't call Claude, so only one row).
4. Send a general greeting (triggers classifier → response).

For each turn, `psql` query:

```sql
select agent, prompt_id, prompt_version, prompt_hash, model, temperature,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       cost_usd, duration_ms, status, error_message
from public.llm_calls
where session_id = '<your-session-id>'
order by started_at;
```

Verify against this checklist (mirrors the spec's verification list):

- [ ] Health turn produces exactly 2 rows: `classifier` then `response`.
- [ ] News turn produces exactly 1 row: `classifier`.
- [ ] Greeting produces exactly 2 rows: `classifier` then `response`.
- [ ] All rows have non-zero `input_tokens`.
- [ ] All `agent='response'` rows have non-zero `output_tokens` (greater than the `agent='classifier'` ones).
- [ ] `cost_usd` is populated and non-zero on every `status='ok'` row.
- [ ] `prompt_hash` is the same across rows of the same `(prompt_id, prompt_version)` (no drift).

- [ ] **Step 4: Drift-detector sanity check**

```sql
select prompt_id, prompt_version, count(distinct prompt_hash)
from public.llm_calls
group by 1, 2
having count(distinct prompt_hash) > 1;
```

Expected: zero rows. If any row appears, a developer changed prompt text without bumping `version`.

- [ ] **Step 5: Failure-mode check (fire-and-forget)**

In a scratch terminal, simulate a Supabase outage by setting `SUPABASE_SERVICE_ROLE_KEY` to a deliberately wrong value in a duplicate `.env.local.broken`, restart the dev server with that env, and send a chat message.

Expected: the chat reply still streams to the user; `console.error` shows `[llm-audit] insert failed: ...`. Restore the real env after.

- [ ] **Step 6: Final commit (if any local fixes were made during verification)**

```bash
git status
# If anything changed during verification, commit it with a focused message.
```

---

## Self-Review (run before handing off)

Spec coverage check — every section of `docs/superpowers/specs/2026-05-10-llm-audit-log-design.md` maps to a task above:

| Spec section | Task |
|---|---|
| Schema (`llm_calls` table, RLS) | Task 1 |
| Prompt Registry | Task 2 |
| Pricing | Task 3 |
| Audit Context | Task 4 |
| Service-role client (referenced in SDK Wrapper) | Task 5 |
| SDK Wrapper (non-streaming) | Task 6 |
| SDK Wrapper (streaming) | Task 7 |
| Call-site changes — orchestrator | Task 8 |
| Call-site changes — response agent | Task 9 |
| Call-site changes — `/api/chat/route.ts` | Task 10 |
| Testing — guardrail | Task 11 |
| Verification Checklist | Task 12 |

No placeholders. Function names are consistent: `loggedMessagesCreate`, `loggedMessagesStream`, `auditContext.run`, `auditContext.get`, `createServiceRoleClient`, `computeCostUsd`, `promptHash`, `CLASSIFIER_PROMPT`, `RESPONSE_DEFAULT_PROMPT`. Type names: `PromptDef`, `AuditContext`, `LoggedCallMeta`, `AuditUsage`. The `chat_message_id` column was deliberately removed from the schema during spec self-review and is not referenced in any task.
