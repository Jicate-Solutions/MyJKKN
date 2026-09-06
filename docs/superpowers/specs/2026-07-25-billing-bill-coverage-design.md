# Bill Coverage — design

**Date:** 2026-07-25
**Module:** Billing Management → Bill Coverage (`/billing/coverage`)
**Audience:** Super Administrators, Chief Accountant, Accountant Assistant

## Problem

There is no way to answer "which learners have **not** had a bill generated for an
academic year". Every existing billing screen queries bills that exist; this
question is the inverse — an anti-join between the learners who *should* be
billed and the bills that do exist. Accountants currently discover a missing
bill only when a learner complains or a collection target is missed.

## Findings from the live database (2026-07-25)

Numbers below are the state at design time and motivate the phases; they are
not assertions about the state after implementation.

### The academic-year stamp is missing on most academic bills

| fee_source | bills | `academic_year_id IS NULL` | % |
|---|---|---|---|
| academic | 8,503 | 4,971 | 58.5% |
| ad_hoc | 2,018 | 0 | 0% |
| hostel_category | 196 | 0 | 0% |

Not legacy — ongoing. Unstamped bills by creation month: May 4,008 → Jun 681 →
Jul 282. The write paths never set the column:

- `lib/services/billing/schedule/student-bill-service.ts:42` —
  `academic_year_id: billData.academic_year_id || null`
- `lib/services/billing/onboarding/onboarding-service.ts` — never sets it
- `app/api/billing/schedule/bills/import/route.ts` — inserts bills

`student-bill-service.ts:675` already carries an `'unspecified'` filter branch
as a workaround for the resulting nulls.

### Consequence: a naive report double-bills learners

For AY 2026-2027 there are 3,116 active learners; 1,218 have some bill, but only
572 have a bill stamped `2026-2027`. A straightforward "no bill for this AY"
query returns 2,544 learners, **of which at least 646 already have bills**. The
failure mode is an accountant regenerating an existing bill.

**Post-implementation correction (measured 2026-07-25 after the backfill ran).**
Of those 646, only **279** were true false positives — bills that existed but
carried no academic year. The other **367** have bills stamped with a *prior*
year (366 with 2025-2026, plus older) and no bill for 2026-2027, which is a
genuine gap, not noise. Verified: zero of the 367 still carry a NULL year.

So the backfill's job was narrower than first estimated, and the flagged
population is correspondingly more real. In the 2026-2027 active cohort,
learners with a bill stamped for their own year went 572 → 851 (+279), and the
flagged count went 2,544 → 2,265. The residual 367 should be read as
"billed last year, not billed this year" — the highest-value rows on the screen.

Across the full agreed scope the pre-backfill projection was:

| Lifecycle | In scope | Flagged before backfill | Flagged after backfill |
|---|---|---|---|
| active | 3,073 | 1,878 | 1,599 |
| reserved | 849 | 648 | 13 |
| admitted | 98 | 91 | 3 |
| account | 69 | 59 | 17 |
| **Total** | **4,089** | **2,676** | **1,632** |

### Three institutions have never billed at all

| Institution | Active learners | Billed |
|---|---|---|
| JKKN Matric Higher Secondary School | 552 | 0 |
| JKKN College of Arts and Science (Aided) | 326 | 0 |
| Nattraja Vidhyalya CBSE | 227 | 0 |

1,105 learners — 47% of the raw gap — are not "missed", they are not on MyJKKN
billing. Mixing them into the list buries the real gaps (Engineering 361,
Pharmacy 252, Allied Health 185, Dental 154, Nursing 148, Arts & Science Self 125).

### There is no stored "expected bills" model

`admission_fee_structures` cannot serve as one: 235 structures covering only 8 of
14 institutions, keyed on `admission_year_id` rather than academic year, and
requiring `degree_id`/`department_id`/`programme_id`/`quota_id` to all be set.
Separately, `fees_confirmed = false`, `legacy_fee_mode = true` and `fee_items`
empty for **all 4,178** active learners — the onboarding fee-confirmation path is
dormant.

