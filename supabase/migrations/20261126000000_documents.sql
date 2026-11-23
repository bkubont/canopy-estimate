-- Saved document copies + customer work history (for Contact Sheet).
--
-- documents: one frozen PDF per signed estimate version, sent invoice, and paid
-- invoice. Signed estimates and sent invoices are already locked by the server,
-- so the owner's device renders the PDF after sync (even when the customer
-- signed through their link) and files it here. Rows are insert-only.
--
-- customer_history(): one read call that returns a customer's completed jobs
-- with totals, payments and their saved documents. Contact Sheet uses it so it
-- never depends on this app's table layout.
--
-- Run after 20261125000000_smart_lists.sql. The storage bucket lives in
-- 20261126000100_documents_storage.sql.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  kind text not null check (kind in ('estimate', 'invoice', 'receipt')),
  -- What this copy captures, e.g. "<signed_at>|co2" (estimate with 2 change
  -- orders) or "<sent_at>" (invoice). A new key means a new copy.
  version_key text not null,
  number text not null default '',
  total numeric(12, 2),
  path text not null,
  bytes integer not null default 0 check (bytes >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (job_id, kind, version_key)
);
create index documents_org_customer_idx on public.documents (org_id, customer_id);
create index documents_job_idx on public.documents (job_id);

-- Fill customer and check the links belong to the same company.
create or replace function public.documents_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = new.job_id;
  if j.id is null or j.org_id <> new.org_id then
    raise exception 'document job belongs to another company';
  end if;
  if new.invoice_id is not null and not exists (
    select 1 from public.invoices i where i.id = new.invoice_id and i.job_id = new.job_id
  ) then
    raise exception 'document invoice belongs to another job';
  end if;
  if split_part(new.path, '/', 1) <> new.org_id::text then
    raise exception 'document file must be stored under its company';
  end if;
  new.customer_id := j.customer_id;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
create trigger documents_check before insert on public.documents
  for each row execute function public.documents_check();

alter table public.documents enable row level security;
-- Same people who can see prices. No update or delete: copies are final.
create policy documents_read on public.documents for select
  using (public.has_role(org_id, array['owner', 'office']));
create policy documents_insert on public.documents for insert
  with check (public.has_role(org_id, array['owner', 'office']));
grant select, insert on public.documents to authenticated;

-- A customer's completed jobs, newest first.
-- Completed = marked Done, or invoiced, or paid (and not archived or deleted).
create or replace function public.customer_history(p_org uuid, p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(p_org, array['owner', 'office']) then
    raise exception 'Only the owner or office can see work history';
  end if;
  return coalesce((
    select jsonb_agg(row order by row ->> 'work_date' desc nulls last, row ->> 'number' desc)
    from (
      select jsonb_build_object(
        'job_id', j.id,
        'number', j.number,
        'stage', j.stage,
        'status', j.status,
        'estimate_date', j.estimate_date,
        'signed_at', j.signed_at,
        'work_date', (
          select max(nullif(left(e.starts, 10), ''))
          from public.events e
          where e.job_id = j.id and e.type = 'tree_work' and e.deleted_at is null and e.status <> 'cancelled'
        ),
        'property', coalesce(
          (select nullif(concat_ws(', ', nullif(p.street, ''), nullif(p.town, '')), '')
             from public.customer_properties p where p.id = j.property_id),
          nullif(concat_ws(', ', nullif(j.client ->> 'street', ''), nullif(j.client ->> 'town', '')), ''),
          ''
        ),
        'invoice_number', inv.number,
        'total', coalesce(inv.total, jp.total),
        'paid', coalesce((
          select sum(pm.amount) from public.payments pm
          where pm.job_id = j.id and pm.voided_at is null and pm.deleted_at is null
        ), 0),
        'documents', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', d.id, 'kind', d.kind, 'number', d.number, 'total', d.total,
                   'path', d.path, 'bytes', d.bytes, 'created_at', d.created_at)
                 order by d.created_at)
          from public.documents d where d.job_id = j.id
        ), '[]'::jsonb)
      ) as row
      from public.jobs j
      left join public.job_pricing jp on jp.job_id = j.id
      left join lateral (
        select i.number, i.total from public.invoices i
        where i.job_id = j.id and i.status = 'sent' and i.deleted_at is null
        order by i.sent_at desc limit 1
      ) inv on true
      where j.org_id = p_org
        and j.customer_id = p_customer
        and j.deleted_at is null
        and j.stage <> 'archived'
        and (j.status = 'done' or j.stage in ('invoice', 'paid'))
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.customer_history(uuid, uuid) from public, anon;
grant execute on function public.customer_history(uuid, uuid) to authenticated;

