# Institution-wise missing-fields analytics for learner profiles

**Date:** 2026-07-30
**Status:** Approved (design)
**Area:** `/learners/analytics` → Profile Completion tab
**Branch:** `feat/profile-completion-advanced-table`

## 1. Goal

On the Learners Analytics → Profile tab, let an administrator answer
**"which institution is missing which learner-profile fields, and who exactly?"**
across the full set of learner profile fields — not just the four that currently
define completeness.

Two deliverables:

1. An **institution × field missing matrix** (aggregate, clickable).
2. A **multi-field "Missing Field" filter** on the existing drill-down table,
   covering every field in the catalogue, with any/all matching.

## 2. Current flow

```
app/(routes)/learners/analytics/page.tsx          (client, 9 tabs, URL ?tab=)
  filters: LearnerDashboardFilters                (institutionIds + org + date + gender)
    ├─ GET /api/learners/analytics/stats
    │    └─ LearnerProfileService.getDashboardStats()        [service:1562]
    │         ├─ 1 count query   → totalCount   (all filters applied)
    │         └─ 6 head-count queries → profileCompletion:
    │              completeProfiles · incompleteProfiles     (stored flag)
    │              missingCollegeEmail · missingAcademicYear
    │              missingSemester · missingSection
    └─ <ProfileCompletionTab data={stats} filters={filters}>
         ├─ 4 KPI cards                    ← stored is_profile_complete flag
         ├─ Completion Tiers pie           ← getProfileCompletionTiers RPC
         ├─ "Missing Fields Breakdown" bar ← 4 hardcoded fields
         ├─ Completion Funnel              ← same 4, markup copy-pasted 4×
         ├─ Recommendations                ← 2 of the 4
         └─ <IncompleteProfilesTable>      ← added 2026-07-30 (dc67be582)
              ├─ IncompleteProfilesFilters (9 filters, client-side org cascade)
              ├─ GET /api/learners/analytics/incomplete-profiles          (paged rows)
              └─ GET /api/learners/analytics/incomplete-profiles/options   (year lists)
```

Other consumers of the same four `missing*` counts: `overview-tab.tsx:454-472`
and `export-dashboard-dialog.tsx:269-272`.

## 3. Findings (measured, not assumed)

Measurements taken 2026-07-30 against production, 7,159 learner profiles,
13 institution buckets (12 institutions + 1 profile with `institution_id IS NULL`).

### 3.1 Two definitions of "complete" already coexist

| definition | where | fields |
|---|---|---|
| Admin assignment | `incomplete-profiles/route.ts:32` | 4: `college_email`, `academic_year_id`, `semester_id`, `section_id` |
| Learner data | `lib/utils/profile-completion.ts:28` | 28 across 4 sections — 24 unconditional + 4 conditional |

The tab's KPI cards count the stored `is_profile_complete` flag; the drill-down
table derives from the 4 fields. They disagree by design and the card copy says so.
See memory `learner-profile-complete-flag-drift` (479 / 220 rows disagree both ways).

### 3.2 Missing ≠ NULL — the blocker for extending past 4 fields

Most learner-data columns are declared `NOT NULL`, so absence is stored as the
**empty string**. Absence is encoded three different ways in one table:

| column | NULL | `''` | what `.is(col, null)` reports |
|---|---|---|---|
| `student_email` | 0 | 2,166 | **0 missing** — wrong |
| `last_school` | 0 | 1,322 | **0 missing** — wrong |
| `roll_number` | 1,484 | 536 | 1,484 of 2,020 — wrong |
| `permanent_address_taluk` | 74 | 549 | 74 of 623 — wrong |
| `college_email` | 1,058 | 0 | 1,058 — correct by luck |

`applyIdFilter()` in `incomplete-profiles/route.ts:68` and the
`PROFILE_FIELD_MISSING → IS NULL` sentinel are therefore correct only for uuid
FK columns and, coincidentally, `college_email`.

Placeholder sentinels (`'N/A'`, `'-'`, `'nil'`, …) total **1 row** across the
candidate columns — no placeholder blocklist is needed.

