# Epic 2 / #15 / User Profile Edit Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/profile` where authenticated users can update `display_name`, `locale` (en/zh), and password, with two independent save flows, Zod-validated forms using React Hook Form, and success/error feedback per card.

**Architecture:** A Server Component (`app/(app)/profile/page.tsx`) fetches `email` and the user's `profiles` row server-side using `lib/supabase/server.ts`, then renders two client subforms. `profile-info-form.tsx` writes `display_name`/`locale` via `supabase.from('profiles').update(...)` using the browser client. `password-form.tsx` calls `supabase.auth.updateUser({ password })` using the same browser client. RLS already permits self-update. Middleware already gates `/profile/*`. Validation lives in a new `lib/validations/profile.ts`, unit-tested with Vitest. Component behavior is manually verified; no component-level tests.

**Tech Stack:** Next.js 14 App Router (Server + Client Components), TypeScript (strict), Supabase JS v2 (`@supabase/ssr`), React Hook Form + `@hookform/resolvers/zod`, Zod (`zod/v3` sub-path), Tailwind CSS, shadcn/ui primitives, Vitest for schema tests, Biome for lint/format.

**Issue:** Epic 2 / #15 / User Profile Edit Page

**Depends on:**
- Epic 2 / #10 (Supabase Auth email+password, middleware) - already landed.
- Epic 2 / #11 (profiles table + `is_admin` helper + auto-create trigger) - already landed.
- Epic 2 / #12 (RLS policies for profiles) - already landed. The "profiles: self or admin can update" policy is what enables this feature.

