# Epic 3 — Chat Tables Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Epic 3 / #17 — chat persistence schema with RLS — by reconciling the issue's acceptance criteria against the code that's already on disk, adding the one missing piece (a composite `(session_id, created_at)` index), running the existing RLS suite end-to-end, and updating the docs/issue to match reality.

**Architecture:** Most of #17 is **already implemented**. The Epic 1 migration `20260409170402_create_chat_tables.sql` created `chat_sessions` and `chat_messages`, the Epic 2 migration `20260413143757_rls_policies.sql` added owner-scoped RLS policies plus admin-read, and `tests/db/rls-policies.test.ts` already covers ten chat-table cases. The remaining gaps are: (1) a composite `(session_id, created_at)` index that EPIC3-05's "load latest N messages" query will rely on, (2) verifying `supabase db reset` + the RLS suite still pass on the current branch, and (3) bringing the issue body and the source ticket doc into alignment with the actual schema (the issue says `role check ('user','assistant','system')` but the codebase uses `('user','assistant')` — and that's correct for our architecture, since system prompts are loaded fresh per request and not persisted).

**Tech Stack:** Supabase CLI (local Postgres + Auth), `@supabase/supabase-js`, Vitest, pnpm, Biome, gh CLI.

**Issue:** [#17](https://github.com/Zoeyyhc/cervix-assistant/issues/17)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-01

---

## Pre-existing work (do not redo)

- ✅ `supabase/migrations/20260409170402_create_chat_tables.sql` — both tables, `set_updated_at()` trigger function, `chat_sessions_updated_at` trigger, single-column indexes
- ✅ `supabase/migrations/20260413143757_rls_policies.sql` — owner full-access + admin read-all on both tables
- ✅ `types/supabase.ts` — chat tables present in generated types (lines 69, 104)
- ✅ `tests/db/rls-policies.test.ts` — 10 chat-table tests including cross-user read/write isolation
- ✅ `docs/database.md` — schema and RLS matrix already documented (lines 21–37, 100–101)

## Gaps vs #17 acceptance criteria

| AC | Status | Action |
|---|---|---|
| Migration exists, both tables defined | ✅ Done | None |
| `chat_sessions` schema (id/user_id/title/timestamps) | ✅ Done | None |
| `chat_messages` schema (id/session_id/role/content/timestamps) | ✅ Done | None — note: also has `metadata jsonb`, not in #17 body but useful for EPIC3-12 citations. Keep. |
| Index on `chat_messages(session_id, created_at)` | ⚠️ Partial — only `(session_id)` exists | **Task 2**: add composite index migration |
| RLS enabled + owner policies | ✅ Done | None |
| `supabase db reset` succeeds | ❓ Not verified on current branch | **Task 1**: verify |
| `types/supabase.ts` regenerated | ✅ Already in sync | Re-verify after Task 2 (Task 4) |
| Vitest RLS test for cross-user isolation | ✅ Done | **Task 1**: verify it still passes |
| `role` includes `'system'` | ❌ Codebase uses `('user','assistant')` only | **Task 5**: update issue body + source doc to match reality (system prompts are per-request, not persisted) |

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20260430NNNNNN_chat_messages_composite_index.sql` | **Create** | Add composite `(session_id, created_at)` index for ordered message reads. New migration (Epic 1 migrations are sealed and applied to dev DBs). |
| `docs/database.md` | **Modify** | Document the new composite index alongside the existing single-column index (line ~37). |
| `docs/epics/epic3-ai-health-assistant-tickets.md` | **Modify** | Update EPIC3-01 ACs: drop `'system'` from the role enum, note the composite index, and mark the ticket as "in progress / partial — see plan". |
| Issue #17 body (via `gh issue edit`) | **Modify** | Mirror the source-doc reconciliation so the GitHub issue reflects reality. |

**Files not touched:**
- The existing chat-tables migration — sealed.
- The RLS migration — sealed.
- `types/supabase.ts` — composite indexes don't appear in generated types (Supabase types only carry table/column shape), so no regeneration needed for Task 2 specifically. Task 4 still re-runs the regeneration command as a smoke test.
- `tests/db/rls-policies.test.ts` — coverage is already sufficient. Adding a "messages ordered by created_at" test would be implementation detail for EPIC3-04, not a property of #17.

---

## Pre-flight (run once before starting)

- [ ] **Step A: Confirm Docker + Supabase are running**

Run:
```bash
supabase status
```
Expected: prints a block including `API URL`, `DB URL`, `anon key`, and `service_role key`. If it says "supabase local development setup is not running", start it with `supabase start` (Docker Desktop required).

- [ ] **Step B: Export the local Supabase env vars into your shell**

The RLS test suite is gated on `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`. Without them, `describe.runIf(canRun)` silently skips the entire chat-tables block — meaning a "passing" `pnpm test` proves nothing.

```bash
eval "$(supabase status -o env)"
# If supabase status -o env emits API_URL/SERVICE_ROLE_KEY/ANON_KEY instead of the
# SUPABASE_-prefixed names the test reads, alias them:
export SUPABASE_URL="${SUPABASE_URL:-$API_URL}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"

echo "$SUPABASE_URL"                # http://127.0.0.1:54321
echo "${SUPABASE_SERVICE_ROLE_KEY:0:20}…"
echo "${SUPABASE_ANON_KEY:0:20}…"
```
Keep this shell open for every subsequent task.

- [ ] **Step C: Confirm `gh` is authenticated for the issue edit later**

Run:
```bash
gh auth status
```
Expected: `Logged in to github.com account Zoeyyhc` (or your account) with `repo` scope.

---

## Task 1: Verify the current state passes before changing anything

**Files:** none (read-only verification)

- [ ] **Step 1: Reset the local DB and re-apply every migration**

Run:
```bash
supabase db reset
```
Expected: ends with `Finished supabase db reset.` (or equivalent success line). No SQL errors. If this fails, stop the plan and debug — every later step assumes the schema applies cleanly.

- [ ] **Step 2: Confirm both tables and the existing index are present**

Run:
```bash
psql "$DB_URL" -c "\d public.chat_sessions" -c "\d public.chat_messages"
```
(or use `supabase db query` if you don't have psql.) Expected: both `\d` outputs list the columns shown in the migration file, plus an `Indexes:` section. `chat_messages` should currently show **only** `chat_messages_session_id_idx` (the single-column index) — that's the gap Task 2 fills.

- [ ] **Step 3: Run the RLS suite with the env vars set**

Run:
```bash
pnpm test tests/db/rls-policies.test.ts
```
Expected output includes the `chat_sessions & chat_messages` describe block with **all 10 cases passing** — not skipped. If you see `0 tests` or the chat block is missing, your env vars aren't visible to Vitest; re-export per Step B and re-run.

- [ ] **Step 4: Run the full test suite as a regression check**

Run:
```bash
pnpm test
```
Expected: green. Note any pre-existing failures unrelated to #17 — those are not this plan's job to fix; flag them to the user instead.

- [ ] **Step 5: Commit nothing yet**

This task only verifies. The next task introduces the composite index.

---

## Task 2: Add the composite `(session_id, created_at)` index

**Files:**
- Create: `supabase/migrations/20260430120000_chat_messages_composite_index.sql`

(Adjust the `20260430120000` prefix if you start later in the day — the convention is `YYYYMMDDhhmmss`. Use whatever the current local time gives you; what matters is that this migration sorts **after** `20260413143757_rls_policies.sql`.)

- [ ] **Step 1: Generate the migration filename via the Supabase CLI**

Run:
```bash
supabase migration new chat_messages_composite_index
```
Expected: prints the path of a new empty SQL file under `supabase/migrations/`. Note its exact filename — replace the `NNNNNN` placeholder below with that real timestamp suffix.

- [ ] **Step 2: Write the migration**

Open the file the CLI just created and replace its contents with:

```sql
-- Epic 3 · #17 · Composite index for ordered chat-message reads.
--
-- The single-column index on chat_messages(session_id) added in
-- 20260409170402_create_chat_tables.sql is sufficient for filtering by session,
-- but EPIC3-05 ("load the last N messages for a session") sorts by created_at
-- as well. Postgres can use the existing index plus a sort, but a composite
-- index lets it skip the sort entirely on the hot path.
--
-- The single-column index is intentionally left in place — Postgres can pick
-- whichever leading-column subset it prefers and the storage cost is small at
-- v1 scale.

create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);
```

- [ ] **Step 3: Apply the migration via a fresh reset**

Run:
```bash
supabase db reset
```
Expected: same success line as Task 1 / Step 1, plus your new migration in the applied list.

- [ ] **Step 4: Confirm the new index is present**

Run:
```bash
psql "$DB_URL" -c "\d public.chat_messages"
```
Expected: the `Indexes:` block now lists **both** `chat_messages_session_id_idx` and `chat_messages_session_created_idx`.

- [ ] **Step 5: Re-run the RLS suite to confirm nothing regressed**

Run:
```bash
pnpm test tests/db/rls-policies.test.ts
```
Expected: same 10/10 chat tests passing as in Task 1 / Step 3.

- [ ] **Step 6: Commit just the migration**

```bash
git add supabase/migrations/<your_filename>.sql
git commit -m "feat(chat): add composite (session_id, created_at) index on chat_messages"
```

---

## Task 3: Document the new index

**Files:**
- Modify: `docs/database.md` (the `chat_messages` section near line 31)

- [ ] **Step 1: Open `docs/database.md` and locate the `chat_messages` block**

Search for `### \`chat_messages\``. The current block lists columns but no indexes.

