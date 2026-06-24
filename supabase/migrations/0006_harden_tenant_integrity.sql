alter table players add constraint players_id_tenant_uk unique (id, tenant_id);

alter table documents drop constraint documents_player_id_fkey;
alter table documents add constraint documents_player_fk
  foreign key (player_id, tenant_id) references players (id, tenant_id) on delete cascade;

alter table payments drop constraint payments_player_id_fkey;
alter table payments add constraint payments_player_fk
  foreign key (player_id, tenant_id) references players (id, tenant_id) on delete cascade;

alter table categories add constraint categories_tenant_name_uk unique (tenant_id, name);
