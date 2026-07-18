-- CityZen — migration 8: citizen leaderboard
-- Run this in Supabase SQL Editor AFTER migration_7_seen_status_evidence.sql.
--
-- Ranks citizens by a weighted "civic engagement" score:
--   +3 per distinct issue they reported (report_count on their own posts
--      doesn't matter here — this counts THEIR act of reporting, not how
--      many times that issue got duplicated by others)
--   +1 per "still an issue" confirm they gave on someone else's report
--   +2 per confirm that included photo evidence (stronger signal, same
--      weighting logic as the issue-priority sort in migration 7)
--
-- This is a read-only ranking view, not a rewards ledger — no point
-- balance is stored or redeemable. If a redemption/rewards system gets
-- built later, it should be a separate ledger table, not this view.

create or replace view public.citizen_leaderboard as
select
  p.id as user_id,
  p.username,
  coalesce(reported.cnt, 0) as reports_submitted,
  coalesce(reacted.plain_confirms, 0) as plain_confirms,
  coalesce(reacted.evidence_confirms, 0) as evidence_confirms,
  (coalesce(reported.cnt, 0) * 3
    + coalesce(reacted.plain_confirms, 0) * 1
    + coalesce(reacted.evidence_confirms, 0) * 2) as score
from public.profiles p
left join (
  select user_id, count(*) as cnt
  from public.posts
  group by user_id
) reported on reported.user_id = p.id
left join (
  select
    user_id,
    count(*) filter (where photo_url is null) as plain_confirms,
    count(*) filter (where photo_url is not null) as evidence_confirms
  from public.post_reactions
  where reaction_type = 'confirm'
  group by user_id
) reacted on reacted.user_id = p.id
where p.role = 'citizen'
order by score desc;

-- Views inherit RLS from their underlying tables when queried through
-- PostgREST as the querying role, but posts/post_reactions/profiles are
-- already readable (posts: anon+authenticated per migration 6; profiles:
-- authenticated only; post_reactions: authenticated only via existing
-- policies). Grant select on the view explicitly so PostgREST exposes it.
grant select on public.citizen_leaderboard to authenticated, anon;
