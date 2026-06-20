-- ============================================================
-- GLCC STARTER — TEAM LOGIN (run AFTER schema.sql).
-- Paste this whole block into the Supabase SQL Editor and Run once.
-- Safe to re-run: it never deletes data.
--
-- What it adds:
--   • a `profiles` table linked 1:1 to auth.users (role + allowed_tabs)
--   • row-level security so each user can read ONLY their own profile
--   • a trigger that auto-creates a profile for every new teammate, with the
--     default "member" tab set (everything EXCEPT Money)
-- ============================================================

-- 1) One profile per auth user.
create table if not exists public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  email        text,
  role         text        not null default 'member' check (role in ('admin','member')),
  -- Default member tabs: everything EXCEPT 'money'. Admins ignore this list and
  -- see all tabs (enforced in the app + middleware).
  allowed_tabs text[]      not null default
    array['dashboard','pipeline','tasks','projects','contacts','content','agents'],
  created_at   timestamptz not null default now()
);

-- 2) Row-level security: a logged-in user may read only their OWN profile.
--    (No client-side INSERT/UPDATE policy on purpose — you manage roles/tabs from
--    the Supabase dashboard or with the service_role key, which bypasses RLS.)
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- 3) Auto-create a profile row whenever a teammate is added to auth.users, so a
--    new member is ready to log in immediately with the default tab set.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ADMIN PROMOTION
-- The create-admin script (scripts/create-admin.mjs) already sets this, but if
-- you created the admin account by hand in the dashboard, run this to grant it.
-- ============================================================
update public.profiles
set role = 'admin',
    allowed_tabs = array['dashboard','pipeline','money','tasks','projects','contacts','content','agents']
where email = 'melaniekee@whattowear.com.my';

-- ── How to manage members later ──────────────────────────────
-- Give a member access to the Money tab too:
--   update public.profiles
--   set allowed_tabs = array_append(allowed_tabs, 'money')
--   where email = 'teammate@example.com' and not ('money' = any(allowed_tabs));
-- Set an exact tab list:
--   update public.profiles
--   set allowed_tabs = array['dashboard','tasks','projects']
--   where email = 'teammate@example.com';
