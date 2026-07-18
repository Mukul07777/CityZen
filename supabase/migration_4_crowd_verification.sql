-- CityZen — migration 4: live crowd verification (confirm / flag)
-- Run this in Supabase SQL Editor AFTER migration_3_scoring_grouping.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. post_reactions — one row per (post, user). Re-reacting
--    updates the existing row instead of creating a new one, so
--    a user can change their mind (confirm -> flag or vice versa).
-- ─────────────────────────────────────────────────────────────
create table public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('confirm', 'flag')),
  reason text,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

alter table public.post_reactions enable row level security;

create policy "reactions are readable by authenticated users"
  on public.post_reactions for select
  to authenticated
  using (true);

-- no direct insert/update/delete policy — all writes go through
-- react_to_post() / remove_reaction() below so counters on posts
-- stay in sync with the reactions table.

-- ─────────────────────────────────────────────────────────────
-- 2. posts: denormalized counters for fast display without
--    aggregating post_reactions on every page load.
-- ─────────────────────────────────────────────────────────────
alter table public.posts add column confirm_count integer not null default 0;
alter table public.posts add column flag_count integer not null default 0;

-- ─────────────────────────────────────────────────────────────
-- 3. react_to_post() — confirm ("still an issue") or flag
--    (false report / already fixed / wrong location).
-- ─────────────────────────────────────────────────────────────
create function public.react_to_post(p_post_id uuid, p_reaction text, p_reason text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_reaction not in ('confirm', 'flag') then
    raise exception 'Invalid reaction type';
  end if;

  insert into public.post_reactions (post_id, user_id, reaction_type, reason)
  values (p_post_id, auth.uid(), p_reaction, p_reason)
  on conflict (post_id, user_id)
  do update set reaction_type = excluded.reaction_type,
                reason = excluded.reason,
                created_at = now();

  update public.posts
  set confirm_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'confirm'),
      flag_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'flag')
  where id = p_post_id;
end;
$$;

grant execute on function public.react_to_post(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. remove_reaction() — let a user retract their vote.
-- ─────────────────────────────────────────────────────────────
create function public.remove_reaction(p_post_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.post_reactions
  where post_id = p_post_id and user_id = auth.uid();

  update public.posts
  set confirm_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'confirm'),
      flag_count = (select count(*) from public.post_reactions where post_id = p_post_id and reaction_type = 'flag')
  where id = p_post_id;
end;
$$;

grant execute on function public.remove_reaction(uuid) to authenticated;
