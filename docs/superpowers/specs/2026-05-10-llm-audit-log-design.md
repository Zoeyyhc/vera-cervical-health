# LLM Audit Log — Design

**Date:** 2026-05-10
**Status:** Approved (pending implementation plan)

## Goal

Capture a complete, queryable audit trail of every Claude API call the app makes, so that:

- Cost is attributable per user, per session, per agent, per prompt version (`input_tokens`, `output_tokens`, `cache_*`, `cost_usd`).
- Model and parameters at the time of each call are recoverable (`model`, `temperature`, `max_tokens`, `streamed`).
- Prompt drift is detectable (`prompt_id`, `prompt_version`, `prompt_hash`).
- Latency and outcome are visible (`duration_ms`, `status`, `error_message`).

The user-visible chat must not regress — audit writes are fire-and-forget and never block the response stream.

## Scope

In scope:

- Every Anthropic SDK call site in the app: orchestrator's intent classifier, response agent's streaming responder, and any future agent that calls Claude.
- A new dedicated `llm_calls` table.
- A central SDK wrapper that is the only sanctioned way to call Anthropic.
- A prompt registry with explicit versions and content hashes.
- Request-scoped context plumbed via `AsyncLocalStorage` so agents stay pure.

Out of scope (explicit non-goals):

- No admin UI. Query the table via Supabase Studio / psql.
- No retention/TTL job. Table grows unbounded for v1.
- No queue or retry layer. Lost rows on a Supabase outage are tolerable.
- No budget alarms or automated spend caps.
- No external export (Grafana, Datadog, Metabase).
- OpenAI embedding calls (`text-embedding-3-small`) are not logged — separate spec if desired.
- News/events agents don't call Claude today; nothing to log there.

## Decisions (locked from brainstorming)

| Question | Decision |
|---|---|
| Granularity | One row per LLM API call. ~2 rows per chat turn today (classifier + responder). |
| Storage | New dedicated `llm_calls` table with `session_id` FK. Not `analytics_events`, not `chat_messages.metadata`. |
| Prompt versioning | Constant + content hash. Manual `version` bump on intentional change; sha256 catches accidental drift. No DB-backed prompt table. |
| Capture point | A central SDK wrapper in `lib/ai/anthropic.ts` (`loggedMessagesCreate`, `loggedMessagesStream`). Direct `messages.create` / `messages.stream` is forbidden in agents. |
| Content stored | Metadata only. Correlate to chat via `session_id` + `started_at`. No prompt or completion text duplicated on the audit row. |
| Write reliability | Fire-and-forget. `console.error` on failure. Never blocks chat. |
| Admin visibility | SQL-only for v1. |
| Context plumbing | `AsyncLocalStorage` opened in `/api/chat` route. Agents stay pure. |

## Schema

New migration: `supabase/migrations/<ts>_create_llm_calls.sql`.

```sql
create table public.llm_calls (
  id                 uuid primary key default gen_random_uuid(),

  -- Who/what this call belongs to. Both nullable so non-chat (e.g. admin
  -- ingest) calls log too. Per-message linkage is reconstructible from
  -- (session_id, started_at) — no chat_message_id FK because the assistant
  -- chat_messages row is inserted after streaming ends, racing the audit
  -- write. Add later via column + backfill if a use case appears.
  user_id            uuid references public.profiles(id)      on delete set null,
  session_id         uuid references public.chat_sessions(id) on delete set null,

  -- Which call site
  agent              text not null,        -- 'classifier' | 'response' | future agents
  prompt_id          text not null,        -- 'classifier' | 'response.default' | 'response.override'
  prompt_version     text not null,        -- 'v1' — manual bump on intentional change
  prompt_hash        text not null,        -- sha256 of base system prompt text — drift detector

  -- Model + params
  model              text not null,        -- 'claude-sonnet-4-6'
  temperature        numeric(4,3),         -- nullable: SDK default when caller omits
  max_tokens         integer not null,
  streamed           boolean not null default false,

  -- Cost
  input_tokens       integer not null,
  output_tokens      integer not null,
  cache_read_tokens  integer not null default 0,   -- usage.cache_read_input_tokens
  cache_write_tokens integer not null default 0,   -- usage.cache_creation_input_tokens
  cost_usd           numeric(10,6),                -- computed at write time

  -- Timing & outcome
  started_at         timestamptz not null,
  duration_ms        integer not null,
  status             text not null check (status in ('ok','error')),
  error_message      text,                         -- nullable; populated on status='error'

  created_at         timestamptz not null default now()
);

create index on public.llm_calls (user_id, created_at desc);
create index on public.llm_calls (agent,   created_at desc);
create index on public.llm_calls (session_id);
create index on public.llm_calls (created_at desc);   -- daily cost rollups

alter table public.llm_calls enable row level security;

-- Admins can read everything. No anon, no user-role select.
-- Reuses the existing security-definer `public.is_admin()` helper from the
-- profiles migration so the policy doesn't read profiles directly.
create policy llm_calls_admin_select on public.llm_calls
  for select using (public.is_admin());

-- No insert/update/delete policy. Writes happen via the service-role client
-- inside the SDK wrapper, which bypasses RLS by design.
```

