-- CityZen — Supabase schema
-- Run this in Supabase Dashboard > SQL Editor (paste whole file, run once).
-- Replaces the old Firebase Realtime Database structure:
--   Main/users/{uid}      -> public.profiles
--   Main/Districts/{name} -> public.districts
--   posts/{id}             -> public.posts

-- ─────────────────────────────────────────────────────────────
-- 1. profiles — one row per signed-up user, mirrors auth.users
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- anyone signed in can read basic profile info (needed to show "Created by: X")
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- a user can only insert/update their own profile row
create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- auto-create a profile row whenever someone signs up (email/password or Google)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 2. districts — leaderboard entries
-- ─────────────────────────────────────────────────────────────
create table public.districts (
  name text primary key,
  email text,
  score integer not null default 0
);

alter table public.districts enable row level security;

create policy "districts are readable by everyone"
  on public.districts for select
  to authenticated
  using (true);

-- no direct insert/update policy for districts on purpose —
-- scores only change via the complete_issue() function below (security definer),
-- so a client can never PATCH a score directly, unlike the old Firebase setup.

-- ─────────────────────────────────────────────────────────────
-- 3. posts — reported issues
-- ─────────────────────────────────────────────────────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  img_url text,
  lat double precision not null,
  lon double precision not null,
  issue_category text not null default 'Others', -- Garbage / Telephone Wires / Electricity / Road / Others
  tag text not null default 'Pending',            -- Pending / Completed
  district text references public.districts(name),
  user_id uuid not null references auth.users(id),
  user_name text not null,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "posts are readable by authenticated users"
  on public.posts for select
  to authenticated
  using (true);

create policy "users can insert their own posts"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- deliberately NO update/delete policy here — completing an issue goes
-- through complete_issue() so ownership + scoring stay server-enforced.

-- ─────────────────────────────────────────────────────────────
-- 4. complete_issue() — atomic, ownership-checked "mark completed"
--    Replaces the old client-side markAsCompleted() that trusted the
--    browser to (a) only click the button on its own posts and
--    (b) correctly +10 the district score. Both were unenforced in Firebase.
-- ─────────────────────────────────────────────────────────────
create function public.complete_issue(post_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_district text;
  v_current_tag text;
begin
  select user_id, district, tag into v_owner, v_district, v_current_tag
  from public.posts where id = post_id;

  if v_owner is null then
    raise exception 'Post not found';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Only the reporter can mark this issue as completed';
  end if;

  if v_current_tag = 'Completed' then
    raise exception 'Issue already completed';
  end if;

  update public.posts set tag = 'Completed' where id = post_id;

  update public.districts set score = score + 10 where name = v_district;
end;
$$;

grant execute on function public.complete_issue(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. seed districts (edit/add your real districts + contact emails)
-- ─────────────────────────────────────────────────────────────
-- insert into public.districts (name, email, score) values
--   ('Example District', 'municipal.contact@example.gov', 0);

-- ─────────────────────────────────────────────────────────────
-- 6. Storage — bucket + policies for issue report photos
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('issue-photos', 'issue-photos', true)
on conflict (id) do nothing;

-- anyone can view uploaded photos (bucket is public — needed so <img> tags
-- in issues/leaderboard pages can load images without auth headers)
create policy "public can view issue photos"
  on storage.objects for select
  using (bucket_id = 'issue-photos');

-- only signed-in users can upload, and only into this bucket
create policy "authenticated users can upload issue photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'issue-photos');
