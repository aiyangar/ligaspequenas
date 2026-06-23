-- enums
create type user_role as enum ('admin', 'readonly');
create type player_status as enum ('activo', 'baja');
create type affiliation_status as enum ('autoriza', 'no_autoriza', 'pendiente');
create type document_type as enum ('curp', 'birth_certificate', 'proof_of_address', 'image_consent', 'privacy_notice', 'medical_clearance');
create type document_status as enum ('pendiente', 'fisico', 'digital');
create type payment_concept as enum ('inscripcion', 'mensualidad', 'uniforme', 'otro');
create type payment_method as enum ('efectivo', 'transferencia');
create type payment_status as enum ('pagado', 'pendiente', 'parcial');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  full_name text not null,
  role user_role not null default 'readonly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  cutoff_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_season_per_tenant on seasons (tenant_id) where is_active;

create table categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  division text not null,
  name text not null,
  min_edad_liga int not null,
  max_edad_liga int not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_edad_liga <= max_edad_liga)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  full_name text not null,
  birth_date date not null,
  curp text,
  photo_path text,
  status player_status not null default 'activo',
  enrollment_date date not null default current_date,
  tutor_name text not null,
  tutor_whatsapp text not null,
  tutor_email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  affiliation_status affiliation_status not null default 'pendiente',
  affiliation_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_tenant_idx on players (tenant_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  player_id uuid not null references players(id) on delete cascade,
  doc_type document_type not null,
  status document_status not null default 'pendiente',
  file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, doc_type)
);
create index documents_tenant_idx on documents (tenant_id);
create index documents_player_idx on documents (player_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  player_id uuid not null references players(id) on delete cascade,
  concept payment_concept not null,
  concept_note text,
  amount numeric(10,2) not null,
  payment_date date not null default current_date,
  method payment_method not null,
  status payment_status not null default 'pagado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_tenant_idx on payments (tenant_id);
create index payments_player_idx on payments (player_id);

create trigger trg_tenants_updated before update on tenants for each row execute function set_updated_at();
create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger trg_seasons_updated before update on seasons for each row execute function set_updated_at();
create trigger trg_categories_updated before update on categories for each row execute function set_updated_at();
create trigger trg_players_updated before update on players for each row execute function set_updated_at();
create trigger trg_documents_updated before update on documents for each row execute function set_updated_at();
create trigger trg_payments_updated before update on payments for each row execute function set_updated_at();
