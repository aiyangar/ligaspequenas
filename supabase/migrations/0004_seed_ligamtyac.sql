insert into tenants (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Liga MTY AC', 'ligamtyac')
on conflict (id) do nothing;

insert into seasons (tenant_id, name, cutoff_date, is_active)
values ('00000000-0000-0000-0000-000000000001', '2026-2027', '2027-04-30', true)
on conflict do nothing;

insert into categories (tenant_id, division, name, min_edad_liga, max_edad_liga, sort_order) values
  ('00000000-0000-0000-0000-000000000001', 'Pre-infantil', 'Pañalitos', 3, 4, 1),
  ('00000000-0000-0000-0000-000000000001', 'Pre-infantil', 'Escuelita', 5, 6, 2),
  ('00000000-0000-0000-0000-000000000001', 'Infantil', 'Infantil', 7, 8, 3),
  ('00000000-0000-0000-0000-000000000001', 'Infantil', 'Infantil Menor', 9, 10, 4),
  ('00000000-0000-0000-0000-000000000001', 'Infantil', 'Infantil Mayor', 11, 12, 5),
  ('00000000-0000-0000-0000-000000000001', 'Juvenil', 'Juvenil Menor', 13, 14, 6),
  ('00000000-0000-0000-0000-000000000001', 'Juvenil', 'Juvenil Mayor', 15, 16, 7),
  ('00000000-0000-0000-0000-000000000001', 'Juvenil Superior', 'Juvenil Superior Menor', 17, 18, 8),
  ('00000000-0000-0000-0000-000000000001', 'Juvenil Superior', 'Juvenil Superior Mayor', 19, 23, 9);
