# Hostel Residents — Current-Year Billing Status (Learners tab) — Design

**Date:** 2026-06-06
**Status:** Approved (design); pending implementation plan
**Area:** Campus Living → Hostel Residents → **Learners tab** (`/campus-living/residents?tab=learners`)
**Author:** Boobalan (with Claude)
**Builds on:** `2026-06-06-academic-year-aware-billing-design.md` (the `billing_student_bills.academic_year_id` column).

## 1. Problem

The Hostel Residents → Learners tab lists hosteler students (`v_learner_hostelites`) with academic/allocation columns but **no billing information**. Operators need, per student, for the student's **current academic year**:
- whether any bill has been generated yet ("first bill created or not"), and
- the payment status (paid / partial / unpaid) with amounts.

This must be fetched from the billing module and shown inline in the Learners table.

## 2. Decisions (confirmed)

| Decision | Choice |
|---|---|
| **Table** | Learners tab (`v_learner_hostelites`), not Non-learners. |
| **Anchor & scope** | Each student's **current academic year** (`academic_year_id`); count **all** their bills tagged that year (tuition + hostel + anything). |
| **Hostel bills** | **Stamp `academic_year_id` on hostel-generated bills** so they're included (extend the generation RPC). |
| **Display** | Status badges **plus** amounts (Billed / Paid / Outstanding). |

## 3. Current-state facts (verified 2026-06-06)

