-- CityZen — migration 9: hardening pass
-- Run this in Supabase SQL Editor AFTER migration_8_citizen_leaderboard.sql.
--
-- This migration is about closing gaps, not adding user-facing features:
--   1. schema_migrations tracking table, so from here on you can verify
--      which migrations have actually been applied to a given database
--      instead of relying on memory. (Migrations 1-8 predate this table
--      and are recorded retroactively below — if you're setting up a
--      fresh project, run migrations 1-8 first, then this one, and the
--      backfill insert will correctly reflect that.)
--   2. Rate limiting on submit_report() — max 5 reports per user per
--      rolling hour. Without this, the citizen leaderboard added in
--      migration 8 is a standing incentive to spam-report for score.
--   3. An audit_log view surfacing who marked what seen/resolved and
--      when, using columns that already exist (seen_by, completed_by).

-- ─────────────────────────────────────────────────────────────
-- 1. Migration tracking
-- ─────────────────────────────────────────────────────────────
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

insert into public.schema_migrations (version) values
  ('1_initial_schema'),
  ('2_mcd_roles'),
  ('3_scoring_grouping'),
  ('4_crowd_verification'),
  ('5_photo_dedup'),
  ('6_notifications_public_access'),
  ('7_seen_status_evidence'),
  ('8_citizen_leaderboard'),
  ('9_hardening')
on conflict (version) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2. Rate limiting: replace submit_report() to reject a user's
--    6th+ report within a rolling 60-minute window. Merges (same
--    location/photo as an existing pending report) do NOT count
--    against the limit — only genuinely new posts do, since a
--    merge is confirming an existing issue, not spamming a new one.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.submit_report(text, text, text, double precision, double precision, text, text, text, text, text);

create function public.submit_report(
  p_title text,
  p_description text,
  p_img_url text,
  p_lat double precision,
  p_lon double precision,
  p_issue_category text,
  p_severity text,
  p_district text,
  p_user_name text,
  p_photo_hash text default null
)
returns table (post_id uuid, merged boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing_id uuid;
  v_recent_new_reports integer;
begin
  -- Location + category match (tight radius, short window).
  select id into v_existing_id
  from public.posts
  where district = p_district
    and issue_category = p_issue_category
    and tag = 'Pending'
    and created_at > now() - interval '14 days'
    and haversine_km(lat, lon, p_lat, p_lon) <= 0.15
  order by created_at desc
  limit 1;

  -- Visual similarity match, wider net, only if no location match.
  if v_existing_id is null and p_photo_hash is not null then
    select id into v_existing_id
    from public.posts
    where district = p_district
      and issue_category = p_issue_category
      and tag = 'Pending'
      and photo_hash is not null
      and created_at > now() - interval '30 days'
      and hamming_distance64(photo_hash, p_photo_hash) <= 10
    order by hamming_distance64(photo_hash, p_photo_hash) asc
    limit 1;
  end if;

  if v_existing_id is not null then
    update public.posts
    set report_count = report_count + 1
    where id = v_existing_id;

    return query select v_existing_id, true;
  else
    -- Rate limit only applies to brand-new reports, not merges.
    select count(*) into v_recent_new_reports
    from public.posts
    where user_id = auth.uid()
      and created_at > now() - interval '1 hour';

    if v_recent_new_reports >= 5 then
      raise exception 'Rate limit: you can report at most 5 new issues per hour. Please wait before submitting another.';
    end if;

    insert into public.posts (
      title, description, img_url, lat, lon, issue_category, severity,
      district, user_id, user_name, report_count, photo_hash
    )
    values (
      p_title, p_description, p_img_url, p_lat, p_lon, p_issue_category, p_severity,
      p_district, auth.uid(), p_user_name, 1, p_photo_hash
    )
    returning id into v_existing_id;

    return query select v_existing_id, false;
  end if;
end;
$$;

grant execute on function public.submit_report(text, text, text, double precision, double precision, text, text, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Audit log: who marked what seen/resolved and when. Read-only
--    view over existing columns — no new writes, no new tables
--    for the events themselves, just a queryable surface.
-- ─────────────────────────────────────────────────────────────
create or replace view public.audit_log as
select
  p.id as post_id,
  p.title,
  p.district,
  'seen' as action,
  p.seen_by as actor_id,
  seen_profile.username as actor_name,
  p.seen_at as occurred_at
from public.posts p
left join public.profiles seen_profile on seen_profile.id = p.seen_by
where p.seen_by is not null

union all

select
  p.id as post_id,
  p.title,
  p.district,
  'resolved' as action,
  p.completed_by as actor_id,
  completed_profile.username as actor_name,
  p.completed_at as occurred_at
from public.posts p
left join public.profiles completed_profile on completed_profile.id = p.completed_by
where p.completed_by is not null

order by occurred_at desc;

-- Only MCD officials and the actor themselves should reasonably see
-- this; simplest safe default is authenticated-only (mirrors profiles).
grant select on public.audit_log to authenticated;
