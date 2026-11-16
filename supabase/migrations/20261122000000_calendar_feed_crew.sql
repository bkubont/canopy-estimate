-- The calendar subscription shows who is assigned: the calendar stores the crew
-- as team members (assigned_to), so their names are looked up here. Same
-- function as before otherwise.

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
        'starts', e.starts, 'ends', e.ends, 'address', e.address, 'town', e.town,
        -- The crew picked in the calendar (by name), else the older free-text crew field.
        'crew', coalesce((
          select string_agg(nullif(trim(m.display_name), ''), ', ' order by m.display_name)
          from public.members m
          where m.org_id = f.org_id and m.deleted_at is null
            and m.user_id::text in (select jsonb_array_elements_text(e.assigned_to))
        ), e.crew),
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
