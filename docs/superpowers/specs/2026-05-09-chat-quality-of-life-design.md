# Chat Quality-of-Life — Star, Soft-Delete, Prompt Suggestions, News & Events Entry Points

**Date:** 2026-05-09
**Status:** Design approved, pending implementation plan

---

## Summary

Add four "dessert" features to `/chat` to make the experience feel more polished:

1. **Soft-delete** chat sessions with a 6-second Undo toast
2. **Star** chat sessions — starred items grouped at the top of the sidebar
3. **Prompt suggestions** — six static starter questions in the empty state
4. **News & Events entry points** — two visual cards in the empty state that send a fixed message routed by the existing orchestrator to the existing News/Events agents

Backend News/Events agents already exist (`lib/agents/news-agent.ts`, `lib/agents/events-agent.ts`); this spec only adds UI surfaces, not new agent code.

## Context

`chat_sessions` currently has only `id, user_id, title, created_at, updated_at` (`supabase/migrations/20260409170402_create_chat_tables.sql`). The sidebar (`app/(app)/chat/chat-sidebar-client.tsx`) is a flat list of `<Link>` items with no per-row actions. The empty state (`app/(app)/chat/chat-client.tsx`, `EmptyState`) is one line of muted text.

The orchestrator (`lib/agents/orchestrator.ts`) already classifies intents `news_request` / `events_request` and routes to the corresponding agents, so users can already say "show me the latest cervical health news" — but there is no UI affordance hinting that this works. This spec exposes those capabilities through the empty-state UI without bypassing the orchestrator.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Soft delete (`deleted_at timestamptz`) + 6 s Undo toast — no Trash UI, no automatic purge | UX win without engineering overhead of a trash management surface. Field reserved for a future trash UI. |
| 2 | Star uses `starred_at timestamptz`, not `is_starred boolean` | Single source of truth, supports sorting starred items by recency, mirrors `deleted_at` convention. |
| 3 | Sidebar splits into `STARRED` and `RECENT` sections (rather than a single list with a star icon) | Star's value is "this won't get pushed down by new chats" — grouping delivers on that promise. |
| 4 | Star toggle is direct click on the icon; delete lives in a `MoreHorizontal` dropdown menu | Star is high-frequency and reversible — direct icon click. Delete is destructive — needs the small friction of opening a menu. |
| 5 | Empty-state suggestions are static, hardcoded in `app/(app)/chat/empty-state.tsx` | No admin UI yet to manage a `prompt_suggestions` table; static list is enough for v1 and can be promoted to DB later if needed. |
| 6 | News & Events expose as **larger cards** in the empty state, separate from prompt pills | Visually communicates "explore entry points" vs "specific question" — different affordance, different intent. |
| 7 | News/Events cards send a fixed plain-text message and let the orchestrator classify intent | Avoid bypassing the agent pipeline — the orchestrator already handles `news_request` / `events_request` correctly. The cards just guarantee discovery. |
| 8 | Mutations use Server Actions, not API route handlers | No external consumer, no streaming. Server actions cut the fetch + JSON boilerplate. New pattern in this repo, but a clean fit for this scope. |
| 9 | Optimistic UI on the client; no `revalidatePath` from the action | Avoids re-rendering the whole `(app)` layout on every star click. `router.refresh()` only when needed (e.g., after Undo). |
| 10 | RLS uses existing `chat_sessions` policies (`auth.uid() = user_id`) — no new policies | Star/delete are `update`s, already covered. |
| 11 | Already-deleted session URLs return 404, even for the owner | Prevents shared bookmarks from "resurrecting" a deleted conversation by URL. |
| 12 | Multi-tab staleness is acceptable — no realtime subscription | Two-tab edit conflicts are rare for a personal chat product; cost of realtime > benefit. |

## Architecture

### Data Model

New migration `supabase/migrations/<timestamp>_chat_sessions_star_and_soft_delete.sql`:

