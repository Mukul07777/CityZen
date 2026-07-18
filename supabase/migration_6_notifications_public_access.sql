-- CityZen — migration 6: resolution notifications + public read access
-- Run this in Supabase SQL Editor AFTER migration_5_photo_dedup.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. posts: track whether the reporter has seen that their issue
--    was resolved (drives a notification badge in the Navbar).
-- ─────────────────────────────────────────────────────────────
alter table public.posts
  add column resolved_seen_by_reporter boolean not null default false;

-- ─────────────────────────────────────────────────────────────
-- 2. mark_my_reports_seen() — called when the reporter visits
--    /my-reports, clears their unseen-resolution badge.
-- ─────────────────────────────────────────────────────────────
create function public.mark_my_reports_seen()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.posts
  set resolved_seen_by_reporter = true
  where user_id = auth.uid() and tag = 'Completed';
end;
$$;

grant execute on function public.mark_my_reports_seen() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Public read access — lets logged-out visitors see reported
--    issues and the leaderboard (transparency), without being able
--    to report, vote, or complete anything (those still require
--    an authenticated session and, for completion, the MCD role).
--    Note: this deliberately does NOT extend to profiles or
--    post_reactions — no need for the public to see who reported
--    what or who flagged what.
-- ─────────────────────────────────────────────────────────────
create policy "posts are readable by anon"
  on public.posts for select
  to anon
  using (true);

create policy "districts are readable by anon"
  on public.districts for select
  to anon
  using (true);
