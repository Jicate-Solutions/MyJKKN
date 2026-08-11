# HR Derived Leave Entitlement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the manual "Generate balances" ritual so a newly created staff member can apply for leave immediately, and so editing a leave type's days takes effect for everyone at once.

**Architecture:** Entitlement stops being copied onto each person and becomes derived from the leave type at read time, through one view (`v_hr_leave_balance`). Only *usage* stays stored. Explicit per-person exceptions live in a new `hr_leave_entitlement_overrides` table. When a year ends, a cron freezes that year's derived numbers into the ledger so history stops moving.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres 15.6 + RLS), TanStack Query v5, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-08-11-hr-leave-balance-derived-entitlement-design.md`

---

## Global Constraints

- **No test runner is wired into npm scripts.** `vitest ^4.1.7` and `@playwright/test` are installed but there is no `npm test`. **Never claim "tests pass."** The verification cycle in this repo is: SQL assertions (via Supabase MCP `execute_sql`) for database work, `mcp__ide__getDiagnostics` per file for TypeScript, and a browser check for behaviour. Every task below states its own verification explicitly — run it and paste the real output.
- **TypeScript strict mode is OFF** and `typescript.ignoreBuildErrors: true`. The build does not typecheck. Use `mcp__ide__getDiagnostics` (seconds) rather than `npm run typecheck` (3-4 min, OOMs under ~10 GB heap).
- **Supabase errors are plain objects, not `Error` instances.** `err instanceof Error` always falls through. Use `getErrorMessage()` from `@/lib/utils`.
- **Never fire-and-forget a Supabase mutation.** Always destructure `{ error }` and check it — try/catch does not catch RLS denials or constraint violations.
- **`institutionId || ''` is an antipattern.** `||` coerces `undefined` → `''`, which is sent as a real UUID and matches zero rows. Use `??`.
- **New tables and views must be registered in `types/supabase.ts`** or `.from('...')` fails typecheck with a TS2769 cascade.
- **When applying a migration via the Supabase MCP tool, also commit the real SQL body** to `supabase/migrations/` — never a `SELECT 1;` placeholder.
- **Migrations are `YYYYMMDD_name.sql`** in `supabase/migrations/`, then mirrored into `supabase/setup/` reference files (`01_tables.sql`, `02_functions.sql`, `03_policies.sql`, `05_views.sql`).
- **Never hardcode role names in SQL.** Gate on permission keys via `user_has_permission('<key>')`.
- **Branch:** `feat/hr-leave-derived-entitlement` (already created; the spec commit `27d715c33` is its first commit).
- **Verified production numbers (2026-08-11)** used as migration post-conditions: current HR year `2c5d0bb6-d279-4be0-ac2a-cca500e6a484` (2026-2027); **4,289** balance rows on open years; exactly **3** rows diverge from their type default (all *Vacation Leave*, 7.00 vs 14.00, employees `70e1c25e…`, `c143596f…`, `3f8058b6…`); **752** active staff; **71** active leave types.

---

## Deviation from the spec (read before Task 3)

The spec's D4 retires `hr_leave_type_entitlements` — the table that maps **cadre → entitled days**. It does **not** retire *eligibility* filtering, and this plan deliberately preserves all three eligibility rules the current generator applies:

| Rule | Column | Types using it today | Why preserved |
|---|---|---|---|
| Gender | `hr_leave_types.applicable_gender` | 0 | UI-exposed on the leave-type form. Dropping it would show a female-only maternity type to every man the moment HR sets one |
| Cadre eligibility | `hr_leave_types.applicable_cadre_ids` | 0 | "Who may hold this type at all" — distinct from how many days |
| Assignments | `hr_leave_type_assignments` | 1 (test data) | A type with any active assignment applies only to assigned staff |

All three are inert today (0, 0, and 1 test row), so preserving them changes nothing now and prevents a silent grant later. What is retired is only the **days** lookup: `hr_leave_type_entitlements.entitled_days` no longer participates in resolution — overrides replace it.

**Consequence to keep in mind:** if HR ever sets `applicable_cadre_ids` on a type, staff with no cadre become ineligible for it and will have no row for that type — the lockout returns *for that type only*. Note it in the leave-type UI when that field is used. Out of scope here.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260811180000_hr_leave_entitlement_overrides.sql` | Schema: nullable `entitled`, overrides table + RLS, `frozen_at` |
| `supabase/migrations/20260811180100_hr_leave_balance_view.sql` | `v_hr_leave_balance_src` (derivation) + `v_hr_leave_balance` (secured) |
| `supabase/migrations/20260811180200_hr_leave_balance_data_migration.sql` | Migrate 3 divergent rows → overrides; NULL out open years; backfill `frozen_at` |
| `supabase/migrations/20260811180300_hr_trig_update_leave_balance_null.sql` | Trigger: insert `entitled = NULL`, not `0` |
| `supabase/migrations/20260811180400_fn_hr_freeze_leave_year.sql` | Freeze RPC |
| `supabase/migrations/20260811180500_hr_leave_balance_analytics_view.sql` | Point the analytics RPC at the view |
| `types/hr-leave-overrides.ts` | Override row / insert / update types |
| `types/hr.ts` (modify) | `entitlement_source` on `HRLeaveBalanceWithType` |
| `types/supabase.ts` (modify) | Register the new table + both views |
| `lib/services/hr/leave-service.ts` (modify) | Read the view; unconditional over-draw guard |
| `lib/services/hr/leave-override-service.ts` | CRUD for overrides |
| `lib/services/hr/dashboard-service.ts` (modify) | Read the view |
| `lib/services/hr/analytics-service.ts` (modify) | Read the view; fix the `allocated` column bug |
| `hooks/hr/use-leave-overrides.ts` | React Query hooks for overrides + freeze |
| `app/api/cron/hr-leave-year-freeze/route.ts` | Daily freeze cron |
| `vercel.json` (modify) | Register the cron |
| `app/(routes)/hr/admin/leave-balances/_components/exceptions-tab.tsx` | Replaces the Generate tab |
| `app/(routes)/hr/admin/leave-balances/_components/year-archive-tab.tsx` | Freeze status + manual freeze |
| `app/(routes)/hr/admin/leave-balances/_components/leave-balance-analytics.tsx` (modify) | Drop coverage rendering; inline `fmt` |
| `app/(routes)/hr/admin/leave-balances/page.tsx` (modify) | Retab |
| `app/(routes)/hr/admin/leave-balances/_components/generate-balances-form.tsx` | **Delete** |
| `app/(routes)/hr/admin/leave-balances/_components/coverage-status.ts` | **Delete** |

---

# STAGE A — Schema

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260811180000_hr_leave_entitlement_overrides.sql`
- Modify: `supabase/setup/01_tables.sql`, `supabase/setup/03_policies.sql` (append)

**Interfaces:**
- Produces: table `public.hr_leave_entitlement_overrides` with columns `id, employee_id, leave_type_id, hr_academic_year_id, hr_organization_id, entitled_days, reason, created_by, created_at, updated_at`; column `public.hr_academic_years.frozen_at timestamptz`; `public.hr_leave_balances.entitled` becomes nullable. Consumed by Tasks 2-11.

- [ ] **Step 1: Capture the pre-migration baseline**

Run via Supabase MCP `execute_sql` and **save the output** — Task 3 asserts against it:

```sql
SELECT
  (SELECT count(*) FROM hr_leave_balances) AS total_rows,
  (SELECT sum(used) FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id
    WHERE y.end_date >= current_date) AS open_used,
  (SELECT sum(carried_forward) FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id
    WHERE y.end_date >= current_date) AS open_carried,
  (SELECT count(*) FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id
    WHERE y.end_date >= current_date) AS open_rows;
```

Expected: `open_rows = 4289`. If it differs, **stop** — the data moved since the spec was written; re-derive the post-conditions before continuing.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260811180000_hr_leave_entitlement_overrides.sql`:

```sql
-- =====================================================================
-- Derived leave entitlement — schema
-- Spec: docs/superpowers/specs/2026-08-11-hr-leave-balance-derived-entitlement-design.md
-- =====================================================================
-- WHY: entitlement was copied onto every staff x type x year row by a
-- manual "Generate" run. A copy can be missing (staff created after the
-- last run could not apply at all), stale (editing a leave type did not
-- reach the 4289 rows already written), or frozen from inputs that had
-- not arrived yet. This migration makes `entitled` nullable so NULL can
-- mean "derive from the leave type", and adds the two things the derived
-- model needs: explicit exceptions, and a freeze marker per year.

BEGIN;

-- 1. NULL now means "derive from policy". A non-NULL value still wins,
--    so every already-frozen historical row keeps its number untouched.
ALTER TABLE public.hr_leave_balances
  ALTER COLUMN entitled DROP NOT NULL;

COMMENT ON COLUMN public.hr_leave_balances.entitled IS
  'NULL = derive from hr_leave_types.default_entitled_days at read time. '
  'Non-NULL = frozen historical value, set by fn_hr_freeze_leave_year when the year ended.';

-- 2. Per-person exceptions. Rare and explicit; `reason` is mandatory
--    because an unexplained exception is how this table becomes
--    unmaintainable.
CREATE TABLE public.hr_leave_entitlement_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.staff(id)             ON DELETE CASCADE,
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id)    ON DELETE CASCADE,
  hr_academic_year_id uuid NOT NULL REFERENCES public.hr_academic_years(id) ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id),
  entitled_days       numeric NOT NULL CHECK (entitled_days >= 0),
  reason              text    NOT NULL CHECK (btrim(reason) <> ''),
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- hr_academic_year_id is NOT NULL on purpose. A nullable "every year"
  -- value would be invisible to this constraint (Postgres treats NULLs as
  -- distinct) and duplicates would accumulate silently.
  UNIQUE (employee_id, leave_type_id, hr_academic_year_id)
);

CREATE INDEX idx_hleo_lookup
  ON public.hr_leave_entitlement_overrides (employee_id, leave_type_id, hr_academic_year_id);
CREATE INDEX idx_hleo_org
  ON public.hr_leave_entitlement_overrides (hr_organization_id);

-- 3. Freeze marker. NOT end_date: a year that has ended but has not been
--    frozen must keep deriving, so a missed cron degrades to
--    current-policy numbers rather than to a gap.
ALTER TABLE public.hr_academic_years
  ADD COLUMN frozen_at timestamptz;

COMMENT ON COLUMN public.hr_academic_years.frozen_at IS
  'Non-NULL = this year is archived; balances are served from stored rows, not derived.';

