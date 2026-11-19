begin;
select extensions.plan(10);

insert into public.tenants (id, name, slug) values
  ('ffffffff-0000-0000-0000-000000000001', 'ZZ No Delete X', 'zz-no-delete-x');
insert into auth.users (id, email) values
  ('ffffffff-1111-0000-0000-000000000001', 'admin-x@zz-no-delete.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('ffffffff-1111-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'ZZ Admin X', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('ffffffff-2222-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'ZZ Player P', '2015-06-10', 'Tutor', '111');

create or replace function pg_temp.as_role(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('role', p_role, true);
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  begin
    execute p_sql into r;
  exception when others then
    r := sqlstate || ' ' || split_part(sqlerrm, ':', 1);
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;

-- the forced error rolls the statement back even if it succeeds, so a TRUNCATE can never reach the live table
create or replace function pg_temp.as_role_undo(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('role', p_role, true);
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  begin
    execute p_sql;
    raise exception 'zz_undo';
  exception when others then
    r := case when sqlerrm = 'zz_undo' then 'ok' else sqlstate || ' ' || split_part(sqlerrm, ':', 1) end;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;
grant execute on function pg_temp.as_role(text, text, text), pg_temp.as_role_undo(text, text, text) to public;

select extensions.is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'players' and cmd in ('DELETE', 'ALL')),
  0, 'no DELETE policy on players');
select extensions.is(
  (select string_agg(policyname::text, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'players'),
  'players_insert,players_select,players_update', 'players keeps its select/insert/update policies');
select extensions.is(has_table_privilege('authenticated', 'public.players', 'DELETE'), false, 'authenticated has no DELETE on players');
select extensions.is(has_table_privilege('authenticated', 'public.players', 'TRUNCATE'), false, 'authenticated has no TRUNCATE on players');
select extensions.is(
  has_table_privilege('authenticated', 'public.players', 'SELECT') and has_table_privilege('authenticated', 'public.players', 'INSERT')
    and has_table_privilege('authenticated', 'public.players', 'UPDATE'),
  true, 'authenticated keeps SELECT/INSERT/UPDATE on players');
select extensions.is(has_table_privilege('service_role', 'public.players', 'DELETE'), true, 'service_role keeps DELETE on players');
select extensions.is(
  left(pg_temp.as_role('authenticated', '{"sub":"ffffffff-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$with w as (delete from public.players where id = 'ffffffff-2222-0000-0000-000000000001' returning 1) select count(*)::text from w$q$), 5),
  '42501', 'an admin DELETE through the API is denied');
select extensions.is(
  left(pg_temp.as_role_undo('authenticated', '{"sub":"ffffffff-1111-0000-0000-000000000001","role":"authenticated"}',
    'truncate public.players'), 5),
  '42501', 'an admin TRUNCATE is denied');
select extensions.is(
  (select count(*)::int from public.players where id = 'ffffffff-2222-0000-0000-000000000001'),
  1, 'the player still exists after the denied DELETE');
select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"ffffffff-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$with w as (update public.players set status = 'baja' where id = 'ffffffff-2222-0000-0000-000000000001' returning 1) select count(*)::text from w$q$),
  '1', 'an admin can still set a player to baja');

-- cleanup runs before finish() so the MCP form executes it
delete from public.players where id = 'ffffffff-2222-0000-0000-000000000001';
delete from public.profiles where id = 'ffffffff-1111-0000-0000-000000000001';
delete from auth.users where id = 'ffffffff-1111-0000-0000-000000000001';
delete from public.tenants where id = 'ffffffff-0000-0000-0000-000000000001';

select * from extensions.finish();
rollback;
