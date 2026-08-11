# Employees Incomplete-Profiles Advanced Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 50-row capped "Employees with Incomplete Profiles" table on `/staff/dashboard` with the shared `DataTable` driven by a 15-control advanced filter bar, backed by a two-phase API that returns exact pagination totals.

**Architecture:** Two pure, unit-testable modules under `lib/utils/staff/` own the completion definition and the filter contract. The API route consumes both: phase 1 fetches a narrow projection with all SQL-expressible filters applied and computes missing fields in JS; phase 2 hydrates join names for only the visible page. Three new `_components/` files (filters, columns, table) mirror the existing Learners analytics precedent at `app/(routes)/learners/analytics/_components/incomplete-profiles-{filters,columns,table}.tsx`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgREST via `@/lib/supabase/server`), TanStack Query v5, TanStack Table via the shared `components/data-table/data-table.tsx`, Shadcn UI, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-10-employees-incomplete-profiles-advanced-filters-design.md`

## Global Constraints

- **Do not change the profile-completion definition.** The 7 required + 8 optional field set is under a lock-step contract with `lib/services/staff/staff-service.ts` (~1206, ~1705) and `lib/utils/staff-profile-completion.ts`. Department and biometric columns are filter dimensions only.
- **Terminology:** user-facing copy says "Employees", never "Staff". Database columns and table names keep `staff`.
- **Run tests without a pipe:** `npx vitest run <path>` directly. Piping vitest hides its real exit status.
- **`main` has a red vitest baseline** (21 files / 13 tests fail on a clean tree). Capture the baseline before attributing a failure to this branch.
- **Never run bare `npx tsc`** — it resolves the wrong binary and full-project typecheck OOMs. Use the scoped config shown in Task 10.
- **Empty string counts as missing**, not only `NULL`. Several `staff` text columns store `''`.
- **uuid columns cannot be compared to `''`** in Postgres. `NULL`-checks on uuid columns must use `.is.null` alone.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/utils/staff/incomplete-profile-fields.ts` | Create | The completion definition: field lists, labels, `computeMissingFields`. Pure, no I/O. |
| `lib/utils/staff/incomplete-profile-filters.ts` | Create | The filter contract in both directions: state shape, defaults, `buildIncompleteStaffQuery` (client → params), `parseIncompleteStaffParams` (params → typed), sort/search/predicate helpers. Pure, no I/O. |
| `__tests__/lib/utils/staff/incomplete-profile-fields.test.ts` | Create | Tests for module 1. |
| `__tests__/lib/utils/staff/incomplete-profile-filters.test.ts` | Create | Tests for module 2. |
| `types/staff.ts` | Modify | `IncompleteStaffDetail` additions, paged response, filter-options types. |
| `app/api/staff/incomplete-profiles/route.ts` | Rewrite | Two-phase paged query. |
| `app/api/staff/incomplete-profiles/options/route.ts` | Create | Distinct designations / blood groups / genders / marital statuses / machines. |
| `hooks/staff/use-staff.ts` | Modify | `fetchIncompleteStaffProfiles`, `useIncompleteStaffFilterOptions`. |
| `app/(routes)/staff/dashboard/_components/incomplete-staff-columns.tsx` | Create | `ColumnDef[]` + export mapping/widths/PDF headers/transform. |
| `app/(routes)/staff/dashboard/_components/incomplete-staff-filters.tsx` | Create | The 15-control filter bar. |
| `app/(routes)/staff/dashboard/_components/incomplete-staff-table.tsx` | Create | Card + `DataTable` + filter wiring + export subtitle. |
| `app/(routes)/staff/dashboard/_components/profile-analytics.tsx` | Modify | Delete lines 505-651 and `MISSING_FIELD_COLORS`; render the new table. |

**Why two `lib/utils/staff/` modules and not three:** `buildIncompleteStaffQuery` and `parseIncompleteStaffParams` are two halves of one wire contract. Splitting client-side and server-side helpers into separate files is exactly how they drift — a param renamed on one side and not the other produces a filter that silently does nothing. They live together so a single test file can assert the round trip.

---

### Task 1: Completion-definition module

**Files:**
- Create: `lib/utils/staff/incomplete-profile-fields.ts`
- Test: `__tests__/lib/utils/staff/incomplete-profile-fields.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `StaffFieldScope`, `STAFF_REQUIRED_FIELDS`, `STAFF_OPTIONAL_FIELDS`, `STAFF_ALL_FIELDS`, `STAFF_FIELD_LABELS: Record<string,string>`, `fieldsForScope(scope): readonly string[]`, `isFieldMissing(value: unknown): boolean`, `computeMissingFields(row: Record<string, unknown>, scope?: StaffFieldScope): string[]` (returns **labels**).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/utils/staff/incomplete-profile-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  STAFF_REQUIRED_FIELDS,
  STAFF_OPTIONAL_FIELDS,
  STAFF_ALL_FIELDS,
  STAFF_FIELD_LABELS,
  fieldsForScope,
  isFieldMissing,
  computeMissingFields,
} from '@/lib/utils/staff/incomplete-profile-fields';

const COMPLETE_ROW = {
  first_name: 'Asha', last_name: 'Kumar', email: 'asha@jkkn.ac.in',
  phone: '9876543210', designation: 'Professor', date_of_birth: '1985-04-02',
  date_of_joining: '2015-06-01', staff_id: 'JKKN001',
  profile_picture: 'https://example.test/a.png', address: '12 Main St',
  state: 'Tamil Nadu', district: 'Namakkal', pincode: '637503',
  institution_email: 'asha@jkkn.ac.in', blood_group: 'O+',
};

describe('field lists', () => {
  it('holds 7 required and 8 optional fields, 15 in total', () => {
    expect(STAFF_REQUIRED_FIELDS).toHaveLength(7);
    expect(STAFF_OPTIONAL_FIELDS).toHaveLength(8);
    expect(STAFF_ALL_FIELDS).toHaveLength(15);
  });

  it('labels every tracked field', () => {
    for (const field of STAFF_ALL_FIELDS) {
      expect(STAFF_FIELD_LABELS[field]).toBeTruthy();
    }
  });

  it('has no field in both lists', () => {
    const overlap = STAFF_REQUIRED_FIELDS.filter((f) =>
      (STAFF_OPTIONAL_FIELDS as readonly string[]).includes(f)
    );
    expect(overlap).toEqual([]);
  });
});

describe('fieldsForScope', () => {
  it('returns the required list for "required"', () => {
    expect(fieldsForScope('required')).toEqual(STAFF_REQUIRED_FIELDS);
  });
  it('returns the optional list for "optional"', () => {
    expect(fieldsForScope('optional')).toEqual(STAFF_OPTIONAL_FIELDS);
  });
  it('returns all 15 for "all"', () => {
    expect(fieldsForScope('all')).toHaveLength(15);
  });
});

describe('isFieldMissing', () => {
  it('treats null and undefined as missing', () => {
    expect(isFieldMissing(null)).toBe(true);
    expect(isFieldMissing(undefined)).toBe(true);
  });
  it('treats an empty string as missing', () => {
    expect(isFieldMissing('')).toBe(true);
  });
  it('treats a whitespace-only string as missing', () => {
    expect(isFieldMissing('   ')).toBe(true);
  });
  it('treats a real value as present', () => {
    expect(isFieldMissing('O+')).toBe(false);
  });
  it('treats false and 0 as present, not missing', () => {
    expect(isFieldMissing(false)).toBe(false);
    expect(isFieldMissing(0)).toBe(false);
  });
});

describe('computeMissingFields', () => {
  it('returns nothing for a fully populated row', () => {
    expect(computeMissingFields(COMPLETE_ROW, 'all')).toEqual([]);
  });

  it('returns human labels, not column names', () => {
    const row = { ...COMPLETE_ROW, profile_picture: null };
    expect(computeMissingFields(row, 'all')).toEqual(['Profile Picture']);
  });

  it('ignores optional gaps when scope is "required"', () => {
    const row = { ...COMPLETE_ROW, blood_group: null, address: '' };
    expect(computeMissingFields(row, 'required')).toEqual([]);
  });

  it('ignores required gaps when scope is "optional"', () => {
    const row = { ...COMPLETE_ROW, phone: null };
    expect(computeMissingFields(row, 'optional')).toEqual([]);
  });

  it('reports both when scope is "all"', () => {
    const row = { ...COMPLETE_ROW, phone: null, blood_group: '  ' };
    expect(computeMissingFields(row, 'all')).toEqual(['Phone', 'Blood Group']);
  });

  it('defaults to the "all" scope', () => {
    const row = { ...COMPLETE_ROW, pincode: null };
    expect(computeMissingFields(row)).toEqual(['Pincode']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/utils/staff/incomplete-profile-fields.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/utils/staff/incomplete-profile-fields"`.

- [ ] **Step 3: Write the implementation**

Create `lib/utils/staff/incomplete-profile-fields.ts`:

