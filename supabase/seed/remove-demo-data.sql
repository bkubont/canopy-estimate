-- Removes the demo data added by demo-data.sql, and nothing else.
-- Every demo row's id starts with de0de000; your real data never does.
-- Run in Supabase → SQL Editor. Phones pick up the removal on their next sync.
--
-- Rows are marked deleted rather than erased, so every phone and tablet drops
-- them from its offline copy on its next sync. Loading the demo data again
-- clears these leftovers first.

begin;
update public.events    set deleted_at = now() where id::text like 'de0de000-%';
update public.payments  set deleted_at = now() where id::text like 'de0de000-%';
update public.invoices  set deleted_at = now() where id::text like 'de0de000-%';
update public.job_pricing set deleted_at = now() where job_id::text like 'de0de000-%';
update public.jobs      set deleted_at = now() where id::text like 'de0de000-%';
update public.customers set deleted_at = now() where id::text like 'de0de000-%';
commit;

select
  (select count(*) from public.jobs where id::text like 'de0de000-%' and deleted_at is not null) as jobs_removed,
  (select count(*) from public.customers where id::text like 'de0de000-%' and deleted_at is not null) as contacts_removed,
  (select count(*) from public.events where id::text like 'de0de000-%' and deleted_at is not null) as calendar_entries_removed;
