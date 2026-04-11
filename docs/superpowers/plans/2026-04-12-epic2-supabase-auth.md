# Epic 2 — Supabase Auth: Email/Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Supabase Auth email/password — Server Actions, middleware route protection, login/register pages with email confirmation gate, and sign-out.

**Architecture:** Server Actions (`lib/actions/auth.ts`) handle all auth mutations using the server-side Supabase client. A Next.js middleware guards `/(app)/*` routes by calling `supabase.auth.getUser()` on every request and refreshing the session cookie. Client form components use `useFormState` from `react-dom` to display Server Action results without a page reload.

**Tech Stack:** `@supabase/ssr ^0.10.2`, `zod` (to be added), `next/navigation` redirect, `useFormState`/`useFormStatus` from `react-dom`, Tailwind CSS design tokens, `@base-ui/react` + custom Input/Label components.

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `lib/actions/auth.ts` | Create | Server Actions: `signIn`, `signUp`, `signOut` |
| `lib/actions/auth.test.ts` | Create | Vitest unit tests for all three actions |
| `middleware.ts` | Create | Session refresh + route guard for `/(app)/*` |
| `app/api/auth/callback/route.ts` | Create | Exchange confirmation code → session → redirect |
| `app/(auth)/layout.tsx` | Create | Centered cream layout wrapping auth pages |
| `app/(auth)/login/page.tsx` | Create | Server Component: session check + pass error prop |
| `app/(auth)/login/login-form.tsx` | Create | `'use client'` form with `useFormState(signIn)` |
| `app/(auth)/register/page.tsx` | Create | Server Component wrapper |
| `app/(auth)/register/register-form.tsx` | Create | `'use client'` form with "check your email" state |
| `app/(app)/layout.tsx` | Create | Minimal pass-through layout for protected routes |
| `app/(app)/chat/page.tsx` | Create | Placeholder page with sign-out button (verifies AC) |
| `components/ui/input.tsx` | Create | Styled native input (no shadcn CLI needed) |
| `components/ui/label.tsx` | Create | Styled native label |

**Existing — no changes needed:**
- `lib/supabase/browser.ts` — `createBrowserClient` already wired ✓
- `lib/supabase/server.ts` — `createServerClient` + cookie handling already wired ✓

---

## Task 1: Install Zod and create Input/Label components

**Files:**
- Modify: `package.json` (new dep via pnpm)
- Create: `components/ui/input.tsx`
- Create: `components/ui/label.tsx`

- [ ] **Step 1: Add zod as a direct dependency**

```bash
cd /Users/Najum/cervix-assistant && pnpm add zod
```

Expected: `package.json` gains `"zod": "^3.x.x"` under `dependencies`. Lockfile updated.

- [ ] **Step 2: Create Input component**

Create `components/ui/input.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex w-full rounded-standard bg-off-white px-3 py-[9px] text-sm text-charcoal",
        "border border-charcoal/40",
        "placeholder:text-muted-gray",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

- [ ] **Step 3: Create Label component**

Create `components/ui/label.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes } from "react";

function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-[13px] font-semibold text-charcoal", className)}
      {...props}
    />
  );
}

export { Label };
```

- [ ] **Step 4: Run Biome**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui/input.tsx components/ui/label.tsx package.json pnpm-lock.yaml
git commit -m "feat: add zod dep and Input/Label UI primitives"
```

---

## Task 2: Server Actions (TDD)

