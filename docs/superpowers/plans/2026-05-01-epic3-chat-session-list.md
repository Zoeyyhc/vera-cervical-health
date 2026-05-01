# Epic 3 — #24 Chat Session List + Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar to `/chat` listing the user's sessions ordered by `updated_at desc`. Clicking a session loads its messages into the main chat pane. "New chat" button starts a fresh conversation (no pre-created empty row). Server-side data fetch; RLS enforces ownership; the sidebar re-renders after each successful message via `router.refresh()`.

**Architecture:** Refactor `app/(app)/chat/` into a Next.js layout + child routes. The layout owns the sidebar + chat-pane shell; the page is per-session. Two routes: `app/(app)/chat/page.tsx` is the "new chat" landing (no `sessionId`, empty initial state), and `app/(app)/chat/[sessionId]/page.tsx` loads that session's messages server-side and passes them as `initialMessages` to the `ChatClient`. After the first send on `/chat`, the client uses `window.history.replaceState` to swap the URL to `/chat/<id>` without unmounting (which would lose the in-flight stream). After `done` the client calls `router.refresh()` so the sidebar picks up the new/updated session. `chat_sessions.updated_at` is bumped via a new DB trigger on `chat_messages` insert — keeps the schema honest about activity time.

**Tech Stack:** Next.js 14 App Router (Server + Client Components, layouts, dynamic routes, `useRouter`, `router.refresh`, `window.history.replaceState`), Supabase server client (`@supabase/ssr`), pgsql trigger, Vitest, Biome.