-- 4. RLS. hleo_select mirrors hlb_select on hr_leave_balances verbatim.
ALTER TABLE public.hr_leave_entitlement_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY hleo_select ON public.hr_leave_entitlement_overrides
FOR SELECT USING (
  (SELECT public.is_super_admin())
  OR employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
  OR ((SELECT public.user_has_permission('hr.leave.approve'))
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
);

-- Write key is hr.leave.balance.manage (the key already guarding
-- /hr/admin/leave-balances), NOT hr.leave.policies.write which guards
-- hlb_write. Setting one person's exception is balance administration.
CREATE POLICY hleo_write ON public.hr_leave_entitlement_overrides
FOR ALL USING (
  (SELECT public.is_super_admin())
  OR ((SELECT public.user_has_permission('hr.leave.balance.manage'))
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())))
);

REVOKE ALL ON public.hr_leave_entitlement_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_entitlement_overrides TO authenticated;

COMMIT;
```

- [ ] **Step 3: Apply it**

Apply via Supabase MCP `apply_migration`, name `hr_leave_entitlement_overrides`, with the **exact SQL body above** — not a placeholder.

- [ ] **Step 4: Verify the schema landed**

```sql
SELECT
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_name='hr_leave_balances' AND column_name='entitled') AS entitled_nullable,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='hr_leave_entitlement_overrides') AS override_cols,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='hr_academic_years' AND column_name='frozen_at') AS has_frozen_at,
  (SELECT count(*) FROM pg_policies
    WHERE tablename='hr_leave_entitlement_overrides') AS policies;
```

Expected: `entitled_nullable = YES`, `override_cols = 10`, `has_frozen_at = 1`, `policies = 2`.

- [ ] **Step 5: Mirror into the setup reference files**

Append the `CREATE TABLE` + indexes to `supabase/setup/01_tables.sql`, the two policies to `supabase/setup/03_policies.sql`. These files are append-only catalogs — add, never rewrite.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260811180000_hr_leave_entitlement_overrides.sql supabase/setup/01_tables.sql supabase/setup/03_policies.sql
git commit -m "feat(hr/leave): schema for derived entitlement

entitled becomes nullable (NULL = derive from the leave type), plus an
overrides table for explicit per-person exceptions and a frozen_at marker
on hr_academic_years.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Register types

**Files:**
- Create: `types/hr-leave-overrides.ts`
- Modify: `types/hr.ts:376-391` (add `entitlement_source`)
- Modify: `types/supabase.ts` (register table + views)

**Interfaces:**
- Consumes: the table from Task 1.
- Produces: `HRLeaveEntitlementOverride`, `HRLeaveEntitlementOverrideInsert`, `HRLeaveEntitlementOverrideUpdate`, `HRLeaveEntitlementOverrideWithNames`, `EntitlementSource` — consumed by Tasks 5, 9, 10.

- [ ] **Step 1: Create the override types**

Create `types/hr-leave-overrides.ts`:

```typescript
/**
 * Per-person leave entitlement exceptions.
 *
 * The leave type carries the number everyone gets; a row here is the rare,
 * explicit departure from it (maternity policy, a mid-year joiner on
 * pro-rata, a contract term). `reason` is NOT NULL in the database — an
 * unexplained exception cannot be maintained by whoever inherits it.
 */

export interface HRLeaveEntitlementOverride {
  id: string;
  employee_id: string;
  leave_type_id: string;
  hr_academic_year_id: string;
  hr_organization_id: string;
  entitled_days: number;
  reason: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Joined shape for the Exceptions table — names resolved for display. */
export interface HRLeaveEntitlementOverrideWithNames extends HRLeaveEntitlementOverride {
  staff_name: string;
  staff_code: string | null;
  leave_type_name: string;
  /** The leave type's number, so the UI can show "15 (policy: 12)". */
  default_entitled_days: number;
  year_name: string;
}

export type HRLeaveEntitlementOverrideInsert = Omit<
  HRLeaveEntitlementOverride,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>;

export type HRLeaveEntitlementOverrideUpdate = Partial<
  Pick<HRLeaveEntitlementOverride, 'entitled_days' | 'reason'>
>;

export interface HRLeaveOverrideFilters {
  hrAcademicYearId?: string;
  hrOrganizationId?: string;
  employeeId?: string;
}
```

- [ ] **Step 2: Add `entitlement_source` to the balance type**

In `types/hr.ts`, replace the `HRLeaveBalanceWithType` interface (currently at lines 376-391) with:

```typescript
/** Where a balance row's `entitled` number came from. */
export type EntitlementSource = 'override' | 'frozen' | 'policy';

export interface HRLeaveBalanceWithType extends HRLeaveBalance {
  leave_type_name: string;
  leave_type_code: string;
  duration_type: LeaveDurationType;
  allow_half_day: boolean;
  allow_hourly: boolean;
  /**
   * Which Time Off tab this balance belongs to. Carried through from
   * hr_leave_types so each tab can filter without a second round trip —
   * the Leave tab must not offer Permission or Compensatory Off.
   */
  request_category: LeaveRequestCategory;
  max_continuous_days: number | null;
  min_advance_notice_days: number;
  requires_documents: boolean;
  /**
   * 'policy'   — the leave type's default_entitled_days (the common case)
   * 'override' — an explicit hr_leave_entitlement_overrides row
   * 'frozen'   — a stored value from a closed year
   */
  entitlement_source: EntitlementSource;
}
```

- [ ] **Step 3: Register in `types/supabase.ts`**

Add to the `Tables` block (follow the shape of the neighbouring entries — `Row`, `Insert`, `Update`, `Relationships`):

```typescript
      hr_leave_entitlement_overrides: {
        Row: {
          id: string
          employee_id: string
          leave_type_id: string
          hr_academic_year_id: string
          hr_organization_id: string
          entitled_days: number
          reason: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          leave_type_id: string
          hr_academic_year_id: string
          hr_organization_id: string
          entitled_days: number
          reason: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          leave_type_id?: string
          hr_academic_year_id?: string
          hr_organization_id?: string
          entitled_days?: number
          reason?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
```

Add `frozen_at: string | null` to the `hr_academic_years` `Row` (and `frozen_at?: string | null` to its `Insert`/`Update`).

**Do not** run `mcp__supabase__generate_typescript_types` and paste the whole file — it regenerates 116 type modules' worth of surface and buries this change in an unreviewable diff. Hand-add the two blocks.

The views (`v_hr_leave_balance`, `v_hr_leave_balance_src`) are registered in Task 3, once they exist.

- [ ] **Step 4: Typecheck**

Run `mcp__ide__getDiagnostics` on `types/hr-leave-overrides.ts`, `types/hr.ts`, `types/supabase.ts`.
Expected: no new errors. (`types/supabase.ts` may already carry pre-existing errors — compare against the baseline, do not fix unrelated ones.)

- [ ] **Step 5: Commit**

```bash
git add types/hr-leave-overrides.ts types/hr.ts types/supabase.ts
git commit -m "feat(hr/leave): types for entitlement overrides

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# STAGE B — The view and read rewiring (the goal is met here)

## Task 3: `v_hr_leave_balance`

**Files:**
- Create: `supabase/migrations/20260811180100_hr_leave_balance_view.sql`
- Modify: `types/supabase.ts` (register both views), `supabase/setup/05_views.sql` (append)

**Interfaces:**
- Consumes: Task 1's schema.
- Produces: `public.v_hr_leave_balance_src` (unsecured derivation, revoked from `anon`/`authenticated`) and `public.v_hr_leave_balance` (secured; same columns). Columns: `employee_id, leave_type_id, hr_academic_year_id, hr_organization_id, leave_type_name, leave_type_code, request_category, color_code, display_order, duration_type, allow_half_day, allow_hourly, max_continuous_days, min_advance_notice_days, requires_documents, entitled, used, carried_forward, available, entitlement_source, created_at, updated_at`. Consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260811180100_hr_leave_balance_view.sql`:

```sql
-- =====================================================================
-- Derived leave entitlement — the read surface
-- =====================================================================
-- Two views on purpose:
--
--   v_hr_leave_balance_src  the derivation, with NO access predicate.
--                           Revoked from anon and authenticated. Exists so
--                           fn_hr_freeze_leave_year can read the same
--                           derivation the UI reads without inheriting a
--                           predicate that would evaluate against the cron's
--                           service-role identity.
--   v_hr_leave_balance      src + the access predicate. This is what the app
--                           reads.
--
-- The predicate is copied VERBATIM from the hlb_select policy on
-- hr_leave_balances. security_invoker is deliberately NOT used even though
-- PG 15.6 supports it: the driving table of the open arm is `staff`, so
-- invoker mode would silently substitute staff's RLS for the leave-balance
-- rule that governs this data today -- a different, unaudited access model.

BEGIN;

CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS
-- ---------------------------------------------------------------------
-- OPEN YEARS: derive. Returns a row for every eligible staff x type pair
-- whether or not a ledger row exists -- this arm is what lets a staff
-- member created five minutes ago apply for leave with no admin action.
-- ---------------------------------------------------------------------
SELECT
  s.id                              AS employee_id,
  t.id                              AS leave_type_id,
  y.id                              AS hr_academic_year_id,
  t.hr_organization_id,
  t.leave_type_name,
  t.leave_type_code,
  t.request_category,
  t.color_code,
  t.display_order,
  t.duration_type,
  t.allow_half_day,
  t.allow_hourly,
  t.max_continuous_days,
  t.min_advance_notice_days,
  t.requires_documents,
  -- COALESCE, not truthiness: an override or frozen value of 0 is a real
  -- decision ("eligible, but no days") and must beat the default.
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)          AS entitled,
  COALESCE(b.used, 0)                                                     AS used,
  COALESCE(b.carried_forward, 0)                                          AS carried_forward,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)
    + COALESCE(b.carried_forward, 0)
    - COALESCE(b.used, 0)                                                 AS available,
  CASE
    WHEN o.entitled_days IS NOT NULL THEN 'override'
    WHEN b.entitled      IS NOT NULL THEN 'frozen'
    ELSE 'policy'
  END                                                                     AS entitlement_source,
  b.created_at,
  b.updated_at
FROM public.hr_academic_years y
CROSS JOIN public.hr_leave_types t
JOIN public.hr_organizations org ON org.id = t.hr_organization_id
JOIN public.staff s
  ON s.institution_id = org.institution_id
 AND s.is_active
LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
LEFT JOIN public.hr_leave_balances b
  ON b.employee_id         = s.id
 AND b.leave_type_id       = t.id
 AND b.hr_academic_year_id = y.id
LEFT JOIN public.hr_leave_entitlement_overrides o
  ON o.employee_id         = s.id
 AND o.leave_type_id       = t.id
 AND o.hr_academic_year_id = y.id
WHERE y.frozen_at IS NULL
  AND t.is_active
  -- Eligibility rules preserved from generate_hr_leave_balances. All three
  -- are inert today (0 gender-restricted types, 0 cadre-restricted types,
  -- 1 assignment on test data), so this changes nothing now and stops a
  -- future maternity/cadre-restricted type being granted to everyone.
  AND (t.applicable_gender = 'all'
       OR lower(COALESCE(s.gender, '')) = t.applicable_gender)
  AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments a
       WHERE a.leave_type_id = t.id AND a.is_active
    )
    OR EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments a
       WHERE a.leave_type_id = t.id
         AND a.is_active
         AND (
              (a.scope_kind = 'staff'      AND a.staff_id      = s.id)
           OR (a.scope_kind = 'department' AND a.department_id = s.department_id)
           OR (a.scope_kind = 'organization')
         )
    )
  )

