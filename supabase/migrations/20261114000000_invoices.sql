-- Phase 3: invoices and payments (cash, check, other; card via Stripe later).
--
-- * Owner/office only. Crew devices never receive invoices or payments.
-- * The server computes every invoice's totals from its lines, so all devices
--   and the customer link agree to the cent.
-- * A sent invoice is locked: an older copy uploaded by another device keeps
--   the server's sent content. Voiding is a status change and is final.
-- * Payments belong to the job, so a deposit taken at signing counts against
--   the invoice made later. Balance = invoice total - payments not voided.

alter table public.organizations
  add column payment_instructions text not null default '';
alter table public.org_pricing
  add column invoice_due_days integer not null default 15 check (invoice_due_days between 0 and 120);

create table public.invoices (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'void')),
  issue_date date not null default current_date,
  due_date date not null default current_date,
  -- [{id, desc, qty, unit, taxable}]; amounts are computed by the server.
  lines jsonb not null default '[]'::jsonb,
  tax_rate numeric(6, 3) not null default 0 check (tax_rate >= 0),
  subtotal numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  notes text not null default '',
  internal_notes text not null default '',
  sent_at timestamptz,
  voided_at timestamptz,
  share_token uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id(),
  unique (org_id, number)
);
-- One live invoice per job.
create unique index invoices_one_per_job on public.invoices (job_id) where status <> 'void' and deleted_at is null;
create index invoices_sync_idx on public.invoices (org_id, sync_txid);

create table public.payments (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'check', 'card', 'other')),
  reference text not null default '',
  received_on date not null default current_date,
  note text not null default '',
  recorded_by_name text not null default '',
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index payments_job_idx on public.payments (job_id);
create index payments_sync_idx on public.payments (org_id, sync_txid);

create trigger invoices_touch before insert or update on public.invoices
  for each row execute function public.touch_sync_columns();
create trigger payments_touch before insert or update on public.payments
  for each row execute function public.touch_sync_columns();

-- ---------------------------------------------------------------------------
-- Invoice totals, the sent lock, and payment rules
-- ---------------------------------------------------------------------------

create or replace function public.invoices_compute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  locked text[] := array['job_id', 'number', 'issue_date', 'due_date', 'lines', 'tax_rate', 'notes', 'sent_at'];
  taxable numeric;
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'invoice job belongs to another company';
  end if;

  if tg_op = 'UPDATE' then
    -- Void is final; an older copy can't bring a voided invoice back.
    if old.status = 'void' then
      new := jsonb_populate_record(new, to_jsonb(new) || jsonb_build_object('status', 'void', 'voided_at', old.voided_at)
        || (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(locked) k));
    elsif old.sent_at is not null then
      -- Sent: keep the server's sent content; only void or notes for the team may change.
      new := jsonb_populate_record(new, to_jsonb(new) || (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(locked) k));
      if new.status <> 'void' then new.status := 'sent'; end if;
    end if;
  end if;

  if new.status = 'sent' and new.sent_at is null then new.sent_at := now(); end if;
  if new.status = 'void' and new.voided_at is null then new.voided_at := now(); end if;

  -- Totals come from the lines, every time.
  select coalesce(sum(round(coalesce((l ->> 'qty')::numeric, 0) * coalesce((l ->> 'unit')::numeric, 0), 2)), 0),
         coalesce(sum(round(coalesce((l ->> 'qty')::numeric, 0) * coalesce((l ->> 'unit')::numeric, 0), 2))
                  filter (where coalesce((l ->> 'taxable')::boolean, true)), 0)
    into new.subtotal, taxable
    from jsonb_array_elements(new.lines) l;
  new.tax := round(taxable * new.tax_rate / 100, 2);
  new.total := new.subtotal + new.tax;
  return new;
end;
$$;
create trigger invoices_compute before insert or update on public.invoices
  for each row execute function public.invoices_compute();

create or replace function public.payments_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'payment job belongs to another company';
  end if;
  if new.invoice_id is not null and not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.job_id = new.job_id) then
    raise exception 'payment invoice belongs to another job';
  end if;
  if tg_op = 'UPDATE' and old.voided_at is not null then
    new.voided_at := old.voided_at; -- voiding a payment is final
  end if;
  return new;
end;
$$;
create trigger payments_check before insert or update on public.payments
  for each row execute function public.payments_check();

