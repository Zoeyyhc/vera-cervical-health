# Knowledge Discovery Pipeline

An offline pipeline that **automatically fills gaps in the RAG knowledge base** by
discovering authoritative women's / cervical / HPV-vaccine content, scoring it, and
staging it for admin review before it enters `knowledge_chunks`.

It is **demand-driven**: it only goes looking for content when real users ask
questions the knowledge base answers poorly. There is no hard-coded keyword list.

---

## The core idea: gap-driven, not keyword-driven

```
① A signed-in user asks a health question in chat
        │
        ▼
② RAG retrieves from knowledge_chunks, but the best chunk's
   cosine similarity is below 0.52 (weak / no coverage)
        │   orchestrator logs a `rag_gap` analytics event
        │   (event_type='rag_gap', payload={ question, top_score })
        ▼
③ Cron (every 3 days) or an admin clicks "Run discovery now"
        │
        ▼
④ mineGaps        read rag_gap events (last 30 days), drop ones already
                  addressed, LLM-cluster the rest → top 5 gap themes
        ▼
⑤ synthesizeQueries  per theme, LLM generates 1–2 search queries
                     (off-domain themes are dropped here)
        ▼
⑥ searchWeb       SerpAPI google → candidate URLs
        ▼
⑦ scoreAuthority  allowlist floor / denylist drop / LLM judge
        ▼
⑧ fetchAndExtract cheerio main-text extraction
        ▼
⑨ checkDuplicate  embed snippet → KB similarity ≥ 0.90 = skip
        ▼
⑩ stageCandidate  LLM summary + tags → insert into knowledge_candidates
                  (status='pending')
        ▼
⑪ Admin reviews at /admin/knowledge → Approve (ingest) or Reject
```

**Key consequence:** if there are no fresh `rag_gap` events, `mineGaps` returns
`[]` and the run stages **nothing**. The pipeline is reactive — it never invents
work. A freshly deployed instance with no traffic will discover nothing until
real users hit coverage gaps. (`rag_gap` logging only began when this feature
shipped; historical gaps were never recorded.)

---

## What counts as a "gap"

A `rag_gap` event is logged (see `lib/ai/rag-gap.ts`, called from
`lib/agents/orchestrator.ts`) when **all** of these hold for a chat turn:

- the user is signed in (the event is written via the audit-scoped service-role
  client set up in the chat route),
- the orchestrator classified the message as `health_question`,
- the top retrieved chunk's similarity `topScore < 0.52` (`GAP_THRESHOLD`),
  which includes the zero-result case (`topScore = 0`).

### The two-thresholds principle

These are deliberately different numbers, answering different questions:

| Threshold | Where | Question it answers |
|---|---|---|
| **0.45** | `lib/rag/retrieve.ts` | "Is this chunk good enough to *cite* in an answer?" |
| **0.52** | `lib/ai/rag-gap.ts` (`GAP_THRESHOLD`) | "Is our *coverage* of this question good enough?" |

The gap threshold is stricter than the retrieval floor so it catches
*weak-coverage* answers (a chunk came back but only scored, say, 0.47), not just
zero-result ones. The 0.45 retrieval floor is tuned for `text-embedding-3-small`
(whose "clearly relevant" pairs score ~0.54–0.60) and is **out of scope** to
change here.

---

## Triggers

`GET /api/embeddings/discover` runs the pipeline. It authenticates **either**:

- a **Vercel Cron** request — `Authorization: Bearer ${CRON_SECRET}` → trigger `cron`
- an **admin session** — the "Run discovery now" button on `/admin/knowledge` → trigger `manual`

401 if neither; 403 for a non-admin session. The route is a **GET** because
Vercel Cron only issues GET requests. It runs inside `auditContext` with a
service-role client so LLM calls are audited and inserts bypass RLS on the
admin-only staging tables.

Schedule: **every 3 days** — `0 3 */3 * *` (UTC), see `vercel.json`.
`CRON_SECRET` must be set in the Vercel project env (it also gates the eager
validation in `lib/env.ts`, so a missing value breaks the build).

---

## Bounds (so one run can't run away)

A run is capped on three axes (constants in `lib/discovery/constants.ts`):