UNION ALL

-- ---------------------------------------------------------------------
-- FROZEN YEARS: stored rows only, no cross join. History is served
-- exactly as recorded. An override still wins, so a past year can be
-- corrected deliberately.
-- ---------------------------------------------------------------------
SELECT
  b.employee_id,
  b.leave_type_id,
  b.hr_academic_year_id,
  b.hr_organization_id,
  t.leave_type_name,
  t.leave_type_code,
  t.request_category,
  t.color_code,
  t.display_order,
  t.duration_type,
  t.allow_half_day,
  t.allow_hourly,
  t.max_continuous_days,
  t.min_advance_notice_days,
  t.requires_documents,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)          AS entitled,
  b.used,
  b.carried_forward,
  COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)
    + b.carried_forward - b.used                                          AS available,
  CASE
    WHEN o.entitled_days IS NOT NULL THEN 'override'
    WHEN b.entitled      IS NOT NULL THEN 'frozen'
    ELSE 'policy'
  END                                                                     AS entitlement_source,
  b.created_at,
  b.updated_at
FROM public.hr_leave_balances b
JOIN public.hr_academic_years y
  ON y.id = b.hr_academic_year_id
 AND y.frozen_at IS NOT NULL
JOIN public.hr_leave_types t ON t.id = b.leave_type_id
LEFT JOIN public.hr_leave_entitlement_overrides o
  ON o.employee_id         = b.employee_id
 AND o.leave_type_id       = b.leave_type_id
 AND o.hr_academic_year_id = b.hr_academic_year_id;

-- The derivation is internal. Only view owners (and therefore
-- v_hr_leave_balance and SECURITY DEFINER functions) may read it.
REVOKE ALL ON public.v_hr_leave_balance_src FROM anon, authenticated;

CREATE OR REPLACE VIEW public.v_hr_leave_balance AS
SELECT * FROM public.v_hr_leave_balance_src v
WHERE (SELECT public.is_super_admin())
   OR v.employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
   OR ((SELECT public.user_has_permission('hr.leave.approve'))
       AND v.hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids())));

REVOKE ALL ON public.v_hr_leave_balance FROM anon;
GRANT SELECT ON public.v_hr_leave_balance TO authenticated;

-- Supporting index for the LEFT JOINs above.
CREATE INDEX IF NOT EXISTS idx_hlb_lookup
  ON public.hr_leave_balances (employee_id, leave_type_id, hr_academic_year_id);

COMMIT;
```

- [ ] **Step 2: Apply it**

Apply via Supabase MCP `apply_migration`, name `hr_leave_balance_view`.

- [ ] **Step 3: Verify the view returns rows for a staff member with no ledger row**

This is the single most important assertion in the plan — it is the whole point of the change.

```sql
-- A staff member with no hr_staff_details row at all (279 exist).
WITH victim AS (
  SELECT s.id, s.first_name, s.institution_id
  FROM staff s
  LEFT JOIN hr_staff_details d ON d.staff_id = s.id
  WHERE s.is_active AND d.staff_id IS NULL
  LIMIT 1
)
SELECT
  (SELECT count(*) FROM hr_leave_balances b WHERE b.employee_id = (SELECT id FROM victim))
    AS ledger_rows_before,
  (SELECT count(*) FROM v_hr_leave_balance_src v
    WHERE v.employee_id = (SELECT id FROM victim)
      AND v.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484')
    AS view_rows_now;
```

Expected: `view_rows_now > 0` even where `ledger_rows_before = 0`. If `view_rows_now = 0`, the eligibility filters are excluding them — check `applicable_gender` against `staff.gender` casing (gender is free text and mixed case in this database; the view lowercases it).

- [ ] **Step 4: Verify totals and the derived value**

```sql
SELECT entitlement_source, count(*) AS rows, count(DISTINCT employee_id) AS staff
FROM v_hr_leave_balance_src
WHERE hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
GROUP BY 1 ORDER BY 1;
```

Expected before the data migration: every row `frozen` (all 4,289 rows still carry a non-NULL `entitled`), plus `policy` rows for staff who had none. Total staff should approach 752.

- [ ] **Step 5: Check the plan is not a sequential scan disaster**

```sql
EXPLAIN ANALYZE
SELECT * FROM v_hr_leave_balance_src
WHERE employee_id = (SELECT id FROM staff WHERE is_active LIMIT 1)
  AND hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
```

Expected: total runtime well under 200 ms. Views are inlined, so the `employee_id` filter should push down into the `staff` scan. If it does not and runtime exceeds ~1 s, **stop and report** — do not proceed to Task 5 with a slow view, because every leave-apply page load hits it.

- [ ] **Step 6: Register the views in `types/supabase.ts`**

Add to the `Views` block:

```typescript
      v_hr_leave_balance: {
        Row: {
          employee_id: string | null
          leave_type_id: string | null
          hr_academic_year_id: string | null
          hr_organization_id: string | null
          leave_type_name: string | null
          leave_type_code: string | null
          request_category: string | null
          color_code: string | null
          display_order: number | null
          duration_type: string | null
          allow_half_day: boolean | null
          allow_hourly: boolean | null
          max_continuous_days: number | null
          min_advance_notice_days: number | null
          requires_documents: boolean | null
          entitled: number | null
          used: number | null
          carried_forward: number | null
          available: number | null
          entitlement_source: string | null
          created_at: string | null
          updated_at: string | null
        }
        Relationships: []
      }
```

(Generated view types are nullable across the board — that is normal and matches how Supabase types other views in this file.)

- [ ] **Step 7: Mirror + commit**

Append both `CREATE VIEW` statements to `supabase/setup/05_views.sql`.

```bash
git add supabase/migrations/20260811180100_hr_leave_balance_view.sql supabase/setup/05_views.sql types/supabase.ts
git commit -m "feat(hr/leave): v_hr_leave_balance derives entitlement

Returns a row per eligible staff x leave type whether or not a ledger row
exists, so a newly created staff member is never locked out. Access
predicate copied verbatim from the hlb_select policy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Data migration

**Files:**
- Create: `supabase/migrations/20260811180200_hr_leave_balance_data_migration.sql`

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces: 3 override rows; `entitled = NULL` on all open-year balance rows; `frozen_at` set on the two ended years.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260811180200_hr_leave_balance_data_migration.sql`:

```sql
-- =====================================================================
-- Derived leave entitlement — data migration
-- =====================================================================
-- Order matters. Step 1 must run BEFORE step 2, or the three divergent
-- values are lost and those people silently gain 7 days.

BEGIN;

-- 1. Preserve the rows that differ from their type default. Verified
--    2026-08-11: exactly 3, all Vacation Leave at 7.00 against a 14.00
--    default, all cadre-derived. Selected by predicate, not by hardcoded
--    ids -- the ids are in the spec to verify the count, not to drive this.
INSERT INTO public.hr_leave_entitlement_overrides (
  employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
  entitled_days, reason
)
SELECT b.employee_id, b.leave_type_id, b.hr_academic_year_id, b.hr_organization_id,
       b.entitled, 'Migrated from cadre entitlement 2026-08-11'
FROM public.hr_leave_balances b
JOIN public.hr_leave_types t ON t.id = b.leave_type_id
JOIN public.hr_academic_years y ON y.id = b.hr_academic_year_id
WHERE y.end_date >= current_date
  AND b.entitled IS DISTINCT FROM t.default_entitled_days
ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

-- 2. Release the open years to derivation. used and carried_forward are
--    never touched -- they are recorded facts, not policy.
UPDATE public.hr_leave_balances b
   SET entitled = NULL, updated_at = now()
  FROM public.hr_academic_years y
 WHERE y.id = b.hr_academic_year_id
   AND y.end_date >= current_date;

-- 3. Freeze the years that have already ended, so the cron does not later
--    re-derive their numbers from today's policy.
UPDATE public.hr_academic_years
   SET frozen_at = now()
 WHERE end_date < current_date
   AND frozen_at IS NULL;

-- 4. Post-conditions. Raise rather than commit something wrong.
DO $$
DECLARE
  v_overrides  integer;
  v_not_null   integer;
  v_unfrozen   integer;
  v_uncovered  integer;
BEGIN
  SELECT count(*) INTO v_overrides FROM public.hr_leave_entitlement_overrides;

  SELECT count(*) INTO v_not_null
    FROM public.hr_leave_balances b
    JOIN public.hr_academic_years y ON y.id = b.hr_academic_year_id
   WHERE y.end_date >= current_date AND b.entitled IS NOT NULL;

  SELECT count(*) INTO v_unfrozen
    FROM public.hr_academic_years
   WHERE end_date < current_date AND frozen_at IS NULL;

  -- Every active staff member must resolve at least one row for the
  -- current year, or somebody is still locked out.
  SELECT count(*) INTO v_uncovered
    FROM public.staff s
   WHERE s.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.v_hr_leave_balance_src v
        WHERE v.employee_id = s.id
          AND v.hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
     );

  IF v_overrides <> 3 THEN
    RAISE EXCEPTION 'Expected 3 migrated overrides, got %', v_overrides;
  END IF;
  IF v_not_null <> 0 THEN
    RAISE EXCEPTION 'Open-year rows still carry a frozen entitled: %', v_not_null;
  END IF;
  IF v_unfrozen <> 0 THEN
    RAISE EXCEPTION 'Ended years left unfrozen: %', v_unfrozen;
  END IF;
  IF v_uncovered <> 0 THEN
    RAISE EXCEPTION 'Active staff with no resolvable balance row: %', v_uncovered;
  END IF;
END $$;

COMMIT;
```

- [ ] **Step 2: Apply it**

Apply via Supabase MCP `apply_migration`, name `hr_leave_balance_data_migration`.

If it raises, **nothing is committed** — read the message, fix the cause, re-apply. Do not weaken an assertion to get past it.

- [ ] **Step 3: Verify nothing was lost and the 3 kept their number**

Compare against the Task 1 Step 1 baseline:

```sql
SELECT
  (SELECT sum(used) FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id
    WHERE y.end_date >= current_date) AS open_used_after,
  (SELECT sum(carried_forward) FROM hr_leave_balances b
     JOIN hr_academic_years y ON y.id = b.hr_academic_year_id
    WHERE y.end_date >= current_date) AS open_carried_after,
  (SELECT count(*) FROM hr_leave_entitlement_overrides WHERE entitled_days = 7.00) AS sevens,
  (SELECT count(*) FROM v_hr_leave_balance_src v
     JOIN hr_leave_entitlement_overrides o
       ON o.employee_id = v.employee_id AND o.leave_type_id = v.leave_type_id
      AND o.hr_academic_year_id = v.hr_academic_year_id
    WHERE v.entitled = 7.00 AND v.entitlement_source = 'override') AS still_seven;
