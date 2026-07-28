# Billing Reports — Academic Hierarchy & Student Category Filters — Design Spec

- **Date:** 2026-07-25
- **Author:** Sangeetha V (with Claude Code)
- **Status:** Approved design → ready for implementation plan
- **Branch:** `feat/billing-reports-filters`
- **Module:** Billing (`app/(routes)/billing/reports`)

## 1. Goal

Give the **main billing reports page** (`/billing/reports`, six tabs) the same academic
hierarchy filter set that Schedule Management already offers, plus a student-category
(government scheme) filter.

Filters to add:

| Filter | Source |
|---|---|
| Institution | already present, but rescoped (§7) |
| Academic Year | new |
| Degree | new |
| Department | new (type field exists, no query reads it) |
| Program | new |
| Semester | new |
| Section | new |
| Category (`item_category_id`) | new |
| Student Category — First Graduate / PMSS / 7.5% Scholarship / Others | new, **multi-select** |

**All six tabs honour every filter**, including Dashboard.

Out of scope: `/billing/reports/accountant` (unchanged); refactoring Schedule
Management's own filter component; new indexes (none needed).

## 2. Findings from schema exploration

These were confirmed against the live database on 2026-07-25 and drive the whole design.

### 2.1 The hierarchy is not on the billing tables

`degree_id`, `department_id`, `program_id`, `semester_id`, `section_id` exist **only** on
`learners_profiles`. The billing tables carry:

| Table | institution_id | student_id | academic_year_id | item_category_id |
|---|---|---|---|---|
| `billing_student_bills` | yes | yes | yes | yes |
| `billing_receipts` | yes | yes | — | — |
| `billing_invoices` | yes | yes | — | — |
| `billing_discounts` | — | — | — | — (only `bill_id`) |
| `billing_refunds` | — | — | — | — (only `receipt_id`) |

Every new filter is therefore a join through the student, one or two hops deep.

### 2.2 Data volumes (live, 2026-07-25)

- `learners_profiles` — 6,961 rows
- `billing_student_bills` — 10,717 rows, of which **7,342 are outstanding**
- `billing_receipts` — 2,958; `billing_receipt_items` — 3,729
- `billing_invoices` — **2**; `billing_discounts` — **0**; `billing_refunds` — **0**

Outstanding and Collection carry all the real data. The other three tabs must still
work correctly, but they are not where the performance risk lives.

### 2.3 Hierarchy density on `learners_profiles`

institution 6,961 / degree 6,906 / department 6,906 / program 6,925 / semester 6,896 /
section 6,079 / academic_year 6,898 — out of 6,961. Well populated; all these filters
are meaningful.

### 2.4 Scheme columns

`first_graduate` (boolean) is `TRUE` for **zero** learners. The live signal is
`scholarship_type` (text):

| `scholarship_type` | Count |
|---|---|
| `NOT APPLICABLE` | 4,811 |
| `FIRST GRADUATE` | 1,449 |
| `PMS SCHOLARSHIP` | 432 |
| `7.5% SCHOLARSHIP` | 204 |
| `NULL` | 65 |

The existing accountant RPCs already OR the boolean with the text and with
`quotas.code='pmss'`. That logic is reused verbatim; the dead boolean is kept in the
predicate so the cohort stays correct if the column is ever backfilled.

### 2.5 The academic-year trap

`billing_student_bills.academic_year_id` is populated on only **4,837 of 10,717** bills
(45%). Selecting a year silently hides the other 5,880. Mitigation in §6.

### 2.6 Pre-existing bug: the Outstanding tab is broken

`BillingReportService.getOutstandingReport` selects `students(...)`. No relation named
`students` exists in any schema; the FK is `billing_student_bills.student_id →
learners_profiles`. PostgREST returns `PGRST200`, the service throws, and the tab has
always rendered the red "Error Loading Report" card. `git log` shows
`billing-report-service.ts` untouched since the initial commit. The rewrite deletes this
query, fixing it as a side effect.

### 2.7 Existing indexes are sufficient

