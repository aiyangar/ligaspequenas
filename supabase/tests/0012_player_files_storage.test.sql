begin;
select extensions.plan(25); -- 3 bucket + 3 consent + 10 path + 9 policy rows (Step 6); keep it equal to the final assertion count

-- fixtures: tenants X/Y, admin X, readonly X, admin Y, players P/Q in X (see plan Task 1 fixture block)

select extensions.is((select public from storage.buckets where id = 'player-files'), false, 'bucket is private');
select extensions.is((select file_size_limit from storage.buckets where id = 'player-files'), 10485760::bigint, 'bucket limit is 10 MB');
select extensions.is(
  (select allowed_mime_types::text from storage.buckets where id = 'player-files'),
  '{application/pdf,image/jpeg,image/png,image/webp}', 'bucket MIME allow-list');

-- consent helper: seeded rows are pendiente → false; both consents fisico → true; one consent row missing → false
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000099'), false, 'unknown player is not granted');
-- (as postgres) update documents set status = 'fisico' where player_id = P and doc_type in ('image_consent','privacy_notice')
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000001'), true, 'both consents fisico are granted');
-- (as postgres) delete from documents where player_id = Q and doc_type = 'privacy_notice'; update Q image_consent to fisico
select extensions.is(private.player_consent_granted('cccccccc-2222-0000-0000-000000000002'), false, 'a missing consent row is not granted');

-- path helper, acting as admin X (P has consent, Q does not)
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

-- storage.objects policies (see plan Task 1 Step 6 for the MCP form)
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

select set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);
select extensions.is(
  pg_temp.count_sql($q$delete from storage.objects where bucket_id = 'player-files' and name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp'$q$),
  1, 'admin X deletes a file in own tenant');
select set_config('role', 'postgres', true);

select * from extensions.finish();
rollback;
