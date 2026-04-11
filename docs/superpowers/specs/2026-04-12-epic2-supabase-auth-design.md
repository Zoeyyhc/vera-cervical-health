# Epic 2 — Supabase Auth: Email/Password

**Date:** 2026-04-12
**Issue:** [Epic 2 · Supabase Auth — Email/Password #10](https://github.com)
**Supersedes:** `docs/superpowers/specs/2026-04-11-auth-pages-design.md` (see Decision Changes below)

---

## Scope

Wire up Supabase Auth email/password for the App Router: session management, middleware route protection, auth pages (login + register), sign-out, and email confirmation callback.

**Out of scope for this ticket:**
- Google OAuth
- Forgot password / reset password flow
- App shell nav (sign-out button placement in nav comes in a later epic)

---

## Decision Changes vs Prior Spec (2026-04-11)

| Decision | Old spec | This spec | Reason |
|---|---|---|---|
| Post-register UX | Redirect to `/chat` (no confirmation gate) | Show "check your email" state on register page | Supabase sends confirmation email — must click before session exists |
| Auth mutations | Client-side browser Supabase calls | Server Actions (`lib/actions/auth.ts`) | Keeps auth logic server-side; no client token exposure |
| Callback exchange | `supabase.auth.verifyOtp()` (PKCE) | `supabase.auth.exchangeCodeForSession()` | Current `@supabase/ssr` pattern for email confirmation links |
| Forgot / reset password | Included | Deferred | Not in Epic 2 ticket scope |
| React Hook Form | Required dependency | Not added | Server Actions validate via Zod server-side; RHF adds client complexity without benefit here |

---

## File Structure

```
middleware.ts                          # Route guard for /(app)/* routes

app/(auth)/
├── layout.tsx                         # Minimal centered layout (cream bg, max-w-sm column)
├── login/
│   ├── page.tsx                       # Server Component — reads ?error searchParam, renders LoginForm
│   └── login-form.tsx                 # 'use client' — useActionState(signIn), error display
└── register/
    ├── page.tsx                       # Server Component wrapper
    └── register-form.tsx              # 'use client' — useActionState(signUp), "check your email" state

app/api/auth/
└── callback/
    └── route.ts                       # exchangeCodeForSession() → redirect to /chat

lib/actions/
└── auth.ts                            # Server Actions: signIn, signUp, signOut
```

**Existing files (already satisfy AC, no changes needed):**
- `lib/supabase/browser.ts` — `createClient()` via `createBrowserClient`
- `lib/supabase/server.ts` — `createClient()` via `createServerClient` with cookie handling

---

## Architecture

### Middleware (`middleware.ts`)

Uses the `@supabase/ssr` recommended pattern: create a server client inside middleware, call `supabase.auth.getUser()` to validate the session token server-side (not `getSession()`, which only reads the cookie without verifying). Refreshes the session cookie on every request so tokens rotate automatically.

**Protected:** all routes matching `/(app)/*` (i.e. `/chat`, `/clinics`, `/learn`, `/profile`, `/admin`).
**Unprotected:** `/`, `/login`, `/register`, `/api/auth/callback`, and all static assets.

Unauthenticated request to a protected route → redirect to `/login`. No `?redirectTo` param.

### Server Actions (`lib/actions/auth.ts`)

All three actions are `'use server'` functions. They use `createClient()` from `lib/supabase/server.ts` and call `redirect()` from `next/navigation` on success.

**`signIn(formData: FormData)`**
1. Parse + validate email/password with Zod
2. `supabase.auth.signInWithPassword({ email, password })`
3. Success → `redirect('/chat')`
4. Error → return `{ error: string }` to the form

**`signUp(formData: FormData)`**
1. Parse + validate email/password with Zod
2. `supabase.auth.signUp({ email, password })`
3. Success → return `{ success: true }` (form shows "check your email" state)
4. Error → return `{ error: string }` to the form

**`signOut()`**
1. `supabase.auth.signOut()`
2. `redirect('/login')`

### Auth Callback (`app/api/auth/callback/route.ts`)

GET handler. Reads `code` from search params. Calls `supabase.auth.exchangeCodeForSession(code)`. On success, redirects to `/chat`. On failure (missing/invalid/expired code), redirects to `/login?error=confirmation_failed`.

### Auth Pages

Both pages are Server Components that check for an existing session at the top via `supabase.auth.getUser()` — authenticated users are redirected to `/chat` immediately.

**Login (`/login`):**
- `page.tsx` is a Server Component — reads `?error=confirmation_failed` searchParam and passes it to a `LoginForm` client component
- `login-form.tsx` (`'use client'`) — uses `useActionState(signIn)` to handle pending/error state; shows inline error on failure
- Form: email + password + "Sign in" button; link to `/register`

**Register (`/register`):**
- `page.tsx` is a Server Component wrapper
- `register-form.tsx` (`'use client'`) — uses `useActionState(signUp)`; on success state replaces form with "Check your email" confirmation message
- Form: email + password + "Create account" button; link to `/login`
- On Server Action error: inline error message below form

---

## Data Flow

```
Login:
  form submit → signIn() → supabase.auth.signInWithPassword() → redirect /chat
                                                               ↘ return error → display inline

Register:
  form submit → signUp() → supabase.auth.signUp() → return { success } → show "check your email"
                                                  ↘ return error → display inline

Email confirmation:
  user clicks link → /api/auth/callback?code=xxx → exchangeCodeForSession() → redirect /chat
                                                                             ↘ redirect /login?error=confirmation_failed

Sign-out:
  button → signOut() → supabase.auth.signOut() → redirect /login

Route guard:
  request to /(app)/* → middleware → getUser() → authenticated → pass through
                                                ↘ unauthenticated → redirect /login
```

---

## Visual Design

Matches design tokens from `docs/design-tokens.md` and the prior auth pages spec:

- **Background:** `#f7f4ed` (cream) — no white card, form floats on page
- **Layout:** vertically + horizontally centered, `max-w-[360px]` content column
- **Heading:** 28px / weight 600 / letter-spacing -0.5px / charcoal
- **Subheading / nav links:** 13px / muted-gray
- **Inputs:** `background #fcfbf8`, `border 1px solid rgba(28,28,28,0.4)`, `border-radius 6px`, `padding 9px 12px`
- **Submit button:** charcoal bg, off-white text
- **Max font weight:** 600 (never 700)
- **UI primitives:** shadcn/ui `Input`, `Button`, `Label`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Wrong credentials | Inline error below form (Server Action returns `{ error }`) |
| Email already registered | Inline error (Supabase message surfaced as-is — no leaking) |
| Unconfirmed email on login | Inline error |
| Expired confirmation link | Redirect to `/login?error=confirmation_failed` → login page shows notice |
| Invalid code in callback | Redirect to `/login?error=confirmation_failed` |
| Already authenticated visiting `/login` or `/register` | Redirect to `/chat` |
| Cookie mutation in Server Component | Silently ignored (already handled in `server.ts`) |

---

## Validation (`lib/actions/auth.ts`)

Zod schemas defined inside `auth.ts` (no separate `lib/validations/` file — one-off, not shared).

**`signInSchema`:** `email` (valid email), `password` (non-empty, min 6 chars)

**`signUpSchema`:** `email` (valid email), `password` (min 8 chars)

---

## Acceptance Criteria Mapping

| AC | Implementation |
|---|---|
| `lib/supabase/browser.ts` exports browser client | Already done — `createClient()` via `createBrowserClient` |
| `lib/supabase/server.ts` exports server client with cookie handling | Already done — `createClient()` via `createServerClient` |
| Sessions persist across page refreshes (cookie-based) | `@supabase/ssr` writes session to cookies; middleware refreshes on every request |
| Sign-out clears session and redirects to `/login` | `signOut()` Server Action: `supabase.auth.signOut()` → `redirect('/login')` |
| Auth state accessible in Server Components via `supabase.auth.getUser()` | Server client available anywhere via `createClient()` from `lib/supabase/server.ts` |
| Biome passes with no errors | Run `pnpm biome check --write .` after implementation |

---

## Constraints

- No pure white (`#ffffff`) backgrounds
- Max font weight 600
- No ESLint/Prettier — Biome only
- Server client used in Server Actions + middleware; browser client NOT used for auth mutations
- `getUser()` (server-validated) not `getSession()` (cookie-only) in middleware
