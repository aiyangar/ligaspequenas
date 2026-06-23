begin;
select plan(3);

select is(
  (select count(*) from categories where tenant_id = '00000000-0000-0000-0000-000000000001')::int,
  9, 'Liga MTY AC has 9 seeded categories'
);

select is(
  (select cutoff_date from seasons where tenant_id = '00000000-0000-0000-0000-000000000001' and is_active),
  date '2027-04-30', 'active season cutoff is 2027-04-30'
);

select is(
  (select max_edad_liga from categories
   where tenant_id = '00000000-0000-0000-0000-000000000001' and name = 'Juvenil Superior Mayor'),
  23, 'Juvenil Superior Mayor tops out at edad liga 23'
);

select * from finish();
rollback;
