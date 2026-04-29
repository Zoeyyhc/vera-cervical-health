# Epic 2 — Profiles Table + Auto-Create Trigger on Signup

**Issue:** [#11](https://github.com/Zoeyyhc/cervix-assistant/issues/11)
**Date:** 2026-04-13
**Status:** Design approved, pending implementation plan

---

## Summary

Bring the `public.profiles` table and `handle_new_user` trigger up to the Epic 2 spec by adding two columns — `display_name` and `updated_at` — and wiring `handle_new_user` to populate `display_name` from `auth.users.raw_user_meta_data` when present. Add a `BEFORE UPDATE` trigger so `updated_at` advances automatically.

This is a DB-only ticket. No app code (including `register-form.tsx`) changes.

## Context

The `profiles` table and a basic `handle_new_user` trigger already exist in `supabase/migrations/20260409165311_enable_pgvector_and_create_profiles.sql` from Epic 1. Current columns: `id`, `email`, `role`, `full_name`, `avatar_url`, `locale`, `created_at`. Missing per issue #11: `display_name`, `updated_at`.

Per the updated `CLAUDE.md` convention (2026-04-13), migrations may be edited freely during local development. This design edits the existing Epic 1 migration file in place rather than adding a new numbered migration. Re-application happens via `supabase db reset`.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Edit the existing Epic 1 migration file rather than creating a new one | Solo dev, local-only DB. Keeps history clean. Matches updated CLAUDE.md rule. |
| 2 | Additive: keep `full_name` and `avatar_url`, add `display_name` and `updated_at` | Non-destructive. Epic 1 columns stay available for future use. |
| 3 | `display_name` is nullable, no default | No meaningful default exists. User sets it later via profile UI. |
| 4 | `handle_new_user` reads `raw_user_meta_data->>'display_name'` (via `nullif` to coerce empty strings to null) | Forward-compatible with a future register-form change that sends metadata. Costs nothing today — resolves to null since no caller sends it yet. |
| 5 | `updated_at` driven by a `BEFORE UPDATE` trigger, not app code | Automatic, uniform across every write path (SQL, RPC, client SDK). |
| 6 | `handle_profile_updated_at` is NOT `SECURITY DEFINER` | Row-local mutation; no cross-role writes needed. Least privilege. |
| 7 | No changes to `register-form.tsx` | Ticket is explicitly DB-only. A follow-up ticket will own the form change because it has its own UX decisions (required? min length? shown on login page?). |
| 8 | No backfill for existing rows | Dev DB only; `supabase db reset` wipes and re-applies. |
| 9 | No RLS policy changes | Existing row-level policies (`profiles: self or admin can select/update`) cover the new columns automatically. |

## Schema — final state of `public.profiles`

```sql
id           uuid primary key references auth.users(id) on delete cascade
email        text
role         text check (role in ('guest','user','admin')) default 'user'
full_name    text                          -- kept from Epic 1
avatar_url   text                          -- kept from Epic 1
display_name text                          -- NEW, nullable
locale       text default 'en'
created_at   timestamptz default now()
updated_at   timestamptz default now()     -- NEW
```

## Migration changes

All changes live in `supabase/migrations/20260409165311_enable_pgvector_and_create_profiles.sql`.

### 1. Add `display_name` and `updated_at` columns

```sql
alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists updated_at timestamptz default now();
```

Using `if not exists` keeps the migration idempotent on partial re-runs.

### 2. Update `handle_new_user` function body

```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer
   set search_path = '';
```

Stays `SECURITY DEFINER` + `search_path = ''`. The existing `on_auth_user_created` trigger on `auth.users` does not need to be re-created — `create or replace function` swaps the body in place.

### 3. Add `updated_at` trigger

```sql
create or replace function public.handle_profile_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.handle_profile_updated_at();
```

`drop trigger if exists` + `create trigger` makes this safely re-runnable.

## RLS

Unchanged. The existing policies are row-level, not column-level, so they cover the new columns automatically.

## Verification plan

These steps run after applying the migration and belong in the implementation plan's verification step.

1. **Migration applies cleanly**
   `supabase db reset` — exits 0, no warnings about the profiles migration.

2. **Schema matches**
   `psql ... -c "\d public.profiles"` shows `display_name text` and `updated_at timestamptz default now()` columns.

3. **Auto-create on signup (basic path)**
   Sign up a new user via the dev server register form.
   `select id, email, display_name, created_at, updated_at from public.profiles where email = '<new>';`
   Expect: row exists, `display_name` is null, `created_at` and `updated_at` are both set and equal (within a few ms).

4. **`updated_at` advances on update**
   `update public.profiles set locale = 'zh' where id = '<new>';`
   Re-select → `updated_at` is now later than `created_at`.

5. **`display_name` populates from metadata when present**
   Insert a second user directly in SQL:
   ```sql
   -- run as service role via `supabase` CLI or SQL editor
   insert into auth.users (id, email, raw_user_meta_data)
   values (gen_random_uuid(), 'test@example.com', '{"display_name":"Test User"}'::jsonb);
   ```
   Re-select from `profiles` → `display_name = 'Test User'`.

6. **Biome clean**
   `pnpm biome check .` → no errors. (No app code changes, but run it anyway per house rules.)

## Out of scope

- Changes to `register-form.tsx`, `registerSchema`, or the signup flow — a future ticket will own collecting `display_name` on signup.
- Changes to `full_name`, `avatar_url`, or any other existing column.
- Any RLS policy changes.
- Updates to `docs/database.md` — optional cleanup, tracked separately. The schema as shipped will diverge slightly from the doc (which currently lists `full_name` and no `display_name`).
- Creating a profile-edit UI so a user can set their own `display_name`.