## Prompt Registry

New file: `lib/ai/prompts.ts`. Single source of truth for every system prompt the app uses.

```ts
import { createHash } from "node:crypto";

export type PromptDef = {
  id: string;        // 'classifier' | 'response.default'
  version: string;   // 'v1' — bump manually on intentional edits
  text: string;      // the prompt text used at call time
};

function defPrompt(id: string, version: string, text: string): PromptDef {
  return { id, version, text };
}

export const CLASSIFIER_PROMPT = defPrompt(
  "classifier",
  "v1",
  `You classify the user's message into exactly ONE of these categories...`,
);

export const RESPONSE_DEFAULT_PROMPT = defPrompt(
  "response.default",
  "v1",
  `<contents of DEFAULT_SYSTEM_PROMPT moved here>`,
);

export function promptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
```

`lib/agents/orchestrator.ts` and `lib/ai/system-prompt.ts` import from `lib/ai/prompts.ts` instead of defining strings locally. The `DEFAULT_SYSTEM_PROMPT` re-export from `system-prompt.ts` may stay as a thin alias to avoid churn elsewhere.

Drift handling: if a developer edits a prompt's `text` without bumping `version`, the `prompt_hash` column changes while `prompt_version` stays the same. A periodic SQL query catches this:

```sql
select prompt_id, prompt_version, count(distinct prompt_hash)
from llm_calls
group by 1, 2
having count(distinct prompt_hash) > 1;
```

## Audit Context (AsyncLocalStorage)

New file: `lib/ai/audit-context.ts`.

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type AuditContext = {
  /** Service-role client. Insert-only use inside the wrapper; never returned to callers. */
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

`/api/chat/route.ts` opens the context once per request and never mutates it afterward — there's no per-message FK to update mid-flight.

If `auditContext.get()` returns `undefined` (e.g. unit tests that don't open a context), the wrapper skips the insert silently — never throws.

## SDK Wrapper

`lib/ai/anthropic.ts` adds two helpers. The existing `getAnthropicClient()` and `CLAUDE_MODEL` exports stay.

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { auditContext } from "@/lib/ai/audit-context";
import { type PromptDef, promptHash } from "@/lib/ai/prompts";
import { computeCostUsd } from "@/lib/ai/pricing";

type LoggedCallMeta = {
  agent: string;            // 'classifier' | 'response' | future
  prompt: PromptDef;
};

export async function loggedMessagesCreate(
  params: Anthropic.MessageCreateParamsNonStreaming,
  meta: LoggedCallMeta,
): Promise<Anthropic.Message> {
  const startedAt = new Date();
  const t0 = performance.now();
  try {
    const res = await getAnthropicClient().messages.create(params);
    void writeAuditRow({
      params, meta, startedAt, t0,
      usage: res.usage, status: "ok", streamed: false,
    });
    return res;
  } catch (err) {
    void writeAuditRow({
      params, meta, startedAt, t0,
      usage: null, status: "error", streamed: false, error: err,
    });
    throw err;
  }
}

export async function* loggedMessagesStream(
  params: Anthropic.MessageStreamParams,
  meta: LoggedCallMeta,
): AsyncIterable<Anthropic.MessageStreamEvent> {
  const startedAt = new Date();
  const t0 = performance.now();
  let usage: Anthropic.Usage | null = null;
  try {
    const stream = getAnthropicClient().messages.stream(params);
    for await (const ev of stream) {
      if (ev.type === "message_delta" && ev.usage) {
        usage = { ...(usage ?? {}), ...ev.usage } as Anthropic.Usage;
      }
      yield ev;
    }
    const finalMessage = await stream.finalMessage();
    usage = finalMessage.usage;
    void writeAuditRow({
      params, meta, startedAt, t0,
      usage, status: "ok", streamed: true,
    });
  } catch (err) {
    void writeAuditRow({
      params, meta, startedAt, t0,
      usage, status: "error", streamed: true, error: err,
    });
    throw err;
  }
}

async function writeAuditRow(args: {
  params: Anthropic.MessageCreateParamsNonStreaming | Anthropic.MessageStreamParams;
  meta: LoggedCallMeta;
  startedAt: Date;
  t0: number;
  usage: Anthropic.Usage | null;
  status: "ok" | "error";
  streamed: boolean;
  error?: unknown;
}): Promise<void> {
  const ctx = auditContext.get();
  if (!ctx) return;

  const u = args.usage;
  const row = {
    user_id:            ctx.userId,
    session_id:         ctx.sessionId,
    agent:              args.meta.agent,
    prompt_id:          args.meta.prompt.id,
    prompt_version:     args.meta.prompt.version,
    prompt_hash:        promptHash(args.meta.prompt.text),
    model:              args.params.model,
    temperature:        args.params.temperature ?? null,
    max_tokens:         args.params.max_tokens,
    streamed:           args.streamed,
    input_tokens:       u?.input_tokens ?? 0,
    output_tokens:      u?.output_tokens ?? 0,
    cache_read_tokens:  u?.cache_read_input_tokens ?? 0,
    cache_write_tokens: u?.cache_creation_input_tokens ?? 0,
    cost_usd:           u ? computeCostUsd(args.params.model, u) : null,
    started_at:         args.startedAt.toISOString(),
    duration_ms:        Math.round(performance.now() - args.t0),
    status:             args.status,
    error_message:      args.error instanceof Error ? args.error.message : null,
  };

  const { error } = await ctx.supabaseAdmin.from("llm_calls").insert(row);
  if (error) console.error("[llm-audit] insert failed:", error.message);
}
```

