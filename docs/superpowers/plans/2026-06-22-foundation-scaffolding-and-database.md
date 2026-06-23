# Foundation (Scaffolding + Database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vite/React/TypeScript frontend shell and a fully migrated, RLS-secured, seeded Supabase database with the automatic age-category view, all verified by tests.

**Architecture:** A pnpm-managed Vite + React + TS (strict) + Tailwind app talks to Supabase (Postgres + Auth + Storage). The database is multi-tenant from day one (`tenant_id` on every league table) and authorization is enforced entirely by RLS. Category is a derived field computed by the `players_with_category` view against the active season — never stored.

**Tech Stack:** Vite, React 18, TypeScript (strict), Tailwind CSS, pnpm, Supabase (Postgres 15+, supabase CLI), Vitest + React Testing Library (frontend tests), pgTAP run against the main Supabase project via MCP `execute_sql` (database tests; no local Docker stack — see Execution Update).

## Global Constraints

- Conversation/docs in Spanish; **all identifiers, table/column names, enums, and code in English**.
- No comments in code unless explaining a non-obvious *why* (one line max).
- TypeScript strict mode on.
- Never commit to `main` or `develop`. One task = one branch (`feature/*`). Checkpoint commits allowed on the task branch.
- No secret/service keys in the client bundle or repo. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public.
- Every league table has `tenant_id` and RLS enabled with explicit policies before it accepts traffic.
- Category is derived in SQL (single source of truth); the frontend never recomputes it.
- Age cutoff rule: `edad_liga = extract(year from age(active_season.cutoff_date, birth_date))`. Active season for Liga MTY AC: `2026-2027`, `cutoff_date = 2027-04-30`.
- Supabase project already exists: `project_ref = eksbaugyypadtanyjcje`. GitHub remote: `aiyangar/ligaspequenas`.

## Execution Update (2026-06-23): No Docker — apply directly to `main`

This plan was originally authored for a local Docker-based Supabase stack. Per the 2026-06-23 decision, **this project does not use Docker**. Database work is applied and tested **directly against Supabase** via the MCP tools. The migration/RLS/seed/view SQL below is unchanged — only *where and how it is applied and tested* changes.

A remote **preview branch** was considered for isolation but is **not achievable with this MCP config** (see [[supabase-mcp-no-branching]]): `confirm_cost` is not exposed (so `create_branch` is uncallable) and `execute_sql`/`apply_migration` take no project param (they always hit `main`). Since `main` is a clean slate (0 tables, 0 production data), it serves as the dev environment and we apply directly to it.

Authoritative DB workflow for Tasks 2–6:

