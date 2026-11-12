-- Security and sync tests. Each block signs in as a different person and checks
-- what they can and cannot see or change. Any failed check aborts the run.

create schema t;
grant usage on schema t to authenticated;

create function t.login(p_uid uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, false);
$$;
create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;
create function t.fails(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_pattern || '%' then
      raise notice 'ok - %', p_msg;
      return;
    end if;
    raise exception 'FAILED: % (wrong error: %)', p_msg, sqlerrm;
  end;
  raise exception 'FAILED: % (no error raised)', p_msg;
end $$;
grant execute on all functions in schema t to authenticated;
create table t.ids (k text primary key, v text);
grant all on t.ids to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'owner@ats.test'),
  ('00000000-0000-0000-0000-00000000000b', 'office@ats.test'),
  ('00000000-0000-0000-0000-00000000000c', 'crew@ats.test'),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@other.test');

\set owner   '''00000000-0000-0000-0000-00000000000a'''
\set office  '''00000000-0000-0000-0000-00000000000b'''
\set crew    '''00000000-0000-0000-0000-00000000000c'''
\set stranger '''00000000-0000-0000-0000-00000000000d'''
\set job     '''11111111-1111-1111-1111-111111111111'''
\set cust    '''22222222-2222-2222-2222-222222222222'''

-- ---------------------------------------------------------------- owner setup
select t.login(:owner, 'owner@ats.test');
set role authenticated;

insert into t.ids select 'org', public.create_organization('Advanced Tree Service', 'Joey');
select t.ok((select count(*) = 1 from public.my_organizations() where role = 'owner'), 'owner sees their new company');

insert into public.customers (id, org_id, first_name, last_name, phone)
  select :cust, v::uuid, 'Dana', 'Smith', '231-555-0101' from t.ids where k = 'org';
insert into public.jobs (id, org_id, number, customer_id, internal_notes, trees)
  select :job, v::uuid, 'E-1001', :cust, 'Dog in back yard', '[{"species":"Sugar Maple"}]' from t.ids where k = 'org';
insert into public.job_pricing (job_id, org_id, day_rate, equipment_costs, total)
  select :job, v::uuid, 2000, '{"line1": 285}', 2342 from t.ids where k = 'org';

select t.ok((select public.reserve_numbers(v::uuid, 'estimate', 20) = 1001 from t.ids where k = 'org'), 'first number block starts at 1001');
select t.ok((select public.reserve_numbers(v::uuid, 'estimate', 20) = 1021 from t.ids where k = 'org'), 'second block does not overlap the first');
select t.ok((select public.reserve_numbers(v::uuid, 'invoice', 5) = 1001 from t.ids where k = 'org'), 'invoice numbers are counted separately');

insert into public.invites (org_id, email, role, invited_by, token)
  select v::uuid, 'office@ats.test', 'office', :owner, 'aaaaaaaa-0000-0000-0000-000000000001' from t.ids where k = 'org';
insert into public.invites (org_id, email, role, invited_by, token)
  select v::uuid, 'crew@ats.test', 'crew', :owner, 'aaaaaaaa-0000-0000-0000-000000000002' from t.ids where k = 'org';

select t.fails($$ update public.members set role = 'crew' where user_id = auth.uid() $$,
  'at least one owner', 'the only owner cannot demote themselves');

-- ---------------------------------------------------------------- invites
select t.login(:stranger, 'stranger@other.test');
select t.fails($$ select public.accept_invite('aaaaaaaa-0000-0000-0000-000000000002') $$,
  'different email', 'an invite cannot be used by someone it was not sent to');

