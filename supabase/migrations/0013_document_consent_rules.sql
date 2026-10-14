drop policy documents_insert on public.documents;
drop policy documents_delete on public.documents;

alter table public.documents
  add constraint documents_file_path_iff_digital
  check ((status = 'digital') = (file_path is not null));

create or replace function private.enforce_document_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo text;
begin
  if tg_op = 'UPDATE'
     and (new.tenant_id <> old.tenant_id or new.player_id <> old.player_id or new.doc_type <> old.doc_type) then
    raise exception 'document_identity_immutable: tenant_id, player_id and doc_type cannot change';
  end if;

  -- serializes consent revocation against concurrent uploads for the same player
  select p.photo_path into v_photo
  from public.players p
  where p.id = new.player_id
  for no key update;

  if new.file_path is not null
     and new.file_path <> new.tenant_id::text || '/' || new.player_id::text || '/' || new.doc_type::text then
    raise exception 'file_path_mismatch: file_path must be %/%/%', new.tenant_id, new.player_id, new.doc_type;
  end if;

  if new.status = 'digital'::public.document_status
     and new.doc_type not in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
     and not private.player_consent_granted(new.player_id) then
    raise exception 'consent_required: image_consent and privacy_notice must be signed first';
  end if;

  if tg_op = 'UPDATE'
     and new.doc_type in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
     and new.status = 'pendiente'::public.document_status
     and old.status <> 'pendiente'::public.document_status
     and (
       v_photo is not null
       or exists (
         select 1 from public.documents d
         where d.player_id = new.player_id
           and d.doc_type not in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
           and d.status = 'digital'::public.document_status)
       or exists (
         select 1 from storage.objects o
         where o.bucket_id = 'player-files'
           and o.name like new.tenant_id::text || '/' || new.player_id::text || '/%'
           and split_part(o.name, '/', 3) not in ('image_consent', 'privacy_notice'))
     ) then
    raise exception 'consent_in_use: remove the photo and digital documents first';
  end if;

  return new;
end;
$$;

create trigger trg_documents_enforce_rules
  before insert or update on public.documents
  for each row execute function private.enforce_document_rules();

create or replace function private.enforce_player_photo_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_path is null then
    return new;
  end if;
  if new.photo_path <> new.tenant_id::text || '/' || new.id::text || '/photo' then
    raise exception 'invalid_file_path: photo_path must be %/%/photo', new.tenant_id, new.id;
  end if;
  if not private.player_consent_granted(new.id) then
    raise exception 'consent_required: image_consent and privacy_notice must be signed first';
  end if;
  return new;
end;
$$;

create trigger trg_players_enforce_photo
  before insert or update of photo_path on public.players
  for each row execute function private.enforce_player_photo_rules();