### 3.3 Conditional fields must be conditional in SQL

| field | naive `IS NULL` | correct (applicable population only) |
|---|---|---|
| `hostel_category_id` | 6,350 | **183** of 989 hostel learners |
| `transport_route_id` | 5,904 | **47** of 1,289 bus-requiring day scholars |

A 35× error. Each field needs an `appliesWhen` predicate, and its percentage
denominator must be the **applicable** population, not the institution total.

### 3.4 RLS makes the query count decisive

From memory `rsc-tab-and-exact-count-amplification` (measured on this table,
7,158 rows / 28 MB): `count(*)` bypassing RLS **2.5 ms**; the same count under
RLS as a real principal **164 ms** (52 seq scans, 34 on `profiles`).
`authenticated` has `statement_timeout = 8s`.

- One `GROUP BY institution_id` with 33 `COUNT(*) FILTER (...)` aggregates:
  **22 ms as superuser** (seq scan, 2,263 shared buffer hits) → ~165 ms under RLS.
- The same matrix as separate counts: 33 fields × 13 institutions = **429 RLS
  scans ≈ 70 s** → guaranteed 57014.

The aggregate must be **one** scan. This is the load-bearing constraint.

### 3.5 RLS on `learners_profiles` is aggregate-safe

`learners_profiles_select_policy` wraps `is_super_admin()` and each
`user_has_permission(...)` in a scalar subquery and tests
`institution_id = ANY (<array computed once>)`. No per-row `SECURITY DEFINER`
call — so this is **not** the courses-timeout class
(`courses-rls-timeout-57014`). A `SECURITY INVOKER` function inherits
institution confinement for free.

All 7 existing `get_learners_*` RPCs are `prosecdef = false` (SECURITY INVOKER)
and share one 12-parameter `filter_*` signature.

### 3.6 Institution-wise variance justifies the feature

| institution | learners | no college email | no student email | no 10th marks | no photo |
|---|---|---|---|---|---|
| Arts & Science (Self) | 1,747 | 136 | 490 | 408 | 582 |
| Engineering & Technology | 1,443 | 316 | 197 | 238 | 1,178 |
| Pharmacy | 1,045 | 259 | 142 | 182 | 798 |
| Dental | 660 | 68 | 38 | 151 | 329 |
| Arts & Science (Aided) | 553 | **9** | **352** | **524** | 179 |
| Matric Hr. Sec. School | 552 | **0** | **552** | **552** | **552** |
| College of Education | 34 | **34** | 5 | 11 | 34 |

Aided College is near-perfect on college email yet 95% missing 10th marks — a
pattern invisible in today's 4-field, all-institution bar chart.

### 3.7 Pre-existing bug: the tab ignores the dashboard filter panel

`getDashboardStats` applies **only `institutionIds`** to all six
profile-completion count queries (`service:1728-1775`). The academic-year,
degree, department, program, semester, section, date-range and gender filters are
silently dropped. Affects the Profile tab, the Overview tab and the dashboard
export. Additionally `missingCollegeEmail` uses
`.or('college_email.is.null,college_email.eq.')` (blank-aware) while the other
three use bare `.is(...)` — three inconsistent notions of "missing" across two
files.

### 3.8 One profile has `institution_id IS NULL`

