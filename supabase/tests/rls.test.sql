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


-- ================================================================ Phase 3: invoices and payments
\set inv '''44444444-4444-4444-4444-444444444444'''
\set pay1 '''55555555-5555-5555-5555-555555555551'''
\set pay2 '''55555555-5555-5555-5555-555555555552'''

select t.login(:office, 'office@ats.test');
set role authenticated;
-- A deposit taken before there is an invoice.
insert into public.payments (id, org_id, job_id, amount, method, reference, recorded_by_name)
  select :pay1, v::uuid, :job, 500, 'check', '#1042', 'Pat' from t.ids where k = 'org';
insert into public.invoices (id, org_id, job_id, number, lines, tax_rate, total, notes, internal_notes)
  select :inv, v::uuid, :job, 'INV-1001',
    '[{"id":"a","desc":"Labor","qty":2,"unit":2000,"taxable":true},
      {"id":"b","desc":"Stump grinder","qty":2,"unit":342,"taxable":true},
      {"id":"c","desc":"Travel","qty":1,"unit":100,"taxable":false}]',
    6, 1, 'Thank you!', 'SECRET-INVOICE-NOTE slow payer'
  from t.ids where k = 'org';
select t.ok((select subtotal = 4784 and tax = 281.04 and total = 5065.04 from public.invoices where id = :inv),
  'the server computes invoice totals from the lines (a made-up total is ignored; travel is untaxed)');
select t.ok((select stage = 'done' or stage = 'estimate' from public.jobs where id = :job), 'a draft invoice does not change the job stage');
select t.fails($$ select public.create_invoice_link('44444444-4444-4444-4444-444444444444') $$, 'send the invoice first', 'a draft invoice has no customer link');

update public.invoices set status = 'sent' where id = :inv;
select t.ok((select sent_at is not null from public.invoices where id = :inv), 'sending records when it was sent');
select t.ok((select stage = 'invoice' from public.jobs where id = :job), 'a sent invoice moves the job to Invoice');

-- An older copy (still a draft, different lines) arrives from another device.
update public.invoices set status = 'draft', sent_at = null, lines = '[]', internal_notes = 'call before 5pm' where id = :inv;
select t.ok((select status = 'sent' and total = 5065.04 and internal_notes = 'call before 5pm' from public.invoices where id = :inv),
  'a sent invoice keeps its lines and total against an older copy, but internal notes still save');

insert into t.ids select 'itoken', public.create_invoice_link(:inv);

-- ---- crew can't see money
select t.login(:crew, 'crew@ats.test');
select t.ok((select count(*) = 0 from public.invoices), 'crew cannot see invoices');
select t.ok((select count(*) = 0 from public.payments), 'crew cannot see payments');
select t.ok((select jsonb_array_length(public.sync_pull(v::uuid) -> 'invoices') = 0 and jsonb_array_length(public.sync_pull(v::uuid) -> 'payments') = 0 from t.ids where k = 'org'),
  'crew sync pull contains no invoices or payments');
select t.fails($$ insert into public.payments (id, org_id, job_id, amount, method) select gen_random_uuid(), v::uuid, '11111111-1111-1111-1111-111111111111', 1, 'cash' from t.ids where k = 'org' $$,
  'row-level security', 'crew cannot record payments');

-- ---- the customer's invoice link
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select (public.invoice_view(v::uuid) ->> 'balance')::numeric = 4565.04 from t.ids where k = 'itoken'),
  'customer link shows the balance after the deposit (5,065.04 - 500)');
select t.ok((select public.invoice_view(v::uuid)::text not like '%SECRET%' and public.invoice_view(v::uuid)::text not like '%1042%' from t.ids where k = 'itoken'),
  'customer link shows no internal notes or check numbers');
select t.fails($$ select public.invoice_view(gen_random_uuid()) $$, 'no longer valid', 'a made-up invoice link shows nothing');
reset role;

-- ---- final payment, then a bounced check
select t.login(:office, 'office@ats.test');
set role authenticated;
insert into public.payments (id, org_id, job_id, invoice_id, amount, method)
  select :pay2, v::uuid, :job, :inv, 4565.04, 'cash' from t.ids where k = 'org';
select t.ok((select stage = 'paid' from public.jobs where id = :job), 'paying the balance marks the job Paid');
update public.payments set voided_at = now(), note = 'check bounced' where id = :pay1;
select t.ok((select stage = 'invoice' from public.jobs where id = :job), 'voiding a payment puts the job back to Invoice');
update public.payments set voided_at = null where id = :pay1;
select t.ok((select voided_at is not null from public.payments where id = :pay1), 'a voided payment stays voided');
select t.fails($$ insert into public.payments (id, org_id, job_id, amount, method) select gen_random_uuid(), v::uuid, '11111111-1111-1111-1111-111111111111', 0, 'cash' from t.ids where k = 'org' $$,
  'check constraint', 'a payment must be more than zero');

