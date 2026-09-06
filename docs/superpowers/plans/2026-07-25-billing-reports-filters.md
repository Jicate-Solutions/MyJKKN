# Billing Reports — Hierarchy & Student-Category Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add institution / academic year / degree / department / program / semester / section / category and a multi-select student-category (First Graduate, PMSS, 7.5% Scholarship, Others) filter to `/billing/reports`, honoured by all six tabs.

**Architecture:** Move every report query out of client-side PostgREST and into SECURITY DEFINER RPCs, mirroring `20260724090000_accountant_report_rpcs.sql`. A single inlinable SQL helper resolves the student cohort (hierarchy + scheme); six RPCs consume it. The client service becomes a thin RPC wrapper.

**Tech Stack:** Next.js 15 (App Router, client components), TypeScript, Supabase/PostgREST, PostgreSQL (plpgsql + sql functions), Shadcn UI, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-billing-reports-filters-design.md`

## Global Constraints

- **Branch:** `feat/billing-reports-filters` (already created; the spec commit is on it).
- **Migrations are prod-only.** There is no local Supabase CLI. DDL is applied with `mcp__supabase__apply_migration`, or `exec_sql` RPC (param `query`, DDL only). Always rehearse with `BEGIN … ROLLBACK` before applying.
- **Every new function:** `REVOKE EXECUTE ON FUNCTION … FROM anon, PUBLIC;` then `GRANT EXECUTE … TO authenticated, service_role;`. End the migration with `NOTIFY pgrst;`.
- **Permission gate is `billing.reports.view`** — an existing key. Do **not** add new permission keys; `npm run check:permissions` will fail on unregistered keys.
- **Institution scope:** hoist `get_user_accessible_institutions(auth.uid())` into a `v_inst uuid[]` local **once**, then filter with `= ANY(v_inst)`. Never call a SECURITY DEFINER function inside a `WHERE` clause — the codebase has a recorded incident where that turned a 54 ms query into 55,847 ms (see `SQL_FILE_INDEX.md`, 2026-07-10 SCF entry).
- **No new indexes.** Every column used is already indexed (spec §2.7).
- **Verification commands:** `npm run typecheck` and `npx vitest run <path>`. There is no `npm test` script — invoke vitest directly.
- **Commit style:** end every commit message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Create**
- `supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql` — cohort helper + 6 RPCs.
- `lib/services/billing/reports/report-filter-params.ts` — pure `BillingReportFilters` → RPC-params mapping. The only unit-testable seam in the data layer; the service itself is a thin wrapper with no logic worth testing.
- `__tests__/billing/report-filter-params.test.ts`
- `hooks/organization/use-academic-hierarchy-filters.ts` — cascading option loading + cascade-clear.
- `app/(routes)/billing/reports/_components/report-pagination.tsx` — shared prev/next + "showing X–Y of N".

**Modify**
- `types/billing-schedule.ts` — extend `BillingReportFilters`, add `ReportSchemeKey`.
- `lib/services/billing/reports/billing-report-service.ts` — rewrite as RPC wrapper (1,101 → ~250 lines).
- `hooks/billing/use-billing-reports.ts` — pagination state, `totalCount`.
- `app/(routes)/billing/reports/_components/report-filters.tsx` — rewrite.
- `app/(routes)/billing/reports/page.tsx` — filter state reset on filter change.
- The five tab components — mount `<ReportPagination>`.
- `supabase/SQL_FILE_INDEX.md` — dated entry.

---

### Task 1: Filter types and the pure param builder

**Files:**
- Modify: `types/billing-schedule.ts:730-745`
- Create: `lib/services/billing/reports/report-filter-params.ts`
- Test: `__tests__/billing/report-filter-params.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ReportSchemeKey`, the extended `BillingReportFilters`, `ACADEMIC_YEAR_UNSPECIFIED`, `buildReportScope(f): ReportRpcScope`, `buildReportPage(page, pageSize): { p_limit: number; p_offset: number }`, `EXPORT_PAGE`. Tasks 5, 7, 8 and 9 all import from here.

- [ ] **Step 1: Extend the filter type**

In `types/billing-schedule.ts`, replace the `BillingReportFilters` interface (currently at line 730) with:

```ts
export type ReportSchemeKey =
  | 'first_graduate'
  | 'pmss'
  | 'scholarship_7_5'
  | 'other';

export const REPORT_SCHEME_OPTIONS: { value: ReportSchemeKey; label: string }[] = [
  { value: 'first_graduate', label: 'First Graduate' },
  { value: 'pmss', label: 'PMSS' },
  { value: 'scholarship_7_5', label: '7.5% Scholarship' },
  { value: 'other', label: 'Others / Not Applicable' },
];

export interface BillingReportFilters {
  institution_id?: string;
  /** Academic year id, or the ACADEMIC_YEAR_UNSPECIFIED sentinel for bills with no year. */
  academic_year_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  item_category_id?: string;
  /** Empty or absent means no scheme restriction. */
  schemes?: ReportSchemeKey[];
  student_id?: string;
  date_from?: string;
  date_to?: string;
  report_type?:
    | 'summary'
    | 'detailed'
    | 'outstanding'
    | 'collection'
    | 'invoice'
    | 'discount'
    | 'refund';
  format?: 'pdf' | 'excel' | 'csv';
}
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/billing/report-filter-params.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ACADEMIC_YEAR_UNSPECIFIED,
  buildReportScope,
  buildReportPage,
  EXPORT_PAGE,
} from '@/lib/services/billing/reports/report-filter-params';

describe('buildReportScope', () => {
  it('maps an empty filter object to all-null params', () => {
    const s = buildReportScope({});
    expect(s).toEqual({
      p_institution_ids: null,
      p_academic_year_id: null,
      p_academic_year_unspecified: false,
      p_item_category_id: null,
      p_degree_id: null,
      p_department_id: null,
      p_program_id: null,
      p_semester_id: null,
      p_section_id: null,
      p_schemes: null,
      p_student_id: null,
      p_date_from: null,
      p_date_to: null,
    });
  });

  it('wraps a single institution id in an array (the RPC takes uuid[])', () => {
    expect(buildReportScope({ institution_id: 'inst-1' }).p_institution_ids).toEqual(['inst-1']);
  });

  it('translates the Unspecified sentinel into a boolean flag, not an id', () => {
    const s = buildReportScope({ academic_year_id: ACADEMIC_YEAR_UNSPECIFIED });
    expect(s.p_academic_year_id).toBeNull();
    expect(s.p_academic_year_unspecified).toBe(true);
  });

  it('passes a real academic year through as an id with the flag off', () => {
    const s = buildReportScope({ academic_year_id: 'ay-1' });
    expect(s.p_academic_year_id).toBe('ay-1');
    expect(s.p_academic_year_unspecified).toBe(false);
  });

  it('normalises an empty scheme array to null (means "no restriction")', () => {
    expect(buildReportScope({ schemes: [] }).p_schemes).toBeNull();
  });

  it('passes multiple selected schemes through unchanged', () => {
    expect(buildReportScope({ schemes: ['first_graduate', 'pmss'] }).p_schemes)
      .toEqual(['first_graduate', 'pmss']);
  });

  it('carries every hierarchy level', () => {
    const s = buildReportScope({
      degree_id: 'dg', department_id: 'dp', program_id: 'pg',
      semester_id: 'sm', section_id: 'sc', item_category_id: 'ct',
    });
    expect([s.p_degree_id, s.p_department_id, s.p_program_id, s.p_semester_id, s.p_section_id, s.p_item_category_id])
      .toEqual(['dg', 'dp', 'pg', 'sm', 'sc', 'ct']);
  });

  it('converts empty strings to null so a cleared select does not filter', () => {
    expect(buildReportScope({ degree_id: '', date_from: '' }).p_degree_id).toBeNull();
  });
});

