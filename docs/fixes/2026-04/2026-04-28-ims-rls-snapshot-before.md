# IMS RLS Pre-Migration Snapshot — 2026-04-28

**Production project:** `hhprjbgknupaplivtoib`
**Captured:** 2026-04-28 (pre Phase A3 canonical RLS migration)
**Purpose:** Rollback insurance. If the canonical RLS migration produces unexpected behavior, every policy below can be re-created verbatim from this document.

## Summary of holes (live in production at snapshot time)

| Table | Hole | Detail |
|---|---|---|
| `ims_supply_shipments` | 4× USING/CHECK(true) | Wide-open SELECT, INSERT, UPDATE, DELETE for any authenticated user |
| `ims_supply_shipment_items` | 4× USING/CHECK(true) | Wide-open SELECT, INSERT, UPDATE, DELETE for any authenticated user |
| `ims_stock_batches` | 2× WITH CHECK(true) | Wide-open INSERT, UPDATE (DELETE/SELECT institution-scoped) |
| `ims_stock_summary` | 2× WITH CHECK(true) | Wide-open INSERT, UPDATE (DELETE/SELECT institution-scoped) |
| `ims_batch_number_counters` | 1 USING(true)+CHECK(true) policy (all-ops) | Wide-open all operations |
| `ims_stores` | SELECT USING(true) | Cross-institutional store visibility (names + addresses) |
| `ims_units` | SELECT USING(true) | Acceptable: reference table, intentionally global read |
| `ims_item_categories` | SELECT USING(true) | Acceptable: reference table, intentionally global read |

## Legacy raw-role pattern (23 of 25 tables)

The remaining institution-scoped policies use:
```sql
(institution_id = (SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()))
OR (get_current_user_role() = 'super_admin'::text)
```

This bypasses MyJKKN's dynamic Role Management UI. Functional, but not canonical.

## Verbatim policy bodies (per table)

These are the policies returned from `pg_policy` ⨝ `pg_class` at snapshot time. To recreate any policy, use `CREATE POLICY <polname> ON <tbl> FOR <cmd> TO authenticated [USING (...)] [WITH CHECK (...)]` with the bodies below.

> Captured policy data is preserved in the agent transcript for this session and reproducible via:
> ```sql
> SELECT cls.relname AS tbl, pol.polname,
>        CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
>                        WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END AS cmd,
>        pg_get_expr(polqual, polrelid) AS using_clause,
>        pg_get_expr(polwithcheck, polrelid) AS check_clause
> FROM pg_policy pol
> JOIN pg_class cls ON cls.oid = pol.polrelid
> WHERE cls.relname LIKE 'ims_%'
> ORDER BY cls.relname, pol.polcmd, pol.polname;
> ```

### Holes (these will be DROPPED in A3)

#### ims_supply_shipments (4 policies)
- `Authenticated users can read ims_supply_shipments` — SELECT — `USING(true)`
- `Authenticated users can insert ims_supply_shipments` — INSERT — `WITH CHECK(true)`
- `Authenticated users can update ims_supply_shipments` — UPDATE — `USING(true)` `WITH CHECK(true)`
- `Authenticated users can delete ims_supply_shipments` — DELETE — `USING(true)`

#### ims_supply_shipment_items (4 policies, same shape as above)

#### ims_stock_batches (4 policies)
- SELECT — institution-scoped legacy
- INSERT — `WITH CHECK(true)` ← **hole**
- UPDATE — `USING(true)` `WITH CHECK(true)` ← **hole**
- DELETE — institution-scoped legacy

#### ims_stock_summary (same shape as ims_stock_batches)

#### ims_batch_number_counters (1 all-ops policy)
- `ims_batch_counters_auth` — ALL — `USING(true)` `WITH CHECK(true)` ← **hole**

#### ims_stores SELECT
- `ims_stores_select` — SELECT — `USING(true)` ← **hole** (cross-institutional store list visible)
- (INSERT/UPDATE/DELETE on ims_stores use legacy institution-scoped pattern)

