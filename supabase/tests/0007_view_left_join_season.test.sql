begin;
select plan(4);

-- a tenant with NO active season (seasonless)
insert into tenants (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000b2', 'No Season Tenant', 'no-season');

insert into players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('00000000-0000-0000-0000-0000000000b2', 'NS1', '2015-06-10', 'T', '1'),
  ('00000000-0000-0000-0000-000000000001', 'A1', '2015-06-10', 'T', '1');

-- seasonless-tenant player still surfaces, with null derived fields
select is((select count(*) from players_with_category where full_name = 'NS1')::int, 1, 'seasonless-tenant player appears in view');
select is((select edad_liga from players_with_category where full_name = 'NS1'), null, 'seasonless player has null edad_liga');
select is((select category_name from players_with_category where full_name = 'NS1'), null, 'seasonless player has null category');

-- the normal active-season path is unaffected
select is((select category_name from players_with_category where full_name = 'A1'), 'Infantil Mayor', 'active-season player still categorized');

select * from finish();
rollback;
