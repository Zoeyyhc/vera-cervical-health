# Epic 4 — #42 OpenAI Client + Embeddings Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the OpenAI TypeScript SDK, expose a typed `getOpenAIClient()` factory in `lib/ai/openai.ts`, and add an `embedText(text)` helper in `lib/rag/embed.ts` that calls `text-embedding-3-small` and returns the 1536-dim vector. Foundation for the rest of Epic 4 (chunking write helper, retrieval, RAG agent).

**Architecture:** Mirrors the Anthropic client pattern from #18. The SDK uses `openai` (the official Node SDK), the factory consumes `env.openaiApiKey` from the already-validated `lib/env.ts`, the model string `text-embedding-3-small` is hard-coded in `lib/ai/openai.ts` per `CLAUDE.md` convention. The `embedText` helper is the only thing the rest of Epic 4 should call — keeps the SDK surface area small and lets us swap embedding providers later (Voyage, Cohere) without touching downstream code.

**Tech Stack:** `openai` SDK (latest stable), TypeScript strict, Vitest (`node` env — the SDK refuses to instantiate under jsdom for the same security reason as Anthropic), Biome.

**Issue:** [#42](https://github.com/Zoeyyhc/cervix-assistant/issues/42)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-01
**Depends on:** —

---

## Pre-existing scaffolding

- ✅ `OPENAI_API_KEY` already documented in `.env.example` (Epic 1) and `docs/env-vars.md`
- ✅ `lib/env.ts` already validates and exports `env.openaiApiKey` via `requireEnv()`
- ✅ `lib/ai/` directory exists (used by Anthropic client + system prompt + streaming + context-window)
- ❌ `lib/rag/` directory doesn't exist yet — this ticket creates it
- ✅ `vitest.setup.ts` already stubs `OPENAI_API_KEY` for tests (added in #18)

## Gaps vs #42 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `openai` SDK added (version pinned) | ❌ | **Task 2** |
| `OPENAI_API_KEY` documented | ✅ Already in place | None — verify in pre-flight |
| `lib/ai/openai.ts` exports `getOpenAIClient()` | ❌ | **Task 3** |
| `lib/rag/embed.ts` exports `embedText(text): Promise<number[]>` | ❌ | **Task 4** |
| Model string `text-embedding-3-small` hard-coded | ❌ | Task 3 (`EMBEDDING_MODEL` constant) |
| Vitest unit tests | ❌ | Tasks 3, 4 |

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | **Modify** | Add `openai` dependency (pinned, no caret) |
| `lib/ai/openai.ts` | **Create** | Exports `EMBEDDING_MODEL` constant + `getOpenAIClient()` factory consuming `env.openaiApiKey` |
| `lib/ai/openai.test.ts` | **Create** | Factory + constant tests (under `node` env) |
| `lib/rag/embed.ts` | **Create** | Exports `embedText(text: string): Promise<number[]>` — calls `embeddings.create` with `EMBEDDING_MODEL`, returns the first embedding |
| `lib/rag/embed.test.ts` | **Create** | Unit tests with mocked SDK: call shape, return shape, error propagation |

**Files not touched:**
- `.env.example` and `docs/env-vars.md` — `OPENAI_API_KEY` already in place.
- `lib/env.ts` — `env.openaiApiKey` already exists.
- `vitest.setup.ts` — env stub already in place.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/openai-embeddings-42`.

- [ ] **Step B: Confirm env-var docs + lib/env.ts already wire `OPENAI_API_KEY`**

```bash
grep -n "OPENAI_API_KEY\|openaiApiKey" .env.example docs/env-vars.md lib/env.ts
```
Expected: hits in all three (`.env.example` line 17, `docs/env-vars.md` Anthropic/OpenAI section, `lib/env.ts` env object).

- [ ] **Step C: Confirm `openai` is not yet installed**

```bash
grep '"openai"' package.json || echo "not yet installed (expected)"
```

- [ ] **Step D: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 177/177 with real Supabase env, or 165/177 (12 skipped) without. Biome and tsc clean.

---

## Task 1: Decide and document the surface

**Files:** none — design notes that flow into Tasks 3-4.

These decisions are explicit so the executor doesn't have to make them mid-implementation:

1. **Two files**: `lib/ai/openai.ts` for the client factory, `lib/rag/embed.ts` for the embedding helper. Per the AC. Keeps `lib/rag/` semantically pure (RAG-specific helpers) and `lib/ai/` for SDK plumbing.
2. **`EMBEDDING_MODEL = "text-embedding-3-small"`** as a named constant in `lib/ai/openai.ts`. Hard-coded per `CLAUDE.md`. Both `embedText` and any future similarity-checks consume from there.
3. **`embedText` returns `number[]`**, not the SDK's full response shape. Strips the wrapper so callers don't depend on OpenAI's internal types — easier to swap providers later.
4. **No retry / fallback logic in v1.** SDK defaults handle transient errors; if persistent failures become an issue we add retry at the call site (e.g., `ingestDocument`).
5. **Tests run under `node` env** — same as the Anthropic client. The OpenAI SDK has the same browser-detection guard.

- [ ] **Step 1: Acknowledge the decisions** — no code yet.

---

## Task 2: Install the OpenAI SDK

**Files:** `package.json`, `pnpm-lock.yaml`.

- [ ] **Step 1: Add the dependency**

```bash
pnpm add openai
```

- [ ] **Step 2: Pin the version (strip the caret)**

Open `package.json`. Find the line like:
```json
"openai": "^X.Y.Z",
```
Change to:
```json
"openai": "X.Y.Z",
```

(Use whatever version `pnpm add` resolved to. Match the pinning convention from `@anthropic-ai/sdk` in #18.)

Re-run `pnpm install` to refresh the lockfile against the pinned spec:
```bash
pnpm install
```

- [ ] **Step 3: Verify the SDK imports cleanly**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | head -10
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add openai SDK for Epic 4 embeddings"
```

---

## Task 3: OpenAI client factory (TDD)

**Files:** `lib/ai/openai.ts`, `lib/ai/openai.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/openai.test.ts`:

```typescript
// @vitest-environment node
// The OpenAI SDK refuses to instantiate under a browser-like global (jsdom —
// the default Vitest environment) to keep secrets out of bundles. Server-only
// modules under lib/ai/ run under the Node environment in tests.

import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL, getOpenAIClient } from "./openai";

describe("EMBEDDING_MODEL", () => {
  it("is hard-coded to text-embedding-3-small", () => {
    // Per CLAUDE.md: model strings are hard-coded, never from env.
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
  });
});

describe("getOpenAIClient", () => {
  it("returns an OpenAI SDK instance", () => {
    const client = getOpenAIClient();
    expect(client).toBeInstanceOf(OpenAI);
  });

  it("exposes the embeddings namespace", () => {
    const client = getOpenAIClient();
    expect(typeof client.embeddings.create).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm test lib/ai/openai.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./openai`.

- [ ] **Step 3: Write the implementation**

Create `lib/ai/openai.ts`:

```typescript
import { env } from "@/lib/env";
import OpenAI from "openai";

/**
 * Hard-coded per CLAUDE.md — never read from env. All embedding calls in
 * lib/rag/ use this exact model string. Bumping requires a code change + PR
 * review, and a re-embedding of the existing knowledge_chunks rows (the
 * 1536-dim vector column would need to match a new model's output shape).
 */
export const EMBEDDING_MODEL = "text-embedding-3-small" as const;

/**
 * Returns a typed OpenAI SDK client. The API key is consumed from the
 * already-validated `env.openaiApiKey` (see `lib/env.ts`) — module load
 * fails fast if the var is missing, so consumers don't need to null-check.
 */
export function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: env.openaiApiKey });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
pnpm test lib/ai/openai.test.ts 2>&1 | tail -5
```
Expected: 3/3 passing.

- [ ] **Step 5: Biome**

```bash
pnpm biome check --write lib/ai/openai.ts lib/ai/openai.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/openai.ts lib/ai/openai.test.ts
git commit -m "feat(ai): add typed OpenAI client factory with hard-coded EMBEDDING_MODEL"
```

---

## Task 4: `embedText` helper (TDD)

**Files:** `lib/rag/embed.ts`, `lib/rag/embed.test.ts`.

- [ ] **Step 1: Make the directory**

```bash
mkdir -p lib/rag
```

(`lib/rag/` is the canonical location per `CLAUDE.md` § Structure — embedding, chunking, retrieval utilities.)

- [ ] **Step 2: Write the failing test**

Create `lib/rag/embed.test.ts`:

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai/openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/openai")>();
  return {
    ...actual,
    getOpenAIClient: vi.fn(),
  };
});