1. **Migrations stay as files** in `supabase/migrations/` (source of truth). No local stack, no `supabase start`.
2. **Apply to `main` via MCP.** Each migration is applied with `mcp__supabase__apply_migration` (records project migration history). No branch, no merge step.
3. **pgTAP enabled once** on `main` (in schema `extensions`, v1.3.3): `create extension if not exists pgtap with schema extensions;`. Call its functions schema-qualified, e.g. `extensions.has_table(...)`.
4. **Per migration (TDD):** (a) write the canonical pgTAP test in `supabase/tests/000X_*.sql` (artifact for a future `supabase test db`); (b) **RED** — run an equivalent adapted query via `mcp__supabase__execute_sql` and confirm it fails (table/view/policy absent); (c) write the migration in `supabase/migrations/000X_*.sql`; (d) apply it with `apply_migration`; (e) **GREEN** — re-run the adapted query and confirm all assertions pass.
5. **Execute_sql returns only the LAST statement's result set, and there is no `pg_prove`.** So run pgTAP as exactly two statements in one call: `select extensions.plan(N);` then a single `select extensions.<assertion>(...) union all select extensions.<assertion>(...) ...;` — all assertion rows come back in that one result set. A suite passes iff no returned row starts with `not ok`. (The canonical `.sql` test files keep the standard `begin; plan; …; finish; rollback;` form and are NOT run directly through `execute_sql`.)
6. **Fixture-based suites (Tasks 4, 6)** persist their rows when run this way (no transactional rollback through `execute_sql`); insert fixtures, assert, then delete them by their identifiable values. RLS role simulation (`set local role` + jwt claims) must be confirmed to work over `execute_sql` when Task 4 is reached.
7. **Run `get_advisors(security)` after each DDL** and resolve findings (RLS-disabled errors clear in Task 4; harden `set_updated_at` search_path in Task 4's migration).

**Blanket substitution:** throughout Tasks 2–6, wherever a step says `supabase start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:diff`, "the branch", or `merge_branch`, substitute "apply to `main` via MCP + verify via the two-statement pgTAP query above." The `package.json` DB scripts and `supabase test db` harness are **not used** (kept only as optional future tooling if the project is ever linked for `supabase db push`).

**Migration numbering (revised):** a Task-4 security hardening was inserted as `0003_private_helpers.sql` (moves the RLS helpers to a non-exposed `private` schema, clearing advisor lints 0028/0029). It shifts the later files: **Task 5 seed → `0004_seed_ligamtyac.sql`** (test `0004_seed.test.sql`) and **Task 6 view → `0005_players_with_category_view.sql`** (test `0005_category.test.sql`). RLS policies now call `private.current_tenant_id()` / `private.is_admin()`.

## Roadmap (this plan is #1 of a sequence)

1. **Foundation — scaffolding + database** *(this plan)*
2. Auth + `TenantContext` + app shell + users management (admin)
3. Players CRUD + registration form + category display
4. Documents + Storage (private buckets, signed URLs) + consent gate
5. Payments + "quién debe"
6. Filters + Excel export

Each subsequent plan is written just before it is executed.

---

## File Structure (created/modified by this plan)

- `package.json`, `pnpm-lock.yaml` — deps & scripts.
- `vite.config.ts` — Vite + Vitest config.
- `tsconfig.json`, `tsconfig.node.json` — strict TS.
- `tailwind.config.js`, `postcss.config.js`, `src/index.css` — Tailwind.
- `index.html`, `src/main.tsx`, `src/App.tsx` — app entry.
- `src/App.test.tsx` — frontend smoke test.
- `src/lib/supabase.ts` — Supabase browser client (env-driven).
- `src/lib/category.ts` — ordinal label helper (`1ro/2do/...`) for display only.
- `src/lib/category.test.ts` — ordinal helper tests.
- `.env.example` — documents required env vars (committed; real `.env*` ignored).
- `supabase/config.toml` — supabase CLI config (generated).
- `supabase/migrations/0001_schema.sql` — enums + tables + triggers.
- `supabase/migrations/0002_rls.sql` — helper functions + RLS policies.
- `supabase/migrations/0003_seed_ligamtyac.sql` — tenant + season + categories.
- `supabase/migrations/0004_players_with_category_view.sql` — derived category view.
- `supabase/tests/0001_schema.test.sql` — pgTAP: tables/columns exist.
- `supabase/tests/0002_rls.test.sql` — pgTAP: RLS isolation (tenant + role).
- `supabase/tests/0003_category.test.sql` — pgTAP: category computation fixtures.

---

### Task 1: Scaffold frontend (Vite + React + TS strict + Tailwind + Vitest)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working `pnpm dev` / `pnpm build` / `pnpm test`; default-export React component `App` in `src/App.tsx`.

- [ ] **Step 1: Scaffold Vite into the existing repo (non-interactive, without clobbering existing files)**

```bash
pnpm create vite@latest .vite-tmp --template react-ts
# copy generated files in, but keep our existing .gitignore/README/docs/.git
rsync -a --exclude='.gitignore' --exclude='README.md' --exclude='.git' .vite-tmp/ .
rm -rf .vite-tmp
pnpm install
```

- [ ] **Step 2: Add Tailwind, PostCSS, and test tooling**

```bash
pnpm add -D tailwindcss@^3 postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
pnpm exec tailwindcss init -p
```

- [ ] **Step 3: Configure Tailwind content paths** in `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 4: Replace `src/index.css` with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Enforce strict TypeScript** in `tsconfig.json` (compilerOptions)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: Configure Vite + Vitest** in `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

- [ ] **Step 7: Create `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 8: Replace `src/App.tsx` with a minimal shell**

```tsx
export default function App() {
  return <h1>Liga MTY AC</h1>
}
```

- [ ] **Step 9: Write the failing smoke test** in `src/App.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the league name', () => {
  render(<App />)
  expect(screen.getByText('Liga MTY AC')).toBeInTheDocument()
})
```

- [ ] **Step 10: Run the test (expect PASS) and a typecheck/build**

Run: `pnpm test run && pnpm exec tsc --noEmit && pnpm build`
Expected: test passes, no type errors, build succeeds.

- [ ] **Step 11: Add a `.env.example`**

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + React + TS strict + Tailwind with Vitest smoke test"
```

