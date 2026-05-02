# Epic 4 — RAG Knowledge Base — Ticket Breakdown

> Derived from `docs/sprints.md` §Epic 4. Sprint 3 covers all `M` items (the RAG retrieval pipeline end-to-end). `S` items (fallback polish, HNSW tuning) ship in the same sprint or follow-up.

Each ticket is scoped to a single PR. Dependencies reference other tickets by ID. Acceptance criteria (AC) are the minimum bar for "done".

---

## Schema-level scaffolding ALREADY in place (Epic 1)

The Epic 1 migration `supabase/migrations/20260409170904_create_knowledge_chunks.sql` already shipped:

- ✅ `knowledge_chunks` table — `id`, `source`, `content`, `embedding vector(1536)`, `metadata jsonb`, `created_at`
- ✅ HNSW index on `embedding` using `vector_cosine_ops` with `m=16, ef_construction=64`
- ✅ `public.match_knowledge_chunks(query_embedding, threshold, count)` SQL RPC — returns rows above threshold sorted by similarity
- ✅ RLS policies (Epic 2 #12): admins INSERT/UPDATE/DELETE; all authenticated SELECT

Epic 4 is therefore **almost entirely application-layer code** — no new tables, no new indexes, no new RPCs in v1. Tickets reflect that.

---

## Sprint 3 — RAG pipeline (M-priority)

### EPIC4-01 — OpenAI Client + Embeddings Helper
**MoSCoW:** M
**Depends on:** —

Install the OpenAI SDK, expose a typed client factory, and add an `embedText(text)` helper that calls `text-embedding-3-small` and returns a 1536-dim float array.

**AC:**
- [ ] `openai` SDK added to `package.json` (version pinned)
- [ ] `OPENAI_API_KEY` already documented in `docs/env-vars.md` and `.env.example` (verify; should be present from Epic 1)
- [ ] `lib/ai/openai.ts` exports `getOpenAIClient()` factory consuming `env.openaiApiKey`
- [ ] `lib/rag/embed.ts` exports `embedText(text: string): Promise<number[]>` — calls `text-embedding-3-small`, returns the 1536-dim vector
- [ ] Model string `text-embedding-3-small` is hard-coded (per `CLAUDE.md` convention)
- [ ] Vitest unit tests mock the SDK and assert the call shape (model, input) + return-array length

**Technical Notes:**
- Mirrors the Anthropic client pattern from #18.
- Rate limits and retries are handled by the SDK's defaults for v1.

---

### EPIC4-02 — Document Chunking (512 tokens / 64 overlap)
**MoSCoW:** M
**Depends on:** —

Pure utility that splits a long text into ~512-token chunks with 64-token overlap so adjacent chunks share context across boundaries.

**AC:**
- [ ] `lib/rag/chunking.ts` exports `chunkText(text, opts?): string[]`
- [ ] Defaults: `chunkSize: 512`, `overlap: 64`. Both overridable via `opts`.
- [ ] Token counting: cheap-and-correct approximation (1 token ≈ 4 chars) is fine for v1; the tokenizer choice is documented as "swap to `tiktoken` later if RAG quality drops".
- [ ] Empty input → empty array
- [ ] Input shorter than `chunkSize` → single-element array
- [ ] Each chunk's tail ≈ next chunk's head (overlap enforced)
- [ ] Vitest unit tests: empty, single chunk, exact-boundary, overlap correctness, deterministic output

**Technical Notes:**
- Pure function, no I/O.
- Boundary preference: prefer paragraph breaks, then sentence breaks, then word breaks. Hard cut only if no break exists in the window.

---

### EPIC4-03 — Knowledge Chunks Insert Helper
**MoSCoW:** M
**Depends on:** EPIC4-01, EPIC4-02

Server-side helper that takes raw text + metadata, chunks it, embeds each chunk, and bulk-inserts into `knowledge_chunks`. Used by the admin ingest endpoint (#06) and the seed script (#07).

**AC:**
- [ ] `lib/rag/store.ts` exports `ingestDocument(supabase, { content, source, metadata? }): Promise<{ chunkIds: string[] }>`
- [ ] Internally: chunks via `chunkText`, embeds each via `embedText`, inserts all chunks in a single Supabase `insert([...])` call
- [ ] Embeddings generated in parallel where possible (e.g., `Promise.all` with a small concurrency cap)
- [ ] Returns the inserted chunk IDs for the caller to surface to admins
- [ ] Vitest unit tests with mocked OpenAI + mocked Supabase: assert chunking happened, embeddings were generated per chunk, inserts contain the right shape

**Technical Notes:**
- Uses the cookie-aware Supabase server client passed in by the caller (RLS scopes the insert to admins via the policy from Epic 2 #12).
- Cost note: a 50KB document chunks to ~25 chunks, ~25 embedding API calls per ingest. Acceptable for admin ingest; not for per-request use.

---

### EPIC4-04 — pgvector Cosine Similarity Retrieval Helper
**MoSCoW:** M
**Depends on:** EPIC4-01

Wraps the existing `match_knowledge_chunks` RPC in a typed TypeScript helper that the RAG agent calls.

**AC:**
- [ ] `lib/rag/retrieve.ts` exports `retrieveChunks(supabase, queryEmbedding, opts?): Promise<RetrievedChunk[]>`
- [ ] Defaults: `threshold: 0.75`, `count: 5`. Both overridable via `opts`.
- [ ] Calls `supabase.rpc("match_knowledge_chunks", { query_embedding, match_threshold, match_count })` — uses the existing RPC, no new SQL needed
- [ ] Returns typed `RetrievedChunk[]` with `id`, `source`, `content`, `similarityScore`, `metadata`
- [ ] Empty result when no chunks above threshold (returns `[]`, not null)
- [ ] Vitest unit tests with mocked Supabase RPC: returns sorted results, respects threshold, respects count, empty result handled

**Technical Notes:**
- The threshold value of `0.75` is the project's spec; tunable later.
- RLS allows all authenticated users to SELECT from `knowledge_chunks`, so the RPC works under any user's session.

---

### EPIC4-05 — RAG Agent — Query Embed + Retrieval + Context
**MoSCoW:** M
**Depends on:** EPIC4-01, EPIC4-04

The agent the orchestrator calls for `health_question` intents. Embeds the user query, retrieves top-k chunks, formats them as a context block + structured `Source[]`.

**AC:**
- [ ] `lib/agents/rag-agent.ts` exports `runRagAgent(supabase, { userMessage }): Promise<{ ragContext: string; ragSources: Source[] }>`
- [ ] Internally: `embedText(userMessage)` → `retrieveChunks(supabase, embedding)` → format
- [ ] `ragContext`: a human-readable concatenation of the retrieved `content`s, with citation markers like `[1]`, `[2]` matching the `Source[]` indices
- [ ] `ragSources`: structured `Source[]` from `types/agents.ts` (chunkId from the chunk row's `id`)
- [ ] Empty retrieval → returns `{ ragContext: "", ragSources: [] }` (no error)
- [ ] Per `CLAUDE.md`: pure function (no HTTP / DB / Supabase concerns inside — Claude/OpenAI calls are fine, takes Supabase client as a param)
- [ ] Vitest unit tests with mocked `embedText` + mocked `retrieveChunks`: assert context format + sources shape, empty-retrieval case

**Technical Notes:**
- Unblocks Epic 3 #27 (orchestrator wiring).
- The orchestrator calls this for `health_question` intents, then passes `ragContext` + `ragSources` into `runResponseAgent` (which already accepts both per #28).

---

### EPIC4-06 — Admin Ingestion Endpoint — POST `/api/embeddings/ingest`
**MoSCoW:** M
**Depends on:** EPIC4-03

Admin-only HTTP endpoint that accepts a document and ingests it into the knowledge base.

**AC:**
- [ ] `app/api/embeddings/ingest/route.ts` POST handler
- [ ] Auth: 401 if no Supabase user; 403 if user is not admin (`profiles.role !== 'admin'`)
- [ ] Zod-validated body: `{ source: string, content: string, metadata?: object }`
- [ ] Calls `ingestDocument` and returns `{ chunkIds: string[] }`
- [ ] 413 if content exceeds a sensible cap (e.g., 500KB raw text)
- [ ] 500 on embedding/insert failure with server-side logging
- [ ] Vitest route tests: 401 unauth, 403 non-admin, 200 admin happy path, 400 invalid body

**Technical Notes:**
- Returns `Response.json(...)` per `CLAUDE.md`.
- Per `CLAUDE.md`'s admin-route convention: do the role check on every request server-side.

---

### EPIC4-07 — Initial Knowledge Base Content Seed
**MoSCoW:** M
**Depends on:** EPIC4-03 (or EPIC4-06)

Curated v1 content from authoritative sources so the RAG agent has something to cite from day one.

**AC:**
- [ ] `scripts/seed-knowledge-base.ts` (or equivalent) ingests a curated set of documents from Cancer Council Australia, WHO, HealthDirect Australia
- [ ] Documents stored under version control as plain `.md` or `.txt` files in `supabase/seeds/knowledge/` (or similar) so they can be re-ingested deterministically
- [ ] License/attribution clearly recorded in each file's frontmatter (or a manifest)
- [ ] `pnpm seed:kb` (or similar npm script) runs the ingestion against a local Supabase
- [ ] Verification: `select count(*) from knowledge_chunks` after seeding returns a non-trivial number (~50-200 chunks for v1)
- [ ] No automated test (this is content + a script); manual smoke-check in the PR

**Technical Notes:**
- License compliance matters — record attribution per source.
- Could re-use `ingestDocument` (#03) directly OR call the admin endpoint (#06). Direct is simpler for a one-shot script.

---

## Sprint 3 (or follow-up) — Polish (S-priority)

### EPIC4-08 — Fallback When No Relevant Chunks Found
**MoSCoW:** S
**Depends on:** EPIC4-05

When `retrieveChunks` returns nothing above threshold, the RAG agent should signal that to the orchestrator/response agent so the reply doesn't pretend to have sources.

**AC:**
- [ ] `runRagAgent` already returns `{ ragContext: "", ragSources: [] }` for no-match (per EPIC4-05 AC)
- [ ] The response agent receives an empty `ragContext` and the system prompt is unchanged from baseline (no "Retrieved context:" header for empty)
- [ ] Verify in `lib/agents/response-agent.ts` that the empty-`ragContext` case produces the same prompt as the no-`ragContext` case (it already does — see #28's implementation; this ticket adds an explicit unit test pinning that behavior)
- [ ] Optional: orchestrator logs `health_question` calls that returned zero chunks (helps tune the threshold later)

**Technical Notes:**
- Most of this is already handled structurally; the ticket exists to add explicit test coverage and the optional logging.

---

### EPIC4-09 — HNSW Index Tuning Verification
**MoSCoW:** S
**Depends on:** EPIC4-07

The HNSW index already exists with `m=16, ef_construction=64` (Epic 1). This ticket is a **measurement + decision** — verify those defaults are reasonable for v1's KB size, document the decision, and only retune if numbers say so.

**AC:**
- [ ] Measure retrieval p50 / p95 query latency against the seeded KB (~50–200 chunks from #07)
- [ ] Confirm `ef_search` defaults are reasonable (PostgreSQL session-level — can be set via `SET hnsw.ef_search = N` or `set_config`)
- [ ] Document findings in `docs/database.md` under the `knowledge_chunks` section
- [ ] **No code change required if measurements are acceptable** — this ticket can close as "no-op, measurements logged" if so
- [ ] If retuning is needed, ship a migration that drops + recreates the index with new params (HNSW indexes can't be tuned in-place)

**Technical Notes:**
- For v1's small KB (~hundreds of chunks), defaults are almost certainly fine. This ticket protects against shipping with unknown perf and gives us a baseline to compare against post-launch.

---

## Dependency graph (shorthand)

```
EPIC4-01 ─┐
          ├─► EPIC4-03 ─► EPIC4-06 ─► EPIC4-07 ─► EPIC4-09
          │
          ├─► EPIC4-04 ─► EPIC4-05 ─► EPIC4-08
EPIC4-02 ─┘
```

EPIC4-05 unblocks Epic 3 / #27 (orchestrator wiring).

## Coverage check vs `docs/sprints.md` §Epic 4

| Feature (from sprints.md) | Ticket(s) |
|---|---|
| OpenAI `text-embedding-3-small` integration | EPIC4-01 |
| Document chunking (512 tokens, 64-token overlap) | EPIC4-02 |
| `knowledge_chunks` write + pgvector storage | EPIC4-03 (write helper); schema is pre-shipped from Epic 1 |
| pgvector cosine similarity retrieval (threshold > 0.75) | EPIC4-04 |
| RAG Agent — query embed + retrieval + context injection | EPIC4-05 |
| Admin ingestion endpoint `/api/embeddings/ingest` | EPIC4-06 |
| Initial knowledge base content (Cancer Council / WHO / HealthDirect) | EPIC4-07 |
| Fallback when no relevant chunks found | EPIC4-08 |
| HNSW index tuning | EPIC4-09 |