**Ticket acceptance criteria (AC):**
1. `/profile` accessible to authenticated users only.
2. Form shows current `display_name` and `locale` from `profiles`.
3. User can update `display_name` - saved via Supabase client.
4. User can change locale (EN or ZH) - saved to `profiles.locale`.
5. User can change password via `supabase.auth.updateUser({ password })`.
6. Success/error feedback shown after save.
7. Page uses cream background and design-token system.
8. Biome passes with no errors.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/validations/profile.ts` | Create | Zod schemas: `LOCALES`, `profileInfoSchema`, `passwordSchema`. Single source of truth for both form validations and the exported `Locale` type. |
| `lib/validations/profile.test.ts` | Create | Vitest unit tests for both schemas. All validation logic is verified here. |
| `app/(app)/profile/page.tsx` | Create | Server Component. Reads `auth.getUser()` and `profiles` row server-side. Renders page shell + `<ProfileInfoForm>` + `<PasswordForm>`. |
| `app/(app)/profile/profile-info-form.tsx` | Create | "use client". RHF form for `display_name` + `locale` with segmented control. Uses browser Supabase client for the update and calls `router.refresh()` on success. |
| `app/(app)/profile/password-form.tsx` | Create | "use client". RHF form for new password + confirm. Uses browser Supabase client to call `auth.updateUser({ password })`. |

**Files not touched:**
- `middleware.ts` - `/profile/*` is already in `PROTECTED_PATHS`.
- `lib/supabase/server.ts`, `lib/supabase/browser.ts` - reused as-is.
- `types/supabase.ts` - already has the `profiles` Row type from earlier migrations.
- `supabase/migrations/*` - RLS already allows self-update.
- `components/ui/*` - consuming existing shadcn primitives unchanged.
- `tailwind.config.ts`, `app/globals.css` - existing tokens (`bg-cream`, `text-charcoal`, `text-muted-gray`, `border-border`, `rounded-standard`, `rounded-card`) are sufficient.

**Design-token classes this plan relies on** (confirmed in `tailwind.config.ts` and `app/globals.css`):
- `bg-cream` (#f7f4ed) for backgrounds.
- `text-charcoal` (#1c1c1c) for primary text.
- `text-muted-gray` (#5f5f5d) for secondary labels.
- `border-border` (shadcn CSS var mapped to #eceae4) for card borders.
- `rounded-standard` (6px) for inputs, `rounded-card` (12px) for card containers.
- `border-destructive/30 bg-destructive/5 text-destructive` for error banner (matches `login-form.tsx`).
- `border-green-300/30 bg-green-50/50 text-green-700` for success banner (matches `login-form.tsx`).

---

## Task 1: Validation schemas (TDD)

**Files:**
- Create: `lib/validations/profile.ts`
- Create: `lib/validations/profile.test.ts`

- [ ] **Step 1: Write failing tests for `profileInfoSchema` and `passwordSchema`**

Create `lib/validations/profile.test.ts` with the full test body:

```ts
import { describe, expect, it } from "vitest";
import {
  LOCALES,
  type Locale,
  profileInfoSchema,
  passwordSchema,
} from "./profile";

describe("LOCALES", () => {
  it("contains exactly en and zh", () => {
    expect(LOCALES).toEqual(["en", "zh"]);
  });
});

describe("profileInfoSchema", () => {
  it("accepts a valid English profile", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "Alice",
      locale: "en",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alice");
      expect(result.data.locale).toBe("en");
    }
  });

  it("accepts a valid Chinese profile", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "B",
      locale: "zh",
    });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace on displayName", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "  Alice  ",
      locale: "en",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alice");
    }
  });

  it("rejects an empty displayName", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "",
      locale: "en",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Display name is required");
      expect(result.error.issues[0].path).toEqual(["displayName"]);
    }
  });

  it("rejects a whitespace-only displayName after trim", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "     ",
      locale: "en",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a displayName longer than 60 characters", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "a".repeat(61),
      locale: "en",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Display name must be 60 characters or fewer",
      );
    }
  });

  it("accepts a displayName of exactly 60 characters", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "a".repeat(60),
      locale: "en",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown locale", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "Alice",
      locale: "fr" as unknown as Locale,
    });
    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts matching 8-character passwords", () => {
    const result = passwordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a 7-character password", () => {
    const result = passwordSchema.safeParse({
      password: "abcd123",
      confirmPassword: "abcd123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Password must be at least 8 characters",
      );
      expect(result.error.issues[0].path).toEqual(["password"]);
    }
  });

  it("rejects mismatched confirmation with path confirmPassword", () => {
    const result = passwordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd1235",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "confirmPassword",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("Passwords do not match");
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail with an import error**

Run: `pnpm exec vitest run lib/validations/profile.test.ts`

Expected: FAIL with a module resolution error ("Cannot find module './profile'" or similar) because `lib/validations/profile.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/validations/profile.ts`**

Create `lib/validations/profile.ts` with the full schema body:

```ts
// lib/validations/profile.ts
// Import from zod/v3 so @hookform/resolvers' zodResolver Zod-v3 overload
// matches correctly, same pattern as lib/validations/auth.ts.
import { z } from "zod/v3";

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const profileInfoSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(60, "Display name must be 60 characters or fewer"),
  locale: z.enum(LOCALES, {
    errorMap: () => ({ message: "Please choose a language" }),
  }),
});

export const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ProfileInfoFormValues = z.infer<typeof profileInfoSchema>;
export type PasswordFormValues = z.infer<typeof passwordSchema>;
```

- [ ] **Step 4: Run the tests to verify all pass**

Run: `pnpm exec vitest run lib/validations/profile.test.ts`

Expected: 11 tests pass, 0 fail.

- [ ] **Step 5: Run Biome on the new files**

Run: `pnpm biome check --write lib/validations/profile.ts lib/validations/profile.test.ts`

Expected: No errors. If Biome reformats, re-run the tests once more to confirm they still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/validations/profile.ts lib/validations/profile.test.ts
git commit -m "$(cat <<'EOF'
feat(profile): add profile and password validation schemas (#15)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `ProfileInfoForm` client component

**Files:**
- Create: `app/(app)/profile/profile-info-form.tsx`

No new tests. This file is a thin wrapper around `profileInfoSchema`, RHF, and the Supabase browser client. Manual verification in Task 5 covers it.

- [ ] **Step 1: Create the file with the full component body**

Create `app/(app)/profile/profile-info-form.tsx`:

```tsx
// app/(app)/profile/profile-info-form.tsx
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
import { cn } from "@/lib/utils";
import {
  LOCALES,
  type Locale,
  type ProfileInfoFormValues,
  profileInfoSchema,
} from "@/lib/validations/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

type Props = {
  email: string;
  initialDisplayName: string;
  initialLocale: Locale;
};

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  // The zh label is the two-character native-script word for "Chinese text".
  // Written via \u escapes to keep this source file ASCII-clean.
  zh: "\u4e2d\u6587",
};

export function ProfileInfoForm({
  email,
  initialDisplayName,
  initialLocale,
}: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<ProfileInfoFormValues>({
    resolver: zodResolver(profileInfoSchema),
    defaultValues: {
      displayName: initialDisplayName,
      locale: initialLocale,
    },
  });

  async function onSubmit(values: ProfileInfoFormValues) {
    setServerError(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setServerError("Session expired. Please sign in again.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: values.displayName,
        locale: values.locale,
      })
      .eq("id", user.id);

    if (error) {
      setServerError(error.message);
      return;
    }

    setSuccessMessage("Profile saved");
    form.reset(values);
    router.refresh();
  }

  const { isDirty, isSubmitting } = form.formState;

  return (
    <section className="rounded-card border border-border bg-cream p-6">
      <h2 className="text-lg font-semibold text-charcoal mb-4">Profile</h2>

      {successMessage && (
        <output className="block mb-4 rounded-standard border border-green-300/30 bg-green-50/50 px-3 py-2.5 text-sm text-green-700">
          {successMessage}
        </output>
      )}
      {serverError && (
        <div
          role="alert"
          className="mb-4 rounded-standard border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      <div className="mb-4">
        <p className="text-sm font-medium text-charcoal mb-1">Email</p>
        <p className="text-sm text-muted-gray">{email}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display name</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="name"
                    maxLength={60}
                    placeholder="How you'd like to be addressed"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="locale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Language</FormLabel>
                <FormControl>
                  <div
                    role="radiogroup"
                    aria-label="Language"
                    className="inline-flex rounded-standard border border-border bg-cream p-1"
                  >
                    {LOCALES.map((code) => (
                      <button
                        key={code}
                        type="button"
                        role="radio"
                        aria-checked={field.value === code}
                        onClick={() => field.onChange(code)}
                        className={cn(
                          "px-4 py-1.5 text-sm rounded-standard transition-colors",
                          field.value === code
                            ? "bg-charcoal text-off-white"
                            : "text-muted-gray hover:text-charcoal",
                        )}
                      >
                        {LOCALE_LABEL[code]}
                      </button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="default"
            className="mt-2"
            disabled={!isDirty || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </Form>
    </section>
  );
}
```

- [ ] **Step 2: Run Biome on the new file**

Run: `pnpm biome check --write "app/(app)/profile/profile-info-form.tsx"`

Expected: No errors.

- [ ] **Step 3: TypeScript smoke check by running the existing tests**

Run: `pnpm exec vitest run lib/validations/profile.test.ts`

Expected: Still 11 passing. This catches any accidental type break in `profile.ts` while adding the component.

(Note: there is no component-level test. The file is still unreachable from the app until Task 4 wires it in - that is fine. This step only confirms the schema import chain still type-checks.)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/profile/profile-info-form.tsx"
git commit -m "$(cat <<'EOF'
feat(profile): add ProfileInfoForm client component (#15)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `PasswordForm` client component

**Files:**
- Create: `app/(app)/profile/password-form.tsx`

- [ ] **Step 1: Create the file with the full component body**

Create `app/(app)/profile/password-form.tsx`:

```tsx
// app/(app)/profile/password-form.tsx
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
  type PasswordFormValues,
  passwordSchema,
} from "@/lib/validations/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

export function PasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(values: PasswordFormValues) {
    setServerError(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    setSuccessMessage("Password updated");
    form.reset();
  }

  const { isSubmitting } = form.formState;

  return (
    <section className="rounded-card border border-border bg-cream p-6">
      <h2 className="text-lg font-semibold text-charcoal mb-4">
        Change password
      </h2>

      {successMessage && (
        <output className="block mb-4 rounded-standard border border-green-300/30 bg-green-50/50 px-3 py-2.5 text-sm text-green-700">
          {successMessage}
        </output>
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
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
                    autoComplete="new-password"
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
            className="mt-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Updating..." : "Update password"}
          </Button>
        </form>
      </Form>
    </section>
  );
}
```

- [ ] **Step 2: Run Biome on the new file**

Run: `pnpm biome check --write "app/(app)/profile/password-form.tsx"`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/profile/password-form.tsx"
git commit -m "$(cat <<'EOF'
feat(profile): add PasswordForm client component (#15)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `ProfilePage` server component

**Files:**
- Create: `app/(app)/profile/page.tsx`

- [ ] **Step 1: Create the file with the full Server Component body**

Create `app/(app)/profile/page.tsx`:

```tsx
// app/(app)/profile/page.tsx
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/validations/profile";
import { PasswordForm } from "./password-form";
import { ProfileInfoForm } from "./profile-info-form";

export default async function ProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware guarantees an authenticated user before this page renders,
  // so `user` is always present. Narrow for TS and bail defensively.
  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, locale")
    .eq("id", user.id)
    .single();

  const initialDisplayName = profile?.display_name ?? "";
  const initialLocale: Locale =
    profile?.locale === "zh" || profile?.locale === "en"
      ? profile.locale
      : "en";

  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-xl space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-gray mb-3">
            Cervix Health
          </p>
          <h1 className="text-[28px] font-semibold text-charcoal tracking-[-0.5px]">
            Profile settings
          </h1>
        </header>

        <ProfileInfoForm
          email={user.email ?? ""}
          initialDisplayName={initialDisplayName}
          initialLocale={initialLocale}
        />

        <PasswordForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run Biome on the new file**

Run: `pnpm biome check --write "app/(app)/profile/page.tsx"`

Expected: No errors.

- [ ] **Step 3: Type-check the whole project**

Run: `pnpm exec tsc --noEmit`

Expected: No errors. If `@/lib/validations/profile` type imports fail, fix the import path in `profile-info-form.tsx` or `page.tsx`.

(If the project does not have `tsc` installed directly, run `pnpm exec next build` instead and confirm it type-checks during build. Either one is acceptable for this step.)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/profile/page.tsx"
git commit -m "$(cat <<'EOF'
feat(profile): add profile page server component wiring (#15)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Manual verification

**Files:** None modified. This task is a verification gate.

- [ ] **Step 1: Run the full Vitest suite**

Run: `pnpm test`

Expected: All existing tests pass, including the new `lib/validations/profile.test.ts`.

- [ ] **Step 2: Run Biome across the whole repo**

Run: `pnpm biome check .`

Expected: No errors.

- [ ] **Step 3: Start the local Supabase stack (if not already running)**

Run: `supabase start`

Expected: All containers healthy. If Docker is not running, start Docker Desktop first.

- [ ] **Step 4: Start the dev server**

Run: `pnpm dev`

Expected: Next.js starts on `http://localhost:3000`. Leave it running for the next steps.

- [ ] **Step 5: Smoke test in the browser**

Navigate to `http://localhost:3000/login` and sign in as an existing test user (or register a new one if the local DB is fresh).

After login, navigate to `http://localhost:3000/profile`.

Verify each of the following:
1. The page renders with a cream background, `Profile settings` header, and two cards stacked vertically.
2. The Profile card shows the user's `email` as a read-only row.
3. The Profile card's `display_name` field is pre-filled with the current value.
4. The Language segmented control shows the current locale selected (EN or ZH).
5. The Save button is disabled until any field is modified.
6. Change `display_name` to a new non-empty value, click Save. Success banner appears, button returns to disabled.
7. Hard-reload the page. The new `display_name` is still there (persisted + refreshed).
8. Toggle the Language segmented control to the other locale, click Save. Success banner appears.
9. Hard-reload. The new locale is still selected.
10. Clear `display_name`, tab out. The form shows `Display name is required` and Save remains disabled.
11. In the Password card, enter `abc12345` / `abc12345`. Click Update password. Success banner `Password updated` appears and both password fields clear.
12. Sign out (use any existing sign-out path, or clear cookies), navigate to `/login`, sign back in with the new password. Login succeeds.
13. In the Password card, enter `abc12345` / `differnt1`. Submit. Inline field error `Passwords do not match` appears under `Confirm new password`.
14. In the Password card, enter a 7-character password. Submit. Inline field error `Password must be at least 8 characters` appears.
15. Open a second browser profile (or an incognito window). Sign in as a different test user. Navigate to `/profile`. The display_name and locale shown are the second user's, not the first (confirms RLS self-scoping).

- [ ] **Step 6: Confirm nothing about the `profiles` table was accidentally exposed**

In the first browser tab, open DevTools -> Network. Reload `/profile`. Verify no network request to the Supabase REST endpoint returns a row for anyone other than the signed-in user. (The only request to `/rest/v1/profiles` should be the single-user `select` with a `id=eq.<uuid>` filter.)

- [ ] **Step 7: Stop the dev server**

Stop `pnpm dev` (Ctrl-C in its terminal).

- [ ] **Step 8: No-code commit to mark verification complete (optional)**

This step is only to create a recorded checkpoint if the reviewer wants it. If the manual verification produced no code changes, skip this step.

If the reviewer asked for a "done" marker, add one to the PR description instead of an empty commit.

---

## Post-implementation: PR

Once all five tasks are green and committed, open a pull request targeting `main`:

```bash
gh pr create --title "feat(profile): user profile edit page (#15)" --body "$(cat <<'EOF'
## Summary
- Add `/profile` with read-only email, editable display name, EN/ZH segmented locale, and password change.
- Add Zod schemas in `lib/validations/profile.ts` with Vitest coverage.
- Two independent save flows via the browser Supabase client; RLS already enforces self-scope.

Closes #15.

## Test plan
- [ ] Vitest: `pnpm test` passes
- [ ] Biome: `pnpm biome check .` passes
- [ ] Smoke test: manual verification in Task 5 of the plan completed

Plan: `docs/superpowers/plans/2026-04-14-epic2-profile-edit-page.md`
Spec: `docs/superpowers/specs/2026-04-14-epic2-profile-edit-design.md`
EOF
)"
```

---

## AC Mapping (self-review)

| AC | Task covering it |
|---|---|
| 1. `/profile` gated to authenticated | Already covered by `middleware.ts`. Task 4 puts the page under `app/(app)/profile/`, which matches `PROTECTED_PATHS`. |
| 2. Form shows current `display_name` and locale | Task 4 server-side fetch; Task 2 `defaultValues` from props. |
| 3. Update `display_name` via Supabase client | Task 2 `onSubmit` calls `.from('profiles').update(...)`. |
| 4. Change locale (EN/ZH) | Task 2 segmented control writes to `locale`. |
| 5. Change password via `auth.updateUser` | Task 3 `onSubmit` calls `supabase.auth.updateUser({ password })`. |
| 6. Success/error feedback | Tasks 2 and 3 render `<output>` success and `<div role="alert">` error banners. |
| 7. Cream background + design tokens | Task 4 `bg-cream` shell; Tasks 2 and 3 card styling. |
| 8. Biome passes | Every task ends with `pnpm biome check --write` on the touched files; Task 5 runs `pnpm biome check .` across the repo. |
