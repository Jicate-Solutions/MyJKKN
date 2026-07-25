# Bill Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/billing/coverage` — a module that lists which learners have and have not had a bill generated for an academic year, visible only to Super Administrators, Chief Accountants and Accountant Assistants.

**Architecture:** Standard four-layer path (page → hook → service → RPC). The learner-vs-bill anti-join runs inside two `SECURITY DEFINER` Postgres functions because a client-side diff over 6,961 learners × 10,717 bills would hit the PostgREST 1,000-row cap and the `57014` statement timeout. Two prerequisite migrations repair `billing_student_bills.academic_year_id`, which is NULL on 4,971 rows and would otherwise produce ~1,044 false "not generated" results.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), TanStack Query v5, Shadcn UI, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-25-billing-bill-coverage-design.md`

**Branch:** `feat/billing-bill-coverage` (already created; the spec is committed there)

## Global Constraints

- **There is no test runner in this repo.** `npm test` does not exist. Never claim "tests pass". Verification is: SQL assertions for database work, `mcp__ide__getDiagnostics` for TypeScript, `npm run check:*` for gates, and manual browser exercise.
- **TypeScript strict mode is OFF** and `typescript.ignoreBuildErrors: true`. The build does not typecheck. Use `mcp__ide__getDiagnostics` per file (seconds) — never full `tsc` (3–4 min, OOMs).
- **Never hardcode role names in SQL.** Gate on permission keys via `user_has_permission('<key>')`.
- **Never branch on `isSuperAdmin` to decide institution scope.** Pass accessible-institution IDs; RLS and the RPC gate rows.
- **Every Supabase call must destructure and check `{ error }`.** Supabase errors are plain objects — `err instanceof Error` always falls through. Use `getErrorMessage()` from `@/lib/utils`.
- **Use `??` not `||` for institution IDs.** `institutionId || ''` coerces `undefined` → `''`, which flows through as a real UUID parameter and matches zero rows.
- **`RETURNS TABLE` output columns MUST be prefixed `out_`.** This repo has already hit `42702` (ambiguous `institution_id`) when a `RETURNS TABLE` column shared a name with a real table column.
- **Cast every `character varying` column to `::text` in `RETURNS TABLE`.** This repo has already hit `42804` (varchar ≠ text) from omitting this. Affected here: `institutions.name`, `academic_years.academic_year_name`, `departments.department_name`. Note `programs.program_name` is already `text`.
- **Commit the real SQL body to `supabase/migrations/`** when applying via the Supabase MCP tool — never a `SELECT 1;` placeholder.
- **Mirror applied migrations into `supabase/setup/`** reference files (`02_functions.sql`, `04_triggers.sql`).
- Migration filename format: `YYYYMMDD_name.sql` in `supabase/migrations/`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260725_billing_coverage_permissions.sql` | New permission keys granted to the two accountant roles |
| `supabase/migrations/20260725_billing_bills_backfill_academic_year.sql` | One-time backfill of 4,905 unstamped bills |
| `supabase/migrations/20260725_billing_bills_default_academic_year_trigger.sql` | `BEFORE INSERT` trigger so new bills are always stamped |
| `supabase/migrations/20260725_billing_coverage_rpcs.sql` | The two `SECURITY DEFINER` coverage functions |
| `types/billing-coverage.ts` | Row, filter and summary types — no logic |
| `lib/services/billing/coverage/bill-coverage-service.ts` | Thin marshalling layer over the two RPCs |
| `hooks/billing/use-bill-coverage.ts` | React Query hooks + local query keys |
| `app/(routes)/billing/coverage/page.tsx` | Route shell + `PermissionGuard` |
| `app/(routes)/billing/coverage/_components/coverage-client.tsx` | Owns filter state; composes the three components below |
| `app/(routes)/billing/coverage/_components/coverage-summary-cards.tsx` | KPI cards |
| `app/(routes)/billing/coverage/_components/coverage-filter-bar.tsx` | Filter controls |
| `app/(routes)/billing/coverage/_components/coverage-table.tsx` | Learner table + pagination |
| `app/(routes)/billing/coverage/_components/coverage-export.ts` | Excel export of the gap list |
| `lib/constants/permissions.ts` | Declare the two new keys (modify) |
| `lib/sidebarMenuLink.ts` | Route→key mapping + sidebar entry (modify) |
| `lib/services/billing/onboarding/onboarding-service.ts` | Set `academic_year_id` explicitly (modify) |

---

## Task 1: Permission keys and role grants

Foundation — the RPCs in Task 4 call `user_has_permission('billing.coverage.view')`, which returns false for everyone until the key is granted. Declaring a key in `permissions.ts` does nothing on its own.

**Files:**
- Modify: `lib/constants/permissions.ts:663`
- Create: `supabase/migrations/20260725_billing_coverage_permissions.sql`

**Interfaces:**
- Consumes: nothing
- Produces: permission keys `billing.coverage.view` and `billing.coverage.export`, granted to roles `Chief Accountant` and `Accountant Assistant`

- [ ] **Step 1: Record the "before" state**

Run via the Supabase MCP `execute_sql` tool:

```sql
SELECT role_name, permissions ? 'billing.coverage.view' AS has_key
FROM custom_roles WHERE role_name IN ('Chief Accountant','Accountant Assistant');
```

Expected: both rows `has_key = false`. This is the assertion that Step 4 flips.

- [ ] **Step 2: Declare the keys in the permission catalog**

In `lib/constants/permissions.ts`, inside the `Billing Management` category, immediately after the `billing.onboarding.approve` entry (line 663), add:

```typescript
      { key: 'billing.coverage.view', label: 'View Bill Coverage' },
      { key: 'billing.coverage.export', label: 'Export Bill Coverage' },
```

Keys within `PERMISSION_CATEGORIES` must be unique across the whole file — these two are new, so no conflict.

- [ ] **Step 3: Write the grant migration**

Create `supabase/migrations/20260725_billing_coverage_permissions.sql`:

```sql
-- Bill Coverage module: grant the two new permission keys to the accountant
-- roles. Super Administrator is NOT listed — it bypasses permission checks via
-- isSuperAdmin, and adding keys there would be misleading.
--
-- custom_roles.permissions is a JSONB object of { "<key>": true }.

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
      'billing.coverage.view', true,
      'billing.coverage.export', true
    ),
    updated_at = now()
WHERE role_name IN ('Chief Accountant', 'Accountant Assistant');
```

- [ ] **Step 4: Apply the migration and verify the grant landed**