```

Expected: `open_used_after` and `open_carried_after` **identical** to the baseline; `sevens = 3`; `still_seven = 3`.

- [ ] **Step 4: Verify a policy edit now propagates**

```sql
-- Non-destructive: change, observe, roll back.
BEGIN;
UPDATE hr_leave_types SET default_entitled_days = 99
 WHERE leave_type_code = 'CL'
   AND hr_organization_id = 'af210159-723c-4da2-9663-19f464d8c64e';
SELECT count(*) AS staff_now_on_99
  FROM v_hr_leave_balance_src
 WHERE hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'
   AND leave_type_code = 'CL' AND entitled = 99;
ROLLBACK;
```

Expected: `staff_now_on_99` ≈ 91 (Engineering's active staff). This is D2 working — under the old model this number would have been 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811180200_hr_leave_balance_data_migration.sql
git commit -m "feat(hr/leave): migrate balances to derived entitlement

Preserves the 3 cadre-derived values as explicit overrides, releases open
years to derivation, and freezes the two years that have already ended.
Post-conditions assert used/carried_forward are untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Trigger — stop writing `entitled = 0`

**Files:**
- Create: `supabase/migrations/20260811180300_hr_trig_update_leave_balance_null.sql`
- Modify: `supabase/setup/02_functions.sql` (append)

**Interfaces:**
- Consumes: Task 1 (nullable column).
- Produces: `hr_trig_update_leave_balance` inserting `entitled = NULL`.

- [ ] **Step 1: Write the migration**

The function body below is the current live definition with **one value changed** (`0` → `NULL` in the INSERT's `entitled` position) and a comment added. Do not restructure it.

Create `supabase/migrations/20260811180300_hr_trig_update_leave_balance_null.sql`:

```sql
-- =====================================================================
-- Approval trigger: insert entitled = NULL, not 0
-- =====================================================================
-- WHY: approving leave for someone with no balance row inserted
-- (entitled = 0, used = total_days) -- a permanently negative balance the
-- generator could never repair, because it was ON CONFLICT DO NOTHING and
-- would skip the row it needed to fix. NULL means "derive from the leave
-- type", so the row records the usage without pinning entitlement to zero.

CREATE OR REPLACE FUNCTION public.hr_trig_update_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_delta numeric;
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  -- Comp off is credit-backed; short time off is minute-backed. Neither draws
  -- on a day entitlement.
  IF v_category IN ('compensatory_off', 'short_time_off') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    v_delta := NEW.total_days;
    INSERT INTO hr_leave_balances (employee_id, leave_type_id, hr_academic_year_id, hr_organization_id, entitled, used, carried_forward)
    VALUES (NEW.employee_id, NEW.leave_type_id, NEW.hr_academic_year_id, NEW.hr_organization_id, NULL, v_delta, 0)
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
    DO UPDATE SET
      used = hr_leave_balances.used + EXCLUDED.used,
      updated_at = now();

  ELSIF NEW.status IN ('cancelled', 'rejected', 'withdrawn') AND OLD.status = 'approved' THEN
    v_delta := NEW.total_days;
    UPDATE hr_leave_balances
       SET used = GREATEST(0, used - v_delta),
           updated_at = now()
     WHERE employee_id         = NEW.employee_id
       AND leave_type_id       = NEW.leave_type_id
       AND hr_academic_year_id = NEW.hr_academic_year_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $function$;
```

- [ ] **Step 2: Apply it**

Apply via Supabase MCP `apply_migration`, name `hr_trig_update_leave_balance_null`.

**Note:** `CREATE OR REPLACE FUNCTION` preserves grants; `DROP FUNCTION` + recreate would silently revert EXECUTE to PUBLIC. Use replace, as written.

- [ ] **Step 3: Verify the trigger still fires and no longer pins zero**

```sql
-- Non-destructive: exercise the path, then roll back.
BEGIN;
SELECT id, employee_id, leave_type_id, hr_academic_year_id, status
  FROM hr_leave_applications
 WHERE status = 'pending' LIMIT 1;
-- If a pending row exists, flip it and inspect; otherwise skip to ROLLBACK.
ROLLBACK;
```

Then confirm the deployed body carries `NULL`:

```sql
SELECT position('entitled, used, carried_forward)' IN pg_get_functiondef(oid)) > 0 AS has_insert,
       position(', NULL, v_delta, 0)' IN pg_get_functiondef(oid)) > 0 AS inserts_null
FROM pg_proc WHERE proname = 'hr_trig_update_leave_balance';
```

Expected: `inserts_null = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260811180300_hr_trig_update_leave_balance_null.sql supabase/setup/02_functions.sql
git commit -m "fix(hr/leave): approval trigger inserts entitled NULL not 0

Approving leave for someone with no balance row created a permanently
negative balance the generator could never repair.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Rewire `leave-service.ts`

**Files:**
- Modify: `lib/services/hr/leave-service.ts` (`getBalance`, and the over-draw guard around line 321-345)

**Interfaces:**
- Consumes: Task 3's view, Task 2's `entitlement_source`.
- Produces: `LeaveService.getBalance(supabase, employeeId, hrAcademicYearId): Promise<HRLeaveBalanceWithType[]>` — same signature, now view-backed and never empty for an eligible employee.

- [ ] **Step 1: Replace `getBalance`**

Replace the whole `getBalance` method body. The view is already denormalized, so the PostgREST embed and its 20-line mapper both go away:

```typescript
  /**
   * Balances for one person and year.
   *
   * Reads v_hr_leave_balance, not hr_leave_balances: the view returns a row
   * for every leave type the employee is eligible for whether or not a
   * ledger row exists. Under the old table read, a staff member created
   * after the last "Generate" run got an empty array here, which the apply
   * drawer rendered as "No leave balance is configured for you this
   * academic year" -- a hard block with no admin recourse.
   */
  static async getBalance(
    supabase: SupabaseClient,
    employeeId: string,
    hrAcademicYearId: string
  ): Promise<HRLeaveBalanceWithType[]> {
    const { data, error } = await supabase
      .from('v_hr_leave_balance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('hr_academic_year_id', hrAcademicYearId)
      .order('display_order', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => ({
      employee_id: row.employee_id as string,
      leave_type_id: row.leave_type_id as string,
      hr_academic_year_id: row.hr_academic_year_id as string,
      hr_organization_id: row.hr_organization_id as string,
      entitled: Number(row.entitled),
      used: Number(row.used),
      carried_forward: Number(row.carried_forward),
      // Null for a derived row that has no ledger row behind it yet.
      created_at: (row.created_at ?? null) as string,
      updated_at: (row.updated_at ?? null) as string,
      leave_type_name: (row.leave_type_name ?? '') as string,
      leave_type_code: (row.leave_type_code ?? '') as string,
      duration_type: (row.duration_type ?? 'full') as HRLeaveBalanceWithType['duration_type'],
      allow_half_day: (row.allow_half_day ?? false) as boolean,
      allow_hourly: (row.allow_hourly ?? false) as boolean,
      request_category:
        (row.request_category ?? 'leave') as HRLeaveBalanceWithType['request_category'],
      max_continuous_days: (row.max_continuous_days ?? null) as number | null,
      min_advance_notice_days: Number(row.min_advance_notice_days ?? 0),
      requires_documents: (row.requires_documents ?? false) as boolean,
      entitlement_source:
        (row.entitlement_source ?? 'policy') as HRLeaveBalanceWithType['entitlement_source'],
    }));
  }
```

- [ ] **Step 2: Make the over-draw guard unconditional**

In `applyLeave`, replace the balance lookup and the `if (balance)` block (currently ~lines 321-345) with:

```typescript
    let balance: { entitled?: number; carried_forward?: number; used?: number } | null = null;

    if (resolvedYearId) {
      const { data, error: balanceError } = await supabase
        .from('v_hr_leave_balance')
        .select('entitled, carried_forward, used')
        .eq('employee_id', payload.employee_id)
        .eq('leave_type_id', payload.leave_type_id)
        .eq('hr_academic_year_id', resolvedYearId)
        .maybeSingle();

      if (balanceError) throw balanceError;
      balance = data;
    }

    // Unconditional, deliberately. This used to be `if (balance) { ... }`,
    // so a staff member with no ledger row had NO over-draw check at all --
    // fail-open, and exactly the people most likely to have one (new
    // joiners, nobody having run the generator for them). The view always
    // returns a row for an eligible employee, so a null here now means
    // genuinely ineligible for this type, which is its own refusal.
    if (!balance) {
      throw new Error(
        `You are not eligible for ${leaveType.leave_type_name}. Ask HR if this is wrong.`
      );
    }

    const available =
      (balance.entitled ?? 0) + (balance.carried_forward ?? 0) - (balance.used ?? 0);
    if (estimatedDays > available) {
      // hr_leave_types has no `name` column — it is `leave_type_name`.
      throw new Error(
        `Insufficient balance. You have ${available.toFixed(1)} day(s) of ${leaveType.leave_type_name} available; requested ${estimatedDays}.`
      );
    }
```

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on `lib/services/hr/leave-service.ts`.
Expected: no new errors.

- [ ] **Step 4: Verify in the browser — this is the acceptance criterion**

1. `npm run dev` (Turbopack; do **not** run this if a dev server is already running — `predev` prunes the cache of the running server and corrupts it).
2. Create a new staff member via `/staff/list` at any institution, with `login_enabled` true.
3. Sign in **as that person, or as a plain `faculty` role — never as super-admin** (super-admin bypasses the very predicates under test).
4. Open `/hr/leave/apply`.

Expected: the leave-type dropdown is **populated**, each option shows the correct available days, and **no admin action was taken in between**. Under the old model this dropdown was empty and the drawer showed *"No leave balance is configured for you this academic year."*

Capture a screenshot. If the dropdown is empty, check the browser console and the `v_hr_leave_balance` predicate against that user's `fn_my_staff_ids()`.

- [ ] **Step 5: Commit**

