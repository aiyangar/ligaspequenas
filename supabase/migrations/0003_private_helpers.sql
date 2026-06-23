-- Move RLS helper functions out of the PostgREST-exposed public schema into a
-- private schema so they are not callable as RPC (advisor lints 0028/0029).
-- RLS policies are repointed to private.*; the public copies are dropped.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid();
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

grant execute on function private.current_tenant_id() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- repoint all 25 policies to the private helpers
alter policy tenants_select on tenants using (id = private.current_tenant_id());

alter policy profiles_select on profiles using (id = auth.uid() or (tenant_id = private.current_tenant_id() and private.is_admin()));
alter policy profiles_insert on profiles with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy profiles_update on profiles using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy profiles_delete on profiles using (tenant_id = private.current_tenant_id() and private.is_admin());

alter policy seasons_select on seasons using (tenant_id = private.current_tenant_id());
alter policy seasons_insert on seasons with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy seasons_update on seasons using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy seasons_delete on seasons using (tenant_id = private.current_tenant_id() and private.is_admin());

alter policy categories_select on categories using (tenant_id = private.current_tenant_id());
alter policy categories_insert on categories with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy categories_update on categories using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy categories_delete on categories using (tenant_id = private.current_tenant_id() and private.is_admin());

alter policy players_select on players using (tenant_id = private.current_tenant_id());
alter policy players_insert on players with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy players_update on players using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy players_delete on players using (tenant_id = private.current_tenant_id() and private.is_admin());

alter policy documents_select on documents using (tenant_id = private.current_tenant_id());
alter policy documents_insert on documents with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy documents_update on documents using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy documents_delete on documents using (tenant_id = private.current_tenant_id() and private.is_admin());

alter policy payments_select on payments using (tenant_id = private.current_tenant_id());
alter policy payments_insert on payments with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy payments_update on payments using (tenant_id = private.current_tenant_id() and private.is_admin()) with check (tenant_id = private.current_tenant_id() and private.is_admin());
alter policy payments_delete on payments using (tenant_id = private.current_tenant_id() and private.is_admin());

drop function public.current_tenant_id();
drop function public.is_admin();