**Issue:** [#24](https://github.com/Zoeyyhc/cervix-assistant/issues/24)
**Source ticket doc:** [`docs/epics/epic3-ai-health-assistant-tickets.md`](../../epics/epic3-ai-health-assistant-tickets.md) §EPIC3-08
**Depends on:** #20 (chat tables + persistence — on `main`), #23 (chat UI — on `main`).

---

## Pre-existing scaffolding

- ✅ `chat_sessions` and `chat_messages` schema (#17) with the composite index for ordered reads
- ✅ `chat_sessions_updated_at` trigger fires on UPDATE — sets `new.updated_at = now()`. **But nothing currently triggers an UPDATE on message insert**, so `updated_at` is effectively frozen at row creation time
- ✅ `app/(app)/chat/page.tsx` + `chat-client.tsx` from #23 — plain single-conversation surface
- ✅ `lib/supabase/server.ts` `createClient()` for cookie-aware SSR auth + RLS-scoped queries
- ✅ Generated types include `chat_sessions` / `chat_messages` (`types/supabase.ts`)

## Gaps vs #24 acceptance criteria

| AC | Status | Action |
|---|---|---|
| Sidebar + chat-pane layout | ❌ | **Tasks 5, 6** |
| Server-side session fetch (RLS-scoped) | ❌ | **Task 4** (`loadSessionsForUser`) |
| Title fallback = first user message truncated to 60 chars | ❌ | **Task 3** (`deriveSessionTitle` pure helper) + Task 4 |
| Click session → loads messages into pane | ❌ | **Task 7** (`/chat/[sessionId]/page.tsx`) |
| "New chat" button — no pre-created empty row | ❌ | Task 5 (link to `/chat`) |
| `chat_sessions.updated_at` bumping documented | ❌ | **Task 2** (DB trigger) + Task 9 (docs) |
| Vitest unit test for title-derivation helper | ❌ | Task 3 |

## Decisions documented in this plan

- **`updated_at` bumping**: a new `AFTER INSERT` trigger on `chat_messages` issues `UPDATE chat_sessions SET updated_at = now() WHERE id = NEW.session_id`. The existing `BEFORE UPDATE` trigger on `chat_sessions` re-applies `now()` — harmless overlap. **No SECURITY DEFINER**: RLS already permits owners to UPDATE their own sessions; SECURITY DEFINER would over-grant.
- **Routing**: file-based — `/chat` = new chat, `/chat/[sessionId]` = existing session. URL persists across refresh once a session has been "selected".
- **First-send URL swap**: `window.history.replaceState` instead of `router.replace`. The latter would cross a route boundary and unmount the chat-client mid-stream. `replaceState` updates the address bar without unmounting.
- **Sidebar refresh**: after `done`, call `router.refresh()`. Re-runs the layout's session query but keeps the chat-client's local state.
- **Title derivation** is a pure helper, not a DB function. The server query joins each session with its first user message; the helper picks `title || truncatedFirstMessage || "(new conversation)"`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/<new>_chat_sessions_bump_updated_at.sql` | **Create** | Trigger on `chat_messages` INSERT → bump parent session's `updated_at` |
| `lib/chat/sessions.ts` | **Create** | Pure `deriveSessionTitle({title, firstUserMessage})` + async `loadSessionsForUser(supabase): Promise<SessionListItem[]>` (joins with first user message) |
| `lib/chat/sessions.test.ts` | **Create** | Vitest unit tests: `deriveSessionTitle` covers explicit title, message fallback with truncation, no-message fallback. `loadSessionsForUser` query shape covered with mocked Supabase |
| `app/(app)/chat/layout.tsx` | **Create** | Server Component. Header with sign-out + sidebar + main pane shell. Renders `<ChatSidebar />` + `{children}` |
| `app/(app)/chat/chat-sidebar.tsx` | **Create** | Server Component. Reads sessions via `loadSessionsForUser`, renders `<a href="/chat">New chat</a>` + clickable session rows linking to `/chat/[id]` |
| `app/(app)/chat/page.tsx` | **Modify** | Becomes the "new chat" page — just renders `<ChatClient initialSessionId={null} initialMessages={[]} />`. Header content moves into `layout.tsx` |
| `app/(app)/chat/[sessionId]/page.tsx` | **Create** | Server Component. Loads session messages server-side, renders `<ChatClient initialSessionId={sessionId} initialMessages={...} />`. 404 (or redirect to `/chat`) if RLS denies access |
| `app/(app)/chat/chat-client.tsx` | **Modify** | Accept `initialSessionId` + `initialMessages` props. On first `start` event when `initialSessionId === null`, call `window.history.replaceState` to swap URL. On `done` event, `router.refresh()`. Otherwise unchanged |
| `docs/database.md` | **Modify** | Document the new trigger under the `chat_messages` section |

**Files not touched:**
- `lib/ai/*` — chat-domain server logic only.
- `app/(app)/chat/sign-out-button.tsx` — reused as-is.
- `middleware.ts` — `/chat/*` already gated; `[sessionId]` paths inherit because `PROTECTED_PATHS` matches `startsWith("/chat/")`.

---

## Pre-flight

- [ ] **Step A: Confirm we're on the right branch**

```bash
git branch --show-current
```
Expected: `feat/chat-session-list-24`.

- [ ] **Step B: Confirm #23's surface is on `main`**

```bash
ls "app/(app)/chat/page.tsx" "app/(app)/chat/chat-client.tsx" lib/ai/streaming.ts
```
Expected: all three present.

- [ ] **Step C: Baseline tests + Biome + tsc green**

```bash
pnpm test 2>&1 | tail -5 && pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -3
```
Expected: 134/134 with real Supabase env, or 122/134 (12 skipped) without. Biome and tsc clean.

- [ ] **Step D: Confirm Supabase is up**

```bash
supabase status | head -5
```
Expected: running.

---

## Task 1: Decide and document the routing + state-handoff design

**Files:** none — design notes that flow into Tasks 5–8.

These decisions are explicit so the executor doesn't have to make them mid-implementation:

1. **Two routes share one layout.** `app/(app)/chat/layout.tsx` owns the sidebar + main-pane shell + sign-out header. `page.tsx` and `[sessionId]/page.tsx` are page bodies rendered inside the layout's `{children}` slot.
2. **`router.refresh()` re-runs the layout's session query.** That's how the sidebar updates after a new session appears.
3. **`window.history.replaceState` for first-send URL swap.** `router.replace('/chat/<id>')` would cross a route boundary, unmount the chat-client, and lose the streaming state. `replaceState` updates the address bar without React tree changes. On a subsequent refresh the user lands on `/chat/[id]` and `initialMessages` come from the DB.
4. **Refresh-during-stream caveat:** if the user refreshes mid-stream after first send, they lose the in-progress message. Documented; acceptable for v1. The persisted user message is still in the DB, so the session is recoverable from the sidebar.
5. **404 vs redirect for unowned sessions:** RLS returns zero rows for a session the user doesn't own. The `[sessionId]` page treats this as a 404 (Next.js `notFound()`) — keeps the URL honest about state, doesn't silently swallow.

- [ ] **Step 1: Acknowledge the decisions** — no code yet.

---

## Task 2: Trigger to bump `chat_sessions.updated_at` on message insert

**Files:** `supabase/migrations/<new>_chat_sessions_bump_updated_at.sql`.

- [ ] **Step 1: Generate the migration filename**

```bash
supabase migration new chat_sessions_bump_updated_at
```
Expected: prints the path. Note the timestamp prefix.

- [ ] **Step 2: Write the migration**

Replace the empty file contents with:

```sql
-- Epic 3 · #24 · Bump chat_sessions.updated_at when a message is added to it.
--
-- The chat sidebar orders sessions by updated_at desc. Without this trigger
-- updated_at is frozen at session-creation time, so an active conversation
-- doesn't bubble to the top of the list.
--
-- No SECURITY DEFINER: RLS already permits the session owner to UPDATE their
-- own row, so the trigger UPDATE inherits that scope safely. SECURITY DEFINER
-- would over-grant — any caller with INSERT permission on chat_messages
-- could bump arbitrary chat_sessions.

create or replace function public.bump_chat_session_updated_at()
returns trigger as $$
begin
  update public.chat_sessions
  set updated_at = now()
  where id = new.session_id;
  return new;
end;
$$ language plpgsql
   set search_path = '';

create trigger chat_messages_bump_session_updated_at
  after insert on public.chat_messages
  for each row execute function public.bump_chat_session_updated_at();
```

- [ ] **Step 3: Apply the migration**

```bash
supabase db reset 2>&1 | tail -10
```
Expected: clean reset including the new migration.

- [ ] **Step 4: Smoke-check the trigger**

```bash
eval "$(supabase status -o env)"
psql "$DB_URL" -c "\d public.chat_messages" 2>&1 | grep -A2 "Triggers"
```
Expected: lists `chat_messages_bump_session_updated_at AFTER INSERT`.

- [ ] **Step 5: Run the existing RLS suite to confirm no regression**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test tests/db/rls-policies.test.ts 2>&1 | tail -5
```
Expected: 25/25 still passing — the new trigger doesn't violate any policy.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*chat_sessions_bump_updated_at.sql
git commit -m "feat(db): bump chat_sessions.updated_at on chat_messages insert via trigger"
```

---

## Task 3: `deriveSessionTitle` pure helper (TDD)

**Files:** `lib/chat/sessions.ts`, `lib/chat/sessions.test.ts`.

Pure function for the title-fallback logic. No Supabase yet — that's Task 4.

- [ ] **Step 1: Make the directory**

```bash
mkdir -p lib/chat
```

- [ ] **Step 2: Write the failing test**

Create `lib/chat/sessions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { deriveSessionTitle } from "./sessions";

describe("deriveSessionTitle", () => {
  it("uses the explicit title when present", () => {
    const out = deriveSessionTitle({ title: "About HPV", firstUserMessage: "ignored" });
    expect(out).toBe("About HPV");
  });

  it("uses the explicit title even when it's a non-empty whitespace-trimmed string", () => {
    const out = deriveSessionTitle({ title: "  My session  ", firstUserMessage: "ignored" });
    expect(out).toBe("My session");
  });

  it("falls back to the first user message when title is null", () => {
    const out = deriveSessionTitle({
      title: null,
      firstUserMessage: "What is the cervix?",
    });
    expect(out).toBe("What is the cervix?");
  });

  it("truncates a long fallback to 60 characters with an ellipsis", () => {
    const longMessage = "a".repeat(80);
    const out = deriveSessionTitle({ title: null, firstUserMessage: longMessage });
    expect(out.length).toBe(61); // 60 chars + "…"
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, 60)).toBe("a".repeat(60));
  });

  it("does NOT truncate a fallback exactly at 60 characters", () => {
    const exactly60 = "b".repeat(60);
    const out = deriveSessionTitle({ title: null, firstUserMessage: exactly60 });
    expect(out).toBe(exactly60);
  });

  it("trims whitespace and newlines from the fallback before truncating", () => {
    const out = deriveSessionTitle({
      title: null,
      firstUserMessage: "\n  hello there\n  ",
    });
    expect(out).toBe("hello there");
  });

  it("falls back to a placeholder when both title and firstUserMessage are absent", () => {
    expect(deriveSessionTitle({ title: null, firstUserMessage: null })).toBe(
      "(new conversation)",
    );
    expect(deriveSessionTitle({ title: null, firstUserMessage: "" })).toBe(
      "(new conversation)",
    );
    expect(deriveSessionTitle({ title: "", firstUserMessage: "" })).toBe(
      "(new conversation)",
    );
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
pnpm test lib/chat/sessions.test.ts 2>&1 | tail -10
```
Expected: module-resolution failure for `./sessions`.

- [ ] **Step 4: Write the implementation**

Create `lib/chat/sessions.ts`:

```typescript
const TITLE_MAX_LENGTH = 60;
const PLACEHOLDER_TITLE = "(new conversation)";

/**
 * Returns the display title for a session row in the sidebar.
 *
 * Priority:
 * 1. Explicit `title` if non-empty after trim
 * 2. First user message truncated to 60 chars (+ "…" if longer)
 * 3. Placeholder for empty sessions
 *
 * Pure — no I/O. Used by the server-side sidebar query.
 */
export function deriveSessionTitle(args: {
  title: string | null;
  firstUserMessage: string | null;
}): string {
  const trimmedTitle = args.title?.trim();
  if (trimmedTitle) return trimmedTitle;

  const trimmedMessage = args.firstUserMessage?.trim();
  if (!trimmedMessage) return PLACEHOLDER_TITLE;

  if (trimmedMessage.length <= TITLE_MAX_LENGTH) return trimmedMessage;
  return `${trimmedMessage.slice(0, TITLE_MAX_LENGTH)}…`;
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
pnpm test lib/chat/sessions.test.ts 2>&1 | tail -5
```
Expected: 7/7 passing.

- [ ] **Step 6: Biome**

```bash
pnpm biome check --write lib/chat/sessions.ts lib/chat/sessions.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add lib/chat/sessions.ts lib/chat/sessions.test.ts
git commit -m "feat(chat): add deriveSessionTitle pure helper for sidebar fallback"
```

---

## Task 4: `loadSessionsForUser` query helper (TDD)

**Files:** `lib/chat/sessions.ts`, `lib/chat/sessions.test.ts`.

Server-side helper that fetches the user's sessions, joining each with its first user message for the title fallback. Returns a typed `SessionListItem[]` array sorted by `updated_at desc`.

The PostgREST way to express "first user message per session" is via Supabase's nested-select syntax: `select("id, title, updated_at, chat_messages(content, role, created_at)")`. We can sort the nested results in code (or use the `order` modifier on the nested select).

- [ ] **Step 1: Append failing tests to `lib/chat/sessions.test.ts`**

Add at the end of the file (outside the existing `describe`):

```typescript
import { vi } from "vitest";
import { type SessionListItem, loadSessionsForUser } from "./sessions";

function mockSupabaseSessionsQuery(
  rows: Array<{
    id: string;
    title: string | null;
    updated_at: string;
    chat_messages: Array<{ content: string; role: string; created_at: string }>;
  }> | null,
  error: Error | null = null,
) {
  const order = vi.fn().mockResolvedValue({ data: rows, error });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  const supabase = { from } as unknown as Parameters<typeof loadSessionsForUser>[0];
  return { supabase, from, select, order };
}

describe("loadSessionsForUser", () => {
  it("queries chat_sessions with nested chat_messages, ordered by updated_at desc", async () => {
    const { supabase, from, select, order } = mockSupabaseSessionsQuery([]);

    await loadSessionsForUser(supabase);

    expect(from).toHaveBeenCalledWith("chat_sessions");
    expect(select).toHaveBeenCalledWith(
      expect.stringMatching(/id, title, updated_at,\s*chat_messages\s*\(/),
    );
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("derives the display title from the first user message when title is null", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [
          { content: "Hello", role: "user", created_at: "2026-05-01T09:00:00Z" },
          {
            content: "Hi there!",
            role: "assistant",
            created_at: "2026-05-01T09:00:01Z",
          },
        ],
      },
    ]);

    const result: SessionListItem[] = await loadSessionsForUser(supabase);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "s1",
      displayTitle: "Hello",
      updatedAt: "2026-05-01T10:00:00Z",
    });
  });

  it("uses the explicit title when present", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: "My pinned chat",
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [
          { content: "ignored", role: "user", created_at: "2026-05-01T09:00:00Z" },
        ],
      },
    ]);
    const result = await loadSessionsForUser(supabase);
    expect(result[0].displayTitle).toBe("My pinned chat");
  });

  it("uses the placeholder when there are no messages and no title", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [],
      },
    ]);
    const result = await loadSessionsForUser(supabase);
    expect(result[0].displayTitle).toBe("(new conversation)");
  });

  it("ignores assistant messages when picking the first message", async () => {
    // Defensive — shouldn't happen in practice (RLS guarantees user msg before assistant
    // since the route inserts user before Claude responds), but be safe.
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [
          {
            content: "should be skipped",
            role: "assistant",
            created_at: "2026-05-01T09:00:00Z",
          },
          {
            content: "the real first user msg",
            role: "user",
            created_at: "2026-05-01T09:00:01Z",
          },
        ],
      },
    ]);
    const result = await loadSessionsForUser(supabase);
    expect(result[0].displayTitle).toBe("the real first user msg");
  });

  it("returns an empty array when the user has no sessions", async () => {
    const { supabase } = mockSupabaseSessionsQuery([]);
    const result = await loadSessionsForUser(supabase);
    expect(result).toEqual([]);
  });

  it("throws if the underlying query errors", async () => {
    const { supabase } = mockSupabaseSessionsQuery(null, new Error("db down"));
    await expect(loadSessionsForUser(supabase)).rejects.toThrow("db down");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test lib/chat/sessions.test.ts 2>&1 | tail -10
```
Expected: import-resolution failure for `loadSessionsForUser` and `SessionListItem`.

- [ ] **Step 3: Append the implementation to `lib/chat/sessions.ts`**

```typescript
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionListItem = {
  id: string;
  displayTitle: string;
  updatedAt: string;
};

/**
 * Loads the current user's chat sessions for the sidebar, joined with each
 * session's chat_messages (so we can derive the title fallback). RLS scopes
 * the query to the caller — passing a Supabase client signed in as user A
 * cannot return user B's sessions.
 *
 * Returns a sidebar-ready shape: id, derived display title, ISO timestamp.
 */
export async function loadSessionsForUser(
  supabase: SupabaseClient<Database>,
): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at, chat_messages ( content, role, created_at )")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => {
    // Find the earliest user message in the nested join.
    const userMessages = (row.chat_messages ?? [])
      .filter((m) => m.role === "user")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstUserMessage = userMessages[0]?.content ?? null;

    return {
      id: row.id,
      displayTitle: deriveSessionTitle({
        title: row.title,
        firstUserMessage,
      }),
      updatedAt: row.updated_at,
    };
  });
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test lib/chat/sessions.test.ts 2>&1 | tail -5
```
Expected: 14/14 passing (7 derive + 7 loader).

- [ ] **Step 5: Biome**

```bash
pnpm biome check --write lib/chat/sessions.ts lib/chat/sessions.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/chat/sessions.ts lib/chat/sessions.test.ts
git commit -m "feat(chat): add loadSessionsForUser server-side query helper"
```

---

## Task 5: Layout + sidebar

**Files:** `app/(app)/chat/layout.tsx`, `app/(app)/chat/chat-sidebar.tsx`.

The layout wraps every chat route with the sidebar + main shell. The sidebar is a Server Component (uses `loadSessionsForUser`).

- [ ] **Step 1: Create `app/(app)/chat/chat-sidebar.tsx`**

```tsx
import { loadSessionsForUser } from "@/lib/chat/sessions";
import { createClient } from "@/lib/supabase/server";
import { PlusIcon } from "lucide-react";
import Link from "next/link";