```bash
git add lib/services/hr/leave-service.ts
git commit -m "feat(hr/leave): read balances from v_hr_leave_balance

New staff can apply immediately -- the view returns a row per eligible
leave type whether or not a ledger row exists. Also makes the over-draw
guard unconditional; it was skipped entirely when no row existed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Rewire dashboard and analytics

**Files:**
- Modify: `lib/services/hr/dashboard-service.ts:293`, `:698`, `:792`
- Modify: `lib/services/hr/analytics-service.ts:334`

**Interfaces:**
- Consumes: Task 3's view.
- Produces: no signature changes.

- [ ] **Step 1: Fix the `allocated` column bug in `analytics-service.ts`**

`getLeaveUtilization` selects `allocated` — **a column that does not exist** on `hr_leave_balances` (its columns are `entitled`, `used`, `carried_forward`). Pre-existing; fix it here rather than carrying it forward. Replace the query at line 333-337:

```typescript
    let query = supabase
      .from('v_hr_leave_balance')
      .select(
        'entitled, used, hr_organization_id, staff!inner(institution_id, institutions!staff_institution_id_fkey!inner(name))'
      );
```

Then update the consuming reducer in that method to read `entitled` where it read `allocated`.

**If the `staff!inner` embed fails against the view** (views do not carry FK metadata, so PostgREST cannot resolve the relationship), drop the embed and group by `hr_organization_id`, resolving institution names with a second small query against `hr_organizations`. Verify which applies before writing the final form.

- [ ] **Step 2: Point the three dashboard reads at the view**

In `dashboard-service.ts`, change `.from('hr_leave_balances')` → `.from('v_hr_leave_balance')` at lines 293, 698, and 792. The selected columns (`entitled, used, carried_forward`) all exist on the view under the same names, so no other edit is needed.

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on both files.
Expected: no new errors.

- [ ] **Step 4: Verify the KPIs still render**

In the browser, open `/hr` (the HR dashboard) as a user with HR access.
Expected: leave-utilisation KPIs render with plausible numbers, no console errors. Utilisation percentages will **shift** — staff who previously had no rows now contribute their entitlement to the denominator. That is the correction, not a regression; note the before/after in the commit.

- [ ] **Step 5: Commit**

```bash
git add lib/services/hr/dashboard-service.ts lib/services/hr/analytics-service.ts
git commit -m "fix(hr): dashboard and analytics read the balance view

Also fixes getLeaveUtilization selecting 'allocated', a column that does
not exist on hr_leave_balances -- pre-existing, surfaced while rewiring.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# STAGE C — Freeze

## Task 8: `fn_hr_freeze_leave_year`

**Files:**
- Create: `supabase/migrations/20260811180400_fn_hr_freeze_leave_year.sql`
- Modify: `supabase/setup/02_functions.sql` (append)

**Interfaces:**
- Consumes: Task 3's `v_hr_leave_balance_src`.
- Produces: `public.fn_hr_freeze_leave_year(p_hr_academic_year_id uuid) RETURNS jsonb` — returns `{ year_name, already_frozen, inserted, updated, frozen_at }`. Consumed by Tasks 9 and 11.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260811180400_fn_hr_freeze_leave_year.sql`:

```sql
-- =====================================================================
-- Freeze one HR academic year
-- =====================================================================
-- Materializes the currently-derived entitlement into the ledger, then
-- marks the year archived so v_hr_leave_balance serves it from stored
-- rows instead of re-deriving it from whatever policy says later.
--
-- This is NOT generate_hr_leave_balances. That function is
-- ON CONFLICT DO NOTHING and cannot perform step 2 below -- freezing must
-- OVERWRITE the NULLs it finds, which is exactly the update the old
-- generator was built never to do. Both old generators are left in place
-- unreferenced so this change stays reversible.

CREATE OR REPLACE FUNCTION public.fn_hr_freeze_leave_year(
  p_hr_academic_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_inserted  integer := 0;
  v_updated   integer := 0;
  v_frozen_at timestamptz;
  v_year_name text;
BEGIN
  -- auth.uid() IS NULL means a service-role caller (the cron), which has no
  -- JWT subject. A human caller must hold the key. Gating on the key rather
  -- than a role name keeps this consistent with the rest of the app.
  IF auth.uid() IS NOT NULL
     AND NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT frozen_at, year_name INTO v_frozen_at, v_year_name
  FROM public.hr_academic_years WHERE id = p_hr_academic_year_id;

  IF v_year_name IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_academic_year_id %', p_hr_academic_year_id;
  END IF;

  IF v_frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'year_name', v_year_name, 'already_frozen', true,
      'inserted', 0, 'updated', 0, 'frozen_at', v_frozen_at
    );
  END IF;

  -- 1. Materialize rows that never existed, at the currently-derived value.
  INSERT INTO public.hr_leave_balances (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    entitled, used, carried_forward
  )
  SELECT v.employee_id, v.leave_type_id, v.hr_academic_year_id, v.hr_organization_id,
         v.entitled, v.used, v.carried_forward
  FROM public.v_hr_leave_balance_src v
  WHERE v.hr_academic_year_id = p_hr_academic_year_id
  ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 2. Pin the rows that exist but are still deriving.
  UPDATE public.hr_leave_balances b
     SET entitled = v.entitled, updated_at = now()
    FROM public.v_hr_leave_balance_src v
   WHERE v.employee_id         = b.employee_id
     AND v.leave_type_id       = b.leave_type_id
     AND v.hr_academic_year_id = b.hr_academic_year_id
     AND b.hr_academic_year_id = p_hr_academic_year_id
     AND b.entitled IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- 3. Archive. After this the view serves the year from stored rows, so
  --    steps 1-2 must have completed -- hence one transaction per year.
  UPDATE public.hr_academic_years
     SET frozen_at = now()
   WHERE id = p_hr_academic_year_id
  RETURNING frozen_at INTO v_frozen_at;

  RETURN jsonb_build_object(
    'year_name', v_year_name, 'already_frozen', false,
    'inserted', v_inserted, 'updated', v_updated, 'frozen_at', v_frozen_at
  );
END $function$;

REVOKE ALL ON FUNCTION public.fn_hr_freeze_leave_year(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_freeze_leave_year(uuid) TO authenticated, service_role;
```

- [ ] **Step 2: Apply it**

Apply via Supabase MCP `apply_migration`, name `fn_hr_freeze_leave_year`.

- [ ] **Step 3: Verify the already-frozen short-circuit**

The two ended years were frozen in Task 4, so calling this on one must be a clean no-op:

```sql
SELECT public.fn_hr_freeze_leave_year('a6baeaf9-92ca-4bfe-91a1-598af6fbd9c9'::uuid);
```

Expected: `{"already_frozen": true, "inserted": 0, "updated": 0, ...}`.

- [ ] **Step 4: Verify a real freeze end-to-end, then roll it back**

```sql
BEGIN;
SELECT public.fn_hr_freeze_leave_year('2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid);
-- Every open-year row must now carry a number, and the 3 overrides must
-- have been frozen at 7.00, not at the 14.00 default.
SELECT count(*) FILTER (WHERE entitled IS NULL) AS still_null,
       count(*) FILTER (WHERE entitled = 7.00)  AS sevens
  FROM hr_leave_balances
 WHERE hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
ROLLBACK;
```

Expected: `still_null = 0`, `sevens = 3`. **The ROLLBACK is mandatory** — the current year must stay open.

- [ ] **Step 5: Confirm the rollback took**

```sql
SELECT frozen_at FROM hr_academic_years
 WHERE id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
```

Expected: `NULL`. If it is not null, the current year is wrongly archived — `UPDATE hr_academic_years SET frozen_at = NULL WHERE id = '2c5d0bb6-…'` and investigate before proceeding.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260811180400_fn_hr_freeze_leave_year.sql supabase/setup/02_functions.sql
git commit -m "feat(hr/leave): fn_hr_freeze_leave_year archives a closed year

Materializes the derived entitlement into the ledger and stamps frozen_at,
in one transaction per year so a year is never left half-frozen.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Freeze cron

**Files:**
- Create: `app/api/cron/hr-leave-year-freeze/route.ts`
- Modify: `vercel.json` (add to `crons`)

**Interfaces:**
- Consumes: Task 8's RPC.
- Produces: `GET /api/cron/hr-leave-year-freeze` → `{ success, frozen: [...], duration_ms, marker }`.

- [ ] **Step 1: Write the route**

Create `app/api/cron/hr-leave-year-freeze/route.ts`:

```typescript
// =====================================================================
// HR Leave Year Freeze — daily
// =====================================================================
// Archives any HR academic year that has ended but is still deriving its
// entitlement, by calling fn_hr_freeze_leave_year once per year.
//
// This replaces the manual "Generate balances" run. The old model needed
// an admin to remember BEFORE a year started, or staff could not apply;
// this runs itself AFTER a year ends, and nothing is blocked if it is late
// -- an unfrozen ended year simply keeps deriving from current policy.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> (Vercel auto-sends)
//       OR ?secret=<value> (manual runs). BOTH are required in code:
//       vercel.json registers the path as ?secret=${CRON_SECRET} but Vercel
//       does NOT interpolate env vars into a cron path -- it sends the
//       literal string and puts the real secret in the header. A route that
//       checks only the query param 401s on every scheduled tick while
//       manual runs succeed, which looks alive in the log and is not.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const started = Date.now();
  const marker = `hr_leave_year_freeze_${new Date().toISOString()}`;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured', marker },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ success: false, error: 'unauthorized', marker }, { status: 401 });
  }

  // Sessionless context: no cookie identity, so a service-role client is
  // required. fn_hr_freeze_leave_year permits this by checking
  // auth.uid() IS NULL.
  const supabase = createServiceRoleClient();

  const frozen: Array<{ year_id: string; year_name: string; inserted: number; updated: number }> = [];
  const failures: Array<{ year_id: string; error: string }> = [];

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: years, error: yearsError } = await supabase
      .from('hr_academic_years')
      .select('id, year_name')
      .lt('end_date', today)
      .is('frozen_at', null);

    if (yearsError) throw yearsError;

    for (const y of years ?? []) {
      // Each year is its own RPC call and its own transaction, so one
      // failure does not strand the others half-frozen.
      const { data, error } = await supabase.rpc('fn_hr_freeze_leave_year', {
        p_hr_academic_year_id: y.id,
      });
      if (error) {
        failures.push({ year_id: y.id, error: error.message });
        continue;
      }
      const r = data as { year_name: string; inserted: number; updated: number };
      frozen.push({ year_id: y.id, year_name: r.year_name, inserted: r.inserted, updated: r.updated });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/hr-leave-year-freeze] failed:', msg);
    return NextResponse.json(
      { success: false, error: msg, frozen, duration_ms: Date.now() - started, marker },
      { status: 500 }
    );
  }

  const durationMs = Date.now() - started;

  // Always log, even on a zero-year no-op, so a freshness gate can tell
  // "nothing to do" from "never ran".
  console.warn('[cron/hr-leave-year-freeze] run-complete', JSON.stringify({
    success: failures.length === 0,
    frozen_count: frozen.length,
    failure_count: failures.length,
    frozen,
    failures,
    duration_ms: durationMs,
    marker,
  }));

  return NextResponse.json({
    success: failures.length === 0,
    frozen,
    failures,
    duration_ms: durationMs,
    marker,
  }, { status: failures.length > 0 ? 500 : 200 });
}
```

- [ ] **Step 2: Register the cron**

Add to the `crons` array in `vercel.json` (04:00 UTC daily — after midnight in every Indian timezone, and clear of the 15-minute dispatcher):

```json
    {
      "path": "/api/cron/hr-leave-year-freeze?secret=${CRON_SECRET}",
      "schedule": "0 4 * * *"
    }
