-- CityZen — migration 7: "seen by MCD" status + photo-evidence reactions
-- Run this in Supabase SQL Editor AFTER migration_6_notifications_public_access.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. posts: track acknowledgement separately from resolution —
--    this is the middle step of the Reported -> Seen -> Resolved
--    progress tracker.
-- ─────────────────────────────────────────────────────────────
alter table public.posts add column seen_by_mcd boolean not null default false;
alter table public.posts add column seen_by uuid references auth.users(id);
alter table public.posts add column seen_at timestamptz;

-- how many "still an issue" confirmations came with photo evidence —
-- weighted higher than a plain confirm in priority sorting, since a
-- fresh photo proving it's still there is stronger signal than a tap.
alter table public.posts add column evidence_count integer not null default 0;

-- ─────────────────────────────────────────────────────────────
-- 2. mark_seen() — MCD official acknowledges the report. Same
--    ownership rule as complete_issue(): only the MCD account
--    assigned to this issue's district can do it.
-- ─────────────────────────────────────────────────────────────
create function public.mark_seen(p_post_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_district text;
  v_caller_role text;
  v_caller_district text;
begin
  select district into v_district from public.posts where id = p_post_id;
  if v_district is null then
    raise exception 'Post not found';
  end if;

  select role, district into v_caller_role, v_caller_district
  from public.profiles where id = auth.uid();

  if v_caller_role is distinct from 'mcd' then
    raise exception 'Only an MCD official can mark issues as seen';
  end if;

  if v_caller_district is distinct from v_district then
    raise exception 'You can only act on issues in your assigned district';
  end if;

  update public.posts
  set seen_by_mcd = true, seen_by = auth.uid(), seen_at = now()
  where id = p_post_id and seen_by_mcd = false;
end;
$$;

grant execute on function public.mark_seen(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. post_reactions: optional photo evidence attached to a
--    "still an issue" confirmation.
-- ─────────────────────────────────────────────────────────────
alter table public.post_reactions add column photo_url text;

-- ─────────────────────────────────────────────────────────────
-- 4. Replace react_to_post(): now accepts optional photo evidence
--    and recomputes evidence_count alongside confirm/flag counts.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.react_to_post(uuid, text, text);

create function public.react_to_post(
  p_post_id uuid,
  p_reaction text,
  p_reason text default null,
  p_photo_url text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_reaction not in ('confirm', 'flag') then
    raise exception 'Invalid reaction type';
  end if;

  insert into public.post_reactions (post_id, user_id, reaction_type, reason, photo_url)
  values (p_post_id, auth.uid(), p_reaction, p_reason, p_photo_url)
  on conflict (post_id, user_id)
  do update set reaction_type = excluded.reaction_type,
                reason = excluded.reason,
                photo_url = excluded.photo_url,
                created_at = now();

  update public.posts
  set confirm_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'confirm'),
      flag_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'flag'),
      evidence_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'confirm' and photo_url is not null)
  where id = p_post_id;
end;
$$;

grant execute on function public.react_to_post(uuid, text, text, text) to authenticated;

-- remove_reaction() also needs to recompute evidence_count now.
create or replace function public.remove_reaction(p_post_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.post_reactions
  where post_id = p_post_id and user_id = auth.uid();

  update public.posts
  set confirm_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'confirm'),
      flag_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'flag'),
      evidence_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'confirm' and photo_url is not null)
  where id = p_post_id;
end;
$$;

grant execute on function public.remove_reaction(uuid) to authenticated;
