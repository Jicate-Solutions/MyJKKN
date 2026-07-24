# Accountant Advanced Reports Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new, redesigned `/billing/reports/accountant` hub giving the `accounts` role college/course/date-wise collections, pending-by-academic-year, bills-cleared, and First Graduate / PMSS / fee-reduction scheme reports across all colleges.

**Architecture:** A tabbed client dashboard (Overview / Collections / Outstanding / Cleared / Schemes) with a sticky URL-driven filter bar (college · academic year · date range · scheme cohort). All aggregation runs in four new `SECURITY DEFINER` Postgres RPCs that mirror the existing `/billing/analytics` RPCs (permission-gated, institution-scoped, IST dates). A thin service + React Query hooks feed recharts charts and shadcn tables; export produces Excel/PDF/CSV.

**Tech Stack:** Next.js 15 (App Router, client components), TypeScript, Supabase Postgres (plpgsql RPCs), TanStack React Query, shadcn/ui, Tailwind (HSL token theme), recharts, `xlsx`, `jspdf` + `jspdf-autotable`.

## Global Constraints

- **No unit-test runner exists.** Verify with `npm run typecheck` (tsc --noEmit), `npm run lint` (eslint), `npm run check:sidebar`, `npm run check:menus`, SQL assertion queries, and manual impersonation. Do NOT add Jest/Vitest.
- **Permission gate:** every RPC checks `user_has_permission('billing.reports.view')` and raises `42501` if absent. The page/menu use `billing.reports.view` (view) and `billing.reports.export` (export). No new permission key.
- **Institution scope:** every RPC resolves accessible institutions via `get_user_accessible_institutions(auth.uid())`; an empty/`NULL` `p_institution_ids` means "all accessible".
- **Dates are IST:** bill "billed" date uses `(created_at AT TIME ZONE 'Asia/Kolkata')::date`; receipts use `payment_paid_date`; cleared bills use `payment_date`.
- **`collected` = `SUM(billing_receipts.payment_amount)`** (matches the shipped `/billing/analytics` RPCs). Allocation-based `billing_receipt_items.amount_paid` was rejected during Task 2 verification: production data shows it covers only ~25% of receipts, so it would understate collections 4×. Dimensions come from the receipt's student (`institution_id` direct; `student_id → learners_profiles.program_id` for course); the academic-year filter attributes a receipt via the student's `learners_profiles.academic_year_id` (receipts are not year-stamped). Bill-based metrics (outstanding/cleared/billed) still use the bill's own `academic_year_id`.
- **Scheme cohorts:** `first_graduate` = `learners_profiles.first_graduate IS TRUE OR scholarship_type='FIRST GRADUATE'`; `pmss` = `scholarship_type='PMS SCHOLARSHIP' OR quotas.code='pmss'`; `scholarship_7_5` = `scholarship_type='7.5% SCHOLARSHIP'`.
- **Outstanding** = `status IN ('unpaid','partially_paid','overdue') AND balance_amount > 0` (a current snapshot, NOT date-bounded). **Cleared** = `status='paid'` with `payment_date` in range.
- **Charts:** before writing ANY chart component, load the `dataviz` skill. Use `hsl(var(--chart-N))` color tokens — NEVER hardcoded hex — so light/dark both work.
- **DB apply:** RPCs are applied to **production** via the Supabase MCP (`mcp__supabase__apply_migration`); there is no local DB and applies are classifier-gated. Commit the `.sql` file regardless.
- **Numeric coercion:** PostgREST returns `numeric` as strings. Always wrap chart/label values in the `num()` helper.

---

## File Structure

**Create:**
- `types/billing-accountant-reports.ts` — filter + RPC row types.
- `supabase/migrations/20260724090000_accountant_report_rpcs.sql` — 4 RPCs.
- `lib/services/billing/reports/accountant-report-service.ts` — `BillingAccountantReportService`.
- `hooks/billing/use-accountant-reports.ts` — RQ hooks + key factory + academic-years hook.
- `app/(routes)/billing/reports/accountant/page.tsx` — page shell.
- `app/(routes)/billing/reports/accountant/_components/_utils.ts` — scheme options, chart tokens, re-exports.
- `app/(routes)/billing/reports/accountant/_components/report-filter-bar.tsx` — sticky filter bar.
- `app/(routes)/billing/reports/accountant/_components/report-primitives.tsx` — KPI card, section, bar/line/donut charts, table.
- `app/(routes)/billing/reports/accountant/_components/overview-tab.tsx`
- `app/(routes)/billing/reports/accountant/_components/collections-tab.tsx`
- `app/(routes)/billing/reports/accountant/_components/outstanding-tab.tsx`
- `app/(routes)/billing/reports/accountant/_components/cleared-tab.tsx`
- `app/(routes)/billing/reports/accountant/_components/schemes-tab.tsx`
- `app/(routes)/billing/reports/accountant/_components/report-export.ts` — Excel/PDF/CSV.
- `app/(routes)/billing/reports/accountant/_components/accountant-reports-dashboard.tsx` — orchestrator.

**Modify:**
- `lib/sidebarMenuLink.ts` — add `MENU_PERMISSIONS` entry (~line 589) + Billing submenu entry (~line 2359).

---

## Task 1: Types

**Files:**
- Create: `types/billing-accountant-reports.ts`

**Interfaces:**
- Produces: `AccountantReportFilters`, `ReportScheme`, `CollectionsGroupBy`, `CollectionsRow`, `OutstandingByYearRow`, `SchemeRow`, `ReportKpis`, `ReportAcademicYear`.

- [ ] **Step 1: Write the file**

