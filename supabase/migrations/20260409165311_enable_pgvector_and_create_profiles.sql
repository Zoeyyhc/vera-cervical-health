-- Enable pgvector extension for embedding storage
create extension if not exists vector;

-- Profiles table - one row per auth.users entry
create table public.profiles (
  id         uuid references auth.users primary key,
  email      text,
  role       text check (role in ('guest', 'user', 'admin')) default 'user',
  full_name  text,
  avatar_url text,
  locale     text default 'en',
  created_at timestamptz default now()
);

-- Helper: returns true if the calling user has role = 'admin' in profiles.
-- security definer runs as the function owner (postgres), bypassing RLS
-- so it can read profiles regardless of the caller's own policies.
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$ language sql security definer stable
   set search_path = '';

-- Auto-create a profile row whenever a new user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer
   set search_path = '';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

-- A user can read their own profile; admins can read any profile
create policy "profiles: self or admin can select"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- A user can update their own profile; admins can update any
create policy "profiles: self or admin can update"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());
