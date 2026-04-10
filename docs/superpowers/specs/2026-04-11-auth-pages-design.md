# Auth Pages Design — Epic 2

**Date:** 2026-04-11
**Scope:** Register, Login, Forgot Password, Reset Password pages
**Issue:** Epic 2 · Sprint 1

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| OAuth | Email/password only | Google OAuth deferred to a later epic |
| Post-register redirect | `/chat` | No email confirmation gate in v1 |
| Post-login redirect | `/chat` | Per issue spec |
| Layout | Minimal / no card | Form floats on cream background, editorial feel |
| Form library | React Hook Form + Zod | Cross-field validation (confirm password), Zod already a project convention |
| UI primitives | shadcn/ui `base-nova` (Input, Label, Form) | Matches existing `components.json` style |

---

## File Structure

```
app/(auth)/
├── layout.tsx                     # Shared: full-height cream bg, centered content column (max-w-sm)
├── login/
│   ├── page.tsx                   # Server component — metadata + renders LoginForm
│   └── login-form.tsx             # 'use client' — RHF + Supabase signInWithPassword
├── register/
│   ├── page.tsx
│   └── register-form.tsx          # 'use client' — RHF + Supabase signUp
├── forgot-password/
│   ├── page.tsx
│   └── forgot-password-form.tsx   # 'use client' — RHF + Supabase resetPasswordForEmail
└── reset-password/
    ├── page.tsx
    └── reset-password-form.tsx    # 'use client' — RHF + Supabase updateUser

app/api/auth/
└── callback/
    └── route.ts                   # PKCE token exchange: verifyOtp → redirect to `next`

lib/validations/
└── auth.ts                        # loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema

components/ui/
├── input.tsx                      # npx shadcn add input
├── label.tsx                      # npx shadcn add label
└── form.tsx                       # npx shadcn add form
```

---

## Visual Design

- **Background:** `#f7f4ed` (cream) — no card container, form sits directly on the page
- **Layout:** vertically and horizontally centered, `max-w-[360px]` content column
- **Heading:** 28px / weight 600 / letter-spacing -0.5px (charcoal)
- **Subheading:** 14px / weight 400 / muted-gray
- **App label above heading:** 11px uppercase / letter-spacing 0.08em / muted-gray
- **Labels:** 13px / weight 600 / charcoal
- **Inputs:** `background #fcfbf8`, `border 1px solid rgba(28,28,28,0.4)`, `border-radius 6px`, `padding 9px 12px`
- **Submit button:** Primary Dark variant (charcoal bg, off-white text, inset shadow)
- **Nav links** (e.g. "Don't have an account?"): 13px / muted-gray, underlined anchor in charcoal
- **Max font weight:** 600 — never 700

---

## Data Flow

### Login (`/login`)
1. On page mount: if `?reset=success` param present → show green banner "Password updated — sign in below"; if `?error=link-expired` present → show red banner "Reset link has expired — request a new one"
2. User submits email + password
3. `supabase.auth.signInWithPassword({ email, password })`
4. Success → `router.push('/chat')`
5. Error → display Supabase error message in top server-error banner

### Register (`/register`)
1. User submits email + password + confirmPassword
2. Client validates passwords match before sending
3. `supabase.auth.signUp({ email, password })`
4. Success → `router.push('/chat')`
5. Error → display error in top banner

### Forgot Password (`/forgot-password`)
1. User submits email
2. `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/api/auth/callback?next=/reset-password' })`
3. Success → replace form content with green confirmation message (no redirect)
4. Error → display error in top banner

### Reset Password (`/reset-password`)
1. User arrives after Supabase redirects through `/api/auth/callback` — session already established
2. User submits newPassword + confirmPassword
3. `supabase.auth.updateUser({ password: newPassword })`
4. Success → `router.push('/login?reset=success')`
5. Error → display error in top banner

### Auth Callback (`/api/auth/callback`)
1. Reads `token_hash` and `type` from query params
2. `supabase.auth.verifyOtp({ token_hash, type })`
3. Redirects to `next` query param (default: `/chat`)
4. On error → redirects to `/login?error=link-expired`

---

## Validation (Zod schemas in `lib/validations/auth.ts`)

### `loginSchema`
- `email`: valid email format
- `password`: non-empty, min 6 chars

### `registerSchema`
- `email`: valid email format
- `password`: min 8 chars
- `confirmPassword`: must match `password` (cross-field `.refine()`)

### `forgotPasswordSchema`
- `email`: valid email format

### `resetPasswordSchema`
- `password`: min 8 chars
- `confirmPassword`: must match `password` (cross-field `.refine()`)

---

## Error Display

| Error type | Display |
|---|---|
| Field-level (Zod/RHF) | Red border on input (`border-destructive`) + 12px message below field |
| Server error (Supabase) | Red banner above form fields |
| Loading state | Button text → "Signing in…" / "Creating account…" etc., button disabled |
| All errors | Clear on next submission attempt |

---

## New Dependencies

```bash
pnpm add react-hook-form @hookform/resolvers zod
npx shadcn add input label form
```

`zod` may already be installed — check before adding.

---

## Testing (Playwright)

All tests run against local Supabase stack.

**Login**
- Valid credentials → redirects to `/chat`
- Invalid credentials → server error banner visible
- Invalid email format → field error shown, no network call made

**Register**
- Valid new account → redirects to `/chat`
- Passwords don't match → field error on confirmPassword
- Already-registered email → server error banner visible

**Forgot password**
- Valid email → success confirmation replaces form
- Invalid email format → field error shown

**Reset password**
- Valid new password → redirects to `/login`
- Passwords don't match → field error on confirmPassword

---

## Constraints

- No pure white (`#ffffff`) backgrounds — cream only
- Max font weight 600
- No ESLint/Prettier — Biome only (`pnpm biome check --write .` before commit)
- All Supabase calls use the browser client (`lib/supabase/browser.ts`)
- RLS is not involved — auth pages are fully public routes
