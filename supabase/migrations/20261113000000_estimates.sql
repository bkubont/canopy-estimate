-- Phase 2: signatures, the signed-estimate lock, and the customer link.
--
-- Signatures and the logo are small PNG data URLs stored in the row, so they
-- are on every device offline and print without a network fetch.
-- Pricing stays out of tables crew can read: what the customer agreed to is
-- snapshotted into job_pricing.signed_snapshot (owner/office only).

alter table public.organizations
  add column logo_data text not null default '' check (length(logo_data) < 400000);

alter table public.members
  add column signature_data text not null default '' check (length(signature_data) < 200000);

alter table public.jobs drop column client_sig_path;
alter table public.jobs
  add column client_sig text not null default '' check (length(client_sig) < 300000),
  add column signed_by_name text not null default '',
  add column signed_via text not null default '' check (signed_via in ('', 'device', 'link')),
  add column prepared_by_name text not null default '',
  add column contractor_sig text not null default '' check (length(contractor_sig) < 200000);

-- Customer-facing pricing inputs at the moment of signing:
-- {day_rate, unit_prices: {lineId: price}, tax_rate, additional, deposit_pct, deposit_amt, valid_days}
alter table public.job_pricing add column signed_snapshot jsonb;
-- The customer link shows prices, so its token lives here where crew can't read it.
alter table public.job_pricing add column share_token uuid unique;

-- ---------------------------------------------------------------------------
-- Signed estimates are locked.
--
-- Devices upload whole rows, so a device holding an older, unsigned copy may
-- send it back after the customer has signed (for example when someone adds an
-- internal note). For a signed job the server therefore keeps its own value for
-- every signed field, whatever the device sends; workflow fields (status,
-- internal notes, crew...) still update. Removing a signature is only possible
-- through void_signature(), never through a plain update.
-- ---------------------------------------------------------------------------

create or replace function public.jobs_signed_lock()
returns trigger
language plpgsql
as $$
declare
  locked text[] := array['number', 'customer_id', 'client', 'trees', 'site', 'equipment', 'days',
    'client_notes', 'estimate_date', 'client_sig', 'client_sig_date', 'signed_at', 'signed_by_name',
    'signed_via', 'prepared_by_name', 'contractor_sig'];
  merged jsonb;
  old_len int;
  new_len int;
begin
  if old.signed_at is null then
    return new;
  end if;
  if current_setting('canopy.voiding', true) = 'on' then
    return new;
  end if;
  -- Keep the server's signed content.
  merged := to_jsonb(new) || (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(locked) k);
  -- Change orders are append-only: an older copy (missing newer ones) keeps the
  -- server's list; a copy that adds new ones on top is accepted.
  old_len := jsonb_array_length(old.change_orders);
  new_len := jsonb_array_length(new.change_orders);
  if old_len > 0 and (
       (select jsonb_agg(e order by i) from jsonb_array_elements(new.change_orders) with ordinality t(e, i) where i <= least(old_len, new_len))
       is distinct from
       (select jsonb_agg(e order by i) from jsonb_array_elements(old.change_orders) with ordinality t(e, i) where i <= least(old_len, new_len))
     ) then
    raise exception 'Signed change orders can''t be changed or removed';
  end if;
  if new_len < old_len then
    merged := merged || jsonb_build_object('change_orders', old.change_orders);
  end if;
  new := jsonb_populate_record(new, merged);
  return new;
end;
$$;
create trigger jobs_signed_lock before update on public.jobs
  for each row execute function public.jobs_signed_lock();

create or replace function public.job_pricing_snapshot_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- An older copy from a device never clears the customer link.
  if new.share_token is null then new.share_token := old.share_token; end if;
  if old.signed_snapshot is not null and new.signed_snapshot is distinct from old.signed_snapshot then
    if current_setting('canopy.voiding', true) = 'on' and new.signed_snapshot is null then
      return new;
    end if;
    if new.signed_snapshot is null then
      new.signed_snapshot := old.signed_snapshot; -- older copy: keep what was signed
    else
      raise exception 'The signed price can''t be changed';
    end if;
  end if;
  return new;
end;
$$;
create trigger job_pricing_snapshot_lock before update on public.job_pricing
  for each row execute function public.job_pricing_snapshot_lock();

-- Remove a client's signature (owner/office), e.g. to revise the estimate.
create or replace function public.void_signature(p_job uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.jobs j where j.id = p_job and public.has_role(j.org_id, array['owner', 'office'])) then
    raise exception 'Not allowed';
  end if;
  perform set_config('canopy.voiding', 'on', true);
  update public.jobs set signed_at = null, client_sig = '', client_sig_date = null, signed_by_name = '',
    signed_via = '', status = 'pending', change_orders = '[]'::jsonb
    where id = p_job;
  update public.job_pricing set signed_snapshot = null where job_id = p_job;
  perform set_config('canopy.voiding', 'off', true);
end;
$$;
revoke all on function public.void_signature(uuid) from public, anon;
grant execute on function public.void_signature(uuid) to authenticated;

