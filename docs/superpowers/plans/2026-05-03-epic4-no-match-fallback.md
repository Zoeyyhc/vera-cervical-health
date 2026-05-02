# Epic 4 — #49 No-Match Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this project disables strict checkpoint flow per `CLAUDE.md` — execute directly). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the existing empty-`ragContext` fallback behavior with explicit tests, and add a one-line orchestrator log when `health_question` retrievals return zero chunks (helps tune the 0.75 similarity threshold later).

**Architecture:** Tiny ticket. The structural fallback is already correct — `response-agent.ts:36-37` uses JS truthiness (`ctx.ragContext ? ... : baseSystem`), so empty-string and undefined both skip the "Retrieved context:" header. This ticket exists to (1) **lock that behavior** with an explicit test (catches regressions if someone changes the check to `!= null`), and (2) add a low-cost operational signal in the orchestrator. Net: +30 lines across 3 files.

**Tech Stack:** Vitest only — no production code paths change in `response-agent.ts`. Orchestrator gets a single `console.info` line.

**Issue:** [#49](https://github.com/Zoeyyhc/cervix-assistant/issues/49)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-08
**Depends on:** #46 (`runRagAgent`) ✅ merged. Orthogonal to #48 (KB seed).

---

## Pre-existing scaffolding

- ✅ `runRagAgent` returns `{ ragContext: "", ragSources: [] }` on no-match (#46)
- ✅ `runResponseAgent` skips "Retrieved context:" header when `ragContext` is falsy (#28/#41)
- ✅ Orchestrator already logs intent dispatch via `console.info("[orchestrator] dispatch: ${intent}")`

## Gaps vs #49 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `runRagAgent` returns `{ ragContext: "", ragSources: [] }` on no-match | ✅ — done in #46 | None |
| Response agent receives empty `ragContext` and emits unchanged baseline prompt | ✅ — structurally correct in `response-agent.ts:36-37` | None |
| Explicit unit test pinning empty-`ragContext` behavior | ❌ | **Task 1** |
| (Optional) Orchestrator logs `health_question` calls that returned zero chunks | ❌ | **Task 2** |

## Decisions documented in this plan

- **Pin empty-string behavior, not just absent-key.** Existing test at `response-agent.test.ts:213` covers `ragSources: []` and absent. New test covers `ragContext: ""` explicitly — that's the subtle one because someone reading `ctx.ragContext ? ...` might "fix" it to `ctx.ragContext != null` and silently regress.
- **Do the optional orchestrator log.** It's a one-liner (`console.info`), matches the existing prefix convention, and gives us a real operational signal. When the KB grows past the seed and threshold tuning becomes a question, having a count of zero-chunk fires in production logs is the cheapest possible source of truth.
- **Log format:** `[orchestrator] health_question returned 0 chunks for query: <first-80-chars>`. 80 chars is enough to hand-eyeball the query without dumping PII-rich full messages into logs. Same `console.info` level as the existing dispatch log.
- **Don't change the prompt.** AC explicitly says baseline prompt is unchanged for empty case. Already true; just pinned.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/agents/response-agent.test.ts` | **Modify** | Add 1 pinning test: empty-string `ragContext` skips "Retrieved context:" header |
| `lib/agents/orchestrator.ts` | **Modify** | Add 1 `console.info` line when `runRagAgent` returns 0 chunks for `health_question` |
| `lib/agents/orchestrator.test.ts` | **Modify** | Add 1 test: zero-chunk log fires; non-zero retrieval doesn't log |

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/no-match-fallback-49`.

- [ ] **Step B: Baseline tests + Biome + tsc green**

```bash
eval "$(supabase status -o env 2>/dev/null)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 231/231 (post-#48 — no new tests, just content). Biome/tsc clean.

---

## Task 1: Pin empty-string `ragContext` behavior

**Files:** `lib/agents/response-agent.test.ts`.

- [ ] **Step 1: Add the pinning test inside the existing `describe("runResponseAgent")` block**

Insert after the test at line ~175 ("appends ragContext to the system prompt when provided"):

```typescript
test("treats empty-string ragContext the same as no ragContext (no 'Retrieved context:' header)", async () => {
  const anthropic = mockAnthropic({ events: [] });
  vi.mocked(getAnthropicClient).mockReturnValue(anthropic as never);

  await collect(
    runResponseAgent({
      userMessage: "Hi",
      history: [],
      ragContext: "", // explicit empty string — the no-match-fallback case from runRagAgent
    })
  );

  const args = anthropic.messages.stream.mock.calls[0] as unknown as [
    { model: string; system: string; messages: unknown[]; max_tokens: number },
  ];
  // System prompt is the baseline; "Retrieved context:" header is NOT appended for empty string
  expect(args[0].system).toBe(DEFAULT_SYSTEM_PROMPT);
  expect(args[0].system).not.toContain("Retrieved context:");
});
```

- [ ] **Step 2: Run the test — should pass immediately (characterization test)**

```bash
pnpm test lib/agents/response-agent.test.ts 2>&1 | tail -8
```
Expected: all tests pass (existing + 1 new = 6 total). The test passes because the existing `ctx.ragContext ? ... : baseSystem` already does the right thing.

- [ ] **Step 3: Commit**

```bash
git add lib/agents/response-agent.test.ts
git commit -m "test(agents): pin empty-string ragContext fallback behavior in response-agent"
```

---

## Task 2: Orchestrator zero-chunk log

**Files:** `lib/agents/orchestrator.ts`, `lib/agents/orchestrator.test.ts`.

- [ ] **Step 1: Write the failing test in `orchestrator.test.ts`**

Inside the existing `describe("runOrchestrator")` block (find the `health_question` happy-path test for context), add:

```typescript
test("logs a zero-chunk warning when health_question retrieval returns no sources", async () => {
  const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(classifyIntent).mockResolvedValueOnce("health_question");
  vi.mocked(runRagAgent).mockResolvedValueOnce({ ragContext: "", ragSources: [] });
  vi.mocked(runResponseAgent).mockReturnValueOnce(mockResponseStream(["ok"]));

  await collect(
    runOrchestrator(makeFakeSupabase(), {
      userMessage: "What is HPV?",
      history: [],
    })
  );

  expect(consoleInfoSpy).toHaveBeenCalledWith(
    expect.stringContaining("health_question returned 0 chunks")
  );
  consoleInfoSpy.mockRestore();
});

test("does NOT log the zero-chunk warning when health_question retrieval returns sources", async () => {
  const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(classifyIntent).mockResolvedValueOnce("health_question");
  vi.mocked(runRagAgent).mockResolvedValueOnce({
    ragContext: "ctx",
    ragSources: [{ id: "1", title: "WHO", chunkId: "c1" }],
  });
  vi.mocked(runResponseAgent).mockReturnValueOnce(mockResponseStream(["ok"]));

  await collect(
    runOrchestrator(makeFakeSupabase(), {
      userMessage: "What is HPV?",
      history: [],
    })
  );

  expect(consoleInfoSpy).not.toHaveBeenCalledWith(
    expect.stringContaining("returned 0 chunks")
  );
  consoleInfoSpy.mockRestore();
});
```

> Note: shape of `mockResponseStream` and `makeFakeSupabase` may already exist in the file. If not, copy from the existing health_question test.

- [ ] **Step 2: Run tests to confirm the new ones fail**

```bash
pnpm test lib/agents/orchestrator.test.ts 2>&1 | tail -10
```
Expected: 2 new failures — log message not emitted.

- [ ] **Step 3: Add the log line in `orchestrator.ts`**

Find the `health_question` branch (around line 120-125) where `runRagAgent` is awaited. Right after destructuring the result, before invoking `runResponseAgent`, add:

```typescript
if (ragSources.length === 0) {
  console.info(
    `[orchestrator] health_question returned 0 chunks for query: ${ctx.userMessage.slice(0, 80)}`
  );
}
```

- [ ] **Step 4: Run tests — should pass now**

```bash
pnpm test lib/agents/orchestrator.test.ts 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 5: Biome + tsc on changed files + full suite**

```bash
pnpm biome check --write lib/agents/orchestrator.ts lib/agents/orchestrator.test.ts lib/agents/response-agent.test.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```
Expected: clean, 234/234 (231 + 3 new).

- [ ] **Step 6: Commit**

```bash
git add lib/agents/orchestrator.ts lib/agents/orchestrator.test.ts
git commit -m "feat(agents): log zero-chunk fires for health_question to aid threshold tuning"
```

---

## Task 3: Plan commit + push + PR

- [ ] **Step 1: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-03-epic4-no-match-fallback.md
git commit -m "docs(plan): add Epic 4 #49 no-match fallback plan"
```

- [ ] **Step 2: Push**

```bash
git push -u origin feat/no-match-fallback-49
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/no-match-fallback-49 \
  --title "test(agents): #49 — pin no-match fallback + log zero-chunk fires" \
  --body "$(cat <<'EOF'
## Summary
- Pin existing empty-string \`ragContext\` fallback in \`response-agent.test.ts\` — catches regressions if someone "fixes" the truthiness check to \`!= null\` later
- Add a one-line \`console.info\` in the orchestrator when \`health_question\` retrievals return zero chunks — operational signal for tuning the 0.75 similarity threshold once the KB grows past the seed
- Net change: +30 lines, no behavioral change to the production prompt path

## What's pinned
- \`response-agent.ts:36-37\` already correctly skips the "Retrieved context:" header when \`ragContext\` is falsy (empty string OR undefined). Existing tests covered the absent and non-empty cases; this PR adds the empty-string case explicitly. AC of #49 was satisfied structurally — this PR adds the test that locks it in.

## Operational log
- \`[orchestrator] health_question returned 0 chunks for query: <first-80-chars>\`
- Fires only on \`health_question\` intent with empty \`ragSources\`
- 80-char truncation keeps PII risk low while still being eyeballable
- Same \`console.info\` level as the existing intent-dispatch log

## Tests added (3)
- response-agent: empty-string \`ragContext\` → baseline prompt only, no "Retrieved context:" header
- orchestrator: zero-chunk health_question → log emitted
- orchestrator: non-zero health_question → log NOT emitted

## Test plan
- [x] \`pnpm test\` — full suite green
- [x] \`pnpm biome check .\` — clean
- [x] \`pnpm exec tsc --noEmit\` — clean

Closes #49. **Only #50 (HNSW index tuning measurement) remains in Epic 4** — S-priority, can ship in a follow-up sprint.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #49 maps to either ✅ pre-existing or a Task. Optional log is included (justified: tuning signal at low cost).
- **No production behavior change** in `response-agent.ts` — only test addition. Orchestrator change is a `console.info` log line, no control flow change.
- **Test isolation:** `consoleInfoSpy.mockRestore()` cleans up between tests. The negative-case test (sources present → no log) verifies the conditional, not just the absence in some other test.
- **PII consideration:** truncating to 80 chars is conservative; full user messages don't go to logs. If even 80 chars is too much for some future deployment, the log can be downgraded to a count-only metric — leave that decision for a separate ticket if it ever comes up.