It must land in an explicit `(unassigned)` bucket or it silently disappears from
any institution-grouped view.

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Field catalogue = **33 fields** in 5 groups: the 28 form-required fields from `lib/utils/profile-completion.ts` (24 unconditional + 4 conditional, already labelled and grouped) + the 5 admin assignment fields | Every field has a real label, a real owner and a form that collects it, so "missing" is actionable |
| D2 | Deliverables: institution × field matrix; all-fields Missing Field filter; data-driven bar chart + funnel; full-catalogue row badges and export | All four confirmed |
| D3 | Missing Field is **multi-select** with an **any / all** toggle | "any" is the natural reading of today's "Any missing field"; "all" finds worst-offender rows. Both are one predicate, identical cost |
| D4 | **Completeness definition does not change.** Complete/incomplete keeps its 4-field meaning; KPI cards keep counting the stored flag. The 33 fields are report-and-filter dimensions only | Widening it would reclassify thousands of rows and move every number on the tab and on `/learners/profiles` at once |
| D5 | Aggregate comes from **one `SECURITY INVOKER` RPC** | §3.4 — 1 scan vs 429; §3.5 — confinement inherited, not re-implemented |
| D6 | RPC returns **long format** `(institution, field_key, applicable, missing)` | Adding a field is one catalogue entry and zero downstream type changes; the UI can pivot by institution, field or group from one ~430-row payload |
| D7 | Fix §3.7 **at the source** rather than obsoleting it | Overview tab and the dashboard export read the same four counts |

### Rejected alternatives

- **Per-field PostgREST count queries from the API route** — 429 RLS scans, ~70 s,
  certain statement timeout.
- **Materialized view or a generated completeness column** — staleness on every
  profile edit, and it couples a read-only report to the write path.
- **Wide RPC (one column per field)** — the SQL signature and every TypeScript
  type would change each time a field is added.

## 5. Design

### 5.1 Field catalogue — single source of truth

New file `lib/constants/learner-profile-fields.ts`:

```ts
export type ProfileFieldGroup =
  | 'admin_assignment' | 'basic_details' | 'academic_information'
  | 'contact_details'  | 'accommodation';

export type BlankRule = 'text' | 'uuid' | 'marks';
export type AppliesWhen = 'always' | 'hostel' | 'day_scholar_with_bus';

export interface LearnerProfileFieldDef {
  key: string;                 // stable id, == DB column name
  column: string;              // learners_profiles column
  label: string;               // UI + export header
  group: ProfileFieldGroup;
  blankRule: BlankRule;
  appliesWhen: AppliesWhen;
  marksKeys?: string[];        // only for blankRule === 'marks'
}
```

**Blank rules** — three, because absence is encoded three ways (§3.2):

| rule | predicate |
|---|---|
| `text` | `col IS NULL OR btrim(col) = ''` |
| `uuid` | `col IS NULL` |
| `marks` | `col IS NULL OR col = '{}'::jsonb OR any listed key blank after btrim` |

`marks` uses the strict all-sub-fields rule, matching `isFieldComplete()` in
`lib/utils/profile-completion.ts:111`. Verified jsonb keys: `tenth_marks` has
`max_marks`, `obtained_marks`, `percentage`; `twelfth_marks` adds `group`.

**The 33 fields:**

| group | key (== column) | label | rule | applies |
|---|---|---|---|---|
| admin_assignment | `college_email` | College Email | text | always |
| admin_assignment | `academic_year_id` | Academic Year | uuid | always |
| admin_assignment | `admission_year_id` | Admission Year | uuid | always |
| admin_assignment | `semester_id` | Semester | uuid | always |
| admin_assignment | `section_id` | Section | uuid | always |
| basic_details | `roll_number` | Roll Number | text | always |
| basic_details | `register_number` | Register Number | text | always |
| basic_details | `first_name` | First Name | text | always |
| basic_details | `last_name` | Last Name | text | always |
| basic_details | `date_of_birth` | Date of Birth | text | always |
| basic_details | `gender` | Gender | text | always |
| basic_details | `religion` | Religion | text | always |
| basic_details | `community_category_id` | Community | uuid | always |
| basic_details | `caste_id` | Caste | uuid | always |
| basic_details | `father_name` | Father's Name | text | always |
| basic_details | `mother_name` | Mother's Name | text | always |
| basic_details | `blood_group` | Blood Group | text | always |
| academic_information | `last_school` | Last School | text | always |
| academic_information | `board_of_study` | Board of Study | text | always |
| academic_information | `tenth_marks` | 10th Marks | marks | always |
| academic_information | `twelfth_marks` | 12th Marks | marks | always |
| contact_details | `student_mobile` | Student Mobile | text | always |
| contact_details | `student_email` | Student Email | text | always |
| contact_details | `permanent_address_street` | Address Street | text | always |
| contact_details | `permanent_address_taluk` | Taluk | text | always |
| contact_details | `permanent_address_district` | District | text | always |
| contact_details | `permanent_address_pin_code` | PIN Code | text | always |
| contact_details | `permanent_address_state` | State | text | always |
| accommodation | `accommodation_type_id` | Accommodation Type | uuid | always |
| accommodation | `hostel_category_id` | Hostel Room Category | uuid | hostel |
| accommodation | `mess_category_id` | Mess Category | uuid | hostel |
| accommodation | `transport_route_id` | Route | uuid | day_scholar_with_bus |
| accommodation | `transport_stop_id` | Boarding Point | uuid | day_scholar_with_bus |