Apply with the Supabase MCP `apply_migration` tool (name: `billing_coverage_permissions`, the SQL body above — not a placeholder). Then run:

```sql
SELECT role_name,
       permissions ? 'billing.coverage.view'   AS has_view,
       permissions ? 'billing.coverage.export' AS has_export
FROM custom_roles WHERE role_name IN ('Chief Accountant','Accountant Assistant');
```

Expected: 2 rows, all four boolean columns `true`.

- [ ] **Step 5: Run the permission audit gate**

Run: `npm run check:audit-coverage`
Expected: exits 0. Every module must appear in the permissions audit; a new key in a category that already exists satisfies this.

- [ ] **Step 6: Check diagnostics on the modified file**

Use `mcp__ide__getDiagnostics` on `lib/constants/permissions.ts`.
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add lib/constants/permissions.ts supabase/migrations/20260725_billing_coverage_permissions.sql
git commit -m "feat(billing): add billing.coverage permission keys and grant to accountant roles"
```

---

## Task 2: Backfill the missing academic year on existing bills

4,971 bills have `academic_year_id IS NULL`. Without this, the coverage report produces ~1,044 false "not generated" rows, and an accountant acting on them would create duplicate bills.

**Files:**
- Create: `supabase/migrations/20260725_billing_bills_backfill_academic_year.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `billing_student_bills.academic_year_id` populated on 4,905 previously-NULL rows

- [ ] **Step 1: Capture the "before" counts**

```sql
SELECT count(*) AS null_before,
       count(*) FILTER (WHERE lp.academic_year_id IS NULL) AS learner_has_no_ay,
       count(*) FILTER (WHERE lp.academic_year_id IS NOT NULL
                          AND ay.institution_id IS DISTINCT FROM b.institution_id) AS cross_institution
FROM billing_student_bills b
JOIN learners_profiles lp ON lp.id = b.student_id
LEFT JOIN academic_years ay ON ay.id = lp.academic_year_id
WHERE b.academic_year_id IS NULL;
```

Expected: `null_before = 4971`, `learner_has_no_ay = 55`, `cross_institution = 11`. Write these three numbers down — Step 4 asserts against them.

If the numbers differ from the above, **stop and report**. The data moved since the design was written and the expected post-state must be recomputed rather than assumed.

- [ ] **Step 2: Write the backfill migration**

Create `supabase/migrations/20260725_billing_bills_backfill_academic_year.sql`:

```sql
-- One-time backfill of billing_student_bills.academic_year_id.
--
-- WHY: the bill-creation paths never set this column, so 4,971 of 8,503
-- 'academic' bills carried no academic year. The Bill Coverage report matches a
-- learner's academic year against the bill's, so unstamped bills read as "no
-- bill generated" and would prompt accountants to regenerate bills that already
-- exist.
--
-- DERIVATION: the learner's own academic year, accepted only when that academic
-- year belongs to the same institution as the bill. Rows failing that guard are
-- deliberately left NULL rather than guessed:
--   * 55 rows - learner has no academic year at all
--   * 11 rows - learner's academic year belongs to a different institution
-- Both sets are reported by the verification query in the plan and must be
-- resolved by hand, not by widening this UPDATE.

UPDATE public.billing_student_bills b
SET academic_year_id = lp.academic_year_id,
    updated_at = now()
FROM public.learners_profiles lp
JOIN public.academic_years ay ON ay.id = lp.academic_year_id
WHERE b.student_id = lp.id
  AND b.academic_year_id IS NULL
  AND ay.institution_id = b.institution_id;
```

- [ ] **Step 3: Apply the migration**

Apply with the Supabase MCP `apply_migration` tool (name: `billing_bills_backfill_academic_year`, the full SQL body above).

- [ ] **Step 4: Verify the exact expected post-state**

```sql
SELECT count(*) AS null_after FROM billing_student_bills WHERE academic_year_id IS NULL;
```

Expected: `null_after = 66` (the 55 + 11 deliberately skipped). Since `null_before` was 4971, this means **4,905 rows were stamped**.

If `null_after` is anything other than 66, stop and report — do not proceed to Task 3.

- [ ] **Step 5: Verify no bill was stamped with another institution's year**

The table already contained **one** cross-institution row before this migration
(bill `7fd9d234-2ba2-47d6-86ef-42070515a563`, created 2026-06-21 — an Engineering
bill carrying an Arts & Science academic year, written by some other path). So
the assertion must be **delta-based**, not absolute: an absolute "expected 0"
fails regardless of how correct the backfill is.

```sql
SELECT count(*) AS leaks_created_by_backfill
FROM billing_student_bills b
JOIN academic_years ay ON ay.id = b.academic_year_id
WHERE ay.institution_id <> b.institution_id
  AND b.updated_at > now() - interval '10 minutes';
```

Expected: `0` — no row the backfill touched is cross-institution. A non-zero
result means the guard failed and the backfill must be reverted.

> **Follow-up, not part of this work:** the one pre-existing bad row is a real
> data defect and should be corrected separately. It is not in this plan's scope
> and must not be silently rewritten here.

- [ ] **Step 6: Confirm the false-positive reduction**

```sql
WITH scope AS (
  SELECT lp.id, lp.institution_id, lp.academic_year_id
  FROM learners_profiles lp
  WHERE lp.lifecycle_status IN ('active','reserved','admitted','account')
), billing_inst AS (SELECT DISTINCT institution_id FROM billing_student_bills)
SELECT count(*) FILTER (WHERE NOT EXISTS (
  SELECT 1 FROM billing_student_bills b
  WHERE b.student_id = s.id AND b.academic_year_id = s.academic_year_id
    AND COALESCE(b.status,'') NOT IN ('cancelled','superseded'))) AS not_generated
FROM scope s WHERE s.institution_id IN (SELECT institution_id FROM billing_inst);
```

