# Supabase Project Setup + Local Docker Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the Supabase CLI and JS packages, initialise the local stack, and create the two Supabase client helpers used throughout the app.

**Architecture:** The Supabase CLI manages the local Docker-based stack (Postgres, Auth, Storage, Studio). Two thin client helper files — `lib/supabase/server.ts` and `lib/supabase/browser.ts` — wrap `@supabase/ssr` and read env vars; all app code imports from these helpers rather than calling `@supabase/ssr` directly.

**Tech Stack:** Supabase CLI (Homebrew), `@supabase/supabase-js`, `@supabase/ssr`, Next.js 14 App Router, TypeScript strict mode.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/config.toml` | Create (via CLI) | Local stack config — ports, auth settings |
| `supabase/migrations/.gitkeep` | Create | Tracks empty migrations dir in git |
| `supabase/seed.sql` | Create (via CLI) | Dev seed data placeholder |
| `types/supabase.ts` | Create | Placeholder Database type — replaced by codegen later |
| `lib/supabase/server.ts` | Create | Server-side Supabase client (Server Components, Route Handlers) |
| `lib/supabase/browser.ts` | Create | Browser-side Supabase client (Client Components) |
| `package.json` | Modify | Add `@supabase/supabase-js` and `@supabase/ssr` |
| `pnpm-lock.yaml` | Modify | Updated lockfile |

---

## Task 1: Install Supabase CLI

**Files:** none (system install)

- [ ] **Step 1: Install via Homebrew**

```bash
brew install supabase/tap/supabase
```

This taps the official Supabase Homebrew formula and installs the `supabase` binary globally. Expect ~1-2 minutes to download and install.

- [ ] **Step 2: Verify the CLI is available**

```bash
supabase --version
```

Expected output: a version string like `2.x.x`. If this fails, run `brew doctor` to diagnose Homebrew issues.

---

## Task 2: Install JS Packages

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add Supabase packages**

Run from the project root (`/Users/Najum/cervix-assistant`):

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- `@supabase/supabase-js` — core Supabase client
- `@supabase/ssr` — Next.js App Router helpers (`createServerClient`, `createBrowserClient`)

- [ ] **Step 2: Verify packages appear in package.json**

```bash
grep supabase package.json
```

Expected output should include both:
```
"@supabase/ssr": "^x.x.x",
"@supabase/supabase-js": "^x.x.x",
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @supabase/supabase-js and @supabase/ssr packages"
```

---

## Task 3: Initialise Supabase Project

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/.gitkeep`
- Create: `supabase/seed.sql`

- [ ] **Step 1: Run supabase init**

Run from the project root:

```bash
supabase init
```

If prompted "Generate VS Code settings for Deno?" — press Enter to accept the default (N). The command generates `supabase/config.toml` and `supabase/seed.sql`. The `supabase/migrations/` directory may or may not be created depending on CLI version.

- [ ] **Step 2: Verify config.toml was created**

```bash
cat supabase/config.toml | head -20
```

Expected: a TOML file starting with `[api]`, `[db]`, `[studio]` sections and default ports (54321, 54322, 54323).

- [ ] **Step 3: Create migrations directory with .gitkeep**

The migrations/ dir needs to exist in git even when empty:

```bash
mkdir -p supabase/migrations && touch supabase/migrations/.gitkeep
```

- [ ] **Step 4: Verify seed.sql exists**

```bash
ls supabase/
```

Expected output: `config.toml  migrations  seed.sql`

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/migrations/.gitkeep supabase/seed.sql
git commit -m "chore: initialise Supabase project with CLI"
```

---

## Task 4: Create Database Type Placeholder

**Files:**
- Create: `types/supabase.ts`

- [ ] **Step 1: Create the placeholder type file**

Create `/Users/Najum/cervix-assistant/types/supabase.ts` with this content:

```ts
// Placeholder — replace with output of: pnpm supabase gen types typescript --local
// This will be auto-generated once the schema is defined in Epic 2+
export type Database = Record<string, unknown>
```

- [ ] **Step 2: Commit**

```bash
git add types/supabase.ts
git commit -m "chore: add placeholder Database type for Supabase client generics"
```

---

## Task 5: Create Server-Side Client Helper

**Files:**
- Create: `lib/supabase/server.ts`

- [ ] **Step 1: Create the lib/supabase directory and server.ts**

Create `/Users/Najum/cervix-assistant/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookie mutation is a no-op, safe to ignore
          }
        },
      },
    }
  );
}
```

**Why the try/catch in setAll:** Server Components can call `getAll` to read cookies but cannot mutate them — `set` would throw. The try/catch silences that error so the same helper works in both Server Components (read-only) and Route Handlers / Server Actions (read-write).

- [ ] **Step 2: Run Biome to check formatting**

```bash
pnpm biome check lib/supabase/server.ts
```

Expected: no errors. If any formatting issues appear, run:

```bash
pnpm biome check --write lib/supabase/server.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/server.ts
git commit -m "feat: add server-side Supabase client helper"
```

---

## Task 6: Create Browser-Side Client Helper

**Files:**
- Create: `lib/supabase/browser.ts`

- [ ] **Step 1: Create browser.ts**

Create `/Users/Najum/cervix-assistant/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Why no cookie handling here:** The browser natively manages cookies and `createBrowserClient` handles auth token storage automatically. No manual cookie plumbing needed.

- [ ] **Step 2: Run Biome to check formatting**

```bash
pnpm biome check lib/supabase/browser.ts
```

Expected: no errors. If any formatting issues appear, run:

```bash
pnpm biome check --write lib/supabase/browser.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/browser.ts
git commit -m "feat: add browser-side Supabase client helper"
```

---

## Task 7: Verify Local Stack

**Files:** none

- [ ] **Step 1: Start the local Supabase stack**

```bash
supabase start
```

This pulls Docker images on first run — expect 2-5 minutes. Subsequent runs are faster. Expected output ends with a table showing service URLs:

```
API URL: http://127.0.0.1:54321
GraphQL URL: http://127.0.0.1:54321/graphql/v1
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
...
```

If `supabase start` fails with a Docker error, confirm Docker Desktop is running: open Docker Desktop and wait for it to show "Running".

- [ ] **Step 2: Confirm Studio is accessible**

Open `http://localhost:54323` in a browser. Expected: the Supabase Studio UI loads (Table Editor, Auth, Storage tabs visible).

- [ ] **Step 3: Stop the local stack**

```bash
supabase stop
```

Expected output: `Stopped supabase local development setup.` with no errors.

- [ ] **Step 4: Confirm all acceptance criteria are met**

Run through this checklist:
- `supabase/config.toml` exists and is committed
- `supabase/migrations/.gitkeep` exists and is committed
- `supabase/seed.sql` exists and is committed
- `lib/supabase/server.ts` exports `createClient` using `createServerClient`
- `lib/supabase/browser.ts` exports `createClient` using `createBrowserClient`
- `types/supabase.ts` exports `Database` type
- `package.json` includes `@supabase/supabase-js` and `@supabase/ssr`
- `.env.example` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already present — no change needed)
- Stack starts and Studio opens at `http://localhost:54323`
- Stack stops cleanly with `supabase stop`
