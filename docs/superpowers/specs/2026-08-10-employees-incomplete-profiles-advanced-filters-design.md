# Employees Analytics — Advanced Filters for the Incomplete Profiles Table

**Date:** 2026-08-10
**Area:** `/staff/dashboard` → Profile Analytics → *Missing Fields* tab
**Status:** Approved, ready for implementation planning

---

## 1. Problem

The "Employees with Incomplete Profiles" table (`app/(routes)/staff/dashboard/_components/profile-analytics.tsx:505`) is the drill-down that turns the Profile Analytics charts into a work list. Today it offers exactly one control — a *Required fields only* switch — and inherits institution / department / category silently from the dashboard filter bar above it.

Three concrete defects follow from that:

1. **The one control it has can only ever return an empty table.** All seven "required" fields are 100% populated across the 866 production rows, so flipping the switch always renders *"All employees have complete required fields!"*. It reads as a bug.
2. **The list is capped at 50 rows against 541 incomplete employees.** There is no paging, search, or sort, so the other 491 are unreachable from this page.
3. **The dimensions people actually need to filter on are absent.** Biometric enrolment, designation, gender, joining date, and — most sharply — the 328 employees with no department at all.

### Production baseline (866 employees, queried 2026-08-10)

| Tracked field | Missing | Share |
|---|---:|---:|
| *All 7 required:* First Name, Last Name, Email, Phone, Designation, DOB, DOJ | **0** | 0% |
| Institution Email *(optional, but also fully populated)* | 0 | 0% |
| Profile Picture | 504 | 58% |
| Address | 232 | 27% |
| Pincode | 225 | 26% |
| Staff ID | 198 | 23% |
| State / District | 183 | 21% |
| Blood Group | 119 | 14% |
| **Employees incomplete on ≥1 of the 15 tracked fields** | **541** | **62%** |

Untracked but filterable:

| Column | Missing | Note |
|---|---:|---|
| `department_id` | 328 | not part of the completion definition |
| `biometric_id` / `biometric_institution_id` | 403 | 463 enrolled across 7 machines |

Single-valued columns (verified): `employment_type` = `full_time` for all 866; `role_type` = `teacher` for all 866. `status` is `draft` (527) / `published` (339) — a publishing state, distinct from `is_active` (752 active).

## 2. Goals

- Replace the 50-row capped table with the shared `DataTable`: server-side paging, search, sort, column visibility/resizing, and Excel/CSV/PDF export.
- Add a 15-control filter bar covering completion, organisation, employment, demographics, and biometric identity.
- Remove the wasted `{ count: 'exact' }` scan and the fetch-everything-then-slice pattern in the API route.

### Non-goals

- **Not** changing the profile-completion definition. Department and biometric fields become *filter* dimensions only. See §3.1.
- **Not** touching the three charts above the table, the dashboard-level filter bar, or `/staff/list`.
- **Not** adding a database migration.

## 3. Decisions

### 3.1 Department stays out of the completion definition (biometric SUPERSEDED — see 3.1a)

Three files are under an explicit lock-step contract, documented at `lib/utils/staff-profile-completion.ts:9-14`:

- `lib/services/staff/staff-service.ts` (~1206, ~1705) — the dashboard aggregate rate and breakdown
- `lib/utils/staff-profile-completion.ts` — the per-employee progress bar
- `app/api/staff/incomplete-profiles/route.ts` — this drill-down table

Adding Department (328 missing) or Biometric (403 missing) to the tracked set would drop the headline completion percentage and require all three to change together. **Original decision: they get a `Not set (missing)` option in the filter bar instead.** You can find those 328 employees; no chart moves.

### 3.1a SUPERSEDED for biometric (2026-08-10, user decision)

After Task 10 the user asked for the biometric fields to be **counted**, not merely filterable. Department was explicitly left out, so 3.1 still holds for it.

`biometric_id` ("Biometric Code") and `biometric_institution_id` ("Biometric Machine") joined the OPTIONAL group: **15 tracked fields become 17** (required stays 7, optional 8 -> 10).

Verified production impact:

| | before | after |
|---|---:|---:|
| completion rate | 87.34% | **83.35%** |
| employees counted incomplete | 542 | **615** |

This required all four lock-step sites to move in one commit (`5401a79fb`), and incidentally fixed a long-standing drift: `getOverviewStats` had only 7 optional fields, silently omitting `blood_group`, so the headline rate had always disagreed with the charts. Both arrays are now byte-identical at 10 entries.