select t.login(:office, 'office@ats.test');
select public.accept_invite('aaaaaaaa-0000-0000-0000-000000000001', 'Office Pat');
select t.fails($$ select public.accept_invite('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'already used', 'an invite works only once');

select t.login(:crew, 'crew@ats.test');
select public.accept_invite('aaaaaaaa-0000-0000-0000-000000000002', 'Crew Sam');

-- ---------------------------------------------------------------- crew
select t.ok((select count(*) = 1 from public.jobs), 'crew can see the job');
select t.ok((select internal_notes = 'Dog in back yard' from public.jobs), 'crew can read internal notes');
select t.ok((select count(*) = 0 from public.job_pricing), 'crew cannot see job prices');
select t.ok((select count(*) = 0 from public.org_pricing), 'crew cannot see the day rate');
select t.ok((select jsonb_array_length(public.sync_pull(v::uuid) -> 'job_pricing') = 0 from t.ids where k = 'org'),
  'crew sync pull contains no prices');
select t.ok((select jsonb_array_length(public.sync_pull(v::uuid) -> 'jobs') = 1 from t.ids where k = 'org'),
  'crew sync pull contains the job');

update public.jobs set status = 'in_progress', internal_notes = 'Gate code 4411' where id = :job;
select t.ok((select status = 'in_progress' from public.jobs where id = :job), 'crew can update job status and notes');
-- A device syncing a crew change sends the whole row back, timestamps included.
update public.jobs set status = 'done', created_at = '2000-01-01', updated_at = '2000-01-01' where id = :job;
select t.ok((select status = 'done' and created_at > '2020-01-01' from public.jobs where id = :job),
  'crew full-row sync is accepted and the server keeps its own timestamps');
select t.fails($$ update public.jobs set trees = '[]' where id = '11111111-1111-1111-1111-111111111111' $$,
  'only update job status', 'crew cannot edit the estimate itself');
select t.fails($$ update public.jobs set status = 'pending' where id = '11111111-1111-1111-1111-111111111111' $$,
  'cannot set status', 'crew cannot reset a job to pending');
select t.fails($$ insert into public.jobs (id, org_id, number) select gen_random_uuid(), v::uuid, 'E-9999' from t.ids where k = 'org' $$,
  'row-level security', 'crew cannot create estimates');
select t.fails($$ select public.reserve_numbers(v::uuid, 'estimate', 5) from t.ids where k = 'org' $$,
  'not allowed', 'crew cannot reserve estimate numbers');
select t.fails($$ update public.members set role = 'owner' where user_id = auth.uid() $$,
  'row-level security', 'crew cannot promote themselves');
update public.members set display_name = 'Sam R.' where user_id = auth.uid();
select t.ok((select display_name = 'Sam R.' from public.members where user_id = auth.uid()), 'anyone can change their own display name');
select t.ok((select count(*) = 0 from public.invites), 'crew cannot see invites');

-- ---------------------------------------------------------------- office
select t.login(:office, 'office@ats.test');
select t.ok((select count(*) = 1 from public.job_pricing), 'office can see job prices');
select t.ok((select count(*) = 1 from public.org_pricing), 'office can see the day rate');
update public.org_pricing set day_rate = 1;
select t.ok((select day_rate = 2000 from public.org_pricing), 'office cannot change the company day rate');
select t.fails($$ insert into public.invites (org_id, email, role, invited_by) select v::uuid, 'x@y.z', 'owner', auth.uid() from t.ids where k = 'org' $$,
  'row-level security', 'office cannot invite people');
select t.fails($$ update public.customers set org_id = gen_random_uuid() $$,
  'org_id cannot change', 'rows cannot be moved to another company');

-- ---------------------------------------------------------------- sync cursor
insert into t.ids select 'cursor', public.sync_pull(v::uuid) ->> 'cursor' from t.ids where k = 'org';
select t.ok((select jsonb_array_length(public.sync_pull(o.v::uuid, c.v) -> 'customers') = 0
             from t.ids o, t.ids c where o.k = 'org' and c.k = 'cursor'),
  'pull from the latest cursor returns nothing new');
update public.customers set phone = '231-555-0199' where id = :cust;
select t.ok((select (public.sync_pull(o.v::uuid, c.v) -> 'customers' -> 0 ->> 'phone') = '231-555-0199'
             from t.ids o, t.ids c where o.k = 'org' and c.k = 'cursor'),
  'a change after the cursor is returned by the next pull');
select t.ok((select updated_by = :office::uuid from public.customers where id = :cust), 'server records who made the change');

-- ---------------------------------------------------------------- outsider
select t.login(:stranger, 'stranger@other.test');
select t.ok((select count(*) = 0 from public.jobs), 'outsiders see no jobs');
select t.ok((select count(*) = 0 from public.customers), 'outsiders see no customers');
select t.ok((select count(*) = 0 from public.organizations), 'outsiders see no company');
select t.fails($$ select public.sync_pull(v::uuid) from t.ids where k = 'org' $$,
  'not a member', 'outsiders cannot pull company data');
select t.fails($$ insert into public.customers (id, org_id) select gen_random_uuid(), v::uuid from t.ids where k = 'org' $$,
  'row-level security', 'outsiders cannot add data to the company');
select t.fails($$ delete from public.jobs $$, 'permission denied', 'nobody can hard-delete rows');

reset role;
