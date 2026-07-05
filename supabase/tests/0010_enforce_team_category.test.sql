begin;
select plan(1);

select has_function('private', 'enforce_team_category', 'category-enforcement trigger fn exists');

select * from finish();
rollback;
