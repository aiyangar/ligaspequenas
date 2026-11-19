begin;
select extensions.plan(32);

insert into public.tenants (id, name, slug) values
  ('abcdabcd-0000-0000-0000-000000000001', 'ZZ Path X', 'zz-path-x'),
  ('abcdabcd-0000-0000-0000-000000000002', 'ZZ Path Y', 'zz-path-y');
insert into auth.users (id, email) values
  ('abcdabcd-1111-0000-0000-000000000001', 'admin-x@zz-path.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('abcdabcd-1111-0000-0000-000000000001', 'abcdabcd-0000-0000-0000-000000000001', 'ZZ Admin X', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('abcdabcd-2222-0000-0000-000000000001', 'abcdabcd-0000-0000-0000-000000000001', 'ZZ Path P', '2015-06-10', 'Tutor', '111'),
  ('abcdabcd-2222-0000-0000-000000000002', 'abcdabcd-0000-0000-0000-000000000001', 'ZZ Path Q', '2015-06-10', 'Tutor', '111'),
  ('abcdabcd-2222-0000-0000-000000000003', 'abcdabcd-0000-0000-0000-000000000002', 'ZZ Path R', '2015-06-10', 'Tutor', '111');
update public.documents set status = 'fisico'
  where player_id in ('abcdabcd-2222-0000-0000-000000000001', 'abcdabcd-2222-0000-0000-000000000003')
    and doc_type in ('image_consent', 'privacy_notice');

create or replace function pg_temp.try_sql(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || split_part(sqlerrm, ':', 1);
end;
$$;
grant execute on function pg_temp.try_sql(text) to public;

select extensions.is(
  (select provolatile::text from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  'v', 'path helper is still volatile');
select extensions.is(
  (select prosecdef from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  true, 'path helper is still security definer');
select extensions.is(
  (select 'search_path=""' = any (proconfig) from pg_proc where oid = 'private.player_file_path_allowed(text)'::regprocedure),
  true, 'path helper still pins an empty search_path');
select extensions.is(
  (select d ~ 'from public\.players p\s+where\s+p\.id\s*=\s*v_parts\[2\]::uuid\s+and\s+p\.tenant_id\s*=\s*v_tenant\s+for share;'
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'path helper looks the player up by uuid under FOR SHARE');
select extensions.is(
  (select position('p.id::text' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  0, 'path helper no longer compares the player id as text');
select extensions.is(
  (select position('!~' in d) between 1 and position('v_parts[2]::uuid' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'a uuid shape check runs before the cast');
select extensions.is(
  (select position('for share;' in d) between 1 and position('player_consent_granted' in d)
   from (select lower(pg_get_functiondef('private.player_file_path_allowed(text)'::regprocedure)) as d) s),
  true, 'the FOR SHARE lock still comes before the consent check');
select extensions.is(has_function_privilege('authenticated', 'private.player_file_path_allowed(text)', 'EXECUTE'), true, 'authenticated executes the path helper');
select extensions.is(has_function_privilege('anon', 'private.player_file_path_allowed(text)', 'EXECUTE'), false, 'anon cannot execute the path helper');
select extensions.is(has_function_privilege('authenticated', 'private.player_consent_granted(uuid)', 'EXECUTE'), false, 'authenticated cannot execute the consent helper');
select extensions.is(has_function_privilege('anon', 'private.player_consent_granted(uuid)', 'EXECUTE'), false, 'anon cannot execute the consent helper');
select extensions.is(
  (select count(*)::int from pg_policies
   where coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%player_consent_granted%'),
  0, 'no policy calls the consent helper');
select extensions.is(
  (select string_agg(p.proname::text, ',' order by p.proname) from pg_proc p
   where p.prosrc like '%player_consent_granted%'
     and p.oid <> 'private.player_consent_granted(uuid)'::regprocedure
     and p.pronamespace::regnamespace::text not like 'pg_temp%'),
  'enforce_document_rules,enforce_player_photo_rules,player_file_path_allowed', 'the consent helper has exactly three callers');
select extensions.is(
  (select bool_and(p.prosecdef) from pg_proc p
   where p.prosrc like '%player_consent_granted%'
     and p.oid <> 'private.player_consent_granted(uuid)'::regprocedure
     and p.pronamespace::regnamespace::text not like 'pg_temp%'),
  true, 'every caller of the consent helper is security definer');
select extensions.is(
  (select bool_and(has_function_privilege(p.proowner, 'private.player_consent_granted(uuid)'::regprocedure, 'EXECUTE')) from pg_proc p
   where p.prosrc like '%player_consent_granted%'
     and p.oid <> 'private.player_consent_granted(uuid)'::regprocedure
     and p.pronamespace::regnamespace::text not like 'pg_temp%'),
  true, 'every caller''s owner still executes the consent helper');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"abcdabcd-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(
  pg_temp.try_sql($q$select private.player_consent_granted('abcdabcd-2222-0000-0000-000000000001')$q$),
  '42501 permission denied for function player_consent_granted', 'an admin cannot call the consent helper directly');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/curp'), true, 'document with consent allowed');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/photo'), true, 'photo with consent allowed');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/curp'), false, 'document without consent blocked');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/privacy_notice'), true, 'consent document exempt from the lock');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000003/curp'), false, 'a player of another tenant is blocked');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000002/abcdabcd-2222-0000-0000-000000000001/curp'), false, 'other tenant prefix blocked');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/not-a-uuid/curp'), false, 'non-uuid player segment is false, not an error');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/ABCDABCD-2222-0000-0000-000000000001/curp'), false, 'an uppercase player uuid is false, as with the text comparison');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd222200000000000000000001/curp'), false, 'a player uuid without hyphens is false');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001x/curp'), false, 'a player uuid with a suffix is false');
select extensions.is(private.player_file_path_allowed('abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000099/curp'), false, 'unknown player blocked');
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/photo')$q$),
  'ok', 'admin X uploads a photo for a consented player');
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/curp')$q$), 5),
  '42501', 'admin X cannot upload a document for a player without consent');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/curp' where player_id = 'abcdabcd-2222-0000-0000-000000000001' and doc_type = 'curp'$q$),
  'ok', 'the document trigger still grants a consented player after the revoke');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000002/curp' where player_id = 'abcdabcd-2222-0000-0000-000000000002' and doc_type = 'curp'$q$),
  'P0001 consent_required', 'the document trigger still blocks a player without consent');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'abcdabcd-0000-0000-0000-000000000001/abcdabcd-2222-0000-0000-000000000001/photo' where id = 'abcdabcd-2222-0000-0000-000000000001'$q$),
  'ok', 'the photo trigger still grants a consented player after the revoke');

-- cleanup runs before finish() so the MCP form executes it
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'player-files' and name like 'abcdabcd-%';
delete from public.players where tenant_id::text like 'abcdabcd-%';
delete from public.profiles where id::text like 'abcdabcd-%';
delete from auth.users where id::text like 'abcdabcd-%';
delete from public.tenants where id::text like 'abcdabcd-%';

select * from extensions.finish();
rollback;
