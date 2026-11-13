-- Canopy Estimate: Phase 1 schema.
--
-- Design notes
-- * Every synced row has a client-generated uuid, an org_id, and sync columns
--   maintained by a trigger (updated_at, updated_by, sync_txid). Rows are never
--   hard-deleted by clients; deleted_at marks a soft delete.
-- * Pulls use transaction ids, not timestamps, so a row committed late by a
--   slow transaction is never skipped (see sync_pull).
-- * Prices are kept out of tables crew can read. org_pricing and job_pricing are
--   readable only by owner/office, enforced here rather than hidden in the UI.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organizations and membership
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  contact_name text not null default '',
  license text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  logo_path text not null default '',
  -- Document number counters, advanced only through reserve_numbers().
  next_estimate_no integer not null default 1001,
  next_invoice_no integer not null default 1001,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);

create table public.org_pricing (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  day_rate numeric(12, 2) not null default 2000 check (day_rate >= 0),
  tax_rate numeric(6, 3) not null default 0 check (tax_rate >= 0),
  deposit_pct numeric(5, 2) not null default 0 check (deposit_pct between 0 and 100),
  valid_days integer not null default 30 check (valid_days > 0),
  equipment_markup numeric(6, 3) not null default 1.2 check (equipment_markup >= 1),
  -- Remembered rental cost per equipment name, e.g. {"stump grinder": 285}.
  equipment_costs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);

create table public.members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'office', 'crew')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id(),
  primary key (org_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('owner', 'office', 'crew')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create index invites_org_idx on public.invites (org_id);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.member_role(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.members
  where org_id = p_org and user_id = auth.uid() and deleted_at is null
$$;

create or replace function public.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_role(p_org) is not null
$$;

create or replace function public.has_role(p_org uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.member_role(p_org) = any (p_roles), false)
$$;

-- ---------------------------------------------------------------------------
-- Business data
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  company text not null default '',
  phone text not null default '',
  email text not null default '',
  street text not null default '',
  town text not null default '',
  state text not null default 'MI',
  zip text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);

-- A job moves estimate → work_order → invoice → paid. Everything a crew needs
-- lives here; nothing with a dollar amount does.
create table public.jobs (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  stage text not null default 'estimate'
    check (stage in ('estimate', 'work_order', 'invoice', 'paid', 'archived')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'scheduled', 'in_progress', 'blocked', 'done')),
  block_reason text not null default '',
  customer_id uuid references public.customers (id) on delete set null,
  -- Snapshot of the client at the time of the estimate (printed as-is).
  client jsonb not null default '{}'::jsonb,
  trees jsonb not null default '[]'::jsonb,
  site jsonb not null default '{}'::jsonb,
  -- Equipment needed: [{id, desc, qty}]. Costs live in job_pricing.
  equipment jsonb not null default '[]'::jsonb,
  days numeric(5, 1) not null default 1 check (days > 0),
  change_orders jsonb not null default '[]'::jsonb,
  client_notes text not null default '',
  -- Never printed, never sent to the customer.
  internal_notes text not null default '',
  estimate_date date not null default current_date,
  client_sig_path text not null default '',
  client_sig_date date,
  signed_at timestamptz,
  assigned_crew text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id(),
  unique (org_id, number)
);
create index jobs_customer_idx on public.jobs (customer_id);

create table public.job_pricing (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  day_rate numeric(12, 2) not null default 0 check (day_rate >= 0),
  equipment_markup numeric(6, 3) not null default 1.2 check (equipment_markup >= 1),
  -- Rental cost per equipment line id, e.g. {"<line id>": 285}.
  equipment_costs jsonb not null default '{}'::jsonb,
  tax_rate numeric(6, 3) not null default 0 check (tax_rate >= 0),
  additional numeric(12, 2) not null default 0 check (additional >= 0),
  deposit_pct numeric(5, 2) not null default 0 check (deposit_pct between 0 and 100),
  deposit_amt numeric(12, 2) check (deposit_amt is null or deposit_amt >= 0),
  valid_days integer not null default 30 check (valid_days > 0),
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);