```sql
alter table public.chat_sessions
  add column starred_at timestamptz,
  add column deleted_at timestamptz;

create index chat_sessions_user_starred_idx
  on public.chat_sessions (user_id, starred_at desc nulls last)
  where deleted_at is null;

create index chat_sessions_user_deleted_idx
  on public.chat_sessions (user_id, deleted_at)
  where deleted_at is not null;
```

Both indexes are partial — the common path (active sessions list) and the soft-deleted path (Undo lookup) each get a small, focused index.

### Server Actions

New file `lib/chat/session-actions.ts`:

```ts
"use server";

export async function starSession(id: string): Promise<void>
export async function unstarSession(id: string): Promise<void>
export async function softDeleteSession(id: string): Promise<void>
export async function undoDeleteSession(id: string): Promise<void>
```

Each action:

1. Validates `id` with `z.string().uuid()`
2. Creates an RLS-scoped Supabase client via `createClient()` from `lib/supabase/server.ts`
3. Runs the appropriate `update` against `chat_sessions`
4. Throws on `error` so the client toast catches it
5. Does **not** call `revalidatePath` — the client manages UI state and calls `router.refresh()` on its own when needed

### Sessions Loader

`lib/chat/sessions.ts` `loadSessionsForUser` returns a grouped shape:

```ts
type GroupedSessions = {
  starred: SessionListItem[];   // ordered by starred_at desc
  recent: SessionListItem[];    // ordered by updated_at desc
};
```

Single query: `select * from chat_sessions where user_id = ? and deleted_at is null order by updated_at desc`. Group in memory by checking `starred_at !== null`. This keeps the DB roundtrip count at one and lets the partial index on `(user_id, starred_at desc nulls last) where deleted_at is null` serve the read.

The session detail loader in `app/(app)/chat/[sessionId]/page.tsx` adds `.is('deleted_at', null)` so deleted sessions return `notFound()`.

### Sidebar UI

`app/(app)/chat/chat-sidebar-client.tsx` is rewritten to render two sections:

```
[+ New chat]
─────────────────
STARRED              ← only renders when grouped.starred.length > 0
★ Pap smear questions  ⋯
★ HPV vaccine for ...  ⋯
─────────────────
RECENT               ← always renders the heading
☆ When to start scre.. ⋯
☆ Cervical biopsy ...  ⋯
```

Each item:

- Star icon (`lucide` `Star`) — fill controlled by className. Click toggles via `useTransition`-wrapped server action; pending state disables the icon to prevent double-click races.
- Title `<Link href={/chat/${id}}>`
- `MoreHorizontal` icon revealed on row hover, opens a shadcn `DropdownMenu` with one item: `Delete`.

Delete flow:
1. Click `Delete` in the dropdown
2. Optimistically remove the item from local state
3. If the deleted session is the current active one, `router.push('/chat')`
4. Call `softDeleteSession(id)`
5. `sonner` toast: `"Conversation deleted." [Undo]`, `duration: 6000`
6. Undo click → call `undoDeleteSession(id)` → `router.refresh()`

Star flow:
1. Click ☆/★
2. Optimistically flip the icon and move the item between sections
3. Call `starSession(id)` or `unstarSession(id)`
4. On error: roll back optimistic state, `toast.error("Couldn't update star")`

### Empty State

New file `app/(app)/chat/empty-state.tsx`:

```tsx
type Props = {
  onPrompt: (text: string) => void;
  disabled?: boolean;
};
```

Layout (top to bottom):
1. Lead text — kept verbatim from the current `EmptyState`: *"Ask a cervical-health question to get started. Replies are not a substitute for a clinician's advice — see a doctor for symptoms or specific situations."*
2. Two **large entry-point cards** (icon + title + one-line description), `rounded-xl border border-border bg-white/40 hover:bg-white/60 p-4`:
   - 📰 News card → sends `"Show me the latest news on cervical and women's health."`
   - 📅 Events card → sends `"What women's health events are happening near me?"`
