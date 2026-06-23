begin;
select plan(4);

select has_function('private', 'current_tenant_id', 'private.current_tenant_id() exists');
select has_function('private', 'is_admin', 'private.is_admin() exists');
select hasnt_function('public', 'current_tenant_id', 'public.current_tenant_id() removed (not API-exposed)');
select hasnt_function('public', 'is_admin', 'public.is_admin() removed (not API-exposed)');

select * from finish();
rollback;
