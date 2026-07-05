create or replace function private.enforce_team_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams;
  v_birth date;
  v_status public.player_status;
  v_edad int;
  v_expected uuid;
begin
  -- lock the team row so a concurrent teams.category_id change serializes (TOCTOU guard)
  select * into v_team from public.teams where id = new.team_id for update;

  select birth_date, status into v_birth, v_status
  from public.players where id = new.player_id;

  if v_status <> 'activo'::public.player_status then
    raise exception 'player % is not activo; cannot be rostered', new.player_id;
  end if;

  select extract(year from age(s.cutoff_date, v_birth))::int into v_edad
  from public.seasons s where s.id = v_team.season_id;

  select c.id into v_expected
  from public.categories c
  where c.tenant_id = v_team.tenant_id
    and v_edad between c.min_edad_liga and c.max_edad_liga;

  if v_expected is null then
    raise exception 'player % is out of category (edad_liga %); cannot be rostered', new.player_id, v_edad;
  end if;

  if v_expected <> v_team.category_id then
    raise exception 'player category does not match team category';
  end if;

  return new;
end;
$$;

create trigger trg_team_players_enforce_category
  before insert or update on public.team_players
  for each row execute function private.enforce_team_category();

create or replace function private.guard_team_category_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.category_id <> old.category_id or new.season_id <> old.season_id)
     and exists (select 1 from public.team_players tp where tp.team_id = old.id) then
    raise exception 'cannot change category/season of a team with players; empty the roster first';
  end if;
  return new;
end;
$$;

create trigger trg_teams_guard_category_change
  before update on public.teams
  for each row execute function private.guard_team_category_change();