-- ---- void the invoice
update public.invoices set status = 'void' where id = :inv;
select t.ok((select stage = 'estimate' from public.jobs where id = :job), 'voiding the invoice takes the job out of Invoice/Paid');
update public.invoices set status = 'sent' where id = :inv;
select t.ok((select status = 'void' from public.invoices where id = :inv), 'a voided invoice stays voided');
insert into public.invoices (id, org_id, job_id, number) select gen_random_uuid(), v::uuid, :job, 'INV-1002' from t.ids where k = 'org';
select t.ok(true, 'a new invoice can replace a voided one');
select t.fails($$ insert into public.invoices (id, org_id, job_id, number) select gen_random_uuid(), v::uuid, '11111111-1111-1111-1111-111111111111', 'INV-1003' from t.ids where k = 'org' $$,
  'duplicate key', 'a job can only have one live invoice');


-- ================================================================ Phase 4: calendar
\set ev '''66666666-6666-6666-6666-666666666666'''
select t.login(:office, 'office@ats.test');
set role authenticated;
insert into public.events (id, org_id, type, title, all_day, starts, ends, job_id, assigned_to)
  select :ev, v::uuid, 'tree_work', 'Dana Smith', true, '2026-11-16', '2026-11-18', :job, jsonb_build_array(:crew::text)
  from t.ids where k = 'org';
select t.ok((select assigned_to ? '00000000-0000-0000-0000-00000000000c' from public.events where id = :ev), 'a crew member can be assigned to a job day');
select t.fails($$ insert into public.events (id, org_id, type, starts, ends) select gen_random_uuid(), v::uuid, 'other', '', '' from t.ids where k = 'org' $$,
  'pick a date', 'a scheduled entry needs a date');
insert into public.events (id, org_id, type, title, unscheduled, starts) select gen_random_uuid(), v::uuid, 'dump_run', 'Dump run', true, '2026-11-20' from t.ids where k = 'org';
select t.ok((select starts = '' from public.events where title = 'Dump run'), 'a task left in the pool has no date');

select t.login(:crew, 'crew@ats.test');
select t.ok((select count(*) = 1 from public.events where assigned_to ? auth.uid()::text), 'crew can find the days they are assigned to');
update public.events set status = 'completed', notes = 'Done early' where id = :ev;
select t.ok((select status = 'completed' from public.events where id = :ev), 'crew can update a calendar entry');
update public.events set sort_order = 20 where id = :ev;
select t.ok((select sort_order = 20 from public.events where id = :ev), 'crew can put a day''s entries in order');
insert into public.events (id, org_id, type, title, all_day, starts, ends) select gen_random_uuid(), v::uuid, 'maintenance', 'Sharpen chains', true, '2026-11-17', '2026-11-18' from t.ids where k = 'org';
select t.ok(true, 'crew can add maintenance and dump runs');

-- another company can't link to this company's job
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1', 'other@co.test');
select t.login('00000000-0000-0000-0000-0000000000e1', 'other@co.test');
set role authenticated;
insert into t.ids select 'org2', public.create_organization('Other Co', 'Max');
select t.fails($$ insert into public.events (id, org_id, type, starts, ends, job_id) select gen_random_uuid(), v::uuid, 'tree_work', '2026-11-16', '2026-11-17', '11111111-1111-1111-1111-111111111111' from t.ids where k = 'org2' $$,
  'another company', 'a calendar entry cannot point at another company''s job');
select t.ok((select count(*) = 0 from public.events), 'another company sees none of these calendar entries');

reset role;


-- ---------------------------------------------------------------------------
-- Photos (Phase 5, step 4)
-- ---------------------------------------------------------------------------
select t.login(:crew, 'crew@ats.test');
set role authenticated;
insert into public.photos (id, org_id, job_id, kind, path, taken_by, taken_by_name)
  select 'cccccccc-0000-0000-0000-000000000001', v::uuid, :job, 'before', v || '/photos/p1.jpg', auth.uid(), 'Sam' from t.ids where k = 'org';
select t.ok((select count(*) = 1 from public.photos where kind = 'before'), 'crew can add a before photo to a job');
insert into public.photos (id, org_id, kind, path, taken_by)
  select 'cccccccc-0000-0000-0000-000000000002', v::uuid, 'receipt', v || '/receipts/r1.jpg', auth.uid() from t.ids where k = 'org';