`learners_profiles` already has btree indexes on `degree_id`, `department_id`,
`program_id`, `semester_id`, `section_id`, `academic_year_id`, `institution_id`,
`first_graduate`, plus composite `ix_learners_profiles_matrix_full`. `billing_student_bills`
has `student_id`, `institution_id`, `academic_year_id`, `item_category_id`,
`(student_id, academic_year_id)` and a partial index on outstanding statuses. **No new
indexes are required.**

## 3. Architecture decision

**Chosen: SECURITY DEFINER RPCs**, mirroring the pattern established by
`20260724090000_accountant_report_rpcs.sql` and `accountant-report-service.ts`.

### Rejected: extend the client-side PostgREST queries

The PMSS rule is `scholarship_type = 'PMS SCHOLARSHIP' OR quotas.code = 'pmss'` — an `OR`
spanning two different embedded relations. PostgREST's `.or()` accepts a single
`referencedTable` and cannot express this. The "Others" bucket needs the same predicate
negated. Separately, the Dashboard would fire ~15 filtered scans per render against
RLS'd tables — the shape that produces 57014 statement timeouts elsewhere in this
codebase.

### Rejected: a flattened reporting view

`v_billing_report_bills` with a computed `scheme` column would make hierarchy filters
plain `.eq()` calls, which is tidy. But aggregation stays client-side so the Dashboard
still pulls rows, and a `security_invoker` view keeps per-row RLS and the timeout risk.
RPCs would still be needed for the Dashboard.

## 4. Database layer — one migration, seven functions

All seven open with a permission gate and an institution scope, matching the accountant
RPCs:

```sql
IF NOT public.user_has_permission('billing.reports.view') THEN
  RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
END IF;

SELECT array_agg(institution_id) INTO v_inst
FROM public.get_user_accessible_institutions(auth.uid())
WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
IF v_inst IS NULL THEN RETURN; END IF;
```

### 4.1 `billing_report_student_cohort` — shared helper

```
billing_report_student_cohort(
  p_institution_ids uuid[], p_degree_id uuid, p_department_id uuid,
  p_program_id uuid, p_semester_id uuid, p_section_id uuid,
  p_schemes text[]
) RETURNS TABLE(student_id uuid)
LANGUAGE sql STABLE
```

Written in `LANGUAGE sql`, not `plpgsql`, so Postgres **inlines** it into each caller's
plan. A `plpgsql` set-returning function is an optimisation barrier: it executes,
materialises, then joins. Inlined, the planner sees `learners_profiles.degree_id = $1`
directly and uses `idx_learners_profiles_degree_id`.

`p_schemes` semantics — `NULL` or empty means no scheme restriction. Otherwise the
cohort is the union of the selected buckets:

| Key | Predicate |
|---|---|
| `first_graduate` | `lp.first_graduate IS TRUE OR lp.scholarship_type = 'FIRST GRADUATE'` |
| `pmss` | `lp.scholarship_type = 'PMS SCHOLARSHIP' OR q.code = 'pmss'` |
| `scholarship_7_5` | `lp.scholarship_type = '7.5% SCHOLARSHIP'` |
| `other` | `NOT` (any of the three above) |

Evaluated over live data the buckets are **exhaustive** and today happen to be disjoint:
FG 1,449 + PMSS 435 + 7.5% 204 + Others 4,873 = 6,961, with 0 learners matching more than
one bucket. Note PMSS is **435, not the 432** that `scholarship_type` alone reports — three
learners are caught only by `quotas.code = 'pmss'`.

Disjointness is a property of the current data, **not a guarantee of the predicates**: a
learner with `scholarship_type = 'FIRST GRADUATE'` and a PMSS quota would match two
buckets. Multi-select is therefore a `UNION` and the helper returns `DISTINCT student_id`,
so an overlapping learner is counted once regardless of how many selected buckets they
match.

`other` deliberately includes both `NOT APPLICABLE` (4,811) and `NULL` (65) — and, being
defined by negation, anything else that fails all three predicates.

Called from inside a SECURITY DEFINER caller, the helper runs with definer rights, so
`learners_profiles` RLS does not re-apply per row.

### 4.2 `get_billing_reports_dashboard`