- Two distinct year systems: `academic_years` (per-institution; the learner's academic year; mirrored on `v_learner_hostelites.academic_year_id`) and `hostel_years` (**global**, `is_current`/`is_active`; hostel bills are keyed by `hostel_year_id`).
- `billing_student_bills.academic_year_id` exists (nullable FK; prior feature). **Hostel-generated bills do NOT set it.** Academic/tuition bills do (manual/bulk/import).
- **Zero hostel bills exist** today (all 5,774 bills are `fee_source='academic'`, none with `hostel_year_id`). So nothing to backfill.
- `v_learner_hostelites` already exposes `id` (= student_id), `institution_id`, and `academic_year_id` per row — the anchor data is present.
- Learners tab data flow: `LearnersTab` → `DataTable` (`fetchDataFn`, server-paginated) → `LearnerHosteliteService.listHostelites(institutionId, filters, page, pageSize)`. Columns from `getLearnerColumns`. `enableRowSelection: false`.
- `campus_living_generate_hostel_year_bills(p_hostel_year_id, p_learner_ids, p_dry_run)` is SECURITY DEFINER, gated on `campus_living.fees.config`. It loads `lp learners_profiles%ROWTYPE` and has **two** `INSERT INTO billing_student_bills` statements (academic items; hostel/mess items). Neither sets `academic_year_id`.
- Campus-living operators (wardens) likely lack `billing.schedule.view`, so a direct client `SELECT` on `billing_student_bills` would be RLS-denied → must use a SECURITY DEFINER aggregate RPC.

## 4. Approach

Add two columns to the Learners tab showing each hosteler's current-academic-year billing rollup, computed by a new SECURITY DEFINER aggregate RPC batched over each page of students. Extend the hostel-generation RPC so hostel bills carry `academic_year_id` and appear in the rollup.

### Rejected alternatives
- **Direct client query on `billing_student_bills`** — RLS denies wardens; silent empty results.
- **Bake aggregates into `v_learner_hostelites`** — couples the view to billing and recomputes for every row on every list; heavier and harder to scope.

## 5. Components

### 5.1 Extend `campus_living_generate_hostel_year_bills` (migration, `CREATE OR REPLACE`)
Add `academic_year_id` to **both** `INSERT INTO billing_student_bills (...)` column lists, value `lp.academic_year_id` (already in scope; no new lookup). Keep everything else identical (permission gate, dedup `EXISTS` checks, `ON CONFLICT DO NOTHING`, dry-run behavior). Mirror to `supabase/setup/02_functions.sql`; commit the real body to `supabase/migrations/`.

### 5.2 New RPC `campus_living_get_hostelite_bill_status(p_student_ids uuid[])` (migration, SECURITY DEFINER, `search_path=public`)
- **Gate:** `IF NOT public.user_has_permission('campus_living.residents.view') THEN RAISE EXCEPTION ... 42501`. (Verify the key exists in `lib/constants/permissions.ts` and is held by the residents-page roles during implementation; if absent, this is the same key the page's `PermissionGuard`/access uses.)
- **Scope:** restrict to students whose `institution_id` is in `public._user_accessible_institutions()` (mirror RLS; prevents cross-institution leakage through the definer).
- **Body:** for each student in `p_student_ids`, resolve `academic_year_id` from `learners_profiles`; aggregate `billing_student_bills` where `student_id = X AND academic_year_id = <that year> AND status NOT IN ('cancelled','superseded')`.
- **Returns** `TABLE(student_id uuid, academic_year_id uuid, academic_year_name text, bill_count int, total_billed numeric, total_paid numeric, total_outstanding numeric, payment_status text)` where:
  - `total_billed = Σ final_amount`, `total_outstanding = Σ balance_amount`, `total_paid = total_billed − total_outstanding`.
  - `payment_status`: `bill_count = 0` → `'none'`; `total_outstanding <= 0` → `'paid'`; `total_paid > 0` → `'partial'`; else `'unpaid'`.
  - Students with NULL `academic_year_id` → returned with `bill_count = 0`, `payment_status = 'none'` (cannot anchor).
- **Grant** EXECUTE to `authenticated`. Mirror to `supabase/setup/02_functions.sql`.

### 5.3 Service `LearnerHosteliteService.getBillStatusForStudents(studentIds: string[])` (`lib/services/campus-living/learner-hostelite-service.ts`)
Calls the RPC via `supabase.rpc(...)`; returns `Map<string, HosteliteBillStatus>` keyed by `student_id`. Empty input → empty map (skip the call). Errors logged via `logger`, non-fatal (return empty map so the table still renders without the billing columns populated).

### 5.4 Wire into `LearnersTab.fetchData` (`learners-tab.tsx`)
After `listHostelites` returns `{data, count}`, collect `data.map(d => d.id)`, call `getBillStatusForStudents(ids)`, and merge each status onto its row: `{ ...row, bill_status: map.get(row.id) }`. Return the merged rows. One extra round-trip per page.

### 5.5 Types (`types/campus-living.ts`)
```ts
export interface HosteliteBillStatus {
  bill_count: number;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  payment_status: 'none' | 'paid' | 'partial' | 'unpaid';
  academic_year_name: string | null;
}
```
Add `bill_status?: HosteliteBillStatus` to `LearnerHostelite`.

### 5.6 Columns (`learners-columns.tsx`) — two new columns, inserted before `actionsCol`
- **Current-Year Bills**: `bill_status.bill_count > 0` → green badge `Generated (N)`, else grey `Not generated`; subtext = `Billed ₹{total_billed}`. If `bill_status` undefined → `—`.
- **Payment**: badge by `payment_status` — `paid` green / `partial` amber / `unpaid` orange / `none` grey `—`; subtext = `Paid ₹{total_paid} · Out ₹{total_outstanding}`. Optional tooltip = `academic_year_name`.

Both `enableSorting: false` in v1.

## 6. Scope boundaries (YAGNI)
- Display only — no filtering or sorting on the new columns in v1.
- No backfill (no hostel bills exist; academic bills already tagged).
- No caching beyond React Query's existing per-page cache.
- A hostel bill generated for a non-current hostel year is stamped with the student's *current* academic year (pragmatic; documented simplification).

## 7. Gotchas to respect
- SECURITY DEFINER must scope to `_user_accessible_institutions()` and gate on a catalog permission key (not a bare `module.view` that no role holds).
- `supabase.rpc` errors are plain objects — check `{ error }`; keep the billing fetch non-fatal so the table still lists residents.
- Don't pass `undefined`/empty array oddly into the RPC — skip the call when there are no student ids.
- Keep the generation RPC's dedup/`ON CONFLICT` logic untouched; only add the one column to each INSERT.

## 8. Verification
- `mcp__ide__getDiagnostics` on touched TS files (strict off; no full `tsc`).
- SQL: `apply_migration` both RPCs; call `campus_living_get_hostelite_bill_status` with a few real hosteler IDs and confirm sane aggregates; dry-run `campus_living_generate_hostel_year_bills` and confirm the proposed inserts would include `academic_year_id`.
- Manual, as a non-super-admin warden role: Learners tab columns populate; a student with academic bills shows Generated + correct Paid/Outstanding; after generating a hostel bill, it appears in the rollup; a student with no academic year shows `—`.
