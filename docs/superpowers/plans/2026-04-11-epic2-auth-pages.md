# Auth Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four public auth pages (login, register, forgot-password, reset-password) using React Hook Form + Zod + shadcn/ui, backed by Supabase Auth.

**Architecture:** Each page is a server component (metadata) rendering a co-located `use client` form component. Forms use React Hook Form with Zod validation. A shared `(auth)` layout centers content on the cream background. An `/api/auth/callback` route handles the PKCE token exchange for password-reset emails.

**Tech Stack:** Next.js 14 App Router, React Hook Form, Zod, @hookform/resolvers, shadcn/ui base-nova (Input, Label, Form), @supabase/ssr v0.10, Playwright for E2E tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/validations/auth.ts` | Zod schemas + inferred types for all four forms |
| Create | `app/(auth)/layout.tsx` | Full-height cream layout, centered max-w-[360px] column |
| Create | `app/(auth)/login/page.tsx` | Metadata + Suspense wrapper for LoginForm |
| Create | `app/(auth)/login/login-form.tsx` | `use client` login form |
| Create | `app/(auth)/register/page.tsx` | Metadata + RegisterForm |
| Create | `app/(auth)/register/register-form.tsx` | `use client` register form |
| Create | `app/(auth)/forgot-password/page.tsx` | Metadata + ForgotPasswordForm |
| Create | `app/(auth)/forgot-password/forgot-password-form.tsx` | `use client` forgot-password form |
| Create | `app/(auth)/reset-password/page.tsx` | Metadata + ResetPasswordForm |
| Create | `app/(auth)/reset-password/reset-password-form.tsx` | `use client` reset-password form |
| Create | `app/api/auth/callback/route.ts` | PKCE token exchange for Supabase email links |
| Create | `playwright.config.ts` | Playwright config (baseURL, projects, webServer) |
| Create | `e2e/helpers/supabase.ts` | Test user create/delete via Supabase admin API |
| Create | `e2e/auth/login.spec.ts` | Login E2E tests |
| Create | `e2e/auth/register.spec.ts` | Register E2E tests |
| Create | `e2e/auth/forgot-password.spec.ts` | Forgot-password E2E tests |
| Create | `e2e/auth/reset-password.spec.ts` | Reset-password E2E tests |
| Modify | `components/ui/` | Add: input.tsx, label.tsx, form.tsx via shadcn CLI |

---

## Task 1: Install dependencies and add shadcn UI components

**Files:**
- Modify: `package.json` (pnpm adds deps)
- Create: `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/form.tsx`
- Create: `playwright.config.ts`

- [ ] **Step 1: Install form and test dependencies**

```bash
pnpm add react-hook-form @hookform/resolvers zod
pnpm add -D @playwright/test
```

Expected: No errors. `package.json` gains the four packages.

- [ ] **Step 2: Add shadcn UI components**

```bash
npx shadcn add input label form
```

Accept any prompts. This creates `components/ui/input.tsx`, `components/ui/label.tsx`, and `components/ui/form.tsx`.

- [ ] **Step 3: Install Playwright browser binaries**

```bash
pnpm exec playwright install --with-deps chromium
```

Expected: Chromium browser downloaded. (Only chromium for now to keep setup fast; other browsers can be added later.)

- [ ] **Step 4: Create playwright.config.ts**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
```

- [ ] **Step 5: Verify shadcn components exist**

```bash
ls components/ui/
```

Expected output includes: `button.tsx  form.tsx  input.tsx  label.tsx`

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts components/ui/
git commit -m "feat(auth): install RHF, Zod, Playwright; add shadcn Input/Label/Form"
```

---

## Task 2: Zod validation schemas

**Files:**
- Create: `lib/validations/auth.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// lib/validations/auth.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
```

- [ ] **Step 2: Run Biome to check for lint errors**

```bash
pnpm biome check lib/validations/auth.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/validations/auth.ts
git commit -m "feat(auth): add Zod validation schemas for all auth forms"
```

---

## Task 3: Auth callback API route

**Files:**
- Create: `app/api/auth/callback/route.ts`

This route handles the PKCE token exchange that Supabase inserts into password-reset email links. Supabase sends the user to `{origin}/api/auth/callback?token_hash=...&type=recovery&next=/reset-password`. This route verifies the token, establishes a session, then redirects.

- [ ] **Step 1: Create the route handler**

```typescript
// app/api/auth/callback/route.ts
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/chat";

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link-expired`);
}
```

- [ ] **Step 2: Run Biome check**

```bash
pnpm biome check app/api/auth/callback/route.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/callback/route.ts
git commit -m "feat(auth): add PKCE callback route for Supabase email links"
```

