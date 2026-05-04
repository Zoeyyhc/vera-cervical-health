---
status: approved
date: 2026-05-04
scope: visual nav header for /chat, /clinics, /learn (and inherited by /profile, /admin)
---

# App Nav Header Design

## Goal

Give every authenticated route under `app/(app)/` a sticky top navigation header in the same visual style as the public landing nav, so users can move between Chat, Clinics, and Learn without bouncing back to the marketing site.

## In Scope

- A new `<AppNav>` component, visually identical to `components/landing/nav.tsx` but with logged-in semantics.
- Mounted once at `app/(app)/layout.tsx` so every nested route inherits it (Chat, Clinics, Learn, Profile, Admin).
- Removal of the chat layout's redundant header bar so there is exactly one nav per page.
- Sticky-position adjustment on `app/(app)/clinics/page.tsx` so the map column docks under the new nav rather than under it.
- Reuse of the existing `SignOutButton` component (relocated to a shared path so the nav can import it).

## Out of Scope

- Mobile drawer / hamburger menu. The landing nav has a non-functional hamburger button; this PR matches it minus the dead button. A real drawer is a separate follow-up that should also fix landing.
- Profile / avatar dropdown. Sign Out is a plain button for v1.
- Admin link in the nav. Role-gated and conditional rendering is deferred.
- Changes to the public landing nav.

## Architecture

### Layout nesting (Next.js App Router)

```
app/layout.tsx          (root, no nav)
  app/page.tsx          (landing, uses its own <Nav>)
  app/(app)/layout.tsx  (NEW: <AppNav> + <main>)
    app/(app)/chat/layout.tsx     (sidebar + main, header REMOVED)
    app/(app)/clinics/page.tsx    (sticky offset adjusted)
    app/(app)/learn/...           (inherits nav, no further work)
    app/(app)/profile/...         (inherits nav, no further work)
    app/(app)/admin/...           (inherits nav, no further work)
```

### Why the (app) layout, not per-route layouts

Next.js layouts compose top-down. Mounting `<AppNav>` once at the `(app)` group layout means every route in the group gets it for free, including future ones. The chat layout removes its redundant header bar; the clinics page only needs a one-line sticky offset tweak.

## Components

### `components/app/app-nav.tsx` (new)

Client component (`'use client'`) because it uses `usePathname()` for active-link highlight and `useEffect` for scroll-border state.

Visual structure mirrors `components/landing/nav.tsx`:

- `<header>` is `sticky top-0 z-50 bg-background/85 backdrop-blur-sm`, transitions to a 1px bottom border when `window.scrollY > 8`.
- Inner `<nav>` uses `container-cervix flex h-16 items-center justify-between`.
- Left: `<Link href="/chat">Cervix</Link>` (logo, 18px semibold, `tracking-tight`).
- Center (md+): `<ul>` of three `<Link>`s: Chat (`/chat`), Clinics (`/clinics`), Learn (`/learn`). Each link gets `text-base hover:underline underline-offset-4`. The active link (matched via `usePathname()` startsWith) gets `underline` permanently.
- Right (md+): `<SignOutButton />`.
- Mobile (`md:` below): only the logo is visible. The link list and Sign Out button are `hidden md:flex` / `hidden md:inline-flex`. No hamburger button is rendered (intentional - a working drawer is a separate follow-up).

### `components/auth/sign-out-button.tsx` (relocated)

The existing `app/(app)/chat/sign-out-button.tsx` moves to `components/auth/sign-out-button.tsx` verbatim. Chat updates its single import. Both AppNav and any future surface that needs sign-out can import from one shared location.

## Layout file changes

### `app/(app)/layout.tsx`

Was: `return <>{children}</>`.
Becomes:
```tsx
import { AppNav } from "@/components/app/app-nav";

export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

### `app/(app)/chat/layout.tsx`

Was: an outer wrapper with a header (Chat title + SignOutButton) plus `flex flex-1 overflow-hidden` containing sidebar + main.
Becomes: just the sidebar + main row (no outer wrapper, no header). The `flex-1` from the parent's `<main>` provides height.

```tsx
export default function ChatLayout({ children }) {
  return (
    <div className="flex h-full overflow-hidden">
      <ChatSidebar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
```

The chat header's `Chat` title is dropped - the AppNav identifies the route via the underlined Chat link.

### `app/(app)/clinics/page.tsx`

The map column currently uses `sticky top-0 h-screen`. With a 64px nav above it, change to:

- `sticky top-16` (4rem = 16 in Tailwind = 64px nav height)
- `h-[calc(100vh-4rem)]` so the map fills the remaining viewport without overflowing past the bottom

That's a one-line change in the existing JSX block (the `<div>` wrapping `<ClinicMap>`).

## Testing

### Vitest

- `components/app/app-nav.test.tsx`:
  - Renders all three links + sign out button when `usePathname()` returns `/chat`.
  - Active link highlight: when pathname is `/clinics`, only the Clinics link has the `underline` class.
  - Mobile hides the link list: assert the `<ul>` has the `hidden md:flex` classes (style-level).
- Existing `app/(app)/clinics/page.test.tsx` continues to pass - the new nav is rendered above it but the page-level assertions (idle intro card, search bar, map section, no h3 in idle) are unaffected.
- Chat layout has no existing test; nothing to update there.

### Manual / proofrun (deferred)

Run `pnpm dev`, log in, click between `/chat`, `/clinics`, `/learn`. Confirm:
- Nav stays sticky on scroll, picks up bottom border.
- Active route is underlined.
- Sign Out works.
- Clinics map column docks under the nav, doesn't overflow.
- Chat sidebar + main fill the viewport without double headers.

Playwright is deferred per CLAUDE.md (only on explicit request).

## Risks

- **Chat layout regression**: dropping the wrapper `<div bg-cream min-h-screen flex flex-col>` could affect inner sizing. Mitigation: parent `<main flex-1>` provides height; chat's inner `flex h-full overflow-hidden` should still produce the 3-pane layout. Verify with `pnpm dev`.
- **Clinics sticky math**: if the nav height changes from 64px later, the `top-16` / `h-[calc(100vh-4rem)]` becomes wrong. Mitigation: a single CSS variable (`--nav-h`) would be cleaner long-term; v1 hardcodes the value with a code comment.
- **Sign Out path import churn**: only `chat-sidebar-server.tsx` and `chat/layout.tsx` import the existing button. Both updates are mechanical search-and-replace.