```ts
// ============================================
// STAFF INCOMPLETE-PROFILE FIELD DEFINITION
// ============================================
// Created: 2026-08-10
// Extracted from app/api/staff/incomplete-profiles/route.ts so the definition
// of "complete" can be unit-tested without a Supabase client.
//
// LOCK-STEP CONTRACT: this list must stay identical to the aggregate in
// lib/services/staff/staff-service.ts (~1206, ~1705) and the per-employee bar
// in lib/utils/staff-profile-completion.ts. Adding a field here moves the
// dashboard's headline completion percentage. Department and the biometric
// columns are deliberately NOT tracked here — they are filter dimensions only
// (see the 2026-08-10 design doc, section 3.1).
// ============================================

export type StaffFieldScope = 'all' | 'required' | 'optional';

export const STAFF_REQUIRED_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'designation',
  'date_of_birth',
  'date_of_joining',
] as const;

export const STAFF_OPTIONAL_FIELDS = [
  'staff_id',
  'profile_picture',
  'address',
  'state',
  'district',
  'pincode',
  'institution_email',
  'blood_group',
] as const;

export const STAFF_ALL_FIELDS: readonly string[] = [
  ...STAFF_REQUIRED_FIELDS,
  ...STAFF_OPTIONAL_FIELDS,
];

/** Human-readable labels — these strings are what the UI badges render. */
export const STAFF_FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  designation: 'Designation',
  date_of_birth: 'Date of Birth',
  date_of_joining: 'Date of Joining',
  staff_id: 'Staff ID',
  profile_picture: 'Profile Picture',
  address: 'Address',
  state: 'State',
  district: 'District',
  // 'Pincode', not 'PIN Code' — this is the string the drill-down badge already
  // renders and the string the API already emits. lib/utils/staff-profile-completion.ts
  // says 'PIN Code' for the per-employee bar; that pre-existing inconsistency is
  // cosmetic (labels play no part in the completion maths) and out of scope here.
  pincode: 'Pincode',
  institution_email: 'Institution Email',
  blood_group: 'Blood Group',
};

export function fieldsForScope(scope: StaffFieldScope): readonly string[] {
  if (scope === 'required') return STAFF_REQUIRED_FIELDS;
  if (scope === 'optional') return STAFF_OPTIONAL_FIELDS;
  return STAFF_ALL_FIELDS;
}

/**
 * A field is missing when it is null/undefined or a blank string.
 *
 * Trimming matters: the API's old inline check compared to '' exactly, while
 * lib/utils/staff-profile-completion.ts trimmed. The two disagreed on a
 * whitespace-only cell, so the drill-down table could list someone the progress
 * bar called complete. This is the trimming version, and it is now the only one.
 */
export function isFieldMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** Labels of every tracked field this row is missing, in field-list order. */
export function computeMissingFields(
  row: Record<string, unknown>,
  scope: StaffFieldScope = 'all'
): string[] {
  const missing: string[] = [];
  for (const field of fieldsForScope(scope)) {
    if (isFieldMissing(row[field])) {
      missing.push(STAFF_FIELD_LABELS[field] ?? field);
    }
  }
  return missing;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/utils/staff/incomplete-profile-fields.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/staff/incomplete-profile-fields.ts __tests__/lib/utils/staff/incomplete-profile-fields.test.ts
git commit -m "$(cat <<'EOF'
refactor(staff): extract the incomplete-profile field definition into a tested module

The 15-field completion definition lived inline in the API route, so nothing
could assert it without a Supabase client — and its empty-string check
disagreed with lib/utils/staff-profile-completion.ts on whitespace-only cells.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Filter-contract module

**Files:**
- Create: `lib/utils/staff/incomplete-profile-filters.ts`
- Test: `__tests__/lib/utils/staff/incomplete-profile-filters.test.ts`

**Interfaces:**
- Consumes: `StaffFieldScope` from Task 1.
- Produces: `ALL`, `FIELD_MISSING`, `FIELD_ASSIGNED`, `IncompleteStaffFilterState`, `DEFAULT_INCOMPLETE_STAFF_FILTERS`, `applyFilterPatch(state, patch)`, `countActiveFilters(state)`, `IncompleteStaffQuery`, `buildIncompleteStaffQuery(q): string`, `ParsedIncompleteStaffParams`, `parseIncompleteStaffParams(sp: URLSearchParams)`, `SORTABLE_STAFF_COLUMNS: Set<string>`, `MAX_INCOMPLETE_STAFF_LIMIT`, `missingColumnFilter(column): string`, `matchesSearch(row, term): boolean`, `compareIncompleteRows(a, b, sortBy, sortOrder): number`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/utils/staff/incomplete-profile-filters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ALL,
  FIELD_MISSING,
  FIELD_ASSIGNED,
  DEFAULT_INCOMPLETE_STAFF_FILTERS,
  applyFilterPatch,
  countActiveFilters,
  buildIncompleteStaffQuery,
  parseIncompleteStaffParams,
  missingColumnFilter,
  matchesSearch,
  compareIncompleteRows,
  MAX_INCOMPLETE_STAFF_LIMIT,
} from '@/lib/utils/staff/incomplete-profile-filters';

describe('applyFilterPatch', () => {
  it('merges a patch onto the state', () => {
    const next = applyFilterPatch(DEFAULT_INCOMPLETE_STAFF_FILTERS, { gender: 'female' });
    expect(next.gender).toBe('female');
  });

  it('resets department when institution changes', () => {
    const state = applyFilterPatch(DEFAULT_INCOMPLETE_STAFF_FILTERS, {
      institutionId: 'inst-1',
      departmentId: 'dept-1',
    });
    const next = applyFilterPatch(state, { institutionId: 'inst-2' });
    expect(next.departmentId).toBe(ALL);
  });

  it('keeps department when institution is re-set to the same value', () => {
    const state = applyFilterPatch(DEFAULT_INCOMPLETE_STAFF_FILTERS, {
      institutionId: 'inst-1',
      departmentId: 'dept-1',
    });
    const next = applyFilterPatch(state, { institutionId: 'inst-1' });
    expect(next.departmentId).toBe('dept-1');
  });

  it('does not touch department when an unrelated field changes', () => {
    const state = applyFilterPatch(DEFAULT_INCOMPLETE_STAFF_FILTERS, {
      departmentId: 'dept-1',
    });
    expect(applyFilterPatch(state, { bloodGroup: 'O+' }).departmentId).toBe('dept-1');
  });
});

describe('countActiveFilters', () => {
  it('counts nothing for the defaults', () => {
    expect(countActiveFilters(DEFAULT_INCOMPLETE_STAFF_FILTERS)).toBe(0);
  });
  it('counts each non-default value once', () => {
    const state = applyFilterPatch(DEFAULT_INCOMPLETE_STAFF_FILTERS, {
      gender: 'male',
      fieldScope: 'required',
      staffIdQuery: 'JKKN',
    });
    expect(countActiveFilters(state)).toBe(3);
  });
});

describe('buildIncompleteStaffQuery', () => {
  it('omits every default so the URL stays clean', () => {
    expect(buildIncompleteStaffQuery({ ...DEFAULT_INCOMPLETE_STAFF_FILTERS })).toBe('');
  });

  it('omits the ALL sentinel but keeps the MISSING sentinel', () => {
    const qs = buildIncompleteStaffQuery({
      ...DEFAULT_INCOMPLETE_STAFF_FILTERS,
      categoryId: ALL,
      departmentId: FIELD_MISSING,
    });
    const params = new URLSearchParams(qs);
    expect(params.get('categoryId')).toBeNull();
    expect(params.get('departmentId')).toBe(FIELD_MISSING);
  });

  it('renames staffIdQuery to staffId on the wire', () => {
    const qs = buildIncompleteStaffQuery({
      ...DEFAULT_INCOMPLETE_STAFF_FILTERS,
      staffIdQuery: 'JKKN0',
    });
    expect(new URLSearchParams(qs).get('staffId')).toBe('JKKN0');
  });

  it('carries paging and sorting', () => {
    const qs = buildIncompleteStaffQuery({
      ...DEFAULT_INCOMPLETE_STAFF_FILTERS,
      page: 3,
      limit: 25,
      sortBy: 'first_name',
      sortOrder: 'asc',
    });
    const params = new URLSearchParams(qs);
    expect(params.get('page')).toBe('3');
    expect(params.get('limit')).toBe('25');
    expect(params.get('sortBy')).toBe('first_name');
    expect(params.get('sortOrder')).toBe('asc');
  });
});

describe('round trip', () => {
  it('parses back every filter the builder emits', () => {
    const state = applyFilterPatch(DEFAULT_INCOMPLETE_STAFF_FILTERS, {
      fieldScope: 'optional',
      missingField: 'profile_picture',
      institutionId: 'inst-1',
      departmentId: FIELD_MISSING,
      categoryId: 'cat-1',
      designation: 'Professor',
      isActive: 'inactive',
      recordStatus: 'draft',
      gender: 'female',
      maritalStatus: 'married',
      bloodGroup: 'O+',
      joinedFrom: '2020-01-01',
      joinedTo: '2021-12-31',
      staffIdQuery: 'JKKN0',
      biometricCode: FIELD_ASSIGNED,
      biometricMachineId: 'machine-1',
    });
    const parsed = parseIncompleteStaffParams(
      new URLSearchParams(buildIncompleteStaffQuery({ ...state, search: 'asha' }))
    );

    expect(parsed.fieldScope).toBe('optional');
    expect(parsed.missingField).toBe('profile_picture');
    expect(parsed.institutionId).toBe('inst-1');
    expect(parsed.departmentId).toBe(FIELD_MISSING);
    expect(parsed.categoryId).toBe('cat-1');
    expect(parsed.designation).toBe('Professor');
    expect(parsed.isActive).toBe('inactive');
    expect(parsed.recordStatus).toBe('draft');
    expect(parsed.gender).toBe('female');
    expect(parsed.maritalStatus).toBe('married');
    expect(parsed.bloodGroup).toBe('O+');
    expect(parsed.joinedFrom).toBe('2020-01-01');
    expect(parsed.joinedTo).toBe('2021-12-31');
    expect(parsed.staffId).toBe('JKKN0');
    expect(parsed.biometricCode).toBe(FIELD_ASSIGNED);
    expect(parsed.biometricMachineId).toBe('machine-1');
    expect(parsed.search).toBe('asha');
  });
});

describe('parseIncompleteStaffParams', () => {
  it('defaults to scope "all", page 1, limit 25, missing-count desc', () => {
    const p = parseIncompleteStaffParams(new URLSearchParams());
    expect(p.fieldScope).toBe('all');
    expect(p.page).toBe(1);
    expect(p.limit).toBe(25);
    expect(p.sortBy).toBe('missing_count');
    expect(p.sortOrder).toBe('desc');
    expect(p.search).toBe('');
  });

  it('clamps the limit to the maximum', () => {
    const p = parseIncompleteStaffParams(new URLSearchParams('limit=5000'));
    expect(p.limit).toBe(MAX_INCOMPLETE_STAFF_LIMIT);
  });

  it('clamps a zero or negative limit up to 1', () => {
    expect(parseIncompleteStaffParams(new URLSearchParams('limit=0')).limit).toBe(1);
    expect(parseIncompleteStaffParams(new URLSearchParams('limit=-4')).limit).toBe(1);
  });

  it('falls back to page 1 for a non-numeric page', () => {
    expect(parseIncompleteStaffParams(new URLSearchParams('page=abc')).page).toBe(1);
  });

  it('rejects a sortBy outside the allowlist', () => {
    const p = parseIncompleteStaffParams(new URLSearchParams('sortBy=password'));
    expect(p.sortBy).toBe('missing_count');
  });

  it('accepts an allowlisted sortBy', () => {
    const p = parseIncompleteStaffParams(new URLSearchParams('sortBy=date_of_joining'));
    expect(p.sortBy).toBe('date_of_joining');
  });

  it('rejects an unknown fieldScope', () => {
    expect(parseIncompleteStaffParams(new URLSearchParams('fieldScope=wat')).fieldScope).toBe('all');
  });

  it('rejects an unknown isActive', () => {
    expect(parseIncompleteStaffParams(new URLSearchParams('isActive=maybe')).isActive).toBeUndefined();
  });

  it('treats the ALL sentinel as no filter', () => {
    const p = parseIncompleteStaffParams(new URLSearchParams(`gender=${ALL}`));
    expect(p.gender).toBeUndefined();
  });
});

describe('missingColumnFilter', () => {
  it('checks null and empty string on a text column', () => {
    expect(missingColumnFilter('staff_id')).toBe('staff_id.is.null,staff_id.eq.');
  });

  it('checks only null on a uuid column', () => {
    // Comparing a uuid to '' raises "invalid input syntax for type uuid",
    // which PostgREST surfaces as a 400 for the whole request.
    expect(missingColumnFilter('department_id')).toBe('department_id.is.null');
    expect(missingColumnFilter('biometric_institution_id')).toBe(
      'biometric_institution_id.is.null'
    );
  });

  it('checks only null on a date column', () => {
    // `date = ''` raises 22007. date_of_birth and date_of_joining are REQUIRED
    // fields, so this is reachable from the ordinary Missing Field dropdown.
    expect(missingColumnFilter('date_of_birth')).toBe('date_of_birth.is.null');
    expect(missingColumnFilter('date_of_joining')).toBe('date_of_joining.is.null');
  });

  it('checks only null on a boolean or timestamp column', () => {
    expect(missingColumnFilter('is_active')).toBe('is_active.is.null');
    expect(missingColumnFilter('created_at')).toBe('created_at.is.null');
  });
});

describe('matchesSearch', () => {
  const row = {
    first_name: 'Asha', last_name: 'Kumar', email: 'asha@jkkn.ac.in',
    institution_email: 'asha.k@jkkn.ac.in', staff_id: 'JKKN001', biometric_id: '00042',
  };

  it('matches everything on an empty term', () => {
    expect(matchesSearch(row, '')).toBe(true);
  });
  it('matches a first name case-insensitively', () => {
    expect(matchesSearch(row, 'asha')).toBe(true);
  });
  it('matches across the first/last name boundary', () => {
    expect(matchesSearch(row, 'asha kum')).toBe(true);
  });
  it('matches a staff ID', () => {
    expect(matchesSearch(row, 'jkkn001')).toBe(true);
  });
  it('matches a biometric code', () => {
    expect(matchesSearch(row, '00042')).toBe(true);
  });
  it('rejects a term present in no column', () => {
    expect(matchesSearch(row, 'zzzz')).toBe(false);
  });
  it('survives null columns', () => {
    expect(matchesSearch({ first_name: null, last_name: null }, 'x')).toBe(false);
  });
});

describe('compareIncompleteRows', () => {
  const a = { id: 'a', first_name: 'Asha', missing_count: 5, designation: 'Professor' };
  const b = { id: 'b', first_name: 'Bala', missing_count: 2, designation: null };

  it('puts the most incomplete first when sorting missing_count desc', () => {
    expect(compareIncompleteRows(a, b, 'missing_count', 'desc')).toBeLessThan(0);
  });

  it('reverses for asc', () => {
    expect(compareIncompleteRows(a, b, 'missing_count', 'asc')).toBeGreaterThan(0);
  });

  it('breaks a missing_count tie by name so pages do not reshuffle', () => {
    const tie = { ...b, missing_count: 5 };
    expect(compareIncompleteRows(a, tie, 'missing_count', 'desc')).toBeLessThan(0);
  });

  it('sorts nulls last regardless of direction', () => {
    expect(compareIncompleteRows(a, b, 'designation', 'asc')).toBeLessThan(0);
    expect(compareIncompleteRows(a, b, 'designation', 'desc')).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/utils/staff/incomplete-profile-filters.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/utils/staff/incomplete-profile-filters"`.