Returns a single `jsonb` payload — `kpis`, `monthly_collection[]`,
`institution_summary[]`, `recent_transactions[]` — replacing 15 separate client
round-trips. Accepts the full filter set.

### 4.3 Five paginated list RPCs

`get_billing_reports_outstanding`, `_collection`, `_invoices`, `_discounts`, `_refunds`.

Each accepts the full filter set plus `p_limit int DEFAULT 50`, `p_offset int DEFAULT 0`,
and returns its rows plus `total_count bigint` (window count over the unpaginated set) so
the UI can render "showing 1–50 of N".

`_outstanding` paginates **by student**, returning one row per student with the student's
matching bills as a `jsonb` array — preserving the existing grouped render shape.

`p_limit => NULL` means "all rows", capped at 10,000. Used only by the export path.

### 4.4 How each filter reaches each table

This is deliberately not uniform — it follows the FK topology in §2.1.

- **Bills** — `institution_id`, `academic_year_id`, `item_category_id` are direct columns.
  Hierarchy and scheme via `JOIN billing_report_student_cohort(...) c ON c.student_id = b.student_id`.
- **Receipts** — institution and student direct. Academic year and category via
  `EXISTS (SELECT 1 FROM billing_receipt_items ri JOIN billing_student_bills b ON b.id = ri.bill_id
  WHERE ri.receipt_id = r.id AND ...)`.
  **`EXISTS`, not `JOIN`** — a receipt allocated across three bills must remain one row in
  the Collection list and must not triple-count in the totals. This is a semi-join:
  "does this receipt touch a matching bill?" without changing cardinality.
- **Invoices** — institution and student direct. Year/category via
  `invoice_items → receipt_id → receipt_items → bill`, same `EXISTS` form.
- **Discounts** — no institution column; everything routes through `bill_id →
  billing_student_bills`, then the bills rules above.
- **Refunds** — no institution column; everything routes through `receipt_id →
  billing_receipts`, then the receipts rules above.

## 5. Client layer

### 5.1 `BillingReportFilters` (types/billing-schedule.ts)

```ts
export type ReportSchemeKey =
  | 'first_graduate' | 'pmss' | 'scholarship_7_5' | 'other';

export interface BillingReportFilters {
  institution_id?: string;
  academic_year_id?: string;   // 'unspecified' sentinel — see §6
  degree_id?: string;
  department_id?: string;      // field existed; no query read it. Now real.
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  item_category_id?: string;
  schemes?: ReportSchemeKey[];
  student_id?: string;
  date_from?: string;
  date_to?: string;
  report_type?: 'summary' | 'detailed' | 'outstanding' | 'collection'
              | 'invoice' | 'discount' | 'refund';
  format?: 'pdf' | 'excel' | 'csv';
}
```

### 5.2 New hook — `hooks/organization/use-academic-hierarchy-filters.ts`

Owns the cascading loads and the cascade-clear map, lifted from the logic in
`app/(routes)/billing/schedule/_components/advanced-billing-schedule-filters.tsx`:

- institutions ← `useInstitutionsWithAccess`
- academic years ← `AcademicYearService.getAcademicYearsByInstitution(institution)`
- degrees ← `DegreeService.getDegreesByInstitution(institution)`
- departments ← `DepartmentService.getDepartmentsByDegree(degree)`
- programs ← `ProgramService.getProgramsByDepartment(department)`
- semesters ← `SemesterService.getSemestersByProgram(program)`
- sections ← `SectionService.getSectionsBySemester(semester)`
- categories ← `BillingCategoryService.getBillingCategories()` (not cascaded)

Cascade-clear map (unchanged from Schedule Management):

```
institution → degree, department, program, semester, section, academic_year
degree      → department, program, semester, section
department  → program, semester, section
program     → semester, section
semester    → section
```

Display columns, verified: `degrees.degree_name`, `departments.department_name`,
`programs.program_name`, `semesters.semester_name`, `sections.section_name`,
`billing_categories.category_name`, `academic_years.academic_year_name`,
`institutions.name`, `quotas.code`.

Schedule Management is **not** migrated onto this hook in this change — that is a
follow-up, and touching a working page here is unnecessary regression risk.