-- Crew: replaces the Phase 1 rule. Instead of refusing a whole row that differs
-- in fields crew can't edit (which an older copy on a crew phone always will),
-- keep the server's value for those fields and apply only the workflow changes.
create or replace function public.jobs_crew_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := array['status', 'block_reason', 'internal_notes'];
begin
  if public.member_role(new.org_id) = 'crew' then
    new := jsonb_populate_record(new, to_jsonb(old) || (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(allowed) k));
    if new.status is distinct from old.status and new.status not in ('scheduled', 'in_progress', 'blocked', 'done') then
      raise exception 'Crew cannot set status %', new.status;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer link: a private, unguessable URL to view and sign one estimate.
-- ---------------------------------------------------------------------------

create or replace function public.customer_pricing(p public.job_pricing, j public.jobs)
returns jsonb
language sql
stable
as $$
  -- Unit prices include the markup. The rental cost and the markup never leave the server.
  select jsonb_build_object(
    'day_rate', p.day_rate,
    'unit_prices', coalesce((
      select jsonb_object_agg(line ->> 'id', round(coalesce((p.equipment_costs ->> (line ->> 'id'))::numeric, 0) * p.equipment_markup, 2))
      from jsonb_array_elements(j.equipment) line
    ), '{}'::jsonb),
    'tax_rate', p.tax_rate,
    'additional', p.additional,
    'deposit_pct', p.deposit_pct,
    'deposit_amt', p.deposit_amt,
    'valid_days', p.valid_days
  )
$$;
revoke all on function public.customer_pricing(public.job_pricing, public.jobs) from public, anon, authenticated;

create or replace function public.create_share_link(p_job uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_token uuid;
begin
  select p.share_token into v_token
    from public.job_pricing p join public.jobs j on j.id = p.job_id
    where p.job_id = p_job and public.has_role(j.org_id, array['owner', 'office']) and j.deleted_at is null;
  if not found then raise exception 'Not allowed, or the estimate hasn''t synced yet'; end if;
  if v_token is null then
    v_token := gen_random_uuid();
    update public.job_pricing set share_token = v_token where job_id = p_job;
  end if;
  return v_token;
end;
$$;

create or replace function public.customer_view(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j public.jobs;
  p public.job_pricing;
  o public.organizations;
begin
  select * into p from public.job_pricing where share_token = p_token;
  select * into j from public.jobs where id = p.job_id and deleted_at is null;
  if p.job_id is null or j.id is null then raise exception 'This link is no longer valid'; end if;
  select * into o from public.organizations where id = j.org_id;
  return jsonb_build_object(
    'company', jsonb_build_object('name', o.name, 'contact_name', o.contact_name, 'license', o.license,
      'address', o.address, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_data', o.logo_data),
    'job', jsonb_build_object(
      'number', j.number, 'stage', j.stage, 'estimate_date', j.estimate_date, 'client', j.client,
      -- Strip internal notes from every tree, including trees on change orders.
      'trees', coalesce((select jsonb_agg(t - 'internal_notes') from jsonb_array_elements(j.trees) t), '[]'::jsonb),
      'site', j.site, 'equipment', j.equipment, 'days', j.days, 'client_notes', j.client_notes,
      'change_orders', coalesce((
        select jsonb_agg(co || jsonb_build_object('trees',
          coalesce((select jsonb_agg(t - 'internal_notes') from jsonb_array_elements(co -> 'trees') t), '[]'::jsonb)))
        from jsonb_array_elements(j.change_orders) co), '[]'::jsonb),
      'client_sig', j.client_sig, 'client_sig_date', j.client_sig_date, 'signed_at', j.signed_at,
      'signed_by_name', j.signed_by_name, 'prepared_by_name', j.prepared_by_name, 'contractor_sig', j.contractor_sig
    ),
    'pricing', coalesce(p.signed_snapshot, public.customer_pricing(p, j))
  );
end;
$$;

create or replace function public.customer_sign(p_token uuid, p_sig text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs;
  p public.job_pricing;
  v_today date := (now() at time zone 'America/Detroit')::date;
begin
  select * into p from public.job_pricing where share_token = p_token for update;
  select * into j from public.jobs where id = p.job_id and deleted_at is null for update;
  if p.job_id is null or j.id is null then raise exception 'This link is no longer valid'; end if;
  if j.signed_at is not null then raise exception 'This estimate has already been signed'; end if;
  if coalesce(p_sig, '') !~ '^data:image/png;base64,' or length(p_sig) > 300000 then raise exception 'Please sign in the box'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Please type your name'; end if;
  if j.estimate_date + p.valid_days < v_today then
    raise exception 'This estimate expired on %. Please contact us for an updated one.', to_char(j.estimate_date + p.valid_days, 'Mon DD, YYYY');
  end if;
  update public.jobs set
    client_sig = p_sig, client_sig_date = v_today, signed_at = now(), signed_via = 'link',
    signed_by_name = trim(p_name), status = 'approved'
  where id = j.id;
  update public.job_pricing set signed_snapshot = public.customer_pricing(p, j) where job_id = j.id;
  return public.customer_view(p_token);
end;
$$;

revoke all on function public.create_share_link(uuid) from public, anon;
grant execute on function public.create_share_link(uuid) to authenticated;
-- The customer link works without an account; the token is the key.
revoke all on function public.customer_view(uuid) from public;
revoke all on function public.customer_sign(uuid, text, text) from public;
grant execute on function public.customer_view(uuid) to anon, authenticated;
grant execute on function public.customer_sign(uuid, text, text) to anon, authenticated;
