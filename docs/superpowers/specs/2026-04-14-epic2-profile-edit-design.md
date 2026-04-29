# Epic 2 - User Profile Edit Page

**Date:** 2026-04-14
**Issue:** Epic 2 / #15 / User Profile Edit Page

---

## Scope

Build a profile settings page at `/profile` where authenticated users can update their `display_name`, `locale` preference, and password.

**In scope:**
- Display the signed-in user's email (read-only).
- Edit `display_name` and `locale` via a Profile card with its own Save button.
- Change password via a separate Password card with its own Save button.
- Success and error feedback on each card independently.
- Zod-validated forms, RHF submission, browser Supabase client for mutations.
- Design-token-compliant layout (cream background, charcoal text, existing card/border styles).
- Vitest unit tests for the new validation schemas.

**Out of scope:**
- Avatar upload / profile picture.
- Email change (requires a confirmation flow).
- Account deletion.
- Immediate UI language switch on locale change. Epic 8 owns the i18n wiring; this ticket only stores the preference.
- Requiring the user's current password before setting a new one (matches the existing `reset-password-form.tsx` flow).
- Playwright E2E specs. Manual verification only, consistent with the testing strategy in memory.

---

## File Structure

```
app/(app)/profile/
    page.tsx                  Server Component: loads profile, renders both forms
    profile-info-form.tsx     "use client": display_name + locale (EN/ZH segmented)
    password-form.tsx         "use client": new password + confirm

lib/validations/
    profile.ts                Zod: profileInfoSchema, passwordSchema (+ inferred types)
    profile.test.ts           Vitest unit tests for the schemas
```

**Existing files that already satisfy requirements (untouched):**
- `middleware.ts` already protects `/profile/*` via `PROTECTED_PATHS`.
- `lib/supabase/server.ts` used for the server-side profile read.
- `lib/supabase/browser.ts` used for all client-side mutations.
- `types/supabase.ts` already contains the `profiles` Row type.
- `supabase/migrations/20260413143757_rls_policies.sql` RLS already allows self-update on `profiles`.
- `components/ui/{form,input,button,label}.tsx` existing shadcn primitives, no new ones needed.

---

## Architecture

### Component tree

```
ProfilePage (Server Component)
  Page shell (<main> with cream bg, centered max-w-xl column, <h1>)
  <ProfileInfoForm email={...} initialDisplayName={...} initialLocale={...} />
    Card
      <h2>Profile</h2>
      Success / error banner slot
      Read-only email row
      RHF <FormField name="displayName"> -> <Input>
      RHF <FormField name="locale"> -> Segmented control (button radiogroup)
      <Button type="submit">Save</Button>
  <PasswordForm />
    Card
      <h2>Change password</h2>
      Success / error banner slot
      RHF <FormField name="password"> -> <Input type="password">
      RHF <FormField name="confirmPassword"> -> <Input type="password">
      <Button type="submit">Update password</Button>
```

### Data flow: initial load

1. `page.tsx` calls `createClient()` from `lib/supabase/server.ts`.
2. `const { data: { user } } = await supabase.auth.getUser()`. Middleware has already redirected unauthenticated requests, but we still read `user` to get `id` and `email`. TypeScript narrowing guards an unreachable `null` branch.
3. `const { data: profile } = await supabase.from('profiles').select('display_name, locale').eq('id', user.id).single()`.
4. If `profile` is null (network blip or RLS misconfiguration), render the forms with defaults `displayName: ""` and `locale: "en"`. The Profile form submit stays blocked by the Zod `min(1)` rule until the user types a name. No error banner on server load. Graceful degradation.
5. Pass `email`, `initialDisplayName`, `initialLocale` as props to `<ProfileInfoForm>`. Render `<PasswordForm>` with no props.

### Data flow: profile save

1. Client `ProfileInfoForm` uses RHF + `zodResolver(profileInfoSchema)` with `defaultValues` from props.
2. Submit button is disabled when `!form.formState.isDirty || form.formState.isSubmitting`.
3. On submit, handler:
   - Clears `serverError` state.
   - Creates a browser Supabase client via `createClient()` from `lib/supabase/browser.ts`.
   - Reads `user.id` via `await supabase.auth.getUser()` (cheap cookie read).
   - Calls `supabase.from('profiles').update({ display_name: values.displayName, locale: values.locale }).eq('id', user.id)`. `displayName` is already trimmed by Zod.
   - On error: `setServerError(error.message)` and return.
   - On success: set `successMessage("Profile saved")`, call `router.refresh()` so the Server Component re-pulls the row and `defaultValues` stay in sync, then `form.reset(values)` so `isDirty` flips back to false.

### Data flow: password save

