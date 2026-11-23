-- Customer search for Contact Sheet's "Link to Canopy customer".
-- Run after 20261126000100_documents_storage.sql.

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
