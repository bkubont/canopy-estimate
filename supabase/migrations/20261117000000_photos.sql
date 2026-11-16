-- Phase 5, step 4: photos.
--
-- Pictures of trees (for planning) and of jobs (before / during / after), and,
-- from step 5, receipts. The picture itself is a file in the private
-- "org-files" storage bucket at "<org_id>/photos/<id>.jpg" (receipts:
-- "<org_id>/receipts/<id>.jpg"); this table is the list the app syncs.
--
-- Everyone on the team sees and adds tree and job photos. Receipts are money:
-- crew may add one (say, for fuel) but never see them; owner/office see all.

create table public.photos (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  tree_id text,
  kind text not null check (kind in ('tree', 'before', 'during', 'after', 'receipt')),
  path text not null,
  width integer not null default 0,
  height integer not null default 0,
  bytes integer not null default 0,
  taken_by uuid,
  taken_by_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index photos_job_idx on public.photos (job_id);
create index photos_sync_idx on public.photos (org_id, sync_txid);
create trigger photos_touch before insert or update on public.photos
  for each row execute function public.touch_sync_columns();

create or replace function public.photos_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Once taken, a photo's company, kind, file and photographer never change.
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.kind := old.kind;
    new.path := old.path;
    new.taken_by := old.taken_by;
  end if;
  if new.job_id is not null and not exists (select 1 from public.jobs j where j.id = new.job_id and j.org_id = new.org_id) then
    raise exception 'photo is linked to another company''s job';
  end if;
  if new.path not like new.org_id::text || '/%' then
    raise exception 'photo file must be in this company''s folder';
  end if;
  return new;
end;
$$;
create trigger photos_check before insert or update on public.photos
  for each row execute function public.photos_check();

alter table public.photos enable row level security;
create policy photos_read on public.photos for select
  using (public.is_member(org_id) and (kind <> 'receipt' or public.has_role(org_id, array['owner', 'office'])));
create policy photos_insert on public.photos for insert
  with check (public.is_member(org_id));
create policy photos_update on public.photos for update
  using (public.is_member(org_id) and (kind <> 'receipt' or public.has_role(org_id, array['owner', 'office'])))
  with check (public.is_member(org_id));
grant select, insert, update on public.photos to authenticated;

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
    'photos', coalesce((select jsonb_agg(to_jsonb(r) - 'sync_txid') from public.photos r where r.org_id = p_org and r.sync_txid >= v_since), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
