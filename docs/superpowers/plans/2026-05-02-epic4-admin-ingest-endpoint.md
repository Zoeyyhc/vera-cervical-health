# Epic 4 — #47 Admin Ingestion Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this project disables the strict checkpoint flow per `CLAUDE.md` — execute tasks directly, but still read each step). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/embeddings/ingest` — an admin-only HTTP endpoint that accepts a document `{ source, content, metadata? }`, calls `ingestDocument` (#44), and returns the inserted `{ chunkIds: string[] }`. Status codes: 401 unauth, 403 non-admin, 400 invalid body, 413 content too large, 500 on ingest failure, 200 success.

**Architecture:** Thin route handler — auth → role gate → Zod validate → size check → call `ingestDocument` → return. No service-role-key bypass; the cookie-aware Supabase client enforces RLS (Epic 2 #12: `knowledge_chunks` admin-only INSERT) end-to-end. Logging on failure goes to `console.error` with the route prefix, matching the `/api/chat` pattern.

**Tech Stack:** Next.js App Router (`route.ts`), TypeScript strict, Zod for body validation, `@supabase/ssr` cookie-aware client, Vitest with mocked `createClient` + mocked `ingestDocument` for route tests, Biome.

**Issue:** [#47](https://github.com/Zoeyyhc/cervix-assistant/issues/47)
**Source ticket doc:** [`docs/epics/epic4-rag-knowledge-base-tickets.md`](../../epics/epic4-rag-knowledge-base-tickets.md) §EPIC4-06
**Depends on:** #44 (`ingestDocument`) — must be merged before this branch is cut.
**Unblocks:** #48 (initial KB seed) can call the endpoint instead of importing `ingestDocument` directly, but #48 will probably go direct anyway. The real value of this endpoint is the runtime admin UI in Epic 7 (admin dashboard).

---

## Pre-existing scaffolding

- ✅ `ingestDocument(supabase, { content, source, metadata? })` from `lib/rag/store.ts` (#44 — once merged)
- ✅ `createClient` cookie-aware Supabase server client from `lib/supabase/server.ts`
- ✅ `profiles.role` column (`string | null`) from Epic 2 — admin check is `role === "admin"`
- ✅ RLS on `knowledge_chunks`: admins INSERT/UPDATE/DELETE per Epic 2 #12
- ✅ Existing route pattern in `app/api/chat/route.ts` — auth + Zod-validated body + `Response.json(...)` with explicit status codes
- ✅ Existing route-test pattern in `tests/api/chat.test.ts` — `vi.mock("@/lib/supabase/server")` + hand-rolled chain mocks + `vi.mock` of dependencies
- ✅ Validation-file pattern in `lib/validations/chat.ts` — server-side validator uses `import { z } from "zod"` (not `zod/v3`, which is only for React Hook Form resolvers)

## Gaps vs #47 acceptance criteria

| AC | Status | Action |
|---|---|---|
| `app/api/embeddings/ingest/route.ts` POST handler | ❌ | **Task 1** |
| 401 if no Supabase user | ❌ | Task 1 |
| 403 if user is not admin (`profiles.role !== 'admin'`) | ❌ | Task 1 |
| Zod-validated body: `{ source: string, content: string, metadata?: object }` | ❌ | Task 1 |
| Calls `ingestDocument` and returns `{ chunkIds: string[] }` | ❌ | Task 1 |
| 413 if content exceeds 500KB | ❌ | Task 1 |
| 500 on ingest failure with server-side logging | ❌ | Task 1 |
| Vitest route tests for 401/403/200/400 | ❌ | Task 1 (8 tests total — adds 413, 500, empty-content, invalid-JSON) |

## Decisions documented in this plan

- **Content size cap = 500KB raw text** (`512_000` bytes via `Buffer.byteLength(content, "utf8")`). Checked **after** Zod parse but **before** `ingestDocument` so we can return 413 specifically (rather than letting Zod error out as 400). 500KB chunks to ~250 chunks → ~50 OpenAI round-trips at concurrency 5. Beyond that the request becomes operationally noisy and a candidate for a queued-job design instead.
- **`Buffer.byteLength` not `content.length`** — UTF-8 multi-byte characters (CJK, emoji) take more bytes than chars. The cap is on bytes-on-the-wire, not codepoints, because the cost is OpenAI request size and DB storage.
- **Empty content → 400, not 200.** `ingestDocument` already returns `{ chunkIds: [] }` for empty input, but accepting an empty POST silently is a footgun for callers. Zod enforces `content.min(1)`. Same logic applies to `source`.
- **Admin check: cookie-aware client + `profiles` SELECT.** Use the same `createClient()` for the admin gate AND the `ingestDocument` call. RLS allows users to read their own profile (Epic 2), so this works without service role. The insert is gated by RLS too — admins INSERT/UPDATE/DELETE on `knowledge_chunks`. Per `CLAUDE.md`: "DO NOT bypass RLS with the service role key in routes accessible to non-admin users."
- **Inline admin gate, not a `requireAdmin()` helper.** This is the first admin route; YAGNI. Extract when the second admin route appears (probably the embeddings list/delete endpoints in a later ticket).
- **`metadata` Zod shape: `z.record(z.string(), z.unknown()).optional()`.** Accepts any object. We don't recurse-validate JSON shape because `ingestDocument` casts to the generated `Json` type at the insert site and PostgREST will reject non-serializable values at runtime.
- **Status code map:**
  - `400` — malformed JSON, schema violation (missing field, wrong type, empty string)
  - `401` — no authenticated user
  - `403` — authenticated but `profiles.role !== "admin"` (also covers profile-row-missing)
  - `413` — `content` exceeds 500KB
  - `500` — `ingestDocument` throws (embed or insert failure)
- **Logging on 500:** `console.error("[/api/embeddings/ingest] ingest failed:", err)` — matches `[/api/chat]` prefix convention. Surfaces in Vercel function logs.
- **Response shape on success:** `{ chunkIds: string[] }` — exactly what `ingestDocument` returns. No envelope wrapper.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/validations/embeddings.ts` | **Create** | Exports `ingestRequestSchema` (Zod) + inferred `IngestRequest` type. Server-side `import { z } from "zod"`. |
| `app/api/embeddings/ingest/route.ts` | **Create** | POST handler. Auth → role gate → Zod parse → 413 size check → `ingestDocument` → `Response.json` |
| `tests/api/embeddings-ingest.test.ts` | **Create** | Vitest route tests with mocked `createClient` + mocked `ingestDocument`: 401, 403 (non-admin role), 403 (no profile row), 400 (invalid JSON), 400 (schema violation — empty content), 400 (missing source), 413 (oversize), 200 (admin happy path with chunkIds), 500 (ingestDocument throws) |

**Files not touched:**
- `lib/rag/store.ts` — consumed as-is from #44.
- `lib/supabase/server.ts` — `createClient` reused.
- `docs/api-routes.md` — already lists `/api/embeddings/ingest` in the routes table; no edit needed.

---

## Pre-flight

- [ ] **Step A: Confirm #44 has merged to `main`**

```bash
git fetch origin main && git log origin/main --oneline | grep -E "ingestDocument|chunks insert|#44" | head -3
```
Expected: at least one matching commit (the squashed PR).

- [ ] **Step B: Create the branch off fresh main**

```bash
git checkout main && git pull --ff-only origin main && git checkout -b feat/admin-ingest-endpoint-47
```
Expected: on `feat/admin-ingest-endpoint-47`, `lib/rag/store.ts` exists.

- [ ] **Step C: Commit the plan file (already in working tree from the planning session)**

```bash
git add docs/superpowers/plans/2026-05-02-epic4-admin-ingest-endpoint.md
git commit -m "docs(plan): add Epic 4 #47 admin ingest endpoint plan"
```

- [ ] **Step D: Baseline tests + Biome + tsc green**

```bash
eval "$(supabase status -o env 2>/dev/null)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 222/222 green (post-#44 merge), Biome clean, tsc clean.

---

## Task 1: Validation schema

**Files:** `lib/validations/embeddings.ts`.

- [ ] **Step 1: Write the schema**

Create `lib/validations/embeddings.ts`:

```typescript
// Server-side Zod schema for `POST /api/embeddings/ingest`. Uses regular
// `zod` import — not `zod/v3` — because this is server route validation,
// not a React Hook Form resolver. Same pattern as `lib/validations/chat.ts`.
import { z } from "zod";

export const ingestRequestSchema = z.object({
  source: z
    .string()
    .min(1, "source must not be empty")
    .max(500, "source must be 500 characters or fewer"),
  content: z.string().min(1, "content must not be empty"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add lib/validations/embeddings.ts
git commit -m "feat(validations): add ingestRequestSchema for /api/embeddings/ingest"
```

---

## Task 2: TDD the route handler

**Files:** `app/api/embeddings/ingest/route.ts`, `tests/api/embeddings-ingest.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/embeddings-ingest.test.ts`:

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/rag/store", () => ({
  ingestDocument: vi.fn(),
}));