describe('buildReportPage', () => {
  it('page 1 starts at offset 0', () => {
    expect(buildReportPage(1, 50)).toEqual({ p_limit: 50, p_offset: 0 });
  });

  it('page 3 of 50 starts at offset 100', () => {
    expect(buildReportPage(3, 50)).toEqual({ p_limit: 50, p_offset: 100 });
  });

  it('clamps a page below 1 to the first page', () => {
    expect(buildReportPage(0, 50)).toEqual({ p_limit: 50, p_offset: 0 });
  });

  it('EXPORT_PAGE requests all rows', () => {
    expect(EXPORT_PAGE).toEqual({ p_limit: null, p_offset: 0 });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run __tests__/billing/report-filter-params.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/services/billing/reports/report-filter-params"`.

- [ ] **Step 4: Write the implementation**

Create `lib/services/billing/reports/report-filter-params.ts`:

```ts
// Pure mapping from the UI filter object to RPC parameters.
// Kept separate from the service so it can be unit-tested without a Supabase double.
import type { BillingReportFilters, ReportSchemeKey } from '@/types/billing-schedule';

/** Sentinel for "bills with no academic_year_id" — 55% of billing_student_bills. */
export const ACADEMIC_YEAR_UNSPECIFIED = 'unspecified';

export interface ReportRpcScope {
  p_institution_ids: string[] | null;
  p_academic_year_id: string | null;
  p_academic_year_unspecified: boolean;
  p_item_category_id: string | null;
  p_degree_id: string | null;
  p_department_id: string | null;
  p_program_id: string | null;
  p_semester_id: string | null;
  p_section_id: string | null;
  p_schemes: ReportSchemeKey[] | null;
  p_student_id: string | null;
  p_date_from: string | null;
  p_date_to: string | null;
}

const nz = (v?: string): string | null => (v && v.length > 0 ? v : null);

export function buildReportScope(f: BillingReportFilters): ReportRpcScope {
  const unspecified = f.academic_year_id === ACADEMIC_YEAR_UNSPECIFIED;
  return {
    p_institution_ids: f.institution_id ? [f.institution_id] : null,
    p_academic_year_id: unspecified ? null : nz(f.academic_year_id),
    p_academic_year_unspecified: unspecified,
    p_item_category_id: nz(f.item_category_id),
    p_degree_id: nz(f.degree_id),
    p_department_id: nz(f.department_id),
    p_program_id: nz(f.program_id),
    p_semester_id: nz(f.semester_id),
    p_section_id: nz(f.section_id),
    p_schemes: f.schemes && f.schemes.length > 0 ? f.schemes : null,
    p_student_id: nz(f.student_id),
    p_date_from: nz(f.date_from),
    p_date_to: nz(f.date_to),
  };
}

export const REPORT_PAGE_SIZE = 50;

export function buildReportPage(page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 1 ? Math.floor(page) : 1;
  return { p_limit: pageSize, p_offset: (safePage - 1) * pageSize };
}

/** Export path: fetch the whole filtered set, not the visible page. RPCs cap at 10,000. */
export const EXPORT_PAGE = { p_limit: null, p_offset: 0 } as const;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run __tests__/billing/report-filter-params.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors introduced by these files. `BillingReportFilters` gained only optional fields, so existing call sites still compile.

- [ ] **Step 7: Commit**

```bash
git add types/billing-schedule.ts lib/services/billing/reports/report-filter-params.ts __tests__/billing/report-filter-params.test.ts
git commit -m "feat(billing-reports): filter types + pure RPC param builder

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The cohort helper function

**Files:**
- Create: `supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.billing_report_student_cohort(uuid[], uuid, uuid, uuid, uuid, uuid, text[]) RETURNS TABLE(student_id uuid)`. Tasks 3 and 4 join against it.

**Two constraints that are easy to get wrong — read before writing:**

1. **Do not add `SET search_path` to this function, and do not make it SECURITY DEFINER.** PostgreSQL refuses to inline a set-returning SQL function whose `proconfig` is non-null or which is SECURITY DEFINER. A `SET` clause would silently turn this from an inlined, index-using join into a materialised `Function Scan` — destroying the whole reason it is `LANGUAGE sql`. Schema-qualify every object instead (`public.learners_profiles`). Its callers are SECURITY DEFINER, so when inlined it runs with definer rights and `learners_profiles` RLS does not re-apply per row.

2. **NULL-guard the `other` bucket.** `scholarship_type` is NULL for 65 learners. `NOT (NULL = 'FIRST GRADUATE' OR …)` evaluates to NULL, which excludes the row — silently dropping those 65 learners from `other`. Wrap with `COALESCE`.

- [ ] **Step 1: Write the migration header and the helper**

Create `supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql`:

```sql
-- ============================================================================
-- 20260725103000 — /billing/reports hierarchy + student-category filter RPCs
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-07-25-billing-reports-filters-design.md
-- Pattern: 20260724090000_accountant_report_rpcs.sql — permission gate +
-- get_user_accessible_institutions scope hoisted into v_inst.
--
-- The academic hierarchy (degree/department/program/semester/section) exists
-- ONLY on learners_profiles; every billing table reaches it via student_id.
-- billing_report_student_cohort resolves that once and is joined by each RPC.
-- ============================================================================

-- 0) COHORT HELPER ----------------------------------------------------------
-- LANGUAGE sql (not plpgsql) and deliberately WITHOUT `SET search_path` and
-- WITHOUT SECURITY DEFINER: PostgreSQL only inlines a set-returning SQL
-- function when proconfig IS NULL and prosecdef IS false. Inlining is the
-- point — it lets the planner see lp.degree_id = $1 and use
-- idx_learners_profiles_degree_id instead of materialising a Function Scan.
-- Every object is schema-qualified to compensate for the missing search_path.
-- Callers are SECURITY DEFINER, so this inherits definer rights.
CREATE OR REPLACE FUNCTION public.billing_report_student_cohort(
  p_institution_ids uuid[] DEFAULT NULL,
  p_degree_id       uuid   DEFAULT NULL,
  p_department_id   uuid   DEFAULT NULL,
  p_program_id      uuid   DEFAULT NULL,
  p_semester_id     uuid   DEFAULT NULL,
  p_section_id      uuid   DEFAULT NULL,
  p_schemes         text[] DEFAULT NULL
) RETURNS TABLE(student_id uuid)
LANGUAGE sql STABLE
AS $$
  -- One row per learner: lp.id is the PK and quotas joins on its PK, so no
  -- DISTINCT is needed even when a learner matches two scheme buckets — the
  -- bucket predicates are a disjunction WITHIN a single row.
  SELECT lp.id
  FROM public.learners_profiles lp
  LEFT JOIN public.quotas q ON q.id = lp.quota_id
  WHERE (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
    AND (p_degree_id     IS NULL OR lp.degree_id     = p_degree_id)
    AND (p_department_id IS NULL OR lp.department_id = p_department_id)
    AND (p_program_id    IS NULL OR lp.program_id    = p_program_id)
    AND (p_semester_id   IS NULL OR lp.semester_id   = p_semester_id)
    AND (p_section_id    IS NULL OR lp.section_id    = p_section_id)
    AND (
      p_schemes IS NULL OR cardinality(p_schemes) = 0
      OR ('first_graduate' = ANY(p_schemes)
          AND (COALESCE(lp.first_graduate, false)
               OR COALESCE(lp.scholarship_type, '') = 'FIRST GRADUATE'))
      OR ('pmss' = ANY(p_schemes)
          AND (COALESCE(lp.scholarship_type, '') = 'PMS SCHOLARSHIP'
               OR COALESCE(q.code, '') = 'pmss'))
      OR ('scholarship_7_5' = ANY(p_schemes)
          AND COALESCE(lp.scholarship_type, '') = '7.5% SCHOLARSHIP')
      -- COALESCE is load-bearing: scholarship_type is NULL for 65 learners and
      -- NOT(NULL) is NULL, which would drop them from "other" entirely.
      OR ('other' = ANY(p_schemes)
          AND NOT (
            COALESCE(lp.first_graduate, false)
            OR COALESCE(lp.scholarship_type, '') IN
               ('FIRST GRADUATE', 'PMS SCHOLARSHIP', '7.5% SCHOLARSHIP')
            OR COALESCE(q.code, '') = 'pmss'))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.billing_report_student_cohort(uuid[], uuid, uuid, uuid, uuid, uuid, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.billing_report_student_cohort(uuid[], uuid, uuid, uuid, uuid, uuid, text[]) TO authenticated, service_role;
```

- [ ] **Step 2: Rehearse the helper in a rolled-back transaction**

Run via `mcp__supabase__execute_sql` — the whole block in one call so the ROLLBACK is guaranteed:

```sql
BEGIN;
-- paste the CREATE OR REPLACE FUNCTION ... $$; body from Step 1 here
SELECT
  (SELECT count(*) FROM public.billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['first_graduate'])) AS fg,
  (SELECT count(*) FROM public.billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['pmss'])) AS pmss,
  (SELECT count(*) FROM public.billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['scholarship_7_5'])) AS s75,
  (SELECT count(*) FROM public.billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['other'])) AS other,
  (SELECT count(*) FROM public.billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,
     ARRAY['first_graduate','pmss','scholarship_7_5','other'])) AS all_four,
  (SELECT count(*) FROM public.billing_report_student_cohort()) AS unfiltered;
ROLLBACK;
```

Expected exactly: `fg=1449, pmss=435, s75=204, other=4873, all_four=6961, unfiltered=6961`.

`all_four` equal to `unfiltered` proves the buckets are exhaustive **and** that a learner matching two buckets is not double-counted. If `other` comes back 4,808 you forgot the `COALESCE` — the 65 NULL-scholarship learners were dropped.

- [ ] **Step 3: Prove the function actually inlines**

Still inside a `BEGIN … ROLLBACK` with the function created, run:

**The argument must be a literal, not a sub-SELECT.** PostgreSQL refuses to inline a set-returning function whose arguments contain a sub-SELECT, so passing `(SELECT id FROM degrees LIMIT 1)` produces a `Function Scan` **on correct code** — a false failure. Fetch the uuid first, then paste it in:

```sql
SELECT id::text FROM public.degrees LIMIT 1;   -- copy the value

EXPLAIN (COSTS OFF)
SELECT count(*) FROM public.billing_report_student_cohort(
  NULL, '<PASTE_DEGREE_UUID>'::uuid, NULL, NULL, NULL, NULL, NULL);
```

Expected: an Index Only Scan (or Index/Bitmap Heap Scan) on `idx_learners_profiles_degree_id`, with `learners_profiles lp` — the function's own internal alias — appearing directly in the plan. Verified 2026-07-25 on prod via a rolled-back probe:

```
Aggregate
  ->  Index Only Scan using idx_learners_profiles_degree_id on learners_profiles lp
        Index Cond: (degree_id = 'f1ab9cc0-…'::uuid)
```

**Failure signal:** a `Function Scan on billing_report_student_cohort` node — but only trust it if the argument was a literal. If it was a sub-SELECT, the test is wrong, not the function. A real failure means `SET search_path` or `SECURITY DEFINER` crept in; confirm with `SELECT prosecdef, proconfig FROM pg_proc WHERE proname='billing_report_student_cohort'` (both must be `false` / `NULL`).

Note: RLS on `learners_profiles` does **not** block inlining — confirmed by probe.

- [ ] **Step 4: Commit the migration file (not yet applied)**

```bash
git add supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql
git commit -m "feat(billing-reports): inlinable student-cohort helper for report filters

Resolves hierarchy + scheme membership once. LANGUAGE sql without a SET
clause so PostgreSQL inlines it; COALESCE guards the 65 NULL-scholarship
learners in the 'other' bucket.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The five list RPCs

**Files:**
- Modify: `supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql` (append)

**Interfaces:**
- Consumes: `public.billing_report_student_cohort(...)` from Task 2.
- Produces: `get_billing_reports_outstanding`, `_collection`, `_invoices`, `_discounts`, `_refunds`. Each takes the 13 scope params in the order below, then `p_limit int DEFAULT 50, p_offset int DEFAULT 0`, and returns its report columns plus `total_count bigint`.

**Canonical parameter order** — every RPC uses exactly this, because `report-filter-params.ts` spreads one object into all of them:

```
p_institution_ids uuid[], p_academic_year_id uuid, p_academic_year_unspecified boolean,
p_item_category_id uuid, p_degree_id uuid, p_department_id uuid, p_program_id uuid,
p_semester_id uuid, p_section_id uuid, p_schemes text[], p_student_id uuid,
p_date_from date, p_date_to date, p_limit int, p_offset int
```

Supabase sends RPC args by name, so ordering is for human consistency, not correctness — but keep it identical anyway.

- [ ] **Step 1: Append the shared preamble note and the Outstanding RPC**

Append to the migration:

```sql
-- 1) OUTSTANDING — paginated BY STUDENT, bills nested as jsonb --------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_outstanding(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE(
  student_id uuid, first_name text, last_name text, roll_number text,
  institution_name text, department_name text,
  total_outstanding numeric, overdue_amount numeric,
  bills jsonb, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT b.id, b.student_id, b.bill_description, b.due_date, b.status,
           CASE WHEN b.status = 'partially_paid' THEN b.balance_amount
                ELSE b.final_amount END AS amount
    FROM public.billing_student_bills b
    JOIN public.billing_report_student_cohort(
           v_inst, p_degree_id, p_department_id, p_program_id,
           p_semester_id, p_section_id, p_schemes) c ON c.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst)
      AND b.status IN ('unpaid','partially_paid','overdue')
      AND COALESCE(b.balance_amount, 0) > 0
      AND (p_student_id IS NULL OR b.student_id = p_student_id)
      AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
      AND (CASE
             WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
             WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
             ELSE true END)
      AND (p_date_from IS NULL OR b.due_date >= p_date_from)
      AND (p_date_to   IS NULL OR b.due_date <= p_date_to)
  ),
  per_student AS (
    SELECT s.student_id AS sid,
           SUM(s.amount) AS total_outstanding,
           SUM(s.amount) FILTER (
             WHERE s.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS overdue_amount,
           jsonb_agg(jsonb_build_object(
             'id', s.id, 'bill_description', s.bill_description,
             'due_date', s.due_date, 'amount', s.amount, 'status', s.status
           ) ORDER BY s.due_date) AS bills
    FROM scoped s GROUP BY s.student_id
  )
  SELECT ps.sid, lp.first_name::text, lp.last_name::text, lp.roll_number::text,
         i.name::text, d.department_name::text,
         ps.total_outstanding, COALESCE(ps.overdue_amount, 0), ps.bills,
         COUNT(*) OVER() AS total_count
  FROM per_student ps
  JOIN public.learners_profiles lp ON lp.id = ps.sid
  LEFT JOIN public.institutions i ON i.id = lp.institution_id
  LEFT JOIN public.departments  d ON d.id = lp.department_id
  ORDER BY ps.total_outstanding DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_outstanding(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_outstanding(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;
```

`COUNT(*) OVER()` is evaluated before `LIMIT`, so `total_count` is the full filtered student count on every page.

- [ ] **Step 2: Append the Collection RPC**

Note the `EXISTS` — a receipt allocated across three bills must stay one row.

```sql
-- 2) COLLECTION — one row per receipt ---------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_collection(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  receipt_id uuid, receipt_number text, receipt_date date,
  first_name text, last_name text, roll_number text, institution_name text,
  payment_mode text, payment_amount numeric,
  total_refunds numeric, net_amount numeric, has_refunds boolean,
  total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT r.id, r.receipt_number, r.receipt_date, r.payment_mode,
           r.payment_amount, r.student_id, r.institution_id
    FROM public.billing_receipts r
    JOIN public.billing_report_student_cohort(
           v_inst, p_degree_id, p_department_id, p_program_id,
           p_semester_id, p_section_id, p_schemes) c ON c.student_id = r.student_id
    WHERE r.institution_id = ANY(v_inst)
      AND (p_student_id IS NULL OR r.student_id = p_student_id)
      AND (p_date_from IS NULL OR r.receipt_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.receipt_date <= p_date_to)
      -- Semi-join, NOT a join: asks "does this receipt touch a matching bill?"
      -- without multiplying the receipt row per allocation.
      AND (
        (p_item_category_id IS NULL AND p_academic_year_id IS NULL AND NOT p_academic_year_unspecified)
        OR EXISTS (
          SELECT 1
          FROM public.billing_receipt_items ri
          JOIN public.billing_student_bills b ON b.id = ri.bill_id
          WHERE ri.receipt_id = r.id
            AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
            AND (CASE
                   WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
                   WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
                   ELSE true END))
      )
  ),
  refs AS (
    SELECT rf.receipt_id AS rid, SUM(rf.refund_amount) AS total_refunds
    FROM public.billing_refunds rf
    WHERE rf.approval_status = 'processed'
    GROUP BY rf.receipt_id
  )
  SELECT s.id, s.receipt_number::text, s.receipt_date,
         lp.first_name::text, lp.last_name::text, lp.roll_number::text, i.name::text,
         s.payment_mode::text, s.payment_amount,
         COALESCE(refs.total_refunds, 0),
         GREATEST(0, s.payment_amount - COALESCE(refs.total_refunds, 0)),
         COALESCE(refs.total_refunds, 0) > 0,
         COUNT(*) OVER() AS total_count
  FROM scoped s
  LEFT JOIN refs ON refs.rid = s.id
  LEFT JOIN public.learners_profiles lp ON lp.id = s.student_id
  LEFT JOIN public.institutions i ON i.id = s.institution_id
  ORDER BY s.receipt_date DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_collection(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_collection(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;
```

- [ ] **Step 3: Append the Invoices RPC**

```sql
-- 3) INVOICES ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_invoices(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  invoice_id uuid, invoice_number text, invoice_date date,
  first_name text, last_name text, roll_number text, institution_name text,
  invoice_type text, grand_total numeric,
  billing_period_from date, billing_period_to date, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT inv.id, inv.invoice_number::text, inv.invoice_date,
         lp.first_name::text, lp.last_name::text, lp.roll_number::text, i.name::text,
         inv.invoice_type::text, inv.grand_total,
         inv.billing_period_from, inv.billing_period_to,
         COUNT(*) OVER() AS total_count
  FROM public.billing_invoices inv
  JOIN public.billing_report_student_cohort(
         v_inst, p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes) c ON c.student_id = inv.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = inv.student_id
  LEFT JOIN public.institutions i ON i.id = inv.institution_id
  WHERE inv.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR inv.student_id = p_student_id)
    AND (p_date_from IS NULL OR inv.invoice_date >= p_date_from)
    AND (p_date_to   IS NULL OR inv.invoice_date <= p_date_to)
    AND (
      (p_item_category_id IS NULL AND p_academic_year_id IS NULL AND NOT p_academic_year_unspecified)
      OR EXISTS (
        SELECT 1
        FROM public.billing_invoice_items ii
        JOIN public.billing_receipt_items ri ON ri.receipt_id = ii.receipt_id
        JOIN public.billing_student_bills b  ON b.id = ri.bill_id
        WHERE ii.invoice_id = inv.id
          AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
          AND (CASE
                 WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
                 WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
                 ELSE true END))
    )
  ORDER BY inv.invoice_date DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_invoices(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_invoices(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;
```

- [ ] **Step 4: Append the Discounts RPC**

`billing_discounts` has no `institution_id` and no `student_id` — everything routes through `bill_id`.

```sql
-- 4) DISCOUNTS — reached entirely through bill_id ----------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_discounts(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  discount_id uuid, first_name text, last_name text, roll_number text,
  institution_name text, bill_description text,
  discount_category text, discount_type text,
  discount_value numeric, discount_amount numeric,
  approval_status text, effective_date date, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT d.id, lp.first_name::text, lp.last_name::text, lp.roll_number::text,
         i.name::text, b.bill_description::text,
         d.discount_category::text, d.discount_type::text,
         d.discount_value, d.discount_amount,
         d.approval_status::text, d.effective_date,
         COUNT(*) OVER() AS total_count
  FROM public.billing_discounts d
  JOIN public.billing_student_bills b ON b.id = d.bill_id
  JOIN public.billing_report_student_cohort(
         v_inst, p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes) c ON c.student_id = b.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN public.institutions i ON i.id = b.institution_id
  WHERE b.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR b.student_id = p_student_id)
    AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
    AND (CASE
           WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
           WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
           ELSE true END)
    AND (p_date_from IS NULL OR d.effective_date >= p_date_from)
    AND (p_date_to   IS NULL OR d.effective_date <= p_date_to)
  ORDER BY d.created_at DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_discounts(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_discounts(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;
```

- [ ] **Step 5: Append the Refunds RPC**

`billing_refunds` has only `receipt_id` — route through receipts, then the receipts semi-join for year/category.

```sql
-- 5) REFUNDS — reached entirely through receipt_id ---------------------------
CREATE OR REPLACE FUNCTION public.get_billing_reports_refunds(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE(
  refund_id uuid, receipt_number text,
  first_name text, last_name text, roll_number text, institution_name text,
  refund_category text, refund_method text,
  refund_amount numeric, processing_fee numeric, net_refund_amount numeric,
  approval_status text, refund_date date, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT rf.id, r.receipt_number::text,
         lp.first_name::text, lp.last_name::text, lp.roll_number::text, i.name::text,
         rf.refund_category::text, rf.refund_method::text,
         rf.refund_amount, rf.processing_fee, rf.net_refund_amount,
         rf.approval_status::text, rf.refund_date,
         COUNT(*) OVER() AS total_count
  FROM public.billing_refunds rf
  JOIN public.billing_receipts r ON r.id = rf.receipt_id
  JOIN public.billing_report_student_cohort(
         v_inst, p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes) c ON c.student_id = r.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = r.student_id
  LEFT JOIN public.institutions i ON i.id = r.institution_id
  WHERE r.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR r.student_id = p_student_id)
    AND (p_date_from IS NULL OR rf.refund_date >= p_date_from)
    AND (p_date_to   IS NULL OR rf.refund_date <= p_date_to)
    AND (
      (p_item_category_id IS NULL AND p_academic_year_id IS NULL AND NOT p_academic_year_unspecified)
      OR EXISTS (
        SELECT 1
        FROM public.billing_receipt_items ri
        JOIN public.billing_student_bills b ON b.id = ri.bill_id
        WHERE ri.receipt_id = r.id
          AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
          AND (CASE
                 WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
                 WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
                 ELSE true END))
    )
  ORDER BY rf.created_at DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_refunds(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_refunds(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date, int, int) TO authenticated, service_role;
```

- [ ] **Step 6: Rehearse all five in one rolled-back transaction**

Paste the Task 2 helper plus all five functions inside `BEGIN; … ROLLBACK;` and assert:

```sql
-- Unfiltered outstanding student count and the receipt no-duplication check.
SELECT
  (SELECT max(total_count) FROM public.get_billing_reports_outstanding(p_limit => 50)) AS outstanding_students,
  (SELECT count(*) FROM public.get_billing_reports_outstanding(p_limit => 50))          AS page_rows,
  (SELECT max(total_count) FROM public.get_billing_reports_collection(p_limit => 50))   AS receipts_total,
  (SELECT max(total_count) FROM public.get_billing_reports_invoices(p_limit => 50))     AS invoices_total;
```

Expected, running as a superuser inside the rehearsal (`user_has_permission` and `auth.uid()` will not resolve — see the note below):

Because the rehearsal runs without an authenticated JWT, `auth.uid()` is NULL and `get_user_accessible_institutions(NULL)` returns no rows, so each RPC returns zero rows via the `IF v_inst IS NULL THEN RETURN; END IF;` guard. **That is the expected rehearsal result and proves the scope guard works.** To exercise the bodies, run the same assertions against the equivalent inline SQL (helper + query without the gate), and confirm:

- outstanding student count is between 1 and 6,961 and `page_rows` ≤ 50
- `receipts_total` ≤ 2,958 for any category filter — **greater than 2,958 means the `EXISTS` was written as a `JOIN` and receipts are duplicated**
- `invoices_total` = 2 unfiltered

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql
git commit -m "feat(billing-reports): five paginated list RPCs with hierarchy + scheme filters

Discounts route through bill_id and refunds through receipt_id (neither table
has institution_id). Category/academic-year reach receipts via an EXISTS
semi-join so a receipt allocated across several bills stays one row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The dashboard RPC

**Files:**
- Modify: `supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql` (append)

**Interfaces:**
- Consumes: `billing_report_student_cohort`.
- Produces: `get_billing_reports_dashboard(...)` returning a single `jsonb` shaped exactly like the existing `BillingDashboardMetrics` TypeScript interface (`types/billing-schedule.ts:828`).

The target shape, which must be filled exactly:

```
{ total_students, total_bills, total_amount_billed, total_amount_collected,
  total_outstanding, total_overdue, collection_rate,
  recent_transactions: { receipts: [], bills: [], refunds: [] },
  monthly_collection: [{ month, amount }],
  institution_wise_summary: [{ institution_id, institution_name, total_bills,
                               amount_billed, amount_collected, outstanding }] }
```

- [ ] **Step 1: Append the dashboard RPC**

```sql
-- 6) DASHBOARD — one jsonb payload replacing 15 client round-trips -----------
CREATE OR REPLACE FUNCTION public.get_billing_reports_dashboard(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL, p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL, p_schemes text[] DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inst uuid[];
  v_students uuid[];
  v_billed numeric; v_collected numeric;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN
    RETURN jsonb_build_object(
      'total_students', 0, 'total_bills', 0, 'total_amount_billed', 0,
      'total_amount_collected', 0, 'total_outstanding', 0, 'total_overdue', 0,
      'collection_rate', 0,
      'recent_transactions', jsonb_build_object('receipts', '[]'::jsonb, 'bills', '[]'::jsonb, 'refunds', '[]'::jsonb),
      'monthly_collection', '[]'::jsonb, 'institution_wise_summary', '[]'::jsonb);
  END IF;

  -- Cohort hoisted ONCE into an array. Do not inline the helper into the
  -- sub-queries below: it would be re-planned per aggregate.
  SELECT array_agg(student_id) INTO v_students
  FROM public.billing_report_student_cohort(
    v_inst, p_degree_id, p_department_id, p_program_id,
    p_semester_id, p_section_id, p_schemes);
  v_students := COALESCE(v_students, ARRAY[]::uuid[]);

  WITH bills AS (
    SELECT b.*
    FROM public.billing_student_bills b
    WHERE b.institution_id = ANY(v_inst)
      AND b.student_id = ANY(v_students)
      AND (p_student_id IS NULL OR b.student_id = p_student_id)
      AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
      AND (CASE
             WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
             WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
             ELSE true END)
  ),
  bills_in_range AS (
    SELECT * FROM bills
    WHERE (p_date_from IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
      AND (p_date_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
  ),
  receipts AS (
    SELECT r.*
    FROM public.billing_receipts r
    WHERE r.institution_id = ANY(v_inst)
      AND r.student_id = ANY(v_students)
      AND (p_student_id IS NULL OR r.student_id = p_student_id)
      AND (p_date_from IS NULL OR r.receipt_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.receipt_date <= p_date_to)
      AND (
        (p_item_category_id IS NULL AND p_academic_year_id IS NULL AND NOT p_academic_year_unspecified)
        OR EXISTS (SELECT 1 FROM bills b2
                   JOIN public.billing_receipt_items ri ON ri.bill_id = b2.id
                   WHERE ri.receipt_id = r.id)
      )
  )
  SELECT jsonb_build_object(
    'total_students', (SELECT COUNT(DISTINCT student_id) FROM bills),
    'total_bills',    (SELECT COUNT(*) FROM bills_in_range),
    'total_amount_billed',    COALESCE((SELECT SUM(final_amount) FROM bills_in_range), 0),
    'total_amount_collected', COALESCE((SELECT SUM(payment_amount) FROM receipts), 0),
    'total_outstanding', COALESCE((SELECT SUM(balance_amount) FROM bills
                                   WHERE status IN ('unpaid','partially_paid','overdue')
                                     AND COALESCE(balance_amount,0) > 0), 0),
    'total_overdue', COALESCE((SELECT SUM(balance_amount) FROM bills
                               WHERE status IN ('unpaid','partially_paid','overdue')
                                 AND COALESCE(balance_amount,0) > 0
                                 AND due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date), 0),
    'collection_rate', 0,  -- filled below once billed/collected are known
    'recent_transactions', jsonb_build_object(
      'receipts', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT id, receipt_number, receipt_date, payment_amount, payment_mode
          FROM receipts ORDER BY receipt_date DESC LIMIT 10) x), '[]'::jsonb),
      'bills', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT id, bill_description, due_date, final_amount, status
          FROM bills_in_range ORDER BY created_at DESC LIMIT 10) x), '[]'::jsonb),
      'refunds', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT rf.id, rf.refund_amount, rf.refund_date, rf.approval_status
          FROM public.billing_refunds rf
          JOIN receipts r2 ON r2.id = rf.receipt_id
          ORDER BY rf.created_at DESC LIMIT 10) x), '[]'::jsonb)),
    'monthly_collection', COALESCE((SELECT jsonb_agg(x ORDER BY x.month) FROM (
        SELECT to_char(receipt_date, 'YYYY-MM') AS month, SUM(payment_amount) AS amount
        FROM receipts GROUP BY 1) x), '[]'::jsonb),
    'institution_wise_summary', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT i.id AS institution_id, i.name AS institution_name,
               COUNT(b.id) AS total_bills,
               COALESCE(SUM(b.final_amount), 0) AS amount_billed,
               COALESCE((SELECT SUM(r3.payment_amount) FROM receipts r3
                         WHERE r3.institution_id = i.id), 0) AS amount_collected,
               COALESCE(SUM(b.balance_amount) FILTER (
                 WHERE b.status IN ('unpaid','partially_paid','overdue')
                   AND COALESCE(b.balance_amount,0) > 0), 0) AS outstanding
        FROM public.institutions i
        LEFT JOIN bills b ON b.institution_id = i.id
        WHERE i.id = ANY(v_inst)
        GROUP BY i.id, i.name
        ORDER BY i.name) x), '[]'::jsonb)
  ) INTO v_result;

  v_billed    := (v_result->>'total_amount_billed')::numeric;
  v_collected := (v_result->>'total_amount_collected')::numeric;

  RETURN jsonb_set(v_result, '{collection_rate}', to_jsonb(
    CASE WHEN v_billed > 0 THEN round(v_collected / v_billed * 100, 2) ELSE 0 END));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_reports_dashboard(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_reports_dashboard(uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text[], uuid, date, date) TO authenticated, service_role;

NOTIFY pgrst;
```

- [ ] **Step 2: Rehearse the whole migration**

Run the entire migration file inside `BEGIN; … ROLLBACK;` via `mcp__supabase__execute_sql`. Expected: no errors; 7 functions created. Then, still inside the transaction, verify the payload has every key the TypeScript interface needs:

```sql
SELECT jsonb_object_keys(public.get_billing_reports_dashboard()) ORDER BY 1;
```

Expected keys (10): `collection_rate, institution_wise_summary, monthly_collection, recent_transactions, total_amount_billed, total_amount_collected, total_bills, total_outstanding, total_overdue, total_students` — note this returns the zero-payload branch under a NULL `auth.uid()`, which is exactly what must still be shape-complete so the UI does not crash for a scopeless user. Every key in `BillingDashboardMetrics` (`types/billing-schedule.ts:828`) must appear here; a missing key surfaces as `undefined` in the KPI cards rather than an error.

- [ ] **Step 3: Apply the migration to production**

Use `mcp__supabase__apply_migration` with name `billing_reports_filter_rpcs` and the full file contents. Then verify all seven exist with correct ACLs:

```sql
SELECT p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'get_billing_reports_%' OR p.proname = 'billing_report_student_cohort')
ORDER BY p.proname;
```

Expected: 7 rows. `anon_can_execute = false` on all 7. `auth_can_execute = true` on all 7.
`billing_report_student_cohort` must have **`prosecdef = false` and `proconfig = NULL`** — if `proconfig` is populated, inlining is disabled and Task 2 Step 3 must be redone.

- [ ] **Step 4: Record the migration in the SQL index**

Add a dated entry to the top of the `## 📝 Recent Changes` list in `supabase/SQL_FILE_INDEX.md`, following the house style of the surrounding entries: date, title, filename, applied status and timestamp, tier classification, what each function does, the ACL posture, and the verification counts (FG 1,449 / PMSS 435 / 7.5% 204 / Others 4,873 / all-four 6,961).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260725103000_billing_reports_filter_rpcs.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(billing-reports): dashboard aggregate RPC + apply migration

