# Academic-Year-Aware Billing — Design

**Date:** 2026-06-06
**Status:** Approved (design); pending implementation plan
**Area:** Billing → Schedule (`/billing/schedule`)
**Author:** Boobalan (with Claude)

## 1. Problem

For multi-year courses (e.g. BDS = 4 years), the accounts team creates tuition/fee
bills for every year. Today a bill carries **no record of which academic year it
belongs to**. The only academic-year signal is a join from the bill to the
student's profile (`learners_profiles.academic_year_id`), which holds the
student's **current** year. The consequences:

- Once a student advances (year 1 → year 2), *every* past bill appears to belong
  to the new current year. You cannot tell a 1st-year tuition bill from a
  2nd-year one.
- You cannot check "is the 1st-year fee fully paid?" independently of other years.

The platform already has a fully-implemented **Academic Year** module
(`academic_years` table, per-institution, named e.g. `"2024-2025"`, with
`start_date` / `end_date` / `is_active`, and a `useAcademicYears(institutionId)`
hook). The fix is to attach an academic year to the bill itself.

## 2. Approach

Stamp `academic_year_id` **directly on `billing_student_bills` at creation time**,
mirroring the existing per-bill provenance columns added for hostel billing
(`applies_year_of_study`, `hostel_year_id`, `package_id`, `fee_source`).

### Rejected alternative
Keep filtering by `student.academic_year_id` (the current in-code approach, and
the partially-built filter in the codebase). Rejected: the student row holds only
one current value, so it can structurally never distinguish year-1 from year-2
bills. This is the root cause, not a fix.

### Key principle — nullable column, UI-required
The column is **nullable in the database** but **required in the create/edit
form** (Zod) and in bulk-create.

- Making it `NOT NULL` would break other insert paths that don't supply it —
  notably the hostel-billing RPC `campus_living_generate_hostel_year_bills` and
  the Excel import — and would require a backfill we explicitly chose not to do.
- Enforcing "required" only in the manual UI means **new manual bills are always
  tagged**, while automated/legacy paths keep working and simply produce `NULL`
  ("Unspecified").

This matches the repo-wide pattern (TypeScript strict off; validation at real
boundaries; nullable FK + `'' → null` normalization to avoid Postgres `22P02`).

## 3. Decisions (confirmed)

| Decision | Choice |
|---|---|
| **Create behavior** | Selectable `<Select>` defaulting to the student's *current* academic year, editable so future-year bills can be pre-created. Required in the form. DB column nullable. |
| **Backfill of 5,770 existing bills** | **None.** Existing bills stay `NULL` and render as "Unspecified". Only new bills are tagged. |
| **Detail-page presentation** | Group bills into collapsible per-academic-year sections, each with Total / Paid / Outstanding subtotals and an aggregate PAID / PARTIAL / UNPAID badge. |

## 4. Current-state facts (verified against DB + code, 2026-06-06)

- `billing_student_bills`: **5,770 rows**, all `fee_source = 'academic'`, **no
  `academic_year_id` column**. Existing FKs: learner_profile, institution,
  item_category, created_by, plus hostel_year_id → `hostel_years`, package_id →
  `admission_packages`, superseded_by_bill_id (self).
- `academic_years`: per-institution (`institution_id`), `academic_year_name`,
  `start_date`, `end_date`, `is_active`. **30 rows across 8 institutions.**
- All **8** institutions that have bills have active academic years (feature not
  blocked).
- Bill insert paths today: single create form, bulk-create page, Excel import,
  hostel-generation RPC. None of the manual paths capture an academic year.
- The student detail page groups bills only by status; summary cards are global
  (Total Fees / Net Paid / Outstanding / Overdue) with no per-year breakdown.
- **In-progress uncommitted work in the same files** is an unrelated
  *accommodation-type filter* feature. This design layers on top of it and must
  not overwrite it.

## 5. Layer-by-layer changes

### 5.1 Database
- Migration: `ALTER TABLE billing_student_bills ADD COLUMN academic_year_id uuid`
  with FK → `academic_years(id)` `ON DELETE SET NULL`.
- Indexes: `idx_billing_student_bills_academic_year (academic_year_id)` and a
  composite `(student_id, academic_year_id)` for the detail grouping query.
- **No backfill.**
- **No RLS change** — existing SELECT/INSERT/UPDATE policies on the table already
  cover the new column; no new permission key (not a new module/resource).
- Mirror the DDL into `supabase/setup/01_tables.sql` (+ FK + index); commit the
  real migration body to `supabase/migrations/` (no `SELECT 1;` placeholder); add
  the column + FK relationship to `types/supabase.ts` (`billing_student_bills`
  Row / Insert / Update).

### 5.2 Types (`types/billing-schedule.ts`)
- `StudentBill`: add `academic_year_id?: string | null` and
  `academic_year?: { id: string; academic_year_name: string }`.
- `CreateStudentBillDto`: add `academic_year_id?: string | null` (sits beside the
  existing `applies_year_of_study` / `hostel_year_id`). `UpdateStudentBillDto`
  inherits it via `Partial<>`.
