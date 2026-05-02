# Epic 4 — #46 RAG Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lib/agents/rag-agent.ts` exporting `runRagAgent(supabase, { userMessage })` — composes `embedText` (#42) and `retrieveChunks` (#45) into a single agent that returns `{ ragContext, ragSources }`. The orchestrator (Epic 3 #27) calls this for `health_question` intents and threads the result into `runResponseAgent`'s ctx (which already accepts `ragContext` + `ragSources` from #41).

**Architecture:** Pure composer over the data-layer primitives. No new SDK calls — just `embedText` + `retrieveChunks` + format. Format: `ragContext` is a human-readable concatenation with `[1]`, `[2]` markers; `ragSources` is the structured `Source[]` array (one per retrieved chunk, 1-indexed `id`, `chunkId` from the row's UUID, `url` from `metadata.url` if present, fallback title `"(unknown source)"` when `chunk.source` is null). Empty retrieval → `{ ragContext: "", ragSources: [] }`. Errors propagate.

**Tech Stack:** TypeScript strict, `@supabase/supabase-js` (typed client), Vitest (with `embedText` + `retrieveChunks` mocked at module level), Biome.

**Issue:** [#46](https://github.com/Zoeyyhc/cervix-assistant/issues/46)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-05
**Depends on:** #42 (`embedText`) ✅ merged, #45 (`retrieveChunks`) ✅ merged.
**Unblocks:** Epic 3 #27 (orchestrator wiring with RAG + Response).

---

## Pre-existing scaffolding

- ✅ `embedText` from `lib/rag/embed.ts` (#42)
- ✅ `retrieveChunks` + `RetrievedChunk` from `lib/rag/retrieve.ts` (#45)
- ✅ `Source` type from `types/agents.ts` (Epic 3 #28)
- ✅ `runResponseAgent` already accepts `ragContext` + `ragSources` in its ctx (#28/#41)
- ✅ `lib/agents/` directory exists (response-agent, orchestrator)

## Gaps vs #46 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `lib/agents/rag-agent.ts` exports `runRagAgent(supabase, { userMessage })` | ❌ | **Task 1** |
| Internally: `embedText` → `retrieveChunks` → format | ❌ | Task 1 |
| `ragContext` with citation markers `[1]`, `[2]` matching Source indices | ❌ | Task 1 |
| `ragSources: Source[]` with `chunkId` from chunk row's `id` | ❌ | Task 1 |
| Empty retrieval → `{ ragContext: "", ragSources: [] }` | ❌ | Task 1 |
| Pure function (no DB / HTTP / Supabase concerns inside — primitives + Supabase client) | ❌ | Task 1 |
| Vitest unit tests with mocked `embedText` + `retrieveChunks` | ❌ | Task 1 |

## Decisions documented in this plan

- **`ragContext` format** — each chunk preceded by `[N]` marker, source attribution in parentheses, separated by blank lines:
  ```
  [1] (Cancer Council Australia) HPV is a common virus that...

  [2] (WHO) Regular cervical screening detects abnormal cells...
  ```
  Markers match `ragSources[i].id` (1-indexed). The response agent (#28) appends this block to the system prompt under "Retrieved context:" — Claude sees the markers and can cite them in its reply (a future ticket can prompt-engineer that explicitly).
- **`Source.title` falls back to `"(unknown source)"`** when `chunk.source` is null. The DB column allows null; in practice content from a real ingest will always have a source string, but defending against null avoids a UI crash.
- **`Source.url` is extracted from `metadata.url`** if it's a string; omitted otherwise. The chip renderer (#28) already handles missing-URL case (renders `<span>` instead of `<a>`).
- **`Source.id` is the marker** (`"1"`, `"2"`, …), not the chunk UUID. The `chunkId` field carries the UUID. This matches #28's `Source` type (id is for citation marker, chunkId is the FK).
- **`runRagAgent` takes the supabase client as a parameter**, not creates one internally. Per `CLAUDE.md`: agents are pure functions — the caller (orchestrator + route) provides the auth-bound Supabase client.
- **Errors propagate.** Same pattern as `embedText` and `retrieveChunks` — caller (#27 orchestrator) catches.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/agents/rag-agent.ts` | **Create** | Exports `RagAgentContext`, `RagAgentResult` types + `runRagAgent()` async function |
| `lib/agents/rag-agent.test.ts` | **Create** | Vitest unit tests with mocked `embedText` + `retrieveChunks` covering: pipeline shape (call order + arg passing), empty retrieval, single chunk, multiple chunks, null source fallback, metadata.url handling, chunkId pass-through, error propagation |

**Files not touched:**
- `lib/rag/embed.ts` and `lib/rag/retrieve.ts` — consumed as-is.
- `types/agents.ts` — `Source` is already defined.
- `lib/agents/response-agent.ts` — already accepts `ragContext` + `ragSources` (#28). The orchestrator wiring lands in #27, not here.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/rag-agent-46`.

- [ ] **Step B: Confirm dependencies are on `main`**

```bash
ls lib/rag/embed.ts lib/rag/retrieve.ts types/agents.ts
```
Expected: all three present.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 200/200 with real Supabase env (#43 + #45 merged), or ~188/200 (12 skipped) without. All clean.

---

## Task 1: TDD `runRagAgent`

**Files:** `lib/agents/rag-agent.ts`, `lib/agents/rag-agent.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `lib/agents/rag-agent.test.ts`:

```typescript
// @vitest-environment node

import type { RetrievedChunk } from "@/lib/rag/retrieve";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/rag/embed", () => ({
  embedText: vi.fn(),
}));

vi.mock("@/lib/rag/retrieve", () => ({
  retrieveChunks: vi.fn(),
}));

import { embedText } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { runRagAgent } from "./rag-agent";

const fakeSupabase = {} as unknown as Parameters<typeof runRagAgent>[0];

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: "chunk-uuid-1",
    source: "Cancer Council Australia",
    content: "HPV is a common virus.",
    similarityScore: 0.9,
    metadata: null,
    ...overrides,
  };
}

describe("runRagAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedText).mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
    vi.mocked(retrieveChunks).mockResolvedValue([]);
  });

  test("calls embedText with the userMessage and retrieveChunks with the embedding", async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.5);
    vi.mocked(embedText).mockResolvedValue(embedding);

    await runRagAgent(fakeSupabase, { userMessage: "What is HPV?" });

    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith("What is HPV?");
    expect(retrieveChunks).toHaveBeenCalledTimes(1);
    expect(retrieveChunks).toHaveBeenCalledWith(fakeSupabase, embedding);
  });

  test("returns empty ragContext and empty ragSources when no chunks match", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result).toEqual({ ragContext: "", ragSources: [] });
  });

  test("formats a single chunk with a [1] marker and source attribution", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({
        id: "uuid-1",
        source: "Cancer Council Australia",
        content: "HPV is a common virus.",
      }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "What is HPV?" });

    expect(result.ragContext).toBe("[1] (Cancer Council Australia) HPV is a common virus.");
    expect(result.ragSources).toEqual([
      {
        id: "1",
        title: "Cancer Council Australia",
        chunkId: "uuid-1",
      },
    ]);
  });

  test("formats multiple chunks with sequential markers and blank-line separators", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "uuid-1", source: "A", content: "First chunk content." }),
      chunk({ id: "uuid-2", source: "B", content: "Second chunk content." }),
      chunk({ id: "uuid-3", source: "C", content: "Third chunk content." }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragContext).toBe(
      "[1] (A) First chunk content.\n\n[2] (B) Second chunk content.\n\n[3] (C) Third chunk content.",
    );
    expect(result.ragSources.map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(result.ragSources.map((s) => s.chunkId)).toEqual(["uuid-1", "uuid-2", "uuid-3"]);
  });

  test("falls back to '(unknown source)' for chunks with null source", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "uuid-1", source: null, content: "Sourceless content." }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragContext).toBe("[1] Sourceless content.");
    expect(result.ragSources[0]).toEqual({
      id: "1",
      title: "(unknown source)",
      chunkId: "uuid-1",
    });
  });

  test("extracts url from metadata.url when present", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({
        id: "uuid-1",
        source: "Cancer Council",
        metadata: { url: "https://example.com/hpv", page: 3 },
      }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragSources[0].url).toBe("https://example.com/hpv");
  });

  test("omits url field when metadata is null or metadata.url is missing/non-string", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "u1", metadata: null }),
      chunk({ id: "u2", metadata: { page: 1 } }),
      chunk({ id: "u3", metadata: { url: 123 } }), // non-string url
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragSources[0].url).toBeUndefined();
    expect(result.ragSources[1].url).toBeUndefined();
    expect(result.ragSources[2].url).toBeUndefined();
  });

  test("propagates errors from embedText", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("embed failed"));

    await expect(runRagAgent(fakeSupabase, { userMessage: "anything" })).rejects.toThrow(
      "embed failed",
    );
  });

  test("propagates errors from retrieveChunks", async () => {
    vi.mocked(retrieveChunks).mockRejectedValue(new Error("retrieve failed"));

    await expect(runRagAgent(fakeSupabase, { userMessage: "anything" })).rejects.toThrow(
      "retrieve failed",
    );
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/agents/rag-agent.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./rag-agent`.

- [ ] **Step 3: Write the implementation**

Create `lib/agents/rag-agent.ts`:

```typescript
import { embedText } from "@/lib/rag/embed";
import { type RetrievedChunk, retrieveChunks } from "@/lib/rag/retrieve";
import type { Database } from "@/types/supabase";
import type { Source } from "@/types/agents";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_SOURCE_TITLE = "(unknown source)";

export type RagAgentContext = {
  /** The user's question. Embedded and used to retrieve relevant chunks. */
  userMessage: string;
};

export type RagAgentResult = {
  /**
   * Human-readable concatenation of retrieved chunks with `[1]`, `[2]`
   * markers matching `ragSources` indices. Empty string when no chunks
   * matched. Consumed by the response agent's ctx (#28) — appended to the
   * system prompt under "Retrieved context:".
   */
  ragContext: string;
  /**
   * Structured citations for the chip renderer. Empty array when no chunks
   * matched. `id` is the 1-indexed marker; `chunkId` is the FK to
   * `knowledge_chunks.id`.
   */
  ragSources: Source[];
};

/**
 * RAG agent — embeds the user message, retrieves the top-k closest
 * `knowledge_chunks`, and returns both a flat context string and structured
 * citations. The orchestrator (#27) calls this for `health_question` intents
 * and threads the result into the response agent's ctx.
 *
 * Per CLAUDE.md: pure-ish — owns no DB connection, takes the auth-bound
 * Supabase client as a parameter. Errors from embed or retrieve propagate.
 */
export async function runRagAgent(
  supabase: SupabaseClient<Database>,
  ctx: RagAgentContext,
): Promise<RagAgentResult> {
  const embedding = await embedText(ctx.userMessage);
  const chunks = await retrieveChunks(supabase, embedding);

  if (chunks.length === 0) {
    return { ragContext: "", ragSources: [] };
  }

  const ragSources: Source[] = chunks.map((c, i) => buildSource(c, i + 1));
  const ragContext = chunks.map((c, i) => formatChunk(c, i + 1)).join("\n\n");

  return { ragContext, ragSources };
}

function buildSource(chunk: RetrievedChunk, marker: number): Source {
  const url = extractUrl(chunk.metadata);
  return {
    id: String(marker),
    title: chunk.source ?? FALLBACK_SOURCE_TITLE,
    chunkId: chunk.id,
    ...(url ? { url } : {}),
  };
}

function formatChunk(chunk: RetrievedChunk, marker: number): string {
  const attribution = chunk.source ? ` (${chunk.source})` : "";
  return `[${marker}]${attribution} ${chunk.content}`;
}

function extractUrl(metadata: Record<string, unknown> | null): string | undefined {
  if (!metadata) return undefined;
  const url = metadata.url;
  return typeof url === "string" ? url : undefined;
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test lib/agents/rag-agent.test.ts 2>&1 | tail -5
```
Expected: 9/9 passing.

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write lib/agents/rag-agent.ts lib/agents/rag-agent.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/rag-agent.ts lib/agents/rag-agent.test.ts
git commit -m "feat(agents): add runRagAgent composing embedText + retrieveChunks"
```

---

## Task 2: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: baseline + **9** new from `runRagAgent`.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -3
```

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-02-epic4-rag-agent.md
git commit -m "docs(plan): add Epic 4 #46 RAG agent plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/rag-agent-46
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/rag-agent-46 \
  --title "feat(agents): #46 — RAG agent (embed + retrieve + format)" \
  --body "$(cat <<'EOF'
## Summary
- Add `lib/agents/rag-agent.ts` exporting `runRagAgent(supabase, { userMessage })` — composes `embedText` (#42) + `retrieveChunks` (#45) into the agent the orchestrator (#27) will call for `health_question` intents
- Returns `{ ragContext, ragSources }`:
  - `ragContext`: human-readable concatenation with `[1]`, `[2]` markers and source attribution; empty string when no chunks matched
  - `ragSources`: structured `Source[]` for the chip renderer; `id` is the 1-indexed marker, `chunkId` is the `knowledge_chunks.id` FK, `url` is extracted from `metadata.url` when present, `title` falls back to `"(unknown source)"` when `chunk.source` is null
- Pure function — no DB connection, no HTTP, takes the caller's auth-bound Supabase client as a parameter (per `CLAUDE.md` agent convention)
- Errors propagate

## Format example
For two retrieved chunks, `ragContext` looks like:
```
[1] (Cancer Council Australia) HPV is a common virus that...

[2] (WHO) Regular cervical screening detects abnormal cells before...
```
The response agent (#41) appends this under "Retrieved context:" in the system prompt.

## Tests added (9)
- Pipeline: calls `embedText(userMessage)` then `retrieveChunks(supabase, embedding)` with the right args
- Empty retrieval → `{ ragContext: "", ragSources: [] }`
- Single chunk: `[1]` marker + source attribution
- Multiple chunks: sequential markers + blank-line separators + 1-indexed `Source[]`
- Null source: `(unknown source)` title fallback + no attribution in context
- `metadata.url` extracted to `Source.url` when present
- `metadata.url` omitted when missing / non-string / metadata is null
- `embedText` errors propagate
- `retrieveChunks` errors propagate

## Test plan
- [x] `pnpm test` — full suite green
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean

Closes #46. **Unblocks Epic 3 #27** (orchestrator wiring with RAG + Response). With #46 merged, #27 is a small wire-up — orchestrator routes `health_question` → `runRagAgent` → `runResponseAgent` with `ragContext` + `ragSources` from the result.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #46 maps to a test case — function signature + return shape, embed + retrieve composition, citation markers, structured `Source[]`, empty-retrieval case, errors propagate, tests with mocked primitives.
- **Placeholder scan:** no TBD/TODO. The `(unknown source)` fallback is explicit; the spread `...(url ? { url } : {})` is intentional to keep `url` undefined-vs-omitted aligned with the `Source` type's optional shape.
- **Type consistency:** `RagAgentContext` and `RagAgentResult` are exported alongside the function. `Source` reused from `types/agents.ts` (no parallel definition). `RetrievedChunk` reused from `lib/rag/retrieve.ts`.
- **Pure-function discipline:** no `createClient` call inside the agent; takes the caller's Supabase client as a parameter. No global state, no side effects beyond the two SDK calls (which are themselves stateless).
- **Format readability:** `[1] (Source) content` is the clearest pattern that gives Claude both a marker (for citation) and attribution (for trust). Blank-line separator between chunks improves prompt readability and avoids accidental run-on text in the model's context.