select t.ok((select count(*) = 0 from public.photos where kind = 'receipt'), 'crew can add a receipt but never see receipts');
select t.ok((select jsonb_array_length(public.sync_pull(v::uuid) -> 'photos') = 1 from t.ids where k = 'org'), 'crew sync gets the job photo, not the receipt');
select t.fails($$ insert into public.photos (id, org_id, kind, path) select gen_random_uuid(), v::uuid, 'after', 'someone-else/photos/x.jpg' from t.ids where k = 'org' $$,
  'this company''s folder', 'a photo file must be in the company''s own folder');
update public.photos set path = 'elsewhere/x.jpg', note = 'Leaning toward the house' where id = 'cccccccc-0000-0000-0000-000000000001';
select t.ok((select path like '%/photos/p1.jpg' and note = 'Leaning toward the house' from public.photos where id = 'cccccccc-0000-0000-0000-000000000001'),
  'a photo''s note can change but its file can''t be swapped');
update public.photos set deleted_at = now() where id = 'cccccccc-0000-0000-0000-000000000001';
select t.ok((select deleted_at is not null from public.photos where id = 'cccccccc-0000-0000-0000-000000000001'), 'crew can remove a job photo');

reset role;
select t.login(:office, 'office@ats.test');
set role authenticated;
select t.ok((select count(*) = 1 from public.photos where kind = 'receipt'), 'office sees the receipt');
select t.ok((select jsonb_array_length(public.sync_pull(v::uuid) -> 'photos') = 2 from t.ids where k = 'org'), 'office sync gets photos and receipts');

reset role;
select t.login('00000000-0000-0000-0000-0000000000e1', 'other@co.test');
set role authenticated;
select t.ok((select count(*) = 0 from public.photos), 'another company sees none of these photos');
reset role;

-- ---------------------------------------------------------------------------
-- Expenses, receipts and hours (Phase 5, step 5)
-- ---------------------------------------------------------------------------
select t.login(:crew, 'crew@ats.test');
set role authenticated;
insert into public.expenses (id, org_id, vendor, amount, category, paid_with, job_id, entered_by)
  select 'eeeeeeee-0000-0000-0000-000000000001', v::uuid, 'Marathon', 64.20, 'Fuel', 'card', :job, auth.uid() from t.ids where k = 'org';
select t.ok((select count(*) = 0 from public.expenses), 'crew can add an expense (fuel) but never see expenses');
insert into public.photos (id, org_id, kind, path, expense_id, taken_by)
  select 'cccccccc-0000-0000-0000-000000000003', v::uuid, 'receipt', v || '/receipts/r2.jpg', 'eeeeeeee-0000-0000-0000-000000000001', auth.uid() from t.ids where k = 'org';
select t.ok(true, 'and attach a picture of the receipt to it');
select t.ok((select jsonb_array_length(public.sync_pull(v::uuid) -> 'expenses') = 0 from t.ids where k = 'org'), 'crew sync gets no expenses');
insert into public.time_entries (id, org_id, job_id, work_date, hours, entered_by, entered_by_name)
  select 'dddddddd-0000-0000-0000-000000000001', v::uuid, :job, '2026-11-16', 27, auth.uid(), 'Sam' from t.ids where k = 'org';
select t.ok((select count(*) = 1 from public.time_entries), 'crew log crew-hours on a job');
update public.time_entries set hours = 26.5 where id = 'dddddddd-0000-0000-0000-000000000001';
select t.ok((select hours = 26.5 from public.time_entries where id = 'dddddddd-0000-0000-0000-000000000001'), 'and can fix their own entry');
select t.fails($$ insert into public.time_entries (id, org_id, job_id, hours, entered_by) select gen_random_uuid(), v::uuid, '11111111-1111-1111-1111-111111111111', 0, auth.uid() from t.ids where k = 'org' $$,
  'check', 'hours must be more than zero');
-- Everyone tracks their own hours (clock in and out).
insert into public.time_entries (id, org_id, job_id, worker_id, worker_name, clock_in, entered_by)
  select 'dddddddd-0000-0000-0000-000000000003', v::uuid, :job, auth.uid(), 'Sam', now() - interval '3 hours', auth.uid() from t.ids where k = 'org';
select t.ok((select hours is null from public.time_entries where id = 'dddddddd-0000-0000-0000-000000000003'), 'crew clock in to a job (no hours until they clock out)');
select t.fails($$ insert into public.time_entries (id, org_id, job_id, worker_id, clock_in, entered_by) select gen_random_uuid(), v::uuid, '11111111-1111-1111-1111-111111111111', auth.uid(), now(), auth.uid() from t.ids where k = 'org' $$,
  'one_open_clock', 'and can''t be on two clocks at once');
