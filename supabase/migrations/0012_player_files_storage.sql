insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-files', 'player-files', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.player_consent_granted(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) = 2
  from public.documents d
  where d.player_id = p_player_id
    and d.doc_type in ('image_consent'::public.document_type, 'privacy_notice'::public.document_type)
    and d.status <> 'pendiente'::public.document_status;
$$;

create or replace function private.player_file_path_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_tenant uuid := private.current_tenant_id();
  v_player uuid;
begin
  if v_tenant is null or coalesce(array_length(v_parts, 1), 0) <> 3 then
    return false;
  end if;
  if v_parts[1] <> v_tenant::text then
    return false;
  end if;
  -- compared as text: a uuid cast would raise 22P02 inside the policy instead of returning false
  select p.id into v_player
  from public.players p
  where p.id::text = v_parts[2] and p.tenant_id = v_tenant;
  if v_player is null then
    return false;
  end if;
  if v_parts[3] in ('image_consent', 'privacy_notice') then
    return true;
  end if;
  if v_parts[3] <> 'photo'
     and not (v_parts[3] = any (select unnest(enum_range(null::public.document_type))::text)) then
    return false;
  end if;
  return private.player_consent_granted(v_player);
end;
$$;

grant execute on function private.player_consent_granted(uuid) to authenticated;
grant execute on function private.player_file_path_allowed(text) to authenticated;

create policy player_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'player-files'
         and (storage.foldername(name))[1] = private.current_tenant_id()::text);

create policy player_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-files'
              and private.is_admin()
              and private.player_file_path_allowed(name));

create policy player_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'player-files'
         and private.is_admin()
         and private.player_file_path_allowed(name))
  with check (bucket_id = 'player-files'
              and private.is_admin()
              and private.player_file_path_allowed(name));

create policy player_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'player-files'
         and private.is_admin()
         and (storage.foldername(name))[1] = private.current_tenant_id()::text);
