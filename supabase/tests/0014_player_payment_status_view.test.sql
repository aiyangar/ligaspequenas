begin;
select extensions.plan(17);

-- fixtures: tenants A/B, admin A, readonly A, admin B, players P1–P6, payments 1–6 (see plan Task 1 fixture block)
insert into public.tenants (id, name, slug) values
  ('dddddddd-0000-0000-0000-000000000001', 'Test Pay A', 'test-pay-a'),
  ('dddddddd-0000-0000-0000-000000000002', 'Test Pay B', 'test-pay-b');
insert into auth.users (id, email) values
  ('dddddddd-1111-0000-0000-000000000001', 'admin-a@pay.test'),
  ('dddddddd-1111-0000-0000-000000000002', 'readonly-a@pay.test'),
  ('dddddddd-1111-0000-0000-000000000003', 'admin-b@pay.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('dddddddd-1111-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Admin A', 'admin'),
  ('dddddddd-1111-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Readonly A', 'readonly'),
  ('dddddddd-1111-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000002', 'Admin B', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp, status) values
  ('dddddddd-2222-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Sin Pagos', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Pagado', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Parcial', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Pendiente', '2015-06-10', 'Tutor', '111', 'activo'),
  ('dddddddd-2222-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000001', 'Pay Test Baja', '2015-06-10', 'Tutor', '111', 'baja'),
  ('dddddddd-2222-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000002', 'Pay Test B', '2015-06-10', 'Tutor', '111', 'activo');
insert into public.payments (id, tenant_id, player_id, concept, amount, method, status) values
  ('dddddddd-3333-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000002', 'inscripcion', 500, 'efectivo', 'pagado'),
  ('dddddddd-3333-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000003', 'inscripcion', 500, 'efectivo', 'pagado'),
  ('dddddddd-3333-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000003', 'mensualidad', 200, 'transferencia', 'parcial'),
  ('dddddddd-3333-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000004', 'uniforme', 300, 'efectivo', 'pendiente'),
  ('dddddddd-3333-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000001', 'dddddddd-2222-0000-0000-000000000005', 'mensualidad', 100, 'efectivo', 'pendiente'),
  ('dddddddd-3333-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000002', 'dddddddd-2222-0000-0000-000000000006', 'inscripcion', 500, 'efectivo', 'pendiente');

-- structure
select extensions.has_view('public', 'player_payment_status', 'player_payment_status is a view');
select extensions.has_column('public', 'player_payment_status', 'player_id', 'view has player_id');
select extensions.has_column('public', 'player_payment_status', 'tenant_id', 'view has tenant_id');
select extensions.has_column('public', 'player_payment_status', 'payment_state', 'view has payment_state');
select extensions.is(
  (select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'public.player_payment_status'::regclass),
  true, 'view runs as security invoker');
select extensions.is(
  (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'player_payment_status'),
  'player_id,tenant_id,payment_state', 'view exposes exactly player_id, tenant_id, payment_state');

-- grouping (as postgres)
select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000001'), 'sin_pagos', 'no payments is sin_pagos');
select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000002'), 'al_corriente', 'only pagado is al_corriente');
select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000003'), 'con_adeudo', 'pagado + parcial is con_adeudo');
select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000004'), 'con_adeudo', 'only pendiente is con_adeudo');
select extensions.is((select payment_state from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000005'), 'con_adeudo', 'baja player still appears');
select extensions.is((select count(*) from public.player_payment_status where player_id = 'dddddddd-2222-0000-0000-000000000003')::int, 1, 'one row per player with several payments');

-- isolation (security_invoker → players/payments RLS applies)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"dddddddd-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is((select count(*) from public.player_payment_status)::int, 5, 'admin A sees the 5 tenant A players');
select extensions.is((select count(*) from public.player_payment_status where tenant_id = 'dddddddd-0000-0000-0000-000000000002')::int, 0, 'admin A sees no tenant B rows');
select set_config('request.jwt.claims', '{"sub":"dddddddd-1111-0000-0000-000000000002","role":"authenticated"}', true);
select extensions.is((select count(*) from public.player_payment_status)::int, 5, 'readonly A reads its tenant rows');
select set_config('request.jwt.claims', '{"sub":"dddddddd-1111-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is((select count(*) from public.player_payment_status)::int, 1, 'admin B sees only its tenant row');
-- spec §3.2: record anon's privilege on the view before asserting what anon sees
select extensions.diag('anon select on player_payment_status: ' || has_table_privilege('anon', 'public.player_payment_status', 'select')::text);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is((select count(*) from public.player_payment_status)::int, 0, 'anon sees no rows');
select set_config('role', 'postgres', true);

select * from extensions.finish();
rollback;