```ts
// types/billing-accountant-reports.ts
// Types for the Accountant Advanced Reports hub (/billing/reports/accountant).
// Numeric fields arrive from PostgREST as strings; coerce with num() at the edge.

export type ReportScheme = 'all' | 'first_graduate' | 'pmss' | 'scholarship_7_5';
export type CollectionsGroupBy = 'college' | 'course' | 'date';

export interface AccountantReportFilters {
  institution_ids?: string[];
  date_from?: string;
  date_to?: string;
  academic_year_id?: string;
  scheme?: ReportScheme;
}

/** One row of get_billing_report_collections (per college / course / date). */
export interface CollectionsRow {
  group_key: string;
  group_label: string;
  bill_count: number;
  student_count: number;
  collected: number;
  outstanding: number;
  collection_rate: number;
  cleared_bill_count: number;
  cleared_amount: number;
}

/** One row of get_billing_report_outstanding_by_year. */
export interface OutstandingByYearRow {
  academic_year_id: string | null;
  academic_year_name: string;
  institution_id: string;
  institution_name: string;
  students_with_dues: number;
  bill_count: number;
  outstanding: number;
}

/** One row of get_billing_report_schemes. */
export interface SchemeRow {
  scheme: 'first_graduate' | 'pmss' | 'scholarship_7_5';
  scheme_label: string;
  student_count: number;
  billed: number;
  collected: number;
  outstanding: number;
  concession_amount: number;
}

/** Single-row result of get_billing_report_kpis. */
export interface ReportKpis {
  collected: number;
  outstanding: number;
  cleared_bill_count: number;
  cleared_amount: number;
  concession_amount: number;
  students_billed: number;
}

export interface ReportAcademicYear {
  id: string;
  academic_year_name: string;
  institution_id: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors referencing this file).

- [ ] **Step 3: Commit**

```bash
git add types/billing-accountant-reports.ts
git commit -m "feat(billing-reports): types for accountant advanced reports"
```

---

## Task 2: RPC migration (4 functions)

**Files:**
- Create: `supabase/migrations/20260724090000_accountant_report_rpcs.sql`

**Interfaces:**
- Produces (callable via `rpc`): `get_billing_report_collections(uuid[],date,date,uuid,text,text)`, `get_billing_report_outstanding_by_year(uuid[],uuid,text)`, `get_billing_report_schemes(uuid[],uuid,date,date)`, `get_billing_report_kpis(uuid[],date,date,uuid,text)`.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- 20260724090000 — Accountant advanced-reports RPCs
-- ============================================================================
-- Four SECURITY DEFINER aggregations for /billing/reports/accountant. Pattern
-- copied from 20260602094000/20260602100000 (billing analytics): permission
-- gate + get_user_accessible_institutions scope + IST dates. collected is
-- allocation-based (receipt_items→bill) so it attributes per course/year.
-- Scheme cohort filter (p_scheme) resolves eligible student ids once.
-- ============================================================================

-- 1) COLLECTIONS — grouped by college | course | date -------------------------
CREATE OR REPLACE FUNCTION public.get_billing_report_collections(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_scheme text DEFAULT 'all',
  p_group_by text DEFAULT 'college'
) RETURNS TABLE(
  group_key text, group_label text, bill_count int, student_count int,
  collected numeric, outstanding numeric, collection_rate numeric,
  cleared_bill_count int, cleared_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[]; v_students uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  IF p_scheme <> 'all' THEN
    SELECT array_agg(lp.id) INTO v_students
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE (p_scheme = 'first_graduate' AND (lp.first_graduate IS TRUE OR lp.scholarship_type = 'FIRST GRADUATE'))
       OR (p_scheme = 'pmss' AND (lp.scholarship_type = 'PMS SCHOLARSHIP' OR q.code = 'pmss'))
       OR (p_scheme = 'scholarship_7_5' AND lp.scholarship_type = '7.5% SCHOLARSHIP');
    v_students := COALESCE(v_students, ARRAY[]::uuid[]);
  END IF;

  IF p_group_by = 'course' THEN
    RETURN QUERY
    WITH col AS (
      SELECT lp.program_id AS k, SUM(ri.amount_paid) AS collected
      FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id = ri.receipt_id
      JOIN billing_student_bills b ON b.id = ri.bill_id
      JOIN learners_profiles lp ON lp.id = b.student_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY lp.program_id),
    bills AS (
      SELECT lp.program_id AS k,
        COUNT(DISTINCT b.student_id) AS student_count, COUNT(*) AS bill_count,
        SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding,
        COUNT(*) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_bill_count,
        SUM(b.final_amount) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_amount
      FROM billing_student_bills b JOIN learners_profiles lp ON lp.id = b.student_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY lp.program_id)
    SELECT bills.k::text, COALESCE(p.program_name,'Unassigned')::text,
      COALESCE(bills.bill_count,0)::int, COALESCE(bills.student_count,0)::int,
      COALESCE(col.collected,0), COALESCE(bills.outstanding,0),
      CASE WHEN COALESCE(col.collected,0)+COALESCE(bills.outstanding,0) > 0
        THEN round(COALESCE(col.collected,0)/(COALESCE(col.collected,0)+COALESCE(bills.outstanding,0))*100,2) ELSE 0 END,
      COALESCE(bills.cleared_bill_count,0)::int, COALESCE(bills.cleared_amount,0)
    FROM bills LEFT JOIN col ON col.k = bills.k LEFT JOIN programs p ON p.id = bills.k
    ORDER BY COALESCE(col.collected,0) DESC;

  ELSIF p_group_by = 'date' THEN
    RETURN QUERY
    WITH col AS (
      SELECT r.payment_paid_date AS k, SUM(ri.amount_paid) AS collected
      FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id = ri.receipt_id
      JOIN billing_student_bills b ON b.id = ri.bill_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY r.payment_paid_date),
    clr AS (
      SELECT b.payment_date AS k, COUNT(*) AS cleared_bill_count, SUM(b.final_amount) AS cleared_amount
      FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid' AND b.payment_date IS NOT NULL
        AND (p_date_from IS NULL OR b.payment_date >= p_date_from)
        AND (p_date_to   IS NULL OR b.payment_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY b.payment_date)
    SELECT to_char(d.k,'YYYY-MM-DD')::text, to_char(d.k,'DD Mon')::text,
      0::int, 0::int, COALESCE(col.collected,0), 0::numeric, 0::numeric,
      COALESCE(clr.cleared_bill_count,0)::int, COALESCE(clr.cleared_amount,0)
    FROM (SELECT k FROM col UNION SELECT k FROM clr) d
    LEFT JOIN col ON col.k = d.k LEFT JOIN clr ON clr.k = d.k
    ORDER BY d.k;

  ELSE  -- 'college'
    RETURN QUERY
    WITH col AS (
      SELECT b.institution_id AS k, SUM(ri.amount_paid) AS collected
      FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id = ri.receipt_id
      JOIN billing_student_bills b ON b.id = ri.bill_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY b.institution_id),
    bills AS (
      SELECT b.institution_id AS k,
        COUNT(DISTINCT b.student_id) AS student_count, COUNT(*) AS bill_count,
        SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding,
        COUNT(*) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_bill_count,
        SUM(b.final_amount) FILTER (WHERE b.status='paid' AND (p_date_from IS NULL OR b.payment_date >= p_date_from) AND (p_date_to IS NULL OR b.payment_date <= p_date_to)) AS cleared_amount
      FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
      GROUP BY b.institution_id)
    SELECT i.id::text, i.name::text,
      COALESCE(bills.bill_count,0)::int, COALESCE(bills.student_count,0)::int,
      COALESCE(col.collected,0), COALESCE(bills.outstanding,0),
      CASE WHEN COALESCE(col.collected,0)+COALESCE(bills.outstanding,0) > 0
        THEN round(COALESCE(col.collected,0)/(COALESCE(col.collected,0)+COALESCE(bills.outstanding,0))*100,2) ELSE 0 END,
      COALESCE(bills.cleared_bill_count,0)::int, COALESCE(bills.cleared_amount,0)
    FROM institutions i JOIN bills ON bills.k = i.id LEFT JOIN col ON col.k = i.id
    WHERE i.id = ANY(v_inst)
    ORDER BY COALESCE(col.collected,0) DESC;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_collections(uuid[], date, date, uuid, text, text) TO authenticated;

-- 2) OUTSTANDING BY ACADEMIC YEAR --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_report_outstanding_by_year(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_scheme text DEFAULT 'all'
) RETURNS TABLE(
  academic_year_id uuid, academic_year_name text, institution_id uuid,
  institution_name text, students_with_dues int, bill_count int, outstanding numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[]; v_students uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  IF p_scheme <> 'all' THEN
    SELECT array_agg(lp.id) INTO v_students
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE (p_scheme='first_graduate' AND (lp.first_graduate IS TRUE OR lp.scholarship_type='FIRST GRADUATE'))
       OR (p_scheme='pmss' AND (lp.scholarship_type='PMS SCHOLARSHIP' OR q.code='pmss'))
       OR (p_scheme='scholarship_7_5' AND lp.scholarship_type='7.5% SCHOLARSHIP');
    v_students := COALESCE(v_students, ARRAY[]::uuid[]);
  END IF;

  RETURN QUERY
  SELECT b.academic_year_id, COALESCE(ay.academic_year_name,'Unassigned')::text,
    b.institution_id, i.name::text,
    COUNT(DISTINCT b.student_id)::int, COUNT(*)::int, SUM(b.balance_amount)
  FROM billing_student_bills b
  JOIN institutions i ON i.id = b.institution_id
  LEFT JOIN academic_years ay ON ay.id = b.academic_year_id
  WHERE b.institution_id = ANY(v_inst)
    AND b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0
    AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    AND (p_scheme = 'all' OR b.student_id = ANY(v_students))
  GROUP BY b.academic_year_id, ay.academic_year_name, b.institution_id, i.name
  ORDER BY ay.academic_year_name NULLS LAST, SUM(b.balance_amount) DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_outstanding_by_year(uuid[], uuid, text) TO authenticated;

-- 3) SCHEMES (First Graduate / PMSS / 7.5%) with approved concessions ---------
CREATE OR REPLACE FUNCTION public.get_billing_report_schemes(
  p_institution_ids uuid[] DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  scheme text, scheme_label text, student_count int,
  billed numeric, collected numeric, outstanding numeric, concession_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
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
  WITH scheme_students AS (
    SELECT lp.id AS student_id,
      CASE
        WHEN lp.first_graduate IS TRUE OR lp.scholarship_type='FIRST GRADUATE' THEN 'first_graduate'
        WHEN lp.scholarship_type='PMS SCHOLARSHIP' OR q.code='pmss' THEN 'pmss'
        WHEN lp.scholarship_type='7.5% SCHOLARSHIP' THEN 'scholarship_7_5'
        ELSE 'other' END AS scheme
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.institution_id = ANY(v_inst)),
  billagg AS (
    SELECT ss.scheme, COUNT(DISTINCT b.student_id) AS student_count,
      SUM(b.final_amount) AS billed,
      SUM(b.balance_amount) FILTER (WHERE b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0) AS outstanding
    FROM billing_student_bills b JOIN scheme_students ss ON ss.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst)
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme),
  colagg AS (
    SELECT ss.scheme, SUM(ri.amount_paid) AS collected
    FROM billing_receipt_items ri
    JOIN billing_receipts r ON r.id = ri.receipt_id
    JOIN billing_student_bills b ON b.id = ri.bill_id
    JOIN scheme_students ss ON ss.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst)
      AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
      AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme),
  concagg AS (
    SELECT ss.scheme, SUM(d.discount_amount) AS concession_amount
    FROM billing_discounts d
    JOIN billing_student_bills b ON b.id = d.bill_id
    JOIN scheme_students ss ON ss.student_id = b.student_id
    WHERE b.institution_id = ANY(v_inst) AND d.approval_status = 'approved'
      AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
    GROUP BY ss.scheme)
  SELECT s.scheme,
    CASE s.scheme WHEN 'first_graduate' THEN 'First Graduate'
                  WHEN 'pmss' THEN 'PMSS'
                  WHEN 'scholarship_7_5' THEN '7.5% Scholarship' END::text,
    COALESCE(ba.student_count,0)::int, COALESCE(ba.billed,0), COALESCE(ca.collected,0),
    COALESCE(ba.outstanding,0), COALESCE(cc.concession_amount,0)
  FROM (SELECT unnest(ARRAY['first_graduate','pmss','scholarship_7_5']) AS scheme) s
  LEFT JOIN billagg ba ON ba.scheme = s.scheme
  LEFT JOIN colagg ca ON ca.scheme = s.scheme
  LEFT JOIN concagg cc ON cc.scheme = s.scheme
  ORDER BY s.scheme;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_schemes(uuid[], uuid, date, date) TO authenticated;

-- 4) HEADLINE KPIs -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_report_kpis(
  p_institution_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_scheme text DEFAULT 'all'
) RETURNS TABLE(
  collected numeric, outstanding numeric, cleared_bill_count int,
  cleared_amount numeric, concession_amount numeric, students_billed int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_inst uuid[]; v_students uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN
    RETURN QUERY SELECT 0::numeric,0::numeric,0,0::numeric,0::numeric,0; RETURN;
  END IF;

  IF p_scheme <> 'all' THEN
    SELECT array_agg(lp.id) INTO v_students
    FROM learners_profiles lp LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE (p_scheme='first_graduate' AND (lp.first_graduate IS TRUE OR lp.scholarship_type='FIRST GRADUATE'))
       OR (p_scheme='pmss' AND (lp.scholarship_type='PMS SCHOLARSHIP' OR q.code='pmss'))
       OR (p_scheme='scholarship_7_5' AND lp.scholarship_type='7.5% SCHOLARSHIP');
    v_students := COALESCE(v_students, ARRAY[]::uuid[]);
  END IF;

  RETURN QUERY SELECT
    COALESCE((SELECT SUM(ri.amount_paid) FROM billing_receipt_items ri
      JOIN billing_receipts r ON r.id=ri.receipt_id JOIN billing_student_bills b ON b.id=ri.bill_id
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR r.payment_paid_date >= p_date_from)
        AND (p_date_to   IS NULL OR r.payment_paid_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT SUM(b.balance_amount) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst)
        AND b.status IN ('unpaid','partially_paid','overdue') AND COALESCE(b.balance_amount,0) > 0
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT COUNT(*) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid'
        AND (p_date_from IS NULL OR b.payment_date >= p_date_from)
        AND (p_date_to   IS NULL OR b.payment_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0)::int,
    COALESCE((SELECT SUM(b.final_amount) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst) AND b.status='paid'
        AND (p_date_from IS NULL OR b.payment_date >= p_date_from)
        AND (p_date_to   IS NULL OR b.payment_date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT SUM(d.discount_amount) FROM billing_discounts d
      JOIN billing_student_bills b ON b.id=d.bill_id
      WHERE b.institution_id = ANY(v_inst) AND d.approval_status='approved'
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0),
    COALESCE((SELECT COUNT(DISTINCT b.student_id) FROM billing_student_bills b
      WHERE b.institution_id = ANY(v_inst)
        AND (p_date_from IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= p_date_from)
        AND (p_date_to   IS NULL OR (b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= p_date_to)
        AND (p_academic_year_id IS NULL OR b.academic_year_id = p_academic_year_id)
        AND (p_scheme='all' OR b.student_id = ANY(v_students))),0)::int;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_billing_report_kpis(uuid[], date, date, uuid, text) TO authenticated;
```

