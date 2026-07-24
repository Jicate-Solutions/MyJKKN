# Accountant Advanced Reports Hub — Design Spec

- **Date:** 2026-07-24
- **Author:** Sangeetha V (with Claude Code)
- **Status:** Approved design → ready for implementation plan
- **Branch:** `feat/billing-accountant-reports`
- **Module:** Billing (`app/(routes)/billing`)

## 1. Goal

Give the **Accountant** role a dedicated, redesigned reports hub with the advanced
billing reports they need to reconcile collections, dues, and government-scheme
concessions across all JKKN colleges:

1. **College-wise payment** — collection totals grouped by institution/college.
2. **Course-wise** — collection totals grouped by the student's **program/course** (BDS, B.Pharm, B.Sc Nursing…).
3. **Date-wise** — collection trend over a date range.
4. **Pending payments — yearwise** — outstanding balances grouped by **academic year** (2024–25…).
5. **Bills cleared** — fully-paid bills in range.
6. **First Graduate filter** — restrict any report to first-generation-graduate students.
7. **Fees reduction for them** — approved ₹ concessions (`billing_discounts`) granted to scheme students.
8. **PMSS filter** — restrict any report to Post-Matric Scholarship Scheme students.

Plus: an improved, dark-mode-correct UI using the `dataviz` design system for all charts.

## 2. The Accountant role (confirmed)

- The Accountant role is the DB-backed custom role **`accounts`** (assistant: `accountant_assistant`).
- It carries `institution_scope='all'` (sees every college) and already holds
  `billing.reports.view` / `billing.reports.export` and `billing.analytics.view` / `.export`.
- **No new permission key is required.** Gate the new page on `billing.reports.view` (view) and
  `billing.reports.export` (export).

## 3. Data model reference (confirmed via schema exploration)

Central tables (see `types/supabase.ts`):

- **`billing_student_bills`** — charge ledger. Key columns: `student_id`, `institution_id`,
  `item_category_id`, `academic_year_id`, `applies_year_of_study`, `final_amount`,
  **`balance_amount`** (outstanding), `status`, `payment_date`, `due_date`.
  - `status` values: `unpaid | partially_paid | paid | cancelled | overdue | superseded` (+ app-level `refunded`).
  - **Outstanding** is computed as `status IN ('unpaid','partially_paid','overdue') AND balance_amount > 0`.
  - **Cleared** = `status = 'paid'`.
- **`billing_receipts`** — money received. `payment_amount`, `payment_paid_date`, `receipt_date`,
  `payment_mode`, `student_id`, `institution_id`. Allocated to bills via **`billing_receipt_items`**
  (`receipt_id`, `bill_id`, `amount_paid`).
- **`billing_discounts`** — concessions/waivers. `discount_amount`, `discount_type`,
  `discount_category`, `approval_status` (`pending|approved|rejected`), `authorizer_id`, `bill_id`.
- Dimensions live on the **learner**, not the bill: `learners_profiles` carries `institution_id`,
  `program_id`, `department_id`, `degree_id`, `batch_id`, `academic_year_id`, `quota_id`,
  **`first_graduate`** (boolean), **`scholarship_type`** (text).

Scheme cohorts:

- **First Graduate** = `learners_profiles.first_graduate = true` (also `scholarship_type='FIRST GRADUATE'`).
- **PMSS** = `learners_profiles.quota_id → quotas.code='pmss'` (also `scholarship_type='PMS SCHOLARSHIP'`).
- **7.5% Scholarship** = `scholarship_type='7.5% SCHOLARSHIP'`.
- **Fee reduction amount** = approved `billing_discounts` (`approval_status='approved'`, sum `discount_amount`).

Join paths:

- Bill/receipt → **student**: `student_id → learners_profiles.id`.
- Bill/receipt → **college**: `institution_id → institutions.id`.
- Bill/receipt → **course/program**: via learner — `student_id → learners_profiles.program_id → programs`.
- Bill → **academic year**: `billing_student_bills.academic_year_id → academic_years.id` (nullable for legacy bills).

## 4. Design decisions (approved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where it lives | **New dedicated hub** at `app/(routes)/billing/reports/accountant/` | Maximum redesign freedom; existing reports untouched. |
| "Course" meaning | **Program / Course** (`learners_profiles.program_id`) | Standard "course-wise collection" meaning in Indian college accounting. |
| "Yearwise" pending | **Academic year** (`billing_student_bills.academic_year_id`) | "How much is still owed from each academic year." |
| "Fee reduction" source | **`billing_discounts`** (approved ₹) | Real rupee figures + approval audit trail for govt-scheme reconciliation. |
| Layout | **Tabbed hub + shared sticky filter bar** | Matches `Tabs`/`useTabParam`; per-tab lazy load; best on mobile. |
| Data layer | **`SECURITY DEFINER` RPCs** (mirror `/billing/analytics`) | Avoids the known courses-style RLS full-scan timeout; enforces scope via `role_has_institution_access`. |

