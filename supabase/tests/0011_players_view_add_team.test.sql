begin;
select plan(3);

select has_column('public', 'players_with_category', 'category_id', 'view exposes category_id');
select has_column('public', 'players_with_category', 'team_id', 'view exposes team_id');
select has_column('public', 'players_with_category', 'team_name', 'view exposes team_name');

select * from finish();
rollback;
