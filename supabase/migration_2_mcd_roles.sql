-- CityZen — migration 2: MCD official accounts + proof-of-completion
-- Run this in Supabase SQL Editor AFTER supabase/schema.sql has already run once.
-- Safe to run once; re-running will error on duplicate columns/policies (that's fine —
-- just means it already applied).

-- ─────────────────────────────────────────────────────────────
-- 1. profiles: add role + assigned district (for MCD accounts)
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column role text not null default 'citizen' check (role in ('citizen', 'mcd'));

alter table public.profiles
  add column district text references public.districts(name);

-- ─────────────────────────────────────────────────────────────
-- 2. districts: add a center point so we can auto-detect the
--    nearest district from a citizen's GPS coordinates.
-- ─────────────────────────────────────────────────────────────
alter table public.districts add column lat double precision;
alter table public.districts add column lon double precision;

-- Set these for every district you seeded earlier, e.g.:
-- update public.districts set lat = 28.6139, lon = 77.2090 where name = 'Example District';

-- ─────────────────────────────────────────────────────────────
-- 3. posts: proof of completion (photo/video from the MCD official)
-- ─────────────────────────────────────────────────────────────
alter table public.posts add column proof_url text;
alter table public.posts add column completed_by uuid references auth.users(id);
alter table public.posts add column completed_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 4. Replace complete_issue(): now requires the caller to be an
--    MCD account assigned to the SAME district as the post, and
--    requires proof media. Citizens (even the original reporter)
--    can no longer complete their own issues — only the district's
--    MCD official can, with proof.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.complete_issue(uuid);

create function public.complete_issue(post_id uuid, proof_url text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_district text;
  v_current_tag text;
  v_caller_role text;
  v_caller_district text;
begin
  select district, tag into v_district, v_current_tag
  from public.posts where id = post_id;

  if v_current_tag is null then
    raise exception 'Post not found';
  end if;

  select role, district into v_caller_role, v_caller_district
  from public.profiles where id = auth.uid();

  if v_caller_role is distinct from 'mcd' then
    raise exception 'Only an MCD official can mark issues as completed';
  end if;

  if v_caller_district is distinct from v_district then
    raise exception 'You can only complete issues in your assigned district';
  end if;

  if v_current_tag = 'Completed' then
    raise exception 'Issue already completed';
  end if;

  if proof_url is null or length(trim(proof_url)) = 0 then
    raise exception 'Proof photo/video is required to complete an issue';
  end if;

  update public.posts
  set tag = 'Completed',
      proof_url = complete_issue.proof_url,
      completed_by = auth.uid(),
      completed_at = now()
  where id = post_id;

  update public.districts set score = score + 10 where name = v_district;
end;
$$;

grant execute on function public.complete_issue(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. assign_mcd_role() — ADMIN-ONLY helper. Deliberately NOT granted
--    to authenticated/anon, so it can only be run from the SQL Editor
--    (which executes as the postgres role), never from the app itself.
--    This is what makes MCD accounts admin-provisioned rather than
--    self-service — nobody can call this through the client SDK.
-- ─────────────────────────────────────────────────────────────
create function public.assign_mcd_role(p_email text, p_district text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set role = 'mcd', district = p_district
  where email = p_email;

  if not found then
    raise exception 'No profile found for email %', p_email;
  end if;
end;
$$;

-- To create an MCD account:
--   1. Supabase Dashboard > Authentication > Users > Add user
--      (set an email + password directly, no confirmation email needed)
--   2. Run in SQL Editor:
--        select public.assign_mcd_role('official@example.gov', 'Example District');
--   3. They log in through the normal /login page — the app reads their
--      role from public.profiles and shows the MCD completion UI only
--      for issues in their assigned district.
