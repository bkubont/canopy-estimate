-- Phase 5, step 5: expenses, receipts and hours.
--
-- Expenses are money: owner/office see and edit them. Crew may add one (say,
-- fuel they paid for, with a picture of the receipt) but never see the list.
-- A receipt is a photo (kind 'receipt') linked to its expense.
--
-- Hours are one crew total per job per day, for job costing (not payroll),
-- drive time included. Anyone on the team logs them; owner/office can fix any.

create table public.expenses (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  spent_on date not null default current_date,
  vendor text not null default '',
  amount numeric(12, 2) not null check (amount > 0),
  category text not null default 'Other',
  paid_with text not null default 'card' check (paid_with in ('cash', 'card', 'check', 'other')),
  job_id uuid references public.jobs (id) on delete set null,
  note text not null default '',
  entered_by uuid,
  entered_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index expenses_job_idx on public.expenses (job_id);
create index expenses_sync_idx on public.expenses (org_id, sync_txid);
create trigger expenses_touch before insert or update on public.expenses
  for each row execute function public.touch_sync_columns();

create table public.time_entries (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  work_date date not null default current_date,
  hours numeric(6, 2) not null check (hours > 0 and hours <= 200),
  note text not null default '',
  entered_by uuid,
  entered_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index time_entries_job_idx on public.time_entries (job_id);
create index time_entries_sync_idx on public.time_entries (org_id, sync_txid);
create trigger time_entries_touch before insert or update on public.time_entries
  for each row execute function public.touch_sync_columns();

alter table public.photos add column expense_id uuid references public.expenses (id) on delete set null;

-- Links must stay inside the company.
create or replace function public.same_org_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_id is not null and not exists (select 1 from public.jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'linked to another company''s job';
  end if;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.entered_by := old.entered_by;
  end if;
  return new;
end;
$$;
create trigger expenses_links before insert or update on public.expenses
  for each row execute function public.same_org_links();
create trigger time_entries_links before insert or update on public.time_entries
  for each row execute function public.same_org_links();

create or replace function public.photos_expense_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expense_id is not null and not exists (select 1 from public.expenses e where e.id = new.expense_id and e.org_id = new.org_id) then
    raise exception 'linked to another company''s expense';
  end if;
  return new;
end;
$$;
create trigger photos_expense_check before insert or update on public.photos
  for each row execute function public.photos_expense_check();

alter table public.expenses enable row level security;
create policy expenses_read on public.expenses for select using (public.has_role(org_id, array['owner', 'office']));
create policy expenses_insert on public.expenses for insert with check (public.is_member(org_id));
create policy expenses_update on public.expenses for update
  using (public.has_role(org_id, array['owner', 'office'])) with check (public.has_role(org_id, array['owner', 'office']));

alter table public.time_entries enable row level security;
create policy time_read on public.time_entries for select using (public.is_member(org_id));
create policy time_insert on public.time_entries for insert with check (public.is_member(org_id));
create policy time_update on public.time_entries for update
  using (public.has_role(org_id, array['owner', 'office']) or entered_by = auth.uid())
  with check (public.is_member(org_id));

grant select, insert, update on public.expenses, public.time_entries to authenticated;

create or replace function public.sync_pull(p_org uuid, p_since text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_since xid8 := coalesce(nullif(p_since, '')::xid8, '0'::xid8);
  v_result jsonb;
begin
  if not public.is_member(p_org) then raise exception 'Not a member of this company'; end if;
  select jsonb_build_object(
    'cursor', pg_snapshot_xmin(pg_current_snapshot())::text,
    'organizations', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.organizations r where r.id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'org_pricing', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.org_pricing r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.members r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.customers r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.jobs r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'job_pricing', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.job_pricing r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.invoices r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.payments r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.events r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.photos r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.expenses r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.time_entries r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
