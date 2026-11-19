-- Phase C: optional property link on jobs so re-open reloads the right site.
-- Nullable; historical jobs stay null. Locked with customer_id once signed.

alter table public.jobs
  add column property_id uuid references public.customer_properties (id) on delete set null;

create index jobs_property_idx on public.jobs (property_id);

-- Keep property_id frozen after signing (same rules as customer_id / client / site).
create or replace function public.jobs_signed_lock()
returns trigger
language plpgsql
as $$
declare
  locked text[] := array['number', 'customer_id', 'property_id', 'client', 'trees', 'site', 'equipment', 'days',
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
  merged := to_jsonb(new) || (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(locked) k);
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