`first_name` is `NOT NULL` and currently 0% missing; it stays in the catalogue
for completeness and will read 0.

**`appliesWhen` resolution.** The DB column is `accommodation_type_id`
(FK → `accommodation_types.name` ∈ Day Scholar / Hostel / Not Applicable /
Paying Guest). Resolved in SQL by `upper(btrim(name))`:

- `hostel` → accommodation type name is `HOSTEL`
- `day_scholar_with_bus` → name is `DAY SCHOLAR` **and** `bus_required IS TRUE`

Out of scope, recorded here: `lib/utils/profile-completion.ts:79` compares
`learner.accommodation_type === 'HOSTEL'` against data whose values are
`'Hostel'` / `'Day Scholar'`. If that comparison is reached with the raw
name, the learner-side conditional fields never count. Not touched by this work.

### 5.2 Aggregate RPC

New migration `supabase/migrations/20260730_learners_missing_fields_by_institution.sql`:

```
get_learners_missing_fields_by_institution(
  filter_institution_ids uuid[], filter_academic_year_id uuid,
  filter_degree_id uuid, filter_department_id uuid, filter_program_id uuid,
  filter_semester_id uuid, filter_section_id uuid,
  filter_lifecycle_statuses text[], filter_gender text,
  filter_is_profile_complete boolean,
  filter_date_from timestamptz, filter_date_to timestamptz
) RETURNS TABLE (
  institution_id    uuid,      -- NULL → the (unassigned) bucket
  institution_name  text,
  learner_count     bigint,    -- learners in this institution, in scope
  field_key         text,      -- a catalogue key, or 'group:<group>'
  applicable_count  bigint,    -- learners for whom the field applies
  missing_count     bigint
)
LANGUAGE sql
SECURITY INVOKER
```

- Identical 12-parameter signature to its siblings, so
  `LearnerProfileService` passes the same object it already builds.
- One pass: `jsonb_build_object` of per-field `(applies, blank)` pairs,
  `cross join lateral jsonb_each`, `GROUP BY institution_id, field_key`.
- Emits **38 rows per institution**: 33 field rows plus 5 group rollups keyed
  `group:<group>`, where `missing_count` = learners with **≥1** applicable blank
  field in that group and `applicable_count` = `learner_count`.

  The rollups must be computed in SQL, in the same pass. They **cannot** be
  derived downstream by summing the group's field counts: a learner missing
  three fields in one group would be counted three times, so the sum can exceed
  `learner_count`. Every group contains at least one always-applicable field, so
  a group rollup's applicable population is always the full learner count.
- Rows are additive **across institutions** (each learner belongs to exactly one
  institution), so the matrix's Total row is a plain column-wise sum — for field
  rows and group rollups alike. They are *not* additive across fields.
- `SECURITY INVOKER` → RLS filters rows before aggregation (§3.5). No
  `role_has_institution_access` call written into the function.
- `LEFT JOIN institutions` so a NULL `institution_id` yields
  `institution_name = '(unassigned)'` (§3.8).
- The generated SQL is derived from the catalogue in §5.1. A test asserts the
  RPC's distinct `field_key` set equals the catalogue's keys, so the two cannot
  drift silently.

### 5.3 Matrix API route

New `app/api/learners/analytics/missing-fields-matrix/route.ts`:

- Auth + `profiles` lookup, then `institutionIds` defaulting to the caller's
  institution — same preamble as the two sibling routes.
- Accepts the same query params the stats route parses, calls the RPC once,
  returns `{ institutions: [...], fields: [...], generatedAt }`.
- `Cache-Control: no-store, max-age=0`, `export const dynamic = 'force-dynamic'`,
  `await connection()` — matching the sibling routes.
- A separate route (not folded into `/stats`) so it is fetched only when the
  Profile tab is actually mounted. Radix unmounts inactive `TabsContent`, and
  these tab components are client components receiving props, so no eager
  server-side fan-out is introduced (contrast the eager-RSC-tab pattern in
  memory `rsc-tab-and-exact-count-amplification`).

### 5.4 Row-level filter — extend the existing drill-down route

`app/api/learners/analytics/incomplete-profiles/route.ts`:

- `missingField` (single value) → `missingFields` (comma-separated list) plus
  `missingMatch = any | all` (default `any`). The old `missingField` param keeps
  working, so any existing link or bookmark still resolves.
- Allowlist becomes the catalogue's key set — an unknown key can never reach
  PostgREST as a column name.
- Predicate built from the catalogue's blank rules, as **one** `or=` param:
  - `any` → `.or(<every selected field's blank fragments, flattened>)`
  - `all` → `.or('and(or(<f1 fragments>),or(<f2 fragments>), …)')`
  Keeping it to a single param means the route still relies only on the
  two-`or=`-params-are-ANDed behaviour it already depends on (completion scope +
  search), rather than betting on a third. A smoke test pins this.
- `REQUIRED_FIELDS` (the 4 that define completeness) stays exactly as it is —
  the `completion` scope and `is_profile_complete` derivation are untouched (D4).
- Row `missingFields` / `missing_fields_label` are computed over the **full
  catalogue** with the correct blank rules, so the badges and the export list
  everything, while `is_profile_complete` on the row still reflects the 4.
- The `.select()` gains the extra columns the catalogue needs. Guard: a
  mistyped column name returns 42703 and PostgREST silently blanks the field
  (memory `postgrest-phantom-column-silent-degradation`) — the field-parity test
  in §5.2 plus one row-shape assertion covers this.

### 5.5 Service fix

`LearnerProfileService.getDashboardStats()`:

- Apply the **full** filter set to the profile-completion counts, not just
  `institutionIds` (§3.7). Extract one `applyCompletionFilters(query, filters)`
  used by every count so the blocks cannot drift again.
- Derive `missingCollegeEmail` / `missingAcademicYear` / `missingSemester` /
  `missingSection` by summing the relevant field rows of one RPC call across
  institutions. Keeps the four fields on `ProfileCompletionStats`, so
  `overview-tab.tsx` and `export-dashboard-dialog.tsx` need no change and start
  reporting filter-correct, blank-aware numbers.
- `completeProfiles` / `incompleteProfiles` stay flag-based (D4).
- Net inside `/stats`: **6 count scans → 2 count scans + 1 RPC scan**.
  The matrix route calls the same RPC independently, so the Profile tab costs one
  further scan — but only once the tab is actually opened, and it replaces four
  scans that ran on every dashboard load regardless of tab.

### 5.6 UI

**New `_components/missing-fields-matrix.tsx`**

- Rows: institutions in scope, plus a Total row. Sorted by learner count desc.
- A **Field group** selector: `All groups` renders the 5 `group:<group>` rollup
  columns; selecting a group renders one column per field in it.
- Cells: `missing_count` with `% of applicable_count` beneath, tinted by
  severity. Explicit thresholds, so the colour is reproducible:

  | share of applicable missing | tint |
  |---|---|
  | 0 | none (muted `—` for the count when 0) |
  | 1–19% | yellow |
  | 20–49% | amber |
  | ≥50% | red |

  Where `applicable_count = 0` the cell renders `—`, never `0%`.
- The table lives in an `overflow-x: auto` container; the page body must never
  scroll horizontally (memory `css-overflow-measure-not-guess`).
