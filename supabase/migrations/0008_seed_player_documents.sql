create or replace function private.seed_player_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.documents (tenant_id, player_id, doc_type, status)
  select new.tenant_id, new.id, dt, 'pendiente'::public.document_status
  from unnest(enum_range(null::public.document_type)) as dt;
  return new;
end;
$$;

create trigger trg_players_seed_documents
  after insert on public.players
  for each row execute function private.seed_player_documents();
