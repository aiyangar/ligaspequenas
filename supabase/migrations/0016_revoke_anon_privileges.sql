revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- anon's EXECUTE on these comes from PUBLIC, not from a direct grant
revoke execute on all functions in schema private from public, anon;
revoke execute on function public.set_updated_at() from public, anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
