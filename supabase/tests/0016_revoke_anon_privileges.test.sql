begin;

-- MCP call 1 (fixtures, as postgres): from here to the next marker
insert into public.tenants (id, name, slug) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'ZZ ACL X', 'zz-acl-x');
insert into auth.users (id, email) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'admin-x@zz-acl.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ZZ Admin X', 'admin');
insert into public.seasons (id, tenant_id, name, cutoff_date, is_active, updated_at) values
  ('eeeeeeee-3333-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ZZ Season', '2026-01-01', false, '2000-01-01');

-- MCP call 2 (assertions, as postgres): from here to the end marker
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
grant execute on function pg_temp.as_role(text, text, text) to public;

create table public.zz_acl_probe (id int);
alter table public.zz_acl_probe enable row level security;
create function private.zz_acl_probe() returns int language sql as 'select 1';

create temp table zz_results (k text primary key, v text);
insert into zz_results values ('D3', pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
  $q$with w as (insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values ('eeeeeeee-2222-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ZZ Player P', '2015-06-10', 'Tutor', '111') returning 1) select count(*)::text from w$q$));
insert into zz_results values ('D6w', pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
  $q$with w as (update public.seasons set name = name where id = 'eeeeeeee-3333-0000-0000-000000000001' returning 1) select count(*)::text from w$q$));

select extensions.plan(22);
select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as priv
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S') and has_table_privilege('anon', c.oid, priv)),
  0, 'A1 anon has no privilege on any public relation')
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (has_table_privilege('authenticated', c.oid, 'SELECT') and has_table_privilege('authenticated', c.oid, 'INSERT')
              and has_table_privilege('authenticated', c.oid, 'UPDATE') and has_table_privilege('authenticated', c.oid, 'DELETE'))),
  0, 'A2 authenticated keeps SELECT/INSERT/UPDATE/DELETE on every public table')
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v' and not has_table_privilege('authenticated', c.oid, 'SELECT')),
  0, 'A3 authenticated keeps SELECT on every public view')
union all select extensions.is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S') and not has_table_privilege('service_role', c.oid, 'SELECT')),
  0, 'A4 service_role keeps SELECT on every public relation')
union all select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'B1 anon cannot execute any private function')
union all select extensions.is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
  0, 'B2 no private function is executable by PUBLIC')
union all select extensions.is(has_function_privilege('authenticated', 'private.current_tenant_id()', 'EXECUTE'), true, 'B3 authenticated executes current_tenant_id')
union all select extensions.is(has_function_privilege('authenticated', 'private.is_admin()', 'EXECUTE'), true, 'B3 authenticated executes is_admin')
union all select extensions.is(has_function_privilege('authenticated', 'private.player_consent_granted(uuid)', 'EXECUTE'), true, 'B3 authenticated executes player_consent_granted')
union all select extensions.is(has_function_privilege('authenticated', 'private.player_file_path_allowed(text)', 'EXECUTE'), true, 'B3 authenticated executes player_file_path_allowed')
union all select extensions.is(has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE'), false, 'B4 anon cannot execute set_updated_at')
union all select extensions.is(
  (select count(*)::int from pg_default_acl d cross join aclexplode(d.defaclacl) a
   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole),
  0, 'C1 no default privilege for anon in public')
union all select extensions.is(
  (select count(*)::int from pg_default_acl d
   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
     and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)),
  1, 'C2 global function default of postgres exists and excludes PUBLIC')
union all select extensions.is(has_table_privilege('anon', 'public.zz_acl_probe', 'SELECT'), false, 'C3 a new public table is not readable by anon')
union all select extensions.is(has_table_privilege('authenticated', 'public.zz_acl_probe', 'SELECT'), true, 'C4 a new public table is readable by authenticated')
union all select extensions.is(has_function_privilege('anon', 'private.zz_acl_probe()', 'EXECUTE'), false, 'C5 a new private function is not executable by anon')
union all select extensions.is(left(pg_temp.as_role('anon', null, 'select count(*)::text from public.players'), 5), '42501', 'D1 anon is denied on players')
union all select extensions.is(left(pg_temp.as_role('anon', null, 'select count(*)::text from public.player_payment_status'), 5), '42501', 'D2 anon is denied on a security_invoker view')
union all select extensions.is((select v from zz_results where k = 'D3'), '1', 'D3 admin inserts a player')
union all select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$select count(*)::text from public.documents where player_id = 'eeeeeeee-2222-0000-0000-000000000001'$q$),
  '6', 'D4 the seed trigger still fires')
union all select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$with w as (update public.documents set status = 'digital', file_path = 'eeeeeeee-0000-0000-0000-000000000001/eeeeeeee-2222-0000-0000-000000000001/curp' where player_id = 'eeeeeeee-2222-0000-0000-000000000001' and doc_type = 'curp' returning 1) select count(*)::text from w$q$),
  'P0001 consent_required', 'D5 the document rules trigger still fires')
union all select extensions.is(
  pg_temp.as_role('authenticated', '{"sub":"eeeeeeee-1111-0000-0000-000000000001","role":"authenticated"}',
    $q$select (updated_at > '2000-01-01')::text from public.seasons where id = 'eeeeeeee-3333-0000-0000-000000000001'$q$),
  'true', 'D6 set_updated_at still fires');
-- MCP call 2 ends here

select * from extensions.finish();
rollback;