create table public.events (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  type text not null default 'other'
    check (type in ('estimate_visit', 'tree_work', 'equipment_rental', 'dump_run', 'maintenance', 'time_off', 'other')),
  title text not null default '',
  status text not null default 'tentative'
    check (status in ('tentative', 'confirmed', 'completed', 'cancelled')),
  all_day boolean not null default true,
  unscheduled boolean not null default false,
  -- All-day: date strings (end exclusive). Timed: ISO instants. Empty when unscheduled.
  starts text not null default '',
  ends text not null default '',
  job_id uuid references public.jobs (id) on delete set null,
  address text not null default '',
  town text not null default '',
  crew text not null default '',
  equipment jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index events_job_idx on public.events (job_id);

-- Pull index on every synced table.
create index organizations_sync_idx on public.organizations (sync_txid);
create index org_pricing_sync_idx on public.org_pricing (sync_txid);
create index members_sync_idx on public.members (org_id, sync_txid);
create index customers_sync_idx on public.customers (org_id, sync_txid);
create index jobs_sync_idx on public.jobs (org_id, sync_txid);
create index job_pricing_sync_idx on public.job_pricing (org_id, sync_txid);
create index events_sync_idx on public.events (org_id, sync_txid);

-- ---------------------------------------------------------------------------
-- Sync trigger: server owns the sync columns; org_id and created_at are fixed.
-- ---------------------------------------------------------------------------

create or replace function public.touch_sync_columns()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.sync_txid := pg_current_xact_id();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    if to_jsonb(new) ? 'org_id' and (to_jsonb(new) ->> 'org_id') is distinct from (to_jsonb(old) ->> 'org_id') then
      raise exception 'org_id cannot change';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations', 'org_pricing', 'members', 'customers', 'jobs', 'job_pricing', 'events'] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.touch_sync_columns()',
      t || '_touch', t);
  end loop;
end $$;

-- job_pricing.org_id must match its job.
create or replace function public.job_pricing_org_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'job_pricing.org_id does not match job';
  end if;
  return new;
end;
$$;
create trigger job_pricing_org_check before insert or update on public.job_pricing
  for each row execute function public.job_pricing_org_check();

-- Members: a company must always keep at least one owner.
create or replace function public.keep_one_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid := coalesce(old.org_id, new.org_id);
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.deleted_at is not null)
     and not exists (
       select 1 from public.members m
       where m.org_id = v_org and m.role = 'owner' and m.deleted_at is null and m.user_id <> old.user_id
     ) then
    raise exception 'A company needs at least one owner';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger members_keep_one_owner before update or delete on public.members
  for each row execute function public.keep_one_owner();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.org_pricing enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.job_pricing enable row level security;
alter table public.events enable row level security;

-- organizations: members read; owners edit. Created only via create_organization().
create policy org_read on public.organizations for select using (public.is_member(id));
create policy org_update on public.organizations for update
  using (public.has_role(id, array['owner'])) with check (public.has_role(id, array['owner']));

-- org_pricing: owner/office read; owner edits.
create policy pricing_read on public.org_pricing for select using (public.has_role(org_id, array['owner', 'office']));
create policy pricing_update on public.org_pricing for update
  using (public.has_role(org_id, array['owner'])) with check (public.has_role(org_id, array['owner']));

-- members: everyone in the company sees the team; owners manage it. People
-- join only through accept_invite() / create_organization().
create policy members_read on public.members for select using (public.is_member(org_id));
create policy members_update on public.members for update
  using (public.has_role(org_id, array['owner']) or user_id = auth.uid())
  with check (
    public.has_role(org_id, array['owner'])
    -- Non-owners may only change their own display name, not their role.
    or (user_id = auth.uid() and role = public.member_role(org_id))
  );

-- invites: owners only.
create policy invites_read on public.invites for select using (public.has_role(org_id, array['owner']));
create policy invites_insert on public.invites for insert
  with check (public.has_role(org_id, array['owner']) and invited_by = auth.uid() and accepted_at is null);
create policy invites_delete on public.invites for delete using (public.has_role(org_id, array['owner']));

-- customers + events: whole team reads and writes (crew call clients, log dump runs).
create policy customers_read on public.customers for select using (public.is_member(org_id));
create policy customers_insert on public.customers for insert with check (public.is_member(org_id));
create policy customers_update on public.customers for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

create policy events_read on public.events for select using (public.is_member(org_id));
create policy events_insert on public.events for insert with check (public.is_member(org_id));
create policy events_update on public.events for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

-- jobs: whole team reads; owner/office create; crew may update (status, internal
-- notes, block reason). Column-level limits for crew are in jobs_crew_guard.
create policy jobs_read on public.jobs for select using (public.is_member(org_id));
create policy jobs_insert on public.jobs for insert with check (public.has_role(org_id, array['owner', 'office']));
create policy jobs_update on public.jobs for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

create or replace function public.jobs_crew_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.member_role(new.org_id) = 'crew' then
    -- Crew may change only workflow fields.
    if (to_jsonb(new) - array['status', 'block_reason', 'internal_notes', 'created_at', 'updated_at', 'updated_by', 'sync_txid'])
       is distinct from (to_jsonb(old) - array['status', 'block_reason', 'internal_notes', 'created_at', 'updated_at', 'updated_by', 'sync_txid']) then
      raise exception 'Crew can only update job status and internal notes';
    end if;
    if new.status not in ('scheduled', 'in_progress', 'blocked', 'done') then
      raise exception 'Crew cannot set status %', new.status;
    end if;
  end if;
  return new;
