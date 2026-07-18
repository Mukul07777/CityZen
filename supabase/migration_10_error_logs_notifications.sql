-- CityZen — migration 10: error logging + in-app notifications
-- Run this in Supabase SQL Editor AFTER migration_9_hardening.sql.
--
-- Two independent additions bundled together since both are new tables
-- with similar "write from client, read by owner/MCD" shapes:
--
--   1. error_logs — client-side errors get written here instead of
--      vanishing into the browser console. No third-party error-tracking
--      vendor (Sentry etc.) — consistent with this project's pattern of
--      avoiding paid/keyed services where a Supabase table does the job
--      (see: Leaflet+OSM instead of Google Maps).
--
--   2. notifications — a real per-user notification row (report seen,
--      report resolved), replacing the implicit "unseen count" hack on
--      My Reports with something a navbar bell can actually list.

-- ─────────────────────────────────────────────────────────────
-- 1. error_logs
-- ─────────────────────────────────────────────────────────────
create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  context text not null,        -- e.g. "issues/page.jsx:loadIssues"
  message text not null,
  stack text,
  created_at timestamptz not null default now()
);

alter table public.error_logs enable row level security;

-- Anyone (including anon, for the public Browse page) can write an error
-- report — logging a client-side crash shouldn't itself require auth.
create policy "anyone can write error logs"
  on public.error_logs for insert
  to authenticated, anon
  with check (true);

-- Only MCD officials can read the log (this is operational data, not
-- something a citizen account needs access to).
create policy "mcd can read error logs"
  on public.error_logs for select
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'mcd')
  );

-- ─────────────────────────────────────────────────────────────
-- 2. notifications
-- ─────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  type text not null check (type in ('seen', 'resolved')),
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "users read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "users update their own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notifications are only ever created server-side (by the trigger below),
-- never inserted directly by a client — no insert policy for authenticated
-- users on purpose.

-- Fires when mark_seen() or complete_issue() flips a post's status,
-- creating a notification for that post's original reporter.
create function public.notify_post_reporter()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.seen_by_mcd = true and (old.seen_by_mcd is distinct from true) then
    insert into public.notifications (user_id, post_id, type, message)
    values (new.user_id, new.id, 'seen', 'Your report "' || new.title || '" was seen by the district official.');
  end if;

  if new.tag = 'Completed' and old.tag is distinct from 'Completed' then
    insert into public.notifications (user_id, post_id, type, message)
    values (new.user_id, new.id, 'resolved', 'Your report "' || new.title || '" was resolved!');
  end if;

  return new;
end;
$$;

drop trigger if exists posts_notify_reporter on public.posts;
create trigger posts_notify_reporter
  after update on public.posts
  for each row execute procedure public.notify_post_reporter();

-- Mark-as-read, callable by the owning user only (enforced by the
-- update policy above — this function doesn't need security definer).
create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql
security invoker
as $$
  update public.notifications set read = true where id = p_id and user_id = auth.uid();
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;
