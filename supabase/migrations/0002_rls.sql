-- harden the updated_at trigger function (linter: function_search_path_mutable)
create or replace function set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

alter table tenants enable row level security;
alter table profiles enable row level security;
alter table seasons enable row level security;
alter table categories enable row level security;
alter table players enable row level security;
alter table documents enable row level security;
alter table payments enable row level security;

-- tenants: read own only
create policy tenants_select on tenants for select to authenticated
  using (id = current_tenant_id());

-- profiles: read self or (admin within tenant); admin writes within tenant
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or (tenant_id = current_tenant_id() and is_admin()));
create policy profiles_insert on profiles for insert to authenticated
  with check (tenant_id = current_tenant_id() and is_admin());
create policy profiles_update on profiles for update to authenticated
  using (tenant_id = current_tenant_id() and is_admin())
  with check (tenant_id = current_tenant_id() and is_admin());
create policy profiles_delete on profiles for delete to authenticated
  using (tenant_id = current_tenant_id() and is_admin());

-- macro applied to each league table: select for tenant, write for admin
-- seasons
create policy seasons_select on seasons for select to authenticated using (tenant_id = current_tenant_id());
create policy seasons_insert on seasons for insert to authenticated with check (tenant_id = current_tenant_id() and is_admin());
create policy seasons_update on seasons for update to authenticated using (tenant_id = current_tenant_id() and is_admin()) with check (tenant_id = current_tenant_id() and is_admin());
create policy seasons_delete on seasons for delete to authenticated using (tenant_id = current_tenant_id() and is_admin());
-- categories
create policy categories_select on categories for select to authenticated using (tenant_id = current_tenant_id());
create policy categories_insert on categories for insert to authenticated with check (tenant_id = current_tenant_id() and is_admin());
create policy categories_update on categories for update to authenticated using (tenant_id = current_tenant_id() and is_admin()) with check (tenant_id = current_tenant_id() and is_admin());
create policy categories_delete on categories for delete to authenticated using (tenant_id = current_tenant_id() and is_admin());
-- players
create policy players_select on players for select to authenticated using (tenant_id = current_tenant_id());
create policy players_insert on players for insert to authenticated with check (tenant_id = current_tenant_id() and is_admin());
create policy players_update on players for update to authenticated using (tenant_id = current_tenant_id() and is_admin()) with check (tenant_id = current_tenant_id() and is_admin());
create policy players_delete on players for delete to authenticated using (tenant_id = current_tenant_id() and is_admin());
-- documents
create policy documents_select on documents for select to authenticated using (tenant_id = current_tenant_id());
create policy documents_insert on documents for insert to authenticated with check (tenant_id = current_tenant_id() and is_admin());
create policy documents_update on documents for update to authenticated using (tenant_id = current_tenant_id() and is_admin()) with check (tenant_id = current_tenant_id() and is_admin());
create policy documents_delete on documents for delete to authenticated using (tenant_id = current_tenant_id() and is_admin());
-- payments
create policy payments_select on payments for select to authenticated using (tenant_id = current_tenant_id());
create policy payments_insert on payments for insert to authenticated with check (tenant_id = current_tenant_id() and is_admin());
create policy payments_update on payments for update to authenticated using (tenant_id = current_tenant_id() and is_admin()) with check (tenant_id = current_tenant_id() and is_admin());
create policy payments_delete on payments for delete to authenticated using (tenant_id = current_tenant_id() and is_admin());