Replaces 15 client round-trips with one jsonb payload matching
BillingDashboardMetrics exactly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rewrite the report service

**Files:**
- Modify: `lib/services/billing/reports/billing-report-service.ts` (full rewrite)

**Interfaces:**
- Consumes: `buildReportScope`, `buildReportPage`, `EXPORT_PAGE`, `REPORT_PAGE_SIZE` (Task 1); the six RPCs (Tasks 3–4).
- Produces: `BillingReportService.getDashboardMetrics(filters)`, `.getOutstandingReport(filters, page)`, `.getCollectionReport(filters, page)`, `.getInvoiceReport(filters, page)`, `.getDiscountReport(filters, page)`, `.getRefundReport(filters, page)` — each list method returning `{ rows: T[]; totalCount: number }` — and `.exportReport(reportType, filters, options)`. Task 8 consumes these.

**Note on the signature change:** `getDashboardMetrics` currently takes `(institutionId, dateFrom, dateTo)`. It becomes `(filters: BillingReportFilters)`. The only caller is `useBillingDashboardMetrics` in `hooks/billing/use-billing-reports.ts:32`, updated in Task 8.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `lib/services/billing/reports/billing-report-service.ts`:

```ts
import { BaseService } from '@/lib/services/base-service';
import {
  buildReportScope,
  buildReportPage,
  EXPORT_PAGE,
  REPORT_PAGE_SIZE,
} from './report-filter-params';
import type {
  BillingReportFilters,
  OutstandingReport,
  CollectionReport,
  DiscountReport,
  RefundReport,
  InvoiceReport,
  BillingDashboardMetrics,
  ReportExportOptions,
} from '@/types/billing-schedule';

/** A page of report rows plus the unpaginated total, for "showing X–Y of N". */
export interface ReportPage<T> {
  rows: T[];
  totalCount: number;
}

/**
 * Thin wrapper over the six /billing/reports RPCs (migration 20260725103000).
 * Filtering, aggregation, the permission gate and institution scope all live in
 * Postgres — see docs/superpowers/specs/2026-07-25-billing-reports-filters-design.md.
 */
export class BillingReportService extends BaseService {
  private static page<T extends { total_count?: number | string }>(
    rows: T[] | null
  ): ReportPage<Omit<T, 'total_count'>> {
    const list = rows ?? [];
    // total_count is bigint — PostgREST serialises it as a string.
    const totalCount = list.length > 0 ? Number(list[0].total_count ?? 0) : 0;
    return {
      rows: list.map(({ total_count: _drop, ...rest }) => rest) as Omit<T, 'total_count'>[],
      totalCount,
    };
  }

  static async getDashboardMetrics(
    filters: BillingReportFilters = {}
  ): Promise<BillingDashboardMetrics> {
    return this.executeDashboardRPC<BillingDashboardMetrics>(
      'get_billing_reports_dashboard',
      buildReportScope(filters)
    );
  }

  static async getOutstandingReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<OutstandingReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_outstanding',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<OutstandingReport>;
  }

  static async getCollectionReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<CollectionReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_collection',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<CollectionReport>;
  }

  static async getInvoiceReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<InvoiceReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_invoices',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<InvoiceReport>;
  }

  static async getDiscountReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<DiscountReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_discounts',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<DiscountReport>;
  }

  static async getRefundReport(
    filters: BillingReportFilters = {},
    page = 1,
    pageSize = REPORT_PAGE_SIZE
  ): Promise<ReportPage<RefundReport>> {
    const rows = await this.executeDashboardRPC<any[]>(
      'get_billing_reports_refunds',
      { ...buildReportScope(filters), ...buildReportPage(page, pageSize) }
    );
    return this.page(rows) as ReportPage<RefundReport>;
  }

  private static readonly EXPORT_RPC: Record<string, string> = {
    outstanding: 'get_billing_reports_outstanding',
    collection: 'get_billing_reports_collection',
    invoice: 'get_billing_reports_invoices',
    discount: 'get_billing_reports_discounts',
    refund: 'get_billing_reports_refunds',
  };

  /** Exports the FULL filtered set (p_limit null), not the visible page. */
  static async exportReport(
    reportType: string,
    filters: BillingReportFilters,
    options: ReportExportOptions
  ): Promise<void> {
    const fn = this.EXPORT_RPC[reportType];
    if (!fn) throw new Error(`Unknown report type: ${reportType}`);

    const rows = await this.executeDashboardRPC<any[]>(fn, {
      ...buildReportScope(filters),
      ...EXPORT_PAGE,
    });

    const data = (rows ?? []).map(({ total_count: _drop, ...rest }) => rest);
    if (data.length === 0) throw new Error('No data matches the current filters');

    this.downloadCsv(data, `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`);
    void options;
  }

  private static downloadCsv(rows: Record<string, unknown>[], filename: string): void {
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\n');

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

The previous `exportToPDF` / `exportToExcel` stubs threw "not implemented"; CSV is the only format that ever worked. The tab components' format `<select>` is reduced to CSV in Task 8.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: errors **only** in `hooks/billing/use-billing-reports.ts` (call sites still expect the old array-returning signatures). Those are fixed in Task 8. Note the exact error list — it is the checklist for Task 8.

- [ ] **Step 3: Confirm nothing else imported the deleted helpers**

Run: `npx grep -rn "getTransactionSummary\|getTotalStudents\|getInstitutionWiseSummary" --include=*.ts --include=*.tsx .`

Expected: matches only in `hooks/billing/use-billing-reports.ts` (`useTransactionSummary`). If any other page uses `useTransactionSummary`, keep that hook working by pointing it at `getDashboardMetrics` and mapping the fields; otherwise delete the hook in Task 8.

- [ ] **Step 4: Commit**

```bash
git add lib/services/billing/reports/billing-report-service.ts
git commit -m "refactor(billing-reports): service becomes a thin RPC wrapper

