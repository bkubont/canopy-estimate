-- Phase 4: the calendar owns work dates; crews are assigned on calendar entries.
--
-- A job counts as Scheduled when it has a tree-work entry on the calendar that
-- isn't cancelled. The app works that out from the events; nothing else stores
-- dates, so the calendar and the jobs board can't disagree.

alter table public.events
  add column assigned_to jsonb not null default '[]'::jsonb check (jsonb_typeof(assigned_to) = 'array');

create or replace function public.events_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_id is not null and not exists (select 1 from public.jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'calendar entry is linked to another company''s job';
  end if;
  if new.unscheduled then
    new.starts := '';
    new.ends := '';
  elsif new.starts = '' then
    raise exception 'pick a date';
  end if;
  return new;
end;
$$;
create trigger events_check before insert or update on public.events
  for each row execute function public.events_check();
