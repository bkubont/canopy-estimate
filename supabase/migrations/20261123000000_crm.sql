-- Phase A: CRM foundation for absorbing Canopy Clients into Estimate.
--
-- Additive tables (phones, emails, properties, tags, activities) plus org seed
-- and a one-time backfill from flat customer columns. Flat phone/email/address
-- on customers stay populated for backward-compatible reads. CRM UI stays
-- behind CRM_ENABLED (off) until Phase B.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.customer_phones (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  label text not null default 'mobile',
  value text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index customer_phones_customer_idx on public.customer_phones (customer_id);
create index customer_phones_sync_idx on public.customer_phones (org_id, sync_txid);
create trigger customer_phones_touch before insert or update on public.customer_phones
  for each row execute function public.touch_sync_columns();

create table public.customer_emails (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  label text not null default 'work',
  value text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index customer_emails_customer_idx on public.customer_emails (customer_id);
create index customer_emails_sync_idx on public.customer_emails (org_id, sync_txid);
create trigger customer_emails_touch before insert or update on public.customer_emails
  for each row execute function public.touch_sync_columns();

-- Structured site address (D8): street / town / state / ZIP, not a single line.
create table public.customer_properties (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  street text not null default '',
  town text not null default '',
  state text not null default 'MI',
  zip text not null default '',
  gate_code text not null default '',
  access text not null default '',
  hazards jsonb not null default '[]'::jsonb,
  tree_notes text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index customer_properties_customer_idx on public.customer_properties (customer_id);
create index customer_properties_sync_idx on public.customer_properties (org_id, sync_txid);
create trigger customer_properties_touch before insert or update on public.customer_properties
  for each row execute function public.touch_sync_columns();

create table public.tag_groups (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  mode text not null default 'one' check (mode in ('one', 'many')),
  pipeline boolean not null default false,
  allow_new boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create unique index tag_groups_org_slug_live on public.tag_groups (org_id, slug) where deleted_at is null;
create index tag_groups_sync_idx on public.tag_groups (org_id, sync_txid);
create trigger tag_groups_touch before insert or update on public.tag_groups
  for each row execute function public.touch_sync_columns();

create table public.tags (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  tag_group_id uuid not null references public.tag_groups (id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create unique index tags_group_slug_live on public.tags (tag_group_id, slug) where deleted_at is null;
create index tags_group_idx on public.tags (tag_group_id);
create index tags_sync_idx on public.tags (org_id, sync_txid);
create trigger tags_touch before insert or update on public.tags
  for each row execute function public.touch_sync_columns();

-- Composite PK matches members-style sync keys; soft-delete + upsert clears deleted_at.
create table public.customer_tags (
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id(),
  primary key (customer_id, tag_id)
);
create index customer_tags_tag_idx on public.customer_tags (tag_id);
create index customer_tags_sync_idx on public.customer_tags (org_id, sync_txid);
create trigger customer_tags_touch before insert or update on public.customer_tags
  for each row execute function public.touch_sync_columns();

create table public.customer_activities (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  type text not null default 'note'
    check (type in ('note', 'call', 'text', 'stage', 'created', 'imported')),
  body text not null default '',
  at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  sync_txid xid8 not null default pg_current_xact_id()
);
create index customer_activities_customer_idx on public.customer_activities (customer_id, at desc);
create index customer_activities_sync_idx on public.customer_activities (org_id, sync_txid);
create trigger customer_activities_touch before insert or update on public.customer_activities
  for each row execute function public.touch_sync_columns();

-- ---------------------------------------------------------------------------
-- Same-org link guards (customer / tag group must belong to this company)
-- ---------------------------------------------------------------------------

create or replace function public.crm_customer_link_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.customers c where c.id = new.customer_id and c.org_id = new.org_id
  ) then
    raise exception 'linked to another company''s customer';
  end if;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.customer_id := old.customer_id;
  end if;
  return new;
end;
$$;

create trigger customer_phones_links before insert or update on public.customer_phones
  for each row execute function public.crm_customer_link_check();
create trigger customer_emails_links before insert or update on public.customer_emails
  for each row execute function public.crm_customer_link_check();
create trigger customer_properties_links before insert or update on public.customer_properties
  for each row execute function public.crm_customer_link_check();
create trigger customer_activities_links before insert or update on public.customer_activities
  for each row execute function public.crm_customer_link_check();

create or replace function public.crm_tag_link_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tag_groups g where g.id = new.tag_group_id and g.org_id = new.org_id
  ) then
    raise exception 'linked to another company''s tag group';
  end if;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.tag_group_id := old.tag_group_id;
  end if;
  return new;
end;
$$;
create trigger tags_links before insert or update on public.tags
  for each row execute function public.crm_tag_link_check();

create or replace function public.crm_customer_tag_link_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.customers c where c.id = new.customer_id and c.org_id = new.org_id
  ) then
    raise exception 'linked to another company''s customer';
  end if;
  if not exists (
    select 1 from public.tags t where t.id = new.tag_id and t.org_id = new.org_id
  ) then
    raise exception 'linked to another company''s tag';
  end if;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.customer_id := old.customer_id;
    new.tag_id := old.tag_id;
  end if;
  return new;
end;
$$;
create trigger customer_tags_links before insert or update on public.customer_tags
  for each row execute function public.crm_customer_tag_link_check();

-- ---------------------------------------------------------------------------
-- RLS: whole team reads and writes (same as customers)
-- ---------------------------------------------------------------------------

alter table public.customer_phones enable row level security;
create policy customer_phones_read on public.customer_phones for select using (public.is_member(org_id));
create policy customer_phones_insert on public.customer_phones for insert with check (public.is_member(org_id));
create policy customer_phones_update on public.customer_phones for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

alter table public.customer_emails enable row level security;
create policy customer_emails_read on public.customer_emails for select using (public.is_member(org_id));
create policy customer_emails_insert on public.customer_emails for insert with check (public.is_member(org_id));
create policy customer_emails_update on public.customer_emails for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

alter table public.customer_properties enable row level security;
create policy customer_properties_read on public.customer_properties for select using (public.is_member(org_id));
create policy customer_properties_insert on public.customer_properties for insert with check (public.is_member(org_id));
create policy customer_properties_update on public.customer_properties for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

alter table public.tag_groups enable row level security;
create policy tag_groups_read on public.tag_groups for select using (public.is_member(org_id));
create policy tag_groups_insert on public.tag_groups for insert with check (public.is_member(org_id));
create policy tag_groups_update on public.tag_groups for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

alter table public.tags enable row level security;
create policy tags_read on public.tags for select using (public.is_member(org_id));
create policy tags_insert on public.tags for insert with check (public.is_member(org_id));
create policy tags_update on public.tags for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

alter table public.customer_tags enable row level security;
create policy customer_tags_read on public.customer_tags for select using (public.is_member(org_id));
create policy customer_tags_insert on public.customer_tags for insert with check (public.is_member(org_id));
create policy customer_tags_update on public.customer_tags for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

alter table public.customer_activities enable row level security;
create policy customer_activities_read on public.customer_activities for select using (public.is_member(org_id));
create policy customer_activities_insert on public.customer_activities for insert with check (public.is_member(org_id));
create policy customer_activities_update on public.customer_activities for update
  using (public.is_member(org_id)) with check (public.is_member(org_id));

grant select, insert, update on
  public.customer_phones, public.customer_emails, public.customer_properties,
  public.tag_groups, public.tags, public.customer_tags, public.customer_activities
  to authenticated;

-- ---------------------------------------------------------------------------
-- Seed default tag groups (port of Clients starter.ts)
-- ---------------------------------------------------------------------------

create or replace function public.seed_org_crm_tags(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage uuid;
  v_type uuid;
  v_source uuid;
  v_services uuid;
  v_flags uuid;
  v_network uuid;
begin
  if exists (select 1 from public.tag_groups where org_id = p_org and slug = 'stage' and deleted_at is null) then
    return;
  end if;

  v_stage := gen_random_uuid();
  v_type := gen_random_uuid();
  v_source := gen_random_uuid();
  v_services := gen_random_uuid();
  v_flags := gen_random_uuid();
  v_network := gen_random_uuid();

  insert into public.tag_groups (id, org_id, name, slug, mode, pipeline, allow_new, sort) values
    (v_stage, p_org, 'Stage', 'stage', 'one', true, false, 0),
    (v_type, p_org, 'Customer type', 'type', 'one', false, false, 1),
    (v_source, p_org, 'Lead source', 'source', 'one', false, false, 2),
    (v_services, p_org, 'Services', 'services', 'many', false, false, 3),
    (v_flags, p_org, 'Job flags', 'flags', 'many', false, true, 4),
    (v_network, p_org, 'Network', 'network', 'many', false, false, 5);

  insert into public.tags (id, org_id, tag_group_id, name, slug, color, sort) values
    (gen_random_uuid(), p_org, v_stage, 'New lead', 'new', '#2a72d4', 0),
    (gen_random_uuid(), p_org, v_stage, 'Estimate set', 'est-set', '#c48a00', 1),
    (gen_random_uuid(), p_org, v_stage, 'Estimate sent', 'est-sent', '#c48a00', 2),
    (gen_random_uuid(), p_org, v_stage, 'Booked', 'booked', '#e85a0c', 3),
    (gen_random_uuid(), p_org, v_stage, 'Complete', 'complete', '#23914f', 4),
    (gen_random_uuid(), p_org, v_stage, 'Past customer', 'past', '#7b8676', 5),

    (gen_random_uuid(), p_org, v_type, 'Residential', 'residential', '', 0),
    (gen_random_uuid(), p_org, v_type, 'Commercial', 'commercial', '', 1),
    (gen_random_uuid(), p_org, v_type, 'HOA / Property mgr', 'hoa-property-mgr', '', 2),
    (gen_random_uuid(), p_org, v_type, 'Municipal', 'municipal', '', 3),

    (gen_random_uuid(), p_org, v_source, 'Google', 'google', '', 0),
    (gen_random_uuid(), p_org, v_source, 'Referral', 'referral', '', 1),
    (gen_random_uuid(), p_org, v_source, 'Yard sign / Door hanger', 'yard-sign-door-hanger', '', 2),
    (gen_random_uuid(), p_org, v_source, 'Facebook / Nextdoor', 'facebook-nextdoor', '', 3),
    (gen_random_uuid(), p_org, v_source, 'Storm call', 'storm-call', '', 4),
    (gen_random_uuid(), p_org, v_source, 'Repeat', 'repeat', '', 5),

    (gen_random_uuid(), p_org, v_services, 'Removal', 'removal', '', 0),
    (gen_random_uuid(), p_org, v_services, 'Trim / Prune', 'trim-prune', '', 1),
    (gen_random_uuid(), p_org, v_services, 'Stump grinding', 'stump-grinding', '', 2),
    (gen_random_uuid(), p_org, v_services, 'Storm / Emergency', 'storm-emergency', '', 3),
    (gen_random_uuid(), p_org, v_services, 'Lot clearing', 'lot-clearing', '', 4),
    (gen_random_uuid(), p_org, v_services, 'Cabling', 'cabling', '', 5),
    (gen_random_uuid(), p_org, v_services, 'Plant health', 'plant-health', '', 6),

    (gen_random_uuid(), p_org, v_flags, 'Crane job', 'crane-job', '', 0),
    (gen_random_uuid(), p_org, v_flags, 'Power lines', 'power-lines', '', 1),
    (gen_random_uuid(), p_org, v_flags, 'Dog', 'dog', '', 2),
    (gen_random_uuid(), p_org, v_flags, 'Wants firewood', 'wants-firewood', '', 3),
    (gen_random_uuid(), p_org, v_flags, 'Wants chips', 'wants-chips', '', 4),
    (gen_random_uuid(), p_org, v_flags, 'Annual customer', 'annual-customer', '', 5),
    (gen_random_uuid(), p_org, v_flags, 'Do not text', 'do-not-text', '', 6),

    (gen_random_uuid(), p_org, v_network, 'Subcontractor', 'subcontractor', '', 0),
    (gen_random_uuid(), p_org, v_network, 'Crane operator', 'crane-operator', '', 1),
    (gen_random_uuid(), p_org, v_network, 'Insurance adjuster', 'insurance-adjuster', '', 2),
    (gen_random_uuid(), p_org, v_network, 'Realtor', 'realtor', '', 3),
    (gen_random_uuid(), p_org, v_network, 'Landscaper', 'landscaper', '', 4),
    (gen_random_uuid(), p_org, v_network, 'Dump site', 'dump-site', '', 5);
end;
$$;

revoke all on function public.seed_org_crm_tags(uuid) from public, anon, authenticated;

-- New companies get the starter taxonomy.
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
  return v_org;
end;
$$;

-- Existing companies: seed once.
do $$
declare r record;
begin
  for r in select id from public.organizations where deleted_at is null loop
    perform public.seed_org_crm_tags(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill from flat customer columns
-- ---------------------------------------------------------------------------

-- Primary phone / email / property from flat fields (leave flat columns intact).
insert into public.customer_phones (id, org_id, customer_id, label, value, sort)
select gen_random_uuid(), c.org_id, c.id, 'mobile', c.phone, 0
from public.customers c
where c.deleted_at is null and nullif(trim(c.phone), '') is not null
  and not exists (
    select 1 from public.customer_phones p
    where p.customer_id = c.id and p.deleted_at is null
  );

insert into public.customer_emails (id, org_id, customer_id, label, value, sort)
select gen_random_uuid(), c.org_id, c.id, 'work', c.email, 0
from public.customers c
where c.deleted_at is null and nullif(trim(c.email), '') is not null
  and not exists (
    select 1 from public.customer_emails e
    where e.customer_id = c.id and e.deleted_at is null
  );

insert into public.customer_properties (id, org_id, customer_id, street, town, state, zip, sort)
select gen_random_uuid(), c.org_id, c.id, c.street, c.town, coalesce(nullif(trim(c.state), ''), 'MI'), c.zip, 0
from public.customers c
where c.deleted_at is null
  and (
    nullif(trim(c.street), '') is not null
    or nullif(trim(c.town), '') is not null
    or nullif(trim(c.zip), '') is not null
  )
  and not exists (
    select 1 from public.customer_properties p
    where p.customer_id = c.id and p.deleted_at is null
  );

-- D3: Past customer if they have a paid or signed job; otherwise leave unstaged.
insert into public.customer_tags (org_id, customer_id, tag_id)
select distinct c.org_id, c.id, t.id
from public.customers c
join public.jobs j on j.customer_id = c.id and j.org_id = c.org_id and j.deleted_at is null
  and (j.stage = 'paid' or j.signed_at is not null)
join public.tag_groups g on g.org_id = c.org_id and g.slug = 'stage' and g.deleted_at is null
join public.tags t on t.tag_group_id = g.id and t.slug = 'past' and t.deleted_at is null
where c.deleted_at is null
on conflict (customer_id, tag_id) do update set deleted_at = null;

-- ---------------------------------------------------------------------------
-- sync_pull: include CRM tables
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
