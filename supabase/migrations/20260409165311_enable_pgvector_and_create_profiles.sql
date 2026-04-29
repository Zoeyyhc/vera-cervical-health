-- Enable pgvector extension for embedding storage
create extension if not exists vector;

-- Profiles table - one row per auth.users entry
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  email        text,
  role         text check (role in ('guest', 'user', 'admin')) default 'user',
  full_name    text,
  avatar_url   text,
  display_name text,
  locale       text default 'en',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
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

-- Auto-create a profile row whenever a new user signs up via Supabase Auth.
-- Copies display_name from auth metadata when present; nullif() coerces empty
-- strings to null so the column stays clean.
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-advance public.profiles.updated_at on every row update. Not
-- SECURITY DEFINER — this is a row-local mutation, the caller's role is fine.
create or replace function public.handle_profile_updated_at()
returns trigger as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.handle_profile_updated_at();
