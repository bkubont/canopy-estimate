-- Everyone tracks their own hours: each entry belongs to one person (worker_id),
-- and can be a clock that is still running (clock_in set, no hours yet).
-- Older entries have no worker: they are crew totals from before this change.

alter table public.time_entries
  add column worker_id uuid,
  add column worker_name text not null default '',
  add column clock_in timestamptz,
  add column clock_out timestamptz,
  alter column hours drop not null;

alter table public.time_entries drop constraint time_entries_hours_check;
alter table public.time_entries add constraint time_entries_hours_check check (
  (hours is null and clock_in is not null and clock_out is null) -- on the clock right now
  or (hours is not null and hours > 0 and hours <= 200)
);
alter table public.time_entries add constraint time_entries_clock_order check (clock_out is null or clock_in is null or clock_out > clock_in);

-- One running clock per person.
create unique index time_entries_one_open_clock on public.time_entries (org_id, worker_id)
  where hours is null and deleted_at is null;

-- Crew add and change only their own hours; owner and office can do anyone's.
drop policy time_insert on public.time_entries;
drop policy time_update on public.time_entries;
create policy time_insert on public.time_entries for insert with check (
  public.has_role(org_id, array['owner', 'office'])
  or (public.is_member(org_id) and entered_by = auth.uid() and (worker_id is null or worker_id = auth.uid()))
);
create policy time_update on public.time_entries for update
  using (public.has_role(org_id, array['owner', 'office']) or worker_id = auth.uid() or (worker_id is null and entered_by = auth.uid()))
  with check (public.has_role(org_id, array['owner', 'office']) or worker_id = auth.uid() or (worker_id is null and entered_by = auth.uid()));
