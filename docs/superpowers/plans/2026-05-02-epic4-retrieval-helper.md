# Epic 4 — #45 pgvector Retrieval Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lib/rag/retrieve.ts` exporting `retrieveChunks(supabase, queryEmbedding, opts?)` — a typed wrapper around the existing `match_knowledge_chunks` Postgres RPC. Defaults to `threshold: 0.75, count: 5`. Returns a typed `RetrievedChunk[]` array; empty result returns `[]`, not `null`.

**Architecture:** Thin helper that calls `supabase.rpc("match_knowledge_chunks", ...)` and shapes the result. The RPC was already shipped in Epic 1's migration `20260409170904_create_knowledge_chunks.sql` — no SQL changes here. The helper exists to keep the SDK call shape, threshold/count defaults, and result-mapping logic in one place so the RAG agent (#46) doesn't need to know about pgvector internals.

**One typing wrinkle:** Supabase's auto-generated types declare `query_embedding: string` for the RPC arg (PostgREST's introspection doesn't surface pgvector types cleanly). At runtime Supabase JS serializes either a `number[]` or a `string` literal correctly — pgvector casts both. The helper accepts `number[]` (caller-friendly, matches `embedText`'s return shape) and passes through with a cast at the boundary.

**Tech Stack:** TypeScript strict, `@supabase/supabase-js`, Vitest, Biome.

**Issue:** [#45](https://github.com/Zoeyyhc/cervix-assistant/issues/45)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-04
**Depends on:** #42 (`embedText` returns `number[]`) — already merged.

---

## Pre-existing scaffolding

- ✅ `match_knowledge_chunks` RPC defined in `20260409170904_create_knowledge_chunks.sql` (Epic 1)
- ✅ Generated types in `types/supabase.ts` declare it under `Database["public"]["Functions"]["match_knowledge_chunks"]`
- ✅ `knowledge_chunks` RLS allows all authenticated users to SELECT, so the RPC works under any signed-in session

## Gaps vs #45 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `lib/rag/retrieve.ts` exports `retrieveChunks(supabase, queryEmbedding, opts?)` | ❌ | **Task 1** |
| Defaults `threshold: 0.75`, `count: 5` | ❌ | Task 1 |
| Calls `supabase.rpc("match_knowledge_chunks", ...)` | ❌ | Task 1 |
| Returns typed `RetrievedChunk[]` with `id`, `source`, `content`, `similarityScore`, `metadata` | ❌ | Task 1 |
| Empty result → `[]` (not null) | ❌ | Task 1 |
| Vitest unit tests | ❌ | Task 1 |

## Decisions documented in this plan

- **`queryEmbedding: number[]`** in the public signature, cast to `string` at the SDK boundary. Caller-friendly; matches `embedText` output. The cast is `as unknown as string` with a `biome-ignore` comment explaining the PostgREST quirk.
- **`similarityScore`** (camelCase) in the public type, even though the RPC returns `similarity_score`. Matches TypeScript convention and lets us swap RPCs later without breaking callers.
- **`metadata` is `Record<string, unknown> | null`** in the public type. The RPC returns `Json` (the generated alias) but consumers want a flat record.
- **No retries.** Supabase JS handles transient errors; if specific failure modes show up later, add narrow handling at the call site.
- **Throws on error.** Symmetric with `embedText` — the caller (RAG agent #46) will compose the two and let errors bubble to the orchestrator.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/rag/retrieve.ts` | **Create** | Exports `RetrievedChunk` type, `RetrieveOptions` type, `retrieveChunks()` async function |
| `lib/rag/retrieve.test.ts` | **Create** | Vitest unit tests with mocked `supabase.rpc`: call shape, defaults, custom opts, empty result, error propagation, result mapping |

**Files not touched:**
- `supabase/migrations/*` — RPC is already in place from Epic 1.
- `types/supabase.ts` — already includes `match_knowledge_chunks`.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/retrieval-helper-45`.

- [ ] **Step B: Confirm the RPC + types are present**

```bash
grep -n "match_knowledge_chunks" types/supabase.ts | head -3
```
Expected: hits in the generated types.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 183/183 (or with #43 merged: 194/194). All clean.

---

## Task 1: TDD `retrieveChunks`

**Files:** `lib/rag/retrieve.ts`, `lib/rag/retrieve.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `lib/rag/retrieve.test.ts`:

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import { type RetrievedChunk, retrieveChunks } from "./retrieve";

type RpcRow = {
  id: string;
  source: string | null;
  content: string;
  similarity_score: number;
  metadata: unknown;
};

function mockSupabaseRpc(data: RpcRow[] | null, error: Error | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const supabase = { rpc } as unknown as Parameters<typeof retrieveChunks>[0];
  return { supabase, rpc };
}

describe("retrieveChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls match_knowledge_chunks with default threshold 0.75 and count 5", async () => {
    const { supabase, rpc } = mockSupabaseRpc([]);
    const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);

    await retrieveChunks(supabase, queryEmbedding);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.75,
      match_count: 5,
    });
  });

  test("respects custom threshold and count via opts", async () => {
    const { supabase, rpc } = mockSupabaseRpc([]);
    const queryEmbedding = [0.1, 0.2];

    await retrieveChunks(supabase, queryEmbedding, { threshold: 0.5, count: 10 });

    expect(rpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 10,
    });
  });

  test("maps RPC rows to RetrievedChunk shape (snake_case → camelCase)", async () => {
    const { supabase } = mockSupabaseRpc([
      {
        id: "c1",
        source: "Cancer Council",
        content: "HPV is...",
        similarity_score: 0.92,
        metadata: { page: 1 },
      },
      {
        id: "c2",
        source: "WHO",
        content: "Cervical screening...",
        similarity_score: 0.83,
        metadata: null,
      },
    ]);

    const result: RetrievedChunk[] = await retrieveChunks(supabase, [0.1]);

    expect(result).toEqual([
      {
        id: "c1",
        source: "Cancer Council",
        content: "HPV is...",
        similarityScore: 0.92,
        metadata: { page: 1 },
      },
      {
        id: "c2",
        source: "WHO",
        content: "Cervical screening...",
        similarityScore: 0.83,
        metadata: null,
      },
    ]);
  });

  test("returns an empty array when the RPC returns no rows", async () => {
    const { supabase } = mockSupabaseRpc([]);
    const result = await retrieveChunks(supabase, [0.1]);
    expect(result).toEqual([]);
  });

  test("returns an empty array when the RPC returns null data", async () => {
    const { supabase } = mockSupabaseRpc(null);
    const result = await retrieveChunks(supabase, [0.1]);
    expect(result).toEqual([]);
  });

  test("throws when the RPC returns an error", async () => {
    const { supabase } = mockSupabaseRpc(null, new Error("rpc exploded"));
    await expect(retrieveChunks(supabase, [0.1])).rejects.toThrow("rpc exploded");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/rag/retrieve.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./retrieve`.

- [ ] **Step 3: Write the implementation**

Create `lib/rag/retrieve.ts`:

```typescript
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_THRESHOLD = 0.75;
const DEFAULT_COUNT = 5;

export type RetrievedChunk = {
  id: string;
  source: string | null;
  content: string;
  /** Cosine similarity, 0–1. Higher = closer match. */
  similarityScore: number;
  metadata: Record<string, unknown> | null;
};

export type RetrieveOptions = {
  /** Cosine similarity floor. Default 0.75 (project spec). */
  threshold?: number;
  /** Max chunks returned. Default 5. */
  count?: number;
};

/**
 * Retrieve knowledge_chunks above a cosine-similarity threshold via the
 * existing `match_knowledge_chunks` RPC (defined in Epic 1's migration).
 *
 * RLS allows all authenticated users to SELECT, so the RPC works under any
 * signed-in user's session — no service role needed.
 *
 * Throws when the RPC errors. Empty result is `[]` (not null).
 */
export async function retrieveChunks(
  supabase: SupabaseClient<Database>,
  queryEmbedding: number[],
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const count = opts.count ?? DEFAULT_COUNT;

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    // PostgREST's introspection types this as `string` but at runtime
    // Supabase JS serializes a number[] correctly and pgvector casts it.
    // biome-ignore lint/suspicious/noExplicitAny: pgvector arg type erasure
    query_embedding: queryEmbedding as any,
    match_threshold: threshold,
    match_count: count,
  });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    source: row.source,
    content: row.content,
    similarityScore: row.similarity_score,
    metadata: row.metadata as Record<string, unknown> | null,
  }));
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test lib/rag/retrieve.test.ts 2>&1 | tail -5
```
Expected: 6/6 passing.

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write lib/rag/retrieve.ts lib/rag/retrieve.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/rag/retrieve.ts lib/rag/retrieve.test.ts
git commit -m "feat(rag): add retrieveChunks helper for cosine similarity search"
```