- Clicking a cell sets `{ institutionId, missingFields, missingMatch: 'any' }`
  on the drill-down filter state and scrolls to the table.

**`_components/incomplete-profiles-filters.tsx`**

- `missingField: X | ALL` → `missingFields: string[]` + `missingMatch`.
- Grouped, searchable multi-select over the catalogue, with per-group headers.
- any/all radio, disabled while fewer than 2 fields are selected.
- The existing `conflictsWithCompleteScope` guard generalises: under the
  `complete` scope, the four completeness-defining fields stay disabled;
  everything else remains selectable.
- `activeFilterCount` and the Clear Filters reset must handle an array value
  (today's `value[key] !== DEFAULT[key]` identity check would read a fresh empty
  array as "active").

**`_components/incomplete-profiles-table.tsx`**

- Filter state lifts to `ProfileCompletionTab` so the matrix can drive it.
- `exportSubtitle` lists the selected field labels and the match mode.

**`_components/incomplete-profiles-columns.tsx`**

- `MISSING_FIELD_COLORS` becomes a per-group colour map (33 per-label entries
  would be unmaintainable); an unmapped label falls back to a neutral badge.

**`_components/profile-completion-tab.tsx`**

- Renders `<MissingFieldsMatrix>` above the drill-down table and owns the shared
  filter state.
- "Missing Fields Breakdown" bar chart: driven by the RPC, the **10** fields with
  the highest share of applicable-missing for the current scope, descending.
  Group rollup rows are excluded so the chart compares like with like.
- Completion Funnel: one `.map()` over the catalogue's admin-assignment group,
  replacing four copy-pasted blocks.
- Recommendations: generated from the worst fields rather than 2 hardcoded ones.

### 5.7 Types and hooks

- `types/learner-dashboard.ts` — `MissingFieldsMatrixRow`,
  `MissingFieldsMatrixResponse`, `ProfileMissingMatch = 'any' | 'all'`;
  `IncompleteProfilesFilters.missingField` → `missingFields?: string[]` +
  `missingMatch?`. `ProfileMissingFieldFilter` and
  `PROFILE_MISSING_FIELD_LABELS` are superseded by the catalogue and removed
  once their last reference is gone.
- `hooks/use-learner-profiles.ts` — `buildIncompleteProfilesQuery` serialises
  the array + match mode; new `useMissingFieldsMatrix(filters)` keyed on the
  filter object, `staleTime` 5 min to match its siblings.

## 6. Error handling

- RPC failure → the matrix card renders an inline `Alert` with a Retry; the rest
  of the tab still renders. Follows the existing `safeQuery` posture in
  `getDashboardStats`, where one failed panel must not blank the dashboard.
- The service's derivation of the four `missing*` counts falls back to 0 on RPC
  error, exactly as `safeQuery` does today, so Overview never crashes.
- Unknown `missingFields` keys are dropped by the allowlist, not 400'd — a stale
  bookmark degrades to a wider result rather than an error page.
- `applicable_count = 0` renders `—`; no division by zero anywhere.

## 7. Verification