It also exposed a defect the field lists alone could not: `DASHBOARD_STAFF_COLUMNS`, the `.select()` backing both aggregate functions, never fetched the two biometric columns. Counting a field the query does not select makes it read `undefined` for every row -- 100% "missing" regardless of the data, with no error anywhere. Both columns were added to that select.

Note also: 542, not the 541 quoted elsewhere in this document. `isFieldMissing` trims before comparing, so a whitespace-only value counts as missing in code; the original SQL used `= ''`. One row differs.

### 3.2 Two-phase narrow-then-hydrate API

Server-side pagination needs a correct `total_items`, but "incomplete" is a 15-field predicate currently evaluated in JS after fetching every matching row with three embedded joins.

Rejected alternatives:

- **SQL `.or()` predicate** (30 terms, `count:'exact'` + `.range()`) — one query, but the default *most missing fields first* ordering is not expressible without a computed column, and sorting only within a page would be quietly wrong.
- **Postgres RPC exposing `missing_field_count`** — sorts correctly in SQL, but costs a prod migration (classifier-gated) and adds RLS surface for a single drill-down table.

**Chosen: two-phase.** Phase 1 fetches a narrow projection with no embeds and no count, computes missing fields in JS over ≤866 skinny rows, and yields an exact total for free. Phase 2 hydrates join names for only the page's 25 ids. Sort semantics are preserved exactly, and the per-request payload drops from 866 fully-joined rows to 866 narrow ones plus 25 joined.

### 3.3 Dead controls dropped

Employment Type and Role Type are excluded: a dropdown with one possible value cannot change a result set. If either gains a second value later, adding it back is a one-line change to the filter state and the options endpoint.

## 4. Architecture

`IncompleteStaffTable` currently lives inside `profile-analytics.tsx`, a 651-line file already rendering three charts. It moves out into its own siblings, mirroring the Learners precedent (`app/(routes)/learners/analytics/_components/incomplete-profiles-{table,filters,columns}.tsx`).

| File | Change | Purpose |
|---|---|---|
| `app/(routes)/staff/dashboard/_components/incomplete-staff-table.tsx` | new | Card + `DataTable` + filter wiring + export subtitle |
| `app/(routes)/staff/dashboard/_components/incomplete-staff-filters.tsx` | new | 15-control filter bar, `ALL`/`FIELD_MISSING` sentinels, cascade hook |
| `app/(routes)/staff/dashboard/_components/incomplete-staff-columns.tsx` | new | `ColumnDef[]`, export mapping/widths/PDF headers/transform |
| `app/(routes)/staff/dashboard/_components/profile-analytics.tsx` | edit | Delete lines 505-651 and the now-unused imports; render the new table |
| `app/api/staff/incomplete-profiles/route.ts` | rewrite | Two-phase, paged, sorted, searched |
| `app/api/staff/incomplete-profiles/options/route.ts` | new | Distinct designations / blood groups / genders / marital statuses / machines |
| `hooks/staff/use-staff.ts` | edit | `fetchIncompleteStaffProfiles()`, `useIncompleteStaffFilterOptions()` |
| `types/staff.ts` | edit | Filter state, options, and paged response types |

`MISSING_FIELD_COLORS` (currently `profile-analytics.tsx:58`) moves to the columns file and is re-exported, since only the table uses it.

## 5. Filter contract

```ts
/** Sentinel for "no filter applied" — Radix Select forbids an empty item value. */
export const ALL = 'all';
/** Sentinel for "this column has no value" — maps to `IS NULL OR = ''`. */
export const FIELD_MISSING = '__missing__';
/** Biometric-only: "has any code", the inverse of FIELD_MISSING. */
export const FIELD_ASSIGNED = '__assigned__';

export interface IncompleteStaffFilterState {
  // Completion
  fieldScope: 'all' | 'required' | 'optional';
  missingField: string;          // one of the 15 field labels, or ALL

  // Organisation (cascading; both accept FIELD_MISSING)
  institutionId: string;
  departmentId: string;

  // Employment
  categoryId: string;
  designation: string;
  isActive: string;              // 'active' | 'inactive' | ALL   → staff.is_active
  recordStatus: string;          // 'draft'  | 'published' | ALL  → staff.status

  // Demographic
  gender: string;
  maritalStatus: string;
  bloodGroup: string;
  joinedFrom: string;            // ISO date, '' when unset
  joinedTo: string;              // ISO date, '' when unset

  // Identity
  staffIdQuery: string;          // free text, or FIELD_MISSING
  biometricCode: string;         // free text, FIELD_MISSING, or FIELD_ASSIGNED
  biometricMachineId: string;    // machine id, or FIELD_MISSING
}

export const DEFAULT_INCOMPLETE_STAFF_FILTERS: IncompleteStaffFilterState = {
  fieldScope: 'all',   // preserves exactly what the table shows today
  missingField: ALL,
  institutionId: ALL, departmentId: ALL,
  categoryId: ALL, designation: ALL, isActive: ALL, recordStatus: ALL,
  gender: ALL, maritalStatus: ALL, bloodGroup: ALL,
  joinedFrom: '', joinedTo: '',
  staffIdQuery: '', biometricCode: '', biometricMachineId: ALL,
};
```