Deletes ~15 private aggregate helpers and the getOutstandingReport query
that selected a nonexistent \`students\` relation (PGRST200) — the reason
the Outstanding tab has always shown an error card.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The cascading hierarchy hook

**Files:**
- Create: `hooks/organization/use-academic-hierarchy-filters.ts`

**Interfaces:**
- Consumes: `useInstitutionsWithAccess` (`hooks/organization/use-institutions-with-access.ts`), and the org services listed below.
- Produces: `useAcademicHierarchyFilters(filters)` returning `{ institutions, academicYears, degrees, departments, programs, semesters, sections, categories, loading, hasMultiInstitutionAccess, cascadeClear }`. Task 7 consumes it.

**Verified service signatures** (do not guess these):

| Level | Call | Display field |
|---|---|---|
| Academic years | `AcademicYearService.getAcademicYearsByInstitution(institutionId)` | `academic_year_name` |
| Degrees | `DegreeService.getDegreesByInstitution(institutionId)` | `degree_name` |
| Departments | `DepartmentService.getDepartmentsByDegree(degreeId)` | `department_name` |
| Programs | `ProgramService.getProgramsByDepartment(departmentId)` | `program_name` |
| Semesters | `SemesterService.getSemestersByProgram(programId)` | `semester_name` |
| Sections | `SectionService.getSectionsBySemester(semesterId)` | `section_name` |
| Categories | `BillingCategoryService.getActiveBillingCategories()` | `category_name` |

**Use `getActiveBillingCategories()`, not `getBillingCategories()`.** The latter defaults to `limit = 10` and there are 17 active categories — Schedule Management's filter silently shows only 10 of them. Do not copy that bug.

- [ ] **Step 1: Write the hook**

Create `hooks/organization/use-academic-hierarchy-filters.ts`:

```ts
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';