### 5.3 `report-filters.tsx` — rewritten

Presentation only, against the hook: nine cascading controls, a scheme multi-select
popover with checkboxes (First Graduate / PMSS / 7.5% Scholarship / Others), the existing
date range and report type, active-filter chips with individual dismiss, and clear-all.
Follows the collapsible layout of the Schedule Management panel.

### 5.4 `billing-report-service.ts` — rewritten as an RPC wrapper

Modelled on `accountant-report-service.ts` (84 lines). Extends `BaseService` and uses
`executeDashboardRPC` for its timeout and slow-query logging. The ~15 private aggregate
helpers and the phantom-`students` query are deleted; the file goes from 1,101 lines to
roughly 250.

### 5.5 `use-billing-reports.ts`

Hooks gain `page` / `pageSize` state and return `totalCount`. Filter objects are memoised
at the call site. Note the latent bug in `useTransactionSummary(filters = {})`: the
default `{}` is a fresh object each render inside a `useCallback` dependency array, which
would loop. It is unused by this page today; the rewrite removes the default.

## 6. The academic-year "Unspecified" option

Because 55% of bills have a null `academic_year_id`, the Academic Year select carries an
explicit **Unspecified** option (matching Schedule Management), mapped to a sentinel that
the RPCs translate to `b.academic_year_id IS NULL`. An inline hint next to the control
states that selecting a specific year excludes bills with no year recorded.

## 7. Institution scope correction

`report-filters.tsx` currently loads institutions via
`OrganizationService.getInstitutionNames(true, undefined, 'all')`, which lists
institutions regardless of the user's access. The RPCs scope through
`get_user_accessible_institutions(auth.uid())`, so the dropdown would offer options that
return empty. It moves to `useInstitutionsWithAccess`, with the control auto-pinned and
hidden for single-institution users — the same treatment Schedule Management gives it.

## 8. Pagination

Server-side, 50 rows per page, on all five list tabs, with prev/next and a
"showing X–Y of N" label.

This is not an enhancement — it is required for the §2.6 fix to be usable. Outstanding
matches 7,342 bills across roughly 2,000 students; the current code only appears
survivable because it throws before rendering. Fixing the query without pagination would
render 2,000 nested tables.

Export calls the same RPCs with `p_limit => NULL` so exports reflect the full filtered
set, not the visible page.

## 9. Verification

**SQL** — each RPC against known live counts: 7,342 outstanding bills; the cohort helper
must return FG 1,449 / PMSS 435 / 7.5% 204 / Others 4,873, and selecting all four buckets
must return exactly 6,961 distinct learners (this asserts both exhaustiveness and that the
`UNION` de-duplicates); receipts under a category filter must not exceed 2,958 (proving
`EXISTS` did not duplicate).

**Authorization** — each RPC called as a role without `billing.reports.view` must raise
42501. Institution confinement checked with the live impersonation harness: an
`own`-scope role must see only its own institution's rows.

**UI** — cascade clearing at every level; the Unspecified academic year; each scheme
combination including Others alone and all four together; pagination boundaries (first
page, last partial page, empty result); export row count equals `total_count`; the
Outstanding tab renders instead of erroring.

**Empty tabs** — Discounts, Refunds and Invoices have 0/0/2 rows. Their RPCs are verified
by SQL assertion rather than by UI inspection, since the UI cannot distinguish "correct
and empty" from "broken and empty".

## 10. Risks

| Risk | Mitigation |
|---|---|
| Rewriting a 1,101-line service in one pass | Row shapes returned by the RPCs match the existing TypeScript interfaces, so tab components change only for pagination |
| SECURITY DEFINER bypasses RLS | Explicit permission gate + `get_user_accessible_institutions` scope in every function, verified by the impersonation harness |
| Dashboard JSONB payload shape drift | `BillingDashboardMetrics` stays the authoritative type; the RPC is written to fill it exactly |
| `EXISTS` vs `JOIN` regression on receipts | Explicit count assertion in §9 |
| Academic-year filter appearing to lose data | Unspecified option + inline hint (§6) |
