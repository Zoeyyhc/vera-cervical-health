-- Epic 2 · #12 · RLS policies for all Epic-1 tables.
--
-- Sole source of truth for RLS. Inline policies in the creation migrations
-- were removed in the same commit as this file. Per-policy comments explain
-- the role model; see docs/database.md for the high-level matrix.
--
-- Depends on the public.is_admin() helper defined in
-- 20260409165311_enable_pgvector_and_create_profiles.sql, which is a
-- SECURITY DEFINER function that reads profiles.role without triggering
-- its own RLS (avoids the classic "policy recursion on profiles" trap).

-- ───── profiles ──────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- A user can read their own row; admins can read every row.
create policy "profiles: self or admin can select"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- A user can update their own row; admins can update any row.
-- The WITH CHECK mirrors USING so a user can't re-target the row to another id.
create policy "profiles: self or admin can update"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- No INSERT or DELETE policy: inserts happen via the SECURITY DEFINER
-- trigger public.handle_new_user() on auth.users (bypasses RLS), and user
-- rows are deleted via auth.users cascade when an account is removed.

-- ───── chat_sessions ─────────────────────────────────────────────────────
alter table public.chat_sessions enable row level security;

-- Owners have full CRUD over their own sessions.
create policy "chat_sessions: owner full access"
  on public.chat_sessions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins are read-only — the analytics dashboard and moderation tooling
-- need to see conversations but must not mutate user data.
create policy "chat_sessions: admin read all"
  on public.chat_sessions for select
  to authenticated
  using (public.is_admin());

-- ───── chat_messages ─────────────────────────────────────────────────────
alter table public.chat_messages enable row level security;

-- Owners have full CRUD over messages in their own sessions. The ownership
-- check joins via chat_sessions rather than storing user_id on the row,
-- keeping the schema normalised.
create policy "chat_messages: owner full access via session"
  on public.chat_messages for all
  to authenticated
  using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id
        and s.user_id = auth.uid()
    )
  );

-- Admins can read every message for analytics/moderation (read-only).
create policy "chat_messages: admin read all"
  on public.chat_messages for select
  to authenticated
  using (public.is_admin());

-- ───── knowledge_chunks ──────────────────────────────────────────────────
alter table public.knowledge_chunks enable row level security;

-- Authenticated users (including non-admins) can read the health knowledge
-- base. NOTE: the original migration used `using (true)` so the anon key
-- could serve guest chat; #12 tightens this to authenticated-only. If a
-- guest-chat feature is built later, relax this policy or route guest
-- traffic through the service role in /api/chat.
create policy "knowledge_chunks: authenticated can select"
  on public.knowledge_chunks for select
  to authenticated
  using (true);

-- Only admins can ingest, update, or delete knowledge chunks.
create policy "knowledge_chunks: admins can insert"
  on public.knowledge_chunks for insert
  to authenticated
  with check (public.is_admin());

create policy "knowledge_chunks: admins can update"
  on public.knowledge_chunks for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "knowledge_chunks: admins can delete"
  on public.knowledge_chunks for delete
  to authenticated
  using (public.is_admin());

-- ───── analytics_events ──────────────────────────────────────────────────
alter table public.analytics_events enable row level security;

-- Authenticated users can log events attributed to themselves; they cannot
-- forge events with another user's id (WITH CHECK on user_id).
create policy "analytics_events: users can insert own"
  on public.analytics_events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Only admins can read the analytics table (powers the admin dashboard).
create policy "analytics_events: admins can select all"
  on public.analytics_events for select
  to authenticated
  using (public.is_admin());

-- No UPDATE or DELETE policy: events are append-only for audit purposes.
-- The GDPR delete flow nulls out user_id via the FK (ON DELETE SET NULL)
-- set in 20260409171500_fix_analytics_events_fk_on_delete.sql.
