-- CRM enrichment for demo-data.sql (People list, tags, stages, Work history).
-- Run in Supabase → SQL Editor AFTER demo-data.sql.
-- Every new row id starts with de0de000 so remove-demo-data.sql clears it.

do $crm$
declare
  t date := (now() at time zone 'America/Detroit')::date;
  v_org uuid;
  v_name text;
  v_owner uuid;

  -- Stage tags
  tg_new uuid; tg_est_set uuid; tg_est_sent uuid; tg_booked uuid; tg_complete uuid; tg_past uuid;
  -- Type / source / services / flags (sample)
  tt_res uuid; tt_com uuid; tt_hoa uuid; tt_muni uuid;
  ts_google uuid; ts_ref uuid; ts_yard uuid; ts_fb uuid; ts_storm uuid; ts_repeat uuid;
  tv_rem uuid; tv_trim uuid; tv_stump uuid; tv_storm uuid; tv_lot uuid;
  tf_crane uuid; tf_power uuid; tf_dog uuid; tf_fire uuid; tf_chips uuid; tf_annual uuid; tf_notext uuid;
begin
  select id, name into v_org, v_name from public.organizations where deleted_at is null order by created_at limit 1;
  if v_org is null then
    raise exception 'No company yet.';
  end if;
  if not exists (select 1 from public.customers where id = 'de0de000-0000-4000-8000-000000000101'::uuid) then
    raise exception 'Run demo-data.sql first (base demo contacts missing).';
  end if;

  perform public.seed_org_crm_tags(v_org);
  perform public.seed_org_smart_lists(v_org);

  -- Wipe prior CRM demo rows so this is re-runnable.
  delete from public.customer_activities where id::text like 'de0de000-%';
  delete from public.customer_tags where customer_id::text like 'de0de000-%';
  delete from public.customer_phones where id::text like 'de0de000-%';
  delete from public.customer_emails where id::text like 'de0de000-%';
  delete from public.customer_properties where id::text like 'de0de000-%';
  delete from public.smart_lists where id::text like 'de0de000-%';
  delete from public.payments where id in (
    'de0de000-0000-4000-8000-000000000503'::uuid,
    'de0de000-0000-4000-8000-000000000504'::uuid
  );
  delete from public.invoices where id in (
    'de0de000-0000-4000-8000-000000000404'::uuid
  );
  delete from public.events where id in (
    'de0de000-0000-4000-8000-000000000313'::uuid,
    'de0de000-0000-4000-8000-000000000314'::uuid,
    'de0de000-0000-4000-8000-000000000327'::uuid
  );
  delete from public.job_pricing where job_id in (
    'de0de000-0000-4000-8000-000000000213'::uuid,
    'de0de000-0000-4000-8000-000000000214'::uuid,
    'de0de000-0000-4000-8000-000000000215'::uuid
  );
  delete from public.jobs where id in (
    'de0de000-0000-4000-8000-000000000213'::uuid,
    'de0de000-0000-4000-8000-000000000214'::uuid,
    'de0de000-0000-4000-8000-000000000215'::uuid
  );
  delete from public.customers where id in (
    'de0de000-0000-4000-8000-000000000113'::uuid,
    'de0de000-0000-4000-8000-000000000114'::uuid,
    'de0de000-0000-4000-8000-000000000115'::uuid,
    'de0de000-0000-4000-8000-000000000116'::uuid,
    'de0de000-0000-4000-8000-000000000117'::uuid,
    'de0de000-0000-4000-8000-000000000118'::uuid
  );

  select user_id into v_owner
  from public.members
  where org_id = v_org and role = 'owner' and deleted_at is null
  order by created_at limit 1;

  -- Resolve seeded tag ids by group + slug.
  select t.id into tg_new from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'stage' and t.slug = 'new' and t.deleted_at is null;
  select t.id into tg_est_set from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'stage' and t.slug = 'est-set' and t.deleted_at is null;
  select t.id into tg_est_sent from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'stage' and t.slug = 'est-sent' and t.deleted_at is null;
  select t.id into tg_booked from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'stage' and t.slug = 'booked' and t.deleted_at is null;
  select t.id into tg_complete from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'stage' and t.slug = 'complete' and t.deleted_at is null;
  select t.id into tg_past from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'stage' and t.slug = 'past' and t.deleted_at is null;

  select t.id into tt_res from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'type' and t.slug = 'residential' and t.deleted_at is null;
  select t.id into tt_com from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'type' and t.slug = 'commercial' and t.deleted_at is null;
  select t.id into tt_hoa from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'type' and t.slug = 'hoa-property-mgr' and t.deleted_at is null;
  select t.id into tt_muni from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'type' and t.slug = 'municipal' and t.deleted_at is null;

  select t.id into ts_google from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'source' and t.slug = 'google' and t.deleted_at is null;
  select t.id into ts_ref from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'source' and t.slug = 'referral' and t.deleted_at is null;
  select t.id into ts_yard from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'source' and t.slug = 'yard-sign-door-hanger' and t.deleted_at is null;
  select t.id into ts_fb from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'source' and t.slug = 'facebook-nextdoor' and t.deleted_at is null;
  select t.id into ts_storm from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'source' and t.slug = 'storm-call' and t.deleted_at is null;
  select t.id into ts_repeat from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'source' and t.slug = 'repeat' and t.deleted_at is null;

  select t.id into tv_rem from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'services' and t.slug = 'removal' and t.deleted_at is null;
  select t.id into tv_trim from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'services' and t.slug = 'trim-prune' and t.deleted_at is null;
  select t.id into tv_stump from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'services' and t.slug = 'stump-grinding' and t.deleted_at is null;
  select t.id into tv_storm from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'services' and t.slug = 'storm-emergency' and t.deleted_at is null;
  select t.id into tv_lot from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'services' and t.slug = 'lot-clearing' and t.deleted_at is null;

  select t.id into tf_crane from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'flags' and t.slug = 'crane-job' and t.deleted_at is null;
  select t.id into tf_power from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'flags' and t.slug = 'power-lines' and t.deleted_at is null;
  select t.id into tf_dog from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'flags' and t.slug = 'dog' and t.deleted_at is null;
  select t.id into tf_fire from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'flags' and t.slug = 'wants-firewood' and t.deleted_at is null;
  select t.id into tf_chips from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'flags' and t.slug = 'wants-chips' and t.deleted_at is null;
  select t.id into tf_annual from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'flags' and t.slug = 'annual-customer' and t.deleted_at is null;
  select t.id into tf_notext from public.tags t join public.tag_groups g on g.id = t.tag_group_id
    where t.org_id = v_org and g.slug = 'flags' and t.slug = 'do-not-text' and t.deleted_at is null;

  if tg_new is null or tt_res is null then
    raise exception 'CRM tag taxonomy missing — run CRM migrations / seed_org_crm_tags first.';
  end if;

  raise notice 'Enriching CRM demo on %', v_name;

  -- Extra customers (pipeline variety without / with light work).
  insert into public.customers (id, org_id, first_name, last_name, company, phone, email, street, town, state, zip, notes) values
    ('de0de000-0000-4000-8000-000000000113'::uuid, v_org, 'Jim', 'Peterson', '', '231-555-0113', 'jim.p@example.com', '310 Benzie Blvd', 'Beulah', 'MI', '49617', 'New lead from yard sign'),
    ('de0de000-0000-4000-8000-000000000114'::uuid, v_org, 'Alicia', 'Nguyen', '', '231-555-0114', 'alicia.n@example.com', '44 Maple Ct', 'Traverse City', 'MI', '49684', 'Estimate visit set for next week'),
    ('de0de000-0000-4000-8000-000000000115'::uuid, v_org, '', '', 'Northport Community Church', '231-555-0115', 'office@northportchurch.example', '301 N Mill St', 'Northport', 'MI', '49670', 'Board wants quote before spring'),
    ('de0de000-0000-4000-8000-000000000116'::uuid, v_org, 'Derek', 'Olsen', '', '231-555-0116', '', '892 M-22', 'Empire', 'MI', '49630', 'Storm call — waiting on photos'),
    ('de0de000-0000-4000-8000-000000000117'::uuid, v_org, 'Helen', 'Park', '', '231-555-0117', 'helen.p@example.com', '15 Birch Ave', 'Frankfort', 'MI', '49635', 'Repeat customer, annual prune'),
    ('de0de000-0000-4000-8000-000000000118'::uuid, v_org, 'Sam', 'Whitaker', 'Whitaker Rentals LLC', '231-555-0118', 'sam@whitakerrentals.example', '700 Front St', 'Traverse City', 'MI', '49684', 'Commercial — two rental houses');

  -- Properties (primary + multi-property for a few).
  insert into public.customer_properties (id, org_id, customer_id, street, town, state, zip, gate_code, access, hazards, tree_notes, sort) values
    ('de0de000-0000-4000-8000-000000000601'::uuid, v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, '4120 Peninsula Dr', 'Traverse City', 'MI', '49686', '4411', 'Side gate off the alley', '["Deck under oak"]'::jsonb, 'Protect garden beds', 0),
    ('de0de000-0000-4000-8000-000000000602'::uuid, v_org, 'de0de000-0000-4000-8000-000000000102'::uuid, '880 N Hollis Pt Rd', 'Northport', 'MI', '49670', '', 'Shared private road', '["Overhead wires"]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000603'::uuid, v_org, 'de0de000-0000-4000-8000-000000000103'::uuid, '215 River St', 'Elk Rapids', 'MI', '49629', '', 'Street parking', '[]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000604'::uuid, v_org, 'de0de000-0000-4000-8000-000000000104'::uuid, '12 Shore Ln', 'Suttons Bay', 'MI', '49682', '', 'Narrow drive — ground mats', '[]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000605'::uuid, v_org, 'de0de000-0000-4000-8000-000000000105'::uuid, '6610 S Lake Shore Dr', 'Lake Leelanau', 'MI', '49653', '', 'Road shoulder; cones', '["Hillside"]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000606'::uuid, v_org, 'de0de000-0000-4000-8000-000000000106'::uuid, '200 W River St', 'Leland', 'MI', '49654', '', 'Marina lot north end', '[]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000607'::uuid, v_org, 'de0de000-0000-4000-8000-000000000107'::uuid, '903 Brownson St', 'Kingsley', 'MI', '49649', '', 'Stay off east lawn (septic)', '["Septic field"]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000608'::uuid, v_org, 'de0de000-0000-4000-8000-000000000108'::uuid, '4475 Diamond Park Rd', 'Interlochen', 'MI', '49643', '', 'Two-track off Diamond Park', '["Wet low spot"]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000609'::uuid, v_org, 'de0de000-0000-4000-8000-000000000109'::uuid, '8801 Cherry Ln', 'Williamsburg', 'MI', '49690', '', 'Driveway', '[]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000610'::uuid, v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, '5132 Bunker Hill Rd', 'Acme', 'MI', '49610', '', 'Driveway; tight to house', '["Lean toward house"]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000611'::uuid, v_org, 'de0de000-0000-4000-8000-000000000111'::uuid, '6250 Western Ave', 'Glen Arbor', 'MI', '49636', '', 'Inn lot', '[]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000612'::uuid, v_org, 'de0de000-0000-4000-8000-000000000112'::uuid, '1702 Hammond Rd', 'Traverse City', 'MI', '49686', '', 'Driveway', '[]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000613'::uuid, v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, '310 Benzie Blvd', 'Beulah', 'MI', '49617', '', '', '[]'::jsonb, 'Three spruce by the garage', 0),
    ('de0de000-0000-4000-8000-000000000614'::uuid, v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, '44 Maple Ct', 'Traverse City', 'MI', '49684', '9920', 'Back gate', '["Dog"]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000615'::uuid, v_org, 'de0de000-0000-4000-8000-000000000115'::uuid, '301 N Mill St', 'Northport', 'MI', '49670', '', 'Park behind fellowship hall', '[]'::jsonb, '', 0),
    ('de0de000-0000-4000-8000-000000000616'::uuid, v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, '892 M-22', 'Empire', 'MI', '49630', '', '', '["Power lines"]'::jsonb, 'Storm-damaged maple', 0),
    ('de0de000-0000-4000-8000-000000000617'::uuid, v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, '15 Birch Ave', 'Frankfort', 'MI', '49635', '', '', '[]'::jsonb, 'Annual canopy raise', 0),
    ('de0de000-0000-4000-8000-000000000618'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, '700 Front St', 'Traverse City', 'MI', '49684', '', 'Unit A driveway', '[]'::jsonb, 'Rental house A', 0),
    ('de0de000-0000-4000-8000-000000000619'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, '88 Boardman Lake Ave', 'Traverse City', 'MI', '49684', '', 'Unit B alley', '[]'::jsonb, 'Rental house B — second property', 1),
    ('de0de000-0000-4000-8000-000000000620'::uuid, v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, '220 Cabin Rd', 'Acme', 'MI', '49610', '', 'Seasonal cabin', '[]'::jsonb, 'Second property — cabin lot', 1);

  -- Phones / emails (multi on a few).
  insert into public.customer_phones (id, org_id, customer_id, label, value, sort) values
    ('de0de000-0000-4000-8000-000000000701'::uuid, v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, 'mobile', '231-555-0101', 0),
    ('de0de000-0000-4000-8000-000000000702'::uuid, v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, 'home', '231-555-0181', 1),
    ('de0de000-0000-4000-8000-000000000703'::uuid, v_org, 'de0de000-0000-4000-8000-000000000102'::uuid, 'office', '231-555-0102', 0),
    ('de0de000-0000-4000-8000-000000000704'::uuid, v_org, 'de0de000-0000-4000-8000-000000000103'::uuid, 'mobile', '231-555-0103', 0),
    ('de0de000-0000-4000-8000-000000000705'::uuid, v_org, 'de0de000-0000-4000-8000-000000000104'::uuid, 'mobile', '231-555-0104', 0),
    ('de0de000-0000-4000-8000-000000000706'::uuid, v_org, 'de0de000-0000-4000-8000-000000000105'::uuid, 'mobile', '231-555-0105', 0),
    ('de0de000-0000-4000-8000-000000000707'::uuid, v_org, 'de0de000-0000-4000-8000-000000000106'::uuid, 'office', '231-555-0106', 0),
    ('de0de000-0000-4000-8000-000000000708'::uuid, v_org, 'de0de000-0000-4000-8000-000000000106'::uuid, 'harbor', '231-555-0199', 1),
    ('de0de000-0000-4000-8000-000000000709'::uuid, v_org, 'de0de000-0000-4000-8000-000000000107'::uuid, 'mobile', '231-555-0107', 0),
    ('de0de000-0000-4000-8000-000000000710'::uuid, v_org, 'de0de000-0000-4000-8000-000000000108'::uuid, 'mobile', '231-555-0108', 0),
    ('de0de000-0000-4000-8000-000000000711'::uuid, v_org, 'de0de000-0000-4000-8000-000000000109'::uuid, 'mobile', '231-555-0109', 0),
    ('de0de000-0000-4000-8000-000000000712'::uuid, v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, 'mobile', '231-555-0110', 0),
    ('de0de000-0000-4000-8000-000000000713'::uuid, v_org, 'de0de000-0000-4000-8000-000000000111'::uuid, 'front desk', '231-555-0111', 0),
    ('de0de000-0000-4000-8000-000000000714'::uuid, v_org, 'de0de000-0000-4000-8000-000000000112'::uuid, 'mobile', '231-555-0112', 0),
    ('de0de000-0000-4000-8000-000000000715'::uuid, v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, 'mobile', '231-555-0113', 0),
    ('de0de000-0000-4000-8000-000000000716'::uuid, v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, 'mobile', '231-555-0114', 0),
    ('de0de000-0000-4000-8000-000000000717'::uuid, v_org, 'de0de000-0000-4000-8000-000000000115'::uuid, 'office', '231-555-0115', 0),
    ('de0de000-0000-4000-8000-000000000718'::uuid, v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, 'mobile', '231-555-0116', 0),
    ('de0de000-0000-4000-8000-000000000719'::uuid, v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, 'mobile', '231-555-0117', 0),
    ('de0de000-0000-4000-8000-000000000720'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, 'office', '231-555-0118', 0),
    ('de0de000-0000-4000-8000-000000000721'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, 'mobile', '231-555-0218', 1);

  insert into public.customer_emails (id, org_id, customer_id, label, value, sort) values
    ('de0de000-0000-4000-8000-000000000801'::uuid, v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, 'personal', 'nadia.k@example.com', 0),
    ('de0de000-0000-4000-8000-000000000802'::uuid, v_org, 'de0de000-0000-4000-8000-000000000104'::uuid, 'personal', 'grace.w@example.com', 0),
    ('de0de000-0000-4000-8000-000000000803'::uuid, v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, 'home', 'nowak@example.com', 0),
    ('de0de000-0000-4000-8000-000000000804'::uuid, v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, 'personal', 'jim.p@example.com', 0),
    ('de0de000-0000-4000-8000-000000000805'::uuid, v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, 'personal', 'alicia.n@example.com', 0),
    ('de0de000-0000-4000-8000-000000000806'::uuid, v_org, 'de0de000-0000-4000-8000-000000000115'::uuid, 'office', 'office@northportchurch.example', 0),
    ('de0de000-0000-4000-8000-000000000807'::uuid, v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, 'personal', 'helen.p@example.com', 0),
    ('de0de000-0000-4000-8000-000000000808'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, 'work', 'sam@whitakerrentals.example', 0),
    ('de0de000-0000-4000-8000-000000000809'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, 'billing', 'billing@whitakerrentals.example', 1);

  -- Link base jobs to properties + set job.stage for Jobs board variety.
  -- Signed jobs freeze property_id via jobs_signed_lock; disable for this seed pass only.
  execute 'alter table public.jobs disable trigger jobs_signed_lock';
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000601'::uuid, stage = 'estimate', status = 'pending'
    where id = 'de0de000-0000-4000-8000-000000000201'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000602'::uuid, stage = 'estimate', status = 'pending'
    where id = 'de0de000-0000-4000-8000-000000000202'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000603'::uuid, stage = 'work_order', status = 'approved'
    where id = 'de0de000-0000-4000-8000-000000000203'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000604'::uuid, stage = 'work_order', status = 'approved'
    where id = 'de0de000-0000-4000-8000-000000000204'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000605'::uuid, stage = 'work_order', status = 'scheduled'
    where id = 'de0de000-0000-4000-8000-000000000205'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000606'::uuid, stage = 'work_order', status = 'scheduled'
    where id = 'de0de000-0000-4000-8000-000000000206'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000607'::uuid, stage = 'work_order', status = 'in_progress'
    where id = 'de0de000-0000-4000-8000-000000000207'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000608'::uuid, stage = 'work_order', status = 'blocked'
    where id = 'de0de000-0000-4000-8000-000000000208'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000609'::uuid, stage = 'invoice', status = 'done'
    where id = 'de0de000-0000-4000-8000-000000000209'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000610'::uuid, stage = 'invoice', status = 'done'
    where id = 'de0de000-0000-4000-8000-000000000210'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000611'::uuid, stage = 'invoice', status = 'done'
    where id = 'de0de000-0000-4000-8000-000000000211'::uuid;
  update public.jobs set property_id = 'de0de000-0000-4000-8000-000000000612'::uuid, stage = 'paid', status = 'done'
    where id = 'de0de000-0000-4000-8000-000000000212'::uuid;
  execute 'alter table public.jobs enable trigger jobs_signed_lock';

  -- Extra jobs: estimate sent, booked prune, paid past work on second property.
  insert into public.jobs (id, org_id, number, stage, status, block_reason, customer_id, property_id, client, trees, site, equipment, days, change_orders,
      client_notes, internal_notes, estimate_date, prepared_by_name)
    values
    ('de0de000-0000-4000-8000-000000000213'::uuid, v_org, 'E-9013', 'estimate', 'pending', '',
      'de0de000-0000-4000-8000-000000000114'::uuid, 'de0de000-0000-4000-8000-000000000614'::uuid,
      '{"firstName":"Alicia","lastName":"Nguyen","company":"","phone":"231-555-0114","email":"alicia.n@example.com","street":"44 Maple Ct","town":"Traverse City","state":"MI","zip":"49684"}'::jsonb,
      '[{"id":"demo-t17","species":"Norway Maple","work":["Trimming / pruning"],"location":"Front Yard","size":"18-24","condition":"Healthy","qty":1,"notes":"","internal_notes":""}]'::jsonb,
      '{"conditions":["Clear Access"],"other":"","parking":"Driveway","debris":"Haul brush"}'::jsonb,
      '[]'::jsonb, 0.5, '[]'::jsonb, 'Estimate emailed — waiting on reply.', '[Demo] Est sent', (t - 2), 'Joey'),
    ('de0de000-0000-4000-8000-000000000214'::uuid, v_org, 'E-9014', 'work_order', 'scheduled', '',
      'de0de000-0000-4000-8000-000000000117'::uuid, 'de0de000-0000-4000-8000-000000000617'::uuid,
      '{"firstName":"Helen","lastName":"Park","company":"","phone":"231-555-0117","email":"helen.p@example.com","street":"15 Birch Ave","town":"Frankfort","state":"MI","zip":"49635"}'::jsonb,
      '[{"id":"demo-t18","species":"Sugar Maple","work":["Canopy raise","Deadwood removal"],"location":"Front Yard","size":"24-36","condition":"Healthy","qty":2,"notes":"Annual raise","internal_notes":""}]'::jsonb,
      '{"conditions":["Clear Access"],"other":"","parking":"Street","debris":"Leave chips"}'::jsonb,
      '[{"id":"demo-e214-0","desc":"Wood chipper","qty":1,"qty_manual":false}]'::jsonb, 1, '[]'::jsonb,
      '', '[Demo] Booked annual', (t - 18), 'Joey'),
    ('de0de000-0000-4000-8000-000000000215'::uuid, v_org, 'E-9015', 'paid', 'done', '',
      'de0de000-0000-4000-8000-000000000118'::uuid, 'de0de000-0000-4000-8000-000000000619'::uuid,
      '{"firstName":"Sam","lastName":"Whitaker","company":"Whitaker Rentals LLC","phone":"231-555-0118","email":"sam@whitakerrentals.example","street":"88 Boardman Lake Ave","town":"Traverse City","state":"MI","zip":"49684"}'::jsonb,
      '[{"id":"demo-t19","species":"Ash","work":["Removal + stump grinding"],"location":"Side Yard","size":"18-24","condition":"Pest","qty":2,"notes":"","internal_notes":""}]'::jsonb,
      '{"conditions":["Restricted Access"],"other":"","parking":"Alley","debris":"Haul all"}'::jsonb,
      '[{"id":"demo-e215-0","desc":"Stump grinder","qty":1,"qty_manual":false}]'::jsonb, 1, '[]'::jsonb,
      '', '[Demo] Paid — Unit B', (t - 40), 'Joey');

  update public.jobs set
    client_sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    client_sig_date = (t - 16),
    signed_at = ((t - 16) + time '14:00') at time zone 'America/Detroit',
    signed_by_name = 'Helen Park',
    signed_via = 'link'
  where id = 'de0de000-0000-4000-8000-000000000214'::uuid;

  update public.jobs set
    client_sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    client_sig_date = (t - 38),
    signed_at = ((t - 38) + time '11:00') at time zone 'America/Detroit',
    signed_by_name = 'Sam Whitaker',
    signed_via = 'device'
  where id = 'de0de000-0000-4000-8000-000000000215'::uuid;

  insert into public.job_pricing (job_id, org_id, day_rate, equipment_markup, equipment_costs, tax_rate, additional, deposit_pct, valid_days, share_token, total) values
    ('de0de000-0000-4000-8000-000000000213'::uuid, v_org, 2000, 1.2, '{}'::jsonb, 6, 0, 25, 30, 'de0de000-0000-4000-8000-00000000c213'::uuid, 1060.0),
    ('de0de000-0000-4000-8000-000000000214'::uuid, v_org, 2000, 1.2, '{"demo-e214-0": 375}'::jsonb, 6, 0, 25, 30, null, 2660.6),
    ('de0de000-0000-4000-8000-000000000215'::uuid, v_org, 2000, 1.2, '{"demo-e215-0": 285}'::jsonb, 6, 0, 25, 30, null, 2482.52);

  update public.job_pricing p set signed_snapshot = public.customer_pricing(p, j)
    from public.jobs j
    where j.id = p.job_id and j.id in (
      'de0de000-0000-4000-8000-000000000214'::uuid,
      'de0de000-0000-4000-8000-000000000215'::uuid
    );

  insert into public.events (id, org_id, type, title, status, all_day, starts, ends, job_id, address, town, equipment, notes, assigned_to) values
    ('de0de000-0000-4000-8000-000000000313'::uuid, v_org, 'tree_work', 'Helen Park · Frankfort', 'confirmed', true,
      to_char(t + 7, 'YYYY-MM-DD'), to_char(t + 8, 'YYYY-MM-DD'),
      'de0de000-0000-4000-8000-000000000214'::uuid, '15 Birch Ave', 'Frankfort', '["Wood chipper"]'::jsonb, '',
      case when v_owner is null then '[]'::jsonb else jsonb_build_array(v_owner::text) end),
    ('de0de000-0000-4000-8000-000000000314'::uuid, v_org, 'tree_work', 'Whitaker Rentals · Boardman', 'completed', true,
      to_char(t - 35, 'YYYY-MM-DD'), to_char(t - 34, 'YYYY-MM-DD'),
      'de0de000-0000-4000-8000-000000000215'::uuid, '88 Boardman Lake Ave', 'Traverse City', '["Stump grinder"]'::jsonb, '',
      case when v_owner is null then '[]'::jsonb else jsonb_build_array(v_owner::text) end);

  insert into public.events (id, org_id, type, title, status, all_day, starts, ends, job_id, address, town, notes, assigned_to) values
    ('de0de000-0000-4000-8000-000000000327'::uuid, v_org, 'estimate_visit', 'Bid · Alicia Nguyen', 'confirmed', false,
      to_char(((t + 4) + time '09:00') at time zone 'America/Detroit' at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(((t + 4) + time '10:00') at time zone 'America/Detroit' at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'de0de000-0000-4000-8000-000000000213'::uuid, '44 Maple Ct', 'Traverse City', '',
      case when v_owner is null then '[]'::jsonb else jsonb_build_array(v_owner::text) end);

  insert into public.invoices (id, org_id, job_id, number, status, issue_date, due_date, lines, tax_rate, notes, internal_notes) values
    ('de0de000-0000-4000-8000-000000000404'::uuid, v_org, 'de0de000-0000-4000-8000-000000000215'::uuid, 'INV-9004', 'sent',
      (t - 33), (t - 18),
      '[{"id":"demo-l8","desc":"Tree work — 1 day","qty":1,"unit":2000,"taxable":true},{"id":"demo-l9","desc":"Stump grinder","qty":1,"unit":342,"taxable":true}]'::jsonb,
      6, 'Thank you!', '[Demo] Paid in full');

  insert into public.payments (id, org_id, job_id, invoice_id, amount, method, reference, received_on, note, recorded_by_name)
    select 'de0de000-0000-4000-8000-000000000503'::uuid, v_org, 'de0de000-0000-4000-8000-000000000215'::uuid,
      'de0de000-0000-4000-8000-000000000404'::uuid, total, 'card', '', (t - 20), 'Paid in full', 'Joey'
    from public.invoices where id = 'de0de000-0000-4000-8000-000000000404'::uuid;

  -- Customer tags: stage + type + source + services + flags.
  insert into public.customer_tags (org_id, customer_id, tag_id) values
    -- stages across pipeline
    (v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, tg_new),
    (v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, tg_new),
    (v_org, 'de0de000-0000-4000-8000-000000000115'::uuid, tg_est_set),
    (v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, tg_est_sent),
    (v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, tg_est_sent),
    (v_org, 'de0de000-0000-4000-8000-000000000102'::uuid, tg_est_set),
    (v_org, 'de0de000-0000-4000-8000-000000000103'::uuid, tg_booked),
    (v_org, 'de0de000-0000-4000-8000-000000000104'::uuid, tg_booked),
    (v_org, 'de0de000-0000-4000-8000-000000000105'::uuid, tg_booked),
    (v_org, 'de0de000-0000-4000-8000-000000000106'::uuid, tg_booked),
    (v_org, 'de0de000-0000-4000-8000-000000000107'::uuid, tg_booked),
    (v_org, 'de0de000-0000-4000-8000-000000000108'::uuid, tg_booked),
    (v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, tg_booked),
    (v_org, 'de0de000-0000-4000-8000-000000000109'::uuid, tg_complete),
    (v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, tg_complete),
    (v_org, 'de0de000-0000-4000-8000-000000000111'::uuid, tg_complete),
    (v_org, 'de0de000-0000-4000-8000-000000000112'::uuid, tg_past),
    (v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, tg_past),
    -- types
    (v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000103'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000104'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000105'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000107'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000108'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000109'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000112'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, tt_res),
    (v_org, 'de0de000-0000-4000-8000-000000000106'::uuid, tt_com),
    (v_org, 'de0de000-0000-4000-8000-000000000111'::uuid, tt_com),
    (v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, tt_com),
    (v_org, 'de0de000-0000-4000-8000-000000000102'::uuid, tt_hoa),
    (v_org, 'de0de000-0000-4000-8000-000000000115'::uuid, tt_muni),
    -- sources
    (v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, ts_google),
    (v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, ts_yard),
    (v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, ts_fb),
    (v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, ts_storm),
    (v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, ts_repeat),
    (v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, ts_ref),
    (v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, ts_ref),
    -- services (many)
    (v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, tv_rem),
    (v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, tv_trim),
    (v_org, 'de0de000-0000-4000-8000-000000000105'::uuid, tv_rem),
    (v_org, 'de0de000-0000-4000-8000-000000000105'::uuid, tv_stump),
    (v_org, 'de0de000-0000-4000-8000-000000000108'::uuid, tv_storm),
    (v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, tv_storm),
    (v_org, 'de0de000-0000-4000-8000-000000000102'::uuid, tv_lot),
    (v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, tv_trim),
    (v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, tv_rem),
    (v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, tv_stump),
    -- flags
    (v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, tf_crane),
    (v_org, 'de0de000-0000-4000-8000-000000000102'::uuid, tf_power),
    (v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, tf_power),
    (v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, tf_dog),
    (v_org, 'de0de000-0000-4000-8000-000000000103'::uuid, tf_fire),
    (v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, tf_chips),
    (v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, tf_annual),
    (v_org, 'de0de000-0000-4000-8000-000000000104'::uuid, tf_notext);

  -- Activities (notes / calls / stage history).
  insert into public.customer_activities (id, org_id, customer_id, type, body, at, created_by) values
    ('de0de000-0000-4000-8000-000000000901'::uuid, v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, 'created', 'Lead created from yard sign', ((t - 1) + time '08:30') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000902'::uuid, v_org, 'de0de000-0000-4000-8000-000000000113'::uuid, 'call', 'Left voicemail — wants spruce down before snow', ((t - 1) + time '09:10') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000903'::uuid, v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, 'stage', 'Stage → Estimate sent', ((t - 2) + time '16:00') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000904'::uuid, v_org, 'de0de000-0000-4000-8000-000000000114'::uuid, 'text', 'Sent estimate link by text', ((t - 2) + time '16:05') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000905'::uuid, v_org, 'de0de000-0000-4000-8000-000000000115'::uuid, 'note', 'Board meets 1st Tuesday — follow up after', ((t - 5) + time '11:00') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000906'::uuid, v_org, 'de0de000-0000-4000-8000-000000000116'::uuid, 'call', 'Storm call — maple on lines; photos incoming', ((t - 0) + time '07:45') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000907'::uuid, v_org, 'de0de000-0000-4000-8000-000000000101'::uuid, 'stage', 'Stage → Estimate sent', ((t - 3) + time '15:00') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000908'::uuid, v_org, 'de0de000-0000-4000-8000-000000000107'::uuid, 'note', 'Septic on east lawn — mats required', ((t - 14) + time '10:00') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000909'::uuid, v_org, 'de0de000-0000-4000-8000-000000000110'::uuid, 'call', 'Reminder on overdue balance', ((t - 3) + time '13:20') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000910'::uuid, v_org, 'de0de000-0000-4000-8000-000000000117'::uuid, 'stage', 'Stage → Booked (from job)', ((t - 16) + time '14:30') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000911'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, 'stage', 'Stage → Past customer (from job)', ((t - 20) + time '09:00') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000912'::uuid, v_org, 'de0de000-0000-4000-8000-000000000118'::uuid, 'note', 'Two properties — Unit A Front St, Unit B Boardman', ((t - 42) + time '12:00') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000913'::uuid, v_org, 'de0de000-0000-4000-8000-000000000112'::uuid, 'stage', 'Stage → Past customer', ((t - 9) + time '10:00') at time zone 'America/Detroit', v_owner),
    ('de0de000-0000-4000-8000-000000000914'::uuid, v_org, 'de0de000-0000-4000-8000-000000000108'::uuid, 'note', 'Too wet for grapple — wait for freeze', ((t - 1) + time '08:00') at time zone 'America/Detroit', v_owner);

  -- Extra smart lists (starter lists already seeded by seed_org_smart_lists).
  insert into public.smart_lists (id, org_id, name, query, stage_slugs, tag_refs, cold_only, pin_today, sort) values
    ('de0de000-0000-4000-8000-000000000551'::uuid, v_org, 'Booked this season', '', '["booked"]'::jsonb, '[]'::jsonb, false, true, 10),
    ('de0de000-0000-4000-8000-000000000552'::uuid, v_org, 'Storm / emergency', '', '[]'::jsonb,
      '[{"group":"services","tag":"storm-emergency"}]'::jsonb, false, false, 11),
    ('de0de000-0000-4000-8000-000000000553'::uuid, v_org, 'Commercial accounts', '', '[]'::jsonb,
      '[{"group":"type","tag":"commercial"}]'::jsonb, false, false, 12);

  raise notice 'CRM demo ready on %: +6 customers, properties/phones/emails/tags/activities, 3 extra jobs, smart lists.', v_name;
end
$crm$;

-- Verify
select
  (select count(*) from public.customers where id::text like 'de0de000-%' and deleted_at is null) as customers,
  (select count(*) from public.jobs where id::text like 'de0de000-%' and deleted_at is null) as jobs,
  (select count(*) from public.customer_properties where id::text like 'de0de000-%' and deleted_at is null) as properties,
  (select count(*) from public.customer_tags where customer_id::text like 'de0de000-%' and deleted_at is null) as customer_tags,
  (select count(*) from public.customer_activities where id::text like 'de0de000-%' and deleted_at is null) as activities,
  (select count(*) from public.smart_lists where deleted_at is null) as smart_lists_live;