end;
$$;
create trigger jobs_crew_guard before update on public.jobs
  for each row execute function public.jobs_crew_guard();

-- job_pricing: owner/office only, in every direction.
create policy job_pricing_read on public.job_pricing for select using (public.has_role(org_id, array['owner', 'office']));
create policy job_pricing_insert on public.job_pricing for insert with check (public.has_role(org_id, array['owner', 'office']));
create policy job_pricing_update on public.job_pricing for update
  using (public.has_role(org_id, array['owner', 'office'])) with check (public.has_role(org_id, array['owner', 'office']));

-- No DELETE policies on synced tables: clients soft-delete with deleted_at.

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create a company; the caller becomes its owner.
create or replace function public.create_organization(p_name text, p_display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Company name is required'; end if;
  insert into public.organizations (name) values (trim(p_name)) returning id into v_org;
  insert into public.org_pricing (org_id) values (v_org);
  insert into public.members (org_id, user_id, role, display_name)
    values (v_org, auth.uid(), 'owner', coalesce(p_display_name, ''));
  return v_org;
end;
$$;

-- Accept an invite sent to the signed-in user's email address.
create or replace function public.accept_invite(p_token uuid, p_display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invites;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_inv from public.invites where token = p_token for update;
  if not found then raise exception 'Invite not found'; end if;
  if v_inv.accepted_at is not null then raise exception 'Invite already used'; end if;
  if v_inv.expires_at < now() then raise exception 'Invite expired'; end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'This invite was sent to a different email address';
  end if;
  insert into public.members (org_id, user_id, role, display_name)
    values (v_inv.org_id, auth.uid(), v_inv.role, coalesce(p_display_name, ''))
    on conflict (org_id, user_id) do update
      set role = excluded.role, deleted_at = null,
          display_name = coalesce(nullif(excluded.display_name, ''), public.members.display_name);
  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  return v_inv.org_id;
end;
$$;

-- Reserve a block of document numbers so offline devices never collide.
-- Returns the first number in the block; the caller owns [first, first + count).
create or replace function public.reserve_numbers(p_org uuid, p_kind text, p_count integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_first integer;
begin
  if not public.has_role(p_org, array['owner', 'office']) then
    raise exception 'Not allowed';
  end if;
  if p_count < 1 or p_count > 100 then raise exception 'Count must be 1-100'; end if;
  if p_kind = 'estimate' then
    update public.organizations set next_estimate_no = next_estimate_no + p_count
      where id = p_org returning next_estimate_no - p_count into v_first;
  elsif p_kind = 'invoice' then
    update public.organizations set next_invoice_no = next_invoice_no + p_count
      where id = p_org returning next_invoice_no - p_count into v_first;
  else
    raise exception 'Unknown number kind %', p_kind;
  end if;
  return v_first;
end;
$$;

-- Incremental pull. Runs as the caller, so row-level security applies (crew get
-- no pricing rows). p_since is the cursor returned by the previous pull, or null.
--
-- The cursor is the xmin of the snapshot this pull ran in: every transaction
-- still in flight when we read has a txid >= that value, so the next pull
-- (sync_txid >= cursor) will see its rows once it commits. Re-sent rows are
-- harmless because clients apply them idempotently.
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
    'organizations', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.organizations r
                               where r.id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'org_pricing', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.org_pricing r
                             where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.members r
                         where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.customers r
                           where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.jobs r
                      where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'job_pricing', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.job_pricing r
                             where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.events r
                        where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Companies the signed-in user belongs to (for the company picker / first load).
create or replace function public.my_organizations()
returns table (org_id uuid, name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, m.role
  from public.members m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.deleted_at is null and o.deleted_at is null
  order by o.name
$$;

-- Lock down function execution to signed-in users.
revoke all on function public.create_organization(text, text) from public, anon;
revoke all on function public.accept_invite(uuid, text) from public, anon;
revoke all on function public.reserve_numbers(uuid, text, integer) from public, anon;
revoke all on function public.sync_pull(uuid, text) from public, anon;
revoke all on function public.my_organizations() from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.accept_invite(uuid, text) to authenticated;
grant execute on function public.reserve_numbers(uuid, text, integer) to authenticated;
grant execute on function public.sync_pull(uuid, text) to authenticated;
grant execute on function public.my_organizations() to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.organizations, public.org_pricing, public.members,
  public.customers, public.jobs, public.job_pricing, public.events to authenticated;
grant select, insert, delete on public.invites to authenticated;
