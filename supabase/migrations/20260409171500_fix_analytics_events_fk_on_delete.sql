-- Fix: use ON DELETE SET NULL for analytics_events.user_id FK.
-- When a user is deleted, their event rows are retained for aggregate analytics
-- but the user_id is set to NULL (anonymised). This is GDPR-aligned and avoids
-- a DELETE RESTRICT error when deleting a user who has logged events.
-- The user_id column is already nullable, so this is consistent with the table design.
alter table public.analytics_events
  drop constraint analytics_events_user_id_fkey;

alter table public.analytics_events
  add constraint analytics_events_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;