Therefore expectation is **cardinality-based** ("an in-scope learner should have
at least one live bill for the year"), with an optional billing-category filter
supplying per-fee-head gaps without an expectation model.

## Decisions

| Decision | Choice |
|---|---|
| Unstamped bills | Backfill existing rows **and** fix the write path |
| Non-billing institutions | Auto-detect and exclude, with an "include" toggle |
| Learner scope | `active`, `reserved`, `admitted`, `account` |
| "Year" | The learner's `academic_year_id` (year of study), matched against the bill's `academic_year_id` |
| Cancelled/superseded bills | Do **not** count as coverage — such a learner is a gap |
| Access | Permission key, never a role-name check |

## Architecture

Standard four-layer path: page → hook → service → RPC. The anti-join runs in
Postgres because a client-side diff over 6,961 learners × 10,717 bills would hit
the PostgREST 1,000-row cap and the `57014` statement timeout this repo has
already seen on unfiltered billing lists.

### Phase 0 — Data correctness (prerequisite)

**Migration A — backfill.** Set `billing_student_bills.academic_year_id` from
`learners_profiles.academic_year_id` where it is NULL, only when the academic
year's `institution_id` matches the bill's `institution_id`.

- 4,905 rows stamped
- 55 skipped — learner has no academic year
- 11 skipped — learner's academic year belongs to a different institution

The two skip sets are reported (not guessed) so they can be resolved by hand.

**Migration B — safety net.** `BEFORE INSERT` trigger on
`billing_student_bills` filling `academic_year_id` from the learner's profile
**only when NULL**. Three insert paths exist and the bug leaked through all of
them for three months; a trigger holds regardless of which path inserts,
including paths written later. An explicitly supplied year — e.g. an arrear bill
for a past year — is never overwritten.

**Application fix.** `onboarding-service.ts` sets `academic_year_id` explicitly
so the intent is readable in code, not only in the schema.

### Phase 1 — RPCs

Two `SECURITY DEFINER` functions following the established billing-analytics
pattern (`supabase/setup/02_functions.sql:12789`):

```sql
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
...
IF NOT public.user_has_permission('billing.coverage.view') THEN
  RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
END IF;
SELECT array_agg(institution_id) INTO v_inst
FROM public.get_user_accessible_institutions(auth.uid())
WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
```

The self-authorisation is mandatory: `SECURITY DEFINER` bypasses RLS and is
callable by any authenticated user. Institution scope comes from
`get_user_accessible_institutions(auth.uid())`, never from an `isSuperAdmin`
branch.

**`fn_billing_coverage_summary`** — counts for the KPI cards: in scope, generated,
not generated, and excluded-institution count.

**`fn_billing_coverage_learners`** — paginated learner rows plus a total count.

Shared parameters:

| Parameter | Meaning |
|---|---|
| `p_academic_year_id` | Target year; NULL means each learner's own current year |
| `p_institution_ids` | Institution filter, intersected with accessible institutions |
| `p_lifecycle_statuses` | Defaults to `active,reserved,admitted,account` |
| `p_billing_category_id` | When set, coverage means "a live bill in this category" |
| `p_coverage_state` | `all` / `generated` / `not_generated` |
| `p_include_non_billing_institutions` | Default false |
| `p_search`, `p_sort`, `p_page`, `p_page_size` | Table controls |

A bill counts as coverage when its status is **not** `cancelled` and not
`superseded`.

A non-billing institution is one with **zero bills of any kind, in any year** —
computed, not configured, so an institution appears automatically on the day it
starts billing. The test is deliberately *all-time*, not "zero bills for the
selected year". An institution that billed last year and has generated nothing
this year is the single most important case the report exists to catch; scoping
the exclusion to the selected year would hide it. JKKN College of Education is
exactly this shape today — 22 bills all-time, 0 stamped for 2026-2027 — and must
appear as a gap, not be filtered away.

### Phase 2 — Application layers

- `lib/services/billing/coverage/bill-coverage-service.ts` — static class
  extending `BaseService`, calling both RPCs via `executeDashboardRPC`
  (`lib/services/base-service.ts:251`)
- `hooks/billing/use-bill-coverage.ts` — React Query hooks following the
  sibling pattern in `hooks/billing/use-billing-analytics.ts`
- `types/billing-coverage.ts` — row, filter and summary types
- `app/(routes)/billing/coverage/page.tsx` — wrapped in
  `<PermissionGuard module='billing.coverage' action='view'>`
- `_components/` — summary cards, filter bar, DataTable, Excel export of the gap
  list

Institution scope is passed as accessible-institution IDs; no `isSuperAdmin`
branch decides scope.

### Phase 3 — Access control

Four layers move together:

1. `lib/constants/permissions.ts` — add `billing.coverage.view` and
   `billing.coverage.export` to the `Billing Management` category (after
   `billing.onboarding.approve`, line 663)
2. `lib/sidebarMenuLink.ts` `MENU_PERMISSIONS` — `'/billing/coverage':
   'billing.coverage.view'` (near line 662)
3. `lib/sidebarMenuLink.ts` sidebar tree — submenu entry after
   *Schedule · Student Search* (line 2436)
4. Migration granting both keys to **Chief Accountant** and **Accountant
   Assistant** via `permissions || jsonb_build_object(...)`

Super Administrator needs no grant — it bypasses through `isSuperAdmin`. A
permission key declared in `permissions.ts` but not granted to any role renders
an empty page, so the grant migration is not optional.

## Error handling

- RPC permission failure raises `42501`; the service surfaces it via
  `getErrorMessage()` and the page shows an unauthorised state rather than an
  empty table — an empty table would read as "no gaps", the opposite of the truth
- Every Supabase call destructures and checks `{ error }`; Supabase errors are
  plain objects, so `instanceof Error` is not used
- Server-side calls wrap in `withRetry()` for transient `ECONNRESET`
- A learner with no `academic_year_id` cannot be evaluated and is reported in a
  distinct "cannot evaluate" count rather than silently counted as a gap

## Verification

There is no test runner in this repo. "Done" means:

1. Touched files pass `mcp__ide__getDiagnostics`
2. `npm run check:audit-coverage` and `npm run check:menus` pass
3. Post-backfill SQL confirms 4,905 rows stamped and the 66 skipped rows listed
4. For AY 2026-2027 with the agreed scope and non-billing institutions excluded,
   the page reports ~1,632 learners
5. Spot-check: none of the 646 learners who trip the naive query appear as "not
   generated"
6. Exercised in the browser as a **Chief Accountant**, not only as super-admin —
   confirming both that data renders and that the nav entry appears
7. A role without the key sees neither the page nor the nav entry
8. JKKN College of Education (22 bills all-time, 0 for 2026-2027) is **present**
   in the default 2026-2027 view — proving the exclusion is all-time and does not
   hide an institution that stopped billing

## Out of scope

- Generating the missing bills from this screen (report only; generation stays in
  the existing bulk-create flow)
- Reconciling bill *amounts* against fee structures
- Backfilling `admission_year_id` on learners
- Resolving the 66 rows the backfill deliberately skips