import { POST } from "@/app/api/embeddings/ingest/route";
import { ingestDocument } from "@/lib/rag/store";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = { role: string | null };

function mockSupabase(opts: {
  user: { id: string } | null;
  profile?: ProfileRow | null;
  profileError?: { message: string } | null;
}) {
  const profileSingle = vi.fn().mockResolvedValue(
    opts.profileError
      ? { data: null, error: opts.profileError }
      : { data: opts.profile ?? null, error: null },
  );
  const profileEq = vi.fn().mockReturnValue({ single: profileSingle });
  const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });

  const from = vi.fn((table: string) => {
    if (table === "profiles") return { select: profileSelect };
    throw new Error(`unmocked table: ${table}`);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user }, error: null }),
    },
    from,
  };
}

function makeRequest(body: unknown | string): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
  return new Request("http://localhost/api/embeddings/ingest", init);
}

describe("POST /api/embeddings/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(
      mockSupabase({ user: { id: "u1" }, profile: { role: "admin" } }) as never,
    );
    vi.mocked(ingestDocument).mockResolvedValue({ chunkIds: ["c1", "c2"] });
  });

  test("401 when no authenticated user", async () => {
    vi.mocked(createClient).mockReturnValueOnce(mockSupabase({ user: null }) as never);

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("403 when authenticated user is not admin", async () => {
    vi.mocked(createClient).mockReturnValueOnce(
      mockSupabase({ user: { id: "u1" }, profile: { role: "user" } }) as never,
    );

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("403 when the profile row is missing", async () => {
    vi.mocked(createClient).mockReturnValueOnce(
      mockSupabase({ user: { id: "u1" }, profile: null }) as never,
    );

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(403);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("400 when the body is not valid JSON", async () => {
    const res = await POST(makeRequest("not-json{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("400 when the schema is violated (empty content)", async () => {
    const res = await POST(makeRequest({ source: "S", content: "" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("400 when source is missing", async () => {
    const res = await POST(makeRequest({ content: "hello" }));

    expect(res.status).toBe(400);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("413 when content exceeds 500KB", async () => {
    const oversize = "a".repeat(512_001);
    const res = await POST(makeRequest({ source: "S", content: oversize }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "content_too_large" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("200 happy path — admin gets { chunkIds } and ingestDocument is called with the parsed body", async () => {
    vi.mocked(ingestDocument).mockResolvedValueOnce({ chunkIds: ["c1", "c2", "c3"] });

    const res = await POST(
      makeRequest({
        source: "Cancer Council Australia",
        content: "HPV is a common virus.",
        metadata: { license: "CC-BY-4.0" },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ chunkIds: ["c1", "c2", "c3"] });
    expect(ingestDocument).toHaveBeenCalledTimes(1);
    expect(ingestDocument).toHaveBeenCalledWith(expect.anything(), {
      source: "Cancer Council Australia",
      content: "HPV is a common virus.",
      metadata: { license: "CC-BY-4.0" },
    });
  });

  test("500 when ingestDocument throws — error is logged", async () => {
    vi.mocked(ingestDocument).mockRejectedValueOnce(new Error("openai down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "ingest_failed" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[/api/embeddings/ingest] ingest failed:",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test tests/api/embeddings-ingest.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `@/app/api/embeddings/ingest/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/embeddings/ingest/route.ts`:

```typescript
import { ingestDocument } from "@/lib/rag/store";
import { createClient } from "@/lib/supabase/server";
import { ingestRequestSchema } from "@/lib/validations/embeddings";

const MAX_CONTENT_BYTES = 512_000; // 500KB

export async function POST(request: Request) {
  const supabase = createClient();

  // 1. Auth — bail before parsing the body
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Admin role gate (server-side, every request, per CLAUDE.md)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // 3. Parse + validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ingestRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // 4. Size check — bytes-on-the-wire, not codepoints
  if (Buffer.byteLength(parsed.data.content, "utf8") > MAX_CONTENT_BYTES) {
    return Response.json({ error: "content_too_large" }, { status: 413 });
  }

  // 5. Ingest
  try {
    const result = await ingestDocument(supabase, parsed.data);
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/embeddings/ingest] ingest failed:", err);
    return Response.json({ error: "ingest_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test tests/api/embeddings-ingest.test.ts 2>&1 | tail -10
```
Expected: 9/9 passing.

- [ ] **Step 5: Biome + tsc**

```bash
pnpm biome check --write app/api/embeddings/ingest/route.ts tests/api/embeddings-ingest.test.ts lib/validations/embeddings.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/embeddings/ingest/route.ts tests/api/embeddings-ingest.test.ts
git commit -m "feat(api): add POST /api/embeddings/ingest admin ingestion endpoint"
```

---

## Task 3: Final verification + push + PR

- [ ] **Step 1: Full test sweep with Supabase env**

```bash
eval "$(supabase status -o env 2>/dev/null)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: baseline (222) + **9** new = 231 total.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3 && pnpm build 2>&1 | tail -3
```

- [ ] **Step 3: Push**

```bash
git push -u origin feat/admin-ingest-endpoint-47
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/admin-ingest-endpoint-47 \
  --title "feat(api): #47 — admin POST /api/embeddings/ingest" \
  --body "$(cat <<'EOF'
## Summary
- Add `POST /api/embeddings/ingest` — admin-only HTTP endpoint that accepts a document `{ source, content, metadata? }`, calls `ingestDocument` (#44), and returns the inserted `{ chunkIds: string[] }`
- Add `lib/validations/embeddings.ts` with `ingestRequestSchema` (server-side Zod, mirrors `lib/validations/chat.ts`)
- No service-role bypass — uses the cookie-aware Supabase client; RLS (Epic 2 #12) enforces admin-only INSERT on `knowledge_chunks`

## Status code map
- `200` — success, returns `{ chunkIds: string[] }`
- `400` — malformed JSON / schema violation / empty content / missing source
- `401` — no authenticated user
- `403` — authenticated but `profiles.role !== "admin"` (also covers missing profile row)
- `413` — `content` exceeds 500KB (`Buffer.byteLength` on UTF-8 — bytes-on-the-wire, not codepoints)
- `500` — `ingestDocument` throws (embed or insert failure); logged with `[/api/embeddings/ingest] ingest failed:` prefix

## Tests added (9)
- 401 unauth, 403 non-admin, 403 missing-profile, 400 invalid JSON, 400 schema violation, 400 missing source, 413 oversize, 200 happy path (admin gets chunkIds, `ingestDocument` called with parsed body), 500 ingestDocument throws (error logged)

## Test plan
- [x] \`pnpm test\` — full suite green
- [x] \`pnpm biome check .\` — clean
- [x] \`pnpm exec tsc --noEmit\` — clean
- [x] \`pnpm build\` — clean

Closes #47. **Unblocks #48** (the seed script can now use the HTTP endpoint instead of importing `ingestDocument` directly — though it'll probably stay direct since it runs locally with admin auth bypassed).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #47 maps to a test case — handler exists, 401/403/400/413/200/500 status codes, Zod-validated body, `ingestDocument` invocation, server-side logging on 500.
- **Placeholder scan:** no TBD/TODO. The "extract `requireAdmin` helper" idea is explicitly deferred (YAGNI — first admin route).
- **Type consistency:** `ingestRequestSchema` accepts `{ source, content, metadata? }` matching `IngestDocumentInput` exactly, so `parsed.data` is structurally compatible with the helper's input. No transformation step needed between Zod and `ingestDocument`.
- **RLS-correctness:** the cookie-aware client is used for both the admin gate (reading own profile) and the insert (RLS allows admin INSERT). No service role anywhere. If RLS denies the insert (e.g., user's role flipped between gate and insert), `ingestDocument` throws and we return 500 with `error.message` logged — acceptable; this is a race-condition edge case worth catching but not specially handling.
- **Status-code rationale documented:** 413 is special-cased over 400 because client tools key off it for retry/chunking heuristics (e.g., split the doc and call again). Empty content is 400 (request bug) not 200 with empty `chunkIds` (silent footgun).
- **Test isolation:** each test resets mocks via `vi.clearAllMocks()` and overrides `createClient` per-case. The console-error spy in the 500 test restores cleanly so it doesn't leak into other tests.