- [ ] **Step 3: Write the implementation**

Create `lib/utils/staff/incomplete-profile-filters.ts`:

```ts
// ============================================
// STAFF INCOMPLETE-PROFILE FILTER CONTRACT
// ============================================
// Created: 2026-08-10
// Both directions of the wire contract for
// GET /api/staff/incomplete-profiles, deliberately in ONE file: the client's
// buildIncompleteStaffQuery and the server's parseIncompleteStaffParams are
// two halves of the same agreement, and keeping them apart is exactly how a
// renamed param becomes a filter that silently does nothing. The round-trip
// test in __tests__/lib/utils/staff/ guards that.
// ============================================

import type { StaffFieldScope } from './incomplete-profile-fields';

/** Sentinel for "no filter applied" — Radix Select forbids an empty item value. */
export const ALL = 'all';
/** Sentinel for "this column has no value". */
export const FIELD_MISSING = '__missing__';
/** Biometric only: "has any code at all" — the inverse of FIELD_MISSING. */
export const FIELD_ASSIGNED = '__assigned__';

export const MAX_INCOMPLETE_STAFF_LIMIT = 100;
export const DEFAULT_INCOMPLETE_STAFF_LIMIT = 25;
export const DEFAULT_SORT_BY = 'missing_count';

/**
 * Sort keys the API honours. `missing_count` is synthetic (computed in JS);
 * everything else is a real `staff` column. Columns backed by an embedded join
 * are absent on purpose — the table must not offer a sort the API ignores.
 */
export const SORTABLE_STAFF_COLUMNS = new Set([
  'missing_count',
  'first_name',
  'last_name',
  'email',
  'staff_id',
  'designation',
  'date_of_joining',
  'created_at',
  'biometric_id',
]);

export interface IncompleteStaffFilterState {
  // Completion
  fieldScope: StaffFieldScope;
  missingField: string; // a staff column name, or ALL

  // Organisation (cascading; both accept FIELD_MISSING)
  institutionId: string;
  departmentId: string;

  // Employment
  categoryId: string;
  designation: string;
  isActive: string; // 'active' | 'inactive' | ALL
  recordStatus: string; // 'draft' | 'published' | ALL

  // Demographic
  gender: string;
  maritalStatus: string;
  bloodGroup: string;
  joinedFrom: string; // ISO date, '' when unset
  joinedTo: string;

  // Identity
  staffIdQuery: string; // free text, or FIELD_MISSING
  biometricCode: string; // free text, FIELD_MISSING, or FIELD_ASSIGNED
  biometricMachineId: string; // machine id, or FIELD_MISSING
}

export const DEFAULT_INCOMPLETE_STAFF_FILTERS: IncompleteStaffFilterState = {
  // 'all' reproduces exactly what the table showed before this feature.
  fieldScope: 'all',
  missingField: ALL,
  institutionId: ALL,
  departmentId: ALL,
  categoryId: ALL,
  designation: ALL,
  isActive: ALL,
  recordStatus: ALL,
  gender: ALL,
  maritalStatus: ALL,
  bloodGroup: ALL,
  joinedFrom: '',
  joinedTo: '',
  staffIdQuery: '',
  biometricCode: '',
  biometricMachineId: ALL,
};

/**
 * Apply a patch, cascading the resets it implies.
 *
 * Institution owns Department: a department id belongs to exactly one
 * institution, so carrying a stale one across an institution change would
 * filter to another college's department and return nothing — an empty table
 * that looks like a data problem rather than a filter problem.
 */
export function applyFilterPatch(
  state: IncompleteStaffFilterState,
  patch: Partial<IncompleteStaffFilterState>
): IncompleteStaffFilterState {
  const next = { ...state, ...patch };
  // Only reset when the patch is silent on departmentId — a patch that sets
  // both together (e.g. restoring state from a URL) is deliberately choosing
  // that pair, not carrying a stale department across an institution change.
  if (
    patch.institutionId !== undefined &&
    patch.institutionId !== state.institutionId &&
    patch.departmentId === undefined
  ) {
    next.departmentId = ALL;
  }
  return next;
}

export function countActiveFilters(state: IncompleteStaffFilterState): number {
  const keys = Object.keys(
    DEFAULT_INCOMPLETE_STAFF_FILTERS
  ) as (keyof IncompleteStaffFilterState)[];
  return keys.filter((key) => state[key] !== DEFAULT_INCOMPLETE_STAFF_FILTERS[key]).length;
}

export interface IncompleteStaffQuery extends Partial<IncompleteStaffFilterState> {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function buildIncompleteStaffQuery(query: IncompleteStaffQuery): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | undefined | null) => {
    if (value === undefined || value === null || value === '' || value === ALL) return;
    params.set(key, value);
  };

  // 'all' is the default scope, so omitting it keeps the URL short.
  put('fieldScope', query.fieldScope === 'all' ? undefined : query.fieldScope);
  put('missingField', query.missingField);
  put('institutionId', query.institutionId);
  put('departmentId', query.departmentId);
  put('categoryId', query.categoryId);
  put('designation', query.designation);
  put('isActive', query.isActive);
  put('recordStatus', query.recordStatus);
  put('gender', query.gender);
  put('maritalStatus', query.maritalStatus);
  put('bloodGroup', query.bloodGroup);
  put('joinedFrom', query.joinedFrom);
  put('joinedTo', query.joinedTo);
  // The UI calls this staffIdQuery to avoid colliding with the staff_id column
  // in row data; the wire name is the plain one.
  put('staffId', query.staffIdQuery);
  put('biometricCode', query.biometricCode);
  put('biometricMachineId', query.biometricMachineId);
  put('search', query.search);
  put('sortBy', query.sortBy);
  put('sortOrder', query.sortOrder);

  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));

  return params.toString();
}

export interface ParsedIncompleteStaffParams {
  fieldScope: StaffFieldScope;
  missingField?: string;
  institutionId?: string;
  departmentId?: string;
  categoryId?: string;
  designation?: string;
  isActive?: 'active' | 'inactive';
  recordStatus?: string;
  gender?: string;
  maritalStatus?: string;
  bloodGroup?: string;
  joinedFrom?: string;
  joinedTo?: string;
  staffId?: string;
  biometricCode?: string;
  biometricMachineId?: string;
  search: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(min, parsed), max);
}

export function parseIncompleteStaffParams(
  searchParams: URLSearchParams
): ParsedIncompleteStaffParams {
  const get = (key: string): string | undefined => {
    const value = searchParams.get(key);
    return value && value !== ALL ? value : undefined;
  };

  const rawScope = searchParams.get('fieldScope');
  const fieldScope: StaffFieldScope =
    rawScope === 'required' || rawScope === 'optional' ? rawScope : 'all';

  const rawActive = searchParams.get('isActive');
  const isActive =
    rawActive === 'active' || rawActive === 'inactive' ? rawActive : undefined;

  const rawSortBy = searchParams.get('sortBy') ?? '';
  const sortBy = SORTABLE_STAFF_COLUMNS.has(rawSortBy) ? rawSortBy : DEFAULT_SORT_BY;

  return {
    fieldScope,
    missingField: get('missingField'),
    institutionId: get('institutionId'),
    departmentId: get('departmentId'),
    categoryId: get('categoryId'),
    designation: get('designation'),
    isActive,
    recordStatus: get('recordStatus'),
    gender: get('gender'),
    maritalStatus: get('maritalStatus'),
    bloodGroup: get('bloodGroup'),
    joinedFrom: get('joinedFrom'),
    joinedTo: get('joinedTo'),
    staffId: get('staffId'),
    biometricCode: get('biometricCode'),
    biometricMachineId: get('biometricMachineId'),
    search: (searchParams.get('search') ?? '').trim(),
    page: clampInt(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER),
    limit: clampInt(
      searchParams.get('limit'),
      DEFAULT_INCOMPLETE_STAFF_LIMIT,
      1,
      MAX_INCOMPLETE_STAFF_LIMIT
    ),
    sortBy,
    sortOrder: searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * Columns where `= ''` is a TYPE ERROR, not a false comparison — uuid, date,
 * timestamp, boolean, numeric. Postgres raises 22P02 / 22007 ("invalid input
 * syntax for type <t>") and PostgREST fails the whole request with a 400,
 * which this route surfaces as a 500.
 *
 * The category is "non-text", NOT "uuid". An earlier version of this set was
 * named UUID_COLUMNS and listed only the uuids, which silently let
 * `missingField=date_of_birth` and `date_of_joining` — two of the seven
 * REQUIRED fields — 500 the request. Reproduced on production:
 *   ERROR: 22007: invalid input syntax for type date: ""
 * Add any new non-text column here.
 *
 * Text columns must check both forms, because several `staff` columns store ''
 * where others store NULL, and isFieldMissing() treats the two identically.
 */
const NULL_ONLY_COLUMNS = new Set([
  // uuid
  'institution_id',
  'department_id',
  'category_id',
  'biometric_institution_id',
  'profile_id',
  // date / timestamp
  'date_of_birth',
  'date_of_joining',
  'created_at',
  // boolean
  'is_active',
]);

/** PostgREST `.or()` argument meaning "this column has no value". */
export function missingColumnFilter(column: string): string {
  return NULL_ONLY_COLUMNS.has(column)
    ? `${column}.is.null`
    : `${column}.is.null,${column}.eq.`;
}

const SEARCH_COLUMNS = [
  'first_name',
  'last_name',
  'email',
  'institution_email',
  'staff_id',
  'biometric_id',
] as const;

export function matchesSearch(row: Record<string, unknown>, term: string): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  for (const column of SEARCH_COLUMNS) {
    if (String(row[column] ?? '').toLowerCase().includes(needle)) return true;
  }
  // Also match across the name boundary, so "asha kum" finds a row whose
  // columns hold the two halves separately.
  return `${row.first_name ?? ''} ${row.last_name ?? ''}`.toLowerCase().includes(needle);
}

/**
 * Order two rows. Ties always fall back to a stable key: without one, rows with
 * equal sort values can swap between two fetches and a user paging forward sees
 * the same person twice while another never appears.
 */
export function compareIncompleteRows(
  a: Record<string, unknown> & { missing_count: number },
  b: Record<string, unknown> & { missing_count: number },
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): number {
  const direction = sortOrder === 'asc' ? 1 : -1;

  if (sortBy === 'missing_count') {
    const diff = (a.missing_count - b.missing_count) * direction;
    if (diff !== 0) return diff;
    return String(a.first_name ?? '').localeCompare(String(b.first_name ?? ''));
  }

  const left = a[sortBy];
  const right = b[sortBy];
  const leftText = left === null || left === undefined ? '' : String(left);
  const rightText = right === null || right === undefined ? '' : String(right);

  // Blanks sort last in BOTH directions — an empty cell is not "smallest",
  // it is absent, and burying it under a desc sort would hide it entirely.
  if (leftText === '' && rightText !== '') return 1;
  if (rightText === '' && leftText !== '') return -1;

  const compared = leftText.localeCompare(rightText, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (compared !== 0) return compared * direction;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/utils/staff/incomplete-profile-filters.test.ts`
Expected: PASS — 33 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/staff/incomplete-profile-filters.ts __tests__/lib/utils/staff/incomplete-profile-filters.test.ts
git commit -m "$(cat <<'EOF'
feat(staff): add the incomplete-profiles filter contract

Both halves of the wire contract live in one module with a round-trip test, so
a param renamed on the client cannot become a filter the server quietly drops.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Response and options types

**Files:**
- Modify: `types/staff.ts:443-468`

**Interfaces:**
- Consumes: nothing.
- Produces: `IncompleteStaffDetail` (extended), `IncompleteStaffResponse` (paged), `StaffFilterOption`, `IncompleteStaffFilterOptions`.

- [ ] **Step 1: Replace the existing block**

In `types/staff.ts`, replace the `IncompleteStaffDetail` and `IncompleteStaffResponse` declarations (currently lines 443-468) with:

