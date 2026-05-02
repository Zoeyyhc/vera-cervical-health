# Epic 4 — #43 Document Chunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lib/rag/chunking.ts` exporting `chunkText(text, opts?): string[]` — splits a long text into ~512-token chunks with 64-token overlap. Uses a 1-token-≈-4-chars approximation for v1 (no tokenizer dependency). Boundary preference: paragraph → sentence → word → hard cut. Pure function, fully tested.

**Architecture:** Single pure function in `lib/rag/chunking.ts`. Operates internally on character counts (chunkSize × 4 chars; overlap × 4 chars). The break-point search looks **backward** from the ideal cut point with a window covering the last 25% of the chunk — that's where most natural breaks fall, and it keeps the algorithm O(N). Each chunk's tail equals the next chunk's head over the overlap region (literally `text.slice(end-overlap, end)` shared between consecutive chunks). No I/O, no async — easy to TDD comprehensively.

**Tech Stack:** TypeScript strict, Vitest, Biome.

**Issue:** [#43](https://github.com/Zoeyyhc/cervix-assistant/issues/43)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-02
**Depends on:** —

---

## Decisions documented in this plan

- **Token approximation: 1 token ≈ 4 chars.** Avoids a `tiktoken` dependency for v1. The actual cost of mis-sizing is bounded — embedding API accepts up to 8K tokens, our 512-token target chunks have plenty of headroom.
- **Internal unit is chars, external API takes tokens.** `opts.chunkSize: 512` (tokens) → `chunkSizeChars = 2048` internally. Caller-friendly numbers; implementation details hidden.
- **Backward break-point search.** Look backward from `idealEnd` for `\n\n`, then `. `, then ` `. If none found within the last 25% of the chunk, hard-cut at `idealEnd`. Forward search would be marginally better quality but adds complexity for v1.
- **Overlap is a strict char count.** Next chunk starts exactly `overlap` chars before the previous chunk's actual end (after break-point adjustment). This means if break point lands at char 1900 (instead of 2048), the next chunk starts at 1900 - 256 = 1644. Overlap region `[1644..1900]` is in BOTH chunks.
- **Forward-progress guarantee.** If `start + 1 ≥ end - overlap` (would loop), force `start = end` to prevent infinite loops on pathological inputs.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/rag/chunking.ts` | **Create** | Exports `chunkText(text, opts?)` + `ChunkOptions` type |
| `lib/rag/chunking.test.ts` | **Create** | Vitest unit tests covering empty, short, exact-boundary, multi-chunk, overlap correctness, paragraph/sentence/word/hard-cut break preference, custom opts, deterministic |

**Files not touched:**
- `lib/rag/embed.ts` — unrelated.
- The chunking helper has no callers in #43 itself; #44 (`ingestDocument`) is the first consumer.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/document-chunking-43`.

- [ ] **Step B: Confirm `lib/rag/` exists** (created by #42)

```bash
ls lib/rag/
```
Expected: `embed.test.ts`, `embed.ts`.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 183/183 with real Supabase env, or 171/183 (12 skipped) without. All clean.

---

## Task 1: TDD `chunkText`

**Files:** `lib/rag/chunking.ts`, `lib/rag/chunking.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `lib/rag/chunking.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking";

describe("chunkText", () => {
  describe("trivial cases", () => {
    it("returns an empty array for empty input", () => {
      expect(chunkText("")).toEqual([]);
    });

    it("returns a single-element array when input fits in one chunk", () => {
      const text = "hello world";
      expect(chunkText(text)).toEqual([text]);
    });

    it("returns a single chunk at exactly the chunk-size boundary", () => {
      // Default chunkSize: 512 tokens × 4 chars = 2048 chars
      const text = "a".repeat(2048);
      expect(chunkText(text)).toEqual([text]);
    });
  });

  describe("multi-chunk cases", () => {
    it("splits over-budget input into multiple chunks", () => {
      // 5000 chars > 2048-char chunk → multiple chunks
      const text = "a".repeat(5000);
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      // Concatenating overlapping chunks reconstructs more than the original
      // (because of overlap); but every char of the original IS in some chunk.
      const reconstructed = chunks.join("");
      expect(reconstructed.length).toBeGreaterThanOrEqual(text.length);
    });

    it("each chunk's last `overlap` chars equal the next chunk's first `overlap` chars (hard-cut path)", () => {
      // 5000 'a's with no break points → algorithm hard-cuts at chunk-size
      // boundaries with strict overlap.
      const text = "a".repeat(5000);
      const chunks = chunkText(text);
      // Default overlap: 64 tokens × 4 chars = 256 chars
      const overlapChars = 256;
      for (let i = 0; i < chunks.length - 1; i++) {
        const tail = chunks[i].slice(-overlapChars);
        const head = chunks[i + 1].slice(0, overlapChars);
        expect(head).toBe(tail);
      }
    });

    it("is deterministic — same input → same output across runs", () => {
      const text = "a".repeat(5000);
      const a = chunkText(text);
      const b = chunkText(text);
      expect(a).toEqual(b);
    });
  });

  describe("break-point preference", () => {
    // Use small custom opts so test inputs are tractable.

    it("breaks at a paragraph boundary when one is in the search window", () => {
      // chunkSize 10 tokens = 40 chars. We craft text where a "\n\n" sits
      // just inside the last 25% of the first chunk's char window (so >= 30).
      const text =
        "abcdefghijklmnopqrstuvwxyz12345\n\nbody two body two body two body two body two";
      // First chunk's idealEnd is min(0+40, text.length) = 40. The "\n\n" is
      // at position 31-32 (0-indexed). minBreak = 0 + floor(40 * 0.75) = 30.
      // 31 >= 30, so paragraph wins; chunk ends at 33 (after the "\n\n").
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      expect(chunks[0]).toBe("abcdefghijklmnopqrstuvwxyz12345\n\n");
    });

    it("breaks at a sentence boundary when no paragraph break is in window", () => {
      // chunkSize 10 = 40 chars. Period+space at pos 31-32.
      const text =
        "abcdefghijklmnopqrstuvwxyz12345. body two body two body two body two body two";
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      // idealEnd 40, sentence ". " at 31-32, minBreak 30. Sentence wins.
      // End = 31 + 2 = 33. chunks[0] = text.slice(0, 33).
      expect(chunks[0]).toBe("abcdefghijklmnopqrstuvwxyz12345. ");
    });

    it("breaks at a word boundary when no paragraph or sentence in window", () => {
      // No "\n\n" or ". " present. Spaces only. chunkSize 10 = 40 chars.
      const text =
        "abcdefghijklmnopqrstuvwxyz12345 word2 word3 word4 word5 word6 word7";
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      // idealEnd 40. lastIndexOf(" ", 40) = 31. word break wins.
      // End = 31 + 1 = 32. chunks[0] = text.slice(0, 32).
      expect(chunks[0]).toBe("abcdefghijklmnopqrstuvwxyz12345 ");
    });

    it("hard-cuts when no break point falls in the search window", () => {
      // chunkSize 10 = 40 chars. No spaces or punctuation in first 40 chars.
      const text = "a".repeat(40) + " continuation text after the cut";
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      // idealEnd = 40. lastIndexOf(" ", 40) = -1 (no space ≤ 40). Hard cut at 40.
      expect(chunks[0]).toBe("a".repeat(40));
    });
  });

  describe("opts", () => {
    it("respects custom chunkSize and overlap", () => {
      const text = "a".repeat(2000);
      // chunkSize 50 tokens = 200 chars; overlap 10 tokens = 40 chars.
      const chunks = chunkText(text, { chunkSize: 50, overlap: 10 });
      expect(chunks[0]).toHaveLength(200);
      // Strict overlap on hard-cut path
      expect(chunks[1].slice(0, 40)).toBe(chunks[0].slice(-40));
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/rag/chunking.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./chunking`.

- [ ] **Step 3: Write the implementation**

Create `lib/rag/chunking.ts`:

```typescript
const CHARS_PER_TOKEN = 4;
const DEFAULT_CHUNK_SIZE_TOKENS = 512;
const DEFAULT_OVERLAP_TOKENS = 64;

export type ChunkOptions = {
  /** Target chunk size in tokens. Default 512. */
  chunkSize?: number;
  /** Overlap in tokens between consecutive chunks. Default 64. */
  overlap?: number;
};

/**
 * Split a long text into chunks of approximately `chunkSize` tokens with
 * `overlap` tokens of shared context between consecutive chunks.
 *
 * Token approximation: 1 token ≈ 4 chars. Avoids a tokenizer dependency for
 * v1 — swap to `tiktoken` later if RAG quality drops.
 *
 * Break-point preference (searched backward from the ideal cut, within the
 * last 25% of the chunk): paragraph (`\n\n`), sentence (`. `), word (` `).
 * If none is found in window, hard-cut at the ideal end.
 *
 * Pure function — no I/O, deterministic.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const chunkSizeChars = (opts.chunkSize ?? DEFAULT_CHUNK_SIZE_TOKENS) * CHARS_PER_TOKEN;
  const overlapChars = (opts.overlap ?? DEFAULT_OVERLAP_TOKENS) * CHARS_PER_TOKEN;

  if (text.length === 0) return [];
  if (text.length <= chunkSizeChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const idealEnd = Math.min(start + chunkSizeChars, text.length);
    const end =
      idealEnd === text.length ? idealEnd : findBreakPoint(text, start, idealEnd);

    chunks.push(text.slice(start, end));

    if (end >= text.length) break;

    // Advance with overlap. Force forward progress if overlap would stall.
    const nextStart = end - overlapChars;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

function findBreakPoint(text: string, start: number, target: number): number {
  // Search backward from `target` for a natural break, but only accept one
  // within the last 25% of the chunk window. Prevents trivial breaks (e.g.,
  // a single space near `start`) from producing tiny chunks.
  const minBreak = start + Math.floor((target - start) * 0.75);

  // Paragraph
  const paragraph = text.lastIndexOf("\n\n", target);
  if (paragraph >= minBreak) return paragraph + 2;

  // Sentence
  const sentence = text.lastIndexOf(". ", target);
  if (sentence >= minBreak) return sentence + 2;

  // Word
  const word = text.lastIndexOf(" ", target);
  if (word >= minBreak) return word + 1;

  // Hard cut
  return target;
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test lib/rag/chunking.test.ts 2>&1 | tail -5
```
Expected: all tests passing.

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write lib/rag/chunking.ts lib/rag/chunking.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/rag/chunking.ts lib/rag/chunking.test.ts
git commit -m "feat(rag): add chunkText pure helper with break-point preference"
```

---

## Task 2: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 183 baseline + (number of new tests; ~12 expected based on test list) ≈ 195.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -3
```

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-02-epic4-document-chunking.md
git commit -m "docs(plan): add Epic 4 #43 document chunking plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/document-chunking-43
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/document-chunking-43 \
  --title "feat(rag): #43 — chunkText pure helper (512 tokens / 64 overlap)" \
  --body "$(cat <<'EOF'
## Summary
- Add `lib/rag/chunking.ts` exporting `chunkText(text, opts?): string[]`
- Defaults: `chunkSize: 512` tokens, `overlap: 64` tokens (1 token ≈ 4 chars approximation for v1)
- Break-point preference (backward search within the last 25% of the chunk window): paragraph `\n\n` → sentence `. ` → word ` ` → hard cut
- Pure function — no I/O, deterministic, no SDK dependency

## Tests added
- Trivial: empty input → `[]`; under-budget input → `[text]`; exactly chunk-size → `[text]`
- Multi-chunk: over-budget splits, hard-cut overlap correctness (chunk[i+1].slice(0, overlap) === chunk[i].slice(-overlap)), determinism
- Break-point preference: paragraph wins when in window, sentence wins when no paragraph, word wins when no sentence, hard cut when no break in window
- Opts: custom `chunkSize` + `overlap` respected with strict overlap on hard-cut path

## Test plan
- [x] `pnpm test` — full suite green
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — succeeds

Closes #43. Unblocks #44 (`ingestDocument`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #43 maps to a test case — empty, single chunk, exact-boundary, overlap correctness, deterministic output, opts handling.
- **Placeholder scan:** no TBD/TODO. The 1-token-≈-4-chars approximation is documented in the function's docstring with a "swap to tiktoken later" pointer.
- **Type consistency:** `ChunkOptions` is the public surface; both fields are optional with sensible defaults. Caller pattern is `chunkText(text)` for the common case, `chunkText(text, { chunkSize: N, overlap: M })` to override.
- **Pure-function discipline:** zero I/O, zero side effects, deterministic. Tests don't mock anything — input → output assertions only.