```

The `?secret=` form matches every other entry in this file. It does **not** work on its own — the Bearer check in Step 1 is what makes the scheduled tick authenticate.

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on `app/api/cron/hr-leave-year-freeze/route.ts`.
Expected: no errors.

- [ ] **Step 4: Verify the route runs and is a no-op today**

With the dev server running:

```bash
curl -s "http://localhost:3000/api/cron/hr-leave-year-freeze?secret=$CRON_SECRET" | head -20
```

Expected: `{"success":true,"frozen":[],"failures":[],...}` — both ended years were already frozen in Task 4, so there is nothing to do. A non-empty `frozen` array here means a year was left unfrozen; check why.

- [ ] **Step 5: Verify the auth gate**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/cron/hr-leave-year-freeze"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/hr-leave-year-freeze"
```

Expected: `401` then `200`. The second is the path Vercel actually uses — if it 401s, the scheduled cron is dead on arrival.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/hr-leave-year-freeze/route.ts vercel.json
git commit -m "feat(hr/leave): daily cron freezes ended academic years

Replaces the manual pre-year Generate run with a post-year archival step.
Checks the Authorization header as well as ?secret=, because Vercel does
not interpolate \${CRON_SECRET} into a cron path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# STAGE D — Admin UI

## Task 10: Override service and hooks

**Files:**
- Create: `lib/services/hr/leave-override-service.ts`
- Create: `hooks/hr/use-leave-overrides.ts`

**Interfaces:**
- Consumes: Task 1's table, Task 2's types, Task 8's RPC.
- Produces: `HRLeaveOverrideService.{list,create,update,remove,freezeYear}`; hooks `useLeaveOverrides`, `useCreateLeaveOverride`, `useUpdateLeaveOverride`, `useDeleteLeaveOverride`, `useFreezeYear` — consumed by Tasks 11 and 12.

- [ ] **Step 1: Write the service**

Create `lib/services/hr/leave-override-service.ts`:

```typescript
/**
 * Per-person leave entitlement exceptions.
 *
 * Deliberately a thin CRUD layer: the interesting logic (which number
 * actually applies) lives in v_hr_leave_balance, so there is exactly one
 * place that resolves entitlement and this service cannot disagree with it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRLeaveEntitlementOverride,
  HRLeaveEntitlementOverrideInsert,
  HRLeaveEntitlementOverrideUpdate,
  HRLeaveEntitlementOverrideWithNames,
  HRLeaveOverrideFilters,
} from '@/types/hr-leave-overrides';

export interface FreezeYearResult {
  year_name: string;
  already_frozen: boolean;
  inserted: number;
  updated: number;
  frozen_at: string;
}

export class HRLeaveOverrideService {
  static async list(
    supabase: SupabaseClient,
    filters: HRLeaveOverrideFilters = {}
  ): Promise<HRLeaveEntitlementOverrideWithNames[]> {
    let query = supabase
      .from('hr_leave_entitlement_overrides')
      .select(`
        *,
        staff:employee_id (first_name, last_name, staff_id),
        hr_leave_types:leave_type_id (leave_type_name, default_entitled_days),
        hr_academic_years:hr_academic_year_id (year_name)
      `)
      .order('created_at', { ascending: false });

    // `??` not `||` — `||` coerces undefined to '' which is sent as a real
    // uuid and matches zero rows.
    if (filters.hrAcademicYearId != null) {
      query = query.eq('hr_academic_year_id', filters.hrAcademicYearId);
    }
    if (filters.hrOrganizationId != null) {
      query = query.eq('hr_organization_id', filters.hrOrganizationId);
    }
    if (filters.employeeId != null) {
      query = query.eq('employee_id', filters.employeeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const s = row.staff as { first_name: string; last_name: string; staff_id: string | null } | null;
      const t = row.hr_leave_types as { leave_type_name: string; default_entitled_days: number } | null;
      const y = row.hr_academic_years as { year_name: string } | null;
      return {
        ...(row as unknown as HRLeaveEntitlementOverride),
        entitled_days: Number(row.entitled_days),
        staff_name: [s?.first_name, s?.last_name].filter(Boolean).join(' ').trim(),
        staff_code: s?.staff_id ?? null,
        leave_type_name: t?.leave_type_name ?? '',
        default_entitled_days: Number(t?.default_entitled_days ?? 0),
        year_name: y?.year_name ?? '',
      };
    });
  }

  static async create(
    supabase: SupabaseClient,
    payload: HRLeaveEntitlementOverrideInsert
  ): Promise<HRLeaveEntitlementOverride> {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('hr_leave_entitlement_overrides')
      .insert({ ...payload, created_by: userData?.user?.id ?? null })
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveEntitlementOverride;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    patch: HRLeaveEntitlementOverrideUpdate
  ): Promise<HRLeaveEntitlementOverride> {
    const { data, error } = await supabase
      .from('hr_leave_entitlement_overrides')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveEntitlementOverride;
  }

  /**
   * Hard delete is correct here, unlike on hr_leave_types. An override is
   * configuration, not history: removing one returns that person to the
   * policy number, and nothing references it by FK.
   */
  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_leave_entitlement_overrides')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static async freezeYear(
    supabase: SupabaseClient,
    hrAcademicYearId: string
  ): Promise<FreezeYearResult> {
    const { data, error } = await supabase.rpc('fn_hr_freeze_leave_year', {
      p_hr_academic_year_id: hrAcademicYearId,
    });
    if (error) throw error;
    return data as FreezeYearResult;
  }
}
```

- [ ] **Step 2: Write the hooks**

Create `hooks/hr/use-leave-overrides.ts`:

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HRLeaveOverrideService } from '@/lib/services/hr/leave-override-service';
import type {
  HRLeaveEntitlementOverrideInsert,
  HRLeaveEntitlementOverrideUpdate,
  HRLeaveOverrideFilters,
} from '@/types/hr-leave-overrides';

const KEY = 'hr-leave-overrides';

export function useLeaveOverrides(filters: HRLeaveOverrideFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => HRLeaveOverrideService.list(supabase, filters),
  });
}

/**
 * Every mutation invalidates 'hr-leave-balance' as well as the override
 * list: an override changes what the apply drawer offers, and a settings
 * screen that only refreshes its own table leaves the rest of the app
 * showing the pre-change number until a reload.
 */
function useOverrideMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['hr-leave-balance'] });
    },
  });
}

export function useCreateLeaveOverride() {
  const supabase = createClientSupabaseClient();
  return useOverrideMutation((payload: HRLeaveEntitlementOverrideInsert) =>
    HRLeaveOverrideService.create(supabase, payload)
  );
}

export function useUpdateLeaveOverride() {
  const supabase = createClientSupabaseClient();
  return useOverrideMutation(({ id, patch }: { id: string; patch: HRLeaveEntitlementOverrideUpdate }) =>
    HRLeaveOverrideService.update(supabase, id, patch)
  );
}

export function useDeleteLeaveOverride() {
  const supabase = createClientSupabaseClient();
  return useOverrideMutation((id: string) => HRLeaveOverrideService.remove(supabase, id));
}

