-- Cancel an estimate or job (customer said no, or backed out) without losing it.
-- A cancelled job keeps its record and history, drops off the board, dashboard
-- and calendar, and can be reopened. Crew can't cancel (jobs_crew_guard only
-- lets crew change status, block_reason and internal_notes).

alter table public.jobs
  add column cancelled_at timestamptz,
  add column cancel_reason text not null default '';

-- The customer's link stops working for a cancelled estimate, and it can't be signed.
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
  if j.cancelled_at is not null then raise exception 'This estimate was cancelled. Please contact us if you have questions.'; end if;
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
  if j.cancelled_at is not null then raise exception 'This estimate was cancelled. Please contact us if you have questions.'; end if;
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