```ts
export interface IncompleteStaffDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  designation: string;
  staff_id: string | null;
  institution_email: string | null;
  is_active: boolean;
  created_at: string;
  missingFields: string[];
  /** missingFields.length, exposed so the table need not recompute the sort key. */
  missing_count: number;
  institution_name: string | null;
  department_id: string | null;
  department_name: string | null;
  category_name: string | null;
  biometric_id: string | null;
  /**
   * Resolved separately, not via an embed: staff.biometric_institution_id lost
   * its FK on 2026-08-06, so PostgREST cannot join it.
   */
  biometric_machine_name: string | null;
}

/**
 * Incomplete Staff Profiles Response
 * Server-paged; `total` is the count AFTER the missing-field predicate, so it
 * matches what the table can actually page through.
 */
export interface IncompleteStaffResponse {
  profiles: IncompleteStaffDetail[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StaffFilterOption {
  value: string;
  label: string;
}

/** Dropdown lists for the incomplete-profiles filter bar. */
export interface IncompleteStaffFilterOptions {
  designations: StaffFilterOption[];
  bloodGroups: StaffFilterOption[];
  genders: StaffFilterOption[];
  maritalStatuses: StaffFilterOption[];
  biometricMachines: StaffFilterOption[];
}
```

- [ ] **Step 2: Verify the file still parses**