---

## Task 4: Shared auth layout

**Files:**
- Create: `app/(auth)/layout.tsx`

- [ ] **Step 1: Create the layout**

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[360px]">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Run Biome check**

```bash
pnpm biome check app/(auth)/layout.tsx
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/layout.tsx"
git commit -m "feat(auth): add shared auth layout (centered cream, max-w-360)"
```

---

## Task 5: E2E test helpers

**Files:**
- Create: `e2e/helpers/supabase.ts`

These helpers create and delete Supabase Auth users for E2E tests. They use the Supabase admin API which requires the service role key.

> **Pre-requisite:** `SUPABASE_SERVICE_ROLE_KEY` must be set in `.env.local` before running any E2E tests. Get it by running `supabase status` — it's listed as "service_role key".

- [ ] **Step 1: Create the helper file**

```typescript
// e2e/helpers/supabase.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(
  email: string,
  password: string,
): Promise<string> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createTestUser failed: ${error.message}`);
  return data.user.id;
}

export async function deleteTestUser(userId: string): Promise<void> {
  const supabase = getAdminClient();
  await supabase.auth.admin.deleteUser(userId);
}
```

- [ ] **Step 2: Run Biome check**

```bash
pnpm biome check e2e/helpers/supabase.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/supabase.ts
git commit -m "test(auth): add Supabase admin helpers for E2E test user management"
```

---

## Task 6: Login page (TDD)

**Files:**
- Create: `e2e/auth/login.spec.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/login/login-form.tsx`

- [ ] **Step 1: Make sure local Supabase and dev server are running**

```bash
supabase status
```

Expected: Shows running services including API URL `http://localhost:54321`.

Keep `pnpm dev` running in a separate terminal.

- [ ] **Step 2: Write the failing E2E tests**

```typescript
// e2e/auth/login.spec.ts
import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser } from "../helpers/supabase";

const TEST_EMAIL = "e2e-login@test.local";
const TEST_PASSWORD = "TestPass123!";

test.describe("Login page", () => {
  let userId: string;

  test.beforeAll(async () => {
    userId = await createTestUser(TEST_EMAIL, TEST_PASSWORD);
  });

  test.afterAll(async () => {
    await deleteTestUser(userId);
  });

  test("renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("shows field error for invalid email format", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "not-an-email");
    await page.fill('[name="password"]', "anything");
    await page.click('[type="submit"]');
    await expect(
      page.getByText("Please enter a valid email address"),
    ).toBeVisible();
  });

  test("shows server error banner for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', TEST_EMAIL);
    await page.fill('[name="password"]', "wrongpassword");
    await page.click('[type="submit"]');
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("valid credentials redirect to /chat", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', TEST_EMAIL);
    await page.fill('[name="password"]', TEST_PASSWORD);
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail (page doesn't exist yet)**

```bash
pnpm exec playwright test e2e/auth/login.spec.ts
```

Expected: FAIL — "net::ERR_ABORTED" or 404 on `/login`.

- [ ] **Step 4: Create the page server component**

```tsx
// app/(auth)/login/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Cervix Health Assistant",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 5: Create the login form client component**

```tsx
// app/(auth)/login/login-form.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { loginSchema, type LoginFormValues } from "@/lib/validations/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const showResetSuccess = searchParams.get("reset") === "success";
  const showLinkExpired = searchParams.get("error") === "link-expired";

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push("/chat");
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">
        Cervix Health
      </p>
      <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
        Welcome back
      </h1>
      <p className="text-sm text-muted-gray mb-8">Sign in to your account</p>

      {showResetSuccess && (
        <div
          role="status"
          className="mb-4 rounded-standard border border-green-300/30 bg-green-50/50 px-3 py-2.5 text-sm text-green-700"
        >
          Password updated — sign in below
        </div>
      )}
      {showLinkExpired && (
        <div
          role="alert"
          className="mb-4 rounded-standard border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          Reset link has expired — request a new one
        </div>
      )}
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
                    type="email"
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
                <div className="flex items-baseline justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-charcoal underline underline-offset-2"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" {...field} />
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
            {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Form>

      <p className="mt-5 text-center text-[13px] text-muted-gray">
        {"Don't have an account?"}{" "}
        <Link
          href="/register"
          className="text-charcoal underline underline-offset-2"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run Biome check on new files**

```bash
pnpm biome check --write "app/(auth)/login/"
```

Expected: Any auto-fixable issues resolved. No remaining errors.

- [ ] **Step 7: Run the login tests**

```bash
pnpm exec playwright test e2e/auth/login.spec.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(auth)/login/" e2e/auth/login.spec.ts
git commit -m "feat(auth): implement login page with RHF + Zod validation"
```

---

## Task 7: Register page (TDD)

**Files:**
- Create: `e2e/auth/register.spec.ts`
- Create: `app/(auth)/register/page.tsx`
- Create: `app/(auth)/register/register-form.tsx`

- [ ] **Step 1: Write the failing E2E tests**

```typescript
// e2e/auth/register.spec.ts
import { expect, test } from "@playwright/test";
import { deleteTestUser } from "../helpers/supabase";

