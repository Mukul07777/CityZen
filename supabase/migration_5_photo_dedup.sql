-- CityZen — migration 5: image-based duplicate detection
-- Run this in Supabase SQL Editor AFTER migration_4_crowd_verification.sql.
--
-- The location+category merge in submit_report() (migration 3) only
-- catches reports within ~150m and 14 days of an existing one. This adds
-- a second, wider check: if a new photo's perceptual hash (computed by
-- app/api/hash-image, a free local pHash — no external API) is close to
-- an existing Pending post's photo in the same district+category within
-- 30 days, they're merged too, even if further apart geographically.
--
-- Caveat: posts created before this migration have no photo_hash, so this
-- only starts catching duplicates going forward — it can't retroactively
-- match older reports.

alter table public.posts add column photo_hash text;

-- ─────────────────────────────────────────────────────────────
-- Hamming distance between two 16-char hex-encoded 64-bit hashes.
-- Lower = more visually similar. 0 = identical hash.
-- ─────────────────────────────────────────────────────────────
create function public.hamming_distance64(a text, b text)
returns integer
language sql
immutable
as $$
  select length(replace(
    ((('x' || lpad(a, 16, '0'))::bit(64)) # (('x' || lpad(b, 16, '0'))::bit(64)))::text,
    '0', ''
  ));
$$;

-- ─────────────────────────────────────────────────────────────
-- Replace submit_report(): now takes photo_hash, and checks BOTH
-- location proximity AND visual similarity before deciding to
-- create a new post vs. merge into an existing one.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.submit_report(text, text, text, double precision, double precision, text, text, text, text);

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
begin
  -- 1. Location + category match (tight radius, short window).
  select id into v_existing_id
  from public.posts
  where district = p_district
    and issue_category = p_issue_category
    and tag = 'Pending'
    and created_at > now() - interval '14 days'
    and haversine_km(lat, lon, p_lat, p_lon) <= 0.15
  order by created_at desc
  limit 1;

  -- 2. If no location match, try visual similarity within the same
  --    district+category over a wider time window.
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
