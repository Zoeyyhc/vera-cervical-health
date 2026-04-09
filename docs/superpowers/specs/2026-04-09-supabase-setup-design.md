# Supabase Project Setup + Local Docker Stack — Design

**Epic:** 1  
**Date:** 2026-04-09  
**Status:** Approved

---

## Goal

Set up the Supabase project for both local development (via Docker) and the hosted cloud environment. Initialise the Supabase CLI, create the local stack, and wire up the two client helpers (`server.ts` and `browser.ts`) used throughout the app.

---

## Acceptance Criteria

- `supabase init` run and `supabase/` directory committed (config.toml, migrations/, seed.sql)
- `supabase start` brings up the full local stack (Postgres, Auth, Storage, Studio) without errors
- `lib/supabase/server.ts` exports a server-side Supabase client (using `createServerClient` from `@supabase/ssr`)
- `lib/supabase/browser.ts` exports a browser-side Supabase client (using `createBrowserClient` from `@supabase/ssr`)
- Both clients read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env
- Supabase Studio accessible at `http://localhost:54323` when stack is running
- `.env.example` already has correct placeholders (no change needed)
- `supabase stop` cleanly tears down the stack

---

## Approach

Full end-to-end setup: install CLI via Homebrew, install JS packages via pnpm, run `supabase init`, scaffold client helpers, verify stack starts and stops cleanly, commit everything.

---

## Step-by-Step Design

### 1. CLI & Package Installation

**Supabase CLI:**
```bash
brew install supabase/tap/supabase
```
Adds the global `supabase` binary required for all local dev commands.

**JS packages:**
```bash
pnpm add @supabase/supabase-js @supabase/ssr
```
- `@supabase/ssr` — provides `createServerClient` / `createBrowserClient` for Next.js App Router
- `@supabase/supabase-js` — underlying client library

### 2. Supabase Init

```bash
supabase init
```

Generates the following in the project root:

```
supabase/
├── config.toml        # Local stack config (default ports)
├── migrations/        # Empty — schema migrations added in later epics
└── seed.sql           # Empty — dev seed data added later
```

Default ports used (matching CLAUDE.md expectations):
- Postgres: 54322
- API: 54321  
- Studio: 54323

### 3. Client Helpers

**`lib/supabase/server.ts`**

Used in Server Components, Route Handlers, and Server Actions. Reads/writes cookies via Next.js `cookies()`.

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — safe to ignore
          }
        },
      },
    }
  )
}
```

**`lib/supabase/browser.ts`**

Used in Client Components. No cookie handling required — the browser manages cookies natively.

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

Both files use named exports (`createClient`), consistent with CLAUDE.md conventions.

**Note on `Database` type:** A placeholder `types/supabase.ts` will export an empty `Database = {}` type until auto-generation is set up in a later epic.

### 4. Verification

```bash
supabase start   # confirm stack comes up, Studio at http://localhost:54323
supabase stop    # confirm clean teardown
```

### 5. Commit

Stage and commit:
- `supabase/config.toml`
- `supabase/migrations/` (empty dir — add `.gitkeep`)
- `supabase/seed.sql`
- `lib/supabase/server.ts`
- `lib/supabase/browser.ts`
- `types/supabase.ts` (placeholder)
- `package.json` + `pnpm-lock.yaml`

---

## Constraints

- Do not commit `.env.local`
- Cloud project created separately at supabase.com — credentials stored in `.env.local` only
- No schema migrations in this epic — that is Epic 2+
- Do not bypass RLS with service role key in non-admin routes (no service role usage in this epic)