select t.fails($$ insert into public.time_entries (id, org_id, job_id, worker_id, entered_by) select gen_random_uuid(), v::uuid, '11111111-1111-1111-1111-111111111111', auth.uid(), auth.uid() from t.ids where k = 'org' $$,
  'check', 'an entry with no hours must be a running clock');
update public.time_entries set clock_out = now(), hours = 3 where id = 'dddddddd-0000-0000-0000-000000000003';
select t.ok((select hours = 3 and clock_out is not null from public.time_entries where id = 'dddddddd-0000-0000-0000-000000000003'), 'and clock out');
update public.time_entries set clock_in = clock_in - interval '30 minutes', hours = 3.5 where id = 'dddddddd-0000-0000-0000-000000000003';
select t.ok((select hours = 3.5 from public.time_entries where id = 'dddddddd-0000-0000-0000-000000000003'), 'and fix their own times');
select t.fails($$ update public.time_entries set worker_id = '00000000-0000-0000-0000-00000000000b' where id = 'dddddddd-0000-0000-0000-000000000003' $$,
  'row-level security', 'but can''t hand their hours to someone else');
select t.fails($$ insert into public.time_entries (id, org_id, job_id, hours, worker_id, entered_by) select gen_random_uuid(), v::uuid, '11111111-1111-1111-1111-111111111111', 5, '00000000-0000-0000-0000-00000000000b', auth.uid() from t.ids where k = 'org' $$,
  'row-level security', 'or log hours for someone else');

reset role;
select t.login(:office, 'office@ats.test');
set role authenticated;
select t.ok((select count(*) = 1 and sum(amount) = 64.20 from public.expenses), 'office sees the crew''s expense');
select t.ok((select count(*) = 1 from public.photos where expense_id = 'eeeeeeee-0000-0000-0000-000000000001'), 'with its receipt picture');
update public.expenses set category = 'Fuel & oil' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select t.ok((select category = 'Fuel & oil' from public.expenses), 'office can edit an expense');
insert into public.time_entries (id, org_id, job_id, hours, entered_by) select 'dddddddd-0000-0000-0000-000000000002', v::uuid, :job, 8, auth.uid() from t.ids where k = 'org';
insert into public.time_entries (id, org_id, job_id, hours, worker_id, worker_name, entered_by)
  select 'dddddddd-0000-0000-0000-000000000004', v::uuid, :job, 6, :crew, 'Sam', auth.uid() from t.ids where k = 'org';
