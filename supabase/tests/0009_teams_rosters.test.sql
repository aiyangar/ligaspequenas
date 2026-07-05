begin;
select plan(5);

select has_table('public', 'teams', 'teams table exists');
select has_table('public', 'team_players', 'team_players table exists');
select col_is_unique('public', 'team_players', array['player_id','season_id'], 'one team per player per season');
select fk_ok('public','team_players', array['team_id','tenant_id','season_id'], 'public','teams', array['id','tenant_id','season_id'], 'roster -> teams composite FK');
select fk_ok('public','team_players', array['player_id','tenant_id'], 'public','players', array['id','tenant_id'], 'roster -> players composite FK');

select * from finish();
rollback;