export interface HierarchyOption {
  id: string;
  name: string;
}

export interface HierarchySelection {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
}

/** Clearing a level must clear everything below it, or the query filters on a
 *  child that no longer belongs to the newly-chosen parent. */
export const CASCADE_CLEAR_MAP: Record<string, string[]> = {
  institution_id: ['degree_id', 'department_id', 'program_id', 'semester_id', 'section_id', 'academic_year_id'],
  degree_id: ['department_id', 'program_id', 'semester_id', 'section_id'],
  department_id: ['program_id', 'semester_id', 'section_id'],
  program_id: ['semester_id', 'section_id'],
  semester_id: ['section_id'],
};

const pick = (row: any): HierarchyOption => ({
  id: row.id,
  name:
    row.name ??
    row.degree_name ??
    row.department_name ??
    row.program_name ??
    row.semester_name ??
    row.section_name ??
    row.category_name ??
    row.academic_year_name ??
    'Unknown',
});

function useLevel(
  parentId: string | undefined,
  load: (id: string) => Promise<any[]>
) {
  const [options, setOptions] = useState<HierarchyOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!parentId) {
      setOptions([]);
      return;
    }
    setLoading(true);
    load(parentId)
      .then((rows) => {
        if (!cancelled) setOptions((rows ?? []).map(pick));
      })
      .catch((err) => {
        console.error('[hierarchy-filters] level load failed:', err);
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is a module-level service method; stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  return { options, loading };
}

export function useAcademicHierarchyFilters(sel: HierarchySelection) {
  const { institutions: accessible, loading: loadingInstitutions } =
    useInstitutionsWithAccess({ isActive: true });

  const academicYears = useLevel(sel.institution_id, (id) =>
    AcademicYearService.getAcademicYearsByInstitution(id)
  );
  const degrees = useLevel(sel.institution_id, (id) =>
    DegreeService.getDegreesByInstitution(id)
  );
  const departments = useLevel(sel.degree_id, (id) =>
    DepartmentService.getDepartmentsByDegree(id)
  );
  const programs = useLevel(sel.department_id, (id) =>
    ProgramService.getProgramsByDepartment(id)
  );
  const semesters = useLevel(sel.program_id, (id) =>
    SemesterService.getSemestersByProgram(id)
  );
  const sections = useLevel(sel.semester_id, (id) =>
    SectionService.getSectionsBySemester(id)
  );

  const [categories, setCategories] = useState<HierarchyOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    // getActiveBillingCategories, NOT getBillingCategories — the latter
    // defaults to limit=10 and there are 17 active categories.
    BillingCategoryService.getActiveBillingCategories()
      .then((rows) => {
        if (!cancelled) setCategories((rows ?? []).map(pick));
      })
      .catch((err) => console.error('[hierarchy-filters] categories failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const institutions = useMemo<HierarchyOption[]>(
    () => accessible.map((i) => ({ id: i.id, name: i.name })),
    [accessible]
  );

  /** Returns the patch to apply when `key` changes: the new value plus every
   *  descendant cleared. Callers merge it into their filter state in one update. */
  const cascadeClear = useCallback(
    (key: string, value: string | undefined): Record<string, string | undefined> => {
      const patch: Record<string, string | undefined> = { [key]: value };
      for (const child of CASCADE_CLEAR_MAP[key] ?? []) patch[child] = undefined;
      return patch;
    },
    []
  );

  return {
    institutions,
    hasMultiInstitutionAccess: accessible.length > 1,
    academicYears: academicYears.options,
    degrees: degrees.options,
    departments: departments.options,
    programs: programs.options,
    semesters: semesters.options,
    sections: sections.options,
    categories,
    loading: {
      institutions: loadingInstitutions,
      academicYears: academicYears.loading,
      degrees: degrees.loading,
      departments: departments.loading,
      programs: programs.loading,
      semesters: semesters.loading,
      sections: sections.loading,
    },
    cascadeClear,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add hooks/organization/use-academic-hierarchy-filters.ts
git commit -m "feat(organization): cascading academic hierarchy filter hook

Uses getActiveBillingCategories (unpaginated) rather than
getBillingCategories, whose limit=10 default truncates 17 categories.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Rewrite the filter panel

**Files:**
- Modify: `app/(routes)/billing/reports/_components/report-filters.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAcademicHierarchyFilters`, `cascadeClear` (Task 6); `ACADEMIC_YEAR_UNSPECIFIED` (Task 1); `REPORT_SCHEME_OPTIONS`, `ReportSchemeKey`, `BillingReportFilters` (Task 1).
- Produces: `<ReportFilters filters onFilterChange />` where `onFilterChange` receives a `Partial<BillingReportFilters>` patch (unchanged from today's contract, so `page.tsx` keeps working).

- [ ] **Step 1: Replace the component**

Replace the entire contents of `app/(routes)/billing/reports/_components/report-filters.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Filter, RotateCcw, X, ChevronDown } from 'lucide-react';
import {
  useAcademicHierarchyFilters,
  type HierarchyOption,
} from '@/hooks/organization/use-academic-hierarchy-filters';
import { ACADEMIC_YEAR_UNSPECIFIED } from '@/lib/services/billing/reports/report-filter-params';
import {
  REPORT_SCHEME_OPTIONS,
  type BillingReportFilters,
  type ReportSchemeKey,
} from '@/types/billing-schedule';

interface ReportFiltersProps {
  filters: BillingReportFilters;
  onFilterChange: (patch: Partial<BillingReportFilters>) => void;
}

const ALL = '_all_';

function FilterSelect({
  label, value, options, onChange, disabled, allLabel, extraItem,
}: {
  label: string;
  value: string | undefined;
  options: HierarchyOption[];
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  allLabel: string;
  extraItem?: { value: string; label: string };
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Select
        value={value || ALL}
        onValueChange={(v) => onChange(v === ALL ? undefined : v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent className='max-h-60 overflow-y-auto'>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {extraItem && (
            <SelectItem value={extraItem.value}>{extraItem.label}</SelectItem>
          )}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ReportFilters({ filters, onFilterChange }: ReportFiltersProps) {
  const [collapsed, setCollapsed] = useState(false);
  const h = useAcademicHierarchyFilters(filters);

  const set = (key: string, value: string | undefined) =>
    onFilterChange(h.cascadeClear(key, value) as Partial<BillingReportFilters>);

  const schemes = filters.schemes ?? [];
  const toggleScheme = (key: ReportSchemeKey, on: boolean) =>
    onFilterChange({
      schemes: on ? [...schemes, key] : schemes.filter((s) => s !== key),
    });

  const nameOf = (list: HierarchyOption[], id?: string) =>
    list.find((o) => o.id === id)?.name ?? 'Unknown';

  const chips = useMemo(() => {
    const out: { key: keyof BillingReportFilters; label: string }[] = [];
    if (filters.institution_id) out.push({ key: 'institution_id', label: `Institution: ${nameOf(h.institutions, filters.institution_id)}` });
    if (filters.academic_year_id) out.push({
      key: 'academic_year_id',
      label: `Academic Year: ${filters.academic_year_id === ACADEMIC_YEAR_UNSPECIFIED
        ? 'Unspecified' : nameOf(h.academicYears, filters.academic_year_id)}`,
    });
    if (filters.degree_id) out.push({ key: 'degree_id', label: `Degree: ${nameOf(h.degrees, filters.degree_id)}` });
    if (filters.department_id) out.push({ key: 'department_id', label: `Department: ${nameOf(h.departments, filters.department_id)}` });
    if (filters.program_id) out.push({ key: 'program_id', label: `Program: ${nameOf(h.programs, filters.program_id)}` });
    if (filters.semester_id) out.push({ key: 'semester_id', label: `Semester: ${nameOf(h.semesters, filters.semester_id)}` });
    if (filters.section_id) out.push({ key: 'section_id', label: `Section: ${nameOf(h.sections, filters.section_id)}` });
    if (filters.item_category_id) out.push({ key: 'item_category_id', label: `Category: ${nameOf(h.categories, filters.item_category_id)}` });
    for (const s of schemes) {
      out.push({ key: 'schemes', label: REPORT_SCHEME_OPTIONS.find((o) => o.value === s)?.label ?? s });
    }
    return out;
  }, [filters, h, schemes]);

  const clearAll = () =>
    onFilterChange({
      institution_id: undefined, academic_year_id: undefined,
      degree_id: undefined, department_id: undefined, program_id: undefined,
      semester_id: undefined, section_id: undefined, item_category_id: undefined,
      schemes: [], student_id: undefined,
      date_from: undefined, date_to: undefined,
    });

  const schemeLabel =
    schemes.length === 0 ? 'All Students'
      : schemes.length === 1
        ? REPORT_SCHEME_OPTIONS.find((o) => o.value === schemes[0])?.label
        : `${schemes.length} categories`;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Filter className='h-4 w-4' />
          <span className='font-medium'>Report Filters</span>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='ghost' size='sm' onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? 'Expand' : 'Collapse'}
          </Button>
          {chips.length > 0 && (
            <Button variant='ghost' size='sm' onClick={clearAll}>
              <RotateCcw className='mr-2 h-4 w-4' />
              Reset All
            </Button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {chips.map((c) => (
            <Badge key={`${c.key}-${c.label}`} variant='secondary' className='flex items-center gap-1'>
              {c.label}
              <Button
                variant='ghost'
                size='sm'
                className='h-auto p-0 text-current'
                onClick={() =>
                  c.key === 'schemes'
                    ? onFilterChange({
                        schemes: schemes.filter(
                          (s) => REPORT_SCHEME_OPTIONS.find((o) => o.value === s)?.label !== c.label
                        ),
                      })
                    : set(c.key as string, undefined)
                }
              >
                <X className='h-3 w-3' />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {!collapsed && (
        <>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {h.hasMultiInstitutionAccess && (
              <FilterSelect
                label='Institution' allLabel='All Institutions'
                value={filters.institution_id} options={h.institutions}
                disabled={h.loading.institutions}
                onChange={(v) => set('institution_id', v)}
              />
            )}

            <div className='space-y-2'>
              <FilterSelect
                label='Academic Year' allLabel='All Academic Years'
                value={filters.academic_year_id} options={h.academicYears}
                disabled={!filters.institution_id || h.loading.academicYears}
                extraItem={{ value: ACADEMIC_YEAR_UNSPECIFIED, label: 'Unspecified' }}
                onChange={(v) => set('academic_year_id', v)}
              />
              {filters.academic_year_id &&
                filters.academic_year_id !== ACADEMIC_YEAR_UNSPECIFIED && (
                  <p className='text-muted-foreground text-xs'>
                    Bills with no academic year recorded are excluded. Choose
                    &ldquo;Unspecified&rdquo; to see them.
                  </p>
                )}
            </div>

            <FilterSelect
              label='Degree' allLabel='All Degrees'
              value={filters.degree_id} options={h.degrees}
              disabled={!filters.institution_id || h.loading.degrees}
              onChange={(v) => set('degree_id', v)}
            />
            <FilterSelect
              label='Department' allLabel='All Departments'
              value={filters.department_id} options={h.departments}
              disabled={!filters.degree_id || h.loading.departments}
              onChange={(v) => set('department_id', v)}
            />
            <FilterSelect
              label='Program' allLabel='All Programs'
              value={filters.program_id} options={h.programs}
              disabled={!filters.department_id || h.loading.programs}
              onChange={(v) => set('program_id', v)}
            />
            <FilterSelect
              label='Semester' allLabel='All Semesters'
              value={filters.semester_id} options={h.semesters}
              disabled={!filters.program_id || h.loading.semesters}
              onChange={(v) => set('semester_id', v)}
            />
            <FilterSelect
              label='Section' allLabel='All Sections'
              value={filters.section_id} options={h.sections}
              disabled={!filters.semester_id || h.loading.sections}
              onChange={(v) => set('section_id', v)}
            />
            <FilterSelect
              label='Category' allLabel='All Categories'
              value={filters.item_category_id} options={h.categories}
              onChange={(v) => set('item_category_id', v)}
            />

            <div className='space-y-2'>
              <Label>Student Category</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant='outline' className='w-full justify-between font-normal'>
                    {schemeLabel}
                    <ChevronDown className='h-4 w-4 opacity-50' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-56 space-y-2' align='start'>
                  {REPORT_SCHEME_OPTIONS.map((o) => (
                    <label key={o.value} className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={schemes.includes(o.value)}
                        onCheckedChange={(c) => toggleScheme(o.value, c === true)}
                      />
                      {o.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='date_from'>Date From</Label>
              <Input
                id='date_from' type='date' value={filters.date_from || ''}
                max={filters.date_to || undefined}
                onChange={(e) => onFilterChange({ date_from: e.target.value || undefined })}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='date_to'>Date To</Label>
              <Input
                id='date_to' type='date' value={filters.date_to || ''}
                min={filters.date_from || undefined}
                onChange={(e) => onFilterChange({ date_to: e.target.value || undefined })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Confirm the Checkbox and Popover primitives exist**

Run: `ls components/ui/checkbox.tsx components/ui/popover.tsx`
Expected: both exist. If either is missing, add it with `npx shadcn@latest add checkbox popover` before continuing.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors in this file. Remaining errors are still only in `use-billing-reports.ts`.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/billing/reports/_components/report-filters.tsx"
git commit -m "feat(billing-reports): cascading hierarchy + multi-select category filter panel

Institution list moves to useInstitutionsWithAccess so the dropdown matches
the scope the RPCs enforce; single-institution users no longer see the control.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Pagination — component, hooks, and the five tabs

**Files:**
- Create: `app/(routes)/billing/reports/_components/report-pagination.tsx`
- Modify: `hooks/billing/use-billing-reports.ts` (full rewrite)
- Modify: the five tab components in `app/(routes)/billing/reports/_components/`

**Interfaces:**
- Consumes: `BillingReportService.*` and `ReportPage<T>` (Task 5).
- Produces: `<ReportPagination page pageSize totalCount onPageChange />`; hooks `useBillingDashboardMetrics(filters)`, `useOutstandingReport(filters)`, `useCollectionReport(filters)`, `useInvoiceReport(filters)`, `useDiscountReport(filters)`, `useRefundReport(filters)` — each list hook returning `{ report, totalCount, page, setPage, loading, error, refetch }`.

- [ ] **Step 1: Create the pagination component**

Create `app/(routes)/billing/reports/_components/report-pagination.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function ReportPagination({ page, pageSize, totalCount, onPageChange }: Props) {
  if (totalCount === 0) return null;

  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);

  return (
    <div className='flex flex-col items-center justify-between gap-3 border-t pt-4 sm:flex-row'>
      <p className='text-muted-foreground text-sm'>
        Showing {first}–{last} of {totalCount.toLocaleString('en-IN')}
      </p>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline' size='sm'
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className='mr-1 h-4 w-4' /> Previous
        </Button>
        <span className='text-sm'>Page {page} of {lastPage}</span>
        <Button
          variant='outline' size='sm'
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className='ml-1 h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the hooks**

Replace the entire contents of `hooks/billing/use-billing-reports.ts`:

```ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  BillingReportService,
  type ReportPage,
} from '@/lib/services/billing/reports/billing-report-service';
import { REPORT_PAGE_SIZE } from '@/lib/services/billing/reports/report-filter-params';
import type {
  BillingReportFilters,
  BillingDashboardMetrics,
  OutstandingReport,
  CollectionReport,
  DiscountReport,
  RefundReport,
  InvoiceReport,
  ReportExportOptions,
} from '@/types/billing-schedule';

export function useBillingDashboardMetrics(filters: BillingReportFilters = {}) {
  const [metrics, setMetrics] = useState<BillingDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serialised so a caller passing a fresh object literal each render does not
  // re-trigger the effect forever.
  const key = JSON.stringify(filters);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setMetrics(await BillingReportService.getDashboardMetrics(JSON.parse(key)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard metrics';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  return { metrics, loading, error, refetch: fetchMetrics };
}

/** Shared engine for the five paginated list tabs. */
function useReportList<T>(
  filters: BillingReportFilters,
  fetcher: (f: BillingReportFilters, page: number) => Promise<ReportPage<T>>,
  label: string
) {
  const [report, setReport] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(filters);
  const prevKey = useRef(key);

  // A filter change invalidates the current page number — page 7 of the old
  // result set is meaningless against the new one.
  useEffect(() => {
    if (prevKey.current !== key) {
      prevKey.current = key;
      setPage(1);
    }
  }, [key]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetcher(JSON.parse(key), page);
      setReport(res.rows);
      setTotalCount(res.totalCount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to fetch ${label}`;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
    // `fetcher` is a module-level static method; stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, label]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  return { report, totalCount, page, setPage, loading, error, refetch: fetchReport, pageSize: REPORT_PAGE_SIZE };
}

export const useOutstandingReport = (f: BillingReportFilters = {}) =>
  useReportList<OutstandingReport>(f, (ff, p) => BillingReportService.getOutstandingReport(ff, p), 'outstanding report');

export const useCollectionReport = (f: BillingReportFilters = {}) =>
  useReportList<CollectionReport>(f, (ff, p) => BillingReportService.getCollectionReport(ff, p), 'collection report');

export const useInvoiceReport = (f: BillingReportFilters = {}) =>
  useReportList<InvoiceReport>(f, (ff, p) => BillingReportService.getInvoiceReport(ff, p), 'invoice report');

export const useDiscountReport = (f: BillingReportFilters = {}) =>
  useReportList<DiscountReport>(f, (ff, p) => BillingReportService.getDiscountReport(ff, p), 'discount report');

export const useRefundReport = (f: BillingReportFilters = {}) =>
  useReportList<RefundReport>(f, (ff, p) => BillingReportService.getRefundReport(ff, p), 'refund report');

export function useReportExport() {
  const [loading, setLoading] = useState(false);

  const exportReport = useCallback(
    async (reportType: string, filters: BillingReportFilters, options: ReportExportOptions) => {
      try {
        setLoading(true);
        await BillingReportService.exportReport(reportType, filters, options);
        toast.success('Report exported successfully');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to export report');
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { exportReport, loading };
}
```

`useTransactionSummary` is deleted — Task 5 Step 3 confirmed the reports page was its only consumer. If that grep found another consumer, keep the hook and back it with `getDashboardMetrics`.

- [ ] **Step 3: Wire pagination into the five tabs**

In each of `outstanding-report-tab.tsx`, `collection-report-tab.tsx`, `invoice-report-tab.tsx`, `discount-report-tab.tsx`, `refund-report-tab.tsx`:

1. Destructure the new fields from the hook, e.g. in `outstanding-report-tab.tsx` change line 42 from
   `const { report, loading, error, refetch } = useOutstandingReport(filters);`
   to
   `const { report, totalCount, page, setPage, pageSize, loading, error, refetch } = useOutstandingReport(filters);`
2. Import the pagination component: `import { ReportPagination } from './report-pagination';`
3. Render it as the last child inside the report `<CardContent>`, immediately after the table/list block:
   ```tsx
   <ReportPagination
     page={page}
     pageSize={pageSize}
     totalCount={totalCount}
     onPageChange={setPage}
   />
   ```
4. Replace the three-option export format `<select>` (PDF/Excel/CSV) with a plain CSV export button — PDF and Excel were never implemented and threw. In `outstanding-report-tab.tsx` that means deleting the `exportFormat` state (line 38) and the `<select>` (lines 155–165), and changing `handleExport` to pass `{ format: 'csv', include_summary: true, include_charts: false }`.
5. In `outstanding-report-tab.tsx` only: the summary cards at lines 70–78 compute totals by reducing the *page* array. Change the two currency cards to read from the tab's own reduce (correct for "this page") and relabel them "Outstanding (this page)" / "Overdue (this page)", and change the student count card to `{totalCount}` with the label "Students with Outstanding".

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: **zero errors**. This is the point where the whole chain compiles.

- [ ] **Step 5: Re-run the unit tests**

Run: `npx vitest run __tests__/billing/report-filter-params.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/billing/reports/_components/" hooks/billing/use-billing-reports.ts
git commit -m "feat(billing-reports): server-side pagination on the five list tabs

Outstanding matches 7,342 bills across ~2,000 students; without paging the
now-working query would render 2,000 nested tables. Export fetches the full
filtered set rather than the visible page. Drops the PDF/Excel format select,
which always threw.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Page wiring

**Files:**
- Modify: `app/(routes)/billing/reports/page.tsx:41-75`

**Interfaces:**
- Consumes: `useBillingDashboardMetrics(filters)` (Task 8), `<ReportFilters>` (Task 7).
- Produces: nothing downstream.

- [ ] **Step 1: Update the metrics call and drop the analytics split**

In `app/(routes)/billing/reports/page.tsx`:

1. Replace the `useBillingDashboardMetrics` call (lines 55–64) with:
   ```tsx
   const {
     metrics,
     loading: metricsLoading,
     error: metricsError,
     refetch: refetchMetrics
   } = useBillingDashboardMetrics(filters);
   ```
2. Leave the `useCollectionSplit` block (lines 71–75) as-is but extend its argument so the split honours the filters it can express:
   ```tsx
   const collectionSplit = useCollectionSplit({
     institution_ids: filters.institution_id ? [filters.institution_id] : undefined,
     date_from: filters.date_from,
     date_to: filters.date_to,
   });
   ```
   That RPC belongs to the analytics feature and takes no hierarchy params; leaving it institution+date scoped is deliberate. Add a comment saying so.
3. `handleFilterChange` (lines 100–102) already merges patches — no change needed.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: zero errors.

Run: `npx next build --turbopack --no-lint` *(or `npm run build` if you want the full gate chain; it also runs `check:sidebar`, `check:reachability` and `check:audit-coverage`, none of which this change affects)*
Expected: `/billing/reports` compiles.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/reports/page.tsx"
git commit -m "feat(billing-reports): pass the full filter set to the dashboard tab

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: End-to-end verification

**Files:** none modified unless a defect is found.

- [ ] **Step 1: SQL assertions against production**

Run each via `mcp__supabase__execute_sql`:

```sql
-- Cohort partition (must match the spec exactly)
SELECT
  (SELECT count(*) FROM billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['first_graduate'])) fg,
  (SELECT count(*) FROM billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['pmss'])) pmss,
  (SELECT count(*) FROM billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['scholarship_7_5'])) s75,
  (SELECT count(*) FROM billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,ARRAY['other'])) other,
  (SELECT count(*) FROM billing_report_student_cohort(NULL,NULL,NULL,NULL,NULL,NULL,
     ARRAY['first_graduate','pmss','scholarship_7_5','other'])) all_four;
```
Expected: `1449, 435, 204, 4873, 6961`.

- [ ] **Step 2: Assert the three empty tabs are correct-and-empty, not broken-and-empty**

`billing_discounts` and `billing_refunds` have 0 rows and `billing_invoices` has 2, so the UI cannot tell a working query from a broken one. Assert against SQL instead. Run each RPC's body logic directly (the RPCs themselves return nothing outside an authenticated session — see the note at the end of this plan), then compare:

```sql
SELECT
  (SELECT count(*) FROM billing_discounts) AS raw_discounts,
  (SELECT count(*) FROM billing_refunds)   AS raw_refunds,
  (SELECT count(*) FROM billing_invoices)  AS raw_invoices,
  -- The join path each RPC uses must not lose rows when unfiltered.
  (SELECT count(*) FROM billing_discounts d
     JOIN billing_student_bills b ON b.id = d.bill_id)        AS discounts_via_bill,
  (SELECT count(*) FROM billing_refunds rf
     JOIN billing_receipts r ON r.id = rf.receipt_id)          AS refunds_via_receipt,
  (SELECT count(*) FROM billing_invoices inv
     JOIN billing_report_student_cohort() c ON c.student_id = inv.student_id) AS invoices_via_cohort;
```

Expected: `discounts_via_bill = raw_discounts`, `refunds_via_receipt = raw_refunds`, `invoices_via_cohort = raw_invoices = 2`. Any join-path count *below* its raw count means rows are being dropped by an orphaned FK, and the tab would under-report the moment real data arrives.

- [ ] **Step 3: Confirm the helper still inlines in production**

**Use a literal uuid, never a sub-SELECT** — a sub-SELECT argument blocks inlining and yields a false failure (see Task 2 Step 3).

```sql
SELECT id::text FROM degrees LIMIT 1;   -- copy the value

EXPLAIN (COSTS OFF)
SELECT count(*) FROM billing_report_student_cohort(
  NULL, '<PASTE_DEGREE_UUID>'::uuid, NULL, NULL, NULL, NULL, NULL);
```
Expected: an Index Only Scan on `idx_learners_profiles_degree_id` with `learners_profiles lp` in the plan — **not** `Function Scan on billing_report_student_cohort`.

Belt-and-braces: `SELECT prosecdef, proconfig FROM pg_proc WHERE proname='billing_report_student_cohort'` must return `false` / `NULL`.

**This check is necessary but NOT sufficient** — it cannot on its own prove inlining, only rule out the two causes we control. The `EXPLAIN` above (with a literal argument) is the authoritative test; treat `prosecdef`/`proconfig` as a diagnostic for *why* a real failure happened, never as a substitute for the plan.

- [ ] **Step 4: Permission denial**

Impersonation is done by setting the JWT claims inside a rolled-back transaction — the pattern used throughout `docs/plans/` (e.g. `2026-05-31-my-hostel-resident-module.md:39`). First pick a subject that lacks the permission:

```sql
-- Find a profile whose roles do NOT grant billing.reports.view (students qualify).
SELECT p.id FROM profiles p
WHERE NOT public.user_has_permission(p.id, 'billing.reports.view')
LIMIT 1;
```

Then, in one `execute_sql` call:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<PROFILE_ID_FROM_ABOVE>","role":"authenticated"}';
SELECT * FROM public.get_billing_reports_outstanding(p_limit => 5);
ROLLBACK;
```

Expected: the call raises SQLSTATE `42501` with `permission denied: billing.reports.view`. A result set instead means the gate is missing from that function — check all six.

- [ ] **Step 5: Institution confinement**

Pick a profile holding `billing.reports.view` whose role has `institution_scope = 'own'`, then:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<OWN_SCOPE_PROFILE_ID>","role":"authenticated"}';

-- (a) Unfiltered: every row must belong to that user's own institution.
SELECT count(DISTINCT lp.institution_id) AS distinct_institutions
FROM public.get_billing_reports_outstanding(p_limit => NULL) o
JOIN public.learners_profiles lp ON lp.id = o.student_id;

-- (b) Asking for someone else's institution must yield nothing.
SELECT count(*) AS leaked
FROM public.get_billing_reports_outstanding(
  p_institution_ids => ARRAY[(SELECT id FROM public.institutions
                              WHERE id <> (SELECT institution_id FROM public.profiles
                                           WHERE id = '<OWN_SCOPE_PROFILE_ID>')
                              LIMIT 1)]::uuid[],
  p_limit => 50);
ROLLBACK;
```

Expected: `distinct_institutions = 1` and `leaked = 0`.

- [ ] **Step 6: The receipt-duplication check**

```sql
SELECT max(total_count) FROM get_billing_reports_collection(
  p_item_category_id => (SELECT id FROM billing_categories WHERE is_active LIMIT 1),
  p_limit => 50);
```
Expected: **≤ 2,958**. A number above the total receipt count means the `EXISTS` was written as a `JOIN` and receipts are being duplicated.

- [ ] **Step 7: Manual UI pass**

Start the dev server (`npm run dev`) and visit `/billing/reports`:

1. **Outstanding tab renders** — no red error card. This is the §2.6 regression check.
2. **Cascade** — pick an institution, then a degree; the Department select populates. Change the institution; degree/department/program/semester/section/academic-year all reset to "All".
3. **Unspecified academic year** — selecting it returns bills, and the inline hint appears only when a *specific* year is chosen.
4. **Multi-select schemes** — tick First Graduate + PMSS; two chips appear; results are the union. Tick Others alone; results are the non-scheme majority. Tick all four; the result matches no filter at all.
5. **Pagination** — Next/Previous move through pages; the first page has Previous disabled, the last page has Next disabled; "Showing X–Y of N" is consistent.
6. **Export** — the downloaded CSV row count equals the reported `total_count`, not the 50 on screen.
7. **Dashboard tab** — the KPI cards change when a degree or scheme filter is applied.
8. **Single-institution user** — sign in as one; the Institution select is absent.

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: no new warnings in the touched files.

- [ ] **Step 9: Final commit and push**

```bash
git add -A
git commit -m "test(billing-reports): verification pass for hierarchy + category filters

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/billing-reports-filters
```

---

## Notes for the implementer

- **Do not "fix" the missing `SET search_path` on `billing_report_student_cohort`.** It is deliberate and load-bearing; see Task 2. The other six functions do have it, because they are `plpgsql` and never inlined.
- **Do not replace the `EXISTS` clauses with joins.** They are semi-joins that deliberately avoid multiplying receipt and invoice rows.
- **The migration is applied to production**, not a local database. Always rehearse inside `BEGIN … ROLLBACK` first.
- If a rehearsal returns zero rows everywhere, that is usually the `IF v_inst IS NULL THEN RETURN; END IF;` guard firing because `auth.uid()` is NULL outside an authenticated session — not a bug in the query.
