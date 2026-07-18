-- CityZen — migration 3: severity, duplicate grouping, weighted scoring
-- Run this in Supabase SQL Editor AFTER migration_2_mcd_roles.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. posts: severity + report_count (how many times this same
--    issue has effectively been reported — used for both dedup
--    display and prioritization)
-- ─────────────────────────────────────────────────────────────
alter table public.posts
  add column severity text not null default 'Medium' check (severity in ('Low', 'Medium', 'High'));

alter table public.posts
  add column report_count integer not null default 1;

-- ─────────────────────────────────────────────────────────────
-- 2. Haversine distance helper (km), reused for duplicate matching.
-- ─────────────────────────────────────────────────────────────
create function public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language plpgsql
immutable
as $$
declare
  r constant double precision := 6371;
  d_lat double precision := radians(lat2 - lat1);
  d_lon double precision := radians(lon2 - lon1);
  a double precision;
begin
  a := sin(d_lat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ^ 2;
  return r * 2 * atan2(sqrt(a), sqrt(1 - a));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. submit_report() — replaces direct INSERT from the client.
--    If a Pending issue in the same district + category exists
--    within ~150m and was reported in the last 14 days, this
--    report is treated as a duplicate: instead of creating a new
--    row, it bumps report_count on the existing one (this is the
--    "not just raw issues, group + prioritize" behavior — higher
--    report_count surfaces higher in Issues/MCD dashboard sorting).
--    Otherwise, a new post is created as normal.
--    Returns the resulting post id and whether it was merged.
-- ─────────────────────────────────────────────────────────────
create function public.submit_report(
  p_title text,
  p_description text,
  p_img_url text,
  p_lat double precision,
  p_lon double precision,
  p_issue_category text,
  p_severity text,
  p_district text,
  p_user_name text
)
returns table (post_id uuid, merged boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  select id into v_existing_id
  from public.posts
  where district = p_district
    and issue_category = p_issue_category
    and tag = 'Pending'
    and created_at > now() - interval '14 days'
    and haversine_km(lat, lon, p_lat, p_lon) <= 0.15
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    update public.posts
    set report_count = report_count + 1
    where id = v_existing_id;

    return query select v_existing_id, true;
  else
    insert into public.posts (
      title, description, img_url, lat, lon, issue_category, severity,
      district, user_id, user_name, report_count
    )
    values (
      p_title, p_description, p_img_url, p_lat, p_lon, p_issue_category, p_severity,
      p_district, auth.uid(), p_user_name, 1
    )
    returning id into v_existing_id;

    return query select v_existing_id, false;
  end if;
end;
$$;

grant execute on function public.submit_report(text, text, text, double precision, double precision, text, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Replace complete_issue(): award a weighted score instead of
--    a flat +10 — severity sets the base points, and issues that
--    were reported by more people (higher report_count) are worth
--    more, since they represent a bigger community impact.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.complete_issue(uuid, text);

create function public.complete_issue(post_id uuid, proof_url text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_district text;
  v_current_tag text;
  v_severity text;
  v_report_count integer;
  v_caller_role text;
  v_caller_district text;
  v_points integer;
begin
  select district, tag, severity, report_count
  into v_district, v_current_tag, v_severity, v_report_count
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

  v_points := case v_severity
    when 'High' then 20
    when 'Low' then 5
    else 10
  end + (coalesce(v_report_count, 1) - 1) * 3;

  update public.posts
  set tag = 'Completed',
      proof_url = complete_issue.proof_url,
      completed_by = auth.uid(),
      completed_at = now()
  where id = post_id;

  update public.districts set score = score + v_points where name = v_district;
end;
$$;

grant execute on function public.complete_issue(uuid, text) to authenticated;