select t.ok((select count(*) = 1 from public.time_entries where id = 'dddddddd-0000-0000-0000-000000000004'), 'office can log hours for a crew member who forgot to clock in');
reset role;
select t.login(:crew, 'crew@ats.test');
set role authenticated;
update public.time_entries set hours = 1 where id = 'dddddddd-0000-0000-0000-000000000002';
select t.ok((select hours = 8 from public.time_entries where id = 'dddddddd-0000-0000-0000-000000000002'), 'crew can''t change someone else''s hours');
update public.time_entries set hours = 6.5 where id = 'dddddddd-0000-0000-0000-000000000004';
select t.ok((select hours = 6.5 from public.time_entries where id = 'dddddddd-0000-0000-0000-000000000004'), 'but can fix hours the office logged for them');
update public.expenses set amount = 1 where id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;
select t.ok((select amount = 64.20 from public.expenses where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'or any expense');

select t.login('00000000-0000-0000-0000-0000000000e1', 'other@co.test');
set role authenticated;
select t.ok((select count(*) = 0 from public.time_entries) and (select count(*) = 0 from public.expenses), 'another company sees none of these hours or expenses');
reset role;

-- ---------------------------------------------------------------------------
-- Cancelling an estimate
-- ---------------------------------------------------------------------------
select t.login(:office, 'office@ats.test');
set role authenticated;
insert into public.jobs (id, org_id, number) select '44444444-4444-4444-4444-444444444444', v::uuid, 'E-4444' from t.ids where k = 'org';
insert into public.job_pricing (job_id, org_id) select '44444444-4444-4444-4444-444444444444', v::uuid from t.ids where k = 'org';
insert into t.ids select 'token4', public.create_share_link('44444444-4444-4444-4444-444444444444');
update public.jobs set cancelled_at = now(), cancel_reason = 'Went with someone else' where id = '44444444-4444-4444-4444-444444444444';
select t.ok((select cancel_reason = 'Went with someone else' from public.jobs where id = '44444444-4444-4444-4444-444444444444'), 'office can cancel an estimate, with a reason');
reset role;
select t.fails($$ select public.customer_view(v::uuid) from t.ids where k = 'token4' $$, 'was cancelled', 'the customer''s link says it was cancelled');
select t.fails($$ select public.customer_sign(v::uuid, 'data:image/png;base64,iVBORw0KGgo=', 'Dana') from t.ids where k = 'token4' $$, 'was cancelled', 'and it can''t be signed');
select t.login(:crew, 'crew@ats.test');
set role authenticated;
update public.jobs set cancelled_at = null where id = '44444444-4444-4444-4444-444444444444';
reset role;
select t.ok((select cancelled_at is not null from public.jobs where id = '44444444-4444-4444-4444-444444444444'), 'crew can''t reopen (or cancel) a job');
select t.login(:office, 'office@ats.test');
set role authenticated;
update public.jobs set cancelled_at = null, cancel_reason = '' where id = '44444444-4444-4444-4444-444444444444';
reset role;
select t.ok((select (public.customer_view(v::uuid) -> 'job' ->> 'number') = 'E-4444' from t.ids where k = 'token4'), 'reopened, the link works again');

-- ---------------------------------------------------------------------------
-- Calendar subscription links
-- ---------------------------------------------------------------------------
insert into public.events (id, org_id, type, title, all_day, starts, ends)
  select 'eeeeeeee-cccc-0000-0000-000000000001', v::uuid, 'tree_work', 'Feed test · Dana', true,
    to_char(current_date + 3, 'YYYY-MM-DD'), to_char(current_date + 5, 'YYYY-MM-DD') from t.ids where k = 'org';
insert into public.events (id, org_id, type, title, all_day, starts, ends, status)
  select 'eeeeeeee-cccc-0000-0000-000000000002', v::uuid, 'tree_work', 'Called off · Pat', true,
    to_char(current_date + 4, 'YYYY-MM-DD'), to_char(current_date + 5, 'YYYY-MM-DD'), 'cancelled' from t.ids where k = 'org';
select t.login(:crew, 'crew@ats.test');
set role authenticated;
insert into t.ids select 'feed', public.my_calendar_feed(v::uuid) from t.ids where k = 'org';
select t.ok((select public.my_calendar_feed(o.v::uuid)::text = f.v from t.ids o, t.ids f where o.k = 'org' and f.k = 'feed'), 'everyone gets one calendar link, the same each time');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select public.calendar_feed_events(v::uuid)::text like '%Feed test · Dana%' from t.ids where k = 'feed'), 'the link serves the calendar without an account');
select t.ok((select public.calendar_feed_events(v::uuid)::text not like '%Called off%' from t.ids where k = 'feed'), 'cancelled entries are left out');
select t.ok((select public.calendar_feed_events(v::uuid)::text not like '%day_rate%' and public.calendar_feed_events(v::uuid)::text not like '%total%' from t.ids where k = 'feed'), 'and there are no prices in it');
select t.fails($$ select public.calendar_feed_events(gen_random_uuid()) $$, 'no longer works', 'a made-up link shows nothing');
select t.fails($$ select public.my_calendar_feed(v::uuid) from t.ids where k = 'org' $$, 'permission denied', 'no link without signing in');
reset role;
select t.login(:stranger, 'stranger@other.test');
set role authenticated;
select t.fails($$ select public.my_calendar_feed(v::uuid) from t.ids where k = 'org' $$, 'Not a member', 'another company can''t get a link to this calendar');
reset role;
select t.login(:crew, 'crew@ats.test');
set role authenticated;
insert into t.ids select 'feed2', public.reset_calendar_feed(v::uuid) from t.ids where k = 'org';
reset role;
select t.ok((select a.v <> b.v from t.ids a, t.ids b where a.k = 'feed' and b.k = 'feed2'), 'Reset gives a new link');
select t.fails($$ select public.calendar_feed_events(v::uuid) from t.ids where k = 'feed' $$, 'no longer works', 'and the old one stops working');
update public.members set deleted_at = now() where user_id = :crew;
select t.fails($$ select public.calendar_feed_events(v::uuid) from t.ids where k = 'feed2' $$, 'no longer works', 'a link stops working when that person leaves the team');
update public.members set deleted_at = null where user_id = :crew;
update public.events set assigned_to = jsonb_build_array(:crew::text) where id = 'eeeeeeee-cccc-0000-0000-000000000001';
select t.ok((select (select x ->> 'crew' from jsonb_array_elements(public.calendar_feed_events(v::uuid) -> 'events') x where x ->> 'title' = 'Feed test · Dana') =
  (select display_name from public.members where user_id = :crew) from t.ids where k = 'feed2'), 'the feed names the crew picked in the calendar');
