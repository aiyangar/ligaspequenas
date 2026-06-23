begin;
select plan(9);

select has_table('public', 'tenants', 'tenants table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'seasons', 'seasons table exists');
select has_table('public', 'categories', 'categories table exists');
select has_table('public', 'players', 'players table exists');
select has_table('public', 'documents', 'documents table exists');
select has_table('public', 'payments', 'payments table exists');
select has_column('public', 'players', 'birth_date', 'players.birth_date exists');
select has_column('public', 'documents', 'doc_type', 'documents.doc_type exists');

select * from finish();
rollback;