Key properties:

- **Single chokepoint.** Every Claude call goes through `loggedMessagesCreate` / `loggedMessagesStream`. A unit test scans `lib/agents/` for `messages.create` / `messages.stream` to enforce this.
- **Fire-and-forget.** `void writeAuditRow(...)` is never awaited. Chat latency unaffected. A failed insert logs to console; the caller never sees it.
- **Streaming usage.** Final input/output token counts come from `stream.finalMessage().usage`. Cache-read and cache-write tokens come from the same `usage` object.
- **Errors still log.** A thrown SDK error writes `status='error'` with the error message; usage may be partial or null.

## Pricing

New file: `lib/ai/pricing.ts`. Hard-coded price table per model — bumps require a code change + PR.

```ts
import type Anthropic from "@anthropic-ai/sdk";

type ModelPrices = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
};

const PRICES: Record<string, ModelPrices> = {
  "claude-sonnet-4-6": {
    inputPerMillion:      3.00,   // confirm against current Anthropic pricing at impl time
    outputPerMillion:    15.00,
    cacheReadPerMillion:  0.30,
    cacheWritePerMillion: 3.75,
  },
};

export function computeCostUsd(
  model: string,
  usage: Anthropic.Usage,
): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (
    (usage.input_tokens                    * p.inputPerMillion      +
     usage.output_tokens                   * p.outputPerMillion     +
     (usage.cache_read_input_tokens   ?? 0) * p.cacheReadPerMillion +
     (usage.cache_creation_input_tokens ?? 0) * p.cacheWritePerMillion) / 1_000_000
  );
}
```

Returns `null` for unknown models so `cost_usd` is nullable rather than wrong. The exact per-million rates are confirmed against Anthropic's published pricing during implementation.

## Call-site Changes

**`lib/agents/orchestrator.ts`** — classifier:

```ts
import { loggedMessagesCreate } from "@/lib/ai/anthropic";
import { CLASSIFIER_PROMPT } from "@/lib/ai/prompts";

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
```