Expected: approximately **1,632** (was 2,676 before the backfill). Small drift is fine — bills are created daily. A result still near 2,676 means the backfill did not take effect.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260725_billing_bills_backfill_academic_year.sql
git commit -m "fix(billing): backfill academic_year_id on 4905 unstamped student bills"
```

---

## Task 3: Stop new bills from being created unstamped

The backfill is a point-in-time repair. Three separate code paths insert into `billing_student_bills` and none of them reliably sets `academic_year_id`, so unstamped rows accumulate at roughly 300–700/month. A `BEFORE INSERT` trigger holds regardless of which path inserts, including paths written later.

**Files:**
- Create: `supabase/migrations/20260725_billing_bills_default_academic_year_trigger.sql`
- Modify: `lib/services/billing/onboarding/onboarding-service.ts`

**Interfaces:**
- Consumes: nothing
- Produces: trigger `trg_billing_bill_default_academic_year` on `billing_student_bills`; any INSERT omitting `academic_year_id` gets the learner's academic year

- [ ] **Step 1: Write the trigger migration**

Create `supabase/migrations/20260725_billing_bills_default_academic_year_trigger.sql`:

```sql
-- Safety net for billing_student_bills.academic_year_id.
--
-- Three code paths insert bills (student-bill-service.ts, onboarding-service.ts,
-- and the bulk import route) and none set academic_year_id reliably, which left
-- 58.5% of academic bills unstamped over three months. The Bill Coverage report
-- reads this column, so an unstamped bill reads as "not generated".
--
-- This fills the column ONLY when the caller left it NULL. An explicitly
-- supplied year - e.g. an arrear bill raised against a past year - is never
-- overwritten. The academic year must belong to the same institution as the
-- bill, so a cross-institution learner record cannot leak a foreign year in.
--
-- SECURITY DEFINER: the trigger reads learners_profiles, which is RLS-gated.
-- Without it the lookup returns nothing for callers who cannot read that
-- learner's row, and the column would silently stay NULL.

CREATE OR REPLACE FUNCTION public.fn_billing_bill_default_academic_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.academic_year_id IS NULL THEN
    SELECT lp.academic_year_id
      INTO NEW.academic_year_id
    FROM public.learners_profiles lp
    JOIN public.academic_years ay ON ay.id = lp.academic_year_id
    WHERE lp.id = NEW.student_id
      AND ay.institution_id = NEW.institution_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_bill_default_academic_year
  ON public.billing_student_bills;

CREATE TRIGGER trg_billing_bill_default_academic_year
BEFORE INSERT ON public.billing_student_bills
FOR EACH ROW
EXECUTE FUNCTION public.fn_billing_bill_default_academic_year();
```

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP `apply_migration` tool (name: `billing_bills_default_academic_year_trigger`, the full SQL body above).

- [ ] **Step 3: Prove the trigger fills a NULL — inside a rolled-back transaction**

This writes a real bill row, so it MUST be wrapped in a transaction that rolls back. Run as one statement:

```sql
BEGIN;
WITH victim AS (
  SELECT lp.id AS student_id, lp.institution_id, lp.academic_year_id
  FROM learners_profiles lp
  JOIN academic_years ay ON ay.id = lp.academic_year_id
  WHERE lp.academic_year_id IS NOT NULL AND ay.institution_id = lp.institution_id
  LIMIT 1
), ins AS (
  INSERT INTO billing_student_bills
    (student_id, institution_id, due_date, unit_amount, total_amount,
     final_amount, fee_source, refunded_amount)
  SELECT student_id, institution_id, CURRENT_DATE, 1, 1, 1, 'ad_hoc', 0 FROM victim
  RETURNING student_id, academic_year_id
)
SELECT ins.academic_year_id AS stamped,
       victim.academic_year_id AS expected,
       ins.academic_year_id IS NOT DISTINCT FROM victim.academic_year_id AS trigger_works
