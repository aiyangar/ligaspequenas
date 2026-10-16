begin;
select extensions.plan(21);

-- fixtures: tenants A/B, admin A, readonly A, admin B, players S1–S5, payments 1–6 (see plan Task 1 fixture block)
insert into public.tenants (id, name, slug) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Test Status A', 'test-status-a'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'Test Status B', 'test-status-b');
insert into auth.users (id, email) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'admin-a@status.test'),
  ('eeeeeeee-1111-0000-0000-000000000002', 'readonly-a@status.test'),
  ('eeeeeeee-1111-0000-0000-000000000003', 'admin-b@status.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Admin A', 'admin'),
  ('eeeeeeee-1111-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'Readonly A', 'readonly'),
  ('eeeeeeee-1111-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000002', 'Admin B', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp, status) values
  ('eeeeeeee-2222-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Sin Pagos', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Al Corriente', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Con Adeudo', '2015-06-10', 'Tutor', '111', 'activo'),
  ('eeeeeeee-2222-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'Status Test Baja', '2015-06-10', 'Tutor', '111', 'baja'),
  ('eeeeeeee-2222-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000002', 'Status Test B', '2015-06-10', 'Tutor', '111', 'activo');
insert into public.payments (id, tenant_id, player_id, concept, amount, method, status) values
  ('eeeeeeee-3333-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000002', 'inscripcion', 500, 'efectivo', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000002', 'mensualidad', 200, 'efectivo', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000003', 'uniforme', 300, 'efectivo', 'pendiente'),
  ('eeeeeeee-3333-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000003', 'inscripcion', 500, 'transferencia', 'pagado'),
  ('eeeeeeee-3333-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-2222-0000-0000-000000000004', 'mensualidad', 100, 'efectivo', 'parcial'),
  ('eeeeeeee-3333-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-2222-0000-0000-000000000005', 'inscripcion', 500, 'efectivo', 'pendiente');
update public.documents set status = 'fisico'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000002'
    and doc_type in ('curp', 'birth_certificate', 'proof_of_address');
update public.documents set status = 'fisico'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000003'
    and doc_type <> 'image_consent';
update public.documents
  set status = 'digital',
      file_path = 'eeeeeeee-0000-0000-0000-000000000001/eeeeeeee-2222-0000-0000-000000000003/image_consent'
  where player_id = 'eeeeeeee-2222-0000-0000-000000000003'
    and doc_type = 'image_consent';

-- structure
select extensions.is(
  (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.players_with_category'::regclass),
  true, 'view still runs as security invoker');
select extensions.is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category'),
  'id,tenant_id,full_name,birth_date,curp,photo_path,status,enrollment_date,tutor_name,tutor_whatsapp,tutor_email,emergency_contact_name,emergency_contact_phone,affiliation_status,affiliation_date,created_at,updated_at,edad_liga,division,category_name,category_year,category_id,team_id,team_name,payment_state,docs_delivered',
  'existing columns keep their order and the two new ones are appended');
select extensions.is(
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'docs_delivered'),
  'integer', 'docs_delivered is integer');
select extensions.is(
  (select data_type::text from information_schema.columns
    where table_schema = 'public' and table_name = 'players_with_category' and column_name = 'payment_state'),
  'text', 'payment_state is text');

-- values (as postgres)
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001'), 'sin_pagos', 'no payments is sin_pagos');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000001'), 0, 'untouched documents count 0');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002'), 'al_corriente', 'only pagado is al_corriente');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002'), 3, 'three fisico documents count 3');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo', 'a pendiente is con_adeudo');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 6, 'fisico and digital both count');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000004'), 'con_adeudo', 'baja player with a parcial appears as con_adeudo');
select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000002')::int, 1, 'several payments and documents keep one row (S2)');
select extensions.is((select count(*) from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003')::int, 1, 'several payments and documents keep one row (S3)');

-- isolation (security_invoker → players/documents/player_payment_status RLS applies)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is((select count(*) from public.players_with_category)::int, 4, 'admin A sees the 4 tenant A players');
select extensions.is((select payment_state from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo', 'admin A reads payment_state');
select extensions.is((select docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 6, 'admin A reads docs_delivered');
select extensions.is((select count(*) from public.players_with_category where tenant_id = 'eeeeeeee-0000-0000-0000-000000000002')::int, 0, 'admin A sees no tenant B rows');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000002","role":"authenticated"}', true);
select extensions.is((select count(*) from public.players_with_category)::int, 4, 'readonly A sees the same rows as admin A');
select extensions.is((select payment_state || '/' || docs_delivered from public.players_with_category where id = 'eeeeeeee-2222-0000-0000-000000000003'), 'con_adeudo/6', 'readonly A reads payment_state and docs_delivered');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-1111-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is((select count(*) from public.players_with_category)::int, 1, 'admin B sees only its tenant row');
-- spec §3.3: record anon's privilege on the view before asserting what anon sees
select extensions.diag('anon select on players_with_category: ' || has_table_privilege('anon', 'public.players_with_category', 'select')::text);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok($$select count(*) from public.players_with_category$$, '42501', null, 'anon is denied on players_with_category');
select set_config('role', 'postgres', true);

select * from extensions.finish();
rollback;
