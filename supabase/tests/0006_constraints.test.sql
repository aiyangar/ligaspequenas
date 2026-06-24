begin;
select plan(4);

select col_is_unique('public', 'players', array['id','tenant_id'], 'players unique (id, tenant_id)');
select col_is_unique('public', 'categories', array['tenant_id','name'], 'categories unique (tenant_id, name)');
select fk_ok('public','documents', array['player_id','tenant_id'], 'public','players', array['id','tenant_id'], 'documents (player_id,tenant_id) FK to players');
select fk_ok('public','payments', array['player_id','tenant_id'], 'public','players', array['id','tenant_id'], 'payments (player_id,tenant_id) FK to players');

select * from finish();
rollback;