export function useFreezeYear() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (hrAcademicYearId: string) =>
      HRLeaveOverrideService.freezeYear(supabase, hrAcademicYearId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-academic-years'] });
      qc.invalidateQueries({ queryKey: ['hr-leave-balance'] });
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run `mcp__ide__getDiagnostics` on both new files.
Expected: no errors.

- [ ] **Step 4: Verify the embed resolves**

The `staff:employee_id` / `hr_leave_types:leave_type_id` embeds require the FKs from Task 1. Confirm with a live call:

```sql
SELECT o.id, s.first_name, t.leave_type_name, t.default_entitled_days, o.entitled_days, o.reason
FROM hr_leave_entitlement_overrides o
JOIN staff s ON s.id = o.employee_id
JOIN hr_leave_types t ON t.id = o.leave_type_id;
```

Expected: the 3 migrated rows, each showing `default_entitled_days = 14.00` and `entitled_days = 7.00`. If the PostgREST embed later returns *"could not find a relationship"*, the FK name differs — check `information_schema.table_constraints` and use the explicit `!fk_name` form.

- [ ] **Step 5: Commit**

```bash
git add lib/services/hr/leave-override-service.ts hooks/hr/use-leave-overrides.ts
git commit -m "feat(hr/leave): service and hooks for entitlement overrides

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Make the Analytics tab tell the truth

**Files:**
- Create: `supabase/migrations/20260811180500_hr_leave_balance_analytics_view.sql`
- Modify: `app/(routes)/hr/admin/leave-balances/_components/leave-balance-analytics.tsx`

**Interfaces:**
- Consumes: Task 3's `v_hr_leave_balance_src`.
- Produces: no signature change. `hr_leave_balance_analytics` keeps returning the same JSON shape; its numbers become correct under the derived model.

**Why this task exists.** `leave-balance-analytics.tsx:64` imports `BLOCKED, STATUS_META, fmt` from `./coverage-status` — the file Task 12 deletes. Deleting it without this task breaks the Analytics tab. Beyond the mechanical break, the RPC computes "coverage" from `hr_leave_balances`, so it would keep reporting staff as *uncovered* when the view already serves them — the tab would show gaps that no longer exist and offer a Generate button that no longer does.

- [ ] **Step 1: Point the RPC's balance reads at the view**

`hr_leave_balance_analytics` is `SECURITY DEFINER` (verified), so it may read `v_hr_leave_balance_src` despite that view being revoked from `authenticated`.

Fetch the current definition, then re-apply it with **only** the balance source changed:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'hr_leave_balance_analytics';
```

In that body, replace every `FROM public.hr_leave_balances` / `JOIN public.hr_leave_balances` with `public.v_hr_leave_balance_src`, keeping the aliases and every other line byte-identical. The view exposes `entitled`, `used`, `carried_forward`, `employee_id`, `leave_type_id`, `hr_academic_year_id`, `hr_organization_id` under the same names, so no column reference changes.

Save the result as `supabase/migrations/20260811180500_hr_leave_balance_analytics_view.sql` with this header, and apply it via `apply_migration` (name `hr_leave_balance_analytics_view`):

```sql
-- =====================================================================
-- hr_leave_balance_analytics reads the derived view
-- =====================================================================
-- Only the balance SOURCE changes: hr_leave_balances -> v_hr_leave_balance_src.
-- Every other line is the previous definition verbatim.
--
-- Effect on the numbers: staff_covered now equals active_staff for any org
-- with types and staff, because the view returns a row for every eligible
-- pair. `status` therefore reports 'complete' everywhere it is meaningful.
-- That field is retained in the payload rather than removed -- dropping a
-- key from the JSON would break the type and the component in the same
-- change as the data fix. The component stops RENDERING it in step 2;
-- slimming the payload is a separate follow-up.
--
-- CREATE OR REPLACE, not DROP + CREATE: dropping discards EXECUTE grants
-- and reverts them to PUBLIC.
```

- [ ] **Step 2: Verify coverage now reads complete**

```sql
SELECT
  jsonb_path_query_first(r, '$.totals.active_staff')    AS active_staff,
  jsonb_path_query_first(r, '$.totals.staff_covered')   AS staff_covered,
  jsonb_path_query_first(r, '$.totals.uncovered_staff') AS uncovered
FROM (SELECT public.hr_leave_balance_analytics(
  '2c5d0bb6-d279-4be0-ac2a-cca500e6a484'::uuid) AS r) t;
```

Expected: `uncovered = 0`, and `staff_covered` equal to `active_staff`. Before this change `uncovered` was non-zero for any institution with staff added since the last Generate run.

- [ ] **Step 3: Strip coverage rendering from the component**

In `leave-balance-analytics.tsx`:

1. Delete the import at line 64 and inline the one helper still needed, next to the other module-level constants:

```tsx
const nf = new Intl.NumberFormat('en-IN');
const fmt = (n: number) => nf.format(Math.round(n));
```

2. Remove the `blocked` / `notGenerated` derivations (around lines 129-131) and every block that renders them — the per-institution status badges (~line 405), the `STATUS_META` lookups (~lines 405, 506), and the alert component that lists blocked orgs (~line 506 onward).

3. **Keep** the utilisation card, the `coverage` percentage (line 157) — now structurally 100%, which is a useful "nothing is misconfigured" signal — the per-institution entitled/carried/used table, and the leave-type breakdown.

4. Replace the removed alert with a one-line explanation so the absent gap reporting is not read as a bug:

```tsx
<p className="text-xs text-muted-foreground">
  Every active team member resolves a balance for every leave type they are
  eligible for — there is nothing to generate. Per-person exceptions live in
  the Exceptions tab.
</p>
```

- [ ] **Step 4: Typecheck and verify**

Run `mcp__ide__getDiagnostics` on `leave-balance-analytics.tsx`.
Expected: no errors, and **no remaining reference to `./coverage-status`** — Task 12 deletes it.

```bash
grep -n "coverage-status\|STATUS_META\|BLOCKED" "app/(routes)/hr/admin/leave-balances/_components/leave-balance-analytics.tsx"
```

Expected: no output.

In the browser, open `/hr/admin/leave-balances` → Analytics.
Expected: utilisation renders, coverage shows 100%, no status badges, no console errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811180500_hr_leave_balance_analytics_view.sql "app/(routes)/hr/admin/leave-balances/_components/leave-balance-analytics.tsx"
git commit -m "fix(hr/leave): analytics reads the derived view, drops coverage UI

Coverage cannot be incomplete once balances derive, so the gap reporting
was showing shortfalls that no longer exist.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Exceptions and Year-archive tabs

**Files:**
- Create: `app/(routes)/hr/admin/leave-balances/_components/exceptions-tab.tsx`
- Create: `app/(routes)/hr/admin/leave-balances/_components/year-archive-tab.tsx`
- Modify: `app/(routes)/hr/admin/leave-balances/page.tsx`
- Delete: `app/(routes)/hr/admin/leave-balances/_components/generate-balances-form.tsx`
- Delete: `app/(routes)/hr/admin/leave-balances/_components/coverage-status.ts`
- Modify: `hooks/hr/use-hr-leave-types.ts` (remove `useGenerateBalances`, `useGenerateBalancesBulk`)

**Interfaces:**
- Consumes: Task 10's hooks, Task 11 (which must land first, or deleting `coverage-status.ts` breaks Analytics).
- Produces: `<ExceptionsTab year={string | null} />`, `<YearArchiveTab />`.

- [ ] **Step 1: Build the Exceptions tab**

Create `app/(routes)/hr/admin/leave-balances/_components/exceptions-tab.tsx`:

```tsx
'use client';

/**
 * Per-person entitlement exceptions — what replaced the Generate tab.
 *
 * Balances derive from the leave type now, so there is nothing to provision.
 * The only recurring act left is recording a genuine departure from policy,
 * which is real work rather than ceremony.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Pencil, Plus, Trash2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from '@/lib/utils';
import { useHRLeaveTypes } from '@/hooks/hr/use-hr-leave-types';
import {
  useLeaveOverrides, useCreateLeaveOverride, useUpdateLeaveOverride, useDeleteLeaveOverride,
} from '@/hooks/hr/use-leave-overrides';
import { StaffPicker } from '../../leave-types/_components/staff-picker';
import type { HRLeaveEntitlementOverrideWithNames } from '@/types/hr-leave-overrides';

export function ExceptionsTab({ year }: { year: string | null }) {
  const { data: overrides, isLoading } = useLeaveOverrides(
    year ? { hrAcademicYearId: year } : {}
  );
  const [editing, setEditing] = useState<HRLeaveEntitlementOverrideWithNames | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => overrides ?? [], [overrides]);

  if (isLoading) {
    return <Card><CardContent className="space-y-3 p-6">
      <Skeleton className="h-5 w-64" /><Skeleton className="h-40 w-full" />
    </CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="text-base">Entitlement exceptions</CardTitle>
            <CardDescription>
              Everyone gets the days set on their institution&apos;s leave type. A row here
              is an explicit departure from that, for one person, for one year.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAdding(true)} disabled={!year}>
            <Plus className="mr-2 h-4 w-4" />Add exception
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No exceptions. Everyone gets the days set on their institution&apos;s leave type.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {rows.map((o) => (
                <div key={o.id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{o.staff_name}</span>
                    {o.staff_code && (
                      <span className="ml-2 text-xs text-muted-foreground">{o.staff_code}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">{o.reason}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{o.leave_type_name}</span>
                  <span className="shrink-0 font-medium">
                    {o.entitled_days}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (policy: {o.default_entitled_days})
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(o)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteButton id={o.id} name={o.staff_name} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(adding || editing) && (
        <ExceptionDialog
          year={year}
          existing={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const mutation = useDeleteLeaveOverride();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      await mutation.mutateAsync(id);
      setConfirming(false);
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      setError(getErrorMessage(err));
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this exception?</DialogTitle>
            <DialogDescription>
              {name} returns to the days set on the leave type. Days already used are
              not affected.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="destructive" onClick={run} disabled={mutation.isPending}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExceptionDialog({
  year, existing, onClose,
}: {
  year: string | null;
  existing: HRLeaveEntitlementOverrideWithNames | null;
  onClose: () => void;
}) {
  const { data: leaveTypes } = useHRLeaveTypes({});
  const create = useCreateLeaveOverride();
  const update = useUpdateLeaveOverride();

  const [staffId, setStaffId] = useState(existing?.employee_id ?? '');
  const [leaveTypeId, setLeaveTypeId] = useState(existing?.leave_type_id ?? '');
  const [days, setDays] = useState(String(existing?.entitled_days ?? ''));
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [error, setError] = useState<string | null>(null);

  const selectedType = (leaveTypes ?? []).find((t) => t.id === leaveTypeId);

  // Mirrors the DB CHECKs (reason NOT NULL and non-blank, entitled_days >= 0)
  // so the rule is visible before a 23514 comes back.
  const canSave =
    reason.trim() !== '' &&
    days !== '' &&
    Number(days) >= 0 &&
    (existing ? true : !!staffId && !!leaveTypeId && !!year);

  const save = async () => {
    setError(null);
    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          patch: { entitled_days: Number(days), reason: reason.trim() },
        });
      } else {
        await create.mutateAsync({
          employee_id: staffId,
          leave_type_id: leaveTypeId,
          hr_academic_year_id: year!,
          // The leave type carries the org; deriving it here keeps the
          // override on the same tenant as the type it overrides.
          hr_organization_id: selectedType!.hr_organization_id,
          entitled_days: Number(days),
          reason: reason.trim(),
        });
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit exception' : 'Add exception'}</DialogTitle>
          <DialogDescription>
            Applies to this person, this leave type, this year only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!existing && (
            <>
              <div>
                <Label>Team member</Label>
                <StaffPicker value={staffId} onChange={setStaffId} />
              </div>
              <div>
                <Label htmlFor="lt">Leave type</Label>
                <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                  <SelectTrigger id="lt" className="mt-1">
                    <SelectValue placeholder="Select a leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(leaveTypes ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.leave_type_name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          policy: {t.default_entitled_days}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="days">Entitled days</Label>
            <Input id="days" type="number" min="0" step="0.5" className="mt-1"
              value={days} onChange={(e) => setDays(e.target.value)} />
            {selectedType && (
              <p className="mt-1 text-xs text-muted-foreground">
                Policy for this type is {selectedType.default_entitled_days} day(s).
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" className="mt-1" value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Maternity policy / joined mid-year, pro-rata / contract term" />
            <p className="mt-1 text-xs text-muted-foreground">
              Required. Whoever inherits this needs to know why it exists.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || create.isPending || update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Check `StaffPicker`'s actual prop names in `app/(routes)/hr/admin/leave-types/_components/staff-picker.tsx` before wiring it — adapt the two lines above if they differ rather than changing the picker.

- [ ] **Step 2: Build the Year-archive tab**

Create `app/(routes)/hr/admin/leave-balances/_components/year-archive-tab.tsx`:

```tsx
'use client';

/**
 * Freeze status per HR academic year.
 *
 * Archiving pins a year's numbers into the ledger so a later policy change
 * cannot move history. The daily cron does this once a year ends; the button
 * here exists only to close a year early.
 */

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/utils';
import { useHRAcademicYears } from '@/hooks/hr/use-hr-academic-years';
import { useFreezeYear } from '@/hooks/hr/use-leave-overrides';

type YearRow = {
  id: string; year_name: string; start_date: string; end_date: string;
  frozen_at: string | null;
};

export function YearArchiveTab() {
  const { data: years, isLoading } = useHRAcademicYears();
  const freeze = useFreezeYear();
  const [confirming, setConfirming] = useState<YearRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <Card><CardContent className="space-y-3 p-6">
      <Skeleton className="h-5 w-48" /><Skeleton className="h-32 w-full" />
    </CardContent></Card>;
  }

  const today = new Date().toISOString().slice(0, 10);

  const run = async () => {
    if (!confirming) return;
    setError(null);
    try {
      await freeze.mutateAsync(confirming.id);
      setConfirming(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Year archive</CardTitle>
          <CardDescription>
            An open year derives its entitlements from the current leave types, so a
            policy change reaches everyone. Archiving pins that year&apos;s numbers so
            later changes cannot move history. The daily job archives a year once it
            ends — this button is only for closing one early.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {((years ?? []) as YearRow[]).map((y) => {
              const ended = y.end_date < today;
              const archived = !!y.frozen_at;
              return (
                <div key={y.id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{y.year_name}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {y.start_date} → {y.end_date}
                  </span>
                  {archived ? (
                    <Badge variant="outline"
                      className="shrink-0 border-muted-foreground/30 bg-muted font-normal text-muted-foreground">
                      Archived {y.frozen_at!.slice(0, 10)}
                    </Badge>
                  ) : ended ? (
                    <Badge variant="outline"
                      className="shrink-0 border-amber-500/30 bg-amber-500/10 font-normal text-amber-700 dark:text-amber-400">
                      Ended, not archived
                    </Badge>
                  ) : (
                    <Badge variant="outline"
                      className="shrink-0 border-emerald-600/30 bg-emerald-600/10 font-normal text-emerald-700 dark:text-emerald-400">
                      Open
                    </Badge>
                  )}
                  {!archived && ended && (
                    <Button variant="outline" size="sm" onClick={() => setConfirming(y)}>
                      Freeze now
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {confirming?.year_name}?</DialogTitle>
            <DialogDescription>
              Every entitlement for that year is written into the ledger as it stands
              today, and later policy changes will no longer affect it. This cannot be
              undone from this screen.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button onClick={run} disabled={freeze.isPending}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Confirm `useHRAcademicYears`'s real export name and return shape in `hooks/hr/use-hr-academic-years.ts` before wiring, and that `frozen_at` is present on its rows — Task 2 added it to `types/supabase.ts`, but the hook may select an explicit column list that needs `frozen_at` adding.

- [ ] **Step 3: Retab the page**

In `app/(routes)/hr/admin/leave-balances/page.tsx`, replace the Generate tab. Update the header comment — the note about generating before staff apply is now wrong and would mislead the next reader:

```tsx
        <Tabs defaultValue="analytics" className="mt-4">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="archive">Year archive</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-4">
            <LeaveBalanceAnalytics year={year} />
          </TabsContent>

          <TabsContent value="exceptions" className="mt-4">
            <ExceptionsTab year={year} />
          </TabsContent>

          <TabsContent value="archive" className="mt-4">
            <YearArchiveTab />
          </TabsContent>
        </Tabs>
```

- [ ] **Step 4: Delete the dead generator UI**

```bash
git rm "app/(routes)/hr/admin/leave-balances/_components/generate-balances-form.tsx" \
       "app/(routes)/hr/admin/leave-balances/_components/coverage-status.ts"
```

Remove `useGenerateBalances` and `useGenerateBalancesBulk` from `hooks/hr/use-hr-leave-types.ts` (lines 82-136), and the now-unused `GenerateBalancesBulkResult` import path from anything that referenced them. Leave `HRLeaveTypeService.generateBalances*` in place — the RPCs still exist and removing the wrappers is a separate cleanup.

- [ ] **Step 5: Confirm nothing still imports the deleted files**

```bash
grep -rn "generate-balances-form\|coverage-status\|useGenerateBalances" app/ hooks/ lib/ --include=*.ts --include=*.tsx
```

Expected: **no output**. Any hit is a broken import that Turbopack will fail on.

- [ ] **Step 6: Typecheck and gates**

Run `mcp__ide__getDiagnostics` on the two new components and the modified page and hook file.

```bash
npm run check:sidebar && npm run check:reachability && npm run check:audit-coverage
```

Expected: pass. No route was added or removed, so these should be unaffected — a failure means something else moved. Note that `check:menus` fails at HEAD on a pre-existing unrelated issue (`/system` has no `MENU_PERMISSIONS` entry); that is not a regression.

- [ ] **Step 7: Verify in the browser**

As a user holding `hr.leave.balance.manage`, open `/hr/admin/leave-balances`:

1. **Exceptions** tab lists the 3 migrated overrides, each showing `7 (policy: 14)`.
2. Add an exception for a test staff member — confirm the submit button stays disabled with an empty reason.
3. After saving, open `/hr/leave/apply` **as that staff member** and confirm the new number is what the drawer offers.
4. Delete it; confirm the drawer returns to the policy number.
5. **Year archive** tab shows 2026-2027 as Open and the two past years as Archived.

- [ ] **Step 8: Commit**

```bash
git add -A "app/(routes)/hr/admin/leave-balances" hooks/hr/use-hr-leave-types.ts
git commit -m "feat(hr/leave): replace Generate tab with Exceptions and Year archive

The generator is gone -- balances derive. What is left is recording genuine
per-person exceptions and archiving closed years.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Blast-radius note on the leave-type form

**Files:**
- Modify: `app/(routes)/hr/admin/leave-types/_components/leave-type-form-dialog.tsx`

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Add the affected-staff count**

Next to the `default_entitled_days` field, render a live count of active staff at that leave type's institution:

```tsx
{/* D2: editing this number applies immediately to everyone at this
    institution for the open year. Showing the blast radius before save
    is the counterweight to that immediacy. */}
<p className="mt-1.5 text-xs text-muted-foreground">
  Applies immediately to {affectedCount} active team member
  {affectedCount === 1 ? '' : 's'} at this institution. Closed years are not affected.
</p>
```

Source `affectedCount` from a count query on `staff` filtered by the org's `institution_id` and `is_active`, gated on an `hr_organization_id` being selected. When editing an existing type, that id is already on the row.

- [ ] **Step 2: Typecheck**

Run `mcp__ide__getDiagnostics` on the modified file.
Expected: no new errors.

- [ ] **Step 3: Verify in the browser**

Open `/hr/admin/leave-types`, edit Casual Leave at JKKN College of Engineering and Technology.
Expected: the note reads *"Applies immediately to 91 active team members at this institution."*

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/hr/admin/leave-types/_components/leave-type-form-dialog.tsx"
git commit -m "feat(hr/leave): show blast radius when editing entitled days

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Final verification sweep

**Files:** none modified — this task only verifies.

- [ ] **Step 1: Confirm no write path still sets `entitled` directly**

```bash
grep -rn "entitled" lib/ app/ hooks/ --include=*.ts --include=*.tsx | grep -iv "entitled_days\|entitlement\|// \|\* " | grep -i "insert\|update\|upsert"
```

Expected: no output. The only writers of `hr_leave_balances.entitled` should now be `fn_hr_freeze_leave_year` and the approval trigger (which writes NULL).

- [ ] **Step 2: Confirm the database agrees**

```sql
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ILIKE '%hr_leave_balances%'
  AND (p.prosrc ILIKE '%INSERT INTO%' OR p.prosrc ILIKE '%UPDATE%')
ORDER BY 1;
```

Expected: `fn_hr_freeze_leave_year`, `generate_hr_leave_balances`, `generate_hr_leave_balances_bulk` (both now unreferenced by the app), `hr_trig_update_leave_balance`. Anything else is an unexpected writer — investigate.

- [ ] **Step 3: End-to-end acceptance, as a non-super-admin**

The whole change is judged on this:

1. Create a staff member at any institution.
2. Sign in as a plain `faculty` role (**not** super-admin).
3. `/hr/leave/apply` → dropdown populated, correct days, **no admin action in between**.
4. Submit a leave request for more days than available → refused with the *"Insufficient balance"* message (previously this check was skipped entirely for a staff member with no row).
5. Submit a valid request; approve it; confirm `used` increments and `entitled` stays NULL:

```sql
SELECT entitled, used, carried_forward FROM hr_leave_balances
 WHERE employee_id = '<the test staff id>'
   AND hr_academic_year_id = '2c5d0bb6-d279-4be0-ac2a-cca500e6a484';
```

Expected: `entitled` **NULL**, `used` = the approved days. Under the old trigger this row would have read `entitled = 0`, leaving that person permanently negative.

- [ ] **Step 4: Confirm the current year is still open**

```sql
SELECT year_name, frozen_at FROM hr_academic_years ORDER BY start_date DESC;
```

Expected: 2027-2028 and 2026-2027 both `frozen_at` NULL; 2025-2026 and 2024-2025 both set. If 2026-2027 is frozen, a Task 8 rollback did not take — unfreeze it and re-derive.

- [ ] **Step 5: Push and open a PR**

```bash
git push -u origin feat/hr-leave-derived-entitlement
gh pr create --title "feat(hr/leave): derived leave entitlement" --body "$(cat <<'EOF'
Removes the manual "Generate balances" ritual. Entitlement now derives from
the leave type at read time; only usage is stored; a cron freezes each year
once it ends.

## Why

- 315 staff joined in the last 90 days and could not apply for leave until
  someone re-ran Generate.
- 4,286 of 4,289 current-year rows were verbatim copies of six type
  defaults, so editing a leave type reached nobody.
- Only 253 of 752 staff have a cadre, and 183 got theirs *after* their staff
  row — so provisioning at creation time would have frozen wrong numbers.

## Also fixes

- `leave-service.ts` skipped the over-draw check entirely when no balance row
  existed (fail-open).
- The approval trigger inserted `entitled = 0`, creating permanently negative
  balances the generator could never repair.
- `analytics-service.ts` selected `allocated`, a column that does not exist on
  `hr_leave_balances`.

## Verification

No test suite in this repo. Verified by SQL post-conditions inside each
migration, `mcp__ide__getDiagnostics` per touched file, the `check:*` gates,
and a browser run as a plain faculty role confirming a newly created staff
member can apply with zero admin action.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollback

Each stage reverses independently, newest first:

| Stage | Reversal |
|---|---|
| D (UI) | `git revert` the UI commits. The RPCs and view are untouched |
| C (freeze) | Remove the `vercel.json` entry and `DROP FUNCTION fn_hr_freeze_leave_year(uuid)`. Frozen years stay frozen — correct |
| B (view) | Revert the service commits; `DROP VIEW v_hr_leave_balance, v_hr_leave_balance_src`. **Requires A's reversal too**, since balances are NULL |
| A (data) | `UPDATE hr_leave_balances b SET entitled = COALESCE((SELECT o.entitled_days FROM hr_leave_entitlement_overrides o WHERE …), t.default_entitled_days) FROM hr_leave_types t WHERE t.id = b.leave_type_id AND b.entitled IS NULL;` then restore `NOT NULL` |

`used` and `carried_forward` are never mutated at any point, so no recorded fact can be lost by reverting.
