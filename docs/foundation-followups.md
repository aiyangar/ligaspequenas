# Foundation — follow-up notes & deferred decisions

These notes capture decisions and known gaps surfaced by the final whole-branch
review of the Foundation plan
(`docs/superpowers/plans/2026-06-22-foundation-scaffolding-and-database.md`).
The review's `Important` findings (composite tenant FK on `documents`/`payments`,
idempotent `categories` natural key, dead-asset cleanup) were fixed before merge.
The items below were judged `Minor` and deliberately deferred.

## Intentional decisions

- **RLS is enabled, not `FORCE`d.** The client only ever connects as `anon` /
  `authenticated` via the anon key, and neither owns the tables, so the real
  data path always enforces RLS. `FORCE ROW LEVEL SECURITY` only affects code
  running as the table owner (e.g. migrations or `SECURITY DEFINER` functions).
  This matches the default Supabase posture; revisit only if owner-context code
  paths are added.
- **React 19 is the baseline.** The plan text says "React 18"; the project
  actually ships React 19 (`createRoot` + `StrictMode`, which work on both).
  19 is the intended baseline — the plan's stack note is the stale value.

## Deferred to later plans

- **First admin / profile bootstrap.** `profiles_insert` requires
  `private.is_admin()`, which requires an existing admin — so the very first
  admin profile cannot be created through the RLS-governed API and must be
  provisioned out-of-band (service role / direct SQL). This is fail-closed and
  correct for the Foundation; the bootstrap step is owned by Plan 2
  (Auth + users management).
- **Seasonless-tenant safety (resolved).** `players_with_category` now
  `LEFT JOIN`s the active season, so players in a tenant with no active season
  still surface (with `NULL` `edad_liga`/category) instead of vanishing. The
  invariant "each tenant should have exactly one active season" is still the
  intended operational rule.

## Migration numbering

The plan's `Execution Update` (its line ~41) is the authoritative numbering;
the plan's earlier `File Structure` list and Task 5/6 bodies still carry the
pre-revision `0003_seed` / `0004_view` numbers and were never back-edited. The
delivered, applied migrations are:

| # | File | Purpose |
|---|------|---------|
| 0001 | `0001_schema.sql` | enums + tables + `updated_at` triggers |
| 0002 | `0002_rls.sql` | RLS enable + per-table policies + `set_updated_at` hardening |
| 0003 | `0003_private_helpers.sql` | helpers moved to non-exposed `private` schema |
| 0004 | `0004_seed_ligamtyac.sql` | Liga MTY AC tenant + active season + 9 categories |
| 0005 | `0005_players_with_category_view.sql` | derived-category view (`security_invoker`) |
| 0006 | `0006_harden_tenant_integrity.sql` | composite tenant FK + unique `categories(tenant_id,name)` |
| 0007 | `0007_view_left_join_season.sql` | `LEFT JOIN` active season so seasonless players still surface |