import { EMBEDDING_MODEL, getOpenAIClient } from "@/lib/ai/openai";
import { embedText } from "./embed";

function mockOpenAI(embedding: number[] | Error) {
  return {
    embeddings: {
      create:
        embedding instanceof Error
          ? vi.fn().mockRejectedValue(embedding)
          : vi.fn().mockResolvedValue({ data: [{ embedding }] }),
    },
  };
}

describe("embedText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls embeddings.create with EMBEDDING_MODEL and the input text", async () => {
    const fakeEmbedding = Array.from({ length: 1536 }, () => 0.1);
    const openai = mockOpenAI(fakeEmbedding);
    vi.mocked(getOpenAIClient).mockReturnValue(openai as never);

    await embedText("What is HPV?");

    expect(openai.embeddings.create).toHaveBeenCalledTimes(1);
    const args = openai.embeddings.create.mock.calls[0] as unknown as [
      { model: string; input: string },
    ];
    expect(args[0].model).toBe(EMBEDDING_MODEL);
    expect(args[0].input).toBe("What is HPV?");
  });

  test("returns the first embedding's vector as number[]", async () => {
    const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => i / 1536);
    const openai = mockOpenAI(fakeEmbedding);
    vi.mocked(getOpenAIClient).mockReturnValue(openai as never);

    const result = await embedText("anything");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1536);
    expect(result).toEqual(fakeEmbedding);
  });

  test("propagates errors from the SDK", async () => {
    const openai = mockOpenAI(new Error("OpenAI exploded"));
    vi.mocked(getOpenAIClient).mockReturnValue(openai as never);

    await expect(embedText("anything")).rejects.toThrow("OpenAI exploded");
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
pnpm test lib/rag/embed.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./embed`.

- [ ] **Step 4: Write the implementation**

Create `lib/rag/embed.ts`:

```typescript
import { EMBEDDING_MODEL, getOpenAIClient } from "@/lib/ai/openai";

/**
 * Embed a single text string and return its 1536-dim vector. Wraps the
 * OpenAI SDK so callers under `lib/rag/` don't depend on the SDK's response
 * shape — easier to swap providers (Voyage, Cohere) later if needed.
 *
 * Errors from the SDK propagate; retries are handled by the SDK's defaults
 * for v1.
 */
export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm test lib/rag/embed.test.ts 2>&1 | tail -5
```
Expected: 3/3 passing.

- [ ] **Step 6: Biome + tsc**

```bash
pnpm biome check --write lib/rag/embed.ts lib/rag/embed.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/rag/embed.ts lib/rag/embed.test.ts
git commit -m "feat(rag): add embedText helper for OpenAI text-embedding-3-small"
```

---

## Task 5: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 177 baseline + **3** (openai factory) + **3** (embedText) = **183**.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -5
```
Expected: all clean; build succeeds.

- [ ] **Step 3: Commit the source ticket doc + plan**

The Epic 4 ticket-breakdown doc (`docs/epics/epic4-rag-knowledge-base-tickets.md`) is currently untracked from the brainstorming session. Fold it into this PR alongside the plan — same pattern as Epic 3 #17.

```bash
git add docs/epics/epic4-rag-knowledge-base-tickets.md
git commit -m "docs(epic-4): add ticket breakdown for the RAG knowledge base"

git add docs/superpowers/plans/2026-05-02-epic4-openai-embeddings.md
git commit -m "docs(plan): add Epic 4 #42 OpenAI client + embeddings plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/openai-embeddings-42
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/openai-embeddings-42 \
  --title "feat(rag): #42 — OpenAI client + embeddings helper" \
  --body "$(cat <<'EOF'
## Summary
- Install `openai` SDK (pinned)
- Add `lib/ai/openai.ts` — typed client factory + hard-coded `EMBEDDING_MODEL = "text-embedding-3-small"` constant (per `CLAUDE.md`)
- Add `lib/rag/embed.ts` — `embedText(text): Promise<number[]>` returning the 1536-dim vector (strips the SDK's response wrapper so downstream code under `lib/rag/` doesn't depend on OpenAI's internal types)
- Vitest tests:
  - Factory: model constant, `OpenAI` instance, `embeddings` namespace exposed (runs under `node` env because the SDK refuses to instantiate under jsdom)
  - `embedText`: call shape (model + input), return shape (`number[]`, length 1536), error propagation

## Pre-existing scaffolding (no work needed)
- `OPENAI_API_KEY` was already documented in `.env.example` and `docs/env-vars.md` (Epic 1)
- `lib/env.ts` already validates and exports `env.openaiApiKey` (Epic 1)
- `vitest.setup.ts` already stubs the env var so tests load `lib/env.ts` cleanly (#18)

## Drive-by
- Includes `docs/epics/epic4-rag-knowledge-base-tickets.md` — the ticket-breakdown doc that's been sitting untracked since the Epic 4 brainstorming session. Same pattern as #17 folding the Epic 3 breakdown into the first ticket's PR.

## Test plan
- [x] `pnpm test` — 183/183 across 18 files (was 177 — +6 net: 3 factory + 3 embedText)
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — succeeds

Closes #42. Unblocks the rest of Epic 4 (chunking helper consumers, retrieval helper, RAG agent).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #42 maps to a Task — SDK install (2), factory file path + `getOpenAIClient` (3), `lib/rag/embed.ts` + `embedText` (4), hard-coded model string (3), Vitest tests at both layers (3, 4).
- **Placeholder scan:** no TBD/TODO. The single `X.Y.Z` placeholder in Task 2 is the literal version `pnpm add` returns at runtime — explicit.
- **Type consistency:** `EMBEDDING_MODEL` is the single source of truth in `lib/ai/openai.ts`; `embedText` imports it and the test asserts against the same import.
- **Browser-guard handling:** consistent with #18 — both factory tests use `// @vitest-environment node`. The `embedText` test mocks the factory entirely so it doesn't need the node env, but using node anyway for symmetry doesn't hurt.
- **Pattern consistency:** Anthropic client (#18) was the reference. Same shape: typed factory, hard-coded model constant, env-driven API key, mocked-SDK tests.