- `StudentBillFilters` already has `academic_year_id` — its semantics change from
  "student's current year" to "bill's year".

### 5.3 Service (`lib/services/billing/schedule/student-bill-service.ts`)
- `createStudentBill`: spreads `billData` already; normalize `'' → null` for
  `academic_year_id`. Recurring copies inherit the value.
- `getStudentBills`:
  - Add `academic_year_id` + `academic_year:academic_years(id, academic_year_name)`
    to both the `!inner` and plain selects, and to the transform.
  - **Switch the `academic_year_id` filter** from `.eq('student.academic_year_id', …)`
    to the bill's own top-level `.eq('academic_year_id', …)` — it no longer needs
    the `!inner` student join. Keep degree/department/program/semester/section/
    accommodation filters on the student join.
  - Add an "Unspecified" path (`.is('academic_year_id', null)`) for filtering
    untagged bills.
- `getStudentBill`, `getStudentBillsByStudent`, and the bill select inside
  `getStudentBillingSummary`: include the `academic_year` relation.

### 5.4 Create / Edit form (`app/(routes)/billing/schedule/_components/student-bill-form.tsx`)
- Add `academic_year_id` to the Zod schema (required, `min(1)`).
- Render a required **Academic Year** `<Select>` in the "Bill Information" card,
  fed by `useAcademicYears(watch('institution_id'))`, defaulting to the selected
  student's `academic_year_id` (`preSelectedStudent` / `completeStudentData` /
  `bill`).
- `buildBillDto` sets `academic_year_id` (normalized to `undefined` when empty).
- Covers both create and the edit page (which reuses this form).

### 5.5 Bulk create (`app/(routes)/billing/schedule/bulk-create/page.tsx`)
- Add a required **Academic Year** select in Step 1, fed by
  `useAcademicYears(institution_id)`, defaulting to the most recent active year
  (the first entry, since the hook orders by `academic_year_name` descending and
  filters `is_active`). The user can change it; leave it unset until an
  institution is picked.
- One year applies to the whole batch. Add `academic_year_id` to the
  whitelist destructure before insert (the page already whitelists fields to
  avoid PGRST204).

### 5.6 Excel import (template route + import API under `app/api/billing/schedule/bills/`)
- Add an **optional** "Academic Year" column to the generated template.
- On import, resolve the academic-year *name* → `id` scoped to the row's
  institution; blank → `NULL`. Optional so existing filled templates don't break;
  document it as recommended.

### 5.7 Student detail bills table (`.../students/[id]/_components/student-bills-table.tsx`)
- Group `bills` by `academic_year.academic_year_name` (null → "Unspecified") into
  collapsible sections. Each section header shows Total / Paid / Outstanding
  subtotals + an aggregate PAID / PARTIAL / UNPAID badge.
- Preserve existing row rendering, multi-select, bulk action bar, and row actions
  inside each group. Sort groups by academic year descending; "Unspecified" last.

### 5.8 List column + filter
- `.../_components/columns.tsx`: add an "Academic Year" column
  (`bill.academic_year?.academic_year_name ?? 'Unspecified'`).
- `.../_components/advanced-billing-schedule-filters.tsx` (and the simple
  filters): wire the academic-year dropdown to the bill column via
  `useAcademicYears`. Coordinate with the in-progress accommodation-type diff in
  these files — layer, don't overwrite.

### 5.9 Single bill view (`.../billing/schedule/[id]/page.tsx`)
- Display the bill's academic year alongside its other fields.

## 6. Scope boundaries (YAGNI)
- No ordinal "Year 1/2/3/4" label — the academic-year name is the identifier
  (derivable later from admission year if ever needed).
- No changes to `mv_student_billing_summary` or the billing dashboard aggregates.
- No retroactive backfill.
- **Documented limitation:** a *yearly-recurring* bill copies the same
  `academic_year_id` to all generated copies. The intended multi-year path is
  bulk-create or manual per-year bills; per-copy year increment is a future
  enhancement.

## 7. Gotchas to respect
- Nullable UUID: normalize `'' → null` before insert (`22P02`).
- Never pass `undefined` into `.eq()` (sends literal `"undefined"`); guard filter
  application.
- Supabase mutations: always destructure and check `{ error }`.
- `useAuth()` here returns only `{ profile, isLoading, error }`; use
  `usePermissions().can()` / `isSuperAdmin` for any gating (existing pages already
  do this).
- The academic-year `<Select>` is institution-scoped; the FK will always match the
  bill's institution because the dropdown is filtered by the same institution.

## 8. Verification
- `mcp__ide__getDiagnostics` on every touched file (strict mode off — no full
  `tsc`).
- Manual, as a **non-super-admin billing role** (silent RLS/empty-state class):
  1. For a year-1 BDS student, create a bill and set Academic Year = next year →
     bill is tagged that future year.
  2. Detail page shows two year groups with independent Total/Paid/Outstanding and
     correct aggregate badges.
  3. List filter by a year returns only that year's bills; "Unspecified" returns
     untagged legacy bills.
  4. Pay one year's bills → only that group flips to PAID; other year unchanged.
  5. Bulk-create a bill for a cohort with a chosen year → all created bills carry
     it.
