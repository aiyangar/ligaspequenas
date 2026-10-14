begin;
select extensions.plan(21);

-- fixtures: tenants X/Y, admin X, readonly X, admin Y, players P/Q in X (see plan Task 1 fixture block), created after 0013
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

-- act as admin X
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"cccccccc-1111-0000-0000-000000000001","role":"authenticated"}', true);

select extensions.is((select count(*) from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000001')::int, 6, 'seed still creates 6 rows');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'curp'$q$),
  'P0001 consent_required', 'digital document without consent is blocked');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/image_consent' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'ok', 'digital image_consent is exempt from the lock');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'fisico', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'privacy_notice'$q$),
  'ok', 'privacy_notice to fisico');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'curp'$q$),
  'ok', 'digital document with consent is allowed');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'privacy_notice'$q$),
  'P0001 consent_in_use', 'revoking consent with a digital document is blocked');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/birth_certificate' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'birth_certificate'$q$),
  'P0001 file_path_mismatch', 'file_path of another player is rejected');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/curp' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'birth_certificate'$q$),
  'P0001 file_path_mismatch', 'file_path of another doc_type is rejected');
select extensions.is(
  left(pg_temp.try_sql($q$update public.documents set status = 'digital', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'medical_clearance'$q$), 5),
  '23514', 'digital without file_path violates the check');
select extensions.is(
  left(pg_temp.try_sql($q$update public.documents set status = 'fisico', file_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/proof_of_address' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$), 5),
  '23514', 'fisico with file_path violates the check');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set doc_type = 'medical_clearance' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$),
  'P0001 document_identity_immutable', 'doc_type cannot change');
select extensions.is(
  pg_temp.try_sql($q$update public.documents set player_id = 'cccccccc-2222-0000-0000-000000000002' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$),
  'P0001 document_identity_immutable', 'player_id cannot change');

select set_config('role', 'postgres', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set tenant_id = 'cccccccc-0000-0000-0000-000000000002' where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'proof_of_address'$q$),
  'P0001 document_identity_immutable', 'tenant_id cannot change');
select set_config('role', 'authenticated', true);

select extensions.is(
  pg_temp.count_sql($q$delete from public.documents where player_id = 'cccccccc-2222-0000-0000-000000000001'$q$),
  0, 'admin cannot delete document rows');
select extensions.is(
  left(pg_temp.try_sql($q$insert into public.documents (tenant_id, player_id, doc_type) values ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-2222-0000-0000-000000000001', 'curp')$q$), 5),
  '42501', 'admin cannot insert document rows');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo' where id = 'cccccccc-2222-0000-0000-000000000002'$q$),
  'P0001 invalid_file_path', 'photo_path of another player is rejected');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000002/photo' where id = 'cccccccc-2222-0000-0000-000000000002'$q$),
  'P0001 consent_required', 'photo without consent is blocked');
select extensions.is(
  pg_temp.try_sql($q$update public.players set photo_path = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/photo' where id = 'cccccccc-2222-0000-0000-000000000001'$q$),
  'ok', 'photo with consent is allowed');

select set_config('role', 'postgres', true);
update public.documents set status = 'fisico', file_path = null
  where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'curp';
select set_config('role', 'authenticated', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'P0001 consent_in_use', 'revoking consent with a photo is blocked');

select set_config('role', 'postgres', true);
update public.players set photo_path = null where id = 'cccccccc-2222-0000-0000-000000000001';
insert into storage.objects (bucket_id, name)
  values ('player-files', 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/medical_clearance');
select set_config('role', 'authenticated', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'P0001 consent_in_use', 'revoking consent with an orphan object is blocked');

select set_config('role', 'postgres', true);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects
  where name = 'cccccccc-0000-0000-0000-000000000001/cccccccc-2222-0000-0000-000000000001/medical_clearance';
select set_config('role', 'authenticated', true);
select extensions.is(
  pg_temp.try_sql($q$update public.documents set status = 'pendiente', file_path = null where player_id = 'cccccccc-2222-0000-0000-000000000001' and doc_type = 'image_consent'$q$),
  'ok', 'revoking consent with no files in use is allowed');
select set_config('role', 'postgres', true);

select * from extensions.finish();
rollback;