**Files:**
- Create: `lib/actions/auth.ts`
- Create: `lib/actions/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/actions/auth.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const { mockSignInWithPassword, mockSignUp, mockSignOut } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
    },
  })),
}));

import { redirect } from "next/navigation";
import { signIn, signOut, signUp } from "@/lib/actions/auth";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

describe("signIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error for invalid email format", async () => {
    const result = await signIn(
      {},
      makeFormData({ email: "not-an-email", password: "password123" }),
    );
    expect(result).toEqual({ error: "Please enter a valid email address" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns error when password is fewer than 6 characters", async () => {
    const result = await signIn(
      {},
      makeFormData({ email: "user@example.com", password: "abc" }),
    );
    expect(result).toEqual({ error: "Password must be at least 6 characters" });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("returns error when Supabase returns an auth error", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });
    const result = await signIn(
      {},
      makeFormData({ email: "user@example.com", password: "correctpassword" }),
    );
    expect(result).toEqual({ error: "Invalid login credentials" });
  });

  it("calls redirect('/chat') on success", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: null });
    await signIn(
      {},
      makeFormData({ email: "user@example.com", password: "correctpassword" }),
    );
    expect(redirect).toHaveBeenCalledWith("/chat");
  });
});

describe("signUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error for invalid email format", async () => {
    const result = await signUp(
      {},
      makeFormData({ email: "bad", password: "password123" }),
    );
    expect(result).toEqual({ error: "Please enter a valid email address" });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error when password is fewer than 8 characters", async () => {
    const result = await signUp(
      {},
      makeFormData({ email: "user@example.com", password: "abc123" }),
    );
    expect(result).toEqual({ error: "Password must be at least 8 characters" });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error when Supabase returns an error", async () => {
    mockSignUp.mockResolvedValueOnce({
      error: { message: "User already registered" },
    });
    const result = await signUp(
      {},
      makeFormData({ email: "user@example.com", password: "password123" }),
    );
    expect(result).toEqual({ error: "User already registered" });
  });

  it("returns { success: true } and does NOT redirect on success", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });
    const result = await signUp(
      {},
      makeFormData({ email: "newuser@example.com", password: "password123" }),
    );
    expect(result).toEqual({ success: true });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValueOnce({ error: null });
  });

  it("calls supabase.auth.signOut() and redirects to /login", async () => {
    await signOut();
    expect(mockSignOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- lib/actions/auth.test.ts
```

Expected: Tests fail with `Cannot find module '@/lib/actions/auth'` or similar — the implementation file doesn't exist yet.

- [ ] **Step 3: Write the Server Actions implementation**

Create `lib/actions/auth.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthState = {
  error?: string;
  success?: boolean;
};

export async function signIn(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: error.message };
  }

  redirect("/chat");
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- lib/actions/auth.test.ts
```

Expected: All 9 tests pass. If any fail, read the error and fix before continuing.

- [ ] **Step 5: Run Biome**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/auth.ts lib/actions/auth.test.ts
git commit -m "feat: add signIn/signUp/signOut Server Actions with Zod validation"
```

---

## Task 3: Middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create the middleware**

Create `middleware.ts` at the project root:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that require an authenticated session.
// These are the URL paths for app/(app)/* — route group parentheses don't appear in URLs.
const PROTECTED_PATHS = ["/chat", "/clinics", "/learn", "/profile", "/admin"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  // supabaseResponse must be returned (not a plain NextResponse.next()) so that
  // cookie mutations from setAll() are forwarded to the browser.
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
          // Write to request first (required by @supabase/ssr)
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Rebuild the response so updated cookies are set on it
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: use getUser() not getSession() — getUser() validates the token
  // server-side and rotates the refresh token; getSession() only reads the cookie.
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
    // Match all routes except Next.js internals and static files
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

## Task 4: Auth callback route

**Files:**
- Create: `app/api/auth/callback/route.ts`

- [ ] **Step 1: Create the callback route handler**

Create `app/api/auth/callback/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/chat`);
    }
  }

  // Missing or invalid code — send user back to login with an error notice
  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
```

- [ ] **Step 2: Run Biome**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/callback/route.ts
git commit -m "feat: add auth callback route to exchange confirmation code for session"
```

---

## Task 5: Auth layout

**Files:**
- Create: `app/(auth)/layout.tsx`

- [ ] **Step 1: Create the auth layout**

Create `app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-[360px]">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Run Biome**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/(auth)/layout.tsx
git commit -m "feat: add auth layout with centered cream column"
```

---

## Task 6: Login page and form

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/login/login-form.tsx`

- [ ] **Step 1: Create the login page (Server Component)**

Create `app/(auth)/login/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/chat");
  }

  const confirmationError =
    searchParams.error === "confirmation_failed"
      ? "Confirmation link expired — please sign in or register again."
      : undefined;

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-2">
        Cervix Health Assistant
      </p>
      <h1 className="text-[28px] font-semibold tracking-[-0.5px] text-charcoal mb-1">
        Sign in
      </h1>
      <p className="text-[14px] text-muted-gray mb-8">Welcome back.</p>
      <LoginForm confirmationError={confirmationError} />
    </div>
  );
}
```