export async function ChatSidebar({ activeSessionId }: { activeSessionId: string | null }) {
  const supabase = createClient();
  const sessions = await loadSessionsForUser(supabase);

  return (
    <aside className="border-border bg-cream flex w-64 shrink-0 flex-col border-r">
      <div className="border-border border-b p-3">
        <Link
          href="/chat"
          className="border-border text-charcoal hover:bg-white/40 flex items-center gap-2 rounded-lg border bg-white/20 px-3 py-2 text-sm transition-colors"
        >
          <PlusIcon className="size-4" />
          New chat
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="text-muted-gray px-2 py-3 text-xs">No conversations yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <li key={s.id}>
                  <Link
                    href={`/chat/${s.id}`}
                    className={`block truncate rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-white/60 text-charcoal"
                        : "text-charcoal hover:bg-white/30"
                    }`}
                    title={s.displayTitle}
                  >
                    {s.displayTitle}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create `app/(app)/chat/layout.tsx`**

```tsx
import { ChatSidebar } from "./chat-sidebar";
import { SignOutButton } from "./sign-out-button";

// The active session id is derived inside each page (where the route param
// is available) and surfaced here via React's recommended "lift context up"
// idiom. Simpler v1 approach: read from headers/segments via a helper.
// For now: pass nothing — the sidebar fetches sessions on every render and
// can re-derive activeSessionId from `usePathname()` if we make it a client
// component later. v1 keeps it as a Server Component with no active highlight
// until #28 / a follow-up tightens this.
//
// Wait — that's awkward. Let's read the active id via a Client Component
// hook in chat-sidebar: see ChatSidebar.tsx.

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-charcoal text-base font-medium">Chat</h1>
        <SignOutButton />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <ChatSidebarBoundary />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

// Wraps the sidebar in a small client component that can read the active
// session id from the URL via `usePathname()`.
import { ChatSidebarWithActive } from "./chat-sidebar-active";
function ChatSidebarBoundary() {
  return <ChatSidebarWithActive />;
}
```

…the comments in that file are doing more talking than code. Let me simplify. Replace the file entirely with:

```tsx
import { ChatSidebarWithActive } from "./chat-sidebar-active";
import { SignOutButton } from "./sign-out-button";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-charcoal text-base font-medium">Chat</h1>
        <SignOutButton />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <ChatSidebarWithActive />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(app)/chat/chat-sidebar-active.tsx`**

A small Client Component that reads `usePathname()` to derive the active session id, then passes it into the Server Component sidebar.

Actually — Client Components can't render Server Components as children. We have to flip it: keep the active-id reader on the client, and have the sidebar **also** be a Client Component receiving the sessions list as a prop from a Server Component above.

Cleanest split:
- `<ChatSidebarServer />` — Server Component, fetches sessions, renders `<ChatSidebarClient sessions={...} />`
- `<ChatSidebarClient sessions={...} />` — Client Component, reads `usePathname()`, applies active highlight

Update Step 1 to be `chat-sidebar-server.tsx`:

```tsx
import { loadSessionsForUser } from "@/lib/chat/sessions";
import { createClient } from "@/lib/supabase/server";
import { ChatSidebarClient } from "./chat-sidebar-client";

export async function ChatSidebar() {
  const supabase = createClient();
  const sessions = await loadSessionsForUser(supabase);
  return <ChatSidebarClient sessions={sessions} />;
}
```

…and create `chat-sidebar-client.tsx` for the actual rendering:

```tsx
"use client";

import type { SessionListItem } from "@/lib/chat/sessions";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ChatSidebarClient({ sessions }: { sessions: SessionListItem[] }) {
  const pathname = usePathname();
  // Active id: pathname like "/chat/<id>" → <id>; "/chat" → null
  const match = pathname.match(/^\/chat\/([^/]+)/);
  const activeId = match?.[1] ?? null;

  return (
    <aside className="border-border bg-cream flex w-64 shrink-0 flex-col border-r">
      <div className="border-border border-b p-3">
        <Link
          href="/chat"
          className="border-border text-charcoal hover:bg-white/40 flex items-center gap-2 rounded-lg border bg-white/20 px-3 py-2 text-sm transition-colors"
        >
          <PlusIcon className="size-4" />
          New chat
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="text-muted-gray px-2 py-3 text-xs">No conversations yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              return (
                <li key={s.id}>
                  <Link
                    href={`/chat/${s.id}`}
                    className={`block truncate rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-white/60 text-charcoal"
                        : "text-charcoal hover:bg-white/30"
                    }`}
                    title={s.displayTitle}
                  >
                    {s.displayTitle}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
```

Update layout to import the **server** sidebar:

```tsx
import { ChatSidebar } from "./chat-sidebar-server";
import { SignOutButton } from "./sign-out-button";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-charcoal text-base font-medium">Chat</h1>
        <SignOutButton />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
```

So three new files: `layout.tsx`, `chat-sidebar-server.tsx`, `chat-sidebar-client.tsx`.

- [ ] **Step 4: Biome + tsc**

```bash
pnpm biome check --write "app/(app)/chat/layout.tsx" "app/(app)/chat/chat-sidebar-server.tsx" "app/(app)/chat/chat-sidebar-client.tsx"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: clean.

(No commit yet — page changes land together in Task 6.)

---

## Task 6: Update `app/(app)/chat/page.tsx` for the "new chat" landing

**Files:** `app/(app)/chat/page.tsx`.

Strip the header (now in the layout). Render the chat-client with empty initial state.

- [ ] **Step 1: Replace `app/(app)/chat/page.tsx`**

```tsx
import { ChatClient } from "./chat-client";

export default function ChatPage() {
  return <ChatClient initialSessionId={null} initialMessages={[]} />;
}
```

- [ ] **Step 2: Biome + tsc**

```bash
pnpm biome check --write "app/(app)/chat/page.tsx"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: tsc fails because `chat-client.tsx` doesn't yet accept those props — that's Task 8.

---

## Task 7: Add `/chat/[sessionId]/page.tsx`

**Files:** `app/(app)/chat/[sessionId]/page.tsx`.

Server Component. Load that session's messages. If RLS denies (zero rows for the session), call `notFound()` so the user sees a 404 page.

- [ ] **Step 1: Make the directory**

```bash
mkdir -p "app/(app)/chat/[sessionId]"
```

- [ ] **Step 2: Create the page**

Create `app/(app)/chat/[sessionId]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ChatClient } from "../chat-client";

type Props = { params: { sessionId: string } };

export default async function ChatSessionPage({ params }: Props) {
  const { sessionId } = params;
  const supabase = createClient();

  // Validate the session exists and belongs to the caller (RLS scopes this).
  const { data: session, error: sessionErr } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !session) notFound();

  const { data: messages, error: msgErr } = await supabase
    .from("chat_messages")
    .select("id, role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (msgErr) throw new Error(msgErr.message);

  const initialMessages =
    messages?.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      status: "complete" as const,
    })) ?? [];

  return <ChatClient initialSessionId={sessionId} initialMessages={initialMessages} />;
}
```

- [ ] **Step 3: Biome + tsc**

```bash
pnpm biome check --write "app/(app)/chat/[sessionId]/page.tsx"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: tsc still fails on the chat-client prop signature — Task 8 fixes it.

---

## Task 8: Update `chat-client.tsx` to accept initial state + handle URL/refresh

**Files:** `app/(app)/chat/chat-client.tsx`.

- [ ] **Step 1: Modify the props and import the router**

At the top of the file:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { parseChatStream } from "@/lib/ai/streaming";
import { Loader2Icon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "error";
};

type Props = {
  initialSessionId: string | null;
  initialMessages: ChatMessage[];
};

export function ChatClient({ initialSessionId, initialMessages }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const scrollRef = useRef<HTMLDivElement>(null);
```

(Remove the inline `type ChatMessage` declaration — it's now exported.)

- [ ] **Step 2: Update the `start` event handler to swap the URL on first send**

Inside the `for await` loop, where the `start` event is handled:

```tsx
        if (event.type === "start") {
          // First send when no session existed — swap the URL to /chat/<id>
          // without unmounting the chat-client (router.replace would cross a
          // route boundary and lose the in-flight stream).
          if (sessionId === null) {
            window.history.replaceState({}, "", `/chat/${event.sessionId}`);
          }
          setSessionId(event.sessionId);
        }
```

- [ ] **Step 3: Update the `done` event handler to refresh the sidebar**

```tsx
        } else if (event.type === "done") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "complete" } : m)),
          );
          // Re-fetch the layout's session list so the sidebar reflects this
          // new session (or the bumped updated_at on an existing one).
          router.refresh();
        }
```

- [ ] **Step 4: Run the existing chat-route test (sanity check)**

```bash
pnpm test tests/api/chat.test.ts 2>&1 | tail -5
```
Expected: 11/11 still passing — the route is unchanged.

- [ ] **Step 5: Biome + tsc + build**

```bash
pnpm biome check --write "app/(app)/chat/chat-client.tsx" "app/(app)/chat/page.tsx" "app/(app)/chat/[sessionId]/page.tsx" "app/(app)/chat/layout.tsx" "app/(app)/chat/chat-sidebar-server.tsx" "app/(app)/chat/chat-sidebar-client.tsx"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
pnpm build 2>&1 | tail -10
```
Expected: everything clean, `next build` succeeds, `/chat` and `/chat/[sessionId]` both compile.

- [ ] **Step 6: Commit (everything Task 5–8 together — they're a coherent chunk)**

```bash
git add "app/(app)/chat/layout.tsx" "app/(app)/chat/chat-sidebar-server.tsx" "app/(app)/chat/chat-sidebar-client.tsx" "app/(app)/chat/page.tsx" "app/(app)/chat/[sessionId]/page.tsx" "app/(app)/chat/chat-client.tsx"
git commit -m "feat(chat): add session list sidebar + per-session route

- Layout-level sidebar (server-fetched session list, client-side active highlight)
- /chat/[sessionId] loads that session's messages server-side and hands them
  to ChatClient as initialMessages
- ChatClient now accepts initialSessionId/initialMessages
- First-send URL swap uses window.history.replaceState to avoid unmounting
  mid-stream (router.replace would cross a route boundary)
- After done event, router.refresh() bumps the sidebar's session list"
```

---

## Task 9: Document the trigger in `docs/database.md`

**Files:** `docs/database.md`.

- [ ] **Step 1: Find the `chat_messages` section**

Look for `### \`chat_messages\``. The "Indexes" line was added in #17.

- [ ] **Step 2: Append a "Triggers" line**

Below the existing "Indexes" line:

```md
**Triggers:** `chat_messages_bump_session_updated_at` (AFTER INSERT) → bumps `chat_sessions.updated_at` on its parent. Keeps the chat sidebar's `ORDER BY updated_at DESC` reflecting actual conversation activity. Added in `<timestamp>_chat_sessions_bump_updated_at.sql`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/database.md
git commit -m "docs(db): document chat_messages → chat_sessions updated_at trigger"
```

---

## Task 10: Manual browser verification

**Files:** none.

Per `CLAUDE.md`: dev server + browser, exercise the new session list and switching.

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Open `http://localhost:3000/chat` in a browser**

You should see:
1. Sidebar on the left with "New chat" button + (if you have prior sessions) their titles
2. Empty chat pane with the existing empty-state copy

- [ ] **Step 3: Verify session creation + URL swap**

1. From the empty `/chat` page, type "What is HPV?" and press Enter
2. Expected: tokens stream in (same as #23)
3. After `done` fires, the URL bar should swap to `/chat/<some-uuid>` (no page reload, no React re-mount)
4. The sidebar should now show this new session at the top

- [ ] **Step 4: Verify session switching**

1. Click "New chat" — URL goes back to `/chat`, chat pane is empty
2. Type a different message, send it — new session appears
3. Click the OLDER session in the sidebar — URL goes to `/chat/<id>`, the previous messages render
4. Click the active session row — should be highlighted (slightly darker bg)

- [ ] **Step 5: Verify refresh**

1. While viewing `/chat/<id>`, hit refresh
2. The page reloads, messages re-render from the DB
3. Sidebar still shows all sessions

- [ ] **Step 6: Verify `updated_at` ordering**

1. Open the older session
2. Send a follow-up message
3. After `done`, the sidebar should reorder so this session bubbles to the top

- [ ] **Step 7: Verify title fallback**

1. Open Supabase Studio (http://127.0.0.1:54323), edit a session row, set `title = 'My pinned chat'`
2. Refresh the chat page in the browser
3. Sidebar should show "My pinned chat" instead of the truncated message

If anything misbehaves, return to the relevant task — fix and re-verify.

---

## Task 11: Final verification + push + PR

- [ ] **Step 1: Full test sweep**

```bash
eval "$(supabase status -o env)" && export SUPABASE_URL="${SUPABASE_URL:-$API_URL}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
pnpm test 2>&1 | tail -5
```
Expected: 134 baseline + **14 new** (`lib/chat/sessions`) = 148.

- [ ] **Step 2: Biome + tsc + build**

```bash
pnpm biome check . 2>&1 | tail -3 && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5 && pnpm build 2>&1 | tail -8
```
Expected: all clean.

- [ ] **Step 3: Commit the plan file**

```bash
git add docs/superpowers/plans/2026-05-01-epic3-chat-session-list.md
git commit -m "docs(plan): add Epic 3 #24 chat session list + switching implementation plan"
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/chat-session-list-24
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --repo Zoeyyhc/cervix-assistant --base main --head feat/chat-session-list-24 \
  --title "feat(chat): #24 — chat session list + switching" \
  --body "$(cat <<'EOF'
## Summary
- Sidebar listing the user's chat sessions, ordered by `updated_at DESC`, RLS-scoped
- New `/chat/[sessionId]` route loads that session's messages server-side and hands them to `ChatClient` as initial state
- `New chat` button = link to `/chat` (no pre-created empty row in the sidebar — session is born on first send)
- After first send when no session existed, URL swaps to `/chat/<id>` via `window.history.replaceState` (no unmount, in-flight stream survives)
- After every `done` event, `router.refresh()` re-runs the layout's session query so the sidebar reflects the new/updated row
- Title fallback: explicit `title` (trimmed) → first user message truncated to 60 chars + `…` → `"(new conversation)"` placeholder
- DB trigger bumps `chat_sessions.updated_at` on every `chat_messages` insert so the sidebar ordering reflects real activity

## File-based routing
- `app/(app)/chat/layout.tsx` — sidebar + main shell, wraps both pages
- `app/(app)/chat/page.tsx` — "new chat" landing (empty initial state)
- `app/(app)/chat/[sessionId]/page.tsx` — loads messages server-side; `notFound()` on RLS denial
- `app/(app)/chat/chat-sidebar-server.tsx` — server fetches sessions
- `app/(app)/chat/chat-sidebar-client.tsx` — client renders, reads `usePathname()` for active highlight

## Tests added
- `deriveSessionTitle` (7): explicit title, trimmed title, message fallback, truncation at 60 chars, exact-60 untouched, whitespace stripping, placeholder when both absent
- `loadSessionsForUser` (7): query shape (`from`/`select`/`order`), title derivation from join, explicit title, placeholder for message-less session, assistant-message-skipping defensive check, empty result, throws on query error

## Out of scope
- Session rename / delete UI → future ticket
- Mobile-responsive sidebar collapse → future polish ticket
- Real-time updates (sidebar updates via push, not refresh) → not v1
- Component-level tests for the sidebar / chat-client → project policy is to skip these

## Test plan
- [x] `pnpm test` — 148/148 across 14 files (was 134 — +14 from `lib/chat/sessions`)
- [x] `pnpm biome check .` — clean
- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm build` — `/chat` and `/chat/[sessionId]` both compile
- [x] Manual browser verification — session creation, switching, URL swap, refresh persistence, `updated_at` reordering, title fallback

Closes #24.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checks performed

- **Spec coverage:** every AC in #24 maps to a Task in this plan, an existing pre-merge artifact (`/chat/*` middleware gating), or an explicit deferral (rename/delete UI, mobile, real-time).
- **Placeholder scan:** no TBD/TODO. The migration filename has a `<timestamp>` placeholder because `supabase migration new` generates it at runtime — explicitly explained in Task 2.
- **Type consistency:** `SessionListItem` exported from `lib/chat/sessions.ts` is used identically in the sidebar server component and client component. `ChatMessage` is now exported from `chat-client.tsx` and consumed by `[sessionId]/page.tsx`.
- **Route-boundary handling:** the URL swap deliberately uses `window.history.replaceState` (no React tree change) instead of `router.replace` (would unmount mid-stream). The `done`-event `router.refresh()` is fine because it re-runs server components but keeps client state intact.
- **RLS-driven 404:** the `[sessionId]` page calls `notFound()` when the session-row query returns null — RLS guarantees that's also the path for unowned sessions. We don't differentiate "not yours" from "doesn't exist", consistent with the route's 404 policy from #20.