## 5. Page structure

Route: `app/(routes)/billing/reports/accountant/page.tsx`
Follows the `/billing/analytics` page shell: `PermissionGuard` → `ContentLayout` → `Breadcrumb`
→ inline `h1` + subtitle → `Suspense` → client dashboard reading URL filters.

### 5.1 Sticky global filter bar (applies to all tabs)

URL-param driven (`useSearchParams` + `router.replace`, batched into one write per gesture,
mirroring `analytics-dashboard.tsx`):

- **College** (institution) — `Select`, options from `OrganizationService.getInstitutionNames(true, undefined, 'all')`, default "All Colleges".
- **Academic Year** — `Select` from `academic_years`, default active year.
- **Date range** — preset `Select` (Today / This Month / This Year / Custom) + custom from/to,
  reusing `DATE_PRESETS` / `presetRange` from `app/(routes)/billing/analytics/_components/_utils.ts`.
- **Scheme cohort** — `Select`: All / First Graduate / PMSS / 7.5% Scholarship.
  Threaded to every RPC as `p_scheme` so it filters **every** report.
- **Actions:** Export ▾ (Excel / PDF / CSV) · Refresh.

### 5.2 Tabs (persisted to URL via `useTabParam`)

| Tab | Reports covered | Content |
|-----|-----------------|---------|
| **Overview** | — | 4 KPI cards (Collected · Outstanding · Cleared · Concessions) + collection-trend line + college-comparison bar. |
| **Collections** | 1, 2, 3 | Group-by toggle (College / Course / Date) driving one bar-or-line chart + detail table (group, bills, students, ₹ collected, ₹ outstanding, collection %). |
| **Outstanding** | 4 | ₹ outstanding grouped by **academic year** (bar) + table (year, students-with-dues, bills, ₹ outstanding). |
| **Cleared** | 5 | Fully-paid bills in range: KPI + cleared-trend chart + table (student, program, college, ₹, cleared date). |
| **Schemes** | 6, 7, 8 | Per-scheme rollup: students, ₹ billed, ₹ collected, ₹ outstanding, **₹ concession granted** (approved `billing_discounts`); donut of concession by scheme + table to student level with approval status. |

## 6. Data layer

### 6.1 Reuse existing RPCs where they already fit

- `get_billing_analytics_by_institution` — college-wise + Overview KPIs.
- `get_billing_collection_trend` — date-wise trend.
- `get_billing_analytics_by_category` — fee-head breakdown (optional Overview widget).

These do **not** accept a scheme cohort param, so they are used only where `scheme = All`
(Overview) or superseded by the new RPCs below.

### 6.2 New RPCs (SECURITY DEFINER, style copied from the shipped analytics RPCs)

All accept the shared filter set and enforce institution scope via `role_has_institution_access`.

1. **`get_billing_report_collections(p_institution_id uuid, p_date_from date, p_date_to date, p_academic_year_id uuid, p_scheme text, p_group_by text)`**
   - `p_group_by ∈ {'college','course','date'}`.
   - Returns rows: `group_key`, `group_label`, `bill_count`, `student_count`, `collected`, `outstanding`, `collection_rate`.
   - **`collected`** = `SUM(billing_receipts.payment_amount)` where `payment_paid_date` is within `[p_date_from, p_date_to]`. Grouping dimension:
     - `college` → group by `billing_receipts.institution_id` (direct column).
     - `date` → group by `payment_paid_date` (day/week/month bucket).
     - `course` → group by the payer's program: `billing_receipts.student_id → learners_profiles.program_id → programs.program_name`.
   - **`outstanding`** = `SUM(billing_student_bills.balance_amount)` for the same group where `status IN ('unpaid','partially_paid','overdue') AND balance_amount > 0` (a **current snapshot**, not date-bounded by receipts). `collection_rate = collected / (collected + outstanding)`.
   - `p_academic_year_id`: for bill-based metrics (outstanding/cleared) it filters on the bill's own `academic_year_id`; for the receipt-based `collected` it attributes via the student's `learners_profiles.academic_year_id` (receipts carry no academic year). `p_scheme` filters via the learner (`first_graduate`/`quota`/`scholarship_type`).
   - Verified against production during Task 2: allocation-based `receipt_items.amount_paid` covers only ~25% of receipts, so `collected` uses `billing_receipts.payment_amount` (consistent with `/billing/analytics`). `billing_discounts` is currently empty, so scheme concession totals read ₹0 until concessions are entered.