- [ ] **Step 2: Create the login form (Client Component)**

Create `app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/actions/auth";
import type { AuthState } from "@/lib/actions/auth";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

const initialState: AuthState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({
  confirmationError,
}: {
  confirmationError?: string;
}) {
  const [state, formAction] = useFormState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {confirmationError && (
        <p className="text-[13px] text-destructive">{confirmationError}</p>
      )}
      {state.error && (
        <p className="text-[13px] text-destructive">{state.error}</p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>
      <SubmitButton />
      <p className="text-center text-[13px] text-muted-gray">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-charcoal underline underline-offset-4"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Run Biome**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/(auth)/login/page.tsx app/(auth)/login/login-form.tsx
git commit -m "feat: add login page and form with Server Action + error display"
```

---

## Task 7: Register page and form

**Files:**
- Create: `app/(auth)/register/page.tsx`
- Create: `app/(auth)/register/register-form.tsx`

- [ ] **Step 1: Create the register page (Server Component)**

Create `app/(auth)/register/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/chat");
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-2">
        Cervix Health Assistant
      </p>
      <h1 className="text-[28px] font-semibold tracking-[-0.5px] text-charcoal mb-1">
        Create account
      </h1>
      <p className="text-[14px] text-muted-gray mb-8">
        Start your health journey.
      </p>
      <RegisterForm />
    </div>
  );
}
```

- [ ] **Step 2: Create the register form (Client Component)**

Create `app/(auth)/register/register-form.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/actions/auth";
import type { AuthState } from "@/lib/actions/auth";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

const initialState: AuthState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useFormState(signUp, initialState);

  if (state.success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[28px] font-semibold tracking-[-0.5px] text-charcoal">
          Check your email
        </p>
        <p className="text-[14px] text-muted-gray">
          We sent a confirmation link to your inbox. Click it to activate your
          account.
        </p>
        <p className="text-[13px] text-muted-gray">
          Already confirmed?{" "}
          <Link
            href="/login"
            className="text-charcoal underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="text-[13px] text-destructive">{state.error}</p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
        />
      </div>
      <SubmitButton />
      <p className="text-center text-[13px] text-muted-gray">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-charcoal underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Run Biome**

```bash
pnpm biome check --write .
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/(auth)/register/page.tsx app/(auth)/register/register-form.tsx
git commit -m "feat: add register page and form with email confirmation gate"
```

---

## Task 8: Minimal app shell with sign-out

This task creates the minimum needed to verify the sign-out acceptance criterion and give the middleware a target route. The full app shell (nav, layout design) belongs to a later epic.

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/chat/page.tsx`

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

- [ ] **Step 2: Create the placeholder chat page with sign-out**

Create `app/(app)/chat/page.tsx`:

```tsx
import { signOut } from "@/lib/actions/auth";

export default function ChatPage() {
  return (
    <main className="min-h-screen bg-cream p-8">
      <h1 className="text-2xl font-semibold text-charcoal">Chat</h1>
      <p className="mt-2 text-muted-gray">Coming soon.</p>
      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="text-[13px] text-muted-gray underline underline-offset-4"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Run the full test suite and Biome**

```bash
pnpm test && pnpm biome check .
```

Expected: All tests pass, no Biome errors.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/layout.tsx app/(app)/chat/page.tsx
git commit -m "feat: add minimal app shell and chat placeholder with sign-out"
```

---

## Self-Review Checklist

- [x] **Spec coverage**
  - `lib/supabase/browser.ts` exports browser client → already done, no task needed ✓
  - `lib/supabase/server.ts` exports server client with cookie handling → already done ✓
  - Sessions persist (cookie-based) → middleware `setAll` writes cookies on every request ✓
  - Sign-out clears session and redirects to `/login` → Task 2 + Task 8 ✓
  - Auth state accessible via `supabase.auth.getUser()` → used in login/register page.tsx ✓
  - Biome passes → `pnpm biome check --write .` at end of every task ✓

- [x] **No placeholders** — all steps have complete code blocks ✓

- [x] **Type consistency**
  - `AuthState` defined once in `lib/actions/auth.ts`, imported by both form components ✓
  - `signIn(prevState: AuthState, formData: FormData)` signature matches `useFormState(signIn, initialState)` ✓
  - `signOut()` returns `Promise<void>`, used as direct form `action={signOut}` ✓