---

## Task 2: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: baseline + 6 new from `retrieveChunks`.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -3
```

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-02-epic4-retrieval-helper.md
git commit -m "docs(plan): add Epic 4 #45 retrieval helper plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/retrieval-helper-45
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/retrieval-helper-45 \
  --title "feat(rag): #45 — retrieveChunks helper for cosine similarity search" \
  --body "$(cat <<'EOF'
## Summary
- Add `lib/rag/retrieve.ts` exporting `retrieveChunks(supabase, queryEmbedding, opts?)` — a typed wrapper around the existing `match_knowledge_chunks` RPC
- Defaults: `threshold: 0.75`, `count: 5` (project spec)
- Returns typed `RetrievedChunk[]` (snake_case → camelCase mapping; `similarity_score` → `similarityScore`)
- Empty result → `[]`, not null
- Throws on RPC error

## No SQL changes
The `match_knowledge_chunks` Postgres function was already shipped in Epic 1's migration `20260409170904_create_knowledge_chunks.sql`. This PR is the TypeScript-side wrapper that the RAG agent (#46) will call.

## One typing wrinkle worth noting
Supabase's auto-generated types declare `query_embedding: string` for the RPC arg (PostgREST's introspection doesn't surface pgvector cleanly). At runtime Supabase JS serializes either a `number[]` or a string literal correctly — pgvector casts both. The helper accepts `number[]` (caller-friendly, matches `embedText`'s return shape) and casts at the SDK boundary with a `biome-ignore` comment explaining why.

## Tests added (6)
- Calls RPC with default `0.75` / `5`
- Respects custom `threshold` + `count`
- Maps RPC rows to `RetrievedChunk` shape (snake → camel)
- Empty array on no rows
- Empty array on `null` data
- Throws on RPC error

## Test plan
- [x] `pnpm test` — full suite green
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — succeeds

Closes #45. Together with #42 (embed) this gives the RAG agent (#46) all the data-layer pieces it needs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #45 maps to a test case — call shape (default + custom opts), result mapping, empty result, error propagation.
- **Placeholder scan:** no TBD/TODO. The `as any` cast on `query_embedding` is intentional and explained inline.
- **Type consistency:** `RetrievedChunk` and `RetrieveOptions` exported alongside the function. `similarityScore` (camelCase) vs the RPC's `similarity_score` (snake_case) is the deliberate boundary.
- **No SQL change:** verified the RPC exists in Epic 1's migration. Pre-flight Step B confirms generated types include it.