2. **`get_billing_report_outstanding_by_year(p_institution_id uuid, p_academic_year_id uuid, p_scheme text)`**
   - Returns rows: `academic_year_id`, `academic_year_name`, `institution_id`, `students_with_dues`, `bill_count`, `outstanding`.
   - Filter `status IN ('unpaid','partially_paid','overdue') AND balance_amount > 0`, group by `academic_year_id`.

3. **`get_billing_report_schemes(p_institution_id uuid, p_academic_year_id uuid, p_date_from date, p_date_to date)`**
   - Returns rows: `scheme` (`first_graduate|pmss|scholarship_7_5|other`), `student_count`, `billed`, `collected`, `outstanding`, `concession_amount` (sum of approved `billing_discounts.discount_amount`).

Optionally a fourth `get_billing_report_overview_kpis(...)` if the four KPIs can't be cheaply
derived from the above; otherwise compute KPIs client-side from existing/new RPC results.

### 6.3 Service + hooks

- `lib/services/billing/reports/accountant-report-service.ts` → `BillingAccountantReportService`
  (thin wrapper over the RPCs, following `BillingAnalyticsService` `executeDashboardRPC` pattern).
- `hooks/billing/use-accountant-reports.ts` → React Query hooks with a `accountantReportKeys`
  query-key factory (mirror `use-billing-analytics.ts`).
- Types in `types/billing-accountant-reports.ts` (filters + per-RPC result row types).

## 7. Charts & UI

- **recharts** inside shadcn `Card`s; reuse `KpiCards`, `Skeleton` loading, `EmptyState`.
- **Dark-mode fix:** use `hsl(var(--chart-N))` tokens instead of the hardcoded hex fills
  (`#93c5fd`, `#16a34a`) the current billing charts use — those don't adapt to dark mode.
- **Load the `dataviz` skill before writing any chart code** to lock: accessible palette (light+dark),
  mark specs, tooltip/legend rules, KPI-tile design — so all charts read as one system.
- Provisional chart-to-data mapping (data-shape driven, finalized under `dataviz`):
  - Trends (date-wise, cleared-over-time) → line/area.
  - Comparisons (college-wise, course-wise) → horizontal bar.
  - Pending by academic year → bar.
  - Scheme concessions → donut.

## 8. Export

- **Excel** — multi-sheet workbook via the sanitized `exportAnalyticsWorkbook` pattern
  (`app/(routes)/billing/analytics/_components/export-analytics.ts`), one sheet per report.
- **PDF** — `jsPDF` + `jspdf-autotable` (printable/shareable accountant reports).
- **CSV** — `exportToCSV` (`lib/utils/csv-export.ts`).
- Export respects the active filters (college / academic year / date range / scheme).

## 9. Permissions & menu wiring

- Page auto-guarded by `app/(routes)/billing/layout.tsx` `RoutePermissionGuard`.
- Add `MENU_PERMISSIONS['/billing/reports/accountant'] = 'billing.reports.view'` in `lib/sidebarMenuLink.ts` (~line 589).
- Add a submenu entry under the "Billing & Accounts" group's Billing menu (~line 2359).
- In-page: `canView = isSuperAdmin || canAccess('billing.reports','view')`, `canExport = … 'export'`.

## 10. Rollout (production apply)

- New RPCs ship as reviewable migration files under `supabase/migrations/`.
- Applied to **production** via the Supabase MCP (`apply_migration`) — no local DB; applies are classifier-gated.
- Each RPC is idempotent (`CREATE OR REPLACE FUNCTION`) and granted `EXECUTE` to `authenticated`.

## 11. Testing & verification

- **RPC correctness:** SQL assertions against known bills — reconcile `collected + outstanding`,
  verify scheme cohort counts match `learners_profiles`, verify academic-year grouping sums to the
  institution total.
- **Scope:** confirm `accounts` (scope=all) sees all colleges; confirm an `own`-scoped billing role
  sees only its institution (via the live impersonation harness).
- **UI:** impersonate `accounts`, exercise each tab + filter combination; screenshot light + dark via `/run`.
- **Export:** open generated Excel/PDF/CSV, confirm figures match the on-screen tables.

## 12. Out of scope (YAGNI)

- No changes to the existing `/billing/reports` or `/billing/analytics` pages (left intact).
- No new scholarship/discount *entry* workflow — this is read-only reporting.
- No scheduled/emailed report delivery.
- No per-student drill-down beyond the Schemes tab table.
- No new permission key (reuse `billing.reports.view/export`).

## 13. Open questions

None outstanding. Export set confirmed as Excel + PDF + CSV; five-tab grouping confirmed;
new RPCs approved for production apply.
