-- Subscribe to the schedule from the iPhone/Mac Calendar app (or Google Calendar).
-- Each person gets their own private link. The link is the key, so it can be
-- reset (the old one stops working), and it stops working if the person leaves
-- the team. The feed holds calendar entries only: names, addresses and times,
-- never prices. Cancelled entries are left out.

create table public.calendar_feeds (
  token uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index calendar_feeds_one_live on public.calendar_feeds (org_id, user_id) where revoked_at is null;

alter table public.calendar_feeds enable row level security;
-- Read your own link only; links are made and reset through the functions below.
create policy calendar_feeds_own on public.calendar_feeds for select using (user_id = auth.uid());
grant select on public.calendar_feeds to authenticated;

-- Your link for this company (made the first time you ask).
create or replace function public.my_calendar_feed(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null or not public.is_member(p_org) then raise exception 'Not a member of this company'; end if;
  select token into v_token from public.calendar_feeds where org_id = p_org and user_id = auth.uid() and revoked_at is null;
  if v_token is null then
    insert into public.calendar_feeds (org_id, user_id) values (p_org, auth.uid()) returning token into v_token;
  end if;
  return v_token;
end;
$$;

-- A new link; the old one stops working.
create or replace function public.reset_calendar_feed(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_member(p_org) then raise exception 'Not a member of this company'; end if;
  update public.calendar_feeds set revoked_at = now() where org_id = p_org and user_id = auth.uid() and revoked_at is null;
  return public.my_calendar_feed(p_org);
end;
$$;

-- What the calendar link serves: the company name and the calendar entries from
-- two months back to a year ahead. Called by the calendar-feed server function
-- with the link's token (no account needed: the token is the key).
create or replace function public.calendar_feed_events(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f public.calendar_feeds;
  v_from date := (now() at time zone 'America/Detroit')::date - 60;
  v_to date := (now() at time zone 'America/Detroit')::date + 366;
begin
  select * into f from public.calendar_feeds where token = p_token and revoked_at is null;
  if f.token is null or not exists (
    select 1 from public.members m where m.org_id = f.org_id and m.user_id = f.user_id and m.deleted_at is null
  ) then
    raise exception 'This calendar link no longer works';
  end if;
  return jsonb_build_object(
    'company', (select name from public.organizations where id = f.org_id),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.type, 'title', e.title, 'status', e.status, 'all_day', e.all_day,
        'starts', e.starts, 'ends', e.ends, 'address', e.address, 'town', e.town, 'crew', e.crew,
        'equipment', e.equipment, 'notes', e.notes, 'updated_at', e.updated_at, 'job_id', e.job_id,
        'job_number', j.number
      ) order by e.starts)
      from public.events e
      left join public.jobs j on j.id = e.job_id and j.deleted_at is null
      where e.org_id = f.org_id and e.deleted_at is null and e.status <> 'cancelled' and not e.unscheduled
        and e.starts <> '' and left(e.ends, 10) >= v_from::text and left(e.starts, 10) <= v_to::text
        and (j.id is null or j.cancelled_at is null)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_calendar_feed(uuid) from public, anon;
revoke all on function public.reset_calendar_feed(uuid) from public, anon;
revoke all on function public.calendar_feed_events(uuid) from public;
grant execute on function public.my_calendar_feed(uuid) to authenticated;
grant execute on function public.reset_calendar_feed(uuid) to authenticated;
grant execute on function public.calendar_feed_events(uuid) to anon, authenticated;