- [ ] **Step 2: Apply to production**

Apply the file via the Supabase MCP (there is no local DB):

Use `mcp__supabase__apply_migration` with `name: "accountant_report_rpcs"` and `query` set to the file contents.
Expected: success, no error.

- [ ] **Step 3: Verify the RPCs exist and run (SQL assertion)**

Use `mcp__supabase__execute_sql` with:

```sql
-- Smoke: each function returns without error for "all accessible" (NULL scope).
SELECT 'collections' AS rpc, count(*) FROM get_billing_report_collections(NULL,NULL,NULL,NULL,'all','college')
UNION ALL SELECT 'outstanding', count(*) FROM get_billing_report_outstanding_by_year(NULL,NULL,'all')
UNION ALL SELECT 'schemes', count(*) FROM get_billing_report_schemes(NULL,NULL,NULL,NULL)
UNION ALL SELECT 'kpis', count(*) FROM get_billing_report_kpis(NULL,NULL,NULL,NULL,'all');
```
Expected: 4 rows, no error. (Row counts depend on data; `kpis` returns 1.)

- [ ] **Step 4: Verify reconciliation (SQL assertion)**

```sql
-- College-wise collected must sum to the KPI collected (same filters).
WITH c AS (SELECT COALESCE(SUM(collected),0) s FROM get_billing_report_collections(NULL,NULL,NULL,NULL,'all','college')),
     k AS (SELECT collected s FROM get_billing_report_kpis(NULL,NULL,NULL,NULL,'all'))
SELECT c.s AS collections_sum, k.s AS kpi_collected, (round(c.s,2) = round(k.s,2)) AS reconciles FROM c, k;
```
Expected: `reconciles = true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724090000_accountant_report_rpcs.sql
git commit -m "feat(billing-reports): 4 SECURITY DEFINER RPCs for accountant reports"
```

---

## Task 3: Service

**Files:**
- Create: `lib/services/billing/reports/accountant-report-service.ts`

**Interfaces:**
- Consumes: `AccountantReportFilters`, row types (Task 1); `BaseService.executeDashboardRPC` and `BaseService.supabase`.
- Produces: `BillingAccountantReportService.{getCollections,getOutstandingByYear,getSchemes,getKpis,getAcademicYears}`.

- [ ] **Step 1: Write the service**

```ts
// lib/services/billing/reports/accountant-report-service.ts
import { BaseService } from '@/lib/services/base-service';
import type {
  AccountantReportFilters,
  CollectionsRow,
  CollectionsGroupBy,
  OutstandingByYearRow,
  SchemeRow,
  ReportKpis,
  ReportAcademicYear,
} from '@/types/billing-accountant-reports';

// Thin wrapper over the 4 accountant-report RPCs (migration 20260724090000).
// Aggregation + scope + permission gating all live in Postgres.
export class BillingAccountantReportService extends BaseService {
  private static scope(f: AccountantReportFilters) {
    return {
      p_institution_ids:
        f.institution_ids && f.institution_ids.length > 0 ? f.institution_ids : null,
      p_date_from: f.date_from ?? null,
      p_date_to: f.date_to ?? null,
      p_academic_year_id: f.academic_year_id ?? null,
      p_scheme: f.scheme ?? 'all',
    };
  }

  static getCollections(f: AccountantReportFilters, groupBy: CollectionsGroupBy) {
    return this.executeDashboardRPC<CollectionsRow[]>(
      'get_billing_report_collections',
      { ...this.scope(f), p_group_by: groupBy }
    );
  }

  static getOutstandingByYear(f: AccountantReportFilters) {
    return this.executeDashboardRPC<OutstandingByYearRow[]>(
      'get_billing_report_outstanding_by_year',
      {
        p_institution_ids:
          f.institution_ids && f.institution_ids.length > 0 ? f.institution_ids : null,
        p_academic_year_id: f.academic_year_id ?? null,
        p_scheme: f.scheme ?? 'all',
      }
    );
  }

  static getSchemes(f: AccountantReportFilters) {
    return this.executeDashboardRPC<SchemeRow[]>('get_billing_report_schemes', {
      p_institution_ids:
        f.institution_ids && f.institution_ids.length > 0 ? f.institution_ids : null,
      p_academic_year_id: f.academic_year_id ?? null,
      p_date_from: f.date_from ?? null,
      p_date_to: f.date_to ?? null,
    });
  }

  static async getKpis(f: AccountantReportFilters): Promise<ReportKpis> {
    const rows = await this.executeDashboardRPC<ReportKpis[]>(
      'get_billing_report_kpis',
      this.scope(f)
    );
    return (
      rows?.[0] ?? {
        collected: 0,
        outstanding: 0,
        cleared_bill_count: 0,
        cleared_amount: 0,
        concession_amount: 0,
        students_billed: 0,
      }
    );
  }

  /** Active academic years for the filter bar (RLS scopes to accessible rows). */
  static async getAcademicYears(institutionId?: string): Promise<ReportAcademicYear[]> {
    let q = this.supabase
      .from('academic_years')
      .select('id, academic_year_name, institution_id')
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) throw new Error(`Failed to load academic years: ${error.message}`);
    return (data ?? []) as ReportAcademicYear[];
  }
}
```

> Note: `executeDashboardRPC` returns the RPC result array (or single value). If your `BaseService` returns `{ data }`, adapt the return to `.data`; confirm by reading `lib/services/base-service.ts` `executeDashboardRPC`. The analytics service (`billing-analytics-service.ts`) returns it directly — match that.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/services/billing/reports/accountant-report-service.ts
git commit -m "feat(billing-reports): accountant report service (RPC wrapper)"
```

---

## Task 4: Hooks

**Files:**
- Create: `hooks/billing/use-accountant-reports.ts`

**Interfaces:**
- Consumes: `BillingAccountantReportService` (Task 3), filter/row types (Task 1).
- Produces: `accountantReportKeys`, `useReportKpis`, `useReportCollections`, `useReportOutstanding`, `useReportSchemes`, `useReportAcademicYears`.

- [ ] **Step 1: Write the hooks**

```ts
// hooks/billing/use-accountant-reports.ts
import { useQuery } from '@tanstack/react-query';
import { BillingAccountantReportService } from '@/lib/services/billing/reports/accountant-report-service';
import type {
  AccountantReportFilters,
  CollectionsGroupBy,
} from '@/types/billing-accountant-reports';

