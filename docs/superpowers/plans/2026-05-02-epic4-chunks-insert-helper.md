# Epic 4 — #44 Knowledge Chunks Insert Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this project disables the strict checkpoint flow per `CLAUDE.md` — execute tasks directly, but still read each step). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lib/rag/store.ts` exporting `ingestDocument(supabase, { content, source, metadata? })` that chunks raw text via `chunkText` (#43), embeds each chunk in parallel with a small concurrency cap via `embedText` (#42), and bulk-inserts all chunks into `knowledge_chunks` in a single Supabase `insert([...])` call. Returns the inserted chunk UUIDs. Used by the admin ingest endpoint (#47) and the seed script (#48).

**Architecture:** Pure composer over `chunkText` + `embedText` + Supabase. No new SDK dependencies. The concurrency cap is a hand-rolled batched-`Promise.all` loop (no `p-limit` dependency). The Supabase client is passed in by the caller — the helper owns no auth state and has no opinion on which client (cookie-aware vs service-role) it gets, matching the agent-purity convention from `CLAUDE.md`. RLS from Epic 2 #12 (`knowledge_chunks` admin-only INSERT) is what gates write access; the caller is responsible for being on an admin session.

**Tech Stack:** TypeScript strict, `@supabase/supabase-js` (typed client), Vitest with mocked `embedText` and a hand-rolled Supabase chain mock, Biome.

