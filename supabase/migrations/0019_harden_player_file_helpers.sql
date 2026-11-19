-- only security definer code calls this helper (the path helper and the 0013 triggers), and they run as its owner
revoke execute on function private.player_consent_granted(uuid) from authenticated;

create or replace function private.player_file_path_allowed(p_name text)
returns boolean
language plpgsql
volatile
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
  -- only the lowercase form uuid::text produces could match before, and the guard keeps a bad cast from raising 22P02
  if v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  -- the share lock queues this write behind a consent revocation's no key update lock (0013)
  select p.id into v_player
  from public.players p
  where p.id = v_parts[2]::uuid and p.tenant_id = v_tenant
  for share;
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

grant execute on function private.player_file_path_allowed(text) to authenticated;
