# Epic 4 — #48 Initial Knowledge Base Content Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this project disables strict checkpoint flow per `CLAUDE.md` — execute directly). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed `knowledge_chunks` with curated content from 5 WHO public fact sheets covering cervical health (disease → cause → prevention ×2 → strategy), so the orchestrator's `health_question` path returns real cited answers instead of empty-context fallback. Add a re-runnable `scripts/seed-knowledge-base.ts` script + `pnpm seed:kb` shortcut. No automated tests per the ticket AC; smoke-checked via row-count + one sample retrieval.

**Architecture:** Per-document `.md` files in `supabase/seeds/knowledge/` + a typed `manifest.ts` listing source/URL/license/retrieved-date for each. The seed script reads the manifest, deletes prior rows by source (per-source idempotency), reads each `.md` file, and calls `ingestDocument` (#44) using a service-role Supabase client (seed scripts run locally — RLS bypass is the right tool here, just like Supabase's own `seed.sql`). All seeded chunks carry `metadata.seed = true` so `/api/embeddings/ingest` (#47) admin uploads remain visually distinguishable for future cleanup tooling.

**Tech Stack:** TypeScript via `tsx` (new devDep), `@supabase/supabase-js` with service-role key, `WebFetch` for one-time content extraction during plan execution (skip + log on fetch failure per user decision), Node `fs/promises` for reading `.md` files. No new test framework usage.

**Issue:** [#48](https://github.com/Zoeyyhc/cervix-assistant/issues/48)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-07
**Depends on:** #44 (`ingestDocument`) ✅ merged, #47 (admin endpoint) ✅ merged (orthogonal but unblocks runtime admin uploads).
**Unblocks:** Real end-to-end RAG demo. Once seeded, `/api/chat` `health_question` intent returns cited answers from WHO content instead of empty `ragContext`. Closes the Epic 4 critical path (only #49/#50 remain — both S-priority polish).

---

## Pre-existing scaffolding

- ✅ `ingestDocument(supabase, { content, source, metadata? })` from `lib/rag/store.ts` (#44)
- ✅ `knowledge_chunks` table + `match_knowledge_chunks` RPC (Epic 1 migration)
- ✅ RLS allows service-role to bypass — used here for the local seed script
- ✅ `SUPABASE_SERVICE_ROLE_KEY` documented in `.env.example`
- ✅ Existing `supabase/seed.sql` (auth users / dev data) — separate concern, not touched here

## Gaps vs #48 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `scripts/seed-knowledge-base.ts` ingests curated docs from WHO | ❌ | **Tasks 3 + 4** |
| Documents stored under version control as `.md` files in `supabase/seeds/knowledge/` | ❌ | Tasks 2 + 3 |
| License/attribution recorded in a manifest | ❌ | Task 2 (`manifest.ts`) |
| `pnpm seed:kb` runs the ingestion against local Supabase | ❌ | Task 5 |
| `select count(*) from knowledge_chunks` returns ~50–200 chunks after seeding | ❌ | Task 6 (smoke-check) |
| No automated test (per AC); manual smoke-check in the PR | ✅ | No tests written; PR body captures the smoke-check output |

## Decisions documented in this plan

- **Content scope: 5 WHO public fact sheets** covering disease (cervical cancer), cause (HPV), prevention ×2 (HPV vaccine, screening Q&A), strategy (global elimination initiative). All licensed under [CC BY-NC-SA 3.0 IGO](https://www.who.int/about/policies/publishing/copyright). Recorded per-document in `manifest.ts`. Project is non-commercial educational use — within license terms.
- **Per-source idempotency, not bulk-by-marker.** For each manifest entry, the script does `DELETE FROM knowledge_chunks WHERE source = '<source>'` before re-ingesting. Simpler than relying on PostgREST's JSON operators (`metadata->>seed`) for delete, and scoped enough for v1's 5 docs. The `metadata.seed = true` marker still lands on every row for future "list all seeded chunks" queries / admin UI tooling.
- **Service-role key in the script, not cookie auth.** Per `CLAUDE.md`: "DO NOT bypass RLS with the service role key in routes accessible to non-admin users." This is a CLI script, not a route. Service role is the right tool — same pattern Supabase itself uses for `seed.sql`.
- **`tsx` as a new devDependency** — needed to run `.ts` scripts directly without a build step. Smaller and faster than `ts-node`; the modern default. Added to `devDependencies` only.
- **WebFetch with verbatim-extraction prompt** for each WHO URL during plan execution. If a fetch fails (404, unexpected shape, redirect), the corresponding `.md` file isn't created and the manifest entry is commented out with a `TODO(#48)` note + the URL. The user can fill it in later. Fail-fast > silent partial seed.
- **Manifest is the source of truth.** The seed script iterates `SEED_DOCUMENTS` from `manifest.ts`. Adding/removing docs is a manifest edit — no script change.
- **Seed script logs progress per document** with chunk counts, and a final summary line: `✅ Seeded N documents → M chunks total`. Errors per document are caught and logged but don't abort the run (so a single failure mid-batch doesn't leave the DB in a half-seeded state — well, it does, but the user can re-run; the per-source delete makes this safe).
- **Output structure:** every chunk gets:
  - `source`: human-readable display name (e.g., `"WHO — Cervical Cancer"`)
  - `metadata`: `{ url, license, retrieved_on, seed: true }` (the URL surfaces to citation chips via `Source.url` in #28's renderer)

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `package.json` | **Modify** | Add `tsx` devDep + `seed:kb` script |
| `supabase/seeds/knowledge/manifest.ts` | **Create** | Typed `SEED_DOCUMENTS` array — source, url, license, retrievedOn, file |
| `supabase/seeds/knowledge/01-cervical-cancer.md` | **Create** | WHO Cervical Cancer fact sheet (verbatim extract) |
| `supabase/seeds/knowledge/02-hpv-overview.md` | **Create** | WHO HPV Q&A |
| `supabase/seeds/knowledge/03-hpv-vaccine.md` | **Create** | WHO HPV vaccines page |
| `supabase/seeds/knowledge/04-cervical-cancer-prevention.md` | **Create** | WHO Cervical cancer Q&A (prevention/screening focus) |
| `supabase/seeds/knowledge/05-elimination-initiative.md` | **Create** | WHO Cervical Cancer Elimination Initiative page |
| `scripts/seed-knowledge-base.ts` | **Create** | Read manifest → per-source delete → ingestDocument loop → summary |

**Files not touched:**
- `lib/rag/store.ts` — consumed as-is (#44).
- `supabase/seed.sql` — separate concern (auth/dev rows).
- `app/api/embeddings/ingest/route.ts` — unrelated; admin endpoint stays as-is (#47).

---

## Pre-flight

- [ ] **Step A: Confirm #44 + #47 are on `main`**

```bash
git checkout main && git pull --ff-only origin main && git log origin/main --oneline | head -5
```
Expected: top commits include the merged #44 + #47 PRs.

- [ ] **Step B: Branch off main**

```bash
git checkout -b feat/kb-content-seed-48
```

- [ ] **Step C: Local Supabase up + service role env exported**

```bash
supabase status -o env >/dev/null 2>&1 || (echo "❌ supabase not running — run 'supabase start' first" && exit 1)
eval "$(supabase status -o env)"
export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}"
echo "OK: $SUPABASE_URL"
```
Expected: `OK: http://127.0.0.1:54321` (or similar local URL).

- [ ] **Step D: Confirm OPENAI_API_KEY is in `.env.local`**

```bash
grep -E "^OPENAI_API_KEY=." .env.local && echo OK
```
Expected: `OK`. Without this, `embedText` will fail when the script runs.

- [ ] **Step E: Baseline tests still green**

```bash
pnpm test 2>&1 | tail -5
```
Expected: 231/231 (post-#47 merge).

---

## Task 1: Add `tsx` devDep + `seed:kb` script

**Files:** `package.json`.

- [ ] **Step 1: Install tsx**

```bash
pnpm add -D tsx
```
Expected: `tsx` appears in `devDependencies`. `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add the npm script**

Edit `package.json`, add to `scripts`:

```json
"seed:kb": "tsx scripts/seed-knowledge-base.ts"
```

(After `"test:coverage"`, before the closing `}`.)

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add tsx + seed:kb script for knowledge base seeding"
```

---

## Task 2: Manifest

**Files:** `supabase/seeds/knowledge/manifest.ts`.

- [ ] **Step 1: Create the directory + manifest**

```bash
mkdir -p supabase/seeds/knowledge
```

Create `supabase/seeds/knowledge/manifest.ts`:

```typescript
/**
 * Knowledge base seed manifest.
 *
 * Source: World Health Organization public fact sheets / Q&A pages.
 * License: CC BY-NC-SA 3.0 IGO (https://www.who.int/about/policies/publishing/copyright).
 * Project use: non-commercial educational platform — within license terms.
 *
 * To re-fetch, edit the file in place and re-run `pnpm seed:kb` — the script
 * deletes prior chunks per `source` before re-ingesting, so updates are safe.
 */

export type SeedDocument = {
  /** Human-readable display name. Surfaces in citation chips. */
  source: string;
  /** Authoritative URL. Stored in metadata.url; surfaces in citation chips. */
  url: string;
  /** License string. Stored in metadata.license. */
  license: string;
  /** ISO date the content was retrieved. Stored in metadata.retrieved_on. */
  retrievedOn: string;
  /** Filename relative to this manifest's directory. */
  file: string;
};

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    source: "WHO — Cervical Cancer",
    url: "https://www.who.int/news-room/fact-sheets/detail/cervical-cancer",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "01-cervical-cancer.md",
  },
  {
    source: "WHO — Human Papillomavirus (HPV)",
    url: "https://www.who.int/news-room/questions-and-answers/item/human-papillomavirus-(hpv)",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "02-hpv-overview.md",
  },
  {
    source: "WHO — HPV Vaccines",
    url: "https://www.who.int/teams/immunization-vaccines-and-biologicals/diseases/human-papillomavirus-vaccines-(hpv)",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "03-hpv-vaccine.md",
  },
  {
    source: "WHO — Cervical Cancer Q&A (Prevention & Screening)",
    url: "https://www.who.int/news-room/questions-and-answers/item/cervical-cancer",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "04-cervical-cancer-prevention.md",
  },
  {
    source: "WHO — Cervical Cancer Elimination Initiative",
    url: "https://www.who.int/initiatives/cervical-cancer-elimination-initiative",
    license: "CC BY-NC-SA 3.0 IGO",
    retrievedOn: "2026-05-02",
    file: "05-elimination-initiative.md",
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add supabase/seeds/knowledge/manifest.ts
git commit -m "feat(seeds): add KB seed manifest for 5 WHO cervical-health documents"
```

---

## Task 3: Fetch + curate the 5 WHO documents

**Files:** `supabase/seeds/knowledge/01-cervical-cancer.md` through `05-elimination-initiative.md`.

For each manifest entry:

- [ ] **Step 1: Fetch the URL via WebFetch**

Use this prompt (adapt for each document):

> Extract the main article body from this WHO fact sheet **verbatim**. Preserve section headings (use `##` for them). Strip site nav, footer, "WHO in Countries" sidebars, related-content links, and the "Updated YYYY-MM-DD" line at the bottom. Output as plain markdown — no HTML, no extra commentary, no summaries. If the page is a 404 or the content is unrecognizable, say "FETCH_FAILED" and nothing else.

If the response contains `FETCH_FAILED`:
- Skip writing the file
- Note the failure in the PR body (Task 7)
- Comment out the manifest entry with `// TODO(#48): re-fetch — <url> returned FETCH_FAILED on YYYY-MM-DD`

- [ ] **Step 2: Save the extracted text**

Write to `supabase/seeds/knowledge/<file-from-manifest>.md`. No frontmatter — metadata lives in the manifest. The `.md` file is pure content.

- [ ] **Step 3: Quick sanity-check the file**

```bash
wc -l supabase/seeds/knowledge/<file>.md
head -10 supabase/seeds/knowledge/<file>.md
```
Expected: at least ~30 lines, recognizably WHO content (mentions HPV / cervical cancer / WHO).

- [ ] **Step 4: Repeat for all 5 documents**

- [ ] **Step 5: Commit all content files together**

```bash
git add supabase/seeds/knowledge/*.md
git commit -m "feat(seeds): add 5 WHO cervical-health source documents"
```

---

## Task 4: Seed script

**Files:** `scripts/seed-knowledge-base.ts`.

- [ ] **Step 1: Create the script**

```bash
mkdir -p scripts
```

Create `scripts/seed-knowledge-base.ts`:

```typescript
/**
 * Seed the knowledge_chunks table from `supabase/seeds/knowledge/`.
 *
 * Run with: `pnpm seed:kb`
 *
 * Requirements:
 *   - Local Supabase running (`supabase start`)
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (run `eval "$(supabase status -o env)"` first)
 *   - OPENAI_API_KEY in `.env.local` (loaded by Next.js but not by tsx — see env loading below)
 *
 * Safe to re-run — clears prior chunks per source before re-ingesting.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ingestDocument } from "@/lib/rag/store";
import { SEED_DOCUMENTS, type SeedDocument } from "@/supabase/seeds/knowledge/manifest";
import type { Database } from "@/types/supabase";

// tsx doesn't auto-load .env.local the way Next.js does
loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv() {
  if (!SUPABASE_URL) throw new Error("missing SUPABASE_URL (run: eval \"$(supabase status -o env)\")");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.OPENAI_API_KEY) throw new Error("missing OPENAI_API_KEY (set in .env.local)");
}

async function seedOne(
  supabase: ReturnType<typeof createClient<Database>>,
  doc: SeedDocument,
): Promise<{ source: string; chunks: number; ok: boolean; error?: string }> {
  const filepath = path.join("supabase/seeds/knowledge", doc.file);

  let content: string;
  try {
    content = await readFile(filepath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: doc.source, chunks: 0, ok: false, error: `read failed: ${msg}` };
  }

  // Clear prior chunks for this source (per-source idempotency)
  const { error: delErr } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("source", doc.source);
  if (delErr) {
    return { source: doc.source, chunks: 0, ok: false, error: `delete failed: ${delErr.message}` };
  }

  try {
    const { chunkIds } = await ingestDocument(supabase, {
      source: doc.source,
      content,
      metadata: {
        url: doc.url,
        license: doc.license,
        retrieved_on: doc.retrievedOn,
        seed: true,
      },
    });
    return { source: doc.source, chunks: chunkIds.length, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: doc.source, chunks: 0, ok: false, error: `ingest failed: ${msg}` };
  }
}

async function main() {
  assertEnv();

  const supabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`📚 Seeding ${SEED_DOCUMENTS.length} documents…\n`);

  const results: Awaited<ReturnType<typeof seedOne>>[] = [];
  for (const doc of SEED_DOCUMENTS) {
    process.stdout.write(`  • ${doc.source}…  `);
    const r = await seedOne(supabase, doc);
    results.push(r);
    if (r.ok) {
      console.log(`✅ ${r.chunks} chunks`);
    } else {
      console.log(`❌ ${r.error}`);
    }
  }

  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount === SEED_DOCUMENTS.length ? "✅" : "⚠️"}  Seeded ${okCount}/${SEED_DOCUMENTS.length} documents → ${totalChunks} chunks total`);

  if (okCount !== SEED_DOCUMENTS.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `dotenv` if not already present**

```bash
grep -q '"dotenv"' package.json || pnpm add -D dotenv
```

- [ ] **Step 3: tsc-check the script (no Vitest, but type-safety still matters)**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-knowledge-base.ts package.json pnpm-lock.yaml
git commit -m "feat(scripts): add seed-knowledge-base.ts with per-source idempotency"
```

---

## Task 5: Run the seed locally + verify

- [ ] **Step 1: Ensure local Supabase + env**

```bash
supabase status >/dev/null 2>&1 || supabase start
eval "$(supabase status -o env)"
export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}"
```

- [ ] **Step 2: Run the seed**

```bash
pnpm seed:kb
```
Expected: per-document `✅ N chunks` lines, summary `✅ Seeded 5/5 documents → ~80–150 chunks total`. Capture the output for the PR body.

- [ ] **Step 3: Smoke-check via psql**

```bash
PSQL_URL=$(supabase status -o json 2>/dev/null | python3 -c 'import sys, json; print(json.load(sys.stdin)["DB_URL"])')
psql "$PSQL_URL" -c "select count(*) as total_chunks, count(distinct source) as sources from public.knowledge_chunks where metadata->>'seed' = 'true';"
psql "$PSQL_URL" -c "select source, count(*) as chunks from public.knowledge_chunks where metadata->>'seed' = 'true' group by source order by source;"
```
Expected: `total_chunks` between ~50 and ~200, `sources = 5`. Capture for PR.

- [ ] **Step 4: Sample retrieval check (optional but high-value)**

```bash
psql "$PSQL_URL" -c "select source, left(content, 100) from public.knowledge_chunks where content ilike '%hpv vaccine%' limit 3;"
```
Expected: at least one row matching, content recognizably WHO HPV vaccine text. Confirms ingestion preserved content.

---

## Task 6: Re-runnability check

- [ ] **Step 1: Run again — confirm idempotency**

```bash
pnpm seed:kb
```
Expected: same `✅ Seeded 5/5 documents → N chunks total` summary, **no duplicate rows** because the per-source delete fires first.

- [ ] **Step 2: Verify count is unchanged**

```bash
psql "$PSQL_URL" -c "select count(*) from public.knowledge_chunks where metadata->>'seed' = 'true';"
```
Expected: same count as Task 5 Step 3.

---

## Task 7: Final verification + plan commit + PR

- [ ] **Step 1: Run baseline tests + Biome + tsc + build**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -5
```
Expected: all clean. `pnpm test` still 231/231 (no new tests — this is content + script).

- [ ] **Step 2: Biome on new files (in case the script needs formatting)**

```bash
pnpm biome check --write scripts/seed-knowledge-base.ts supabase/seeds/knowledge/manifest.ts
```

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-02-epic4-kb-content-seed.md
git commit -m "docs(plan): add Epic 4 #48 KB content seed plan"
```

- [ ] **Step 4: End-to-end smoke check via /api/chat**

Optional but recommended — confirms the whole RAG path lights up:

```bash
# In one terminal
pnpm dev

# In another, after dev server is up
# (replace <session-cookie> after logging in via the UI)
curl -s -X POST http://localhost:3000/api/chat \
  -H "content-type: application/json" \
  -H "cookie: <session-cookie>" \
  -d '{"message":"What causes cervical cancer?"}' | head -c 1000
```
Expected: streaming response that includes a `sources` event with WHO citation chips. Capture a screenshot or curl excerpt for the PR.

- [ ] **Step 5: Push**

```bash
git push -u origin feat/kb-content-seed-48
```

- [ ] **Step 6: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/kb-content-seed-48 \
  --title "feat(seeds): #48 — initial WHO knowledge-base content (5 docs)" \
  --body "$(cat <<'EOF'
## Summary
- Seed `knowledge_chunks` with 5 WHO public fact sheets covering cervical health: cervical cancer (disease), HPV (cause), HPV vaccine (prevention 1), cervical-cancer Q&A (prevention 2 / screening), and the global elimination initiative (strategy)
- Add `scripts/seed-knowledge-base.ts` + `pnpm seed:kb` shortcut. Per-source idempotency via `DELETE WHERE source = ...` before re-ingest — safe to re-run
- All chunks carry `metadata.seed = true`, `metadata.url`, `metadata.license`, `metadata.retrieved_on` for citation chips and future cleanup tooling
- Service-role key bypasses RLS for the local seed run (CLI script, not a route — same pattern as Supabase's own `seed.sql`)
- New devDeps: `tsx` (script runner), `dotenv` (loads `.env.local` for the script — Next.js loads it automatically but tsx doesn't)

## License
All content is © WHO under [CC BY-NC-SA 3.0 IGO](https://www.who.int/about/policies/publishing/copyright). Project use is non-commercial educational — within license terms. Per-document attribution recorded in `supabase/seeds/knowledge/manifest.ts`.

## Smoke check (captured during local run)

\`\`\`
<paste pnpm seed:kb output here>
\`\`\`

\`\`\`
<paste psql count + per-source rows here>
\`\`\`

## End-to-end demo (optional)
\`\`\`
<paste curl /api/chat excerpt showing sources event>
\`\`\`

## Closing
Closes #48. **Closes the Epic 4 critical path.** Only #49 (no-match fallback explicit test) and #50 (HNSW tuning measurement) remain — both S-priority polish that can ship in a follow-up sprint.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** all 6 ACs map to tasks (script, .md files, manifest, npm script, ~50–200 chunks, no automated test). The smoke-check appears in PR body per AC.
- **Placeholder scan:** the only `<paste …>` placeholders are in the PR body template — to be filled in at Task 7 with real captured output. No `TBD` in code or plan steps.
- **Type consistency:** `SeedDocument` type in `manifest.ts` matches the field names used in `seed-knowledge-base.ts` (`source`, `url`, `license`, `retrievedOn`, `file`). The `metadata` shape passed to `ingestDocument` aligns with what #28's `Source.url` extractor reads (`metadata.url` as string).
- **License compliance:** CC BY-NC-SA 3.0 IGO requires attribution + non-commercial use + share-alike for derivatives. We attribute via `source` + `metadata.url` on every chunk and every citation chip; project is educational/non-commercial; we're not redistributing as a derivative work but as cited references.
- **Re-runnability:** Task 6 explicitly tests this by running the seed twice and asserting unchanged counts. The per-source delete (vs marker-based bulk delete) is documented as the simplicity tradeoff.
- **Failure modes documented:**
  - Fetch failure during plan execution → manifest entry commented out + noted in PR
  - Read failure during script run → per-document error, continues with other docs
  - Embed/insert failure during script run → per-document error, continues; exit 1 at end if any failed
  - Missing env → assertEnv throws upfront with a clear message
- **What's deliberately not done:**
  - No Vitest tests for the script (per AC)
  - No frontmatter parsing (manifest is the source of truth — keeps `.md` files pure content)
  - No automatic `OPENAI_API_KEY` discovery beyond `.env.local`
  - No retry on embed failures (covered by `embedText`'s SDK defaults from #42)