**Issue:** [#44](https://github.com/Zoeyyhc/cervix-assistant/issues/44)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-03
**Depends on:** #42 (`embedText`) ✅ merged, #43 (`chunkText`) ✅ merged, Epic 1 `knowledge_chunks` table + Epic 2 #12 RLS policies ✅ shipped.
**Unblocks:** #47 (admin ingest endpoint), #48 (initial KB seed).

---

## Pre-existing scaffolding

- ✅ `chunkText(text, opts?): string[]` from `lib/rag/chunking.ts` (#43)
- ✅ `embedText(text): Promise<number[]>` from `lib/rag/embed.ts` (#42)
- ✅ `knowledge_chunks` table — `id uuid pk default gen_random_uuid(), source text, content text, embedding vector(1536) not null, metadata jsonb, created_at` (Epic 1 migration `20260409170904`)
- ✅ RLS: admins INSERT/UPDATE/DELETE; all authenticated SELECT (Epic 2 #12)
- ✅ Generated types in `types/supabase.ts` — `Database["public"]["Tables"]["knowledge_chunks"]["Insert"]` includes `embedding: string` (PostgREST serializes the `vector(1536)` column as a string in its types, but at runtime the JS client accepts `number[]` and pgvector casts it — same biome-ignore pattern as `lib/rag/retrieve.ts:43`)
- ✅ Existing test patterns to mirror — `lib/rag/retrieve.test.ts` for the Supabase chain mock, `lib/rag/chunking.test.ts` for the test-file shape

## Gaps vs #44 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `lib/rag/store.ts` exports `ingestDocument(supabase, { content, source, metadata? }): Promise<{ chunkIds: string[] }>` | ❌ | **Task 1** |
| Internally: chunks via `chunkText`, embeds each via `embedText`, single Supabase `insert([...])` call | ❌ | Task 1 |
| Embeddings generated in parallel with a small concurrency cap | ❌ | Task 1 |
| Returns the inserted chunk UUIDs | ❌ | Task 1 |
| Vitest unit tests with mocked OpenAI + mocked Supabase | ❌ | Task 1 |

## Decisions documented in this plan

- **Concurrency cap = 5.** Constant `EMBED_CONCURRENCY = 5` at the top of the module. Rationale: a 50KB document chunks to ~25 chunks, so a cap of 5 means ~5 round-trips of OpenAI calls instead of one giant `Promise.all([25])`. Polite to OpenAI's per-org rate limits, predictable memory profile, still fast for v1's KB sizes (seed is ~50–200 chunks). Hand-rolled batched loop — no `p-limit` dependency. If a single bad chunk is found to dominate latency, swap to a true semaphore later.
- **Empty content / no chunks → return `{ chunkIds: [] }` without any API or DB calls.** Defensive guard. `chunkText("")` returns `[]` (per #43), so this is the natural propagation. Avoids charging the user for an embed call and an insert that does nothing.
- **Embed failure aborts the whole ingest.** `Promise.all` inside each batch rejects on the first failure. We do **not** insert partial documents — a half-ingested doc is worse than no doc because retrieval would surface fragmentary context. Caller (#47 admin endpoint) catches and returns 5xx.
- **Single insert call after all embeds resolve, per AC.** All chunks for one document land atomically (Postgres-level — one statement, one txn). Avoids the partial-insert problem above.
- **`select("id")` returns IDs in insertion order.** Supabase's `insert([...]).select("id")` returns rows in the same order as the input array (PostgreSQL's `INSERT ... RETURNING` order matches input row order in v1 — the chunkIds returned correspond positionally to the input chunks). Caller surfaces these to admins.
- **Insert error → `throw new Error(error.message)`.** Mirrors `lib/rag/retrieve.ts:49`. Caller decides 4xx vs 5xx.
- **`metadata` is optional and passes through unchanged.** Stored as `jsonb`. Same value applied to every chunk of a single document — chunk-level differentiation (page numbers, section headings) is a future enhancement and not in scope for #44.
- **`source` is optional in the schema (column is nullable) but required in the helper signature.** All real callers know the source; making it required at the API surface prevents accidentally orphaned chunks. The schema-level nullability stays for future use cases (e.g., user-provided pasted text).
- **Helper takes the Supabase client as a parameter, doesn't create one.** Same pattern as `runRagAgent` / `retrieveChunks` — caller controls the auth context.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/rag/store.ts` | **Create** | Exports `IngestDocumentInput`, `IngestDocumentResult` types + `ingestDocument()` async function + the `EMBED_CONCURRENCY` constant |
| `lib/rag/store.test.ts` | **Create** | Vitest unit tests with mocked `embedText` (module-level) + hand-rolled Supabase chain mock covering: empty content, single chunk, multi-chunk insertion shape, metadata pass-through, concurrency cap (max in-flight ≤ cap), embed failure propagation, insert error propagation |

**Files not touched:**
- `lib/rag/chunking.ts` and `lib/rag/embed.ts` — consumed as-is.
- `types/supabase.ts` — `knowledge_chunks` Insert type already exists.
- No new migrations, no new RPCs.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/chunks-insert-helper-44`.

- [ ] **Step B: Confirm dependencies are on `main`**

```bash
ls lib/rag/embed.ts lib/rag/chunking.ts && grep -q "knowledge_chunks" supabase/migrations/20260409170904_create_knowledge_chunks.sql && echo OK
```
Expected: `OK`.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
eval "$(supabase status -o env 2>/dev/null)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 215/215 (post-#27 merge), Biome clean, tsc clean.

---

## Task 1: TDD `ingestDocument`

**Files:** `lib/rag/store.ts`, `lib/rag/store.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `lib/rag/store.test.ts`:

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/rag/embed", () => ({
  embedText: vi.fn(),
}));

vi.mock("@/lib/rag/chunking", async (importOriginal) => {
  // Real chunkText for behavior; vi.spyOn lets individual tests override.
  return await importOriginal();
});

import { embedText } from "@/lib/rag/embed";
import { EMBED_CONCURRENCY, ingestDocument } from "./store";

type InsertedRow = {
  source: string | null;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown> | undefined;
};

/**
 * Build a Supabase mock that records the rows passed to `.insert([...])` and
 * returns canned ids from `.select("id")`. The insert call returns the chain
 * object; `.select("id")` resolves with `{ data, error }`.
 */
function mockSupabaseInsert(opts: {
  ids?: string[];
  insertError?: { message: string } | null;
} = {}) {
  const insertedRows: InsertedRow[] = [];
  const insert = vi.fn((rows: InsertedRow[]) => {
    insertedRows.push(...rows);
    return {
      select: vi.fn(() =>
        Promise.resolve(
          opts.insertError
            ? { data: null, error: opts.insertError }
            : {
                data: (opts.ids ?? rows.map((_, i) => `id-${i + 1}`)).map((id) => ({ id })),
                error: null,
              },
        ),
      ),
    };
  });
  const from = vi.fn((table: string) => {
    if (table !== "knowledge_chunks") throw new Error(`unexpected table: ${table}`);
    return { insert };
  });
  const supabase = { from } as unknown as Parameters<typeof ingestDocument>[0];
  return { supabase, insertedRows, insert, from };
}

function fakeEmbedding(seed = 0.1): number[] {
  return Array.from({ length: 1536 }, () => seed);
}

describe("ingestDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedText).mockImplementation(async () => fakeEmbedding());
  });

  test("returns an empty result and makes no API/DB calls when content is empty", async () => {
    const { supabase, from } = mockSupabaseInsert();

    const result = await ingestDocument(supabase, { content: "", source: "Doc A" });

    expect(result).toEqual({ chunkIds: [] });
    expect(embedText).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("embeds a single small chunk and inserts one row", async () => {
    const { supabase, insertedRows, insert } = mockSupabaseInsert({ ids: ["uuid-1"] });
    vi.mocked(embedText).mockResolvedValueOnce(fakeEmbedding(0.42));

    const result = await ingestDocument(supabase, {
      content: "HPV is a common virus.",
      source: "Cancer Council Australia",
    });

    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith("HPV is a common virus.");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertedRows).toEqual([
      {
        source: "Cancer Council Australia",
        content: "HPV is a common virus.",
        embedding: fakeEmbedding(0.42),
        metadata: undefined,
      },
    ]);
    expect(result).toEqual({ chunkIds: ["uuid-1"] });
  });

  test("chunks long content, embeds each, inserts all rows in a single call", async () => {
    // 5000 chars > default 2048-char chunk size → multiple chunks
    const longContent = "a".repeat(5000);
    const { supabase, insertedRows, insert } = mockSupabaseInsert();

    let embedCallIndex = 0;
    vi.mocked(embedText).mockImplementation(async () => fakeEmbedding(embedCallIndex++ / 10));

    const result = await ingestDocument(supabase, {
      content: longContent,
      source: "Long Doc",
    });

    // Multiple chunks → multiple embed calls, single insert call
    expect(vi.mocked(embedText).mock.calls.length).toBeGreaterThan(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertedRows.length).toBe(vi.mocked(embedText).mock.calls.length);
    expect(result.chunkIds.length).toBe(insertedRows.length);

    // Insertion order matches chunk order (chunkIds positional)
    insertedRows.forEach((row, i) => {
      expect(row.source).toBe("Long Doc");
      expect(row.content).toBe(vi.mocked(embedText).mock.calls[i][0]);
      expect(row.embedding).toEqual(fakeEmbedding(i / 10));
    });
  });

  test("passes metadata through to every inserted row", async () => {
    const longContent = "b".repeat(5000);
    const { supabase, insertedRows } = mockSupabaseInsert();
    const metadata = { page: 3, license: "CC-BY-4.0" };

    await ingestDocument(supabase, {
      content: longContent,
      source: "WHO",
      metadata,
    });

    expect(insertedRows.length).toBeGreaterThan(1);
    for (const row of insertedRows) {
      expect(row.metadata).toEqual(metadata);
    }
  });

  test("respects EMBED_CONCURRENCY — never more than the cap in flight at once", async () => {
    // 12 chunks, cap = 5 → batches of 5, 5, 2
    const longContent = "c".repeat(2048 * 12);
    const { supabase } = mockSupabaseInsert();

    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(embedText).mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield to the event loop so other started embeds can register inFlight
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return fakeEmbedding();
    });

    await ingestDocument(supabase, { content: longContent, source: "S" });

    expect(vi.mocked(embedText).mock.calls.length).toBeGreaterThan(EMBED_CONCURRENCY);
    expect(maxInFlight).toBeLessThanOrEqual(EMBED_CONCURRENCY);
  });

  test("propagates errors from embedText (no insert called)", async () => {
    const { supabase, from } = mockSupabaseInsert();
    vi.mocked(embedText).mockRejectedValueOnce(new Error("openai down"));

    await expect(
      ingestDocument(supabase, { content: "anything", source: "X" }),
    ).rejects.toThrow("openai down");

    expect(from).not.toHaveBeenCalled();
  });

  test("throws when the insert returns an error", async () => {
    const { supabase } = mockSupabaseInsert({ insertError: { message: "rls denied" } });

    await expect(
      ingestDocument(supabase, { content: "anything", source: "X" }),
    ).rejects.toThrow("rls denied");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/rag/store.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./store` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/rag/store.ts`:

```typescript
import { chunkText } from "@/lib/rag/chunking";
import { embedText } from "@/lib/rag/embed";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Maximum number of concurrent embedding API calls. A 50KB document chunks
 * to ~25 chunks; a cap of 5 keeps us polite to OpenAI rate limits while
 * still completing a typical ingest in a handful of round-trips. Hand-rolled
 * batching loop — no p-limit dependency.
 */
export const EMBED_CONCURRENCY = 5;

export type IngestDocumentInput = {
  /** Raw document text. Will be chunked. */
  content: string;
  /** Document name or URL — applied to every chunk. */
  source: string;
  /** Optional metadata applied to every chunk (jsonb). */
  metadata?: Record<string, unknown>;
};

export type IngestDocumentResult = {
  /** UUIDs of the inserted chunks, in chunk order. */
  chunkIds: string[];
};

type InsertRow = Database["public"]["Tables"]["knowledge_chunks"]["Insert"];

/**
 * Chunk a document, embed each chunk in batches, and bulk-insert all chunks
 * into `knowledge_chunks`. Returns the inserted chunk UUIDs in chunk order.
 *
 * Failure modes (all reject):
 *   - `embedText` rejects → no insert is performed
 *   - Supabase insert returns an error → throws with `error.message`
 *
 * Empty input (or chunkText returning []) → `{ chunkIds: [] }` with no
 * API/DB calls. Caller is responsible for being on an admin Supabase session
 * (RLS gates the insert).
 */
export async function ingestDocument(
  supabase: SupabaseClient<Database>,
  input: IngestDocumentInput,
): Promise<IngestDocumentResult> {
  const chunks = chunkText(input.content);
  if (chunks.length === 0) return { chunkIds: [] };

  const embeddings = await embedInBatches(chunks, EMBED_CONCURRENCY);

  const rows: InsertRow[] = chunks.map((content, i) => ({
    source: input.source,
    content,
    // pgvector accepts number[] at runtime; generated types model the column
    // as string. Same pattern as lib/rag/retrieve.ts.
    // biome-ignore lint/suspicious/noExplicitAny: pgvector arg type erasure
    embedding: embeddings[i] as any,
    metadata: input.metadata,
  }));

  const { data, error } = await supabase.from("knowledge_chunks").insert(rows).select("id");

  if (error) throw new Error(error.message);

  return { chunkIds: (data ?? []).map((row) => row.id) };
}

async function embedInBatches(chunks: string[], cap: number): Promise<number[][]> {
  const results: number[][] = new Array(chunks.length);
  for (let start = 0; start < chunks.length; start += cap) {
    const slice = chunks.slice(start, start + cap);
    const embedded = await Promise.all(slice.map((c) => embedText(c)));
    for (let j = 0; j < embedded.length; j++) {
      results[start + j] = embedded[j];
    }
  }
  return results;
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test lib/rag/store.test.ts 2>&1 | tail -10
```
Expected: 7/7 passing.

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write lib/rag/store.ts lib/rag/store.test.ts && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/rag/store.ts lib/rag/store.test.ts
git commit -m "feat(rag): add ingestDocument helper for bulk chunk + embed + insert"
```

---

## Task 2: Final verification + push + PR

- [ ] **Step 1: Full test sweep with Supabase env**

```bash
eval "$(supabase status -o env 2>/dev/null)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: baseline (215) + **7** new from `ingestDocument` = 222 total.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -3
```

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-02-epic4-chunks-insert-helper.md
git commit -m "docs(plan): add Epic 4 #44 chunks insert helper plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/chunks-insert-helper-44
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/chunks-insert-helper-44 \
  --title "feat(rag): #44 — ingestDocument bulk chunk + embed + insert helper" \
  --body "$(cat <<'EOF'
## Summary
- Add `lib/rag/store.ts` exporting `ingestDocument(supabase, { content, source, metadata? })` — composes `chunkText` (#43) + `embedText` (#42) + a single Supabase `insert([...])` into a one-shot ingest helper for the admin endpoint (#47) and seed script (#48)
- Embeddings run in batched `Promise.all` with `EMBED_CONCURRENCY = 5` — polite to OpenAI rate limits, still fast for v1's KB sizes (a 50KB doc → ~25 chunks → ~5 round-trips)
- Returns `{ chunkIds: string[] }` in chunk order so admins can surface the inserted UUIDs
- All chunks for one document insert atomically (single statement); embed failures abort the whole ingest (no partial-document inserts)

## Behavior
- Empty content (or `chunkText` returning `[]`) → returns `{ chunkIds: [] }` with no API/DB calls
- Embed failure → rejects, no insert performed
- Insert error → throws `new Error(error.message)`, mirroring the `retrieve.ts` pattern
- `metadata` is optional and applied unchanged to every chunk row
- Helper takes the Supabase client as a parameter — caller controls auth context (admin-only RLS gates the insert per Epic 2 #12)

## Tests added (7)
- Empty content → no API/DB calls, `{ chunkIds: [] }`
- Single chunk → 1 embed call + 1 insert with correct row shape, returns the inserted id
- Multi-chunk → N embeds + single insert with N rows in chunk order, ids returned positionally
- `metadata` passes through to every row
- Concurrency cap respected — `maxInFlight` never exceeds `EMBED_CONCURRENCY` for a 12-chunk doc
- `embedText` rejection propagates and skips the insert
- Insert error throws with the error message

## Test plan
- [x] `pnpm test` — full suite green
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — clean

Closes #44. **Unblocks #47** (admin POST /api/embeddings/ingest can call this directly) **and #48** (seed script can call this directly without going through the HTTP boundary).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #44 maps to a test case — function signature + return shape, `chunkText` + `embedText` composition, single bulk-insert call, parallel embeds with concurrency cap, returned chunk UUIDs.
- **Placeholder scan:** no TBD/TODO. The `metadata: undefined` (vs missing-key) is intentional — `Database["public"]["Tables"]["knowledge_chunks"]["Insert"]` allows the field as `Json | null | undefined`, and the inserted row's `metadata` column will be JSON `null` when undefined, which matches the schema's `metadata jsonb` (nullable). Tests assert `undefined` to pin this behavior.
- **Type consistency:** `IngestDocumentInput`, `IngestDocumentResult`, and `EMBED_CONCURRENCY` all exported alongside the function. `InsertRow` reuses the generated `Database` type. The `as any` on `embedding` is the same biome-ignore pattern as `lib/rag/retrieve.ts:43`.
- **Pure-function discipline:** no `createClient` call inside the helper; takes the caller's Supabase client as a parameter. `EMBED_CONCURRENCY` is a top-level constant, not a global mutable.
- **Insertion-order assumption:** PostgreSQL's `INSERT ... RETURNING` preserves the input order of a multi-value `VALUES` clause, and Supabase's JS client serializes `insert([...]).select(...)` as a single `INSERT ... RETURNING id`. `data` is therefore positional with the input rows. If this ever breaks (very unlikely), the test "returns chunkIds in insertion order" pins the contract and would catch a regression.
- **Concurrency test reliability:** the `setTimeout(0)` yield inside the mocked `embedText` ensures the event loop services other started embeds before any one resolves, making `maxInFlight` a meaningful measurement rather than always-1. The test would catch a regression that accidentally swapped the batching loop for a single `Promise.all([...allChunks])`.
