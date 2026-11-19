begin;
select extensions.plan(28);

-- tenants X/Y, admin X, readonly X, admin Y, players P/Q in X
insert into public.tenants (id, name, slug) values
  ('cccccccc-0000-0000-0000-000000000001', 'Test Docs X', 'test-docs-x'),
  ('cccccccc-0000-0000-0000-000000000002', 'Test Docs Y', 'test-docs-y');
insert into auth.users (id, email) values
  ('cccccccc-1111-0000-0000-000000000001', 'admin-x@docs.test'),
  ('cccccccc-1111-0000-0000-000000000002', 'readonly-x@docs.test'),
  ('cccccccc-1111-0000-0000-000000000003', 'admin-y@docs.test');
insert into public.profiles (id, tenant_id, full_name, role) values
  ('cccccccc-1111-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Admin X', 'admin'),
  ('cccccccc-1111-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'Readonly X', 'readonly'),
  ('cccccccc-1111-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', 'Admin Y', 'admin');
insert into public.players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Docs Test P', '2015-06-10', 'Tutor', '111'),
  ('cccccccc-2222-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'Docs Test Q', '2015-06-10', 'Tutor', '111');

select extensions.is((select public from storage.buckets where id = 'player-files'), false, 'bucket is private');
select extensions.is((select file_size_limit from storage.buckets where id = 'player-files'), 10485760::bigint, 'bucket limit is 10 MB');
select extensions.is(
  (select allowed_mime_types::text from storage.buckets where id = 'player-files'),
  '{application/pdf,image/jpeg,image/png,image/webp}', 'bucket MIME allow-list');

-- consent helper: seeded rows are pendiente → false; both consents fisico → true; one consent row missing → false
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000099'), false, 'unknown player is not granted');
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type in ('image_consent', 'privacy_notice');
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000001'), true, 'both consents fisico are granted');
delete from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'privacy_notice';
update public.documents set status = 'fisico'
  where player_id = 'cccccccc-2222-0000-0000-000000000002' and doc_type = 'image_consent';
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000002'), false, 'a missing consent row is not granted');

-- path helper, acting as admin X (P has consent, Q does not)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'), true, 'document with consent allowed');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo'), true, 'photo with consent allowed');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp'), false, 'document without consent blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/image_consent'), true, 'consent document exempt from the lock');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000002/cccccccc-2222-0000-0000-000000000001/curp'), false, 'other tenant prefix blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/not-a-uuid/curp'), false, 'non-uuid player segment is false, not an error');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001'), false, 'two segments blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp/x'), false, 'four segments blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/passport'), false, 'unknown file name blocked');
select extensions.is(private.player_file_path_allowed('cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000099/curp'), false, 'unknown player blocked');
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);

-- storage.objects policies
create or replace function pg_temp.try_sql(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || split_part(sqlerrm, ':', 1);
end;
$$;

create or replace function pg_temp.count_sql(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function pg_temp.try_sql(text), pg_temp.count_sql(text) to public;

select set_config('role', 'postgres', true);
insert into storage.objects (bucket_id, name) values
  ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'),
  ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000002","role":"authenticated"}', true);
select extensions.is((select count(*) from storage.objects where bucket_id = 'player-files')::int, 2, 'readonly X sees own tenant objects');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is((select count(*) from storage.objects where bucket_id = 'player-files')::int, 0, 'admin Y sees no tenant X objects');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo')$q$),
  'ok', 'admin X uploads a photo for a consented player');
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp')$q$), 5),
  '42501', 'admin X cannot upload a document for a player without consent');
select extensions.is(
  pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/image_consent')$q$),
  'ok', 'admin X uploads a consent document without prior consent');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000002","role":"authenticated"}', true);
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/birth_certificate')$q$), 5),
  '42501', 'readonly X cannot upload');
select set_config('storage.allow_delete_query', 'true', true);
select extensions.is(
  pg_temp.count_sql($q$delete from storage.objects where bucket_id = 'player-files'$q$),
  0, 'readonly X cannot delete');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is(
  left(pg_temp.try_sql($q$insert into storage.objects (bucket_id, name) values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/proof_of_address')$q$), 5),
  '42501', 'admin Y cannot upload into tenant X');
select extensions.is(
  pg_temp.count_sql($q$delete from storage.objects where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'$q$),
  0, 'admin Y cannot delete a tenant X object');

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(
  pg_temp.try_sql($q$update storage.objects set name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/curp' where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent'$q$),
  '42501 new row violates row-level security policy for table "objects"', 'admin X cannot move a file onto a path the consent lock blocks');
select extensions.is(
  pg_temp.count_sql($q$update storage.objects set name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/medical_clearance' where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent'$q$),
  1, 'admin X moves a file to an allowed path');
select extensions.is(
  pg_temp.count_sql($q$delete from storage.objects where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'$q$),
  1, 'admin X deletes a file in own tenant');
select set_config('role', 'postgres', true);

-- cleanup runs before finish() so the MCP form executes it
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'player-files' and name like 'cccccccc-0000-0000-0000-00000000000%';
delete from public.players where id in ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000002');
delete from public.profiles where id::text like 'cccccccc-1111-%';
delete from auth.users where id::text like 'cccccccc-1111-%';
delete from public.tenants where id::text like 'cccccccc-0000-%';

select * from extensions.finish();
rollback;