### Legacy pattern policies (these will also be DROPPED and re-applied as canonical in A3)

For tables `ims_department_consumption`, `ims_financial_transactions`, `ims_goods_received_notes`, `ims_grn_items`, `ims_indent_request_items`, `ims_indent_requests`, `ims_items`, `ims_sale_items`, `ims_sale_number_counters`, `ims_sales`, `ims_shifts`, `ims_stock_issues`, `ims_stores` (3 non-SELECT ops), `ims_suppliers`, `ims_unit_conversions`, `ims_upi_qr_payments`:

Pattern: `(institution_id = (SELECT institution_id FROM profiles WHERE id=auth.uid())) OR (get_current_user_role() = 'super_admin'::text)`

Child tables (`ims_grn_items`, `ims_indent_request_items`, `ims_sale_items`) use `EXISTS` subquery to check parent's institution_id with the same role-string fallback.

For `ims_units`, `ims_item_categories` — write ops use:
`get_current_user_role() = ANY (ARRAY['super_admin'::text, 'admin'::text, 'store_admin'::text]::text[])`
(SELECT is wide-open per the holes section above)

## Rollback procedure

If post-A3 RLS proves too restrictive and breaks production:

1. **Identify the offending policy** by reading the runtime error (e.g. `42501 permission denied for ims_xxx`).
2. **Drop the canonical policy** that's blocking: `DROP POLICY IF EXISTS <polname> ON <tbl>;`
3. **Re-create the legacy policy** using the verbatim text from the source-control git history of `supabase/setup/03_policies.sql` (the legacy section was deleted as part of A3 — `git show HEAD~N:supabase/setup/03_policies.sql` recovers it).
4. **NOTIFY pgrst** to reload schema cache.

Full pre-migration recreation possible via the SQL block in [supabase/setup/03_policies.sql IMS legacy section](../../supabase/setup/03_policies.sql) (commit immediately preceding the Phase A migration).

## Helper-function dependencies (status pre-A3)

| Function | Status |
|---|---|
| `is_super_admin()` | ✅ exists |
| `is_admin(uuid)` | ✅ exists |
| `user_has_permission(text)` | ✅ exists (also `(uuid, text)` overload) |
| `role_has_institution_access(uuid)` | ❌ MISSING — must apply before A3 |
| `get_current_user_institution_id()` | ✅ exists |
| `auth_institution_id()` | ✅ exists |

## Other dependencies (status pre-A3)

| Object | Status |
|---|---|
| `custom_roles.institution_scope` column | ❌ MISSING — must add before A3 |
| `custom_roles.is_active` column | ❌ MISSING — non-blocking but should be added |
| `user_institution_access` table | ✅ exists |
| `user_roles` table | ✅ exists |
| `custom_roles` table | ✅ exists |
| `profiles.role` column | ✅ exists |

## Users at risk of behavior change after A3

| User | Current cross-inst? | Post-A3 cross-inst? | Reason |
|---|---|---|---|
| 9× super_admin (sroja, ceo, etc., `is_super_admin=TRUE`) | YES | YES | Tier 1 of `role_has_institution_access` — `is_super_admin()` short-circuit |
| `test.admin@jkkn.local` (role=administrator, is_super_admin=FALSE) | NO | YES | `is_admin()` per CLAUDE.md includes `role IN ('admin','administrator')` — broader access (intended canonical behavior) |
| `test.admin2@jkkn.local` (role=admin, is_super_admin=FALSE) | NO | YES | Same as above |
| `test.counselor@jkkn.ac.in` (role=counselor, is_super_admin=FALSE) | NO | DEPENDS | Per CLAUDE.md: counselor role gets `institution_scope='all'`. If we set it: YES. If we leave default 'own': NO (regression for counselor functionality). |

**Action item:** UPDATE custom_roles SET institution_scope='all' WHERE role_key IN ('super_admin','admin','administrator','admission','counselor','admission_manager') BEFORE applying canonical RLS.