-- Keep the job's stage in step: invoice sent → 'invoice'; nothing left owing → 'paid'.
create or replace function public.refresh_job_stage(p_job uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  paid numeric;
  next_stage text;
begin
  select * into inv from public.invoices where job_id = p_job and status = 'sent' and deleted_at is null;
  select coalesce(sum(amount), 0) into paid from public.payments where job_id = p_job and voided_at is null and deleted_at is null;
  if inv.id is null then
    next_stage := null; -- no sent invoice: leave the stage alone unless it was invoice/paid
    update public.jobs set stage = 'estimate' where id = p_job and stage in ('invoice', 'paid');
    return;
  end if;
  next_stage := case when paid >= inv.total then 'paid' else 'invoice' end;
  update public.jobs set stage = next_stage where id = p_job and stage is distinct from next_stage;
end;
$$;
revoke all on function public.refresh_job_stage(uuid) from public, anon, authenticated;

create or replace function public.after_money_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_job_stage(new.job_id);
  return null;
end;
$$;
create trigger invoices_stage after insert or update on public.invoices
  for each row execute function public.after_money_change();
create trigger payments_stage after insert or update on public.payments
  for each row execute function public.after_money_change();

-- ---------------------------------------------------------------------------
-- Security: owner and office only
-- ---------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.payments enable row level security;

create policy invoices_read on public.invoices for select using (public.has_role(org_id, array['owner', 'office']));
create policy invoices_insert on public.invoices for insert with check (public.has_role(org_id, array['owner', 'office']));
create policy invoices_update on public.invoices for update
  using (public.has_role(org_id, array['owner', 'office'])) with check (public.has_role(org_id, array['owner', 'office']));
create policy payments_read on public.payments for select using (public.has_role(org_id, array['owner', 'office']));
create policy payments_insert on public.payments for insert with check (public.has_role(org_id, array['owner', 'office']));
create policy payments_update on public.payments for update
  using (public.has_role(org_id, array['owner', 'office'])) with check (public.has_role(org_id, array['owner', 'office']));
grant select, insert, update on public.invoices, public.payments to authenticated;

-- ---------------------------------------------------------------------------
-- Sync: add the new tables (RLS keeps them off crew devices).
-- ---------------------------------------------------------------------------

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
    'events', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.events r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer invoice link
-- ---------------------------------------------------------------------------

create or replace function public.create_invoice_link(p_invoice uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_token uuid;
begin
  select share_token into v_token from public.invoices i
    where i.id = p_invoice and public.has_role(i.org_id, array['owner', 'office']) and i.status = 'sent' and i.deleted_at is null;
  if not found then raise exception 'Send the invoice first (and make sure it has synced)'; end if;
  if v_token is null then
    v_token := gen_random_uuid();
    update public.invoices set share_token = v_token where id = p_invoice;
  end if;
  return v_token;
end;
$$;

create or replace function public.invoice_view(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.invoices;
  j public.jobs;
  o public.organizations;
  paid numeric;
begin
  select * into i from public.invoices where share_token = p_token and deleted_at is null and status <> 'draft';
  if not found then raise exception 'This link is no longer valid'; end if;
  select * into j from public.jobs where id = i.job_id;
  select * into o from public.organizations where id = i.org_id;
  select coalesce(sum(amount), 0) into paid from public.payments where job_id = i.job_id and voided_at is null and deleted_at is null;
  return jsonb_build_object(
    'company', jsonb_build_object('name', o.name, 'contact_name', o.contact_name, 'license', o.license, 'address', o.address,
      'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_data', o.logo_data, 'payment_instructions', o.payment_instructions),
    'invoice', jsonb_build_object('number', i.number, 'status', i.status, 'issue_date', i.issue_date, 'due_date', i.due_date,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l ->> 'id', 'desc', l ->> 'desc', 'qty', (l ->> 'qty')::numeric,
        'unit', (l ->> 'unit')::numeric, 'taxable', coalesce((l ->> 'taxable')::boolean, true))), '[]'::jsonb) from jsonb_array_elements(i.lines) l),
      'tax_rate', i.tax_rate, 'subtotal', i.subtotal, 'tax', i.tax, 'total', i.total, 'notes', i.notes),
    'job', jsonb_build_object('number', j.number, 'client', j.client),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('received_on', p.received_on, 'amount', p.amount, 'method', p.method) order by p.received_on)
      from public.payments p where p.job_id = i.job_id and p.voided_at is null and p.deleted_at is null), '[]'::jsonb),
    'paid', paid,
    'balance', greatest(i.total - paid, 0)
  );
end;
$$;

revoke all on function public.create_invoice_link(uuid) from public, anon;
grant execute on function public.create_invoice_link(uuid) to authenticated;
revoke all on function public.invoice_view(uuid) from public;
grant execute on function public.invoice_view(uuid) to anon, authenticated;
