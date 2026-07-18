-- CityZen — migration 11: possible-duplicates review queue
-- Run this in Supabase SQL Editor AFTER migration_10_error_logs_notifications.sql.
--
-- submit_report() (migration 9) auto-merges reports within a hamming
-- distance of 10 on photo_hash — a tight threshold chosen to avoid
-- false-positive merges. That leaves a gap: two reports of the same
-- pothole taken from a different angle/lighting might land at distance
-- 11-25, similar enough that a human should glance at them, not similar
-- enough to auto-merge blindly. This view surfaces those borderline
-- pairs for an MCD official to manually confirm and merge (or dismiss).

create or replace view public.possible_duplicate_pairs as
select
  a.id as post_a_id,
  a.title as post_a_title,
  a.img_url as post_a_img,
  b.id as post_b_id,
  b.title as post_b_title,
  b.img_url as post_b_img,
  a.district,
  a.issue_category,
  hamming_distance64(a.photo_hash, b.photo_hash) as distance
from public.posts a
join public.posts b
  on a.district = b.district
  and a.issue_category = b.issue_category
  and a.id < b.id
  and a.tag = 'Pending'
  and b.tag = 'Pending'
  and a.photo_hash is not null
  and b.photo_hash is not null
where hamming_distance64(a.photo_hash, b.photo_hash) between 11 and 25
order by distance asc;

grant select on public.possible_duplicate_pairs to authenticated;

-- Manual merge action for an MCD official reviewing the queue above:
-- folds post_b into post_a (bumps report_count, tags post_b 'Merged' so
-- it drops out of Pending lists rather than being deleted — deleting
-- could orphan reactions/notifications pointing at it). Deliberately NOT
-- tagged 'Completed': that would incorrectly fire the resolved-report
-- notification trigger (migration 10) and award district leaderboard
-- points for a report that was never actually fixed, just deduplicated.
create function public.merge_duplicate_posts(p_keep_id uuid, p_merge_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_district text;
  v_caller_role text;
  v_caller_district text;
  v_merge_count integer;
begin
  select district, report_count into v_district, v_merge_count
  from public.posts where id = p_merge_id;

  if v_district is null then
    raise exception 'Post not found';
  end if;

  select role, district into v_caller_role, v_caller_district
  from public.profiles where id = auth.uid();

  if v_caller_role is distinct from 'mcd' then
    raise exception 'Only an MCD official can merge duplicate reports';
  end if;

  if v_caller_district is distinct from v_district then
    raise exception 'You can only merge issues in your assigned district';
  end if;

  update public.posts
  set report_count = report_count + coalesce(v_merge_count, 1)
  where id = p_keep_id;

  update public.posts
  set tag = 'Merged',
      description = description || ' [Merged as duplicate by MCD official]'
  where id = p_merge_id;
end;
$$;

grant execute on function public.merge_duplicate_posts(uuid, uuid) to authenticated;
