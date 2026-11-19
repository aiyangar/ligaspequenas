begin;
select extensions.plan(6);

-- two tenants, three users: admin+readonly in tenant A, admin in tenant B
insert into public.tenants (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'readonly-a@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin-b@test.com');

insert into public.profiles (id, tenant_id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin A', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Readonly A', 'readonly'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin B', 'admin');

-- a player in tenant A
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Player A', '2015-06-10', 'Tutor', '111');

-- pg_temp keeps the file self-contained: the remote has no tests schema
create or replace function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.act_as(uuid) to public;

-- 1: admin A can read their player
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select count(*) from public.players)::int, 1, 'admin A sees tenant A player');

-- 2: readonly A can read
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select count(*) from public.players)::int, 1, 'readonly A sees tenant A player');

-- 3: admin B (other tenant) sees nothing
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select count(*) from public.players)::int, 0, 'admin B does not see tenant A player');

-- 4: readonly A cannot insert
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select extensions.throws_ok(
  $$insert into public.players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nope', '2016-01-01', 'T', '1')$$,
  '42501', null, 'readonly cannot insert players'
);

-- 5: admin A can insert
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select extensions.lives_ok(
  $$insert into public.players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Yes', '2016-01-01', 'T', '1')$$,
  'admin can insert players'
);

-- 6: RLS is enabled on players
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select extensions.is(
  (select relrowsecurity from pg_class where oid = 'public.players'::regclass),
  true,
  'RLS enabled on players'
);

-- cleanup runs before finish() so the MCP form executes it
delete from public.players where tenant_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
delete from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
delete from public.tenants where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select * from extensions.finish();
rollback;