export const accountantReportKeys = {
  all: ['accountant-reports'] as const,
  kpis: (f: AccountantReportFilters) => [...accountantReportKeys.all, 'kpis', f] as const,
  collections: (f: AccountantReportFilters, g: CollectionsGroupBy) =>
    [...accountantReportKeys.all, 'collections', g, f] as const,
  outstanding: (f: AccountantReportFilters) =>
    [...accountantReportKeys.all, 'outstanding', f] as const,
  schemes: (f: AccountantReportFilters) => [...accountantReportKeys.all, 'schemes', f] as const,
  years: (institutionId?: string) =>
    [...accountantReportKeys.all, 'years', institutionId ?? null] as const,
};

const STALE = 2 * 60 * 1000;

export function useReportKpis(filters: AccountantReportFilters) {
  return useQuery({
    queryKey: accountantReportKeys.kpis(filters),
    queryFn: () => BillingAccountantReportService.getKpis(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportCollections(
  filters: AccountantReportFilters,
  groupBy: CollectionsGroupBy
) {
  return useQuery({
    queryKey: accountantReportKeys.collections(filters, groupBy),
    queryFn: () => BillingAccountantReportService.getCollections(filters, groupBy),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportOutstanding(filters: AccountantReportFilters) {
  return useQuery({
    queryKey: accountantReportKeys.outstanding(filters),
    queryFn: () => BillingAccountantReportService.getOutstandingByYear(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportSchemes(filters: AccountantReportFilters) {
  return useQuery({
    queryKey: accountantReportKeys.schemes(filters),
    queryFn: () => BillingAccountantReportService.getSchemes(filters),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}

export function useReportAcademicYears(institutionId?: string) {
  return useQuery({
    queryKey: accountantReportKeys.years(institutionId),
    queryFn: () => BillingAccountantReportService.getAcademicYears(institutionId),
    staleTime: 10 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add hooks/billing/use-accountant-reports.ts
git commit -m "feat(billing-reports): react-query hooks for accountant reports"
```

---

## Task 5: Hub utils (scheme options, chart tokens, re-exports)

**Files:**
- Create: `app/(routes)/billing/reports/accountant/_components/_utils.ts`

**Interfaces:**
- Consumes: analytics `_utils` (`presetRange`, `DATE_PRESETS`, `DatePreset`, `formatINRCompact`, `formatCurrency`, `num`).
- Produces: `SCHEME_OPTIONS`, `SCHEME_LABEL`, `CHART_TOKENS`, and re-exports of the analytics helpers.

- [ ] **Step 1: Write the file**

```ts
// app/(routes)/billing/reports/accountant/_components/_utils.ts
// Reuses the analytics date/number helpers (does not modify that feature) and
// adds hub-specific scheme options + dark-mode-safe chart color tokens.
export {
  presetRange,
  DATE_PRESETS,
  formatINRCompact,
  formatCurrency,
  num,
  type DatePreset,
} from '@/app/(routes)/billing/analytics/_components/_utils';

import type { ReportScheme } from '@/types/billing-accountant-reports';

export const SCHEME_OPTIONS: { value: ReportScheme; label: string }[] = [
  { value: 'all', label: 'All Students' },
  { value: 'first_graduate', label: 'First Graduate' },
  { value: 'pmss', label: 'PMSS' },
  { value: 'scholarship_7_5', label: '7.5% Scholarship' },
];

export const SCHEME_LABEL: Record<ReportScheme, string> = {
  all: 'All Students',
  first_graduate: 'First Graduate',
  pmss: 'PMSS',
  scholarship_7_5: '7.5% Scholarship',
};

// Theme tokens — resolve to the Tailwind --chart-1..5 HSL vars so charts adapt
// to light/dark automatically (unlike the older billing charts' hardcoded hex).
export const CHART_TOKENS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
];
export const chartToken = (i: number) => CHART_TOKENS[i % CHART_TOKENS.length];
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If the cross-feature import path errors, confirm the `@/` alias resolves `app/(routes)/billing/analytics/_components/_utils`.)

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/reports/accountant/_components/_utils.ts"
git commit -m "feat(billing-reports): hub utils (scheme options, chart tokens)"
```

---

## Task 6: Filter bar

**Files:**
- Create: `app/(routes)/billing/reports/accountant/_components/report-filter-bar.tsx`

**Interfaces:**
- Consumes: `_utils` (`DATE_PRESETS`, `DatePreset`, `SCHEME_OPTIONS`), types (`ReportScheme`, `ReportAcademicYear`).
- Produces: `ReportFilterBar`, `ReportFilterChange` — mirrors `AnalyticsFilters` plus academic-year + scheme selects.

- [ ] **Step 1: Write the component**

```tsx
// app/(routes)/billing/reports/accountant/_components/report-filter-bar.tsx
'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Download } from 'lucide-react';
import { DATE_PRESETS, SCHEME_OPTIONS, type DatePreset } from './_utils';
import type { ReportScheme, ReportAcademicYear } from '@/types/billing-accountant-reports';

export interface ReportFilterChange {
  institution?: string | null;
  academicYear?: string | null;
  preset?: DatePreset;
  from?: string | null;
  to?: string | null;
  scheme?: ReportScheme;
}

interface Props {
  institutionId?: string;
  academicYearId?: string;
  preset: DatePreset;
  from?: string;
  to?: string;
  scheme: ReportScheme;
  institutions: Array<{ id: string; name: string }>;
  academicYears: ReportAcademicYear[];
  multiInstitution: boolean;
  loading?: boolean;
  onChange: (c: ReportFilterChange) => void;
  onRefresh: () => void;
  isFetching?: boolean;
  canExport?: boolean;
  onExport?: () => void;
  exporting?: boolean;
}

export function ReportFilterBar({
  institutionId, academicYearId, preset, from, to, scheme,
  institutions, academicYears, multiInstitution, loading,
  onChange, onRefresh, isFetching, canExport, onExport, exporting,
}: Props) {
  return (
    <div className='bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex flex-col gap-3 rounded-lg border p-3 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'>
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        {multiInstitution && (
          <Select
            value={institutionId || 'all'}
            onValueChange={(v) => onChange({ institution: v === 'all' ? null : v })}
            disabled={loading}
          >
            <SelectTrigger className='w-full sm:w-[210px]'>
              <SelectValue placeholder='All Colleges' />
            </SelectTrigger>
            <SelectContent className='max-h-72 overflow-y-auto'>
              <SelectItem value='all'>All Colleges</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={academicYearId || 'all'}
          onValueChange={(v) => onChange({ academicYear: v === 'all' ? null : v })}
        >
          <SelectTrigger className='w-full sm:w-[170px]'>
            <SelectValue placeholder='All Years' />
          </SelectTrigger>
          <SelectContent className='max-h-72 overflow-y-auto'>
            <SelectItem value='all'>All Academic Years</SelectItem>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={preset}
          onValueChange={(v) =>
            onChange(v === 'custom'
              ? { preset: 'custom' }
              : { preset: v as DatePreset, from: null, to: null })
          }
        >
          <SelectTrigger className='w-full sm:w-[150px]'>
            <SelectValue placeholder='This Month' />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === 'custom' && (
          <div className='flex items-center gap-2'>
            <Input type='date' value={from ?? ''} max={to || undefined}
              onChange={(e) => onChange({ from: e.target.value || null })} className='w-[150px]' />
            <span className='text-muted-foreground text-sm'>to</span>
            <Input type='date' value={to ?? ''} min={from || undefined}
              onChange={(e) => onChange({ to: e.target.value || null })} className='w-[150px]' />
          </div>
        )}

        <Select value={scheme} onValueChange={(v) => onChange({ scheme: v as ReportScheme })}>
          <SelectTrigger className='w-full sm:w-[170px]'>
            <SelectValue placeholder='All Students' />
          </SelectTrigger>
          <SelectContent>
            {SCHEME_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='flex items-center gap-2'>
        {canExport && (
          <Button variant='outline' size='sm' onClick={onExport} disabled={exporting} className='shrink-0'>
            <Download className='mr-2 h-4 w-4' /> Export
          </Button>
        )}
        <Button variant='outline' size='sm' onClick={onRefresh} disabled={isFetching} className='shrink-0'>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/reports/accountant/_components/report-filter-bar.tsx"
git commit -m "feat(billing-reports): sticky filter bar (college/year/date/scheme)"
```

---

## Task 7: Report primitives (KPI cards, section, charts, table)

**Load the `dataviz` skill before this task** (chart color/mark/legend/tooltip rules). Use `chartToken(i)` — never hex.

**Files:**
- Create: `app/(routes)/billing/reports/accountant/_components/report-primitives.tsx`

**Interfaces:**
- Consumes: `_utils` (`formatINRCompact`, `num`, `chartToken`).
- Produces: `ReportKpiGrid`, `ReportSection`, `ReportBarChart`, `ReportLineChart`, `ReportDonutChart`, `ReportTable`, and the `Kpi`/`Column` types.

- [ ] **Step 1: Write the primitives**

```tsx
// app/(routes)/billing/reports/accountant/_components/report-primitives.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { LucideIcon } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatINRCompact, num, chartToken } from './_utils';

const TONE: Record<'default' | 'success' | 'warning' | 'danger', string> = {
  default: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
  success: 'text-green-600 bg-green-50 dark:bg-green-950/40',
  warning: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  danger: 'text-red-600 bg-red-50 dark:bg-red-950/40',
};

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONE;
  title?: string;
}

export function ReportKpiGrid({ items, loading }: { items: Kpi[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: items.length || 4 }).map((_, i) => (
          <Skeleton key={i} className='h-[92px] w-full' />
        ))}
      </div>
    );
  }
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {items.map((k) => (
        <Card key={k.label}>
          <CardContent className='flex items-start justify-between gap-3 p-4'>
            <div className='min-w-0'>
              <p className='text-muted-foreground text-xs font-medium'>{k.label}</p>
              <p className='mt-1 truncate text-2xl font-bold' title={k.title}>{k.value}</p>
              {k.sub && <p className='text-muted-foreground mt-0.5 text-xs'>{k.sub}</p>}
            </div>
            <span className={`rounded-md p-2 ${TONE[k.tone ?? 'default']}`}>
              <k.icon className='h-5 w-5' />
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReportSection({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className='h-full'>
      <CardHeader className='flex flex-row items-center justify-between gap-2 pb-2'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartState({
  loading, empty, children,
}: { loading?: boolean; empty: boolean; children: React.ReactNode }) {
  if (loading) return <Skeleton className='h-[300px] w-full' />;
  if (empty)
    return <p className='text-muted-foreground py-24 text-center text-sm'>No data for the selected filters.</p>;
  return <>{children}</>;
}

interface CurrencyBarProps {
  data: Array<Record<string, unknown>>;
  categoryKey: string;
  valueKey: string;
  loading?: boolean;
  horizontal?: boolean;
}
export function ReportBarChart({ data, categoryKey, valueKey, loading, horizontal }: CurrencyBarProps) {
  const rows = (data ?? []).map((d) => ({ ...d, [valueKey]: num(d[valueKey]) }));
  return (
    <ChartState loading={loading} empty={rows.length === 0}>
      <ResponsiveContainer width='100%' height={320}>
        <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ left: horizontal ? 8 : 4, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray='3 3' vertical={!horizontal} horizontal={horizontal} />
          {horizontal ? (
            <>
              <XAxis type='number' tick={{ fontSize: 11 }} tickFormatter={(v) => formatINRCompact(v)} />
              <YAxis type='category' dataKey={categoryKey} width={130} tick={{ fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis dataKey={categoryKey} tick={{ fontSize: 11 }} minTickGap={16} />
              <YAxis width={62} tick={{ fontSize: 11 }} tickFormatter={(v) => formatINRCompact(v)} />
            </>
          )}
          <Tooltip formatter={(v: number) => formatINRCompact(v)} />
          <Bar dataKey={valueKey} radius={[3, 3, 0, 0]} maxBarSize={42}>
            {rows.map((_, i) => (<Cell key={i} fill={chartToken(i)} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartState>
  );
}

interface LineProps {
  data: Array<Record<string, unknown>>;
  categoryKey: string;
  valueKey: string;
  loading?: boolean;
}
export function ReportLineChart({ data, categoryKey, valueKey, loading }: LineProps) {
  const rows = (data ?? []).map((d) => ({ ...d, [valueKey]: num(d[valueKey]) }));
  return (
    <ChartState loading={loading} empty={rows.length === 0}>
      <ResponsiveContainer width='100%' height={320}>
        <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis dataKey={categoryKey} tick={{ fontSize: 11 }} minTickGap={20} />
          <YAxis width={62} tick={{ fontSize: 11 }} tickFormatter={(v) => formatINRCompact(v)} />
          <Tooltip formatter={(v: number) => formatINRCompact(v)} />
          <Line dataKey={valueKey} stroke={chartToken(1)} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartState>
  );
}

interface DonutProps {
  data: Array<{ label: string; value: number }>;
  loading?: boolean;
}
export function ReportDonutChart({ data, loading }: DonutProps) {
  const rows = (data ?? []).map((d) => ({ label: d.label, value: num(d.value) })).filter((d) => d.value > 0);
  return (
    <ChartState loading={loading} empty={rows.length === 0}>
      <ResponsiveContainer width='100%' height={320}>
        <PieChart>
          <Pie data={rows} dataKey='value' nameKey='label' innerRadius={70} outerRadius={110} paddingAngle={2}>
            {rows.map((_, i) => (<Cell key={i} fill={chartToken(i)} />))}
          </Pie>
          <Tooltip formatter={(v: number) => formatINRCompact(v)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartState>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
}
export function ReportTable<T>({
  columns, rows, loading, empty = 'No rows.',
}: { columns: Column<T>[]; rows: T[]; loading?: boolean; empty?: string }) {
  if (loading) return <Skeleton className='h-64 w-full' />;
  if (!rows.length)
    return <p className='text-muted-foreground py-12 text-center text-sm'>{empty}</p>;
  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => (
              <TableHead key={i} className={c.align === 'right' ? 'text-right' : ''}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, ri) => (
            <TableRow key={ri}>
              {columns.map((c, ci) => (
                <TableCell key={ci} className={c.align === 'right' ? 'text-right tabular-nums' : ''}>{c.cell(r)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/reports/accountant/_components/report-primitives.tsx"
git commit -m "feat(billing-reports): reusable KPI/chart/table primitives (dark-mode tokens)"
```

---

## Task 8: Tab components

**Files:**
- Create: `overview-tab.tsx`, `collections-tab.tsx`, `outstanding-tab.tsx`, `cleared-tab.tsx`, `schemes-tab.tsx` (all under `app/(routes)/billing/reports/accountant/_components/`).

**Interfaces:**
- Consumes: hooks (Task 4), primitives (Task 7), `_utils`, types.
- Produces: `OverviewTab`, `CollectionsTab`, `OutstandingTab`, `ClearedTab`, `SchemesTab` — each takes `{ filters: AccountantReportFilters }`.

- [ ] **Step 1: Write `overview-tab.tsx`**

```tsx
// app/(routes)/billing/reports/accountant/_components/overview-tab.tsx
'use client';

import { TrendingUp, AlertTriangle, CheckCircle2, BadgePercent } from 'lucide-react';
import { useReportKpis, useReportCollections } from '@/hooks/billing/use-accountant-reports';
import type { AccountantReportFilters } from '@/types/billing-accountant-reports';
import { formatINRCompact, formatCurrency, num } from './_utils';
import { ReportKpiGrid, ReportSection, ReportBarChart, ReportLineChart } from './report-primitives';

export function OverviewTab({ filters }: { filters: AccountantReportFilters }) {
  const kpis = useReportKpis(filters);
  const byCollege = useReportCollections(filters, 'college');
  const byDate = useReportCollections(filters, 'date');
  const k = kpis.data;

  return (
    <div className='space-y-6'>
      <ReportKpiGrid
        loading={kpis.isLoading && !k}
        items={[
          { label: 'Collected', value: formatINRCompact(k?.collected), title: formatCurrency(num(k?.collected)), icon: TrendingUp, tone: 'success' },
          { label: 'Outstanding (now)', value: formatINRCompact(k?.outstanding), title: formatCurrency(num(k?.outstanding)), icon: AlertTriangle, tone: 'danger' },
          { label: 'Bills Cleared', value: num(k?.cleared_bill_count).toLocaleString('en-IN'), sub: formatINRCompact(k?.cleared_amount), icon: CheckCircle2, tone: 'default' },
          { label: 'Concessions', value: formatINRCompact(k?.concession_amount), title: formatCurrency(num(k?.concession_amount)), icon: BadgePercent, tone: 'warning' },
        ]}
      />
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <ReportSection title='Collection Trend'>
          <ReportLineChart data={byDate.data ?? []} categoryKey='group_label' valueKey='collected' loading={byDate.isLoading} />
        </ReportSection>
        <ReportSection title='Collection by College'>
          <ReportBarChart data={byCollege.data ?? []} categoryKey='group_label' valueKey='collected' loading={byCollege.isLoading} horizontal />
        </ReportSection>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `collections-tab.tsx`**

```tsx
// app/(routes)/billing/reports/accountant/_components/collections-tab.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useReportCollections } from '@/hooks/billing/use-accountant-reports';
import type {
  AccountantReportFilters, CollectionsGroupBy, CollectionsRow,
} from '@/types/billing-accountant-reports';
import { formatCurrency, num } from './_utils';
import { ReportSection, ReportBarChart, ReportLineChart, ReportTable, type Column } from './report-primitives';

const GROUPS: { value: CollectionsGroupBy; label: string }[] = [
  { value: 'college', label: 'By College' },
  { value: 'course', label: 'By Course' },
  { value: 'date', label: 'By Date' },
];

export function CollectionsTab({ filters }: { filters: AccountantReportFilters }) {
  const [groupBy, setGroupBy] = useState<CollectionsGroupBy>('college');
  const q = useReportCollections(filters, groupBy);
  const rows = q.data ?? [];

  const toggle = (
    <div className='flex gap-1'>
      {GROUPS.map((g) => (
        <Button key={g.value} size='sm' variant={groupBy === g.value ? 'default' : 'outline'}
          onClick={() => setGroupBy(g.value)}>{g.label}</Button>
      ))}
    </div>
  );

  const columns: Column<CollectionsRow>[] = [
    { header: groupBy === 'date' ? 'Date' : groupBy === 'course' ? 'Course' : 'College', cell: (r) => r.group_label },
    { header: 'Students', align: 'right', cell: (r) => num(r.student_count).toLocaleString('en-IN') },
    { header: 'Collected', align: 'right', cell: (r) => formatCurrency(num(r.collected)) },
    { header: 'Outstanding', align: 'right', cell: (r) => formatCurrency(num(r.outstanding)) },
    { header: 'Rate %', align: 'right', cell: (r) => `${num(r.collection_rate).toFixed(1)}%` },
  ];

  return (
    <div className='space-y-6'>
      <ReportSection title='Collections' action={toggle}>
        {groupBy === 'date'
          ? <ReportLineChart data={rows} categoryKey='group_label' valueKey='collected' loading={q.isLoading} />
          : <ReportBarChart data={rows} categoryKey='group_label' valueKey='collected' loading={q.isLoading} horizontal />}
      </ReportSection>
      <ReportSection title='Detail'>
        <ReportTable columns={columns} rows={rows} loading={q.isLoading} empty='No collections for these filters.' />
      </ReportSection>
    </div>
  );
}
```

- [ ] **Step 3: Write `outstanding-tab.tsx`**

```tsx
// app/(routes)/billing/reports/accountant/_components/outstanding-tab.tsx
'use client';

import { useMemo } from 'react';
import { useReportOutstanding } from '@/hooks/billing/use-accountant-reports';
import type {
  AccountantReportFilters, OutstandingByYearRow,
} from '@/types/billing-accountant-reports';
import { formatCurrency, num } from './_utils';
import { ReportSection, ReportBarChart, ReportTable, type Column } from './report-primitives';

export function OutstandingTab({ filters }: { filters: AccountantReportFilters }) {
  const q = useReportOutstanding(filters);
  const rows = q.data ?? [];

  // Roll rows (year × college) up to year totals for the chart.
  const byYear = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(r.academic_year_name, (m.get(r.academic_year_name) ?? 0) + num(r.outstanding));
    }
    return Array.from(m, ([group_label, outstanding]) => ({ group_label, outstanding }));
  }, [rows]);

  const columns: Column<OutstandingByYearRow>[] = [
    { header: 'Academic Year', cell: (r) => r.academic_year_name },
    { header: 'College', cell: (r) => r.institution_name },
    { header: 'Students w/ Dues', align: 'right', cell: (r) => num(r.students_with_dues).toLocaleString('en-IN') },
    { header: 'Bills', align: 'right', cell: (r) => num(r.bill_count).toLocaleString('en-IN') },
    { header: 'Outstanding', align: 'right', cell: (r) => formatCurrency(num(r.outstanding)) },
  ];

  return (
    <div className='space-y-6'>
      <ReportSection title='Pending Payments by Academic Year'>
        <ReportBarChart data={byYear} categoryKey='group_label' valueKey='outstanding' loading={q.isLoading} />
      </ReportSection>
      <ReportSection title='Detail (Year × College)'>
        <ReportTable columns={columns} rows={rows} loading={q.isLoading} empty='No pending dues for these filters.' />
      </ReportSection>
    </div>
  );
}
```

- [ ] **Step 4: Write `cleared-tab.tsx`**

```tsx
// app/(routes)/billing/reports/accountant/_components/cleared-tab.tsx
'use client';

import { CheckCircle2, IndianRupee } from 'lucide-react';
import { useReportKpis, useReportCollections } from '@/hooks/billing/use-accountant-reports';
import type {
  AccountantReportFilters, CollectionsRow,
} from '@/types/billing-accountant-reports';
import { formatINRCompact, formatCurrency, num } from './_utils';
import { ReportKpiGrid, ReportSection, ReportBarChart, ReportTable, type Column } from './report-primitives';

export function ClearedTab({ filters }: { filters: AccountantReportFilters }) {
  const kpis = useReportKpis(filters);
  const byCollege = useReportCollections(filters, 'college');
  const rows = byCollege.data ?? [];
  const k = kpis.data;

  const columns: Column<CollectionsRow>[] = [
    { header: 'College', cell: (r) => r.group_label },
    { header: 'Bills Cleared', align: 'right', cell: (r) => num(r.cleared_bill_count).toLocaleString('en-IN') },
    { header: 'Cleared Amount', align: 'right', cell: (r) => formatCurrency(num(r.cleared_amount)) },
  ];

  return (
    <div className='space-y-6'>
      <ReportKpiGrid
        loading={kpis.isLoading && !k}
        items={[
          { label: 'Bills Cleared', value: num(k?.cleared_bill_count).toLocaleString('en-IN'), icon: CheckCircle2, tone: 'success' },
          { label: 'Cleared Amount', value: formatINRCompact(k?.cleared_amount), title: formatCurrency(num(k?.cleared_amount)), icon: IndianRupee, tone: 'default' },
        ]}
      />
      <ReportSection title='Cleared Bills by College'>
        <ReportBarChart data={rows} categoryKey='group_label' valueKey='cleared_amount' loading={byCollege.isLoading} horizontal />
      </ReportSection>
      <ReportSection title='Detail'>
        <ReportTable columns={columns} rows={rows} loading={byCollege.isLoading} empty='No cleared bills for these filters.' />
      </ReportSection>
    </div>
  );
}
```

- [ ] **Step 5: Write `schemes-tab.tsx`**

```tsx
// app/(routes)/billing/reports/accountant/_components/schemes-tab.tsx
'use client';

import { useReportSchemes } from '@/hooks/billing/use-accountant-reports';
import type { AccountantReportFilters, SchemeRow } from '@/types/billing-accountant-reports';
import { formatCurrency, num } from './_utils';
import { ReportSection, ReportDonutChart, ReportTable, type Column } from './report-primitives';

export function SchemesTab({ filters }: { filters: AccountantReportFilters }) {
  const q = useReportSchemes(filters);
  const rows = q.data ?? [];
  const donut = rows.map((r) => ({ label: r.scheme_label, value: num(r.concession_amount) }));

  const columns: Column<SchemeRow>[] = [
    { header: 'Scheme', cell: (r) => r.scheme_label },
    { header: 'Students', align: 'right', cell: (r) => num(r.student_count).toLocaleString('en-IN') },
    { header: 'Billed', align: 'right', cell: (r) => formatCurrency(num(r.billed)) },
    { header: 'Collected', align: 'right', cell: (r) => formatCurrency(num(r.collected)) },
    { header: 'Outstanding', align: 'right', cell: (r) => formatCurrency(num(r.outstanding)) },
    { header: 'Concession (approved)', align: 'right', cell: (r) => formatCurrency(num(r.concession_amount)) },
  ];

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <ReportSection title='Concession Granted by Scheme'>
          <ReportDonutChart data={donut} loading={q.isLoading} />
        </ReportSection>
        <ReportSection title='Scheme Summary'>
          <ReportTable columns={columns} rows={rows} loading={q.isLoading} empty='No scheme students for these filters.' />
        </ReportSection>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/billing/reports/accountant/_components/overview-tab.tsx" \
        "app/(routes)/billing/reports/accountant/_components/collections-tab.tsx" \
        "app/(routes)/billing/reports/accountant/_components/outstanding-tab.tsx" \
        "app/(routes)/billing/reports/accountant/_components/cleared-tab.tsx" \
        "app/(routes)/billing/reports/accountant/_components/schemes-tab.tsx"
git commit -m "feat(billing-reports): five report tab components"
```

---

## Task 9: Export (Excel / PDF / CSV)

**Files:**
- Create: `app/(routes)/billing/reports/accountant/_components/report-export.ts`

**Interfaces:**
- Consumes: row types (Task 1), `num`; `downloadCsv`/`CsvColumn` from `@/lib/utils/csv-export`.
- Produces: `exportReport(format, payload)` where `format: 'excel'|'pdf'|'csv'`.

- [ ] **Step 1: Write the exporter**

```ts
// app/(routes)/billing/reports/accountant/_components/report-export.ts
import { downloadCsv, type CsvColumn } from '@/lib/utils/csv-export';
import { num } from './_utils';
import type {
  CollectionsRow, OutstandingByYearRow, SchemeRow, ReportKpis,
} from '@/types/billing-accountant-reports';

export interface ReportExportPayload {
  kpis?: ReportKpis;
  collectionsByCollege?: CollectionsRow[];
  outstanding?: OutstandingByYearRow[];
  schemes?: SchemeRow[];
  range: { from?: string; to?: string };
}

function sanitize(v: unknown): unknown {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}
function sanitizeRow<T extends Record<string, unknown>>(r: T): T {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, sanitize(v)])) as T;
}
const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportReport(
  format: 'excel' | 'pdf' | 'csv',
  d: ReportExportPayload
): Promise<void> {
  if (format === 'csv') return exportCsv(d);
  if (format === 'pdf') return exportPdf(d);
  return exportExcel(d);
}

function exportCsv(d: ReportExportPayload) {
  const cols: CsvColumn<CollectionsRow>[] = [
    { header: 'College', accessor: (r) => r.group_label },
    { header: 'Students', accessor: (r) => num(r.student_count) },
    { header: 'Collected', accessor: (r) => num(r.collected) },
    { header: 'Outstanding', accessor: (r) => num(r.outstanding) },
    { header: 'Rate %', accessor: (r) => num(r.collection_rate) },
    { header: 'Bills Cleared', accessor: (r) => num(r.cleared_bill_count) },
    { header: 'Cleared Amount', accessor: (r) => num(r.cleared_amount) },
  ];
  downloadCsv(d.collectionsByCollege ?? [], cols, 'accountant-report-collections');
}

async function exportExcel(d: ReportExportPayload) {
  const mod: any = await import('xlsx');
  const XLSX: any = mod.default ?? mod;
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[]) => {
    if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(sanitizeRow)), name);
  };

  if (d.kpis) {
    add('Overview', [
      { Metric: 'Date range', Value: `${d.range.from ?? 'all'} → ${d.range.to ?? 'today'}` },
      { Metric: 'Collected', Value: num(d.kpis.collected) },
      { Metric: 'Outstanding (now)', Value: num(d.kpis.outstanding) },
      { Metric: 'Bills Cleared', Value: num(d.kpis.cleared_bill_count) },
      { Metric: 'Cleared Amount', Value: num(d.kpis.cleared_amount) },
      { Metric: 'Concessions (approved)', Value: num(d.kpis.concession_amount) },
      { Metric: 'Students Billed', Value: num(d.kpis.students_billed) },
    ]);
  }
  add('Collections (College)', (d.collectionsByCollege ?? []).map((r) => ({
    College: r.group_label, Students: num(r.student_count), Collected: num(r.collected),
    Outstanding: num(r.outstanding), 'Rate %': num(r.collection_rate),
    'Bills Cleared': num(r.cleared_bill_count), 'Cleared Amount': num(r.cleared_amount),
  })));
  add('Outstanding (Year)', (d.outstanding ?? []).map((r) => ({
    'Academic Year': r.academic_year_name, College: r.institution_name,
    'Students With Dues': num(r.students_with_dues), Bills: num(r.bill_count), Outstanding: num(r.outstanding),
  })));
  add('Schemes', (d.schemes ?? []).map((r) => ({
    Scheme: r.scheme_label, Students: num(r.student_count), Billed: num(r.billed),
    Collected: num(r.collected), Outstanding: num(r.outstanding), 'Concession (approved)': num(r.concession_amount),
  })));
  if (wb.SheetNames.length === 0)
    add('Empty', [{ Note: 'No data to export for the current filters.' }]);
  XLSX.writeFile(wb, `accountant-report-${stamp()}.xlsx`);
}

async function exportPdf(d: ReportExportPayload) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF('l', 'mm', 'a4');
  doc.setFontSize(14);
  doc.text('Accountant Report', 14, 14);
  doc.setFontSize(9);
  doc.text(`Range: ${d.range.from ?? 'all'} → ${d.range.to ?? 'today'}`, 14, 20);

  let y = 26;
  if (d.collectionsByCollege?.length) {
    autoTable(doc, {
      startY: y,
      head: [['College', 'Students', 'Collected', 'Outstanding', 'Rate %', 'Cleared', 'Cleared Amt']],
      body: d.collectionsByCollege.map((r) => [
        r.group_label, num(r.student_count), num(r.collected), num(r.outstanding),
        num(r.collection_rate), num(r.cleared_bill_count), num(r.cleared_amount),
      ]),
      styles: { fontSize: 8 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }
  if (d.outstanding?.length) {
    autoTable(doc, {
      startY: y,
      head: [['Academic Year', 'College', 'Students w/ Dues', 'Bills', 'Outstanding']],
      body: d.outstanding.map((r) => [
        r.academic_year_name, r.institution_name, num(r.students_with_dues), num(r.bill_count), num(r.outstanding),
      ]),
      styles: { fontSize: 8 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }
  if (d.schemes?.length) {
    autoTable(doc, {
      startY: y,
      head: [['Scheme', 'Students', 'Billed', 'Collected', 'Outstanding', 'Concession']],
      body: d.schemes.map((r) => [
        r.scheme_label, num(r.student_count), num(r.billed), num(r.collected), num(r.outstanding), num(r.concession_amount),
      ]),
      styles: { fontSize: 8 },
    });
  }
  doc.save(`accountant-report-${stamp()}.pdf`);
}
```

> If `jspdf-autotable`'s default-import shape errors under this bundler, use `import 'jspdf-autotable'` (side-effect) and call `(doc as any).autoTable({...})` instead — check an existing exporter in `lib/utils/pdf-export/` for the project's working form.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/reports/accountant/_components/report-export.ts"
git commit -m "feat(billing-reports): Excel/PDF/CSV export for accountant reports"
```

---

## Task 10: Dashboard orchestrator

**Files:**
- Create: `app/(routes)/billing/reports/accountant/_components/accountant-reports-dashboard.tsx`

**Interfaces:**
- Consumes: filter bar (Task 6), tabs (Task 8), export (Task 9), hooks (Task 4), `_utils`, `useInstitutionsWithAccess`, `usePermissions`.
- Produces: `AccountantReportsDashboard`.

- [ ] **Step 1: Write the orchestrator**

```tsx
// app/(routes)/billing/reports/accountant/_components/accountant-reports-dashboard.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useReportKpis, useReportCollections, useReportOutstanding, useReportSchemes,
  useReportAcademicYears,
} from '@/hooks/billing/use-accountant-reports';
import type { AccountantReportFilters, ReportScheme } from '@/types/billing-accountant-reports';
import { presetRange, type DatePreset } from './_utils';
import { ReportFilterBar, type ReportFilterChange } from './report-filter-bar';
import { exportReport } from './report-export';
import { OverviewTab } from './overview-tab';
import { CollectionsTab } from './collections-tab';
import { OutstandingTab } from './outstanding-tab';
import { ClearedTab } from './cleared-tab';
import { SchemesTab } from './schemes-tab';

const VALID_PRESETS: DatePreset[] = ['today', 'month', 'year', 'all', 'custom'];
const VALID_SCHEMES: ReportScheme[] = ['all', 'first_graduate', 'pmss', 'scholarship_7_5'];
const VALID_TABS = ['overview', 'collections', 'outstanding', 'cleared', 'schemes'];

export function AccountantReportsDashboard() {
  const router = useRouter();
  const sp = useSearchParams();

  const institutionId = sp.get('inst') || undefined;
  const academicYearId = sp.get('year') || undefined;
  const presetParam = sp.get('preset') as DatePreset | null;
  const preset: DatePreset = presetParam && VALID_PRESETS.includes(presetParam) ? presetParam : 'month';
  const from = sp.get('from') || undefined;
  const to = sp.get('to') || undefined;
  const schemeParam = sp.get('scheme') as ReportScheme | null;
  const scheme: ReportScheme = schemeParam && VALID_SCHEMES.includes(schemeParam) ? schemeParam : 'all';
  const tabParam = sp.get('tab');
  const tab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview';

  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess({ isActive: true });
  const multiInstitution = institutions.length > 1;
  const years = useReportAcademicYears(institutionId);

  const { isSuperAdmin, canAccess } = usePermissions();
  const canExport = isSuperAdmin || canAccess('billing.reports', 'export');
  const [exporting, setExporting] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(`/billing/reports/accountant${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, sp]
  );

  const handleChange = useCallback(
    (c: ReportFilterChange) => {
      const u: Record<string, string | null | undefined> = {};
      if ('institution' in c) u.inst = c.institution ?? null;
      if ('academicYear' in c) u.year = c.academicYear ?? null;
      if ('preset' in c) u.preset = c.preset ?? null;
      if ('from' in c) u.from = c.from ?? null;
      if ('to' in c) u.to = c.to ?? null;
      if ('scheme' in c) u.scheme = c.scheme ?? null;
      updateParams(u);
    },
    [updateParams]
  );

  const filters: AccountantReportFilters = useMemo(
    () => ({
      institution_ids: institutionId ? [institutionId] : undefined,
      academic_year_id: academicYearId,
      scheme,
      ...presetRange(preset, from, to),
    }),
    [institutionId, academicYearId, scheme, preset, from, to]
  );

  // Prefetch the datasets export needs so the button has data regardless of tab.
  const kpis = useReportKpis(filters);
  const byCollege = useReportCollections(filters, 'college');
  const outstanding = useReportOutstanding(filters);
  const schemes = useReportSchemes(filters);

  const refetchAll = useCallback(() => {
    kpis.refetch(); byCollege.refetch(); outstanding.refetch(); schemes.refetch();
  }, [kpis, byCollege, outstanding, schemes]);

  const doExport = useCallback(
    async (format: 'excel' | 'pdf' | 'csv') => {
      setExporting(true);
      try {
        await exportReport(format, {
          kpis: kpis.data,
          collectionsByCollege: byCollege.data,
          outstanding: outstanding.data,
          schemes: schemes.data,
          range: { from: filters.date_from, to: filters.date_to },
        });
      } catch {
        toast.error('Export failed. Please try again.');
      } finally {
        setExporting(false);
      }
    },
    [kpis.data, byCollege.data, outstanding.data, schemes.data, filters.date_from, filters.date_to]
  );

  return (
    <div className='space-y-6'>
      <ReportFilterBar
        institutionId={institutionId}
        academicYearId={academicYearId}
        preset={preset}
        from={from}
        to={to}
        scheme={scheme}
        institutions={institutions}
        academicYears={years.data ?? []}
        multiInstitution={multiInstitution}
        loading={loadingInstitutions}
        onChange={handleChange}
        onRefresh={refetchAll}
        isFetching={kpis.isFetching}
        canExport={canExport}
        exporting={exporting}
        onExport={() => doExport('excel')}
      />

      {canExport && (
        <div className='flex justify-end'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='text-muted-foreground hover:text-foreground text-xs underline'>
                Export as…
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => doExport('excel')}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport('pdf')}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport('csv')}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => updateParams({ tab: v })}>
        <TabsList className='flex-wrap'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='collections'>Collections</TabsTrigger>
          <TabsTrigger value='outstanding'>Outstanding</TabsTrigger>
          <TabsTrigger value='cleared'>Cleared</TabsTrigger>
          <TabsTrigger value='schemes'>Schemes</TabsTrigger>
        </TabsList>
        <TabsContent value='overview' className='mt-6'><OverviewTab filters={filters} /></TabsContent>
        <TabsContent value='collections' className='mt-6'><CollectionsTab filters={filters} /></TabsContent>
        <TabsContent value='outstanding' className='mt-6'><OutstandingTab filters={filters} /></TabsContent>
        <TabsContent value='cleared' className='mt-6'><ClearedTab filters={filters} /></TabsContent>
        <TabsContent value='schemes' className='mt-6'><SchemesTab filters={filters} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

> Confirm the dropdown-menu import path (`@/components/ui/dropdown-menu`) exists (it is a standard shadcn component). If not present, replace the "Export as…" block with three small `Button`s calling `doExport('excel'|'pdf'|'csv')`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/reports/accountant/_components/accountant-reports-dashboard.tsx"
git commit -m "feat(billing-reports): dashboard orchestrator (URL filters, tabs, export)"
```

---

## Task 11: Page shell

**Files:**
- Create: `app/(routes)/billing/reports/accountant/page.tsx`

**Interfaces:**
- Consumes: `AccountantReportsDashboard` (Task 10), `PermissionGuard`, `ContentLayout`, `Breadcrumb`.

- [ ] **Step 1: Write the page**

```tsx
// app/(routes)/billing/reports/accountant/page.tsx
'use client';

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountantReportsDashboard } from './_components/accountant-reports-dashboard';

export default function AccountantReportsPage() {
  return (
    <PermissionGuard module='billing.reports' action='view'>
      <ContentLayout title='Accountant Reports'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing/reports'>Billing</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Accountant Reports</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className='py-1 text-2xl font-bold'>Accountant Reports</h1>
            <p className='text-muted-foreground text-sm sm:text-base'>
              College, course & date-wise collections, pending dues by academic year,
              cleared bills, and First Graduate / PMSS / fee-reduction scheme reporting.
            </p>
          </div>

          <Suspense
            fallback={
              <div className='space-y-4'>
                <Skeleton className='h-14 w-full' />
                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                  {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className='h-[92px] w-full' />))}
                </div>
                <Skeleton className='h-72 w-full' />
              </div>
            }
          >
            <AccountantReportsDashboard />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/reports/accountant/page.tsx"
git commit -m "feat(billing-reports): accountant reports page shell"
```

---

## Task 12: Sidebar + permission-map wiring

**Files:**
- Modify: `lib/sidebarMenuLink.ts` (MENU_PERMISSIONS ~line 589; Billing submenu ~line 2359).

**Interfaces:**
- Consumes: existing `billing.reports.view` permission key.

- [ ] **Step 1: Add the MENU_PERMISSIONS entry**

Find the line `'/billing/reports': 'billing.reports.view',` (~589) and add the new route immediately below it:

```ts
  '/billing/reports': 'billing.reports.view',
  '/billing/reports/accountant': 'billing.reports.view',
```

- [ ] **Step 2: Add the Billing submenu entry**

Find the Billing submenu `Reports` line (~2359) and add the new entry immediately below it:

```ts
            { href: '/billing/reports', label: 'Reports', active: pathname === '/billing/reports' },
            { href: '/billing/reports/accountant', label: 'Accountant Reports', active: pathname.startsWith('/billing/reports/accountant') },
```

> Note: change the existing `Reports` `active` from `pathname.startsWith('/billing/reports')` to `pathname === '/billing/reports'` so the two entries don't both highlight on the accountant sub-route.

- [ ] **Step 3: Run the sidebar + menu health gates**

Run: `npm run check:sidebar`
Expected: PASS (no health errors).

Run: `npm run check:menus`
Expected: PASS (permissions catalog + menu coverage + tier2 + audit coverage all pass).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(billing-reports): add Accountant Reports to Billing menu + permission map"
```

---

## Task 13: Final verification & dark-mode polish

**Files:** none created; verification + small fixes only.

- [ ] **Step 1: Full static verification**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS (fix any new warnings in the created files).

- [ ] **Step 2: Build gate**

Run: `npm run build`
Expected: build succeeds (this also runs `check:sidebar`, `check:reachability`, `check:audit-coverage`).

- [ ] **Step 3: Manual smoke as the accountant (impersonation)**

Using the live impersonation harness, sign in as the `accounts` role and open `/billing/reports/accountant`:
- Overview KPIs render non-zero (given data); Collections toggle switches College/Course/Date; Outstanding groups by academic year; Cleared shows counts; Schemes shows First Graduate / PMSS / 7.5% rows with concession ₹.
- Change College, Academic Year, Date preset, and Scheme — every tab's data updates and the URL reflects the filters.
- Export Excel, PDF, CSV — open each and confirm figures match the on-screen tables.
Expected: all pass; no console errors.

- [ ] **Step 4: Dark-mode check (dataviz)**

Toggle dark mode (theme toggle) and screenshot each tab via the `/run` skill. Confirm chart bars/lines/donut use the `--chart-N` tokens and remain legible in both themes (no invisible/hardcoded fills).
Expected: charts adapt to dark mode.

- [ ] **Step 5: Final commit (if any polish was needed)**

```bash
git add -A
git commit -m "chore(billing-reports): lint + dark-mode polish for accountant reports"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:**
- Report 1 College-wise → Task 2 RPC `collections` (college) + Collections tab. ✓
- Report 2 Course-wise → `collections` (course) + Collections tab. ✓
- Report 3 Date-wise → `collections` (date) + Overview/Collections. ✓
- Report 4 Pending yearwise → `outstanding_by_year` + Outstanding tab. ✓
- Report 5 Bills cleared → `collections` cleared_* + `kpis` + Cleared tab. ✓
- Report 6 First Graduate filter → `p_scheme='first_graduate'` in every RPC + filter bar. ✓
- Report 7 Fee reduction → `schemes.concession_amount` (approved `billing_discounts`) + Schemes tab. ✓
- Report 8 PMSS filter → `p_scheme='pmss'` + filter bar + Schemes tab. ✓
- Improved UI / dataviz → Tasks 6–8 (sticky bar, primitives, `--chart-N` tokens), Task 13 dark-mode check. ✓
- Export Excel/PDF/CSV → Task 9. ✓
- Permissions/menu → Task 12; page guard Task 11. ✓
- Production RPC apply → Task 2 Steps 2–4. ✓

**Placeholder scan:** No TBD/TODO; all steps carry real code or exact commands. Two annotated fallbacks (BaseService return shape; jspdf-autotable import form) point at the exact reference file to confirm against — not vague instructions.

**Type consistency:** RPC `RETURNS TABLE` columns match the Task 1 row types field-for-field (`group_key/group_label/…`, `scheme/scheme_label/…`, `ReportKpis`). Service method names (`getCollections/getOutstandingByYear/getSchemes/getKpis/getAcademicYears`) match the hooks and dashboard call sites. `chartToken`, `num`, `presetRange` names are consistent across `_utils`, primitives, tabs.