### 5.1 Rules

- **`FIELD_MISSING` is offered at every level and never gated on the level above.** "Employees with no department" must be askable without first naming an institution — and those employees have no institution-scoped department to name. Same reasoning as `incomplete-profiles-filters.tsx:96`.
- **Institution change resets Department.** A stale department belonging to another institution matches nothing.
- **Table filters override the dashboard filters when set.** `ALL` falls back to the dashboard-level scope — never "every institution in the system", which RLS would not return anyway.
- **Any filter change resets to page 1.**
- **Text inputs are debounced 300 ms.** `DataTable` re-runs its fetch effect whenever the `fetchData` callback identity changes, so an undebounced input fires one request per keystroke. Only the debounced value goes in the dep array.
- **Designation uses `SearchableSelect`**, not `Select` — 183 distinct values. Employment Category (29 values), Blood Group (11) and the rest stay on plain `Select`.

## 6. API

### 6.1 `GET /api/staff/incomplete-profiles`

**Query parameters** (all optional): `institutionId`, `departmentId`, `categoryId`, `designation`, `isActive`, `recordStatus`, `gender`, `maritalStatus`, `bloodGroup`, `joinedFrom`, `joinedTo`, `staffId`, `biometricCode`, `biometricMachineId`, `fieldScope`, `missingField`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.

Org/identity params accept the literal `__missing__` to mean `IS NULL OR = ''`.

**Phase 1 — narrow projection, no embeds, no count.**

```
select id, first_name, last_name, email, phone, designation, staff_id,
       institution_email, date_of_birth, date_of_joining, profile_picture,
       address, state, district, pincode, blood_group,
       institution_id, department_id, category_id,
       is_active, status, gender, marital_status,
       biometric_id, biometric_institution_id
```

Applied server-side: `.eq()` for institution / department / category / designation / gender / marital_status / blood_group / biometric_institution_id and `status`; `.gte`/`.lte` on `date_of_joining`; `.ilike` for `staffId` and `biometricCode` free text; `.not(col,'is',null)` for `FIELD_ASSIGNED`.

Two predicates need explicit null handling because the columns are nullable:

- **`isActive`** — `active` → `.eq('is_active', true)`; `inactive` → `.or('is_active.eq.false,is_active.is.null')`. Production currently holds 752 `true` / 114 `false` / 0 `null`, but `is_active` *is* nullable, and a null must read as inactive rather than silently vanishing from both halves of the filter.
- **`FIELD_MISSING`** — `.or('<col>.is.null,<col>.eq.')`, not `.is(col, null)` alone. Several text columns store `''` rather than `NULL`, and the JS completion check already treats both as missing; the SQL predicate must agree or the filtered count will disagree with the badge list.

Then in JS, over the returned rows:

1. Compute `missingFields` using the scope's field list (`required` = 7, `optional` = 8, `all` = 15).
2. Keep rows with ≥1 missing field.
3. Apply the `missingField` predicate if set.
4. Apply `search` across first/last name, email, institution email, staff ID, biometric code.
5. Sort — `missingFields.length` descending by default, otherwise by the requested allowlisted column.
6. `total = filtered.length` — exact, and free.

**Phase 2 — hydrate the visible page only.**

```
.in('id', filtered.slice(offset, offset + limit).map(r => r.id))
  with institution:institutions!staff_institution_id_fkey(id,name),
       department:departments(id,department_name),
       category:employment_categories(id,category_name)
```

Biometric machine names come from one `OrganizationService.getInstitutionNames(true, undefined, 'all')` call, cached per request. It cannot be a PostgREST embed: `staff.biometric_institution_id` had its FK dropped on 2026-08-06 (see `app/(routes)/staff/list/[id]/page.tsx:104`).

**Removed:** the `{ count: 'exact' }` at `route.ts:133`, which is computed and discarded on every request — an unbounded RLS scan paid for nothing.

**Response:**