-- Suggest which customer a personal contact is, by phone, email or name.
-- Phones match on their last 10 digits.
create or replace function public.match_customers(p_org uuid, p_phones text[], p_emails text[], p_name text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  phones text[] := array(
    select right(regexp_replace(x, '\D', '', 'g'), 10) from unnest(coalesce(p_phones, '{}')) x
    where length(regexp_replace(x, '\D', '', 'g')) >= 7
  );
  emails text[] := array(select lower(trim(x)) from unnest(coalesce(p_emails, '{}')) x where trim(x) <> '');
  nm text := lower(trim(coalesce(p_name, '')));
begin
  if not public.has_role(p_org, array['owner', 'office']) then
    raise exception 'Only the owner or office can link customers';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id,
             'name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
             'company', c.company,
             'town', c.town,
             'matched_on', m.how)
           order by m.rank, c.last_name, c.first_name)
    from public.customers c
    join lateral (
      select how, rank from (
        select 'phone' as how, 1 as rank where exists (
          select 1 from (
            select c.phone as v
            union all select ph.value from public.customer_phones ph where ph.customer_id = c.id and ph.deleted_at is null
          ) all_phones
          where length(regexp_replace(v, '\D', '', 'g')) >= 7
            and right(regexp_replace(v, '\D', '', 'g'), 10) = any (phones)
        )
        union all
        select 'email', 2 where exists (
          select 1 from (
            select c.email as v
            union all select em.value from public.customer_emails em where em.customer_id = c.id and em.deleted_at is null
          ) all_emails
          where lower(trim(v)) = any (emails)
        )
        union all
        select 'name', 3 where nm <> '' and lower(trim(concat_ws(' ', c.first_name, c.last_name))) = nm
      ) hits order by rank limit 1
    ) m on true
    where c.org_id = p_org and c.deleted_at is null
    limit 10
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.match_customers(uuid, text[], text[], text) from public, anon;
grant execute on function public.match_customers(uuid, text[], text[], text) to authenticated;

-- Search customers for linking: every word must appear in the name, company or
-- town (any order, any case). All words are checked here before the limit, so a
-- more specific search always narrows the list instead of hiding the customer.
create or replace function public.search_customers(p_org uuid, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  words text[] := array(
    select w from unnest(regexp_split_to_array(lower(trim(coalesce(p_query, ''))), '\s+')) w where w <> '' limit 6
  );
begin
  if not public.has_role(p_org, array['owner', 'office']) then
    raise exception 'Only the owner or office can link customers';
  end if;
  if coalesce(array_length(words, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id,
             'name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
             'company', c.company,
             'town', c.town,
             'matched_on', 'search')
           order by c.last_name, c.first_name, c.id)
    from (
      select * from public.customers c
      where c.org_id = p_org and c.deleted_at is null
        and (select bool_and(strpos(lower(concat_ws(' ', c.first_name, c.last_name, c.company, c.town)), w) > 0)
             from unnest(words) w)
      order by c.last_name, c.first_name, c.id
      limit 20
    ) c
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.search_customers(uuid, text) from public, anon;
grant execute on function public.search_customers(uuid, text) to authenticated;