| Constant | Default | Purpose |
|---|---|---|
| `MAX_GAP_CLUSTERS` | 5 | gap themes processed per run |
| `MAX_RESULTS_PER_QUERY` | 5 | search results pulled per query |
| `MAX_CANDIDATES_PER_RUN` | 15 | hard cap on candidates staged per run |
| `RUN_BUDGET_MS` | 240_000 | wall-clock budget (guards the 300s function limit) |
| `GAP_LOOKBACK_DAYS` | 30 | how far back `mineGaps` reads `rag_gap` events |

Per-candidate failures (a bad URL, an LLM hiccup) are swallowed and logged so one
bad source never aborts the batch. A thrown stage (e.g. `mineGaps`) fails the
whole run and marks the `discovery_runs` row `failed`.

---

## Quality gates

| Gate | Where | Rule |
|---|---|---|
| Domain relevance #1 | `synthesizeQueries` | off-domain themes → no queries |
| Authority allowlist | `scoreAuthority` | who.int, cdc.gov, nhs.uk, acog.org, cancer.gov, cancer.org(.au), cancercouncil.com.au, healthdirect.gov.au, mayoclinic.org → authority floored to 0.95 |
| Authority denylist | `scoreAuthority` | reddit, quora, pinterest, facebook, x/twitter, tiktok, medium → authority 0, dropped |
| Authority/relevance floor | `runDiscovery` | drop if `authorityScore < 0.6` or `relevanceScore < 0.6` |
| Dedup vs KB | `checkDuplicate` | skip if an existing chunk matches at similarity ≥ 0.90 |
| Dedup vs prior candidates | `stageCandidate` | `content_hash` unique constraint → duplicate insert returns null |
| **Human review** | `/admin/knowledge` | nothing reaches `knowledge_chunks` without an admin clicking Approve |

Review state lives **only** in the admin/staging surface — never in the
learn/chat product UI. Approved chunks flow into `knowledge_chunks` like any
other document.

---

## File map

```
lib/ai/rag-gap.ts            recordRagGap + GAP_THRESHOLD (gap capture)
lib/discovery/
  types.ts                   shared types
  constants.ts               allowlist/denylist, thresholds, batch budgets
  prompts.ts                 4 LLM prompt definitions
  llm.ts                     runDiscoveryLlm (audited Claude call helper)
  mine-gaps.ts               read rag_gap events → LLM cluster
  synthesize-queries.ts      theme → search queries
  search.ts                  SerpAPI google search
  score-authority.ts         allowlist/denylist + LLM judge
  fetch-extract.ts           cheerio main-text extraction
  dedup.ts                   KB similarity + content hash
  stage-candidate.ts         summarize + insert pending row
  run.ts                     runDiscovery coordinator (bounded batch)
app/api/embeddings/discover/route.ts    cron + manual trigger
app/(app)/admin/knowledge/              review queue UI
lib/discovery/review-actions.ts         approveCandidate / rejectCandidate
lib/auth/require-admin.ts               server-side admin gate
```

Tables: `knowledge_candidates` (staging), `discovery_runs` (run log), and
`analytics_events` (reused for `rag_gap`). All Claude calls use
`claude-sonnet-4-6`; embeddings use OpenAI `text-embedding-3-small`.

---

## Operating it

- **Exercise it manually:** ask the prod chat a few health questions the KB can't
  answer well (creates `rag_gap` events), then click **"Run discovery now"** on
  `/admin/knowledge`. Without gaps, a run stages nothing — that's expected.
- **Seeding the initial KB** is separate from discovery: `pnpm seed:kb` (or the
  same script pointed at prod via an env file) re-ingests the curated source
  docs in `supabase/seeds/knowledge/` straight into `knowledge_chunks`.
- **Tuning:** all knobs live in `lib/discovery/constants.ts` and
  `lib/ai/rag-gap.ts` (`GAP_THRESHOLD`). Lower `GAP_THRESHOLD` = stricter gap
  detection (fewer gaps); raise it = more.
- **Deleting a discovered document** (via `/admin/knowledge/documents`) removes
  its chunks but leaves the `knowledge_candidates` row `approved`. Because the
  content is gone from the KB, the 0.90 dedup no longer matches it, so a future
  run may re-discover and re-queue it. That is expected.

## Not built (possible future work)

- **Topic-driven mode:** proactively cover a curated topic list even with no user
  gaps. Today the pipeline is purely reactive to `rag_gap` events.
- **Background-job UX:** "Run discovery now" currently blocks until the run
  finishes (up to `RUN_BUDGET_MS`).
- **`discovery_runs` history view** in the admin section.
