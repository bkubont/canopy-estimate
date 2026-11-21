-- Soft-clear operational playground data for the company org.
-- Keeps: organizations, members, org_pricing, invites, calendar_feeds,
--        tag_groups / tags (CRM taxonomy), auth users.
-- Soft-deletes (sync-safe): customers, jobs, CRM child rows, smart_lists,
--        calendar events, invoices/payments, photos, expenses, hours.
--
-- Run in Supabase → SQL Editor AFTER confirming the org below.
-- Then run remove-demo-data.sql (optional; clear already covers demo rows)
-- and demo-data.sql to reload.

-- 1) Confirm which company will be cleared. Expect one ATS row.
select id, name, created_at
from public.organizations
where deleted_at is null
order by created_at;

-- 2) Soft-wipe ops for the oldest live org (the ATS company).
--    Abort if more than one live org exists — set v_org manually instead.
do $clear$
declare
  v_org uuid;
  v_name text;
  n_orgs int;
begin
  select count(*) into n_orgs from public.organizations where deleted_at is null;
  if n_orgs = 0 then
    raise exception 'No live organization found.';
  end if;
  if n_orgs > 1 then
    raise exception 'Multiple live orgs (%). Edit this script to set v_org explicitly.', n_orgs;
  end if;

  select id, name into v_org, v_name
  from public.organizations
  where deleted_at is null
  order by created_at
  limit 1;

  raise notice 'Clearing operational data for org % (%)', v_name, v_org;

  -- Money / calendar / field first (FK children), then jobs, then CRM, then customers.
  update public.payments set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.invoices set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.expenses set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.time_entries set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.photos set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.events set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;

  update public.job_pricing set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.jobs set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;

  update public.customer_activities set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.customer_tags set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.customer_phones set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.customer_emails set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.customer_properties set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;
  update public.customers set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;

  update public.smart_lists set deleted_at = coalesce(deleted_at, now())
    where org_id = v_org and deleted_at is null;

  -- Ensure starter CRM taxonomy + smart lists exist after wipe.
  perform public.seed_org_crm_tags(v_org);
  perform public.seed_org_smart_lists(v_org);

  raise notice 'Done clearing %. Auth users, membership, and tag taxonomy kept.', v_name;
end
$clear$;

-- 3) Counts that should be zero (live rows) after clear.
select
  (select count(*) from public.customers where deleted_at is null) as customers_live,
  (select count(*) from public.jobs where deleted_at is null) as jobs_live,
  (select count(*) from public.customer_tags where deleted_at is null) as customer_tags_live,
  (select count(*) from public.smart_lists where deleted_at is null) as smart_lists_live,
  (select count(*) from public.tag_groups where deleted_at is null) as tag_groups_kept,
  (select count(*) from public.members where deleted_at is null) as members_kept;