---

### Task 2: Initialize Supabase CLI (no local Docker stack — see Execution Update)

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/` (dir), `supabase/tests/` (dir)
- Modify: `package.json` (add `supabase` dev dependency + db scripts)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: the Supabase CLI as a dev dependency, generated `supabase/config.toml`, and the `supabase/migrations/` + `supabase/tests/` directories. Migrations/tests run directly against the main Supabase project via MCP (no branch — see Execution Update).

> Note (revised 2026-06-23): No Docker, no local stack. We do NOT link or push to the remote project here. The Supabase CLI is installed as a project dev dependency (no brew, no global install) only to manage migration files and config. Applying and testing migrations happens on a remote preview branch via MCP — see the Execution Update at the top of this plan.

- [ ] **Step 1: Install the Supabase CLI as a dev dependency**

```bash
pnpm add -D supabase
pnpm exec supabase --version
```
Expected: a version string prints.

- [ ] **Step 2: Initialize Supabase in the repo**

Run: `pnpm exec supabase init`
Expected: creates `supabase/config.toml` and `supabase/` folders. Answer "N" if asked to generate VS Code settings.

- [ ] **Step 3: Create the tests directory**

```bash
mkdir -p supabase/tests
```

- [ ] **Step 4: ~~Start the local stack~~ — SKIPPED (no Docker)**

No local stack and no preview branch (not achievable via this MCP config — see [[supabase-mcp-no-branching]]). Migrations are applied directly to `main` via MCP starting in Task 3. See Execution Update.

- [ ] **Step 5: Create the migrations directory (tracked)**

```bash
mkdir -p supabase/migrations
touch supabase/migrations/.gitkeep supabase/tests/.gitkeep
```
No local `db:*` npm scripts are added — migrations are applied/tested on the remote preview branch via MCP (see Execution Update). The `.gitkeep` files keep the empty dirs in version control; they are removed when the first migration/test file lands in Task 3.

- [ ] **Step 6: Confirm remote readiness (read-only, via MCP)**

Already verified on 2026-06-23: `pgtap` extension available (v1.3.3), `public` schema empty (0 tables), 0 migrations on `main`. This replaces the local "run empty pgTAP suite" check.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Initialize Supabase CLI config (remote workflow, no local stack)"
```

---

### Task 3: Schema migration (enums + tables + triggers)

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Test: `supabase/tests/0001_schema.test.sql`

**Interfaces:**
- Consumes: nothing from prior tasks (runs in DB).
- Produces: tables `tenants`, `profiles`, `seasons`, `categories`, `players`, `documents`, `payments` and enums `user_role`, `player_status`, `affiliation_status`, `document_type`, `document_status`, `payment_concept`, `payment_method`, `payment_status`. Later tasks reference these exact names.

- [ ] **Step 1: Write the failing pgTAP test** in `supabase/tests/0001_schema.test.sql`

```sql
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm db:test`
Expected: FAIL — tables do not exist.

- [ ] **Step 3: Write the schema migration** in `supabase/migrations/0001_schema.sql`

```sql
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
```

- [ ] **Step 4: Apply migrations and run the test (expect PASS)**

Run: `pnpm db:reset && pnpm db:test`
Expected: `0001_schema.test.sql` passes 9/9.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_schema.sql supabase/tests/0001_schema.test.sql
git commit -m "Add schema migration: enums, multi-tenant tables, updated_at triggers"
```

---

### Task 4: RLS helper functions and policies

**Files:**
- Create: `supabase/migrations/0002_rls.sql`
- Test: `supabase/tests/0002_rls.test.sql`

**Interfaces:**
- Consumes: tables/enums from Task 3.
- Produces: functions `current_tenant_id() returns uuid`, `is_admin() returns boolean`; RLS enabled with per-table policies. Later code relies on RLS for all authorization.

- [ ] **Step 1: Write the failing pgTAP test** in `supabase/tests/0002_rls.test.sql`

```sql
begin;
select plan(6);