Run: `npx vitest run __tests__/lib/utils/staff/`
Expected: PASS — both suites still green (they don't import `types/staff.ts`, so this only confirms nothing broke).

- [ ] **Step 3: Commit**

```bash
git add types/staff.ts
git commit -m "$(cat <<'EOF'
feat(staff): extend the incomplete-profiles types for paging and biometrics

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rewrite the API route

**Files:**
- Rewrite: `app/api/staff/incomplete-profiles/route.ts`

**Interfaces:**
- Consumes: `computeMissingFields`, `fieldsForScope` (Task 1); `parseIncompleteStaffParams`, `missingColumnFilter`, `matchesSearch`, `compareIncompleteRows`, `FIELD_MISSING`, `FIELD_ASSIGNED` (Task 2); `IncompleteStaffDetail`, `IncompleteStaffResponse` (Task 3). The route must NOT re-export anything from `@/lib/utils/staff/*` — a client component importing from a route file drags `@/lib/supabase/server` → `next/headers` into the browser bundle. Tasks 7-9 import the labels directly from Task 1's module.
- Produces: `GET /api/staff/incomplete-profiles` returning `IncompleteStaffResponse`.

- [ ] **Step 1: Replace the whole file**

Replace the contents of `app/api/staff/incomplete-profiles/route.ts` with:

```ts
export const dynamic = 'force-dynamic';

// ============================================
// STAFF INCOMPLETE PROFILES API
// ============================================
// Created: 2026-02-09
// Rewritten: 2026-08-10 — advanced filters + server-side paging
//
// Two-phase by design:
//
//   Phase 1 fetches a NARROW projection (no embeds, no count) with every
//   SQL-expressible filter applied, then computes missing fields in JS. That
//   gives an exact total for free — the previous version asked PostgREST for
//   count:'exact' and threw the answer away, paying for an unbounded RLS scan
//   on every request, then fetched every matching row WITH three embedded joins
//   only to slice off the first 50.
//
//   Phase 2 hydrates institution / department / category names for just the
//   ids on the visible page.
//
// "Incomplete" cannot move into SQL wholesale: the default ordering is by how
// many fields a row is missing, which is not a column. See the 2026-08-10
// design doc, section 3.2, for the alternatives considered.
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeMissingFields,
  fieldsForScope,
} from '@/lib/utils/staff/incomplete-profile-fields';
import {
  parseIncompleteStaffParams,
  missingColumnFilter,
  matchesSearch,
  compareIncompleteRows,
  FIELD_MISSING,
  FIELD_ASSIGNED,
} from '@/lib/utils/staff/incomplete-profile-filters';
import type { IncompleteStaffDetail } from '@/types/staff';

/**
 * Explicit bound on the phase-1 fetch. Without it, PostgREST's own db-max-rows
 * (Supabase default 1000) truncates silently, and `total` / `totalPages` —
 * both derived from the returned array's length — become confidently wrong
 * with no error anywhere. `staff` is 866 rows today.
 */
const PHASE_1_HARD_CAP = 5000;

/** Narrow projection for phase 1: completion fields + everything filterable. */
const NARROW_COLUMNS = `
  id,
  first_name, last_name, email, phone, designation, staff_id,
  institution_email, date_of_birth, date_of_joining, profile_picture,
  address, state, district, pincode, blood_group,
  institution_id, department_id, category_id,
  is_active, status, gender, marital_status, created_at,
  biometric_id, biometric_institution_id
`;

const HYDRATE_COLUMNS = `
  id,
  institution:institutions!staff_institution_id_fkey(id, name),
  department:departments(id, department_name),
  category:employment_categories(id, category_name)
`;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const params = parseIncompleteStaffParams(request.nextUrl.searchParams);

    // ---------- Phase 1: narrow fetch ----------
    let query = supabase.from('staff').select(NARROW_COLUMNS);

    /** An id filter that also understands the "not set" sentinel. */
    const applyIdFilter = (column: string, value: string | undefined) => {
      if (!value) return;
      if (value === FIELD_MISSING) {
        query = query.or(missingColumnFilter(column));
      } else {
        query = query.eq(column, value);
      }
    };

    // An explicit institution wins; otherwise confine to the caller's own.
    // Falling through to RLS unscoped is intentional for callers with no
    // institution_id — that is the behaviour this route already had.
    if (params.institutionId) {
      applyIdFilter('institution_id', params.institutionId);
    } else if (profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    applyIdFilter('department_id', params.departmentId);
    applyIdFilter('category_id', params.categoryId);
    applyIdFilter('biometric_institution_id', params.biometricMachineId);

    /**
     * A text filter that also understands the "not set" sentinel.
     *
     * EVERY text column the UI can send FIELD_MISSING for must go through this.
     * An earlier version handled only blood_group this way and left designation
     * / gender / marital_status as plain .eq(), so selecting "Not set" on those
     * queried for the LITERAL STRING '__missing__'. It returned 0 rows, which is
     * indistinguishable from the correct answer — the control looked fine and
     * was never wired up at all.
     */
    const applyTextFilter = (column: string, value: string | undefined) => {
      if (!value) return;
      if (value === FIELD_MISSING) {
        query = query.or(missingColumnFilter(column));
      } else {
        query = query.eq(column, value);
      }
    };

    applyTextFilter('designation', params.designation);
    applyTextFilter('gender', params.gender);
    applyTextFilter('marital_status', params.maritalStatus);
    applyTextFilter('blood_group', params.bloodGroup);

    // recordStatus stays a plain .eq(): the UI offers only All / Draft /
    // Published for it, so no sentinel can reach this line.
    if (params.recordStatus) query = query.eq('status', params.recordStatus);

    // is_active is nullable. A plain .eq(false) would make a null row invisible
    // under BOTH Active and Inactive — a row that exists but no filter reaches.
    if (params.isActive === 'active') {
      query = query.eq('is_active', true);
    } else if (params.isActive === 'inactive') {
      query = query.or('is_active.eq.false,is_active.is.null');
    }

    if (params.joinedFrom) query = query.gte('date_of_joining', params.joinedFrom);
    if (params.joinedTo) query = query.lte('date_of_joining', params.joinedTo);

    if (params.staffId) {
      if (params.staffId === FIELD_MISSING) {
        query = query.or(missingColumnFilter('staff_id'));
      } else {
        query = query.ilike('staff_id', `%${params.staffId}%`);
      }
    }

    if (params.biometricCode) {
      if (params.biometricCode === FIELD_MISSING) {
        query = query.or(missingColumnFilter('biometric_id'));
      } else if (params.biometricCode === FIELD_ASSIGNED) {
        query = query.not('biometric_id', 'is', null).neq('biometric_id', '');
      } else {
        query = query.ilike('biometric_id', `%${params.biometricCode}%`);
      }
    }

    // A specific missing field is a SQL predicate, so it narrows the fetch
    // itself rather than being re-checked row by row below. Only honour it when
    // the field is inside the active scope — "required only" plus "missing
    // Blood Group" is a contradiction, and answering it with rows would be a lie.
    const scopeFields = fieldsForScope(params.fieldScope);
    const missingFieldInScope =
      params.missingField && scopeFields.includes(params.missingField)
        ? params.missingField
        : undefined;

    // BEFORE the query, not after. A missingField outside the active scope can
    // only match nothing — and the query we would have awaited is the WIDEST
    // variant, carrying no missing-field predicate at all. Running it just to
    // throw the rows away is the same sin as the count:'exact' this rewrite
    // removed, against an 8s statement_timeout on a table with a history of
    // 57014 on unbounded scans. `totalPages: 1` matches the normal empty case
    // below (`Math.max(1, …)`), so a pager never renders "Page 1 of 0".
    if (params.missingField && !missingFieldInScope) {
      return NextResponse.json(
        { profiles: [], total: 0, page: params.page, limit: params.limit, totalPages: 1 },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (missingFieldInScope) {
      query = query.or(missingColumnFilter(missingFieldInScope));
    }

    const { data: narrowRows, error } = await query.range(0, PHASE_1_HARD_CAP - 1);

    if (error) {
      console.error('[api/staff/incomplete-profiles] Phase 1 query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch employee profiles', details: error.message },
        { status: 500 }
      );
    }

    // `total` and `totalPages` are derived from this array's length, so a cap
    // hit silently produces a confidently wrong page count. PostgREST also
    // applies its own db-max-rows (Supabase default 1000) with no error at all,
    // and `staff` is already 866 rows — so bound it explicitly and say so.
    if ((narrowRows?.length ?? 0) >= PHASE_1_HARD_CAP) {
      console.warn(
        '[api/staff/incomplete-profiles] Phase 1 hit the %d-row cap; total and totalPages are undercounts.',
        PHASE_1_HARD_CAP
      );
    }

    // ---------- Compute, filter, sort in JS ----------
    const computed = (narrowRows || [])
      .map((row: any) => {
        const missingFields = computeMissingFields(row, params.fieldScope);
        return { ...row, missingFields, missing_count: missingFields.length };
      })
      .filter((row) => row.missing_count > 0)
      .filter((row) => matchesSearch(row, params.search));

    computed.sort((a, b) => compareIncompleteRows(a, b, params.sortBy, params.sortOrder));

    const total = computed.length;
    const totalPages = Math.max(1, Math.ceil(total / params.limit));
    const offset = (params.page - 1) * params.limit;
    const pageRows = computed.slice(offset, offset + params.limit);

    // ---------- Phase 2: hydrate the visible page only ----------
    const nameById = new Map<string, any>();
    const machineNameById = new Map<string, string>();

    if (pageRows.length > 0) {
      const pageIds = pageRows.map((row) => row.id);

      const { data: hydrated, error: hydrateError } = await supabase
        .from('staff')
        .select(HYDRATE_COLUMNS)
        .in('id', pageIds);

      if (hydrateError) {
        // Degrade to un-named rows rather than failing the page: the missing
        // fields, which are the point of this table, are already computed.
        console.error('[api/staff/incomplete-profiles] Phase 2 hydrate error:', hydrateError);
      } else {
        for (const row of hydrated || []) nameById.set((row as any).id, row);
      }

      // Biometric machines are institution-type entities with no FK from
      // staff (dropped 2026-08-06), so they need their own lookup.
      const machineIds = Array.from(
        new Set(pageRows.map((row) => row.biometric_institution_id).filter(Boolean))
      ) as string[];

      if (machineIds.length > 0) {
        const { data: machines, error: machineError } = await supabase
          .from('institutions')
          .select('id, name')
          .in('id', machineIds);

        if (machineError) {
          console.error('[api/staff/incomplete-profiles] Machine lookup error:', machineError);
        } else {
          for (const machine of machines || []) {
            machineNameById.set(machine.id, machine.name);
          }
        }
      }
    }

    const profiles: IncompleteStaffDetail[] = pageRows.map((row) => {
      const joined: any = nameById.get(row.id) ?? {};
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        designation: row.designation,
        staff_id: row.staff_id,
        institution_email: row.institution_email,
        is_active: row.is_active,
        created_at: row.created_at,
        missingFields: row.missingFields,
        missing_count: row.missing_count,
        institution_name: joined.institution?.name ?? null,
        department_id: row.department_id ?? null,
        department_name: joined.department?.department_name ?? null,
        category_name: joined.category?.category_name ?? null,
        biometric_id: row.biometric_id ?? null,
        biometric_machine_name: row.biometric_institution_id
          ? machineNameById.get(row.biometric_institution_id) ?? null
          : null,
      };
    });

    return NextResponse.json(
      { profiles, total, page: params.page, limit: params.limit, totalPages },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[api/staff/incomplete-profiles] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch incomplete employee profiles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify the pure modules still pass**

Run: `npx vitest run __tests__/lib/utils/staff/`
Expected: PASS — 50 tests across 2 files.

- [ ] **Step 3: Commit**

```bash
git add app/api/staff/incomplete-profiles/route.ts
git commit -m "$(cat <<'EOF'
feat(staff): server-side filters and paging for incomplete employee profiles

Two-phase query: a narrow filtered fetch that yields an exact total, then a
join-hydrate of only the visible page. Drops the count:'exact' that was
computed and discarded on every request.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Filter-options endpoint

**Files:**
- Create: `app/api/staff/incomplete-profiles/options/route.ts`

**Interfaces:**
- Consumes: `IncompleteStaffFilterOptions`, `StaffFilterOption` (Task 3).
- Produces: `GET /api/staff/incomplete-profiles/options?institutionId=` returning `IncompleteStaffFilterOptions`.

- [ ] **Step 1: Write the route**

Create `app/api/staff/incomplete-profiles/options/route.ts`:

```ts
export const dynamic = 'force-dynamic';

// ============================================
// STAFF INCOMPLETE PROFILES — FILTER OPTIONS
// ============================================
// Created: 2026-08-10
// Dropdown lists for the incomplete-profiles filter bar.
//
// Only lists that must be DERIVED FROM DATA live here: designation (183
// distinct values in production), blood group, gender and marital status are
// free-text columns with no lookup table, and the biometric machines are only
// discoverable through the staff rows that reference them. Institution,
// department and employment category come from their own services on the
// client, which is how the rest of the app builds those pickers.
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { IncompleteStaffFilterOptions, StaffFilterOption } from '@/types/staff';

/** Enough to cover every distinct value at current scale with headroom. */
const MAX_ROWS = 5000;

/** Distinct, non-blank, alphabetically ordered options from a column. */
function distinctOptions(rows: any[], column: string): StaffFilterOption[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row?.[column];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((value) => ({ value, label: value }));
}

/** 'full_time' -> 'Full Time'. These columns store lowercase snake_case. */
function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const institutionId = request.nextUrl.searchParams.get('institutionId');

    let query = supabase
      .from('staff')
      .select('designation, blood_group, gender, marital_status, biometric_institution_id')
      .limit(MAX_ROWS);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    } else if (profile.institution_id) {
      query = query.eq('institution_id', profile.institution_id);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('[api/staff/incomplete-profiles/options] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch filter options', details: error.message },
        { status: 500 }
      );
    }

    const safeRows = rows || [];

    // A truncated scan yields dropdowns that silently omit real values — a
    // designation that exists in the data simply is not offered, with no signal
    // anywhere. `>=` because .limit() returns at most exactly MAX_ROWS, so `>`
    // could never fire and would read as protection while providing none.
    // Mirrors the PHASE_1_HARD_CAP warning in the sibling route.
    if (safeRows.length >= MAX_ROWS) {
      console.warn(
        '[api/staff/incomplete-profiles/options] Hit the %d-row cap; filter option lists may be incomplete.',
        MAX_ROWS
      );
    }

    // Only machines actually referenced by an employee in scope — the
    // institutions table also holds real colleges, which are not machines.
    const machineIds = Array.from(
      new Set(
        safeRows
          .map((row: any) => row.biometric_institution_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    let biometricMachines: StaffFilterOption[] = [];
    if (machineIds.length > 0) {
      const { data: machines, error: machineError } = await supabase
        .from('institutions')
        .select('id, name')
        .in('id', machineIds)
        .order('name', { ascending: true });

      if (machineError) {
        // A missing machine list must not cost the user every other dropdown.
        console.error('[api/staff/incomplete-profiles/options] Machine lookup error:', machineError);
      } else {
        biometricMachines = (machines || []).map((machine: any) => ({
          value: machine.id,
          label: machine.name,
        }));
      }
    }

    const payload: IncompleteStaffFilterOptions = {
      designations: distinctOptions(safeRows, 'designation'),
      bloodGroups: distinctOptions(safeRows, 'blood_group'),
      genders: distinctOptions(safeRows, 'gender').map((option) => ({
        value: option.value,
        label: titleCase(option.value),
      })),
      maritalStatuses: distinctOptions(safeRows, 'marital_status').map((option) => ({
        value: option.value,
        label: titleCase(option.value),
      })),
      biometricMachines,
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[api/staff/incomplete-profiles/options] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch filter options',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/staff/incomplete-profiles/options/route.ts
git commit -m "$(cat <<'EOF'
feat(staff): add the incomplete-profiles filter options endpoint

Designation, blood group, gender and marital status are free-text columns with
no lookup table, so their dropdowns have to be derived from the data.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Data hooks

**Files:**
- Modify: `hooks/staff/use-staff.ts` — replace `useIncompleteStaffProfiles` (currently lines 238-267, at the end of the file).

**Interfaces:**
- Consumes: `buildIncompleteStaffQuery`, `IncompleteStaffQuery` (Task 2); `IncompleteStaffResponse`, `IncompleteStaffFilterOptions` (Task 3).
- Produces: `fetchIncompleteStaffProfiles(query): Promise<IncompleteStaffResponse>`, `useIncompleteStaffFilterOptions(institutionId?)`.

- [ ] **Step 1: Add the imports**

At the top of `hooks/staff/use-staff.ts`, extend the existing `@/types/staff` import with `IncompleteStaffFilterOptions` and add the filter-module import:

```ts
import {
  Staff,
  StaffFilters,
  StaffListResponse,
  CreateStaffDto,
  UpdateStaffDto,
  StaffDashboardFilters,
  StaffDashboardStats,
  IncompleteStaffResponse,
  IncompleteStaffFilterOptions
} from '@/types/staff';
import {
  buildIncompleteStaffQuery,
  type IncompleteStaffQuery
} from '@/lib/utils/staff/incomplete-profile-filters';
```

- [ ] **Step 2: Replace the existing hook**

Delete the whole `useIncompleteStaffProfiles` function (lines 238-267) and append:

```ts
/**
 * Fetch one page of employees with incomplete profiles.
 *
 * Exported as a plain function, not only a hook: the shared DataTable owns
 * page / pageSize / search / sort and calls a fetch callback, so the table
 * cannot drive a useQuery.
 */
export async function fetchIncompleteStaffProfiles(
  query: IncompleteStaffQuery
): Promise<IncompleteStaffResponse> {
  const res = await fetch(
    `/api/staff/incomplete-profiles?${buildIncompleteStaffQuery(query)}`
  );
  if (!res.ok) {
    throw new Error('Failed to fetch incomplete employee profiles');
  }
  return res.json();
}

/**
 * Dropdown lists for the incomplete-profiles filter bar. Keyed on institution
 * only, so paging or changing any other filter never refetches them.
 */
export function useIncompleteStaffFilterOptions(
  institutionId?: string,
  options?: Omit<
    import('@tanstack/react-query').UseQueryOptions<IncompleteStaffFilterOptions, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<IncompleteStaffFilterOptions, Error>({
    queryKey: ['staff', 'incomplete-profiles', 'options', institutionId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institutionId', institutionId);

      const res = await fetch(
        `/api/staff/incomplete-profiles/options?${params.toString()}`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch employee filter options');
      }
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    ...options
  });
}
```

- [ ] **Step 3: Confirm no stale callers remain**

Run: `npx grep -rn "useIncompleteStaffProfiles" app components hooks` — or use ripgrep: `rg -n "useIncompleteStaffProfiles" app components hooks`
Expected: exactly one hit, `app/(routes)/staff/dashboard/_components/profile-analytics.tsx:49` (the import), which Task 10 removes.

- [ ] **Step 4: Commit**

```bash
git add hooks/staff/use-staff.ts
git commit -m "$(cat <<'EOF'
feat(staff): add paged fetch and options hooks for incomplete profiles

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Table columns and export config

**Files:**
- Create: `app/(routes)/staff/dashboard/_components/incomplete-staff-columns.tsx`

**Interfaces:**
- Consumes: `IncompleteStaffDetail` (Task 3).
- Produces: `MISSING_FIELD_COLORS`, `incompleteStaffColumns: ColumnDef<IncompleteStaffDetail>[]`, `INCOMPLETE_STAFF_EXPORT_MAPPING`, `INCOMPLETE_STAFF_EXPORT_HEADERS`, `INCOMPLETE_STAFF_EXPORT_WIDTHS`, `INCOMPLETE_STAFF_PDF_HEADERS`, `transformIncompleteStaffForExport(row)`.

- [ ] **Step 1: Write the file**

Create `app/(routes)/staff/dashboard/_components/incomplete-staff-columns.tsx`:

```tsx
'use client';
// ============================================
// INCOMPLETE EMPLOYEE PROFILES — COLUMNS
// ============================================
// Created: 2026-08-10
// Column definitions and export schema for the Profile Analytics drill-down.
// ============================================

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import type { IncompleteStaffDetail } from '@/types/staff';

/** Badge colour per missing-field label, grouped by field family. */
export const MISSING_FIELD_COLORS: Record<string, string> = {
  // Required — warmer, more urgent
  'First Name': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'Last Name': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Email: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Phone: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Designation: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Date of Birth': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Date of Joining': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  // Optional — cooler, less urgent
  'Staff ID': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  'Profile Picture': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  Address: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  State: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  District: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  Pincode: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Institution Email': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Blood Group': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
};

function Empty() {
  return <span className='text-muted-foreground italic'>—</span>;
}

/**
 * Sorting is server-side (`manualSorting`) against an allowlist of real `staff`
 * columns. Columns backed by an embedded join — department, institution,
 * category, biometric machine — therefore opt out of sorting, so the header
 * never offers an order the API silently ignores.
 */
export const incompleteStaffColumns: ColumnDef<IncompleteStaffDetail>[] = [
  {
    accessorKey: 'first_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell: ({ row }) => (
      <div className='min-w-0'>
        <p className='truncate font-medium'>
          {row.original.first_name} {row.original.last_name}
        </p>
        <p className='truncate text-xs text-muted-foreground'>{row.original.email}</p>
        {row.original.staff_id && (
          <p className='truncate text-xs text-muted-foreground'>{row.original.staff_id}</p>
        )}
      </div>
    ),
    size: 240,
    minSize: 160,
  },
  {
    accessorKey: 'designation',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Designation' />,
    cell: ({ row }) =>
      row.original.designation ? (
        <span className='text-sm'>{row.original.designation}</span>
      ) : (
        <Empty />
      ),
    size: 180,
  },
  {
    id: 'department_name',
    accessorKey: 'department_name',
    header: 'Department',
    enableSorting: false,
    cell: ({ row }) => (
      <div className='min-w-0'>
        {row.original.department_name ? (
          <span className='text-sm'>{row.original.department_name}</span>
        ) : (
          <Empty />
        )}
        {row.original.institution_name && (
          <p className='truncate text-xs text-muted-foreground'>
            {row.original.institution_name}
          </p>
        )}
      </div>
    ),
    size: 200,
  },
  {
    id: 'category_name',
    accessorKey: 'category_name',
    header: 'Category',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.category_name ? (
        <span className='text-sm'>{row.original.category_name}</span>
      ) : (
        <Empty />
      ),
    size: 160,
  },
  {
    accessorKey: 'biometric_id',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Biometric' />,
    cell: ({ row }) =>
      row.original.biometric_id ? (
        <div className='min-w-0'>
          <span className='font-mono text-sm'>{row.original.biometric_id}</span>
          {row.original.biometric_machine_name && (
            <p className='truncate text-xs text-muted-foreground'>
              {row.original.biometric_machine_name}
            </p>
          )}
        </div>
      ) : (
        <Empty />
      ),
    size: 160,
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge
          variant='secondary'
          className='bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        >
          <CheckCircle2 className='mr-1 h-3 w-3' />
          Active
        </Badge>
      ) : (
        <Badge
          variant='secondary'
          className='bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300'
        >
          <XCircle className='mr-1 h-3 w-3' />
          Inactive
        </Badge>
      ),
    size: 120,
  },
  {
    // id MUST equal the accessorKey here. TanStack keys sort state off the
    // column `id` (data-export.tsx:84 reads `sorting[0].id`), and the shared
    // exporter's visibility filter (data-export.tsx:170-172) matches export
    // header keys against column ids. An id of 'missingFields' would send a
    // sortBy the API does not allowlist — silently coerced to DEFAULT_SORT_BY,
    // which merely HAPPENS to be missing_count today — and would make both
    // export keys look transform-only, so hiding this column would not drop it
    // from the export.
    id: 'missing_count',
    accessorKey: 'missing_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Missing Fields' />
    ),
    cell: ({ row }) => (
      <div className='flex max-w-[320px] flex-wrap gap-1'>
        {row.original.missingFields.map((field) => (
          <Badge
            key={field}
            variant='secondary'
            className={`text-xs ${MISSING_FIELD_COLORS[field] || ''}`}
          >
            {field}
          </Badge>
        ))}
      </div>
    ),
    size: 340,
    minSize: 200,
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <Button variant='ghost' size='icon' asChild>
        <Link href={`/staff/list/${row.original.id}`} aria-label='View employee'>
          <Eye className='h-4 w-4' />
        </Link>
      </Button>
    ),
    size: 60,
  },
];

/**
 * Keys are DATA keys, values are the spreadsheet headers. Getting this
 * backwards produces a file with the right header row and zero columns of data
 * — and the export still reports success.
 */
export const INCOMPLETE_STAFF_EXPORT_MAPPING: Record<string, string> = {
  first_name: 'Name',
  staff_id: 'Staff ID',
  email: 'Email',
  designation: 'Designation',
  department_name: 'Department',
  institution_name: 'Institution',
  category_name: 'Category',
  biometric_id: 'Biometric Code',
  biometric_machine_name: 'Biometric Machine',
  is_active: 'Status',
  missing_count: 'Missing Count',
  missing_fields_label: 'Missing Fields',
};

export const INCOMPLETE_STAFF_EXPORT_HEADERS = Object.keys(
  INCOMPLETE_STAFF_EXPORT_MAPPING
);

/** Positional — must stay in the same order as the mapping's keys. */
export const INCOMPLETE_STAFF_EXPORT_WIDTHS = [
  { wch: 28 }, // Name
  { wch: 14 }, // Staff ID
  { wch: 32 }, // Email
  { wch: 26 }, // Designation
  { wch: 26 }, // Department
  { wch: 30 }, // Institution
  { wch: 22 }, // Category
  { wch: 16 }, // Biometric Code
  { wch: 26 }, // Biometric Machine
  { wch: 12 }, // Status
  { wch: 14 }, // Missing Count
  { wch: 48 }, // Missing Fields
];

/**
 * A PDF page fits far fewer columns than a spreadsheet, so it prints a curated
 * subset. These keys bypass column visibility, which is how a column hidden in
 * the UI can still reach the PDF.
 */
export const INCOMPLETE_STAFF_PDF_HEADERS = [
  'first_name',
  'staff_id',
  'designation',
  'department_name',
  'missing_fields_label',
];

/** Applied to every exported row across CSV / XLSX / PDF. */
export function transformIncompleteStaffForExport(
  row: IncompleteStaffDetail
): Record<string, string | number | boolean | null | undefined> {
  return {
    first_name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    staff_id: row.staff_id ?? '',
    email: row.email ?? '',
    designation: row.designation ?? '',
    department_name: row.department_name ?? '',
    institution_name: row.institution_name ?? '',
    category_name: row.category_name ?? '',
    biometric_id: row.biometric_id ?? '',
    biometric_machine_name: row.biometric_machine_name ?? '',
    is_active: row.is_active ? 'Active' : 'Inactive',
    missing_count: row.missing_count ?? 0,
    missing_fields_label: (row.missingFields ?? []).join(', '),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(routes)/staff/dashboard/_components/incomplete-staff-columns.tsx"
git commit -m "$(cat <<'EOF'
feat(staff): add columns and export schema for the incomplete-profiles table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Filter bar component

**Files:**
- Create: `app/(routes)/staff/dashboard/_components/incomplete-staff-filters.tsx`

**Interfaces:**
- Consumes: `ALL`, `FIELD_MISSING`, `FIELD_ASSIGNED`, `IncompleteStaffFilterState`, `DEFAULT_INCOMPLETE_STAFF_FILTERS`, `applyFilterPatch`, `countActiveFilters` (Task 2); `STAFF_FIELD_LABELS`, `STAFF_REQUIRED_FIELDS`, `STAFF_OPTIONAL_FIELDS`, `fieldsForScope` (Task 1); `IncompleteStaffFilterOptions` (Task 3).
- Produces: `<IncompleteStaffFilters value onChange options optionsLoading />`.

- [ ] **Step 1: Write the file**

Create `app/(routes)/staff/dashboard/_components/incomplete-staff-filters.tsx`:

```tsx
'use client';
// ============================================
// INCOMPLETE EMPLOYEE PROFILES — FILTER BAR
// ============================================
// Created: 2026-08-10
// Fifteen controls in flow order: Field Scope > Missing Field > Institution >
// Department > Category > Designation > Status > Record Status > Gender >
// Marital Status > Blood Group > Joined From/To > Staff ID > Biometric Code >
// Biometric Machine.
//
// Only Institution -> Department cascades. Everything else is independent, so
// a filter stays usable at "All institutions".
//
// Employment Type and Role Type are deliberately absent: production holds a
// single value for each (full_time / teacher, 866 rows), so the control could
// never change a result set.
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { CategoryService } from '@/lib/services/staff/category-service';
import {
  ALL,
  FIELD_ASSIGNED,
  FIELD_MISSING,
  applyFilterPatch,
  countActiveFilters,
  DEFAULT_INCOMPLETE_STAFF_FILTERS,
  type IncompleteStaffFilterState,
} from '@/lib/utils/staff/incomplete-profile-filters';
import {
  STAFF_FIELD_LABELS,
  STAFF_OPTIONAL_FIELDS,
  STAFF_REQUIRED_FIELDS,
  fieldsForScope,
} from '@/lib/utils/staff/incomplete-profile-fields';
import type { IncompleteStaffFilterOptions, StaffFilterOption } from '@/types/staff';

/** A real id — neither "All" nor the "Not set" sentinel. */
function isConcreteId(value: string): boolean {
  return value !== ALL && value !== FIELD_MISSING;
}

/**
 * Prefix a list with "All …" and "Not set".
 *
 * "Not set" is offered at every level and never depends on the level above:
 * "employees with no department" must be askable without first naming an
 * institution, and 328 of the 866 production rows are in exactly that state.
 */
function withSentinels(
  options: StaffFilterOption[] | undefined,
  allLabel: string
): StaffFilterOption[] {
  return [
    { value: ALL, label: allLabel },
    { value: FIELD_MISSING, label: 'Not set (missing)' },
    ...(options ?? []),
  ];
}

const loadDepartments = (institutionId: string): Promise<StaffFilterOption[]> =>
  DepartmentService.getDepartmentsByInstitution(institutionId).then((rows: any[]) =>
    (rows || []).map((row) => ({ value: row.id, label: row.department_name }))
  );

/**
 * One cascade level. The loaded list is cached WITH the parent it belongs to
 * and gated on that parent still matching, so switching parents never flashes
 * the previous parent's children, and clearing is derived rather than stored
 * (no setState in the effect body, no cascading second render).
 */
function useCascadeOptions(
  parentId: string,
  load: (parentId: string) => Promise<StaffFilterOption[]>,
  label: string
): { options: StaffFilterOption[]; loading: boolean } {
  const [cache, setCache] = useState<{ parent: string; options: StaffFilterOption[] }>({
    parent: '',
    options: [],
  });

  useEffect(() => {
    if (!isConcreteId(parentId)) return;
    if (cache.parent === parentId) return;
    let ignore = false;
    load(parentId)
      .then((options) => {
        if (!ignore) setCache({ parent: parentId, options });
      })
      .catch((error) => {
        if (ignore) return;
        console.error(`[staff/dashboard] Error fetching ${label}:`, error);
        // Stamp the parent even on failure so `loading` resolves instead of
        // spinning forever on a level whose fetch errored.
        setCache({ parent: parentId, options: [] });
      });
    return () => {
      ignore = true;
    };
  }, [parentId, load, label, cache.parent]);

  const settled = cache.parent === parentId;
  return {
    options: settled ? cache.options : [],
    loading: isConcreteId(parentId) && !settled,
  };
}

interface IncompleteStaffFiltersProps {
  value: IncompleteStaffFilterState;
  onChange: (next: IncompleteStaffFilterState) => void;
  options: IncompleteStaffFilterOptions | undefined;
  optionsLoading: boolean;
}

export function IncompleteStaffFilters({
  value,
  onChange,
  options,
  optionsLoading,
}: IncompleteStaffFiltersProps) {
  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess();
  const { options: departments, loading: loadingDepartments } = useCascadeOptions(
    value.institutionId,
    loadDepartments,
    'departments'
  );

  const [categories, setCategories] = useState<StaffFilterOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    let ignore = false;
    CategoryService.getCategories({ isActive: true, limit: 100 })
      .then((result: any) => {
        if (ignore) return;
        const rows = result?.data ?? result ?? [];
        setCategories(
          (rows as any[]).map((row) => ({ value: row.id, label: row.category_name }))
        );
      })
      .catch((error) => {
        if (!ignore) console.error('[staff/dashboard] Error fetching categories:', error);
      })
      .finally(() => {
        if (!ignore) setLoadingCategories(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const set = (patch: Partial<IncompleteStaffFilterState>) =>
    onChange(applyFilterPatch(value, patch));

  const institutionOptions = useMemo<StaffFilterOption[]>(
    () => [
      { value: ALL, label: 'All institutions' },
      ...institutions.map((institution) => ({
        value: institution.id,
        label: institution.name,
      })),
    ],
    [institutions]
  );

  // Only fields inside the active scope can be missing, so offering the others
  // would be offering a guaranteed-empty result.
  const missingFieldOptions = useMemo(
    () => fieldsForScope(value.fieldScope).map((field) => ({
      value: field,
      label: STAFF_FIELD_LABELS[field] ?? field,
    })),
    [value.fieldScope]
  );

  const activeFilterCount = countActiveFilters(value);

  return (
    <div className='rounded-lg border bg-muted/30 p-4'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <SlidersHorizontal className='h-4 w-4 text-muted-foreground' />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant='secondary' className='text-xs'>
              {activeFilterCount} active
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant='ghost'
            size='sm'
            className='h-8'
            onClick={() => onChange(DEFAULT_INCOMPLETE_STAFF_FILTERS)}
          >
            <RotateCcw className='mr-2 h-3.5 w-3.5' />
            Clear Filters
          </Button>
        )}
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {/* 1. Field Scope */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Field Scope</Label>
          <Select
            value={value.fieldScope}
            onValueChange={(next) => {
              const fieldScope = next as IncompleteStaffFilterState['fieldScope'];
              // A field outside the new scope can never be missing within it,
              // so carrying the selection over would guarantee an empty table.
              const stillInScope =
                value.missingField === ALL ||
                fieldsForScope(fieldScope).includes(value.missingField);
              set({ fieldScope, missingField: stillInScope ? value.missingField : ALL });
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All tracked fields ({STAFF_REQUIRED_FIELDS.length + STAFF_OPTIONAL_FIELDS.length})</SelectItem>
              <SelectItem value='required'>Required only ({STAFF_REQUIRED_FIELDS.length})</SelectItem>
              <SelectItem value='optional'>Optional only ({STAFF_OPTIONAL_FIELDS.length})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 2. Missing Field */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Missing Field</Label>
          <SearchableSelect
            value={value.missingField}
            onValueChange={(next) => set({ missingField: next })}
            options={[{ value: ALL, label: 'Any missing field' }, ...missingFieldOptions]}
            placeholder='Any missing field'
            searchPlaceholder='Search fields…'
            className='w-full'
          />
        </div>

        {/* 3. Institution */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Institution</Label>
          <SearchableSelect
            value={value.institutionId}
            onValueChange={(next) => set({ institutionId: next })}
            options={institutionOptions}
            loading={loadingInstitutions}
            placeholder='All institutions'
            searchPlaceholder='Search institutions…'
            className='w-full'
          />
        </div>

        {/* 4. Department */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Department</Label>
          <SearchableSelect
            value={value.departmentId}
            onValueChange={(next) => set({ departmentId: next })}
            options={withSentinels(departments, 'All departments')}
            loading={loadingDepartments}
            placeholder='All departments'
            searchPlaceholder={
              isConcreteId(value.institutionId)
                ? 'Search departments…'
                : 'Pick an institution to list departments'
            }
            className='w-full'
          />
        </div>

        {/* 5. Employment Category */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Employment Category</Label>
          <SearchableSelect
            value={value.categoryId}
            onValueChange={(next) => set({ categoryId: next })}
            options={withSentinels(categories, 'All categories')}
            loading={loadingCategories}
            placeholder='All categories'
            searchPlaceholder='Search categories…'
            className='w-full'
          />
        </div>

        {/* 6. Designation */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Designation</Label>
          <SearchableSelect
            value={value.designation}
            onValueChange={(next) => set({ designation: next })}
            // No "Not set" here: `designation` is one of the 15 tracked
            // completion fields, so Missing Field -> Designation already answers
            // that question through a correctly-wired path. A second, separate
            // route to the same question is redundant.
            options={[
              { value: ALL, label: 'All designations' },
              ...(options?.designations ?? []),
            ]}
            loading={optionsLoading}
            placeholder='All designations'
            searchPlaceholder='Search designations…'
            className='w-full'
          />
        </div>

        {/* 7. Status */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Status</Label>
          <Select value={value.isActive} onValueChange={(next) => set({ isActive: next })}>
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value='active'>Active</SelectItem>
              <SelectItem value='inactive'>Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 8. Record Status — the publishing state, not employment */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Record Status</Label>
          <Select
            value={value.recordStatus}
            onValueChange={(next) => set({ recordStatus: next })}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All records</SelectItem>
              <SelectItem value='draft'>Draft</SelectItem>
              <SelectItem value='published'>Published</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 9. Gender */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Gender</Label>
          <SearchableSelect
            value={value.gender}
            onValueChange={(next) => set({ gender: next })}
            options={withSentinels(options?.genders, 'All genders')}
            loading={optionsLoading}
            placeholder='All genders'
            searchPlaceholder='Search…'
            className='w-full'
          />
        </div>

        {/* 10. Marital Status */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Marital Status</Label>
          <SearchableSelect
            value={value.maritalStatus}
            onValueChange={(next) => set({ maritalStatus: next })}
            options={withSentinels(options?.maritalStatuses, 'All marital statuses')}
            loading={optionsLoading}
            placeholder='All marital statuses'
            searchPlaceholder='Search…'
            className='w-full'
          />
        </div>

        {/* 11. Blood Group */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Blood Group</Label>
          <SearchableSelect
            value={value.bloodGroup}
            onValueChange={(next) => set({ bloodGroup: next })}
            options={withSentinels(options?.bloodGroups, 'All blood groups')}
            loading={optionsLoading}
            placeholder='All blood groups'
            searchPlaceholder='Search…'
            className='w-full'
          />
        </div>

        {/* 12. Joined between */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Joined Between</Label>
          <div className='flex items-center gap-2'>
            <Input
              type='date'
              value={value.joinedFrom}
              onChange={(event) => set({ joinedFrom: event.target.value })}
              className='w-full'
              aria-label='Joined from'
            />
            <span className='text-xs text-muted-foreground'>to</span>
            <Input
              type='date'
              value={value.joinedTo}
              onChange={(event) => set({ joinedTo: event.target.value })}
              className='w-full'
              aria-label='Joined to'
            />
          </div>
        </div>

        {/* 13. Staff ID */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Staff ID</Label>
          <div className='flex items-center gap-2'>
            <Input
              value={value.staffIdQuery === FIELD_MISSING ? '' : value.staffIdQuery}
              onChange={(event) => set({ staffIdQuery: event.target.value })}
              placeholder='Contains…'
              disabled={value.staffIdQuery === FIELD_MISSING}
              className='w-full'
            />
            <Button
              type='button'
              variant={value.staffIdQuery === FIELD_MISSING ? 'default' : 'outline'}
              size='sm'
              className='shrink-0'
              onClick={() =>
                set({
                  staffIdQuery: value.staffIdQuery === FIELD_MISSING ? '' : FIELD_MISSING,
                })
              }
            >
              Not set
            </Button>
          </div>
        </div>

        {/* 14. Biometric Code */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Biometric Code</Label>
          <div className='flex items-center gap-2'>
            <Input
              value={
                value.biometricCode === FIELD_MISSING || value.biometricCode === FIELD_ASSIGNED
                  ? ''
                  : value.biometricCode
              }
              onChange={(event) => set({ biometricCode: event.target.value })}
              placeholder='Contains…'
              disabled={
                value.biometricCode === FIELD_MISSING || value.biometricCode === FIELD_ASSIGNED
              }
              className='w-full'
            />
            <Select
              value={
                value.biometricCode === FIELD_MISSING || value.biometricCode === FIELD_ASSIGNED
                  ? value.biometricCode
                  : ALL
              }
              onValueChange={(next) => set({ biometricCode: next === ALL ? '' : next })}
            >
              <SelectTrigger className='w-[120px] shrink-0'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any</SelectItem>
                <SelectItem value={FIELD_ASSIGNED}>Enrolled</SelectItem>
                <SelectItem value={FIELD_MISSING}>Not set</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 15. Biometric Machine */}
        <div className='min-w-0 space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Biometric Machine</Label>
          <SearchableSelect
            value={value.biometricMachineId}
            onValueChange={(next) => set({ biometricMachineId: next })}
            options={withSentinels(options?.biometricMachines, 'All machines')}
            loading={optionsLoading}
            placeholder='All machines'
            searchPlaceholder='Search machines…'
            className='w-full'
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm the CategoryService signature matches**

Run: `rg -n "static async getCategories" -A 8 lib/services/staff/category-service.ts`
Expected: a method accepting an options object and returning either an array or `{ data }`. If its actual shape differs from the `result?.data ?? result ?? []` handling above, adjust that one line to match — do not change the service.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/staff/dashboard/_components/incomplete-staff-filters.tsx"
git commit -m "$(cat <<'EOF'
feat(staff): add the incomplete-profiles filter bar

Fifteen controls; only Institution -> Department cascades. Employment Type and
Role Type are omitted — each holds a single value across all 866 rows, so the
control could never change a result set.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Table component

**Files:**
- Create: `app/(routes)/staff/dashboard/_components/incomplete-staff-table.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 6, 7, 8; `StaffDashboardFilters` from `@/types/staff`.
- Produces: `<IncompleteStaffTable filters={StaffDashboardFilters | undefined} />`.

- [ ] **Step 1: Write the file**

Create `app/(routes)/staff/dashboard/_components/incomplete-staff-table.tsx`:

```tsx
'use client';
// ============================================
// INCOMPLETE EMPLOYEE PROFILES — DRILL-DOWN TABLE
// ============================================
// Created: 2026-08-10
// Replaces the 50-row capped table that lived inside profile-analytics.tsx.
// Server-side paging / search / sort via the shared DataTable, driven by the
// filter bar next door.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DataTable,
  type DataFetchParams,
  type DataFetchResult,
} from '@/components/data-table/data-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { fetchIncompleteStaffProfiles, useIncompleteStaffFilterOptions } from '@/hooks/staff/use-staff';
import {
  ALL,
  DEFAULT_INCOMPLETE_STAFF_FILTERS,
  type IncompleteStaffFilterState,
} from '@/lib/utils/staff/incomplete-profile-filters';
import { STAFF_FIELD_LABELS } from '@/lib/utils/staff/incomplete-profile-fields';
import type { IncompleteStaffDetail, StaffDashboardFilters } from '@/types/staff';
import { IncompleteStaffFilters } from './incomplete-staff-filters';
import {
  incompleteStaffColumns,
  transformIncompleteStaffForExport,
  INCOMPLETE_STAFF_EXPORT_HEADERS,
  INCOMPLETE_STAFF_EXPORT_MAPPING,
  INCOMPLETE_STAFF_EXPORT_WIDTHS,
  INCOMPLETE_STAFF_PDF_HEADERS,
} from './incomplete-staff-columns';

/** `all` -> undefined, so the query string omits the param entirely. */
function omitAll(value: string): string | undefined {
  return value === ALL ? undefined : value;
}

/**
 * Debounce a value. Text inputs feed the fetch callback's identity, and the
 * DataTable re-runs its fetch effect whenever that identity changes — so an
 * undebounced input fires one request per keystroke.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface IncompleteStaffTableProps {
  filters?: StaffDashboardFilters;
}

export function IncompleteStaffTable({ filters }: IncompleteStaffTableProps) {
  const [fieldFilters, setFieldFilters] = useState<IncompleteStaffFilterState>(
    DEFAULT_INCOMPLETE_STAFF_FILTERS
  );

  // The table's own pickers narrow the scope inherited from the dashboard bar.
  // "All institutions" here means "whatever the dashboard already allows" — not
  // every institution in the system, which RLS would not return anyway.
  const institutionId = omitAll(fieldFilters.institutionId) ?? filters?.institutionId;
  const departmentId = omitAll(fieldFilters.departmentId) ?? filters?.departmentId;
  const categoryId = omitAll(fieldFilters.categoryId) ?? filters?.categoryId;

  const { data: options, isLoading: optionsLoading } = useIncompleteStaffFilterOptions(
    // Options are keyed on the institution only, so paging never refetches them.
    fieldFilters.institutionId !== ALL && fieldFilters.institutionId !== '__missing__'
      ? fieldFilters.institutionId
      : filters?.institutionId
  );

  const debouncedStaffId = useDebouncedValue(fieldFilters.staffIdQuery, 300);
  const debouncedBiometricCode = useDebouncedValue(fieldFilters.biometricCode, 300);

  // Printed under the PDF title so an exported sheet documents its own scope —
  // otherwise a filtered export is indistinguishable from a full one once it
  // has left the app.
  const exportSubtitle = useMemo(() => {
    const parts: string[] = [
      fieldFilters.fieldScope === 'required'
        ? 'Missing required fields'
        : fieldFilters.fieldScope === 'optional'
        ? 'Missing optional fields'
        : 'Missing any tracked field',
    ];
    if (fieldFilters.missingField !== ALL) {
      parts.push(
        `Missing ${STAFF_FIELD_LABELS[fieldFilters.missingField] ?? fieldFilters.missingField}`
      );
    }
    const note = (label: string, value: string) => {
      if (value === ALL || value === '') return;
      parts.push(value === '__missing__' ? `${label}: Not set` : `${label}: filtered`);
    };
    note('Institution', fieldFilters.institutionId);
    note('Department', fieldFilters.departmentId);
    note('Category', fieldFilters.categoryId);
    note('Designation', fieldFilters.designation);
    note('Status', fieldFilters.isActive);
    note('Record Status', fieldFilters.recordStatus);
    note('Gender', fieldFilters.gender);
    note('Marital Status', fieldFilters.maritalStatus);
    note('Blood Group', fieldFilters.bloodGroup);
    note('Biometric Machine', fieldFilters.biometricMachineId);
    if (fieldFilters.joinedFrom || fieldFilters.joinedTo) {
      parts.push(`Joined ${fieldFilters.joinedFrom || '…'} to ${fieldFilters.joinedTo || '…'}`);
    }
    return parts.join(' · ');
  }, [fieldFilters]);

  // Listing every filter in the dep array is what wires them to the table: the
  // DataTable owns page / pageSize / search / sort and re-runs its fetch
  // whenever this callback's identity changes.
  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<IncompleteStaffDetail>> => {
      const response = await fetchIncompleteStaffProfiles({
        institutionId,
        departmentId,
        categoryId,
        fieldScope: fieldFilters.fieldScope,
        missingField: omitAll(fieldFilters.missingField),
        designation: omitAll(fieldFilters.designation),
        isActive: omitAll(fieldFilters.isActive),
        recordStatus: omitAll(fieldFilters.recordStatus),
        gender: omitAll(fieldFilters.gender),
        maritalStatus: omitAll(fieldFilters.maritalStatus),
        bloodGroup: omitAll(fieldFilters.bloodGroup),
        joinedFrom: fieldFilters.joinedFrom || undefined,
        joinedTo: fieldFilters.joinedTo || undefined,
        staffIdQuery: debouncedStaffId || undefined,
        biometricCode: debouncedBiometricCode || undefined,
        biometricMachineId: omitAll(fieldFilters.biometricMachineId),
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
      });

      return {
        success: true,
        data: response.profiles,
        pagination: {
          page: response.page,
          limit: response.limit,
          total_pages: response.totalPages,
          total_items: response.total,
        },
      };
    },
    [
      institutionId,
      departmentId,
      categoryId,
      fieldFilters.fieldScope,
      fieldFilters.missingField,
      fieldFilters.designation,
      fieldFilters.isActive,
      fieldFilters.recordStatus,
      fieldFilters.gender,
      fieldFilters.maritalStatus,
      fieldFilters.bloodGroup,
      fieldFilters.joinedFrom,
      fieldFilters.joinedTo,
      fieldFilters.biometricMachineId,
      debouncedStaffId,
      debouncedBiometricCode,
    ]
  );

  return (
    <Card className='mt-6'>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='min-w-0'>
            <CardTitle className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5 text-orange-600' />
              Employees with Incomplete Profiles
            </CardTitle>
            <CardDescription className='mt-1'>
              Individual employees and the tracked fields they are missing.
              Department and biometric enrolment are filterable here but are not
              counted toward completion, so the percentages above do not move
              when you filter on them.
            </CardDescription>
          </div>
          <Button variant='outline' size='sm' asChild className='shrink-0'>
            <Link href='/staff/list'>
              View All
              <ExternalLink className='ml-1 h-3 w-3' />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        <IncompleteStaffFilters
          value={fieldFilters}
          onChange={setFieldFilters}
          options={options}
          optionsLoading={optionsLoading}
        />

        {fieldFilters.fieldScope === 'required' && (
          <p className='rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground'>
            All seven required fields are currently populated for every employee,
            so this scope is expected to return no rows. Switch to
            <span className='font-medium'> All tracked fields </span>
            or <span className='font-medium'>Optional only</span> to see the real gaps.
          </p>
        )}

        <DataTable
          fetchDataFn={fetchData as any}
          getColumns={() => incompleteStaffColumns as any}
          idField='id'
          exportConfig={{
            entityName: 'incomplete-employee-profiles',
            columnMapping: INCOMPLETE_STAFF_EXPORT_MAPPING,
            columnWidths: INCOMPLETE_STAFF_EXPORT_WIDTHS,
            headers: INCOMPLETE_STAFF_EXPORT_HEADERS,
            transformFunction: transformIncompleteStaffForExport as any,
            // Presence of this object is what puts PDF in the Export menu.
            pdf: {
              headers: INCOMPLETE_STAFF_PDF_HEADERS,
              title: 'Employees with Incomplete Profiles',
              subtitle: exportSubtitle,
              orientation: 'landscape',
            },
          }}
          config={{
            // The dashboard tab selection already owns the query string;
            // letting the table write page/search/sort there too would fight it.
            enableUrlState: false,
            enableRowSelection: false,
            // Joining date is in the filter bar; the built-in picker targets
            // created_at, so an enabled one would be a second, different date.
            enableDateFilter: false,
            enableColumnFilters: false,
            enableSearch: true,
            enableExport: true,
            enableColumnVisibility: true,
            enableColumnResizing: true,
            enableDataSummary: true,
            searchPlaceholder: 'Search name, email, staff ID, biometric code…',
            columnResizingTableId: 'incomplete-staff-detail-table',
            size: 'sm',
          }}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(routes)/staff/dashboard/_components/incomplete-staff-table.tsx"
git commit -m "$(cat <<'EOF'
feat(staff): replace the capped incomplete-profiles list with a paged DataTable

541 of 866 employees have an incomplete profile; the old table showed 50 with
no way to reach the rest.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Wire in, remove the old table, verify

**Files:**
- Modify: `app/(routes)/staff/dashboard/_components/profile-analytics.tsx`

**Interfaces:**
- Consumes: `<IncompleteStaffTable />` (Task 9).
- Produces: nothing new.

- [ ] **Step 1: Delete the old table and its now-unused imports**

In `profile-analytics.tsx`:

1. Delete lines 501-651 — the `INCOMPLETE STAFF DETAIL TABLE` banner comment and the whole `IncompleteStaffTable` function.
2. Delete the `MISSING_FIELD_COLORS` constant (lines 57-76) — it now lives in `incomplete-staff-columns.tsx`.
3. Remove these imports, which only the deleted code used:
   - `Link` from `next/link`
   - the whole `@/components/ui/table` block (`Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`)
   - `Switch` from `@/components/ui/switch`
   - `Label` from `@/components/ui/label`
   - `Button` from `@/components/ui/button`
   - `Loader2`, `ExternalLink`, `Eye` from the `lucide-react` import (keep `User`, `CheckCircle`, `AlertCircle`, `Users`)
   - `useState` from the `react` import (keep `useMemo`)
   - `useIncompleteStaffProfiles` from `@/hooks/staff/use-staff` — delete that import line entirely
4. Add the new import beside the other local ones:

```tsx
import { IncompleteStaffTable } from './incomplete-staff-table';
```

- [ ] **Step 2: Point the tab at the new table**

Line 492 currently reads:

```tsx
              <IncompleteStaffTable filters={filters} />
```

It already has the right name and props, so no change is needed there — the import added in Step 1 now resolves it to the new component instead of the deleted local function. Confirm the JSX still reads exactly:

```tsx
              {/* Incomplete Staff Detail Table */}
              <IncompleteStaffTable filters={filters} />
```

- [ ] **Step 3: Confirm nothing references the deleted symbols**

Run: `rg -n "useIncompleteStaffProfiles|MISSING_FIELD_COLORS" app components hooks lib`
Expected: hits only inside `app/(routes)/staff/dashboard/_components/incomplete-staff-columns.tsx`. No hit in `profile-analytics.tsx` or `hooks/staff/use-staff.ts`.

- [ ] **Step 4: Typecheck the changed files only**

A full-project `tsc` takes 25 minutes and OOMs, and bare `npx tsc` resolves the wrong binary. Create a scoped config at the repo root:

```bash
cat > tsconfig.check.json <<'EOF'
{
  "extends": "./tsconfig.json",
  "include": [
    "lib/utils/staff/incomplete-profile-fields.ts",
    "lib/utils/staff/incomplete-profile-filters.ts",
    "types/staff.ts",
    "hooks/staff/use-staff.ts",
    "app/api/staff/incomplete-profiles/route.ts",
    "app/api/staff/incomplete-profiles/options/route.ts",
    "app/(routes)/staff/dashboard/_components/incomplete-staff-columns.tsx",
    "app/(routes)/staff/dashboard/_components/incomplete-staff-filters.tsx",
    "app/(routes)/staff/dashboard/_components/incomplete-staff-table.tsx",
    "app/(routes)/staff/dashboard/_components/profile-analytics.tsx",
    "next-env.d.ts"
  ]
}
EOF
./node_modules/.bin/tsc --noEmit --pretty -p tsconfig.check.json
```

Expected: no errors. Then delete the scratch config so it is never committed:

```bash
rm tsconfig.check.json
```

- [ ] **Step 5: Lint the changed files**

Run:
```bash
./node_modules/.bin/eslint lib/utils/staff "app/(routes)/staff/dashboard/_components" app/api/staff/incomplete-profiles hooks/staff/use-staff.ts
```
Expected: no errors.

- [ ] **Step 6: Run the full unit suite for this feature**

Run: `npx vitest run __tests__/lib/utils/staff/`
Expected: PASS — 50 tests, 2 files.

- [ ] **Step 7: Verify in the running app**

Start the dev server, sign in, and open `/staff/dashboard` → **Profiles** tab → *Missing Fields*. Confirm each of these against the production baseline in the spec:

| Check | Expected |
|---|---|
| Default view | Table lists employees; the footer count reads **541** (not 50) |
| Field Scope → *Required only* | Zero rows plus the explanatory hint |
| Field Scope → *Optional only* | Still 541 — every gap is in an optional field |
| Missing Field → *Profile Picture* | **504** rows |
| Department → *Not set (missing)* | **328** rows |
| Biometric Code → *Not set* | **403** rows |
| Biometric Machine dropdown | Exactly **7** machines |
| Designation dropdown | Searchable, ~183 entries |
| Search box | Typing a surname narrows the count and does not fire per keystroke |
| Sort by Name | Header toggles asc/desc and the count is unchanged |
| Change Institution | Department resets to "All departments" |
| Export → XLSX | File has 12 populated columns, not just a header row |
| Export → PDF | Subtitle lists the active filters |
| Clear Filters | Badge disappears; count returns to 541 |

- [ ] **Step 8: Commit**

```bash
git add "app/(routes)/staff/dashboard/_components/profile-analytics.tsx"
git commit -m "$(cat <<'EOF'
refactor(staff): move the incomplete-profiles table out of profile-analytics

profile-analytics.tsx was rendering three charts and a data table in one
651-line file; the table now owns its own module alongside its filters and
columns.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 Department/biometric stay out of the definition | 1 (module comment), 8 (`Not set` sentinels), 9 (card description) |
| §3.2 Two-phase API | 4 |
| §3.3 Dead controls dropped | 8 (file header comment) |
| §4 Architecture / file table | All tasks; §4's file list matches the File Structure table above |
| §5 Filter contract + 5.1 rules | 2 (state, cascade, sentinels), 8 (UI), 9 (debounce, override) |
| §6.1 API params, phases, removed count | 4 |
| §6.2 Options endpoint | 5 |
| §7 Table, sorting, export keys, DataTable config | 7, 9 |
| §8 Error handling and empty states | 4 (401/404/phase errors), 5 (options error), 9 (`required` hint); DataTable supplies the generic empty and error rows |
| §9 Testing | 1, 2 (pure-module tests), 10 Step 7 (manual matrix) |
| §10 Rollout: no migration, no flag | No task adds either |

**Deviation from spec §9:** the spec proposed `__tests__/api/staff/incomplete-profiles.test.ts` and a jsdom component test for the filter bar. Both are replaced by node-environment tests against the two pure modules. Reason: `vitest.config.js` runs `environment: 'node'` with jsdom enabled only for three explicitly globbed files, so a component test would require editing shared config, and an API-route test would require mocking the whole Supabase client chain. Every behaviour the spec listed — scope field counts, empty-string-as-missing, sentinel predicates, total-vs-filter-count, limit clamping, search coverage, cascade reset, active-filter count, Clear Filters — is asserted in Tasks 1 and 2 against the modules the route and the component both call. The route's own wiring is covered by Step 7's count matrix, which checks real numbers against the production baseline.

**Placeholder scan:** no TBD/TODO, no "add error handling", no "similar to Task N". Every code step carries complete code.

**Type consistency:** `IncompleteStaffFilterState` field names are identical in Tasks 2, 8, and 9. `staffIdQuery` (state) maps to `staffId` (wire) in exactly one place, `buildIncompleteStaffQuery`, and the round-trip test asserts it. `missing_count` is produced in Task 4, typed in Task 3, sorted on in Task 2, and rendered in Task 7 under the same name. `computeMissingFields` returns labels in Task 1 and is consumed as labels by `MISSING_FIELD_COLORS` in Task 7 — the label strings in `STAFF_FIELD_LABELS` and the keys of `MISSING_FIELD_COLORS` match exactly, including `Pincode`. A mismatch here is silent: an unmatched key falls through to `|| ''` and the badge simply renders grey, so it would not fail a test or a typecheck.