FROM ins JOIN victim ON victim.student_id = ins.student_id;
ROLLBACK;
```

Expected: one row with `trigger_works = true` and `stamped` equal to `expected`.

- [ ] **Step 4: Prove the trigger does NOT overwrite an explicit year**

```sql
BEGIN;
WITH victim AS (
  SELECT lp.id AS student_id, lp.institution_id
  FROM learners_profiles lp
  WHERE lp.academic_year_id IS NOT NULL LIMIT 1
), other_year AS (
  SELECT ay.id FROM academic_years ay
  WHERE ay.id <> (SELECT academic_year_id FROM learners_profiles
                  WHERE id = (SELECT student_id FROM victim))
  LIMIT 1
), ins AS (
  INSERT INTO billing_student_bills
    (student_id, institution_id, academic_year_id, due_date, unit_amount,
     total_amount, final_amount, fee_source, refunded_amount)
  SELECT victim.student_id, victim.institution_id, other_year.id,
         CURRENT_DATE, 1, 1, 1, 'ad_hoc', 0
  FROM victim, other_year
  RETURNING academic_year_id
)
SELECT ins.academic_year_id = other_year.id AS explicit_year_preserved
FROM ins, other_year;
ROLLBACK;
```

Expected: `explicit_year_preserved = true`.

- [ ] **Step 5: Set the year explicitly in the onboarding service**

The trigger is the guarantee; this makes the intent readable in code.
`createBillsFromProfile` builds bills in **two** places — the `fee_items` loop and
the legacy-columns fallback — and both must be edited. The method already loads
the learner with `select('*')` (line 357), so `learner.academic_year_id` is in
scope; no extra query is needed.

In `lib/services/billing/onboarding/onboarding-service.ts` at **line 431**, in the
`fee_items` branch, add the `academic_year_id` line:

```typescript
          billsToInsert.push({
            student_id: learnerId,
            institution_id: learner.institution_id,
            academic_year_id: learner.academic_year_id ?? null,
            item_category_id: item.category_id || null,
```

And at **line 455**, in the legacy fallback branch:

```typescript
            billsToInsert.push({
              student_id: learnerId,
              institution_id: learner.institution_id,
              academic_year_id: learner.academic_year_id ?? null,
              item_category_id: categoryId,
```

Use `?? null`, never `|| null` — `||` would coerce a legitimately empty value
into a different type and this repo has been bitten by that pattern before.

> **Note for the implementer:** a **fourth** insert path exists that this step
> cannot reach — the `admission_account_transition_with_bills` SECURITY DEFINER
> RPC creates bills in SQL (see the comment at `onboarding-service.ts:495`).
> That path is covered only by the trigger from Steps 1–2, which is the reason
> the trigger is not optional.

- [ ] **Step 6: Check diagnostics**

Use `mcp__ide__getDiagnostics` on `lib/services/billing/onboarding/onboarding-service.ts`.
Expected: no new errors.

- [ ] **Step 7: Mirror the trigger into the setup reference**

Append the `fn_billing_bill_default_academic_year` function body to `supabase/setup/02_functions.sql` and the `CREATE TRIGGER` statement to `supabase/setup/04_triggers.sql`, matching the surrounding formatting.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260725_billing_bills_default_academic_year_trigger.sql \
        supabase/setup/02_functions.sql supabase/setup/04_triggers.sql \
        lib/services/billing/onboarding/onboarding-service.ts
git commit -m "fix(billing): stamp academic_year_id on every new bill via BEFORE INSERT trigger"
```

---

## Task 4: Types module

Defined before the RPCs so the SQL `RETURNS TABLE` and the TypeScript row type are authored against one shared shape.

**Files:**
- Create: `types/billing-coverage.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `BillCoverageFilters`, `BillCoverageRow`, `BillCoverageSummary`, `BillCoverageInstitutionRow`, `CoverageState`, `LEARNER_SCOPE_DEFAULT`

- [ ] **Step 1: Create the types file**

```typescript
// Types for the Bill Coverage module (/billing/coverage).
//
// Row/summary shapes mirror the RETURNS TABLE and jsonb payloads of
// get_billing_coverage_learners and get_billing_coverage_summary. The RPC
// prefixes its output columns with out_ to avoid the 42702 ambiguous-column
// error this repo has hit before; the service strips that prefix, so the types
// below are the clean post-strip shape.

/** A learner is 'cannot_evaluate' when no academic year can be resolved for
 *  them — reported separately so they are never miscounted as a real gap. */
export type CoverageState = 'generated' | 'not_generated' | 'cannot_evaluate';

/** The lifecycle statuses treated as "should have a bill". */
export const LEARNER_SCOPE_DEFAULT = [
  'active',
  'reserved',
  'admitted',
  'account'
] as const;

export interface BillCoverageFilters {
  /** Target academic year. Null means "each learner's own current year". */
  academic_year_id?: string | null;
  institution_ids?: string[] | null;
  lifecycle_statuses?: string[] | null;
  /** When set, coverage means "a live bill in this category". */
  billing_category_id?: string | null;
  coverage_state?: CoverageState | 'all';
  /** Institutions with zero bills in ANY year are hidden unless this is true. */
  include_non_billing_institutions?: boolean;
  search?: string | null;
  page?: number;
  page_size?: number;
}

export interface BillCoverageRow {
  learner_id: string;
  roll_number: string | null;
  register_number: string | null;
  full_name: string;
  lifecycle_status: string;
  institution_id: string;
  institution_name: string | null;
  program_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  bill_count: number;
  total_billed: number;
  coverage_state: CoverageState;
  /** Window-function total across all pages; identical on every row. */
  total_count: number;
}

export interface BillCoverageInstitutionRow {
  institution_id: string;
  institution_name: string;
  in_scope: number;
  generated: number;
  not_generated: number;
}

export interface BillCoverageSummary {
  in_scope: number;
  generated: number;
  not_generated: number;
  cannot_evaluate: number;
  /** Institutions hidden because they have never generated a bill. */
  excluded_institutions: number;
  excluded_learners: number;
  by_institution: BillCoverageInstitutionRow[];
}
```

- [ ] **Step 2: Check diagnostics**

Use `mcp__ide__getDiagnostics` on `types/billing-coverage.ts`.
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/billing-coverage.ts
git commit -m "feat(billing): add Bill Coverage types"
```

---

## Task 5: The two coverage RPCs

**Files:**
- Create: `supabase/migrations/20260725_billing_coverage_rpcs.sql`
- Modify: `supabase/setup/02_functions.sql`

**Interfaces:**
- Consumes: permission key `billing.coverage.view` (Task 1); stamped `academic_year_id` (Tasks 2–3); the shape in `types/billing-coverage.ts` (Task 4)
- Produces: `get_billing_coverage_summary(...) → jsonb` and `get_billing_coverage_learners(...) → TABLE(out_* ...)`

- [ ] **Step 1: Write the RPC migration**

Create `supabase/migrations/20260725_billing_coverage_rpcs.sql`:

```sql
-- Bill Coverage RPCs.
--
-- The anti-join runs here rather than in the client because the client would
-- need every learner and every bill: 6,961 x 10,717 rows, past both the
-- PostgREST 1,000-row cap and the statement timeout that has produced 57014 on
-- unfiltered billing lists before.
--
-- SECURITY DEFINER bypasses RLS and these functions are callable by any
-- authenticated user, so each one self-authorizes on billing.coverage.view
-- before touching a row. Institution scope always comes from
-- get_user_accessible_institutions(auth.uid()) intersected with the caller's
-- filter - never from a super-admin branch.
--
-- Output columns are prefixed out_ to avoid 42702 (ambiguous column) and every
-- varchar is cast ::text to avoid 42804 (varchar <> text in RETURNS TABLE).

-- ---------------------------------------------------------------------------
-- Helper: the learner population in scope, with its live bill count.
-- Inlined into both functions rather than shared, because a shared view would
-- need its own RLS story; these two are the only consumers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_billing_coverage_learners(
  p_academic_year_id uuid DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL,
  p_lifecycle_statuses text[] DEFAULT ARRAY['active','reserved','admitted','account'],
  p_billing_category_id uuid DEFAULT NULL,
  p_coverage_state text DEFAULT 'not_generated',
  p_include_non_billing_institutions boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE (
  out_learner_id uuid,
  out_roll_number text,
  out_register_number text,
  out_full_name text,
  out_lifecycle_status text,
  out_institution_id uuid,
  out_institution_name text,
  out_program_name text,
  out_academic_year_id uuid,
  out_academic_year_name text,
  out_bill_count integer,
  out_total_billed numeric,
  out_coverage_state text,
  out_total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst   uuid[];
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0)
                      * LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
BEGIN
  IF NOT public.user_has_permission('billing.coverage.view') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH billing_inst AS (
    -- ALL-TIME test, deliberately not scoped to p_academic_year_id. An
    -- institution that billed last year and has generated nothing this year is
    -- the case this report exists to catch; scoping here would hide it.
    SELECT DISTINCT b.institution_id AS inst_id
    FROM public.billing_student_bills b
  ),
  scope AS (
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.program_id,
           lp.lifecycle_status, lp.first_name, lp.last_name,
           lp.roll_number, lp.register_number
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_include_non_billing_institutions
           OR lp.institution_id IN (SELECT inst_id FROM billing_inst))
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      AND (
        p_search IS NULL OR p_search = ''
        OR lp.roll_number ILIKE '%' || p_search || '%'
        OR lp.register_number ILIKE '%' || p_search || '%'
        OR (COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,''))
             ILIKE '%' || p_search || '%'
      )
  ),
  agg AS (
    SELECT s.id AS learner_id,
           COUNT(b.id)::integer AS bill_count,
           COALESCE(SUM(b.final_amount), 0)::numeric AS total_billed
    FROM scope s
    LEFT JOIN public.billing_student_bills b
           ON b.student_id = s.id
          -- A cancelled or superseded bill is not coverage: no live bill exists.
          AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
          AND b.academic_year_id = COALESCE(p_academic_year_id, s.academic_year_id)
          AND (p_billing_category_id IS NULL
               OR b.item_category_id = p_billing_category_id)
    GROUP BY s.id
  ),
  final AS (
    SELECT s.id AS learner_id,
           s.roll_number::text        AS roll_number,
           s.register_number::text    AS register_number,
           TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))
                                      AS full_name,
           s.lifecycle_status::text   AS lifecycle_status,
           s.institution_id           AS institution_id,
           i.name::text               AS institution_name,
           p.program_name             AS program_name,
           s.academic_year_id         AS academic_year_id,
           ay.academic_year_name::text AS academic_year_name,
           a.bill_count               AS bill_count,
           a.total_billed             AS total_billed,
           CASE
             WHEN COALESCE(p_academic_year_id, s.academic_year_id) IS NULL
               THEN 'cannot_evaluate'
             WHEN a.bill_count > 0 THEN 'generated'
             ELSE 'not_generated'
           END                        AS coverage_state
    FROM scope s
    JOIN agg a               ON a.learner_id = s.id
    LEFT JOIN public.institutions   i  ON i.id  = s.institution_id
    LEFT JOIN public.programs       p  ON p.id  = s.program_id
    LEFT JOIN public.academic_years ay ON ay.id = s.academic_year_id
  ),
  filtered AS (
    SELECT * FROM final f
    WHERE p_coverage_state = 'all' OR f.coverage_state = p_coverage_state
  )
  SELECT f.learner_id, f.roll_number, f.register_number, f.full_name,
         f.lifecycle_status, f.institution_id, f.institution_name,
         f.program_name, f.academic_year_id, f.academic_year_name,
         f.bill_count, f.total_billed, f.coverage_state,
         COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY f.institution_name NULLS LAST, f.roll_number NULLS LAST, f.full_name
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_learners(
  uuid, uuid[], text[], uuid, text, boolean, text, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_billing_coverage_summary(
  p_academic_year_id uuid DEFAULT NULL,
  p_institution_ids uuid[] DEFAULT NULL,
  p_lifecycle_statuses text[] DEFAULT ARRAY['active','reserved','admitted','account'],
  p_billing_category_id uuid DEFAULT NULL,
  p_include_non_billing_institutions boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst   uuid[];
  v_result jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.coverage.view') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object(
      'in_scope', 0, 'generated', 0, 'not_generated', 0, 'cannot_evaluate', 0,
      'excluded_institutions', 0, 'excluded_learners', 0,
      'by_institution', '[]'::jsonb);
  END IF;

  WITH billing_inst AS (
    SELECT DISTINCT b.institution_id AS inst_id FROM public.billing_student_bills b
  ),
  all_scope AS (
    SELECT lp.id, lp.institution_id, lp.academic_year_id,
           (lp.institution_id IN (SELECT inst_id FROM billing_inst)) AS is_billing_inst
    FROM public.learners_profiles lp
    WHERE lp.institution_id = ANY(v_inst)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
  ),
  scope AS (
    SELECT * FROM all_scope
    WHERE p_include_non_billing_institutions OR is_billing_inst
  ),
  agg AS (
    SELECT s.id, s.institution_id, s.academic_year_id,
           COUNT(b.id)::integer AS bill_count
    FROM scope s
    LEFT JOIN public.billing_student_bills b
           ON b.student_id = s.id
          AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
          AND b.academic_year_id = COALESCE(p_academic_year_id, s.academic_year_id)
          AND (p_billing_category_id IS NULL
               OR b.item_category_id = p_billing_category_id)
    GROUP BY s.id, s.institution_id, s.academic_year_id
  ),
  stated AS (
    SELECT a.institution_id,
           CASE
             WHEN COALESCE(p_academic_year_id, a.academic_year_id) IS NULL
               THEN 'cannot_evaluate'
             WHEN a.bill_count > 0 THEN 'generated'
             ELSE 'not_generated'
           END AS coverage_state
    FROM agg a
  )
  SELECT jsonb_build_object(
    'in_scope',        (SELECT COUNT(*) FROM stated),
    'generated',       (SELECT COUNT(*) FROM stated WHERE coverage_state = 'generated'),
    'not_generated',   (SELECT COUNT(*) FROM stated WHERE coverage_state = 'not_generated'),
    'cannot_evaluate', (SELECT COUNT(*) FROM stated WHERE coverage_state = 'cannot_evaluate'),
    'excluded_institutions',
      (SELECT COUNT(DISTINCT institution_id) FROM all_scope WHERE NOT is_billing_inst),
    'excluded_learners',
      (SELECT COUNT(*) FROM all_scope WHERE NOT is_billing_inst),
    'by_institution', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'institution_name')
      FROM (
        SELECT jsonb_build_object(
                 'institution_id',   st.institution_id,
                 'institution_name', COALESCE(i.name::text, 'Unknown'),
                 'in_scope',         COUNT(*),
                 'generated',        COUNT(*) FILTER (WHERE st.coverage_state = 'generated'),
                 'not_generated',    COUNT(*) FILTER (WHERE st.coverage_state = 'not_generated')
               ) AS x
        FROM stated st
        LEFT JOIN public.institutions i ON i.id = st.institution_id
        GROUP BY st.institution_id, i.name
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_billing_coverage_summary(
  uuid, uuid[], text[], uuid, boolean) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP `apply_migration` tool (name: `billing_coverage_rpcs`, the full SQL body above).

- [ ] **Step 3: Verify the summary RPC returns the expected shape and magnitude**

The MCP SQL tool runs as a privileged role, so `user_has_permission` may not resolve the same way as a real session. Impersonate an authenticated caller by setting the JWT claims:

```sql
SET LOCAL ROLE authenticated;
SELECT public.get_billing_coverage_summary(NULL, NULL,
  ARRAY['active','reserved','admitted','account'], NULL, false);
```

If the permission check blocks it, run it as the owner instead to validate the SQL itself, and defer the permission behaviour to Step 5:

```sql
SELECT public.get_billing_coverage_summary(NULL, NULL,
  ARRAY['active','reserved','admitted','account'], NULL, false);
```

Expected: a jsonb object where `not_generated` is approximately **1,632**, `in_scope` approximately **4,089**, and `by_institution` is a non-empty array.

- [ ] **Step 4: Verify the learners RPC paginates and totals correctly**

```sql
SELECT out_coverage_state, out_total_count, COUNT(*) AS rows_on_page
FROM public.get_billing_coverage_learners(
  NULL, NULL, ARRAY['active','reserved','admitted','account'],
  NULL, 'not_generated', false, NULL, 1, 50)
GROUP BY 1, 2;
```

Expected: one row, `out_coverage_state = 'not_generated'`, `rows_on_page = 50`, and `out_total_count` matching the `not_generated` figure from Step 3.

- [ ] **Step 5: Verify the permission gate actually denies**

```sql
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000000',
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.get_billing_coverage_summary();
```

Expected: `ERROR: permission denied: billing.coverage.view` with SQLSTATE `42501`. A result set instead of an error means the self-authorization is not working and **must be fixed before proceeding** — these functions bypass RLS.

- [ ] **Step 6: Verify the all-time exclusion does not hide a lapsed institution**

```sql
SELECT (x->>'institution_name') AS institution, (x->>'not_generated') AS not_generated
FROM jsonb_array_elements(
  public.get_billing_coverage_summary(
    (SELECT id FROM academic_years WHERE academic_year_name='2026-2027' LIMIT 1),
    NULL, ARRAY['active','reserved','admitted','account'], NULL, false
  )->'by_institution') AS x
WHERE x->>'institution_name' ILIKE '%Education%';
```

Expected: JKKN College of Education is **present** (it has 22 bills all-time but 0 for 2026-2027). Its absence means the exclusion was scoped to the selected year instead of all-time — the bug the spec self-review caught.

- [ ] **Step 7: Mirror into the setup reference**

Append both function bodies to `supabase/setup/02_functions.sql`, matching surrounding formatting.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260725_billing_coverage_rpcs.sql supabase/setup/02_functions.sql
git commit -m "feat(billing): add bill coverage summary and learners RPCs"
```

---

## Task 6: Service and hook

**Files:**
- Create: `lib/services/billing/coverage/bill-coverage-service.ts`
- Create: `hooks/billing/use-bill-coverage.ts`

**Interfaces:**
- Consumes: `types/billing-coverage.ts` (Task 4); RPCs from Task 5
- Produces: `BillCoverageService.getSummary(filters)`, `BillCoverageService.getLearners(filters)`, `useBillCoverageSummary(filters)`, `useBillCoverageLearners(filters)`, `billCoverageKeys`

- [ ] **Step 1: Create the service**

```typescript
import { BaseService } from '@/lib/services/base-service';
import type {
  BillCoverageFilters,
  BillCoverageRow,
  BillCoverageSummary
} from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT } from '@/types/billing-coverage';

// ============================================================================
// BILL COVERAGE SERVICE
// ============================================================================
// Thin wrapper over two SECURITY DEFINER RPCs. All scoping, permission gating
// and the learner-vs-bill anti-join happen in Postgres; this layer only
// marshals params and strips the RPC's out_ column prefix.
//
// The out_ prefix exists because a RETURNS TABLE column named institution_id
// collides with the real column and raises 42702 in this schema.
// ============================================================================

interface RawCoverageRow {
  out_learner_id: string;
  out_roll_number: string | null;
  out_register_number: string | null;
  out_full_name: string;
  out_lifecycle_status: string;
  out_institution_id: string;
  out_institution_name: string | null;
  out_program_name: string | null;
  out_academic_year_id: string | null;
  out_academic_year_name: string | null;
  out_bill_count: number;
  out_total_billed: number | string;
  out_coverage_state: string;
  out_total_count: number | string;
}

export class BillCoverageService extends BaseService {
  /** Empty selections become null so the RPC falls back to the caller's full
   *  accessible scope. Uses ?? rather than || — '' is a meaningful "no search"
   *  but undefined must not become a real parameter value. */
  private static baseParams(filters: BillCoverageFilters) {
    return {
      p_academic_year_id: filters.academic_year_id ?? null,
      p_institution_ids:
        filters.institution_ids && filters.institution_ids.length > 0
          ? filters.institution_ids
          : null,
      p_lifecycle_statuses:
        filters.lifecycle_statuses && filters.lifecycle_statuses.length > 0
          ? filters.lifecycle_statuses
          : [...LEARNER_SCOPE_DEFAULT],
      p_billing_category_id: filters.billing_category_id ?? null,
      p_include_non_billing_institutions:
        filters.include_non_billing_institutions ?? false
    };
  }

  static getSummary(filters: BillCoverageFilters = {}) {
    return this.executeDashboardRPC<BillCoverageSummary>(
      'get_billing_coverage_summary',
      this.baseParams(filters)
    );
  }

  static async getLearners(
    filters: BillCoverageFilters = {}
  ): Promise<{ rows: BillCoverageRow[]; total: number }> {
    const raw = await this.executeDashboardRPC<RawCoverageRow[]>(
      'get_billing_coverage_learners',
      {
        ...this.baseParams(filters),
        p_coverage_state: filters.coverage_state ?? 'not_generated',
        p_search: filters.search ?? null,
        p_page: filters.page ?? 1,
        p_page_size: filters.page_size ?? 50
      }
    );

    const list = raw ?? [];
    const rows: BillCoverageRow[] = list.map((r) => ({
      learner_id: r.out_learner_id,
      roll_number: r.out_roll_number,
      register_number: r.out_register_number,
      full_name: r.out_full_name,
      lifecycle_status: r.out_lifecycle_status,
      institution_id: r.out_institution_id,
      institution_name: r.out_institution_name,
      program_name: r.out_program_name,
      academic_year_id: r.out_academic_year_id,
      academic_year_name: r.out_academic_year_name,
      bill_count: Number(r.out_bill_count),
      total_billed: Number(r.out_total_billed),
      coverage_state: r.out_coverage_state as BillCoverageRow['coverage_state'],
      total_count: Number(r.out_total_count)
    }));

    // total_count is a window function — identical on every row, absent when
    // the page is empty.
    return { rows, total: rows.length > 0 ? rows[0].total_count : 0 };
  }
}
```

- [ ] **Step 2: Check diagnostics on the service**

Use `mcp__ide__getDiagnostics` on `lib/services/billing/coverage/bill-coverage-service.ts`.
Expected: no errors. If `executeDashboardRPC` reports as inaccessible, it is `protected static` on `BaseService` (`lib/services/base-service.ts:251`) and this class extends it — confirm the `extends BaseService` clause is present.

- [ ] **Step 3: Create the hook**

Mirrors `hooks/billing/use-billing-analytics.ts` — query keys are local to the module, not in `lib/query/query-keys.ts` (no billing keys live there).

```typescript
import { useQuery } from '@tanstack/react-query';
import { BillCoverageService } from '@/lib/services/billing/coverage/bill-coverage-service';
import type { BillCoverageFilters } from '@/types/billing-coverage';

// Query keys — local to the module (same convention as use-billing-analytics.ts).
export const billCoverageKeys = {
  all: ['bill-coverage'] as const,
  summary: (f: BillCoverageFilters) =>
    [...billCoverageKeys.all, 'summary', f] as const,
  learners: (f: BillCoverageFilters) =>
    [...billCoverageKeys.all, 'learners', f] as const
};

const STALE = 2 * 60 * 1000; // 2 minutes

export function useBillCoverageSummary(filters: BillCoverageFilters) {
  return useQuery({
    queryKey: billCoverageKeys.summary(filters),
    queryFn: () => BillCoverageService.getSummary(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}

export function useBillCoverageLearners(filters: BillCoverageFilters) {
  return useQuery({
    queryKey: billCoverageKeys.learners(filters),
    queryFn: () => BillCoverageService.getLearners(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev
  });
}
```

- [ ] **Step 4: Check diagnostics on the hook**

Use `mcp__ide__getDiagnostics` on `hooks/billing/use-bill-coverage.ts`.
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/services/billing/coverage/bill-coverage-service.ts hooks/billing/use-bill-coverage.ts
git commit -m "feat(billing): add bill coverage service and React Query hooks"
```

---

## Task 7: Page, components and navigation

**Files:**
- Create: `app/(routes)/billing/coverage/page.tsx`
- Create: `app/(routes)/billing/coverage/_components/coverage-client.tsx`
- Create: `app/(routes)/billing/coverage/_components/coverage-summary-cards.tsx`
- Create: `app/(routes)/billing/coverage/_components/coverage-filter-bar.tsx`
- Create: `app/(routes)/billing/coverage/_components/coverage-table.tsx`
- Create: `app/(routes)/billing/coverage/_components/coverage-export.ts`
- Modify: `lib/sidebarMenuLink.ts:662` and `lib/sidebarMenuLink.ts:2436`

**Interfaces:**
- Consumes: hooks from Task 6; types from Task 4; permission keys from Task 1
- Produces: the route `/billing/coverage`

Exact component signatures — later steps and `page.tsx` depend on these names:

```typescript
// coverage-client.tsx
export function CoverageClient(): JSX.Element;

// coverage-summary-cards.tsx
export function CoverageSummaryCards(props: {
  summary: BillCoverageSummary | undefined;
  isLoading: boolean;
}): JSX.Element;

// coverage-filter-bar.tsx
export function CoverageFilterBar(props: {
  filters: BillCoverageFilters;
  onChange: (next: Partial<BillCoverageFilters>) => void;
  onExport: () => void;
  canExport: boolean;
  isExporting: boolean;
}): JSX.Element;

// coverage-table.tsx
export function CoverageTable(props: {
  rows: BillCoverageRow[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: unknown;
  onPageChange: (page: number) => void;
}): JSX.Element;

// coverage-export.ts
export function exportCoverageToExcel(
  rows: BillCoverageRow[],
  filters: BillCoverageFilters
): Promise<void>;
```

- [ ] **Step 1: Build the summary cards component**

`coverage-summary-cards.tsx` — a client component taking `summary: BillCoverageSummary | undefined` and `isLoading: boolean`. Render four `Card`s from `@/components/ui/card`: **In Scope**, **Bill Generated**, **Not Generated** (emphasised — this is the actionable number), and **Cannot Evaluate** (learners with no academic year). When `summary.excluded_institutions > 0`, render a muted line beneath: `"{excluded_institutions} institution(s) hidden — never generated a bill ({excluded_learners} learners)"`. Show `Skeleton` placeholders while `isLoading`.

Follow the card markup already used in `app/(routes)/billing/analytics/_components/kpi-cards.tsx` so the visual language matches.

- [ ] **Step 2: Build the filter bar**

`coverage-filter-bar.tsx` — a client component with:

- Academic Year select — options from the existing academic-years hook used elsewhere in billing; include an "Each learner's own year" option mapping to `null`
- Institution multi-select — sourced from `useInstitutionsWithAccess`, **not** from `useAuth` and **not** branched on `isSuperAdmin`
- Lifecycle status multi-select — default `LEARNER_SCOPE_DEFAULT`
- Billing Category select — optional; when set the page header must read "no **{category}** bill" so the narrowed meaning is visible
- Coverage state toggle — `not_generated` (default) / `generated` / `all`
- Search input — roll number, register number or name
- `Switch` labelled "Include institutions that have never billed", default off

Drive all filter state through `useSearchParams` with **one** `updateParams` call per change — multiple sequential `router.replace` calls clobber each other in this codebase.

- [ ] **Step 3: Build the table**

`coverage-table.tsx` — a client component rendering columns: Roll Number, Name, Institution, Program, Academic Year, Lifecycle Status, Bills, Total Billed, Coverage. Include server-side pagination driven by `page`/`page_size` and the `total` returned by `getLearners`.

Each row links to `/billing/schedule/students/{learner_id}` so an accountant can act on the gap immediately.

Give every row a `key` of `row.learner_id` — unique per row, never the array index.

Empty state must distinguish "no learners match these filters" from an error. An error must **never** render as an empty table: an empty coverage table reads as "no gaps", the exact opposite of the truth. On error, render the message from `getErrorMessage()` and, when the error carries SQLSTATE `42501`, an explicit "You do not have permission to view bill coverage" state.

- [ ] **Step 4: Build the export helper**

`coverage-export.ts` — exports `exportCoverageToExcel(rows: BillCoverageRow[], filters: BillCoverageFilters): Promise<void>`. Import `xlsx` dynamically (`const mod: any = await import('xlsx')`) to keep it out of the page bundle, matching `app/(routes)/billing/analytics/_components/export-analytics.ts`.

Sanitize free-text cells against spreadsheet formula injection exactly as the existing exporters do:

```typescript
const sanitize = (v: unknown): unknown =>
  typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
```

Include a Summary sheet naming the active filters, so an exported file is self-describing.

- [ ] **Step 5: Build the composition client**

`coverage-client.tsx` — the `'use client'` component that owns filter state and
wires the pieces together. This is what `page.tsx` imports.

```tsx
'use client';

import { useState } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBillCoverageSummary,
  useBillCoverageLearners
} from '@/hooks/billing/use-bill-coverage';
import type { BillCoverageFilters } from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT } from '@/types/billing-coverage';
import { CoverageSummaryCards } from './coverage-summary-cards';
import { CoverageFilterBar } from './coverage-filter-bar';
import { CoverageTable } from './coverage-table';
import { exportCoverageToExcel } from './coverage-export';

const PAGE_SIZE = 50;

export function CoverageClient() {
  const { canAccess, isSuperAdmin } = usePermissions();
  // The export key is granted separately from view — a role may read the
  // coverage list without being allowed to take the learner data off-platform.
  const canExport = isSuperAdmin || canAccess('billing.coverage', 'export');

  const [filters, setFilters] = useState<BillCoverageFilters>({
    academic_year_id: null,
    institution_ids: null,
    lifecycle_statuses: [...LEARNER_SCOPE_DEFAULT],
    billing_category_id: null,
    coverage_state: 'not_generated',
    include_non_billing_institutions: false,
    search: null,
    page: 1,
    page_size: PAGE_SIZE
  });
  const [isExporting, setIsExporting] = useState(false);

  const summaryQuery = useBillCoverageSummary(filters);
  const learnersQuery = useBillCoverageLearners(filters);

  // Any filter change resets to page 1 — otherwise a narrowed result set can
  // land the user on a page that no longer exists and render as empty, which
  // on this screen reads as "no gaps".
  const handleChange = (next: Partial<BillCoverageFilters>) =>
    setFilters((prev) => ({ ...prev, ...next, page: next.page ?? 1 }));

  const handleExport = async () => {
    if (!canExport) return;
    setIsExporting(true);
    try {
      // Export the full result set, not just the visible page.
      const all = await import(
        '@/lib/services/billing/coverage/bill-coverage-service'
      ).then((m) =>
        m.BillCoverageService.getLearners({
          ...filters,
          page: 1,
          page_size: 200
        })
      );
      await exportCoverageToExcel(all.rows, filters);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className='space-y-6'>
      <CoverageSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
      />
      <CoverageFilterBar
        filters={filters}
        onChange={handleChange}
        onExport={handleExport}
        canExport={canExport}
        isExporting={isExporting}
      />
      <CoverageTable
        rows={learnersQuery.data?.rows ?? []}
        total={learnersQuery.data?.total ?? 0}
        page={filters.page ?? 1}
        pageSize={PAGE_SIZE}
        isLoading={learnersQuery.isLoading}
        error={learnersQuery.error}
        onPageChange={(page) => handleChange({ page })}
      />
    </div>
  );
}
```

The RPC caps `p_page_size` at 200, so a single export call returns at most 200
rows. If `summaryQuery.data.not_generated` exceeds 200, loop pages until the
accumulated row count reaches the reported total, and **surface the cap in the
UI if you choose to bound it** — a silently truncated export reads as a complete
list of gaps.

Use `usePermissions` for the export check, not `useAuth` — `useAuth` exposes the
profile, while permission helpers live in `usePermissions`.

- [ ] **Step 6: Build the page**

```tsx
'use client';

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { CoverageClient } from './_components/coverage-client';

export default function BillingCoveragePage() {
  return (
    <PermissionGuard module='billing.coverage' action='view'>
      <ContentLayout title='Bill Coverage'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing/schedule'>Billing</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Bill Coverage</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='text-2xl font-bold py-1'>Bill Coverage</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Learners with and without a bill generated for the academic year
            </p>
          </div>

          {/* Suspense required — the client tree reads useSearchParams() */}
          <Suspense
            fallback={
              <div className='space-y-4'>
                <Skeleton className='h-10 w-64' />
                <Skeleton className='h-10 w-full' />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className='h-12 w-full' />
                ))}
              </div>
            }
          >
            <CoverageClient />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
```

- [ ] **Step 7: Map the route to its permission key**

In `lib/sidebarMenuLink.ts`, in the `MENU_PERMISSIONS` billing block (after the `'/billing/activities'` entry, line 661):

```typescript
  '/billing/coverage': 'billing.coverage.view',
```

- [ ] **Step 8: Add the sidebar entry**

In `lib/sidebarMenuLink.ts`, in the `Billing & Accounts` group, immediately after the *Schedule · Student Search* submenu entry (line 2436):

```typescript
            { href: '/billing/coverage', label: 'Bill Coverage', active: pathname.startsWith('/billing/coverage') },
```

Nav visibility must mirror the route guard — both now resolve to `billing.coverage.view`.

- [ ] **Step 9: Check diagnostics on every new and modified file**

Use `mcp__ide__getDiagnostics` on each of: the five `_components` files, `page.tsx`, and `lib/sidebarMenuLink.ts`.
Expected: no errors.

- [ ] **Step 10: Run the navigation and permission gates**

```bash
npm run gen:routes
npm run check:menus
npm run check:reachability
npm run check:audit-coverage
```

Expected: all exit 0. `gen:routes` regenerates the route manifest, which must include `/billing/coverage`.

- [ ] **Step 11: Exercise in the browser**

Start the dev server (`npm run dev` — Turbopack, Sentry skipped) and verify:

1. `/billing/coverage` loads and the **Not Generated** card shows approximately **1,632** for the default filters
2. JKKN College of Education appears when Academic Year is set to 2026-2027
3. Toggling "Include institutions that have never billed" raises the in-scope count by roughly 1,105
4. Setting Billing Category to *Tuition* changes the counts and the header reflects the narrowed meaning
5. Pagination advances and `total` stays constant across pages
6. Export produces a workbook whose row count matches the reported total
7. **Sign in as a Chief Accountant, not only as super-admin** — confirm both the sidebar entry and the data render. Permission and scope bugs in this codebase are silent for super-admins and only appear for real roles.
8. Sign in as a role without the key — confirm neither the sidebar entry nor the page content appears
9. Confirm the Export button is hidden for a role holding `billing.coverage.view` but not `billing.coverage.export`

- [ ] **Step 12: Commit**

```bash
git add app/\(routes\)/billing/coverage lib/sidebarMenuLink.ts lib/navigation/route-manifest.generated.ts
git commit -m "feat(billing): add Bill Coverage page, filters, table and export"
```

---

## Final verification

- [ ] `npm run check:menus`, `check:reachability`, `check:audit-coverage` all pass
- [ ] `mcp__ide__getDiagnostics` clean on every touched file
- [ ] `SELECT count(*) FROM billing_student_bills WHERE academic_year_id IS NULL` returns **66**
- [ ] Coverage page verified in the browser as **Chief Accountant**, not only super-admin
- [ ] `get_billing_coverage_summary()` raises `42501` for a user without the key
- [ ] Spot-check 10 learners listed as "not generated" — open each in `/billing/schedule/students/{id}` and confirm no live bill exists for the year

Do not report the feature complete until every box above is checked and observed. If any step was skipped, say so explicitly.
