-- tenant-integrity uniques needed for the composite FKs below (0006 pattern)
alter table seasons add constraint seasons_id_tenant_uk unique (id, tenant_id);
alter table categories add constraint categories_id_tenant_uk unique (id, tenant_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  season_id uuid not null,
  category_id uuid not null,
  name text not null,
  coach text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_season_fk foreign key (season_id, tenant_id) references seasons (id, tenant_id),
  constraint teams_category_fk foreign key (category_id, tenant_id) references categories (id, tenant_id),
  constraint teams_tenant_season_name_uk unique (tenant_id, season_id, name),
  constraint teams_id_tenant_season_uk unique (id, tenant_id, season_id)
);
create index teams_tenant_idx on teams (tenant_id);

create table team_players (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  season_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_players_team_fk foreign key (team_id, tenant_id, season_id)
    references teams (id, tenant_id, season_id) on delete cascade,
  constraint team_players_player_fk foreign key (player_id, tenant_id)
    references players (id, tenant_id) on delete cascade,
  constraint team_players_player_season_uk unique (player_id, season_id)
);
create index team_players_tenant_idx on team_players (tenant_id);
create index team_players_team_idx on team_players (team_id);
create index team_players_player_idx on team_players (player_id);

create trigger trg_teams_updated before update on teams for each row execute function set_updated_at();
create trigger trg_team_players_updated before update on team_players for each row execute function set_updated_at();

alter table teams enable row level security;
alter table team_players enable row level security;

create policy teams_select on teams for select to authenticated using (tenant_id = private.current_tenant_id());
create policy teams_insert on teams for insert to authenticated with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy teams_update on teams for update to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy teams_delete on teams for delete to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin());

create policy team_players_select on team_players for select to authenticated using (tenant_id = private.current_tenant_id());
create policy team_players_insert on team_players for insert to authenticated with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy team_players_update on team_players for update to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
create policy team_players_delete on team_players for delete to authenticated using (tenant_id = private.current_tenant_id() and private.is_admin());

create view teams_with_meta with (security_invoker = true) as
select
  t.*,
  c.name as category_name,
  c.division,
  c.sort_order as category_sort_order,
  s.is_active as season_is_active,
  (select count(*) from team_players tp where tp.team_id = t.id) as player_count
from teams t
join categories c on c.id = t.category_id
join seasons s on s.id = t.season_id;
