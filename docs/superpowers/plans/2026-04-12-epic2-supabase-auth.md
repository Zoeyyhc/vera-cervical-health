# Epic 2 — Supabase Auth: Email/Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Epic 2 auth on the existing `feature/epic2-auth-pages` branch — add middleware route protection, fix register form email-confirmation gate, and add a minimal app shell with sign-out.

**Architecture:** The branch already has RHF + browser-Supabase client auth pages, Input/Label/Form components, and a PKCE callback route. Three things remain: middleware (entirely missing), a register-form UX fix (shows "check your email" instead of redirecting to `/chat`), and a minimal `/(app)/chat` page with sign-out so the middleware has a protected target.

**Tech Stack:** Next.js 14 App Router, `@supabase/ssr`, Tailwind CSS design tokens. All work is on `.worktrees/epic2-auth` (branch `feature/epic2-auth-pages`).

---

## Already Done — Do Not Touch

| File | Status |
|---|---|
| `components/ui/input.tsx`, `label.tsx`, `form.tsx` | ✅ Complete |
| `app/(auth)/layout.tsx` | ✅ Complete |
| `app/(auth)/login/page.tsx` + `login-form.tsx` | ✅ Complete (RHF, error banners, forgot-password link) |
| `app/(auth)/register/page.tsx` | ✅ Complete |
| `app/(auth)/forgot-password/` + `reset-password/` | ✅ Complete |
| `app/api/auth/callback/route.ts` | ✅ Complete (`verifyOtp` PKCE flow — keep as-is) |
| `lib/supabase/browser.ts`, `server.ts` | ✅ Complete |
| `lib/validations/auth.ts` | ✅ Complete |

---

## File Map — What This Plan Builds

| File | Action | Purpose |
|---|---|---|
| `middleware.ts` | Create | Session refresh + guard `/chat`, `/clinics`, `/learn`, `/profile`, `/admin` |
| `app/(auth)/register/register-form.tsx` | Modify | Show "check your email" on success instead of redirecting to `/chat` |
| `app/(app)/layout.tsx` | Create | Pass-through layout for protected routes |
| `app/(app)/chat/page.tsx` | Create | Placeholder page — sign-out button to verify AC |

---

## Task 1: Fix register form — email confirmation gate

**Files:**
- Modify: `app/(auth)/register/register-form.tsx`

The existing form calls `router.push("/chat")` on success. With email confirmation enabled in Supabase, the user has no session yet — they need to click the confirmation link first. This task replaces the redirect with a "check your email" inline state.

- [ ] **Step 1: Update the register form**

Open `app/(auth)/register/register-form.tsx`. Replace the entire file with:

```tsx
// app/(auth)/register/register-form.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import {
  type RegisterFormValues,
  registerSchema,
} from "@/lib/validations/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    setEmailSent(true);
  }

  if (emailSent) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">
          Cervix Health
        </p>
        <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px]">
          Check your email
        </h1>
        <p className="text-sm text-muted-gray">
          We sent a confirmation link to your inbox. Click it to activate your
          account.
        </p>
        <p className="text-[13px] text-muted-gray">
          Already confirmed?{" "}
          <Link
            href="/login"
            className="text-charcoal underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">
        Cervix Health
      </p>
      <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
        Create account
      </h1>
      <p className="text-sm text-muted-gray mb-8">Start your health journey</p>

      {serverError && (
        <div
          role="alert"
          className="mb-4 rounded-standard border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Min. 8 characters"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Re-enter your password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            variant="default"
            className="w-full mt-2"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </Form>

      <p className="mt-5 text-center text-[13px] text-muted-gray">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-charcoal underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Run Biome**

```bash
cd /Users/Najum/cervix-assistant/.worktrees/epic2-auth && pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/register/register-form.tsx
git commit -m "fix(auth): show email confirmation state after sign-up instead of redirecting"
```

---

## Task 2: Middleware

**Files:**
- Create: `middleware.ts` at the worktree root

- [ ] **Step 1: Create the middleware**

Create `middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// URL paths for app/(app)/* — route group parentheses don't appear in the URL.
const PROTECTED_PATHS = ["/chat", "/clinics", "/learn", "/profile", "/admin"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  // supabaseResponse must be returned so cookie mutations from setAll() reach the browser.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Use getUser() not getSession() — validates the token server-side and rotates it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Run Biome**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add middleware to protect /(app)/* routes and refresh session cookies"
```

---

## Task 3: Minimal app shell with sign-out

The middleware needs a protected target route to redirect to after login. This task adds the minimum: a pass-through `(app)` layout and a placeholder `/chat` page with a sign-out button, so the sign-out acceptance criterion is verifiable.

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/chat/page.tsx`
- Create: `app/(app)/chat/sign-out-button.tsx`

- [ ] **Step 1: Create the (app) layout**

Create `app/(app)/layout.tsx`:

```tsx
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Create the sign-out button (client component)**

Create `app/(app)/chat/sign-out-button.tsx`:

```tsx
"use client";

import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-[13px] text-muted-gray underline underline-offset-4"
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 3: Create the placeholder chat page**

Create `app/(app)/chat/page.tsx`:

```tsx
import { SignOutButton } from "./sign-out-button";

export default function ChatPage() {
  return (
    <main className="min-h-screen bg-cream p-8">
      <h1 className="text-2xl font-semibold text-charcoal">Chat</h1>
      <p className="mt-2 text-muted-gray">Coming soon.</p>
      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run Biome and full check**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/layout.tsx app/\(app\)/chat/page.tsx app/\(app\)/chat/sign-out-button.tsx
git commit -m "feat: add minimal app shell and chat placeholder with sign-out"
```

---

## Acceptance Criteria Verification

| AC | Satisfied by |
|---|---|
| `lib/supabase/browser.ts` exports browser client | ✅ Already on branch |
| `lib/supabase/server.ts` exports server client with cookie handling | ✅ Already on branch |
| Sessions persist across page refreshes (cookie-based) | ✅ `@supabase/ssr` + middleware `setAll` refreshes cookies on every request (Task 2) |
| Sign-out clears session and redirects to `/login` | Task 3 — `SignOutButton` calls `supabase.auth.signOut()` then `router.push('/login')` |
| Auth state accessible in Server Components via `supabase.auth.getUser()` | ✅ Server client available via `createClient()` from `lib/supabase/server.ts` |
| Biome passes with no errors | Verified at end of each task |