**`lib/agents/response-agent.ts`** — streaming responder:

```ts
import { loggedMessagesStream } from "@/lib/ai/anthropic";
import { RESPONSE_DEFAULT_PROMPT } from "@/lib/ai/prompts";

const promptDef = ctx.systemPrompt
  ? { id: "response.override", version: "v1", text: ctx.systemPrompt }
  : RESPONSE_DEFAULT_PROMPT;

const finalSystem = ctx.groundingContext
  ? `${promptDef.text}\n\nRetrieved context:\n${ctx.groundingContext}`
  : promptDef.text;

const stream = loggedMessagesStream(
  { model: CLAUDE_MODEL, max_tokens: MAX_TOKENS, system: finalSystem, messages },
  { agent: "response", prompt: promptDef },
);

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    yield { type: "text", text: event.delta.text };
  }
}
```

Only the **base prompt** (`promptDef.text`) is hashed and version-tracked. Appended grounding context (`Retrieved context:\n...`) varies per turn and is captured indirectly via `chat_messages.metadata.sources`. Including it in the hash would defeat the drift detector.

**`/api/chat/route.ts`** — open the audit context once around the orchestrator:

```ts
import { auditContext } from "@/lib/ai/audit-context";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const supabaseAdmin = createServiceRoleClient();

return auditContext.run(
  { supabaseAdmin, userId, sessionId },
  async () => {
    // existing orchestrator wiring + assistant message insert (unchanged)
  },
);
```

A service-role Supabase client factory (`lib/supabase/admin.ts`) is added if it doesn't already exist. It reads `SUPABASE_SERVICE_ROLE_KEY` from validated env and is server-only.

## Testing

Per `feedback_testing-strategy.md`: Vitest only. No Playwright unless explicitly requested.

**`lib/ai/anthropic.test.ts`** (extend existing):
- `loggedMessagesCreate` writes a row with input/output tokens, model, params, prompt_id/version/hash, status='ok', and `duration_ms > 0`.
- SDK errors propagate to the caller AND a row with `status='error'` and `error_message` is written.
- When `auditContext.get()` returns undefined, the call still succeeds and the insert is skipped — no throw.
- Supabase insert errors are caught, `console.error`'d, and never bubble up.

**`lib/ai/anthropic.test.ts`** — streaming:
- `loggedMessagesStream` yields all upstream events to the consumer.
- Final usage from `stream.finalMessage()` is persisted; partial-stream errors still write a row with whatever usage was collected.
- The insert fires exactly once per call, after consumer iteration ends.

**`lib/ai/prompts.test.ts`** (new):
- Each registered prompt has a stable `id`, non-empty `version`, non-empty `text`.
- `promptHash` is deterministic and 64-char hex.

**`lib/ai/pricing.test.ts`** (new):
- `computeCostUsd('claude-sonnet-4-6', usage)` returns the expected USD figure for known token counts (including cache tokens).
- `computeCostUsd('unknown-model', usage)` returns `null`.

**`lib/agents/no-direct-anthropic.test.ts`** (new — guardrail):
- Greps `lib/agents/**/*.ts` for `messages.create` / `messages.stream`. Fails the suite if found, with a message pointing developers to `loggedMessagesCreate` / `loggedMessagesStream`.

**Existing agent tests** (`orchestrator.test.ts`, `response-agent.test.ts`):
- Update mocks to target `loggedMessagesCreate` / `loggedMessagesStream` instead of `getAnthropicClient`. Assertion shapes don't change.

**Migration smoke**:
- `supabase db reset` applies the new migration cleanly.
- RLS allows admin select; denies anon select.

No test calls the real Anthropic API.

## Verification Checklist (post-implementation)

- [ ] `pnpm vitest` green, including new tests above.
- [ ] `pnpm biome check .` clean.
- [ ] One full chat turn produces exactly two `llm_calls` rows (classifier + responder), both with non-null token counts and `cost_usd`, both linked to the same `session_id`, with `started_at` ordering matching classifier-then-responder.
- [ ] Drift query (above) returns zero rows on a freshly seeded DB.
- [ ] Inducing an Anthropic error (e.g. invalid API key in a scratch test) produces a row with `status='error'`.
- [ ] Disabling Supabase mid-turn does not break the chat response (fire-and-forget).