1. Client `PasswordForm` uses RHF + `zodResolver(passwordSchema)` with `defaultValues: { password: "", confirmPassword: "" }`.
2. On submit, handler:
   - Clears `serverError` state.
   - Calls `supabase.auth.updateUser({ password: values.password })` from the browser client.
   - On error: `setServerError(error.message)` and return. Password fields stay populated so the user can retry without re-typing.
   - On success: set `successMessage("Password updated")` and call `form.reset()` to clear both fields so no stale password sits in the DOM.

---

## Validation Schemas (`lib/validations/profile.ts`)

```ts
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

**Notes:**
- `zod/v3` sub-path matches the existing `lib/validations/auth.ts` convention so `@hookform/resolvers`' v3 overload resolves.
- `LOCALES` is exported as a single source of truth. The segmented control iterates over it to render the two pills; no hardcoded locale list in the component.
- `passwordSchema` is a near-duplicate of `resetPasswordSchema` in `lib/validations/auth.ts`. Kept separate so a future policy divergence in one flow does not accidentally break the other.
- `.trim()` on `displayName` runs in Zod, so the value handed to Supabase is already trimmed.

---

## Component Details

### `app/(app)/profile/page.tsx` (Server Component)

- Async default export.
- Calls `createClient()` from `lib/supabase/server.ts`.
- Reads `user` and `profile` as described in the data flow.
- Renders a `<main>` with cream background, `max-w-xl` centered column, vertical spacing between header and the two cards.
- Header: small uppercase eyebrow ("Cervix Health") + `<h1>` "Profile settings", matching the typography in `login-form.tsx`.
- Passes props and renders both client forms.

### `profile-info-form.tsx`

- `"use client"`.
- Props: `email: string`, `initialDisplayName: string`, `initialLocale: "en" | "zh"`.
- RHF form, `zodResolver(profileInfoSchema)`.
- Card container styled as `rounded-standard border border-warm bg-cream p-6` (exact tokens confirmed via `docs/design-tokens.md` during implementation. If the token names differ, use the values from that file).
- Inside the card:
  1. `<h2 className="text-lg font-semibold text-charcoal mb-4">Profile</h2>`
  2. Success `<output>` slot (shown only when `successMessage` is set).
  3. Error `<div role="alert">` slot (shown only when `serverError` is set).
  4. Read-only email row: `<FormLabel>Email</FormLabel>` above a `<p className="text-sm text-charcoal">{email}</p>`. No input, no edit affordance.
  5. `<FormField name="displayName">` -> `<Input type="text" autoComplete="name" maxLength={60}>`.
  6. `<FormField name="locale">` -> segmented control, rendered via RHF's field `value` / `onChange`:
     ```tsx
     <div role="radiogroup" aria-label="Language" className="inline-flex rounded-standard border border-warm bg-cream p-1">
       {LOCALES.map((code) => (
         <button
           key={code}
           type="button"
           role="radio"
           aria-checked={field.value === code}
           onClick={() => field.onChange(code)}
           className={cn(
             "px-4 py-1.5 text-sm rounded-[calc(var(--radius-standard)-4px)] transition-colors",
             field.value === code
               ? "bg-charcoal text-cream"
               : "text-charcoal/70 hover:text-charcoal",
           )}
         >
           {code === "en" ? "English" : "Chinese"}
         </button>
       ))}
     </div>
     ```
     Note: the Chinese button label in the spec shows "Chinese" to stay ASCII-only. In the actual JSX, the label for `zh` should display the native-script word for Chinese (two Han characters meaning "Chinese text"). Store that literal string in the component when implementing.
  7. `<Button type="submit" disabled={!isDirty || isSubmitting}>` with label "Save" / "Saving".

### `password-form.tsx`

- `"use client"`, no props.
- Same card container style as `ProfileInfoForm`.
- `<h2>Change password</h2>`.
- Success / error banner slots identical to the profile card.
- Two `<Input type="password" autoComplete="new-password">` for `password` and `confirmPassword`, each wrapped in a `<FormField>`.
- `<Button type="submit" disabled={isSubmitting}>` with label "Update password" / "Updating".

---

## Error Handling

**Profile load (`page.tsx`):**
- Middleware guarantees authentication, so `getUser()` returning `null` is unreachable. A `return null` guard is present for TS narrowing only.
- If `profile` query fails or returns `null`, render forms with empty / default values. The submit button stays disabled until the user fills in a valid display name. No server-rendered error banner.

**Profile save (`profile-info-form.tsx`):**
- Zod-level rejections are blocked by RHF before the submit handler runs; only Supabase errors reach the handler.
- Supabase errors (network, RLS reject) surface as `<div role="alert">` with `error.message`.
- `setServerError(null)` at the top of every submit so a stale error clears on retry.
- No optimistic update. The handler `await`s the mutation before flipping UI state.
- On success, `router.refresh()` re-pulls the server component so the form's `defaultValues` no longer lie.

**Password save (`password-form.tsx`):**
- Supabase errors (weak password, expired session, rate limit) surface in the same banner pattern.
- On error, password fields stay populated so the user can retry without re-typing.
- On success, `form.reset()` clears both fields so no stale password lingers in the DOM.

**Shared patterns (matching `login-form.tsx` and `reset-password-form.tsx`):**
- `<output>` for success messages (avoids `role="alert"` noise).
- `<div role="alert">` for errors.
- Submit button disabled during `isSubmitting` to prevent double-submit.

---

## Testing

### Unit tests: `lib/validations/profile.test.ts` (Vitest)

**`profileInfoSchema`:**
- Accepts `{ displayName: "Alice", locale: "en" }`.
- Accepts `{ displayName: "B", locale: "zh" }` (min 1 boundary).
- Rejects empty `displayName`.
- Rejects whitespace-only `displayName` (trim produces "").
- Rejects `displayName` of length 61.
- Rejects `locale: "fr"` (not in enum).
- Trims `"  Alice  "` to `"Alice"` in the parsed output.

**`passwordSchema`:**
- Accepts matching 8-character passwords.
- Rejects 7-character password with the "at least 8 characters" message.
- Rejects mismatched confirmation; the error path must be `["confirmPassword"]` so RHF wires it to the right field.

### No component-level Vitest

The two form components are thin RHF wrappers around the schemas above and the Supabase browser client. Testing them would require mocking Supabase, which is brittle and does not verify real behavior. The schemas carry the logic worth isolating; the forms are covered by manual verification.

### Manual verification (before marking the ticket complete)

1. `pnpm dev`, sign in, navigate to `/profile`.
2. Verify read-only email displays correctly; `display_name` and locale match the DB.
3. Change `display_name`, click Save, success banner, reload, value persisted.
4. Toggle locale EN vs ZH, Save, reload, value persisted.
5. Clear `display_name`, submit is disabled (or shows validation error).
6. Change password to matching 8+ char values, success banner, fields clear, sign out, sign in with the new password.
7. Mismatched passwords show inline error on `confirmPassword`.
8. Sign in as a second user in a different browser, confirm they see their own profile, not user 1's (RLS sanity check).
9. `pnpm biome check .` passes with zero errors.
10. `pnpm exec vitest run lib/validations/profile.test.ts` passes.

---

## Design Tokens and Styling

- Background: cream (existing `bg-cream` token). Never pure white.
- Text: charcoal (`text-charcoal`).
- Borders: warm (`border-warm`).
- Border radius: `rounded-standard` (matches auth forms).
- Typography: Camera Plain Variable via existing `<h1>` / `<h2>` classes; max weight 600 (no `font-bold`).
- Segmented-control active state uses `bg-charcoal text-cream`; inactive uses `text-charcoal/70`.
- Success banner: soft green background (`border-green-300/30 bg-green-50/50 text-green-700`), matching `login-form.tsx`.
- Error banner: `border-destructive/30 bg-destructive/5 text-destructive`, matching `login-form.tsx`.

Exact token class names will be verified against `docs/design-tokens.md` during implementation. If any token name differs, the implementation will use whatever the tokens doc defines. This spec names them for illustrative consistency with existing auth forms.

---

## Acceptance Criteria Mapping

| Ticket AC | Covered by |
|---|---|
| `/profile` accessible to authenticated users only | `middleware.ts` already gates `PROTECTED_PATHS` including `/profile` |
| Form displays current `display_name` and locale | `page.tsx` server-side read, props, RHF `defaultValues` |
| User can update `display_name` via Supabase client | `profile-info-form.tsx` submit handler calls `.from('profiles').update(...)` |
| User can change locale (EN / ZH) | Same submit handler writes `locale` column |
| User can change password via `supabase.auth.updateUser` | `password-form.tsx` submit handler |
| Success/error feedback after save | `<output>` success and `<div role="alert">` error banners on each card |
| Cream background + design tokens | Server component shell + card containers |
| Biome passes | Verified via `pnpm biome check .` as the last step |

---

## Risks and Open Questions

**None blocking.** All ticket ambiguities were resolved during brainstorming:
- Two cards, not one form.
- No current-password requirement on password change.
- Segmented control for locale, not a `<select>`.
- `display_name` required, min 1, max 60, trimmed.
- Email shown read-only at the top of the Profile card.
- No immediate UI language switch on locale change.
- Vitest for validation only; manual verification for UI.
