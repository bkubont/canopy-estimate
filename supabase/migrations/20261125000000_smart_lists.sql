-- Phase E (D7): Smart lists — saved CRM filters for People / Today.
-- Org-scoped definitions sync via IndexedDB/outbox like other CRM tables.
-- Tag/stage filters use stable slugs so lists stay valid across devices.

create table public.smart_lists (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  query text not null default '',
  -- Pipeline stage slugs (e.g. "new", "est-sent"). Empty = any stage.
  stage_slugs jsonb not null default '[]'::jsonb,
  -- Extra tag filters as [{ "group": "flags", "tag": "annual-customer" }, ...] (AND).
  tag_refs jsonb not null default '[]'::jsonb,
  -- Estimates sent more than 7 days ago (Clients “going cold”).
  cold_only boolean not null default false,
  -- Show as a section on Today when true.
  pin_today boolean not null default false,
  sort integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index smart_lists_org_sort_idx on public.smart_lists (org_id, sort);
create index smart_lists_sync_idx on public.smart_lists (org_id, sync_txid);
create trigger smart_lists_touch before insert or update on public.smart_lists
  for each row execute function public.touch_sync_columns();

alter table public.smart_lists enable row level security;
create policy smart_lists_read on public.smart_lists for select using (public.is_member(org_id));
create policy smart_lists_insert on public.smart_lists for insert with check (public.is_member(org_id));
create policy smart_lists_update on public.smart_lists for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

grant select, insert, update on public.smart_lists to authenticated;

-- ---------------------------------------------------------------------------
-- Seed starter lists (Clients M4 examples)
-- ---------------------------------------------------------------------------

create or replace function public.seed_org_smart_lists(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.smart_lists where org_id = p_org and deleted_at is null) then
    return;
  end if;

  insert into public.smart_lists (id, org_id, name, query, stage_slugs, tag_refs, cold_only, pin_today, sort) values
    (gen_random_uuid(), p_org, 'Estimates going cold', '', '[]'::jsonb, '[]'::jsonb, true, true, 0),
    (gen_random_uuid(), p_org, 'New leads', '', '["new"]'::jsonb, '[]'::jsonb, false, false, 1),
    (gen_random_uuid(), p_org, 'Annual customers', '', '[]'::jsonb, '[{"group":"flags","tag":"annual-customer"}]'::jsonb, false, false, 2);
end;
$$;

revoke all on function public.seed_org_smart_lists(uuid) from public, anon, authenticated;

-- New companies: CRM tags then smart lists.
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
  perform public.seed_org_crm_tags(v_org);
  perform public.seed_org_smart_lists(v_org);
  return v_org;
end;
$$;

-- Existing companies: seed once.
do $$
declare r record;
begin
  for r in select id from public.organizations where deleted_at is null loop
    perform public.seed_org_smart_lists(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- sync_pull: include smart_lists
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
    'tag_groups', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.tag_groups r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.tags r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'customer_phones', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.customer_phones r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'customer_emails', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.customer_emails r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'customer_properties', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.customer_properties r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'customer_tags', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.customer_tags r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'customer_activities', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.customer_activities r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
    'smart_lists', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.smart_lists r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb),
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