```ts
{
  // IncompleteStaffDetail already carries institution_name / department_name /
  // category_name; this change adds biometric_id, biometric_machine_name and
  // missing_count (the sort key, exposed so the UI need not recompute it).
  profiles: IncompleteStaffDetail[],
  total: number,
  page: number,
  limit: number,
  totalPages: number,
}
```

`limit` clamps to `[1, 100]`; `sortBy` is allowlisted against real `staff` columns plus the synthetic `missing_count`.

### 6.2 `GET /api/staff/incomplete-profiles/options`

Returns `{ designations, bloodGroups, genders, maritalStatuses, biometricMachines }`, each `{ value, label }[]`. Scoped by the caller's accessible institutions (and by `institutionId` when passed) so a college admin sees only their own designation list. Client cache 5 minutes, matching the Learners `/options` route.

## 7. Table and export

**Columns:** Name (+ email, staff ID) · Designation · Department (+ institution) · Category · Biometric (code + machine) · Status · Missing Fields (badges) · Action (link to `/staff/list/{id}`).

Sorting is `manualSorting` against the API allowlist, so join-backed columns (department / category / machine names) opt out of sort headers rather than offering a sort the backend silently ignores.

**Export** uses data keys, not display labels:

```ts
export const INCOMPLETE_STAFF_EXPORT_MAPPING: Record<string, string> = {
  first_name: 'Name', staff_id: 'Staff ID', email: 'Email',
  designation: 'Designation', department_name: 'Department',
  institution_name: 'Institution', category_name: 'Category',
  biometric_id: 'Biometric Code', biometric_machine_name: 'Biometric Machine',
  is_active: 'Status', missing_fields_label: 'Missing Fields',
};
export const INCOMPLETE_STAFF_EXPORT_HEADERS =
  Object.keys(INCOMPLETE_STAFF_EXPORT_MAPPING);
```

A `transformFunction` flattens `missingFields[]` into `missing_fields_label` and renders `is_active` as `Active`/`Inactive`. `INCOMPLETE_STAFF_EXPORT_WIDTHS` is positional and must stay aligned with the mapping's key order. The PDF gets a curated subset plus a subtitle listing the active filters, so a filtered export is not mistaken for a full one once it has left the app.

`DataTable` config: `enableUrlState: false` (the tab selection already owns the query string), `enableRowSelection: false`, `enableDateFilter: false` (joining date is in the filter bar; the built-in picker targets `created_at`), `enableColumnFilters: false`, search/export/column-visibility/resizing on, `columnResizingTableId: 'incomplete-staff-detail-table'`, `size: 'sm'`.

## 8. Error handling and empty states

| Condition | Behaviour |
|---|---|
| Auth failure | 401, unchanged from today |
| Profile not found | 404, unchanged |
| Phase 1 query error | 500 with `details`; table shows the existing error row |
| Phase 2 query error | Log and fall back to un-hydrated rows — names render as `—` rather than failing the page |
| Options endpoint error | Filter bar renders with empty option lists and stays usable; the free-text and sentinel filters still work |
| Zero rows, filters active | "No employees match these filters" + a Clear Filters action |
| Zero rows, no filters | "All employee profiles are complete!" (existing green state) |
| `fieldScope: 'required'`, zero rows | Adds a hint that all seven required fields are currently 100% complete, so the empty result reads as good news rather than a broken control |

## 9. Testing

**`__tests__/api/staff/incomplete-profiles.test.ts`**

- Missing-field computation per scope: `required` → 7 fields, `optional` → 8, `all` → 15.
- Empty string counts as missing, not only `null` — several columns store `''`.
- `FIELD_MISSING` produces the `IS NULL OR = ''` predicate on the right column.
- `total` equals the filtered count, not the raw fetch count, and is stable across pages.
- `limit` clamps outside `[1, 100]`; unknown `sortBy` falls back to missing-count desc.
- Search matches across name, email, staff ID, and biometric code.

**`__tests__/components/incomplete-staff-filters.test.tsx`**

- Changing institution resets department to `ALL`.
- Active-filter count reflects only non-default values.
- Clear Filters restores `DEFAULT_INCOMPLETE_STAFF_FILTERS` exactly.

Note: `__tests__` is not covered by the project typecheck (see the `typecheck-scoped-tsconfig` note), and `main` has a red vitest baseline — capture the baseline before attributing any failure to this branch.

## 10. Rollout

Single branch, single PR. No migration, no data backfill, no feature flag — the default filter state reproduces the table's current behaviour, so the change is additive from the user's point of view.