3. Section divider with caption `Or try one of these:`
4. Six **prompt pills**, `rounded-full border border-border bg-white/40 hover:bg-white/60 px-3 py-1.5 text-xs`:
   - "What is HPV?"
   - "When should I start cervical screening?"
   - "What are the symptoms of cervical cancer?"
   - "Who should get the HPV vaccine?"
   - "How often do I need a Pap smear?"
   - "What does an abnormal Pap result mean?"

All buttons call `onPrompt(text)`. To wire this up, `chat-client.tsx` is refactored so the body of the current `handleSubmit` moves into an internal `submit(text: string)` that takes the text as a parameter (rather than reading from `input` state). The form's `onSubmit` becomes a thin wrapper that clears `input` and calls `submit(trimmed)`. `EmptyState` receives `submit` via the `onPrompt` prop and calls it directly — no input-state round-trip, no race with React's batched state updates.

### Mutation Surface Map

| Action | Surface | Server | Optimistic UI |
|---|---|---|---|
| Star / unstar | Sidebar row icon | `starSession` / `unstarSession` | Icon flip + section move |
| Delete | Sidebar row dropdown | `softDeleteSession` | Row removal + `router.push('/chat')` if active |
| Undo delete | Toast button | `undoDeleteSession` | `router.refresh()` |
| Send prompt | Empty-state button | (existing `/api/chat`) | Existing chat-client flow |

## Error Handling

| Scenario | Behavior |
|---|---|
| `starSession` / `unstarSession` fails | Roll back UI, `toast.error("Couldn't update star")` |
| `softDeleteSession` fails | Roll back UI (item reappears), `toast.error("Couldn't delete conversation")`, **no** Undo toast |
| `undoDeleteSession` fails | Item stays deleted; `toast.error("Couldn't restore conversation")` suggesting a refresh |
| Active session deleted | `router.push('/chat')` **before** the action is awaited so UI is instantly correct; Undo toast still bound to the action's id |
| Undo toast not clicked within 6 s | Toast dismisses; row remains soft-deleted in DB; no future restore path in v1 |
| Direct visit to `/chat/<deleted-id>` | `[sessionId]/page.tsx` returns `notFound()` |
| Two-tab divergence | Acceptable; tabs reconcile on next `router.refresh()` (navigation, new message, or undo) |

## Testing (Vitest only — Playwright deferred per memory)

**`lib/chat/sessions.test.ts`** — `loadSessionsForUser`
- Returns `{ starred, recent }` shape
- Soft-deleted sessions appear in neither group
- `starred` ordered by `starred_at desc`, `recent` ordered by `updated_at desc`

**`lib/chat/session-actions.test.ts`** — server actions, hitting the local Supabase instance (no mocks, per memory)
- `starSession` writes `starred_at`; `unstarSession` clears it
- `softDeleteSession` writes `deleted_at`; `undoDeleteSession` clears it
- Non-UUID id throws Zod error
- Cross-user `update` returns no rows (RLS)

**`app/(app)/chat/empty-state.test.tsx`**
- Renders 6 prompt pills + 2 entry-point cards
- Clicking a pill calls `onPrompt(<exact text>)`
- News card → onPrompt with the exact news trigger string
- Events card → onPrompt with the exact events trigger string
- `disabled` prop disables all buttons

**`app/(app)/chat/chat-sidebar-client.test.tsx`**
- `STARRED` section renders only when `grouped.starred.length > 0`; `RECENT` heading always renders
- Click star icon calls `starSession` / `unstarSession` based on current state
- Delete optimistically removes the row + shows Undo toast
- Undo click calls `undoDeleteSession`
- Deleting the active session triggers `router.push('/chat')`

## Out of Scope

- Trash UI / scheduled hard-delete of soft-deleted rows
- Mobile-specific responsive treatment for entry-point cards (project is desktop-first; existing breakpoints apply)
- Realtime cross-tab sync of sidebar state
- Fixing Events agent's "no location" fallback (already-shipped behavior; orthogonal to discoverability)
- Promoting prompt suggestions to a DB-backed admin-editable list
