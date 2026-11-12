-- Security and sync tests. Each block signs in as a different person and checks
-- what they can and cannot see or change. Any failed check aborts the run.

create schema t;
grant usage on schema t to authenticated, anon;

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
grant execute on all functions in schema t to authenticated, anon;
create table t.ids (k text primary key, v text);
grant all on t.ids to authenticated, anon;

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
update public.jobs set trees = '[]', number = 'HACKED' where id = :job;
select t.ok((select jsonb_array_length(trees) = 1 and number = 'E-1001' from public.jobs where id = :job),
  'crew cannot edit the estimate itself (their copy of those fields is ignored)');
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
-- ================================================================ Phase 2: estimates
\set job2 '''33333333-3333-3333-3333-333333333333'''
\set sig '''data:image/png;base64,iVBORw0KGgo='''

select t.login(:office, 'office@ats.test');
insert into public.jobs (id, org_id, number, trees, equipment, client_notes, internal_notes, prepared_by_name)
  select :job2, v::uuid, 'E-1002',
    '[{"species":"Ash","internal_notes":"crew: watch the fence"}]',
    '[{"id":"l1","desc":"Stump grinder","qty":1}]', 'Haul all brush', 'Customer is picky', 'Pat'
  from t.ids where k = 'org';
insert into public.job_pricing (job_id, org_id, day_rate, equipment_markup, equipment_costs)
  select :job2, v::uuid, 2000, 1.2, '{"l1": 285}' from t.ids where k = 'org';
insert into t.ids select 'token', public.create_share_link(:job2);
select t.ok((select public.create_share_link(:job2)::text = v from t.ids where k = 'token'), 'a job keeps the same customer link');

select t.login(:crew, 'crew@ats.test');
select t.fails($$ select public.create_share_link('33333333-3333-3333-3333-333333333333') $$, 'not allowed', 'crew cannot create customer links');
select t.ok((select count(*) = 0 from public.job_pricing where job_id = :job2), 'crew cannot read the customer link token');

-- ---- the customer, with no account
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select (public.customer_view(v::uuid) -> 'pricing' -> 'unit_prices' ->> 'l1')::numeric = 342.00 from t.ids where k = 'token'),
  'customer sees the equipment price with markup built in (285 × 1.2 = 342)');
select t.ok((select public.customer_view(v::uuid)::text not like '%285%' and public.customer_view(v::uuid)::text not like '%markup%' from t.ids where k = 'token'),
  'customer never sees the rental cost or the markup');
select t.ok((select public.customer_view(v::uuid)::text not like '%watch the fence%' and public.customer_view(v::uuid)::text not like '%picky%' from t.ids where k = 'token'),
  'customer never sees internal notes (job or tree)');
select t.ok((select public.customer_view(v::uuid) -> 'job' ->> 'client_notes' = 'Haul all brush' from t.ids where k = 'token'),
  'customer sees the client notes');
select t.fails($$ select public.customer_view(gen_random_uuid()) $$, 'no longer valid', 'a made-up link shows nothing');
select t.fails($$ select public.customer_sign(v::uuid, 'not an image', 'Dana') from t.ids where k = 'token' $$, 'sign in the box', 'signing needs a real signature');
select t.fails($$ select public.customer_sign(v::uuid, 'data:image/png;base64,iVBORw0KGgo=', '  ') from t.ids where k = 'token' $$, 'type your name', 'signing needs a name');
select public.customer_sign(v::uuid, :sig, 'Dana Smith') from t.ids where k = 'token';
select t.ok((select public.customer_view(v::uuid) -> 'job' ->> 'signed_by_name' = 'Dana Smith' from t.ids where k = 'token'), 'customer signs through the link');
select t.fails($$ select public.customer_sign(v::uuid, 'data:image/png;base64,iVBORw0KGgo=', 'Someone') from t.ids where k = 'token' $$,
  'already been signed', 'a signed estimate cannot be signed again');
select t.fails($$ select * from public.jobs $$, 'permission denied', 'the link does not open up the jobs table');
reset role;

-- ---- after signing
select t.login(:office, 'office@ats.test');
set role authenticated;
select t.ok((select status = 'approved' and signed_via = 'link' from public.jobs where id = :job2), 'signing through the link approves the estimate');
select t.ok((select (signed_snapshot -> 'unit_prices' ->> 'l1')::numeric = 342 from public.job_pricing where job_id = :job2), 'the signed price is recorded');

-- An office tablet with an older, unsigned copy uploads it with a new internal note.
update public.jobs set signed_at = null, client_sig = '', signed_by_name = '', status = 'approved',
  internal_notes = 'Bring the big grinder', trees = '[]' where id = :job2;
select t.ok((select signed_at is not null and client_sig <> '' and jsonb_array_length(trees) = 1 from public.jobs where id = :job2),
  'an older copy from another device cannot erase the signature or change signed content');
select t.ok((select internal_notes = 'Bring the big grinder' from public.jobs where id = :job2), 'but its internal note still saves');

update public.job_pricing set signed_snapshot = null, share_token = null, day_rate = 2000 where job_id = :job2;
select t.ok((select signed_snapshot is not null and share_token is not null from public.job_pricing where job_id = :job2),
  'an older pricing copy cannot erase the signed price or the customer link');
select t.fails($$ update public.job_pricing set signed_snapshot = '{"day_rate": 1}' where job_id = '33333333-3333-3333-3333-333333333333' $$,
  'signed price', 'the signed price cannot be rewritten');

update public.jobs set change_orders = '[{"id":"co1","days":1,"reason":"Weather delay"}]' where id = :job2;
select t.ok((select jsonb_array_length(change_orders) = 1 from public.jobs where id = :job2), 'a change order can be added to a signed estimate');
update public.jobs set change_orders = '[]' where id = :job2;
select t.ok((select jsonb_array_length(change_orders) = 1 from public.jobs where id = :job2), 'an older copy without it does not remove the change order');
select t.fails($$ update public.jobs set change_orders = '[{"id":"co1","days":9,"reason":"Weather delay"}]' where id = '33333333-3333-3333-3333-333333333333' $$,
  'can''t be changed', 'a signed change order cannot be edited');

-- Crew phone with an old copy marks the job in progress.
select t.login(:crew, 'crew@ats.test');
update public.jobs set status = 'in_progress', signed_at = null, client_sig = '' where id = :job2;
select t.ok((select status = 'in_progress' and signed_at is not null from public.jobs where id = :job2),
  'crew status update from an older copy is accepted without touching the signature');
select t.fails($$ select public.void_signature('33333333-3333-3333-3333-333333333333') $$, 'not allowed', 'crew cannot void a signature');

select t.login(:office, 'office@ats.test');
select public.void_signature(:job2);
select t.ok((select signed_at is null and client_sig = '' and status = 'pending' from public.jobs where id = :job2), 'office can void a signature on purpose');
select t.ok((select signed_snapshot is null from public.job_pricing where job_id = :job2), 'voiding clears the signed price');

-- Expired estimates can't be signed through the link.
update public.jobs set estimate_date = current_date - 45 where id = :job2;
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.fails($$ select public.customer_sign(v::uuid, 'data:image/png;base64,iVBORw0KGgo=', 'Dana') from t.ids where k = 'token' $$,
  'expired', 'an expired estimate cannot be signed through the link');

reset role;