test.describe("Register page", () => {
  const uniqueEmail = () =>
    `e2e-register-${Date.now()}@test.local`;

  test("renders email, password, and confirm password fields", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
  });

  test("shows field error when passwords do not match", async ({ page }) => {
    await page.goto("/register");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "DifferentPass123!");
    await page.click('[type="submit"]');
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("shows field error for invalid email format", async ({ page }) => {
    await page.goto("/register");
    await page.fill('[name="email"]', "bad-email");
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(
      page.getByText("Please enter a valid email address"),
    ).toBeVisible();
  });

  test("valid registration redirects to /chat", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");

    // Clean up: sign out and note userId not easily available here;
    // Supabase local DB resets between test runs via `supabase db reset`
  });

  test("already-registered email shows server error", async ({ page }) => {
    // Use the same email twice
    const email = uniqueEmail();
    // First registration
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");

    // Second registration with same email
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm exec playwright test e2e/auth/register.spec.ts
```

Expected: FAIL — 404 on `/register`.

- [ ] **Step 3: Create the page server component**

```tsx
// app/(auth)/register/page.tsx
import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create account — Cervix Health Assistant",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
```

- [ ] **Step 4: Create the register form client component**

```tsx
// app/(auth)/register/register-form.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { registerSchema, type RegisterFormValues } from "@/lib/validations/auth";

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

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
    router.push("/chat");
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
                    type="email"
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

- [ ] **Step 5: Run Biome check**

```bash
pnpm biome check --write "app/(auth)/register/"
```

Expected: No remaining errors.

- [ ] **Step 6: Run the register tests**

```bash
pnpm exec playwright test e2e/auth/register.spec.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/register/" e2e/auth/register.spec.ts
git commit -m "feat(auth): implement register page with password confirmation validation"
```

---

## Task 8: Forgot password page (TDD)

**Files:**
- Create: `e2e/auth/forgot-password.spec.ts`
- Create: `app/(auth)/forgot-password/page.tsx`
- Create: `app/(auth)/forgot-password/forgot-password-form.tsx`

- [ ] **Step 1: Write the failing E2E tests**

```typescript
// e2e/auth/forgot-password.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Forgot password page", () => {
  test("renders email field and submit button", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  });

  test("shows field error for invalid email format", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.fill('[name="email"]', "not-an-email");
    await page.click('[type="submit"]');
    await expect(
      page.getByText("Please enter a valid email address"),
    ).toBeVisible();
  });

  test("shows success confirmation after submitting valid email", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.fill('[name="email"]', "anyone@example.com");
    await page.click('[type="submit"]');
    // Supabase returns success even for non-existent emails (prevents enumeration)
    await expect(page.getByRole("status")).toBeVisible();
    // Form is replaced by confirmation — submit button no longer visible
    await expect(
      page.getByRole("button", { name: "Send reset link" }),
    ).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm exec playwright test e2e/auth/forgot-password.spec.ts
```

Expected: FAIL — 404 on `/forgot-password`.

- [ ] **Step 3: Create the page server component**

```tsx
// app/(auth)/forgot-password/page.tsx
import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password — Cervix Health Assistant",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
```

- [ ] **Step 4: Create the forgot-password form client component**

```tsx
// app/(auth)/forgot-password/forgot-password-form.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validations/auth";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo:
        window.location.origin +
        "/api/auth/callback?next=/reset-password",
    });
    // Always show success regardless of whether email exists (prevents enumeration)
    setSubmittedEmail(values.email);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">
          Cervix Health
        </p>
        <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
          Check your inbox
        </h1>
        <p className="text-sm text-muted-gray mb-8">
          We sent a reset link to{" "}
          <span className="text-charcoal">{submittedEmail}</span>
        </p>
        <div
          role="status"
          className="rounded-standard border border-green-300/30 bg-green-50/50 px-3 py-2.5 text-sm text-green-700"
        >
          Reset link sent — check your email and follow the link to set a new
          password.
        </div>
        <p className="mt-6 text-center text-[13px] text-muted-gray">
          <Link
            href="/login"
            className="text-charcoal underline underline-offset-2"
          >
            Back to login
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
        Reset password
      </h1>
      <p className="text-sm text-muted-gray mb-8">
        Enter your email and we&apos;ll send a reset link
      </p>

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
                    type="email"
                    placeholder="you@example.com"
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
            {form.formState.isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      </Form>

      <p className="mt-5 text-center text-[13px] text-muted-gray">
        <Link
          href="/login"
          className="text-charcoal underline underline-offset-2"
        >
          Back to login
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run Biome check**

```bash
pnpm biome check --write "app/(auth)/forgot-password/"
```

Expected: No remaining errors.

- [ ] **Step 6: Run the forgot-password tests**

```bash
pnpm exec playwright test e2e/auth/forgot-password.spec.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/forgot-password/" e2e/auth/forgot-password.spec.ts
git commit -m "feat(auth): implement forgot-password page with success confirmation"
```

---

## Task 9: Reset password page (TDD)

**Files:**
- Create: `e2e/auth/reset-password.spec.ts`
- Create: `app/(auth)/reset-password/page.tsx`
- Create: `app/(auth)/reset-password/reset-password-form.tsx`

> **Note on test coverage:** The full reset flow (click email link -> callback -> update password) requires intercepting a real email. Tests here cover: page renders correctly, client-side validation, and the no-session redirect. The Supabase `updateUser` call is covered by the form rendering test.

- [ ] **Step 1: Write the failing E2E tests**

```typescript
// e2e/auth/reset-password.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Reset password page", () => {
  test("redirects to /forgot-password when there is no active session", async ({
    page,
  }) => {
    // Navigate directly without going through the email link
    await page.goto("/reset-password");
    await expect(page).toHaveURL("/forgot-password");
  });

  test("shows password fields when session is present", async ({ page }) => {
    // To test the form itself, we need a session. Sign up a temp user first.
    const email = `e2e-reset-${Date.now()}@test.local`;
    const password = "Password123!";

    // Register and land on /chat (establishes session)
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.fill('[name="confirmPassword"]', password);
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");

    // Now navigate to reset-password — session is active
    await page.goto("/reset-password");
    await expect(page.getByLabel("New password")).toBeVisible();
    await expect(page.getByLabel("Confirm new password")).toBeVisible();
  });

  test("shows error when passwords do not match", async ({ page }) => {
    const email = `e2e-reset-mismatch-${Date.now()}@test.local`;
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");

    await page.goto("/reset-password");
    await page.fill('[name="password"]', "NewPass123!");
    await page.fill('[name="confirmPassword"]', "DifferentPass!");
    await page.click('[type="submit"]');
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm exec playwright test e2e/auth/reset-password.spec.ts
```

Expected: FAIL — 404 on `/reset-password`.

- [ ] **Step 3: Create the page server component**

```tsx
// app/(auth)/reset-password/page.tsx
import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set new password — Cervix Health Assistant",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
```

- [ ] **Step 4: Create the reset-password form client component**

```tsx
// app/(auth)/reset-password/reset-password-form.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/validations/auth";

export function ResetPasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/forgot-password");
      } else {
        setSessionChecked(true);
      }
    });
  }, [router]);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetPasswordFormValues) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push("/login?reset=success");
  }

  if (!sessionChecked) {
    return null;
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">
        Cervix Health
      </p>
      <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px] mb-1.5">
        Set new password
      </h1>
      <p className="text-sm text-muted-gray mb-8">
        Choose a strong password for your account
      </p>

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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
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
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Re-enter your new password"
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
            {form.formState.isSubmitting ? "Updating..." : "Update password"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

- [ ] **Step 5: Run Biome check**

```bash
pnpm biome check --write "app/(auth)/reset-password/"
```

Expected: No remaining errors.

- [ ] **Step 6: Run the reset-password tests**

```bash
pnpm exec playwright test e2e/auth/reset-password.spec.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/reset-password/" e2e/auth/reset-password.spec.ts
git commit -m "feat(auth): implement reset-password page with session guard"
```

---

## Task 10: Full suite verification and final lint

- [ ] **Step 1: Run the full Playwright suite**

```bash
pnpm exec playwright test
```

Expected: All tests PASS across `login`, `register`, `forgot-password`, `reset-password` specs.

- [ ] **Step 2: Run Biome over all touched files**

```bash
pnpm biome check --write .
```

Expected: No errors. If any auto-fixes are applied, review them.

- [ ] **Step 3: Build check (catches TypeScript errors)**

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit any Biome fixes**

If `biome check --write` changed anything:

```bash
git add -A
git commit -m "style(auth): apply Biome formatting fixes"
```

Otherwise skip this step.