-- two tenants, three users: admin+readonly in tenant A, admin in tenant B
insert into tenants (id, name, slug) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'readonly-a@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin-b@test.com');

insert into profiles (id, tenant_id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin A', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Readonly A', 'readonly'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin B', 'admin');

-- a player in tenant A
insert into players (id, tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Player A', '2015-06-10', 'Tutor', '111');

-- helper to act as a given user
create or replace function tests.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1: admin A can read their player
select tests.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*) from players)::int, 1, 'admin A sees tenant A player');

-- 2: readonly A can read
select tests.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*) from players)::int, 1, 'readonly A sees tenant A player');

-- 3: admin B (other tenant) sees nothing
select tests.act_as('33333333-3333-3333-3333-333333333333');
select is((select count(*) from players)::int, 0, 'admin B does not see tenant A player');

-- 4: readonly A cannot insert
select tests.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok(
  $$insert into players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nope', '2016-01-01', 'T', '1')$$,
  '42501', null, 'readonly cannot insert players'
);

-- 5: admin A can insert
select tests.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into players (tenant_id, full_name, birth_date, tutor_name, tutor_whatsapp)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Yes', '2016-01-01', 'T', '1')$$,
  'admin can insert players'
);

-- 6: RLS is enabled on players
select reset();
select is(
  (select relrowsecurity from pg_class where relname = 'players'),
  true,
  'RLS enabled on players'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm db:test`
Expected: FAIL — functions/policies/RLS not present (and `tests.act_as` reads/writes blocked or returns wrong counts).

- [ ] **Step 3: Write the RLS migration** in `supabase/migrations/0002_rls.sql`

```sql
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
```

- [ ] **Step 4: Apply and run the test (expect PASS)**

Run: `pnpm db:reset && pnpm db:test`
Expected: `0002_rls.test.sql` passes 6/6.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rls.sql supabase/tests/0002_rls.test.sql
git commit -m "Add RLS helpers and per-table tenant+role policies"
```

---

### Task 5: Seed Liga MTY AC (tenant + season + categories)

**Files:**
- Create: `supabase/migrations/0003_seed_ligamtyac.sql`
- Test: `supabase/tests/0003_seed.test.sql` (new file; the category-computation tests live separately in `supabase/tests/0004_category.test.sql`, created in Task 6).

**Interfaces:**
- Consumes: tables from Task 3.
- Produces: tenant id `00000000-0000-0000-0000-000000000001` (Liga MTY AC), active season `2026-2027` (`cutoff_date 2027-04-30`), and the 9 official categories. Task 6 fixtures rely on this tenant id and season.

- [ ] **Step 1: Write the failing pgTAP test** in `supabase/tests/0003_seed.test.sql`

```sql
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm db:test`
Expected: FAIL — no seed data.

- [ ] **Step 3: Write the seed migration** in `supabase/migrations/0003_seed_ligamtyac.sql`

```sql
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
```

- [ ] **Step 4: Apply and run the test (expect PASS)**

Run: `pnpm db:reset && pnpm db:test`
Expected: `0003_seed.test.sql` passes 3/3.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_seed_ligamtyac.sql supabase/tests/0003_seed.test.sql
git commit -m "Seed Liga MTY AC tenant, active season, and official categories"
```

---

### Task 6: `players_with_category` view + category computation tests

**Files:**
- Create: `supabase/migrations/0004_players_with_category_view.sql`
- Test: `supabase/tests/0004_category.test.sql`

**Interfaces:**
- Consumes: `players`, `seasons`, `categories`, seed from Tasks 3 & 5.
- Produces: view `players_with_category` exposing all `players` columns plus `edad_liga int`, `division text`, `category_name text`, `category_year int` (null when out of range). RLS applies through the view (`security_invoker = true`). The frontend reads category from here.

- [ ] **Step 1: Write the failing pgTAP test** in `supabase/tests/0004_category.test.sql`

```sql
begin;
select plan(8);

-- insert fixtures into Liga MTY AC (tenant seeded in 0003)
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm db:test`
Expected: FAIL — view `players_with_category` does not exist.

- [ ] **Step 3: Write the view migration** in `supabase/migrations/0004_players_with_category_view.sql`

```sql
create view players_with_category with (security_invoker = true) as
select
  p.*,
  extract(year from age(s.cutoff_date, p.birth_date))::int as edad_liga,
  c.division,
  c.name as category_name,
  case
    when c.id is not null
    then extract(year from age(s.cutoff_date, p.birth_date))::int - c.min_edad_liga + 1
  end as category_year
from players p
join seasons s on s.tenant_id = p.tenant_id and s.is_active
left join categories c
  on c.tenant_id = p.tenant_id
 and extract(year from age(s.cutoff_date, p.birth_date))::int between c.min_edad_liga and c.max_edad_liga;
```

- [ ] **Step 4: Apply and run the test (expect PASS)**

Run: `pnpm db:reset && pnpm db:test`
Expected: `0004_category.test.sql` passes 8/8 (plus all prior suites still green).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_players_with_category_view.sql supabase/tests/0004_category.test.sql
git commit -m "Add players_with_category view with security_invoker and fixture tests"
```

---

### Task 7: Frontend Supabase client + category label helper

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/category.ts`
- Test: `src/lib/category.test.ts`

**Interfaces:**
- Consumes: env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; the `category_name`/`category_year` shape from the view.
- Produces: exported `supabase` browser client; `categoryLabel(name: string | null, year: number | null): string` returning e.g. `"Infantil Menor (1ro)"` or `"Fuera de categoría"`. Later UI uses both.

- [ ] **Step 1: Install the Supabase JS client**

```bash
pnpm add @supabase/supabase-js
```

- [ ] **Step 2: Create the browser client** in `src/lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 3: Write the failing test** in `src/lib/category.test.ts`

```ts
import { categoryLabel } from './category'

test('formats category with ordinal year', () => {
  expect(categoryLabel('Infantil Menor', 1)).toBe('Infantil Menor (1ro)')
  expect(categoryLabel('Juvenil Superior Mayor', 5)).toBe('Juvenil Superior Mayor (5to)')
})

test('shows out-of-category when name is null', () => {
  expect(categoryLabel(null, null)).toBe('Fuera de categoría')
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test run src/lib/category.test.ts`
Expected: FAIL — `categoryLabel` not defined.

- [ ] **Step 5: Implement the helper** in `src/lib/category.ts`

```ts
const ORDINALS: Record<number, string> = { 1: '1ro', 2: '2do', 3: '3ro', 4: '4to', 5: '5to' }

export function categoryLabel(name: string | null, year: number | null): string {
  if (!name) return 'Fuera de categoría'
  const ordinal = year != null ? ORDINALS[year] ?? `${year}` : ''
  return ordinal ? `${name} (${ordinal})` : name
}
```

- [ ] **Step 6: Run the test (expect PASS) and typecheck**

Run: `pnpm test run src/lib/category.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Add an `env.d.ts` for typed env vars** in `src/vite-env.d.ts` (append)

```ts
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Supabase browser client and category label helper"
```

---

## Self-Review

**Spec coverage (Plan 1 scope = spec sections 2, 4, 5, 7, 10):**
- Stack & env vars (spec §2) → Task 1, Task 7. ✅
- Data model, all tables/enums (spec §4) → Task 3. ✅
- Category cutoff + view + fixtures (spec §5) → Task 6 (+ ordinal label in Task 7). ✅
- RLS helpers + tenant/role policies (spec §7) → Task 4. ✅
- Multi-tenant foundations: `tenant_id` everywhere, per-tenant seasons/categories, single seeded tenant (spec §10) → Tasks 3, 4, 5. ✅
- Storage buckets, consent gate, auth UI, screens, Excel export (spec §6, §8, §9) → **out of scope for Plan 1**, covered by Plans 2–6 (roadmap above).

**Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. ✅

**Type/name consistency:** `current_tenant_id()`, `is_admin()`, table/enum names, seed tenant id `00000000-…-001`, and view columns (`edad_liga`, `division`, `category_name`, `category_year`) are used identically across Tasks 3–7. `categoryLabel(name, year)` signature matches its test. ✅

**Note on test isolation:** pgTAP tests wrap in `begin; … rollback;`; the seed migration (0003) is applied by `db:reset`, so Task 6 fixtures can rely on the seeded tenant/season/categories existing outside the test transaction.
