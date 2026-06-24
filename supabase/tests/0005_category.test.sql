begin;
select plan(8);

-- insert fixtures into Liga MTY AC (tenant seeded in 0004)
insert into players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp) values
  ('00000000-0000-0000-0000-000000000001', 'F1', '2023-05-15', 'T', '1'),
  ('00000000-0000-0000-0000-000000000001', 'F2', '2024-04-20', 'T', '1'),
  ('00000000-0000-0000-0000-000000000001', 'F3', '2024-05-01', 'T', '1'),
  ('00000000-0000-0000-0000-000000000001', 'F4', '2019-05-01', 'T', '1'),
  ('00000000-0000-0000-0000-000000000001', 'F5', '2020-04-30', 'T', '1'),
  ('00000000-0000-0000-0000-000000000001', 'F6', '2015-06-10', 'T', '1'),
  ('00000000-0000-0000-0000-000000000001', 'F7', '2003-06-10', 'T', '1');

select is((select edad_liga from players_with_category where full_name='F1'), 3, 'F1 edad liga 3');
select is((select category_name from players_with_category where full_name='F1'), 'Pañalitos', 'F1 Pañalitos');
select is((select category_year from players_with_category where full_name='F1'), 1, 'F1 year 1');
select is((select category_name from players_with_category where full_name='F2'), 'Pañalitos', 'F2 Pañalitos (Apr boundary)');
select is((select category_name from players_with_category where full_name='F3'), null, 'F3 below range -> null (out of category)');
select is((select category_name from players_with_category where full_name='F4'), 'Infantil', 'F4 Infantil (May boundary)');
select is((select category_name from players_with_category where full_name='F6'), 'Infantil Mayor', 'F6 Infantil Mayor');
select is((select category_year from players_with_category where full_name='F7'), 5, 'F7 Juvenil Superior Mayor 5to');

select * from finish();
rollback;
