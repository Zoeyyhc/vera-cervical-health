-- Backfill profiles for auth.users rows that predate the
-- on_auth_user_created trigger. Idempotent via ON CONFLICT DO NOTHING.
insert into public.profiles (id, email, display_name)
select
  id,
  email,
  nullif(raw_user_meta_data->>'display_name', '')
from auth.users
on conflict (id) do nothing;