| # | check | expected |
|---|---|---|
| V1 | Migration applied via Supabase MCP; RPC exists, `prosecdef = false` | matches the 7 siblings |
| V2 | RPC `hostel_category_id` missing count | **183**, not 6,350 |
| V3 | RPC `transport_route_id` missing count | **47**, not 5,904 |
| V4 | RPC `student_email` missing count | **2,166** (today's filter reports 0) |
| V5 | RPC `roll_number` missing count | **2,020** (NULL 1,484 + `''` 536) |
| V6 | RPC `college_email` per institution | matches §3.6 row for row |
| V7 | `(unassigned)` bucket | present, 1 learner |
| V8 | `EXPLAIN ANALYZE` under a real principal via `scripts/persona-harness` | one seq scan; well under the 8 s `statement_timeout` |
| V9 | Field-parity test: RPC distinct `field_key` vs catalogue keys | 33 field keys equal the catalogue, plus exactly 5 `group:` keys |
| V9b | Group rollup sanity | for each group: `max(field counts) ≤ rollup ≤ min(sum(field counts), learner_count)` |
| V10 | PostgREST smoke test: any/all with 2+ fields | `any` ⊇ `all`; both respect the completion scope and search |
| V11 | Row-shape assertion on the widened `.select()` | no silently-blank field (42703 guard) |
| V12 | Non-super-admin principal sees only its own institution's matrix rows | RLS confinement holds |
| V13 | Dashboard filter panel (academic year / department / date) changes the tab's numbers | §3.7 fixed |
| V14 | Matrix cell click | drill-down table shows exactly that institution + field |
| V15 | 320px → desktop | no horizontal body scroll; matrix scrolls inside its own container |

## 8. Non-goals

- Changing what "complete" means, or the stored `is_profile_complete` flag and
  its one-directional auto-fix in `incomplete-profiles/route.ts:300`.
- Fixing the `accommodation_type` case mismatch in
  `lib/utils/profile-completion.ts` (recorded in §5.1).
- Bulk-editing or bulk-notifying learners from the matrix.
- The eager-RSC-tab fix still outstanding on `/learners/onboarding`,
  `/admission`, `/learners/alumni`.
- Reconciling the flag-vs-field drift documented in
  `learner-profile-complete-flag-drift`.

## 9. Risks

| risk | mitigation |
|---|---|
| Catalogue and generated SQL drift | V9 field-parity test |
| PostgREST nested `and(or(...))` behaves unexpectedly | V10 smoke test; single-`or=`-param design avoids a third repeated param |
| Widened `.select()` names a nonexistent column → silent blanks | V11; memory `postgrest-phantom-column-silent-degradation` |
| RPC slower than expected under RLS for a broad principal | V8 before merge; long format keeps the payload ~430 rows regardless |
| 33-column matrix overflows on mobile | group-level default view + V15 |
| The four `missing*` counts change value for existing consumers | intended (they are wrong today, §3.2/§3.7); called out in the PR description |

## 10. File-by-file change list

**New**
- `lib/constants/learner-profile-fields.ts`
- `supabase/migrations/20260730_learners_missing_fields_by_institution.sql`
- `app/api/learners/analytics/missing-fields-matrix/route.ts`
- `app/(routes)/learners/analytics/_components/missing-fields-matrix.tsx`

**Edited**
- `app/api/learners/analytics/incomplete-profiles/route.ts` — multi-field, blank rules, full-catalogue badges
- `app/(routes)/learners/analytics/_components/incomplete-profiles-filters.tsx` — grouped multi-select + any/all
- `app/(routes)/learners/analytics/_components/incomplete-profiles-table.tsx` — lifted filter state, export subtitle
- `app/(routes)/learners/analytics/_components/incomplete-profiles-columns.tsx` — per-group badge colours
- `app/(routes)/learners/analytics/_components/profile-completion-tab.tsx` — matrix card, data-driven chart + funnel + recommendations
- `lib/services/learner-profile-service.ts` — `applyCompletionFilters`, RPC-derived `missing*`
- `types/learner-dashboard.ts` — matrix types, filter type changes
- `hooks/use-learner-profiles.ts` — query serialisation, `useMissingFieldsMatrix`

## 11. Implementation order

Four batches, each independently verifiable, so a failure is isolated to one
layer rather than discovered at the end.

| batch | contents | gate |
|---|---|---|
| 1 | Catalogue, migration + RPC, types | V1–V9b — the numbers are right before any UI reads them |
| 2 | Matrix route + `MissingFieldsMatrix` card + hook | V12, V15 — renders and confines correctly |
| 3 | Drill-down multi-field filter (route + filter bar + columns + export) | V10, V11, V14 — the row list agrees with the matrix |
| 4 | Service fix, data-driven bar chart / funnel / recommendations | V13 — the tab responds to the dashboard filter panel |

Batch 1 is the only one that touches the database, and nothing renders from it
until batch 2 — so batch 1 can be applied and verified against production data
with zero user-visible change.