- [ ] **Step 2: Append an `Indexes` line after the column block**

Add (or extend, if there's already an Indexes line) so the section reads roughly:

```md
### `chat_messages`

```sql
id          uuid primary key default gen_random_uuid()
session_id  uuid references chat_sessions(id) on delete cascade
role        text check (role in ('user', 'assistant'))
content     text
metadata    jsonb
created_at  timestamptz default now()
```

**Indexes:** `(session_id)` for owner/session-scoped queries; `(session_id, created_at)` for ordered-history reads (used by the chat context-window helper).
```

(Keep the existing fenced code block; only add the new prose line below it. Don't touch surrounding sections.)

- [ ] **Step 3: Run Biome to keep formatting clean**

Run:
```bash
pnpm biome check --write docs/database.md
```
Expected: no errors; the file may be re-wrapped slightly.

- [ ] **Step 4: Commit the docs change**

```bash
git add docs/database.md
git commit -m "docs(database): document composite (session_id, created_at) index"
```

---

## Task 4: Reconcile the source ticket doc

**Files:**
- Modify: `docs/epics/epic3-ai-health-assistant-tickets.md` (§EPIC3-01)

The current AC list says `role text check in ('user','assistant','system')`. The codebase uses `('user','assistant')` and that's the right call — the system prompt is loaded fresh per request from `lib/ai/system-prompt.ts` (see EPIC3-02) and isn't persisted. Update the AC to match.

- [ ] **Step 1: Edit the EPIC3-01 AC block**

Open `docs/epics/epic3-ai-health-assistant-tickets.md`. Find the line:

```md
- [ ] `chat_messages`: `id uuid pk`, `session_id uuid fk chat_sessions on delete cascade`, `role text check in ('user','assistant','system')`, `content text`, `created_at`
```

Replace with:

```md
- [ ] `chat_messages`: `id uuid pk`, `session_id uuid fk chat_sessions on delete cascade`, `role text check in ('user','assistant')`, `content text`, `metadata jsonb null`, `created_at`
```

(Two changes: drop `'system'` from the role enum; add `metadata jsonb null` so the doc matches the actual table.)

Also update the index AC line:

```md
- [ ] Index on `chat_messages(session_id, created_at)`
```

…to:

```md
- [ ] Indexes on `chat_messages(session_id)` and `chat_messages(session_id, created_at)`
```

- [ ] **Step 2: Add a note in the Technical Notes block**

Just below the AC list, in the "Technical Notes" section for EPIC3-01, add a bullet:

```md
- The `'system'` role is intentionally excluded from the `role` enum: system prompts are loaded fresh per request from `lib/ai/system-prompt.ts` (EPIC3-02) and not persisted. Adding it later is a one-line ALTER TABLE if the architecture changes.
```

- [ ] **Step 3: Commit the doc reconciliation**

```bash
git add docs/epics/epic3-ai-health-assistant-tickets.md
git commit -m "docs(epic-3): reconcile EPIC3-01 ACs with the actual chat_messages schema"
```

---

## Task 5: Reconcile issue #17 on GitHub

**Files:** none locally; updates live on GitHub via `gh`.

- [ ] **Step 1: Fetch the current body to a temp file**

Run:
```bash
gh issue view 17 --repo Zoeyyhc/cervix-assistant --json body --jq .body > /tmp/issue-17-body.md
```

- [ ] **Step 2: Edit `/tmp/issue-17-body.md`**

Apply the same two changes from Task 4 / Step 1 (`role` enum, index AC) and add the same Technical Note. Also flip the AC checkboxes for items that are already done on `main`:

```md
- [x] New migration `supabase/migrations/NNNN_chat_tables.sql`
- [x] `chat_sessions`: `id uuid pk`, … (already on main)
- [x] `chat_messages`: `id uuid pk`, …, `role text check in ('user','assistant')`, …, `metadata jsonb null`, …
- [x] RLS enabled on both tables; owner policies via Epic 2 RLS migration
- [ ] Indexes on `chat_messages(session_id)` and `chat_messages(session_id, created_at)`  ← composite added by this PR
- [ ] `supabase db reset` succeeds  ← verified locally; will be re-checked in CI
- [x] `types/supabase.ts` regenerated  (already in sync)
- [x] Vitest integration test verifying cross-user RLS  (`tests/db/rls-policies.test.ts`)
```

(Adjust the wording so it still reads as a coherent issue body — don't just paste this list verbatim if it conflicts with surrounding prose.)

- [ ] **Step 3: Push the updated body to GitHub**

Run:
```bash
gh issue edit 17 --repo Zoeyyhc/cervix-assistant --body-file /tmp/issue-17-body.md
```
Expected: prints the issue URL. Open it in a browser and confirm the boxes that should be checked are checked.

- [ ] **Step 4: Add a short comment summarising what landed**

Run:
```bash
gh issue comment 17 --repo Zoeyyhc/cervix-assistant --body "Most of #17 was already on main from Epic 1/2 work; this PR closes the gap by adding the composite \`(session_id, created_at)\` index and reconciling the issue + source doc with the actual schema. RLS suite (10 chat tests) passing locally."
```

- [ ] **Step 5: Clean up the temp file**

```bash
rm /tmp/issue-17-body.md
```

---

## Task 6: Final verification + push

**Files:** none — runs the full suite end-to-end and pushes.

- [ ] **Step 1: Re-run Biome across the repo**

Run:
```bash
pnpm biome check .
```
Expected: green.

- [ ] **Step 2: Re-run the test suite from a clean DB**

```bash
supabase db reset && pnpm test
```
Expected: all suites green; the `chat_sessions & chat_messages` describe block shows 10/10.

- [ ] **Step 3: Push the branch and (optionally) open a PR**

```bash
git push -u origin "$(git branch --show-current)"
```
If you want a PR for review (solo project — optional), follow the existing convention:
```bash
gh pr create --title "feat(chat): close out #17 — composite index + doc reconciliation" \
  --body "$(cat <<'EOF'
## Summary
- Add composite \`(session_id, created_at)\` index on \`chat_messages\` for ordered-history reads
- Reconcile issue #17 + \`docs/epics/epic3-ai-health-assistant-tickets.md\` with the actual schema (role enum, metadata column)
- Document the new index in \`docs/database.md\`

## Test plan
- [x] \`supabase db reset\` from clean
- [x] \`pnpm test\` — 10/10 chat RLS cases pass
- [x] \`pnpm biome check .\` — clean

Closes #17.
EOF
)"
```

- [ ] **Step 4: Close issue #17**

If you opened a PR in Step 3, the `Closes #17` line auto-closes on merge. If you pushed straight to `main` (solo workflow), close manually:
```bash
gh issue close 17 --repo Zoeyyhc/cervix-assistant --reason completed
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #17 maps to either a Task in this plan or a "✅ Done" row in the gaps table.
- **Placeholder scan:** no TBD/TODO/"add appropriate X" — every step has a concrete command or code block. The single `NNNNNN` placeholder in the migration filename is unavoidable (timestamp generated by `supabase migration new`) and explicitly explained in Task 2 / Step 1.
- **Type consistency:** the role-enum decision (`'user','assistant'` only) is propagated through Tasks 4, 5 and matches the existing migration. The new index name `chat_messages_session_created_idx` is referenced consistently in Tasks 2 and 3.
