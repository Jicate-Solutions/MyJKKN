# Institution-wise Missing-Fields Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/learners/analytics` → Profile tab, let an administrator see which institution is missing which of 33 learner-profile fields, and drill from any cell into the exact learners.

**Architecture:** A single field catalogue in TypeScript is the source of truth. It generates (a) the SQL body of one `SECURITY INVOKER` aggregate RPC that computes every field's missing count in one table scan, and (b) the PostgREST `or=` predicates the existing drill-down route uses to filter rows. A new API route + card renders the institution × field matrix; clicking a cell drives the existing drill-down table's filters.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Supabase (Postgres + PostgREST + RLS), TanStack Query v5, Recharts, Shadcn UI (Radix), Tailwind, Vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-30-learner-missing-fields-institution-filter-design.md`. Read it before Task 1.
- **No local Supabase CLI.** Migrations are applied against production via the Supabase MCP `apply_migration` tool. There is no local stack, no `supabase db push`, no shadow DB.
- **Production database.** All SQL verification runs against live data. Row counts drift between runs (7,156–7,159 observed on 2026-07-30). Assert **invariants** exactly; treat absolute counts as reference values with a tolerance.
- **Test runner:** `npx vitest run <path>`. Config `vitest.config.js` — `environment: 'node'`, `globals: true`, `@` aliased to the repo root. There is no `npm test` script. Tests live in `__tests__/` folders beside the code.
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`). Must pass before every commit.
- **API route preamble** for every route under `app/api/learners/analytics/`: `export const dynamic = 'force-dynamic'`, `await connection()` first in the handler, and `Cache-Control: no-store, max-age=0` on the response. `'use cache'` is impossible here — `createClient()` reads cookies.
- **RPC convention:** name `get_learners_*`, `SECURITY INVOKER` (i.e. **no** `SECURITY DEFINER` clause), all 12 `filter_*` parameters with `DEFAULT NULL`. Never write `role_has_institution_access` into the function — RLS already confines it.
- **Terminology:** user-facing copy says **Learner**, never "Student", except where it names an existing DB column (`student_email`, `student_mobile`) whose label is already established.
- **Shell:** Windows. The Bash tool runs Git Bash (POSIX sh); PowerShell is the primary shell. Use forward slashes.
- **Completeness definition is frozen.** `REQUIRED_FIELDS` in `app/api/learners/analytics/incomplete-profiles/route.ts` (4 fields) and the stored `is_profile_complete` flag are **not** changed by any task in this plan.

---

## File Structure

**Create**

| file | responsibility |
|---|---|
| `lib/constants/learner-profile-fields.ts` | The 33-field catalogue + group helpers. No SQL, no React. |
| `lib/constants/__tests__/learner-profile-fields.test.ts` | Catalogue shape invariants. |
| `lib/db/learner-missing-fields-sql.ts` | Pure catalogue → SQL fragment generators, and the full `CREATE OR REPLACE FUNCTION` text. |
| `lib/db/__tests__/learner-missing-fields-sql.test.ts` | Generator output + migration-file parity. |
| `lib/db/learner-missing-fields-filter.ts` | Pure catalogue → PostgREST `or=` expressions, and row-level blank detection. |
| `lib/db/__tests__/learner-missing-fields-filter.test.ts` | Predicate strings + row blank/applies logic. |
| `supabase/migrations/20260730_learners_missing_fields_by_institution.sql` | The aggregate RPC. Body generated, not hand-written. |
| `lib/services/learners/missing-fields-matrix.ts` | Pure RPC-rows → matrix response shaper + presentation helpers. |
| `lib/services/learners/__tests__/missing-fields-matrix.test.ts` | Shaper, totals row, severity tint, top-N. |
| `app/api/learners/analytics/missing-fields-matrix/route.ts` | Thin route: auth → RPC → shaper. |
| `app/(routes)/learners/analytics/_components/missing-fields-matrix.tsx` | The matrix card. |
| `app/(routes)/learners/analytics/_components/missing-fields-picker.tsx` | Grouped multi-select for the Missing Field filter. |

**Modify**

| file | change |
|---|---|
| `types/learner-dashboard.ts` | Matrix types; `missingField` → `missingFields[]` + `missingMatch`. |
| `hooks/use-learner-profiles.ts` | Serialise the new params; add `useMissingFieldsMatrix`. |
| `app/api/learners/analytics/incomplete-profiles/route.ts` | Multi-field filter, catalogue blank rules, full-catalogue row badges. |
| `app/(routes)/learners/analytics/_components/incomplete-profiles-filters.tsx` | Swap single select for the picker; add any/all. |
| `app/(routes)/learners/analytics/_components/incomplete-profiles-table.tsx` | Accept filter state as props (lifted); export subtitle. |
| `app/(routes)/learners/analytics/_components/incomplete-profiles-columns.tsx` | Per-group badge colours. |
| `app/(routes)/learners/analytics/_components/profile-completion-tab.tsx` | Own filter state; render matrix; data-driven chart/funnel/recommendations. |
| `lib/services/learner-profile-service.ts` | `applyCompletionFilters`; RPC-derived `missing*` counts. |

---

# Batch 1 — Data layer (no user-visible change)

## Task 1: Field catalogue

**Files:**
- Create: `lib/constants/learner-profile-fields.ts`
- Test: `lib/constants/__tests__/learner-profile-fields.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ProfileFieldGroup = 'admin_assignment' | 'basic_details' | 'academic_information' | 'contact_details' | 'accommodation'`
  - `type BlankRule = 'text' | 'uuid' | 'marks'`
  - `type AppliesWhen = 'always' | 'hostel' | 'day_scholar_with_bus'`
  - `interface LearnerProfileFieldDef { key: string; column: string; label: string; group: ProfileFieldGroup; blankRule: BlankRule; appliesWhen: AppliesWhen; marksKeys?: readonly string[] }`
  - `const PROFILE_FIELD_GROUPS: readonly ProfileFieldGroup[]` (5, in display order)
  - `const PROFILE_FIELD_GROUP_LABELS: Record<ProfileFieldGroup, string>`
  - `const LEARNER_PROFILE_FIELDS: readonly LearnerProfileFieldDef[]` (33)
  - `const FIELD_BY_KEY: ReadonlyMap<string, LearnerProfileFieldDef>`
  - `function fieldsInGroup(group: ProfileFieldGroup): LearnerProfileFieldDef[]`
  - `const GROUP_ROLLUP_PREFIX = 'group:'`
  - `function groupRollupKey(group: ProfileFieldGroup): string`
  - `function isGroupRollupKey(key: string): boolean`
  - `function parseGroupRollupKey(key: string): ProfileFieldGroup | null`
  - `function isKnownFieldKey(key: string): boolean`
  - `const PROFILE_REQUIRED_FIELD_KEYS: ReadonlySet<string>` — the 4 frozen completeness fields, consumed by Task 10's scope-conflict guard

- [ ] **Step 1: Write the failing test**

Create `lib/constants/__tests__/learner-profile-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  LEARNER_PROFILE_FIELDS,
  PROFILE_FIELD_GROUPS,
  PROFILE_FIELD_GROUP_LABELS,
  FIELD_BY_KEY,
  fieldsInGroup,
  groupRollupKey,
  isGroupRollupKey,
  parseGroupRollupKey,
  isKnownFieldKey,
  GROUP_ROLLUP_PREFIX,
} from '../learner-profile-fields';

describe('learner profile field catalogue', () => {
  it('has exactly 33 fields', () => {
    expect(LEARNER_PROFILE_FIELDS).toHaveLength(33);
  });

  it('has unique keys', () => {
    const keys = LEARNER_PROFILE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses the DB column name as the key', () => {
    // The key doubles as the query-string value and the RPC field_key, so
    // keeping it identical to the column removes a whole mapping layer.
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(field.key).toBe(field.column);
    }
  });

  it('never collides with the group-rollup namespace', () => {
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(field.key.startsWith(GROUP_ROLLUP_PREFIX)).toBe(false);
    }
  });

  it('declares 5 groups with these exact sizes', () => {
    expect(PROFILE_FIELD_GROUPS).toEqual([
      'admin_assignment',
      'basic_details',
      'academic_information',
      'contact_details',
      'accommodation',
    ]);
    expect(fieldsInGroup('admin_assignment')).toHaveLength(5);
    expect(fieldsInGroup('basic_details')).toHaveLength(12);
    expect(fieldsInGroup('academic_information')).toHaveLength(4);
    expect(fieldsInGroup('contact_details')).toHaveLength(7);
    expect(fieldsInGroup('accommodation')).toHaveLength(5);
  });

  it('labels every group', () => {
    for (const group of PROFILE_FIELD_GROUPS) {
      expect(PROFILE_FIELD_GROUP_LABELS[group]).toBeTruthy();
    }
  });

  it('assigns every field to a declared group and a non-empty label', () => {
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(PROFILE_FIELD_GROUPS).toContain(field.group);
      expect(field.label.length).toBeGreaterThan(0);
    }
  });

  it('gives marks fields their sub-keys and no other field marksKeys', () => {
    const tenth = FIELD_BY_KEY.get('tenth_marks')!;
    const twelfth = FIELD_BY_KEY.get('twelfth_marks')!;
    expect(tenth.blankRule).toBe('marks');
    expect(tenth.marksKeys).toEqual(['max_marks', 'obtained_marks', 'percentage']);
    expect(twelfth.blankRule).toBe('marks');
    expect(twelfth.marksKeys).toEqual(['group', 'max_marks', 'obtained_marks', 'percentage']);

    for (const field of LEARNER_PROFILE_FIELDS) {
      if (field.blankRule === 'marks') expect(field.marksKeys?.length).toBeGreaterThan(0);
      else expect(field.marksKeys).toBeUndefined();
    }
  });

  it('marks exactly the four conditional accommodation fields', () => {
    const conditional = LEARNER_PROFILE_FIELDS.filter((f) => f.appliesWhen !== 'always');
    expect(conditional.map((f) => f.key).sort()).toEqual([
      'hostel_category_id',
      'mess_category_id',
      'transport_route_id',
      'transport_stop_id',
    ]);
    expect(FIELD_BY_KEY.get('hostel_category_id')!.appliesWhen).toBe('hostel');
    expect(FIELD_BY_KEY.get('mess_category_id')!.appliesWhen).toBe('hostel');
    expect(FIELD_BY_KEY.get('transport_route_id')!.appliesWhen).toBe('day_scholar_with_bus');
    expect(FIELD_BY_KEY.get('transport_stop_id')!.appliesWhen).toBe('day_scholar_with_bus');
  });

  it('keeps the four completeness-defining fields present and text/uuid ruled', () => {
    // Frozen by the spec (D4): these four still define complete/incomplete.
    for (const key of ['college_email', 'academic_year_id', 'semester_id', 'section_id']) {
      expect(FIELD_BY_KEY.has(key)).toBe(true);
    }
    expect(FIELD_BY_KEY.get('college_email')!.blankRule).toBe('text');
    expect(FIELD_BY_KEY.get('academic_year_id')!.blankRule).toBe('uuid');
  });

  it('gives every group at least one always-applicable field', () => {
    // The group rollup's applicable population is the full learner count, which
    // is only honest if the group can never be entirely inapplicable.
    for (const group of PROFILE_FIELD_GROUPS) {
      expect(fieldsInGroup(group).some((f) => f.appliesWhen === 'always')).toBe(true);
    }
  });

  describe('group rollup keys', () => {
    it('round-trips', () => {
      for (const group of PROFILE_FIELD_GROUPS) {
        const key = groupRollupKey(group);
        expect(isGroupRollupKey(key)).toBe(true);
        expect(parseGroupRollupKey(key)).toBe(group);
      }
    });

    it('rejects field keys and unknown groups', () => {
      expect(isGroupRollupKey('college_email')).toBe(false);
      expect(parseGroupRollupKey('college_email')).toBeNull();
      expect(parseGroupRollupKey('group:nope')).toBeNull();
    });
  });

  describe('isKnownFieldKey', () => {
    it('accepts catalogue keys only', () => {
      expect(isKnownFieldKey('student_email')).toBe(true);
      expect(isKnownFieldKey('group:basic_details')).toBe(false);
      expect(isKnownFieldKey('drop table learners_profiles')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/constants/__tests__/learner-profile-fields.test.ts`
Expected: FAIL — `Failed to resolve import "../learner-profile-fields"`.

- [ ] **Step 3: Write the catalogue**

Create `lib/constants/learner-profile-fields.ts`:

```ts
// ============================================
// LEARNER PROFILE FIELD CATALOGUE
// ============================================
// Created: 2026-07-30
// Purpose: The single source of truth for which learner-profile fields can be
//          "missing", what they are called, and what counts as blank.
//
// Consumed by:
//  - lib/db/learner-missing-fields-sql.ts     → generates the aggregate RPC
//  - lib/db/learner-missing-fields-filter.ts  → builds PostgREST row filters
//  - app/(routes)/learners/analytics/_components/*  → labels, groups, pickers
//
// WHY a catalogue: the four required fields used to be spelled out
// independently in five places (stats service, drill-down route, funnel, bar
// chart, filter bar) and had already drifted into three different notions of
// "missing". One list, generated everywhere.
// ============================================

export type ProfileFieldGroup =
  | 'admin_assignment'
  | 'basic_details'
  | 'academic_information'
  | 'contact_details'
  | 'accommodation';

/**
 * How absence is physically encoded for this column. Three rules, because
 * `learners_profiles` encodes it three ways:
 *
 *  - `uuid`  — nullable FK. Absent means NULL.
 *  - `text`  — most are declared NOT NULL and store '' for "not answered";
 *              a few (roll_number, permanent_address_taluk) use BOTH NULL and
 *              ''. So the rule must cover null, '' and whitespace.
 *  - `marks` — jsonb. Absent means NULL, '{}', or any listed sub-key blank.
 *
 * This is why a plain `IS NULL` filter reported 0 learners missing
 * `student_email` when 2,166 were.
 */
export type BlankRule = 'text' | 'uuid' | 'marks';

/**
 * When the field is required at all. Counting a conditional field against
 * everyone is not a rounding error: an unconditional `hostel_category_id IS
 * NULL` reports 6,350 learners missing a hostel room category when the real
 * figure — among the 989 hostellers — is 183.
 */
export type AppliesWhen = 'always' | 'hostel' | 'day_scholar_with_bus';

export interface LearnerProfileFieldDef {
  /** Stable id. Deliberately identical to `column`. */
  key: string;
  /** `learners_profiles` column name. */
  column: string;
  /** UI label and export header. */
  label: string;
  group: ProfileFieldGroup;
  blankRule: BlankRule;
  appliesWhen: AppliesWhen;
  /** jsonb sub-keys that must all be filled. Only for blankRule 'marks'. */
  marksKeys?: readonly string[];
}

/** Display order, matching the enquiry form's tab order. */
export const PROFILE_FIELD_GROUPS: readonly ProfileFieldGroup[] = [
  'admin_assignment',
  'basic_details',
  'academic_information',
  'contact_details',
  'accommodation',
] as const;

export const PROFILE_FIELD_GROUP_LABELS: Record<ProfileFieldGroup, string> = {
  admin_assignment: 'Admin Assignment',
  basic_details: 'Basic Details',
  academic_information: 'Academic Information',
  contact_details: 'Contact Details',
  accommodation: 'Accommodation',
};

export const LEARNER_PROFILE_FIELDS: readonly LearnerProfileFieldDef[] = [
  // ── Admin Assignment (5) ────────────────────────────────────────────────
  // The first four are the frozen completeness definition (spec D4).
  { key: 'college_email', column: 'college_email', label: 'College Email', group: 'admin_assignment', blankRule: 'text', appliesWhen: 'always' },
  { key: 'academic_year_id', column: 'academic_year_id', label: 'Academic Year', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'admission_year_id', column: 'admission_year_id', label: 'Admission Year', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'semester_id', column: 'semester_id', label: 'Semester', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'section_id', column: 'section_id', label: 'Section', group: 'admin_assignment', blankRule: 'uuid', appliesWhen: 'always' },

  // ── Basic Details (12) ──────────────────────────────────────────────────
  { key: 'roll_number', column: 'roll_number', label: 'Roll Number', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'register_number', column: 'register_number', label: 'Register Number', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'first_name', column: 'first_name', label: 'First Name', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'last_name', column: 'last_name', label: 'Last Name', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'date_of_birth', column: 'date_of_birth', label: 'Date of Birth', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'gender', column: 'gender', label: 'Gender', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'religion', column: 'religion', label: 'Religion', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'community_category_id', column: 'community_category_id', label: 'Community', group: 'basic_details', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'caste_id', column: 'caste_id', label: 'Caste', group: 'basic_details', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'father_name', column: 'father_name', label: "Father's Name", group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'mother_name', column: 'mother_name', label: "Mother's Name", group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'blood_group', column: 'blood_group', label: 'Blood Group', group: 'basic_details', blankRule: 'text', appliesWhen: 'always' },

  // ── Academic Information (4) ────────────────────────────────────────────
  { key: 'last_school', column: 'last_school', label: 'Last School', group: 'academic_information', blankRule: 'text', appliesWhen: 'always' },
  { key: 'board_of_study', column: 'board_of_study', label: 'Board of Study', group: 'academic_information', blankRule: 'text', appliesWhen: 'always' },
  { key: 'tenth_marks', column: 'tenth_marks', label: '10th Marks', group: 'academic_information', blankRule: 'marks', appliesWhen: 'always', marksKeys: ['max_marks', 'obtained_marks', 'percentage'] },
  { key: 'twelfth_marks', column: 'twelfth_marks', label: '12th Marks', group: 'academic_information', blankRule: 'marks', appliesWhen: 'always', marksKeys: ['group', 'max_marks', 'obtained_marks', 'percentage'] },

  // ── Contact Details (7) ─────────────────────────────────────────────────
  { key: 'student_mobile', column: 'student_mobile', label: 'Student Mobile', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'student_email', column: 'student_email', label: 'Student Email', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_street', column: 'permanent_address_street', label: 'Address Street', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_taluk', column: 'permanent_address_taluk', label: 'Taluk', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_district', column: 'permanent_address_district', label: 'District', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_pin_code', column: 'permanent_address_pin_code', label: 'PIN Code', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },
  { key: 'permanent_address_state', column: 'permanent_address_state', label: 'State', group: 'contact_details', blankRule: 'text', appliesWhen: 'always' },

  // ── Accommodation (5) ───────────────────────────────────────────────────
  { key: 'accommodation_type_id', column: 'accommodation_type_id', label: 'Accommodation Type', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'always' },
  { key: 'hostel_category_id', column: 'hostel_category_id', label: 'Hostel Room Category', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'hostel' },
  { key: 'mess_category_id', column: 'mess_category_id', label: 'Mess Category', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'hostel' },
  { key: 'transport_route_id', column: 'transport_route_id', label: 'Route', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'day_scholar_with_bus' },
  { key: 'transport_stop_id', column: 'transport_stop_id', label: 'Boarding Point', group: 'accommodation', blankRule: 'uuid', appliesWhen: 'day_scholar_with_bus' },
] as const;

export const LEARNER_PROFILE_FIELD_KEYS: readonly string[] =
  LEARNER_PROFILE_FIELDS.map((field) => field.key);

export const FIELD_BY_KEY: ReadonlyMap<string, LearnerProfileFieldDef> = new Map(
  LEARNER_PROFILE_FIELDS.map((field) => [field.key, field])
);

export function fieldsInGroup(group: ProfileFieldGroup): LearnerProfileFieldDef[] {
  return LEARNER_PROFILE_FIELDS.filter((field) => field.group === group);
}

/**
 * Namespace for the per-group "missing at least one field in this group" rows
 * the RPC emits alongside the per-field rows. Prefixed so a rollup key can
 * never be mistaken for a column name by the filter allowlist.
 */
export const GROUP_ROLLUP_PREFIX = 'group:';

export function groupRollupKey(group: ProfileFieldGroup): string {
  return `${GROUP_ROLLUP_PREFIX}${group}`;
}

export function isGroupRollupKey(key: string): boolean {
  return parseGroupRollupKey(key) !== null;
}

export function parseGroupRollupKey(key: string): ProfileFieldGroup | null {
  if (!key.startsWith(GROUP_ROLLUP_PREFIX)) return null;
  const candidate = key.slice(GROUP_ROLLUP_PREFIX.length) as ProfileFieldGroup;
  return PROFILE_FIELD_GROUPS.includes(candidate) ? candidate : null;
}

/** True only for real catalogue field keys — never for a group rollup. */
export function isKnownFieldKey(key: string): boolean {
  return FIELD_BY_KEY.has(key);
}

/**
 * The four fields that define completeness (spec D4). Picking one of these
 * alongside the "Complete profiles" scope can only ever return zero rows, so the
 * filter bar disables them there.
 *
 * Admission year is deliberately absent: a complete profile can legitimately
 * lack one, and most do.
 */
export const PROFILE_REQUIRED_FIELD_KEYS: ReadonlySet<string> = new Set([
  'college_email',
  'academic_year_id',
  'semester_id',
  'section_id',
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/constants/__tests__/learner-profile-fields.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors introduced by the new file.

- [ ] **Step 6: Commit**

```bash
git add lib/constants/learner-profile-fields.ts lib/constants/__tests__/learner-profile-fields.test.ts
git commit -m "feat(learners): field catalogue for profile missing-field analytics

33 fields in 5 groups, each carrying how absence is encoded (text/uuid/marks)
and when the field applies at all. Replaces the four required fields that were
spelled out independently in five places."
```

---

## Task 2: SQL generators

**Files:**
- Create: `lib/db/learner-missing-fields-sql.ts`
- Test: `lib/db/__tests__/learner-missing-fields-sql.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `function blankSql(field: LearnerProfileFieldDef, alias?: string): string` — parenthesised
  - `function appliesSql(field: LearnerProfileFieldDef, alias?: string, accomAlias?: string): string` — `'true'` or parenthesised
  - `function fieldEntrySql(field: LearnerProfileFieldDef): string`
  - `function groupRollupEntrySql(group: ProfileFieldGroup): string`
  - `function buildMissingFieldsRpcSql(): string` — the whole `CREATE OR REPLACE FUNCTION …;`
  - `const MISSING_FIELDS_RPC_NAME = 'get_learners_missing_fields_by_institution'`

- [ ] **Step 1: Write the failing test**

Create `lib/db/__tests__/learner-missing-fields-sql.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FIELD_BY_KEY, PROFILE_FIELD_GROUPS, LEARNER_PROFILE_FIELDS, groupRollupKey } from '@/lib/constants/learner-profile-fields';
import {
  blankSql,
  appliesSql,
  fieldEntrySql,
  groupRollupEntrySql,
  buildMissingFieldsRpcSql,
  MISSING_FIELDS_RPC_NAME,
} from '../learner-missing-fields-sql';

describe('blankSql', () => {
  it('uses IS NULL for uuid columns', () => {
    expect(blankSql(FIELD_BY_KEY.get('academic_year_id')!)).toBe('(lp.academic_year_id IS NULL)');
  });

  it('covers null, empty and whitespace for text columns', () => {
    // Not `IS NULL`: student_email has 0 NULLs and 2,166 empty strings.
    expect(blankSql(FIELD_BY_KEY.get('student_email')!)).toBe(
      "(btrim(coalesce(lp.student_email, '')) = '')"
    );
  });

  it('requires every listed sub-key for marks columns', () => {
    expect(blankSql(FIELD_BY_KEY.get('tenth_marks')!)).toBe(
      "(lp.tenth_marks IS NULL OR lp.tenth_marks = '{}'::jsonb" +
        " OR btrim(coalesce(lp.tenth_marks ->> 'max_marks', '')) = ''" +
        " OR btrim(coalesce(lp.tenth_marks ->> 'obtained_marks', '')) = ''" +
        " OR btrim(coalesce(lp.tenth_marks ->> 'percentage', '')) = '')"
    );
  });

  it('honours a custom alias', () => {
    expect(blankSql(FIELD_BY_KEY.get('section_id')!, 'x')).toBe('(x.section_id IS NULL)');
  });
});

describe('appliesSql', () => {
  it('is the literal true for unconditional fields', () => {
    expect(appliesSql(FIELD_BY_KEY.get('college_email')!)).toBe('true');
  });

  it('gates hostel fields on the accommodation type name', () => {
    expect(appliesSql(FIELD_BY_KEY.get('hostel_category_id')!)).toBe(
      "(upper(btrim(at.name)) = 'HOSTEL')"
    );
  });

  it('gates transport fields on day scholar AND bus_required', () => {
    expect(appliesSql(FIELD_BY_KEY.get('transport_route_id')!)).toBe(
      "(upper(btrim(at.name)) = 'DAY SCHOLAR' AND lp.bus_required IS TRUE)"
    );
  });
});

describe('fieldEntrySql', () => {
  it('uses a bare count(*) as the denominator for unconditional fields', () => {
    expect(fieldEntrySql(FIELD_BY_KEY.get('section_id')!)).toBe(
      "'section_id', jsonb_build_array(count(*), count(*) FILTER (WHERE (lp.section_id IS NULL)))"
    );
  });

  it('narrows both numerator and denominator for conditional fields', () => {
    // The denominator is what keeps hostel_category_id at 183, not 6,350.
    expect(fieldEntrySql(FIELD_BY_KEY.get('hostel_category_id')!)).toBe(
      "'hostel_category_id', jsonb_build_array(" +
        "count(*) FILTER (WHERE (upper(btrim(at.name)) = 'HOSTEL')), " +
        "count(*) FILTER (WHERE (upper(btrim(at.name)) = 'HOSTEL') AND (lp.hostel_category_id IS NULL)))"
    );
  });
});

describe('groupRollupEntrySql', () => {
  it('counts learners with at least one applicable blank field', () => {
    const sql = groupRollupEntrySql('admin_assignment');
    expect(sql.startsWith("'group:admin_assignment', jsonb_build_array(count(*), count(*) FILTER (WHERE ")).toBe(true);
    // Must be ORed, not summed — summing double-counts a learner missing several.
    expect(sql.split(' OR ').length).toBe(5);
  });

  it('wraps conditional members so the OR chain cannot leak', () => {
    const sql = groupRollupEntrySql('accommodation');
    expect(sql).toContain("((upper(btrim(at.name)) = 'HOSTEL') AND (lp.hostel_category_id IS NULL))");
  });
});

describe('buildMissingFieldsRpcSql', () => {
  const sql = buildMissingFieldsRpcSql();

  it('creates the conventionally named function', () => {
    expect(MISSING_FIELDS_RPC_NAME).toBe('get_learners_missing_fields_by_institution');
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${MISSING_FIELDS_RPC_NAME}(`);
  });

  it('is SECURITY INVOKER — never DEFINER', () => {
    // RLS must filter rows before aggregation; a DEFINER would have to
    // re-derive institution confinement by hand.
    expect(sql).not.toContain('SECURITY DEFINER');
  });

  it('declares all 12 filter params with DEFAULT NULL', () => {
    for (const param of [
      'filter_institution_ids uuid[] DEFAULT NULL',
      'filter_academic_year_id uuid DEFAULT NULL',
      'filter_degree_id uuid DEFAULT NULL',
      'filter_department_id uuid DEFAULT NULL',
      'filter_program_id uuid DEFAULT NULL',
      'filter_semester_id uuid DEFAULT NULL',
      'filter_section_id uuid DEFAULT NULL',
      'filter_lifecycle_statuses text[] DEFAULT NULL',
      'filter_gender text DEFAULT NULL',
      'filter_is_profile_complete boolean DEFAULT NULL',
      'filter_date_from timestamptz DEFAULT NULL',
      'filter_date_to timestamptz DEFAULT NULL',
    ]) {
      expect(sql).toContain(param);
    }
  });

  it('emits one entry per field plus one per group', () => {
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(sql).toContain(`'${field.key}', jsonb_build_array(`);
    }
    for (const group of PROFILE_FIELD_GROUPS) {
      expect(sql).toContain(`'${groupRollupKey(group)}', jsonb_build_array(`);
    }
  });

  it('scans learners_profiles once and pivots after aggregating', () => {
    expect(sql.match(/FROM learners_profiles/g)).toHaveLength(1);
    expect(sql).toContain('cross join lateral jsonb_each');
  });

  it('keeps learners with no institution in an explicit bucket', () => {
    expect(sql).toContain("coalesce(i.name, '(unassigned)')");
  });

  it('joins accommodation_types so conditional fields can be gated', () => {
    expect(sql).toContain('left join accommodation_types at on at.id = lp.accommodation_type_id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/db/__tests__/learner-missing-fields-sql.test.ts`
Expected: FAIL — cannot resolve `../learner-missing-fields-sql`.

- [ ] **Step 3: Write the generators**

Create `lib/db/learner-missing-fields-sql.ts`:

```ts
// ============================================
// MISSING-FIELDS AGGREGATE — SQL GENERATION
// ============================================
// Created: 2026-07-30
// Purpose: Turn the field catalogue into the body of the institution-wise
//          missing-fields RPC. Pure string building, no DB access.
//
// WHY generated: 33 fields x 2 aggregates x (field + group rollup) is ~250
// lines of near-identical SQL. Hand-maintaining it guarantees the SQL and the
// TypeScript labels drift. The migration embeds this function's output verbatim
// and a test asserts the two still match.
// ============================================

import {
  LEARNER_PROFILE_FIELDS,
  PROFILE_FIELD_GROUPS,
  fieldsInGroup,
  groupRollupKey,
  type LearnerProfileFieldDef,
  type ProfileFieldGroup,
} from '@/lib/constants/learner-profile-fields';

export const MISSING_FIELDS_RPC_NAME = 'get_learners_missing_fields_by_institution';

/**
 * SQL that is true when the field carries no value.
 *
 * Always parenthesised: `marks` expands to an OR chain, and an unparenthesised
 * OR chain spliced into `X AND <blank>` would bind wrongly.
 */
export function blankSql(field: LearnerProfileFieldDef, alias = 'lp'): string {
  const col = `${alias}.${field.column}`;

  switch (field.blankRule) {
    case 'uuid':
      return `(${col} IS NULL)`;

    case 'text':
      // Covers NULL, '' and whitespace in one predicate. Some columns use only
      // NULL, some only '', and roll_number / permanent_address_taluk use both.
      return `(btrim(coalesce(${col}, '')) = '')`;

    case 'marks': {
      const parts = [
        `${col} IS NULL`,
        `${col} = '{}'::jsonb`,
        ...(field.marksKeys ?? []).map(
          (markKey) => `btrim(coalesce(${col} ->> '${markKey}', '')) = ''`
        ),
      ];
      return `(${parts.join(' OR ')})`;
    }
  }
}

/**
 * SQL that is true when the field is required of this learner at all.
 * Returns the literal `true` for unconditional fields so callers can cheaply
 * detect them and emit a bare `count(*)` denominator.
 */
export function appliesSql(
  field: LearnerProfileFieldDef,
  alias = 'lp',
  accomAlias = 'at'
): string {
  switch (field.appliesWhen) {
    case 'always':
      return 'true';
    case 'hostel':
      return `(upper(btrim(${accomAlias}.name)) = 'HOSTEL')`;
    case 'day_scholar_with_bus':
      return `(upper(btrim(${accomAlias}.name)) = 'DAY SCHOLAR' AND ${alias}.bus_required IS TRUE)`;
  }
}

/** `count(*)`, or a FILTERed count when the predicate is not the literal true. */
function countFilter(predicate: string): string {
  return predicate === 'true' ? 'count(*)' : `count(*) FILTER (WHERE ${predicate})`;
}

/** One `'key', jsonb_build_array(applicable, missing)` pair. */
export function fieldEntrySql(field: LearnerProfileFieldDef): string {
  const applies = appliesSql(field);
  const blank = blankSql(field);
  const missing = applies === 'true' ? blank : `${applies} AND ${blank}`;

  return `'${field.key}', jsonb_build_array(${countFilter(applies)}, count(*) FILTER (WHERE ${missing}))`;
}

/**
 * One group rollup pair: learners missing AT LEAST ONE applicable field in the
 * group.
 *
 * Computed here rather than summed downstream on purpose. Summing the group's
 * field counts double-counts a learner missing several of them — for
 * admin_assignment the sum is 3,956 where the true figure is 3,104.
 */
export function groupRollupEntrySql(group: ProfileFieldGroup): string {
  const anyBlank = fieldsInGroup(group)
    .map((field) => {
      const applies = appliesSql(field);
      const blank = blankSql(field);
      return applies === 'true' ? blank : `(${applies} AND ${blank})`;
    })
    .join(' OR ');

  // Every group holds at least one always-applicable field, so the denominator
  // is the full learner count.
  return `'${groupRollupKey(group)}', jsonb_build_array(count(*), count(*) FILTER (WHERE ${anyBlank}))`;
}

/** The 12 standard analytics filter predicates, matching the sibling RPCs. */
const FILTER_PREDICATES = [
  '(filter_institution_ids IS NULL OR lp.institution_id = ANY(filter_institution_ids))',
  '(filter_academic_year_id IS NULL OR lp.academic_year_id = filter_academic_year_id)',
  '(filter_degree_id IS NULL OR lp.degree_id = filter_degree_id)',
  '(filter_department_id IS NULL OR lp.department_id = filter_department_id)',
  '(filter_program_id IS NULL OR lp.program_id = filter_program_id)',
  '(filter_semester_id IS NULL OR lp.semester_id = filter_semester_id)',
  '(filter_section_id IS NULL OR lp.section_id = filter_section_id)',
  '(filter_lifecycle_statuses IS NULL OR lp.lifecycle_status::text = ANY(filter_lifecycle_statuses))',
  '(filter_gender IS NULL OR lp.gender = filter_gender)',
  '(filter_is_profile_complete IS NULL OR lp.is_profile_complete = filter_is_profile_complete)',
  '(filter_date_from IS NULL OR lp.created_at >= filter_date_from)',
  '(filter_date_to IS NULL OR lp.created_at <= filter_date_to)',
];

/**
 * The complete `CREATE OR REPLACE FUNCTION` statement.
 *
 * Shape: aggregate WIDE in one pass (13 institution groups), then pivot to LONG
 * with `jsonb_each` over the 13 aggregated rows. Measured 366 ms as superuser
 * over 7,159 rows — one parallel seq scan, then a 38-row function scan per
 * group. Pivoting before aggregating would expand 7,159 x 38 = 272k
 * intermediate rows instead.
 */
export function buildMissingFieldsRpcSql(): string {
  const entries = [
    ...LEARNER_PROFILE_FIELDS.map(fieldEntrySql),
    ...PROFILE_FIELD_GROUPS.map(groupRollupEntrySql),
  ]
    .map((entry) => `      ${entry}`)
    .join(',\n');

  const where = FILTER_PREDICATES.map((predicate) => `    AND ${predicate}`).join('\n');

  return `CREATE OR REPLACE FUNCTION public.${MISSING_FIELDS_RPC_NAME}(
  filter_institution_ids uuid[] DEFAULT NULL,
  filter_academic_year_id uuid DEFAULT NULL,
  filter_degree_id uuid DEFAULT NULL,
  filter_department_id uuid DEFAULT NULL,
  filter_program_id uuid DEFAULT NULL,
  filter_semester_id uuid DEFAULT NULL,
  filter_section_id uuid DEFAULT NULL,
  filter_lifecycle_statuses text[] DEFAULT NULL,
  filter_gender text DEFAULT NULL,
  filter_is_profile_complete boolean DEFAULT NULL,
  filter_date_from timestamptz DEFAULT NULL,
  filter_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  institution_id uuid,
  institution_name text,
  learner_count bigint,
  field_key text,
  applicable_count bigint,
  missing_count bigint
)
LANGUAGE sql
STABLE
AS $function$
  with agg as (
    select
      lp.institution_id,
      coalesce(i.name, '(unassigned)')::text as institution_name,
      count(*)::bigint as learner_count,
      jsonb_build_object(
${entries}
      ) as m
    from learners_profiles lp
    left join institutions i on i.id = lp.institution_id
    left join accommodation_types at on at.id = lp.accommodation_type_id
    where true
${where}
    group by 1, 2
  )
  select
    agg.institution_id,
    agg.institution_name,
    agg.learner_count,
    f.key as field_key,
    (f.value ->> 0)::bigint as applicable_count,
    (f.value ->> 1)::bigint as missing_count
  from agg
  cross join lateral jsonb_each(agg.m) f
  order by agg.learner_count desc, f.key;
$function$;`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/db/__tests__/learner-missing-fields-sql.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add lib/db/learner-missing-fields-sql.ts lib/db/__tests__/learner-missing-fields-sql.test.ts
git commit -m "feat(learners): generate missing-fields aggregate SQL from the catalogue

Aggregates wide in one pass then pivots to long, so 33 fields plus 5 group
rollups cost one seq scan (366ms/7159 rows) instead of 429. Group rollups are
computed in SQL because summing field counts double-counts learners."
```

---

## Task 3: Migration and database verification

**Files:**
- Create: `supabase/migrations/20260730_learners_missing_fields_by_institution.sql`
- Modify: `lib/db/__tests__/learner-missing-fields-sql.test.ts` (add the parity test)

**Interfaces:**
- Consumes: `buildMissingFieldsRpcSql()` from Task 2.
- Produces: the deployed RPC `public.get_learners_missing_fields_by_institution`.

- [ ] **Step 1: Generate the migration body**

Run this from the repo root — it writes the file, so the SQL cannot drift from the generator by transcription error:

```bash
npx tsx -e "
const fs = require('fs');
const { buildMissingFieldsRpcSql } = require('./lib/db/learner-missing-fields-sql.ts');
const header = [
  '-- ============================================',
  '-- LEARNERS: INSTITUTION-WISE MISSING FIELDS RPC',
  '-- ============================================',
  '-- Created: 2026-07-30',
  '-- Spec: docs/superpowers/specs/2026-07-30-learner-missing-fields-institution-filter-design.md',
  '--',
  '-- GENERATED FILE. The function body below is the verbatim output of',
  '-- buildMissingFieldsRpcSql() in lib/db/learner-missing-fields-sql.ts.',
  '-- Do not hand-edit: edit the catalogue, re-run the generator, re-apply.',
  '-- lib/db/__tests__/learner-missing-fields-sql.test.ts fails if they diverge.',
  '--',
  '-- SECURITY INVOKER on purpose: learners_profiles_select_policy filters rows',
  '-- before aggregation, so institution confinement is inherited rather than',
  '-- reimplemented. Do not add SECURITY DEFINER.',
  '-- ============================================',
  '',
].join('\n');
fs.writeFileSync('supabase/migrations/20260730_learners_missing_fields_by_institution.sql', header + buildMissingFieldsRpcSql() + '\n');
console.log('written');
"
```

Expected output: `written`.

- [ ] **Step 2: Write the failing parity test**

Append to `lib/db/__tests__/learner-missing-fields-sql.test.ts`:

```ts
describe('migration parity', () => {
  it('the committed migration embeds the generator output verbatim', async () => {
    // The drift guard. Editing the catalogue without regenerating the migration
    // would leave the DB computing a different field set from the one the UI
    // labels — the exact failure mode this catalogue exists to prevent.
    const fs = await import('node:fs/promises');
    const migration = await fs.readFile(
      'supabase/migrations/20260730_learners_missing_fields_by_institution.sql',
      'utf8'
    );
    expect(migration).toContain(buildMissingFieldsRpcSql());
  });

  it('warns in the file that it is generated and stays INVOKER', async () => {
    // The comment is the only thing standing between a future maintainer and a
    // hand-edit that the parity test above then rejects confusingly.
    const fs = await import('node:fs/promises');
    const migration = await fs.readFile(
      'supabase/migrations/20260730_learners_missing_fields_by_institution.sql',
      'utf8'
    );
    expect(migration).toContain('GENERATED FILE');
    expect(migration).not.toContain('SECURITY DEFINER');
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run lib/db/__tests__/learner-missing-fields-sql.test.ts`
Expected: PASS, 17 tests. If parity fails, re-run Step 1 — do not edit the `.sql` by hand.

- [ ] **Step 4: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `name: "learners_missing_fields_by_institution"` and the full contents of the generated `.sql` file as the query. There is no CLI path.

- [ ] **Step 5: Verify the function shape**

Run via Supabase MCP `execute_sql`:

```sql
select p.proname, p.prosecdef as security_definer, p.provolatile,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_learners_missing_fields_by_institution';
```

Expected: one row; `security_definer = false`; `provolatile = 's'`; 12 arguments.

- [ ] **Step 6: Verify the numbers — invariants exactly, magnitudes approximately**

Run via Supabase MCP `execute_sql`:

```sql
with r as (select * from public.get_learners_missing_fields_by_institution())
select
  -- shape
  (select count(distinct field_key) from r)                                   as field_keys,       -- 38
  (select count(*) from r)                                                    as rows_total,       -- 38 * institutions
  (select count(distinct institution_id) from r
     where institution_id is not null)                                        as institutions,
  (select count(*) from r where institution_name = '(unassigned)') > 0        as has_unassigned,   -- true
  -- invariants (must hold exactly)
  (select bool_and(missing_count <= applicable_count) from r)                 as inv_missing_le_applicable,
  (select bool_and(applicable_count <= learner_count) from r)                 as inv_applicable_le_learners,
  -- reference magnitudes (live data; tolerance +/- 20)
  (select sum(missing_count) from r where field_key = 'student_email')        as student_email,     -- ~2166
  (select sum(missing_count) from r where field_key = 'roll_number')          as roll_number,       -- ~2020
  (select sum(missing_count) from r where field_key = 'college_email')        as college_email,     -- ~1058
  (select sum(missing_count) from r where field_key = 'hostel_category_id')   as hostel_cat,        -- ~183
  (select sum(applicable_count) from r where field_key = 'hostel_category_id')as hostel_applicable, -- ~989
  (select sum(missing_count) from r where field_key = 'transport_route_id')   as route,             -- ~47
  (select sum(missing_count) from r where field_key = 'group:admin_assignment') as rollup_admin;    -- ~3104
```

Expected: `field_keys = 38`; `has_unassigned = true`; both `inv_*` columns `true`; the reference magnitudes within ±20 of the comments. **`hostel_cat` must be near 183, not 6,350** — that is the conditional-denominator check. **`student_email` must be near 2,166, not 0** — that is the blank-rule check.

- [ ] **Step 7: Verify the rollup is a deduplicating OR, not a sum**

```sql
with r as (select * from public.get_learners_missing_fields_by_institution()),
g as (
  select institution_id, learner_count,
         max(missing_count) filter (where field_key <> 'group:admin_assignment') as max_field,
         sum(missing_count) filter (where field_key <> 'group:admin_assignment') as sum_field,
         max(missing_count) filter (where field_key  = 'group:admin_assignment') as rollup
  from r
  where field_key in ('college_email','academic_year_id','admission_year_id',
                      'semester_id','section_id','group:admin_assignment')
  group by 1, 2
)
select bool_and(rollup >= max_field)                        as inv_ge_max,
       bool_and(rollup <= least(sum_field, learner_count))  as inv_le_sum_and_total,
       bool_or(rollup < sum_field)                          as proves_dedup
from g;
```

Expected: all three `true`. `proves_dedup = true` is the point — if the rollup equalled the sum it would be double-counting.

- [ ] **Step 8: Verify RLS confinement holds**

Confirm the SELECT policy still gates the function's reads:

```sql
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'learners_profiles' and cmd = 'SELECT';
```

Expected: `learners_profiles_select_policy` and `students_view_own_learner_profile` both present. Because the RPC is `SECURITY INVOKER`, these apply to it unchanged — no per-institution grant is needed. Record in the commit that a non-super-admin principal check is deferred to Task 5's V12 (it needs a real session, which SQL-as-superuser cannot simulate).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260730_learners_missing_fields_by_institution.sql lib/db/__tests__/learner-missing-fields-sql.test.ts
git commit -m "feat(learners): institution-wise missing-fields RPC + parity guard

Applied to production. Verified: 38 field_keys per institution, (unassigned)
bucket present, missing<=applicable<=learner_count, hostel_category_id 183 not
6350, student_email 2166 not 0, and group rollups strictly below the sum of
their fields (proving they deduplicate learners rather than add)."
```

---

**Batch 1 gate.** Nothing renders from this yet. Before starting Batch 2, confirm: `npx vitest run lib/constants lib/db` passes, `npm run typecheck` passes, and Step 6/7 invariants all returned `true`.

---

# Batch 2 — Matrix read path

## Task 4: Matrix types and response shaper

**Files:**
- Create: `lib/services/learners/missing-fields-matrix.ts`
- Test: `lib/services/learners/__tests__/missing-fields-matrix.test.ts`
- Modify: `types/learner-dashboard.ts` (append the matrix types)

**Interfaces:**
- Consumes: `LEARNER_PROFILE_FIELDS`, `FIELD_BY_KEY`, `isGroupRollupKey`, `PROFILE_FIELD_GROUPS`, `groupRollupKey`, `fieldsInGroup`, `PROFILE_FIELD_GROUP_LABELS` (Task 1).
- Produces:
  - `interface MissingFieldsRpcRow { institution_id: string | null; institution_name: string; learner_count: number | string; field_key: string; applicable_count: number | string; missing_count: number | string }`
  - `interface MissingFieldsCell { fieldKey: string; applicable: number; missing: number }`
  - `interface MissingFieldsMatrixRow { institutionId: string | null; institutionName: string; learnerCount: number; cells: Record<string, MissingFieldsCell> }`
  - `interface MissingFieldsMatrixResponse { rows: MissingFieldsMatrixRow[]; total: MissingFieldsMatrixRow; generatedAt: string }`
  - `const TOTAL_ROW_ID = '__total__'`
  - `function shapeMissingFieldsMatrix(rpcRows: MissingFieldsRpcRow[], generatedAt: string): MissingFieldsMatrixResponse`
  - `type SeverityTint = 'none' | 'low' | 'medium' | 'high'`
  - `function severityTint(missing: number, applicable: number): SeverityTint`
  - `function cellShare(cell: MissingFieldsCell | undefined): number | null`
  - `interface TopMissingField { fieldKey: string; label: string; missing: number; applicable: number; share: number }`
  - `function topMissingFields(row: MissingFieldsMatrixRow, limit?: number): TopMissingField[]`

- [ ] **Step 1: Write the failing test**

Create `lib/services/learners/__tests__/missing-fields-matrix.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  shapeMissingFieldsMatrix,
  severityTint,
  cellShare,
  topMissingFields,
  TOTAL_ROW_ID,
  type MissingFieldsRpcRow,
} from '../missing-fields-matrix';

const GENERATED_AT = '2026-07-30T00:00:00.000Z';

/** Two institutions, three field keys — enough to exercise pivot and totals. */
function fixture(): MissingFieldsRpcRow[] {
  return [
    { institution_id: 'inst-a', institution_name: 'Alpha College', learner_count: 100, field_key: 'college_email', applicable_count: 100, missing_count: 10 },
    { institution_id: 'inst-a', institution_name: 'Alpha College', learner_count: 100, field_key: 'hostel_category_id', applicable_count: 20, missing_count: 15 },
    { institution_id: 'inst-a', institution_name: 'Alpha College', learner_count: 100, field_key: 'group:admin_assignment', applicable_count: 100, missing_count: 30 },
    { institution_id: 'inst-b', institution_name: 'Beta College', learner_count: 40, field_key: 'college_email', applicable_count: 40, missing_count: 0 },
    { institution_id: 'inst-b', institution_name: 'Beta College', learner_count: 40, field_key: 'hostel_category_id', applicable_count: 0, missing_count: 0 },
    { institution_id: 'inst-b', institution_name: 'Beta College', learner_count: 40, field_key: 'group:admin_assignment', applicable_count: 40, missing_count: 4 },
  ];
}

describe('shapeMissingFieldsMatrix', () => {
  it('pivots one row per institution with cells keyed by field', () => {
    const result = shapeMissingFieldsMatrix(fixture(), GENERATED_AT);

    expect(result.rows).toHaveLength(2);
    const alpha = result.rows.find((r) => r.institutionId === 'inst-a')!;
    expect(alpha.institutionName).toBe('Alpha College');
    expect(alpha.learnerCount).toBe(100);
    expect(alpha.cells.college_email).toEqual({ fieldKey: 'college_email', applicable: 100, missing: 10 });
    expect(alpha.cells.hostel_category_id).toEqual({ fieldKey: 'hostel_category_id', applicable: 20, missing: 15 });
  });

  it('sorts institutions by learner count descending', () => {
    const result = shapeMissingFieldsMatrix(fixture(), GENERATED_AT);
    expect(result.rows.map((r) => r.institutionId)).toEqual(['inst-a', 'inst-b']);
  });

  it('sums the total row across institutions', () => {
    // Valid because each learner belongs to exactly one institution.
    const result = shapeMissingFieldsMatrix(fixture(), GENERATED_AT);
    expect(result.total.institutionId).toBeNull();
    expect(result.total.learnerCount).toBe(140);
    expect(result.total.cells.college_email).toEqual({ fieldKey: 'college_email', applicable: 140, missing: 10 });
    expect(result.total.cells.hostel_category_id).toEqual({ fieldKey: 'hostel_category_id', applicable: 20, missing: 15 });
    expect(result.total.cells['group:admin_assignment']).toEqual({ fieldKey: 'group:admin_assignment', applicable: 140, missing: 34 });
  });

  it('coerces the numeric strings PostgREST returns for bigint', () => {
    // Postgres bigint arrives as a string over PostgREST; unconverted, the
    // total row would concatenate ("100" + "40" = "10040").
    const rows: MissingFieldsRpcRow[] = [
      { institution_id: 'inst-a', institution_name: 'A', learner_count: '100', field_key: 'college_email', applicable_count: '100', missing_count: '10' },
      { institution_id: 'inst-b', institution_name: 'B', learner_count: '40', field_key: 'college_email', applicable_count: '40', missing_count: '5' },
    ];
    const result = shapeMissingFieldsMatrix(rows, GENERATED_AT);
    expect(result.total.learnerCount).toBe(140);
    expect(result.total.cells.college_email.missing).toBe(15);
  });

  it('keeps the unassigned bucket as a row with a null id', () => {
    const rows: MissingFieldsRpcRow[] = [
      { institution_id: null, institution_name: '(unassigned)', learner_count: 1, field_key: 'college_email', applicable_count: 1, missing_count: 1 },
    ];
    const result = shapeMissingFieldsMatrix(rows, GENERATED_AT);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].institutionId).toBeNull();
    expect(result.rows[0].institutionName).toBe('(unassigned)');
  });

  it('returns an empty-but-valid shape for no rows', () => {
    const result = shapeMissingFieldsMatrix([], GENERATED_AT);
    expect(result.rows).toEqual([]);
    expect(result.total.learnerCount).toBe(0);
    expect(result.total.cells).toEqual({});
    expect(result.generatedAt).toBe(GENERATED_AT);
  });

  it('exposes a stable id for the total row', () => {
    expect(TOTAL_ROW_ID).toBe('__total__');
  });
});

describe('cellShare', () => {
  it('is the missing fraction of the applicable population', () => {
    expect(cellShare({ fieldKey: 'x', applicable: 200, missing: 50 })).toBe(0.25);
  });

  it('is null when nothing is applicable — never 0%', () => {
    // A college with no hostellers has no hostel-category gap to report.
    expect(cellShare({ fieldKey: 'x', applicable: 0, missing: 0 })).toBeNull();
    expect(cellShare(undefined)).toBeNull();
  });
});

describe('severityTint', () => {
  it('is none when nothing applies or nothing is missing', () => {
    expect(severityTint(0, 0)).toBe('none');
    expect(severityTint(0, 100)).toBe('none');
  });

  it('bands at 20% and 50%', () => {
    expect(severityTint(1, 100)).toBe('low');
    expect(severityTint(19, 100)).toBe('low');
    expect(severityTint(20, 100)).toBe('medium');
    expect(severityTint(49, 100)).toBe('medium');
    expect(severityTint(50, 100)).toBe('high');
    expect(severityTint(100, 100)).toBe('high');
  });
});

describe('topMissingFields', () => {
  it('ranks by share descending and excludes group rollups', () => {
    const row = shapeMissingFieldsMatrix(fixture(), GENERATED_AT).rows[0];
    const top = topMissingFields(row);
    expect(top.map((f) => f.fieldKey)).toEqual(['hostel_category_id', 'college_email']);
    expect(top[0].share).toBeCloseTo(0.75);
    expect(top.map((f) => f.fieldKey)).not.toContain('group:admin_assignment');
  });

  it('attaches the catalogue label', () => {
    const row = shapeMissingFieldsMatrix(fixture(), GENERATED_AT).rows[0];
    expect(topMissingFields(row).find((f) => f.fieldKey === 'college_email')!.label).toBe('College Email');
  });

  it('drops fields with nothing missing and honours the limit', () => {
    const row = shapeMissingFieldsMatrix(fixture(), GENERATED_AT).rows[1]; // Beta: all zero
    expect(topMissingFields(row)).toEqual([]);
    const alpha = shapeMissingFieldsMatrix(fixture(), GENERATED_AT).rows[0];
    expect(topMissingFields(alpha, 1)).toHaveLength(1);
  });

  it('defaults to 10', () => {
    const row = shapeMissingFieldsMatrix(fixture(), GENERATED_AT).rows[0];
    expect(topMissingFields(row).length).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/learners/__tests__/missing-fields-matrix.test.ts`
Expected: FAIL — cannot resolve `../missing-fields-matrix`.

- [ ] **Step 3: Write the shaper**

Create `lib/services/learners/missing-fields-matrix.ts`:

```ts
// ============================================
// MISSING-FIELDS MATRIX — SHAPING & PRESENTATION
// ============================================
// Created: 2026-07-30
// Purpose: Turn the long-format RPC rows into the institution x field matrix the
//          Profile Completion tab renders, plus the pure presentation helpers
//          (severity banding, top-N) the card and the bar chart share.
// ============================================

import {
  FIELD_BY_KEY,
  isGroupRollupKey,
} from '@/lib/constants/learner-profile-fields';

/** One row exactly as `get_learners_missing_fields_by_institution` returns it. */
export interface MissingFieldsRpcRow {
  institution_id: string | null;
  institution_name: string;
  /** bigint — arrives as a string over PostgREST. */
  learner_count: number | string;
  field_key: string;
  applicable_count: number | string;
  missing_count: number | string;
}

export interface MissingFieldsCell {
  fieldKey: string;
  /** Learners for whom this field is required at all. */
  applicable: number;
  missing: number;
}

export interface MissingFieldsMatrixRow {
  /** null for the "(unassigned)" bucket and for the synthetic total row. */
  institutionId: string | null;
  institutionName: string;
  learnerCount: number;
  /** Keyed by field key or `group:<group>`. */
  cells: Record<string, MissingFieldsCell>;
}

export interface MissingFieldsMatrixResponse {
  rows: MissingFieldsMatrixRow[];
  total: MissingFieldsMatrixRow;
  generatedAt: string;
}

/** React key for the total row — its institutionId is null, like (unassigned). */
export const TOTAL_ROW_ID = '__total__';

function toNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pivot long-format RPC rows into one row per institution, plus a total row.
 *
 * The total row sums each field column across institutions. That is sound
 * because a learner belongs to exactly one institution — including group
 * rollups, which are per-learner booleans. It is NOT sound to sum across
 * *fields*; see `groupRollupEntrySql`.
 */
export function shapeMissingFieldsMatrix(
  rpcRows: MissingFieldsRpcRow[],
  generatedAt: string
): MissingFieldsMatrixResponse {
  const byInstitution = new Map<string, MissingFieldsMatrixRow>();

  for (const raw of rpcRows) {
    // Keyed on the id, but '(unassigned)' has a null id — so fall back to the
    // name, which the RPC guarantees is present.
    const bucket = raw.institution_id ?? `name:${raw.institution_name}`;

    let row = byInstitution.get(bucket);
    if (!row) {
      row = {
        institutionId: raw.institution_id,
        institutionName: raw.institution_name,
        learnerCount: toNumber(raw.learner_count),
        cells: {},
      };
      byInstitution.set(bucket, row);
    }

    row.cells[raw.field_key] = {
      fieldKey: raw.field_key,
      applicable: toNumber(raw.applicable_count),
      missing: toNumber(raw.missing_count),
    };
  }

  const rows = [...byInstitution.values()].sort((a, b) => b.learnerCount - a.learnerCount);

  const total: MissingFieldsMatrixRow = {
    institutionId: null,
    institutionName: 'All institutions',
    learnerCount: 0,
    cells: {},
  };

  for (const row of rows) {
    total.learnerCount += row.learnerCount;
    for (const cell of Object.values(row.cells)) {
      const running = total.cells[cell.fieldKey] ?? {
        fieldKey: cell.fieldKey,
        applicable: 0,
        missing: 0,
      };
      running.applicable += cell.applicable;
      running.missing += cell.missing;
      total.cells[cell.fieldKey] = running;
    }
  }

  return { rows, total, generatedAt };
}

/**
 * Missing as a fraction of the applicable population, or null when the field
 * applies to nobody here. Null rather than 0 so the UI can render an em dash —
 * "0% missing" would imply a clean record where there is simply no question.
 */
export function cellShare(cell: MissingFieldsCell | undefined): number | null {
  if (!cell || cell.applicable <= 0) return null;
  return cell.missing / cell.applicable;
}

export type SeverityTint = 'none' | 'low' | 'medium' | 'high';

/** Bands fixed by the spec so the colour is reproducible: 20% and 50%. */
export function severityTint(missing: number, applicable: number): SeverityTint {
  const share = cellShare({ fieldKey: '', applicable, missing });
  if (share === null || missing <= 0) return 'none';
  if (share < 0.2) return 'low';
  if (share < 0.5) return 'medium';
  return 'high';
}

export interface TopMissingField {
  fieldKey: string;
  label: string;
  missing: number;
  applicable: number;
  share: number;
}

/**
 * The worst fields for one row, by share of applicable missing.
 *
 * Group rollups are excluded: they answer a different question ("any field in
 * this group") and would otherwise dominate the ranking they are aggregates of.
 */
export function topMissingFields(
  row: MissingFieldsMatrixRow,
  limit = 10
): TopMissingField[] {
  return Object.values(row.cells)
    .filter((cell) => !isGroupRollupKey(cell.fieldKey))
    .filter((cell) => cell.missing > 0 && cell.applicable > 0)
    .map((cell) => ({
      fieldKey: cell.fieldKey,
      label: FIELD_BY_KEY.get(cell.fieldKey)?.label ?? cell.fieldKey,
      missing: cell.missing,
      applicable: cell.applicable,
      share: cell.missing / cell.applicable,
    }))
    .sort((a, b) => b.share - a.share || b.missing - a.missing)
    .slice(0, limit);
}
```

- [ ] **Step 4: Re-export the types from `types/learner-dashboard.ts`**

Append at the end of `types/learner-dashboard.ts`:

```ts
// ============================================
// MISSING-FIELDS MATRIX (Profile Completion tab)
// ============================================
// The shapes live with the shaper in
// lib/services/learners/missing-fields-matrix.ts; re-exported here so
// components can keep importing dashboard types from one place.
export type {
  MissingFieldsRpcRow,
  MissingFieldsCell,
  MissingFieldsMatrixRow,
  MissingFieldsMatrixResponse,
  SeverityTint,
  TopMissingField,
} from '@/lib/services/learners/missing-fields-matrix';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/services/learners/__tests__/missing-fields-matrix.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add lib/services/learners/missing-fields-matrix.ts lib/services/learners/__tests__/missing-fields-matrix.test.ts types/learner-dashboard.ts
git commit -m "feat(learners): shape missing-fields RPC rows into an institution matrix

Coerces PostgREST bigint strings, keeps the (unassigned) bucket, and sums the
total row across institutions (sound: one learner, one institution). cellShare
returns null rather than 0% when a field applies to nobody."
```

---

## Task 5: Matrix API route and hook

**Files:**
- Create: `app/api/learners/analytics/missing-fields-matrix/route.ts`
- Modify: `hooks/use-learner-profiles.ts` (append `useMissingFieldsMatrix`)

**Interfaces:**
- Consumes: `shapeMissingFieldsMatrix`, `MissingFieldsRpcRow`, `MissingFieldsMatrixResponse` (Task 4); the deployed RPC (Task 3).
- Produces:
  - `GET /api/learners/analytics/missing-fields-matrix` → `MissingFieldsMatrixResponse`
  - `function useMissingFieldsMatrix(filters: LearnerDashboardFilters, options?): UseQueryResult<MissingFieldsMatrixResponse, Error>`

- [ ] **Step 1: Write the route**

Create `app/api/learners/analytics/missing-fields-matrix/route.ts`:

```ts
export const dynamic = 'force-dynamic';

// ============================================
// MISSING-FIELDS MATRIX API
// ============================================
// Created: 2026-07-30
// Purpose: Institution x field missing-data matrix for the Profile Completion
//          tab, from one aggregate RPC call.
// Used by: ProfileCompletionTab -> MissingFieldsMatrix, and its bar chart/funnel
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  shapeMissingFieldsMatrix,
  type MissingFieldsRpcRow,
} from '@/lib/services/learners/missing-fields-matrix';

/**
 * GET /api/learners/analytics/missing-fields-matrix
 *
 * A separate route rather than part of /stats so it is fetched only when the
 * Profile tab is actually mounted — Radix unmounts inactive TabsContent, and
 * these tab bodies are client components, so nothing here fans out eagerly.
 *
 * Query Parameters (all optional, same names the /stats route parses):
 * - institutionIds    : comma-separated institution IDs
 * - academicYearId, degreeId, departmentId, programId, semesterId, sectionId
 * - lifecycleStatuses : comma-separated lifecycle statuses
 * - gender            : male | female | other
 * - isProfileComplete : true | false
 * - dateFrom, dateTo  : ISO timestamps
 */
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

    const searchParams = request.nextUrl.searchParams;

    // Institution scope: explicit param wins, else the caller's own institution,
    // else unscoped and RLS decides (a super admin).
    const institutionIdsParam = searchParams.get('institutionIds');
    const explicitIds = institutionIdsParam
      ? institutionIdsParam.split(',').filter(Boolean)
      : [];
    const institutionIds =
      explicitIds.length > 0
        ? explicitIds
        : profile.institution_id
        ? [profile.institution_id]
        : null;

    const lifecycleStatuses = searchParams.get('lifecycleStatuses');
    const isProfileComplete = searchParams.get('isProfileComplete');
    const gender = searchParams.get('gender');

    const { data, error } = await supabase.rpc(
      'get_learners_missing_fields_by_institution',
      {
        filter_institution_ids: institutionIds,
        filter_academic_year_id: searchParams.get('academicYearId') || null,
        filter_degree_id: searchParams.get('degreeId') || null,
        filter_department_id: searchParams.get('departmentId') || null,
        filter_program_id: searchParams.get('programId') || null,
        filter_semester_id: searchParams.get('semesterId') || null,
        filter_section_id: searchParams.get('sectionId') || null,
        filter_lifecycle_statuses: lifecycleStatuses
          ? lifecycleStatuses.split(',').filter(Boolean)
          : null,
        filter_gender:
          gender === 'male' || gender === 'female' || gender === 'other' ? gender : null,
        filter_is_profile_complete:
          isProfileComplete === null ? null : isProfileComplete === 'true',
        filter_date_from: searchParams.get('dateFrom') || null,
        filter_date_to: searchParams.get('dateTo') || null,
      }
    );

    if (error) {
      console.error('[api/learners/analytics/missing-fields-matrix] RPC error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch missing-fields matrix', details: error.message },
        { status: 500 }
      );
    }

    const response = shapeMissingFieldsMatrix(
      (data || []) as MissingFieldsRpcRow[],
      new Date().toISOString()
    );

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[api/learners/analytics/missing-fields-matrix] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch missing-fields matrix',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Add the hook**

Append to `hooks/use-learner-profiles.ts`. Add `MissingFieldsMatrixResponse` and `LearnerDashboardFilters` to the existing `types/learner-dashboard` import block at the top of the file, then append:

```ts
// ============================================
// MISSING-FIELDS MATRIX HOOK
// ============================================

/** Serialise dashboard filters for the matrix route. */
export function buildMissingFieldsMatrixQuery(filters: LearnerDashboardFilters): string {
  const params = new URLSearchParams();

  if (filters.institutionIds?.length) {
    params.set('institutionIds', filters.institutionIds.join(','));
  }
  if (filters.academicYearId) params.set('academicYearId', filters.academicYearId);
  if (filters.degreeId) params.set('degreeId', filters.degreeId);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.programId) params.set('programId', filters.programId);
  if (filters.semesterId) params.set('semesterId', filters.semesterId);
  if (filters.sectionId) params.set('sectionId', filters.sectionId);
  if (filters.lifecycleStatuses?.length) {
    params.set('lifecycleStatuses', filters.lifecycleStatuses.join(','));
  }
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.isProfileComplete !== undefined) {
    params.set('isProfileComplete', String(filters.isProfileComplete));
  }
  if (filters.dateRange?.from && filters.dateRange?.to) {
    params.set('dateFrom', filters.dateRange.from.toISOString());
    params.set('dateTo', filters.dateRange.to.toISOString());
  }

  return params.toString();
}

/**
 * Institution x field missing-data matrix. Keyed on the serialised query rather
 * than the filters object so a new object with identical values is a cache hit.
 */
export function useMissingFieldsMatrix(
  filters: LearnerDashboardFilters,
  options?: Omit<UseQueryOptions<MissingFieldsMatrixResponse, Error>, 'queryKey' | 'queryFn'>
) {
  const query = buildMissingFieldsMatrixQuery(filters);

  return useQuery<MissingFieldsMatrixResponse, Error>({
    queryKey: ['learners', 'analytics', 'missing-fields-matrix', query],
    queryFn: async () => {
      const res = await fetch(`/api/learners/analytics/missing-fields-matrix?${query}`);
      if (!res.ok) {
        throw new Error('Failed to fetch missing-fields matrix');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If `UseQueryOptions` is not already imported in the hooks file, add it to the existing `@tanstack/react-query` import.

- [ ] **Step 4: Verify the route end to end (V12 — RLS confinement)**

Start the dev server (`npm run dev`), sign in as a **super admin**, and open:
`http://localhost:3000/api/learners/analytics/missing-fields-matrix`

Expected: JSON with ~13 entries in `rows`, each having 38 keys in `cells`, plus a `total` row whose `learnerCount` matches the Profile tab's total.

Then sign in as a user whose `profiles.institution_id` is a single college and reload the same URL.
Expected: `rows` contains **only that institution**. This is the RLS confinement check the SQL-level verification in Task 3 could not perform. If more than one institution appears, stop — do not proceed to Task 6.

- [ ] **Step 5: Commit**

```bash
git add app/api/learners/analytics/missing-fields-matrix/route.ts hooks/use-learner-profiles.ts
git commit -m "feat(learners): missing-fields matrix route + query hook

One RPC call per request. Verified a single-institution principal sees only
their own rows (SECURITY INVOKER + RLS), and a super admin sees all 13 buckets."
```

---

## Task 6: Matrix card component

**Files:**
- Create: `app/(routes)/learners/analytics/_components/missing-fields-matrix.tsx`

**Interfaces:**
- Consumes: `useMissingFieldsMatrix` (Task 5); `shapeMissingFieldsMatrix` output types, `severityTint`, `cellShare` (Task 4); `PROFILE_FIELD_GROUPS`, `PROFILE_FIELD_GROUP_LABELS`, `fieldsInGroup`, `groupRollupKey` (Task 1).
- Produces:
  - `interface MissingFieldsMatrixProps { filters: LearnerDashboardFilters; onDrillDown: (selection: { institutionId: string | null; fieldKeys: string[] }) => void }`
  - `function MissingFieldsMatrix(props: MissingFieldsMatrixProps): JSX.Element`

- [ ] **Step 1: Write the component**

Create `app/(routes)/learners/analytics/_components/missing-fields-matrix.tsx`:

```tsx
'use client';
// ============================================
// INSTITUTION x FIELD MISSING-DATA MATRIX
// ============================================
// Created: 2026-07-30
// Purpose: Which institution is missing which learner-profile fields, at a
//          glance, with every cell a drill-down into the learners behind it.
// ============================================

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Grid3x3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMissingFieldsMatrix } from '@/hooks/use-learner-profiles';
import {
  PROFILE_FIELD_GROUPS,
  PROFILE_FIELD_GROUP_LABELS,
  fieldsInGroup,
  groupRollupKey,
  type ProfileFieldGroup,
} from '@/lib/constants/learner-profile-fields';
import {
  cellShare,
  severityTint,
  TOTAL_ROW_ID,
  type MissingFieldsMatrixRow,
  type SeverityTint,
} from '@/lib/services/learners/missing-fields-matrix';
import type { LearnerDashboardFilters } from '@/types/learner-dashboard';

/** Sentinel for the "show one column per group" view. */
const ALL_GROUPS = 'all';

const TINT_CLASSES: Record<SeverityTint, string> = {
  none: '',
  low: 'bg-yellow-50 dark:bg-yellow-950/20',
  medium: 'bg-amber-100 dark:bg-amber-950/30',
  high: 'bg-red-100 dark:bg-red-950/30',
};

interface MatrixColumn {
  /** Field key or `group:<group>`. */
  key: string;
  label: string;
  /** Field keys the drill-down should filter on when this cell is clicked. */
  drillKeys: string[];
}

function columnsFor(view: typeof ALL_GROUPS | ProfileFieldGroup): MatrixColumn[] {
  if (view === ALL_GROUPS) {
    return PROFILE_FIELD_GROUPS.map((group) => ({
      key: groupRollupKey(group),
      label: PROFILE_FIELD_GROUP_LABELS[group],
      // A group cell counts learners missing ANY field in the group, so the
      // drill-down must filter on all of them with match=any.
      drillKeys: fieldsInGroup(group).map((field) => field.key),
    }));
  }

  return fieldsInGroup(view).map((field) => ({
    key: field.key,
    label: field.label,
    drillKeys: [field.key],
  }));
}

function formatShare(share: number | null): string {
  if (share === null) return '';
  return `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
}

interface MatrixCellProps {
  row: MissingFieldsMatrixRow;
  column: MatrixColumn;
  onDrillDown: (selection: { institutionId: string | null; fieldKeys: string[] }) => void;
  isTotalRow: boolean;
}

function MatrixCell({ row, column, onDrillDown, isTotalRow }: MatrixCellProps) {
  const cell = row.cells[column.key];
  const share = cellShare(cell);

  // Nothing applicable: this field asks a question that does not arise here
  // (e.g. hostel room category at a college with no hostellers). An em dash,
  // never "0%", which would read as a clean record.
  if (!cell || share === null) {
    return (
      <td className='px-3 py-2 text-right text-sm text-muted-foreground'>—</td>
    );
  }

  const tint = severityTint(cell.missing, cell.applicable);
  const clickable = cell.missing > 0;

  return (
    <td className={cn('px-3 py-2 text-right align-middle', TINT_CLASSES[tint])}>
      <button
        type='button'
        disabled={!clickable}
        onClick={() =>
          onDrillDown({
            // The total row is not one institution, so it clears the scope.
            institutionId: isTotalRow ? null : row.institutionId,
            fieldKeys: column.drillKeys,
          })
        }
        className={cn(
          'w-full text-right tabular-nums',
          clickable
            ? 'cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'
            : 'cursor-default'
        )}
        aria-label={
          clickable
            ? `${cell.missing} learners in ${row.institutionName} missing ${column.label}`
            : undefined
        }
      >
        <span className={cn('block text-sm font-medium', cell.missing === 0 && 'text-muted-foreground')}>
          {cell.missing.toLocaleString()}
        </span>
        <span className='block text-xs text-muted-foreground'>{formatShare(share)}</span>
      </button>
    </td>
  );
}

export interface MissingFieldsMatrixProps {
  filters: LearnerDashboardFilters;
  onDrillDown: (selection: { institutionId: string | null; fieldKeys: string[] }) => void;
}

export function MissingFieldsMatrix({ filters, onDrillDown }: MissingFieldsMatrixProps) {
  const [view, setView] = useState<typeof ALL_GROUPS | ProfileFieldGroup>(ALL_GROUPS);
  const { data, isLoading, error } = useMissingFieldsMatrix(filters);

  const columns = useMemo(() => columnsFor(view), [view]);

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Grid3x3 className='h-5 w-5 text-blue-600' />
              Missing Fields by Institution
            </CardTitle>
            <CardDescription className='mt-1'>
              Learners with no value recorded, per institution. Percentages are of the
              learners the field actually applies to — conditional fields such as hostel
              room category only count hostellers. Click any figure to list those learners.
            </CardDescription>
          </div>
          <div className='w-full space-y-1.5 sm:w-56 sm:shrink-0'>
            <Label className='text-xs text-muted-foreground'>Field group</Label>
            <Select
              value={view}
              onValueChange={(next) => setView(next as typeof ALL_GROUPS | ProfileFieldGroup)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_GROUPS}>All groups (summary)</SelectItem>
                {PROFILE_FIELD_GROUPS.map((group) => (
                  <SelectItem key={group} value={group}>
                    {PROFILE_FIELD_GROUP_LABELS[group]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className='space-y-2'>
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-64 w-full' />
          </div>
        ) : error ? (
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertDescription>
              Failed to load the missing-fields matrix. The rest of this tab is unaffected —
              refresh the dashboard to retry.
            </AlertDescription>
          </Alert>
        ) : !data || data.rows.length === 0 ? (
          <Alert>
            <AlertCircle className='h-4 w-4' />
            <AlertDescription>No learner profiles in the current scope.</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* The wide table scrolls inside its own container; the page body
                must never scroll horizontally. */}
            <div className='overflow-x-auto'>
              <table className='w-full min-w-max border-collapse text-sm'>
                <thead>
                  <tr className='border-b'>
                    <th className='sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium'>
                      Institution
                    </th>
                    <th className='px-3 py-2 text-right font-medium'>Learners</th>
                    {columns.map((column) => (
                      <th key={column.key} className='px-3 py-2 text-right font-medium'>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr
                      key={row.institutionId ?? `name:${row.institutionName}`}
                      className='border-b last:border-0 hover:bg-muted/40'
                    >
                      <td className='sticky left-0 z-10 bg-background px-3 py-2 font-medium'>
                        {row.institutionName}
                      </td>
                      <td className='px-3 py-2 text-right tabular-nums text-muted-foreground'>
                        {row.learnerCount.toLocaleString()}
                      </td>
                      {columns.map((column) => (
                        <MatrixCell
                          key={column.key}
                          row={row}
                          column={column}
                          onDrillDown={onDrillDown}
                          isTotalRow={false}
                        />
                      ))}
                    </tr>
                  ))}
                  <tr key={TOTAL_ROW_ID} className='border-t-2 bg-muted/30 font-semibold'>
                    <td className='sticky left-0 z-10 bg-muted/30 px-3 py-2'>
                      {data.total.institutionName}
                    </td>
                    <td className='px-3 py-2 text-right tabular-nums'>
                      {data.total.learnerCount.toLocaleString()}
                    </td>
                    {columns.map((column) => (
                      <MatrixCell
                        key={column.key}
                        row={data.total}
                        column={column}
                        onDrillDown={onDrillDown}
                        isTotalRow
                      />
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className='mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground'>
              <span>Share of applicable learners missing:</span>
              <span className='flex items-center gap-1.5'>
                <span className={cn('inline-block h-3 w-3 rounded', TINT_CLASSES.low)} />
                under 20%
              </span>
              <span className='flex items-center gap-1.5'>
                <span className={cn('inline-block h-3 w-3 rounded', TINT_CLASSES.medium)} />
                20–49%
              </span>
              <span className='flex items-center gap-1.5'>
                <span className={cn('inline-block h-3 w-3 rounded', TINT_CLASSES.high)} />
                50% or more
              </span>
              <Badge variant='secondary' className='ml-auto text-xs'>
                — means the field applies to no learner here
              </Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/learners/analytics/_components/missing-fields-matrix.tsx"
git commit -m "feat(learners): institution x field missing-data matrix card

Group-summary view by default, per-field on selecting a group. Percentages are
of the applicable population, and a field that applies to nobody renders an em
dash rather than 0%. Wide table scrolls inside its own container."
```

---

## Task 7: Wire the matrix into the Profile Completion tab

**Files:**
- Modify: `app/(routes)/learners/analytics/_components/profile-completion-tab.tsx`
- Modify: `app/(routes)/learners/analytics/_components/incomplete-profiles-table.tsx`

**Interfaces:**
- Consumes: `MissingFieldsMatrix` (Task 6); `DEFAULT_PROFILE_COMPLETION_FILTERS`, `ProfileCompletionFilterState` (existing, extended in Task 10).
- Produces:
  - `IncompleteProfilesTableProps` gains `value: ProfileCompletionFilterState` and `onChange: (next: ProfileCompletionFilterState) => void`, replacing the component's internal `useState`.
  - `ProfileCompletionTab` owns the filter state and exposes `handleDrillDown`.

**Note on ordering:** this task uses `missingFields`/`missingMatch` on the filter state, which Task 10 adds. Execute Task 7 **after** Task 10, or complete Task 7's Step 1 (state lift) now and Step 3 (drill-down wiring) after Task 10. The batch gate below assumes Task 7 runs last.

- [ ] **Step 1: Lift the filter state out of the table**

In `incomplete-profiles-table.tsx`, replace the internal state:

```tsx
// BEFORE
interface IncompleteProfilesTableProps {
  filters: LearnerDashboardFilters;
}

export function IncompleteProfilesTable({ filters }: IncompleteProfilesTableProps) {
  const [fieldFilters, setFieldFilters] = useState<ProfileCompletionFilterState>(
    DEFAULT_PROFILE_COMPLETION_FILTERS
  );
```

```tsx
// AFTER
interface IncompleteProfilesTableProps {
  filters: LearnerDashboardFilters;
  /**
   * Drill-down filter state, owned by ProfileCompletionTab so the missing-fields
   * matrix can set it. Lifted out of this component rather than duplicated —
   * two sources of truth for the same filters would let the matrix and the table
   * disagree about what is being shown.
   */
  value: ProfileCompletionFilterState;
  onChange: (next: ProfileCompletionFilterState) => void;
}

export function IncompleteProfilesTable({
  filters,
  value: fieldFilters,
  onChange: setFieldFilters,
}: IncompleteProfilesTableProps) {
```

Then delete the now-unused `useState` import if nothing else in the file uses it, and remove `DEFAULT_PROFILE_COMPLETION_FILTERS` from the import list if unused. Everything else in the file already reads `fieldFilters` and calls `setFieldFilters`, so no other change is needed.

- [ ] **Step 2: Own the state in the tab and render the matrix**

In `profile-completion-tab.tsx`:

Add to the imports at the top:

```tsx
import { useCallback, useRef, useState } from 'react';
import { MissingFieldsMatrix } from './missing-fields-matrix';
import {
  DEFAULT_PROFILE_COMPLETION_FILTERS,
  type ProfileCompletionFilterState,
} from './incomplete-profiles-filters';
```

Inside `ProfileCompletionTab`, just after `const { profileCompletion } = data;`:

```tsx
  const [drillDownFilters, setDrillDownFilters] = useState<ProfileCompletionFilterState>(
    DEFAULT_PROFILE_COMPLETION_FILTERS
  );
  const tableRef = useRef<HTMLDivElement>(null);

  /**
   * A matrix cell click becomes a drill-down query.
   *
   * Scope widens to 'all' profiles: a cell may count fields outside the
   * four-field completeness definition, so keeping the default 'incomplete'
   * scope could return zero rows for a cell that plainly shows a non-zero
   * count — the most confusing possible outcome.
   */
  const handleDrillDown = useCallback(
    ({ institutionId, fieldKeys }: { institutionId: string | null; fieldKeys: string[] }) => {
      setDrillDownFilters({
        ...DEFAULT_PROFILE_COMPLETION_FILTERS,
        completion: 'all',
        missingFields: fieldKeys,
        missingMatch: 'any',
        institutionId: institutionId ?? DEFAULT_PROFILE_COMPLETION_FILTERS.institutionId,
      });
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    []
  );
```

Replace the final line of the returned JSX:

```tsx
// BEFORE
      {/* Profile Completion Detail Table (advanced data table + filters) */}
      <IncompleteProfilesTable filters={filters} />
```

```tsx
// AFTER
      {/* Institution x field missing-data matrix — drives the table below */}
      <MissingFieldsMatrix filters={filters} onDrillDown={handleDrillDown} />

      {/* Profile Completion Detail Table (advanced data table + filters) */}
      <div ref={tableRef}>
        <IncompleteProfilesTable
          filters={filters}
          value={drillDownFilters}
          onChange={setDrillDownFilters}
        />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Verify in the browser (V14, V15)**

With `npm run dev` running, open `http://localhost:3000/learners/analytics?tab=profile-completion` as a super admin.

- The matrix card renders above the detail table with 5 group columns and a bold total row.
- Switch *Field group* to "Contact Details" — 7 field columns appear; "Student Email" shows a large count for the school-type institutions.
- Click the "Student Email" cell for one institution. The page scrolls to the detail table, the filter bar shows that institution and `Missing Student Email`, and the table's total matches the cell (V14).
- Resize to 320px width: the matrix scrolls horizontally **inside its card**; the page body does not (V15). The first column stays pinned.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/learners/analytics/_components/profile-completion-tab.tsx" "app/(routes)/learners/analytics/_components/incomplete-profiles-table.tsx"
git commit -m "feat(learners): matrix drives the profile-completion drill-down

Filter state lifts from the table to the tab so a matrix cell click can set it.
Drill-down widens the scope to all profiles, because a cell may count fields
outside the four-field completeness definition."
```

---

**Batch 2 gate.** `npx vitest run lib/`, `npm run typecheck`, plus the browser checks in Task 5 Step 4 (single-institution principal sees one row) and Task 7 Step 4 (cell click matches table total).

---

# Batch 3 — Row-level multi-field filter

## Task 8: PostgREST predicate builder and row blank detection

**Files:**
- Create: `lib/db/learner-missing-fields-filter.ts`
- Test: `lib/db/__tests__/learner-missing-fields-filter.test.ts`

**Interfaces:**
- Consumes: `FIELD_BY_KEY`, `LEARNER_PROFILE_FIELDS`, `isKnownFieldKey` (Task 1).
- Produces:
  - `type ProfileMissingMatch = 'any' | 'all'`
  - `function blankOrFragments(field: LearnerProfileFieldDef): string[]`
  - `function buildMissingFieldsOrExpr(keys: string[], match: ProfileMissingMatch): string | null`
  - `function parseMissingFieldsParams(searchParams: URLSearchParams): { keys: string[]; match: ProfileMissingMatch }`
  - `function fieldAppliesToRow(field: LearnerProfileFieldDef, row: MissingFieldsRowInput): boolean`
  - `function isRowFieldBlank(field: LearnerProfileFieldDef, row: MissingFieldsRowInput): boolean`
  - `function missingFieldLabelsForRow(row: MissingFieldsRowInput): string[]`
  - `const MISSING_FIELDS_SELECT_COLUMNS: string`
  - `interface MissingFieldsRowInput { [column: string]: unknown; accommodation_type?: { name?: string | null } | null; bus_required?: boolean | null }`

**Verified PostgREST behaviour** (measured 2026-07-30 against production; these forms are why the builder is shaped this way):

| expression | rows | SQL equivalent | ✓ |
|---|---|---|---|
| `or=(college_email.is.null,college_email.eq.)` | 1,058 | 1,058 | ✓ |
| `or=(tenth_marks->>percentage.is.null,tenth_marks->>percentage.eq.)` | 2,587 | 2,587 | ✓ JSON path operands work, unquoted key |
| `or=(and(or(a…),or(b…)))` | 566 | 566 | ✓ nested and-of-ors works |
| flat any-of-2 | 2,655 | 2,655 | ✓ |
| three repeated `or=` params | 566 | 566 | ✓ repeated params are ANDed |

- [ ] **Step 1: Write the failing test**

Create `lib/db/__tests__/learner-missing-fields-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FIELD_BY_KEY, LEARNER_PROFILE_FIELDS } from '@/lib/constants/learner-profile-fields';
import {
  blankOrFragments,
  buildMissingFieldsOrExpr,
  parseMissingFieldsParams,
  fieldAppliesToRow,
  isRowFieldBlank,
  missingFieldLabelsForRow,
  MISSING_FIELDS_SELECT_COLUMNS,
} from '../learner-missing-fields-filter';

describe('blankOrFragments', () => {
  it('emits only is.null for uuid columns', () => {
    expect(blankOrFragments(FIELD_BY_KEY.get('section_id')!)).toEqual(['section_id.is.null']);
  });

  it('emits is.null AND eq. for text columns', () => {
    // Verified: student_email has 0 NULLs and 2,166 empty strings, so is.null
    // alone returns nothing.
    expect(blankOrFragments(FIELD_BY_KEY.get('student_email')!)).toEqual([
      'student_email.is.null',
      'student_email.eq.',
    ]);
  });

  it('emits an unquoted JSON path per sub-key for marks columns', () => {
    expect(blankOrFragments(FIELD_BY_KEY.get('tenth_marks')!)).toEqual([
      'tenth_marks->>max_marks.is.null',
      'tenth_marks->>max_marks.eq.',
      'tenth_marks->>obtained_marks.is.null',
      'tenth_marks->>obtained_marks.eq.',
      'tenth_marks->>percentage.is.null',
      'tenth_marks->>percentage.eq.',
    ]);
  });
});

describe('buildMissingFieldsOrExpr', () => {
  it('is null for no keys, so the caller omits the filter entirely', () => {
    expect(buildMissingFieldsOrExpr([], 'any')).toBeNull();
    expect(buildMissingFieldsOrExpr(['nonsense_column'], 'any')).toBeNull();
  });

  it('flattens fragments for any-of', () => {
    expect(buildMissingFieldsOrExpr(['college_email', 'section_id'], 'any')).toBe(
      'college_email.is.null,college_email.eq.,section_id.is.null'
    );
  });

  it('nests and(or(...)) for all-of', () => {
    expect(buildMissingFieldsOrExpr(['college_email', 'student_email'], 'all')).toBe(
      'and(or(college_email.is.null,college_email.eq.),or(student_email.is.null,student_email.eq.))'
    );
  });

  it('collapses a single field to the flat form regardless of match', () => {
    // and(or(x)) with one child is needless nesting; the two are equivalent.
    const flat = 'college_email.is.null,college_email.eq.';
    expect(buildMissingFieldsOrExpr(['college_email'], 'any')).toBe(flat);
    expect(buildMissingFieldsOrExpr(['college_email'], 'all')).toBe(flat);
  });

  it('drops unknown keys but keeps the known ones', () => {
    // A stale bookmark degrades to a wider result rather than a 400.
    expect(buildMissingFieldsOrExpr(['section_id', 'group:basic_details', 'x'], 'any')).toBe(
      'section_id.is.null'
    );
  });

  it('never emits a group rollup key as a column', () => {
    expect(buildMissingFieldsOrExpr(['group:contact_details'], 'any')).toBeNull();
  });

  it('deduplicates repeated keys', () => {
    expect(buildMissingFieldsOrExpr(['section_id', 'section_id'], 'any')).toBe('section_id.is.null');
  });
});

describe('parseMissingFieldsParams', () => {
  it('reads a comma list and the match mode', () => {
    const sp = new URLSearchParams('missingFields=college_email,section_id&missingMatch=all');
    expect(parseMissingFieldsParams(sp)).toEqual({
      keys: ['college_email', 'section_id'],
      match: 'all',
    });
  });

  it('defaults the match to any', () => {
    const sp = new URLSearchParams('missingFields=college_email');
    expect(parseMissingFieldsParams(sp).match).toBe('any');
  });

  it('rejects an unrecognised match mode rather than trusting it', () => {
    const sp = new URLSearchParams('missingFields=college_email&missingMatch=sql');
    expect(parseMissingFieldsParams(sp).match).toBe('any');
  });

  it('still honours the legacy single missingField param', () => {
    // Existing links and bookmarks must keep working.
    const sp = new URLSearchParams('missingField=admission_year_id');
    expect(parseMissingFieldsParams(sp)).toEqual({
      keys: ['admission_year_id'],
      match: 'any',
    });
  });

  it('prefers missingFields when both are present', () => {
    const sp = new URLSearchParams('missingFields=section_id&missingField=college_email');
    expect(parseMissingFieldsParams(sp).keys).toEqual(['section_id']);
  });

  it('is empty when neither param is present', () => {
    expect(parseMissingFieldsParams(new URLSearchParams()).keys).toEqual([]);
  });

  it('drops blanks from a trailing comma', () => {
    const sp = new URLSearchParams('missingFields=section_id,');
    expect(parseMissingFieldsParams(sp).keys).toEqual(['section_id']);
  });
});

describe('fieldAppliesToRow', () => {
  const hostelField = FIELD_BY_KEY.get('hostel_category_id')!;
  const routeField = FIELD_BY_KEY.get('transport_route_id')!;

  it('is always true for unconditional fields', () => {
    expect(fieldAppliesToRow(FIELD_BY_KEY.get('college_email')!, {})).toBe(true);
  });

  it('gates hostel fields on the accommodation type name, case-insensitively', () => {
    expect(fieldAppliesToRow(hostelField, { accommodation_type: { name: 'Hostel' } })).toBe(true);
    expect(fieldAppliesToRow(hostelField, { accommodation_type: { name: ' hostel ' } })).toBe(true);
    expect(fieldAppliesToRow(hostelField, { accommodation_type: { name: 'Day Scholar' } })).toBe(false);
    expect(fieldAppliesToRow(hostelField, {})).toBe(false);
  });

  it('gates transport fields on day scholar AND bus_required', () => {
    expect(
      fieldAppliesToRow(routeField, { accommodation_type: { name: 'Day Scholar' }, bus_required: true })
    ).toBe(true);
    expect(
      fieldAppliesToRow(routeField, { accommodation_type: { name: 'Day Scholar' }, bus_required: false })
    ).toBe(false);
    expect(
      fieldAppliesToRow(routeField, { accommodation_type: { name: 'Day Scholar' }, bus_required: null })
    ).toBe(false);
    expect(fieldAppliesToRow(routeField, { accommodation_type: { name: 'Hostel' }, bus_required: true })).toBe(false);
  });
});

describe('isRowFieldBlank', () => {
  it('treats null and undefined uuid as blank', () => {
    const field = FIELD_BY_KEY.get('section_id')!;
    expect(isRowFieldBlank(field, { section_id: null })).toBe(true);
    expect(isRowFieldBlank(field, {})).toBe(true);
    expect(isRowFieldBlank(field, { section_id: 'abc' })).toBe(false);
  });

  it('treats empty and whitespace text as blank', () => {
    const field = FIELD_BY_KEY.get('student_email')!;
    expect(isRowFieldBlank(field, { student_email: '' })).toBe(true);
    expect(isRowFieldBlank(field, { student_email: '   ' })).toBe(true);
    expect(isRowFieldBlank(field, { student_email: null })).toBe(true);
    expect(isRowFieldBlank(field, { student_email: 'a@b.c' })).toBe(false);
  });

  it('requires every sub-key of a marks column', () => {
    const field = FIELD_BY_KEY.get('tenth_marks')!;
    expect(isRowFieldBlank(field, { tenth_marks: null })).toBe(true);
    expect(isRowFieldBlank(field, { tenth_marks: {} })).toBe(true);
    expect(isRowFieldBlank(field, { tenth_marks: { max_marks: '500', obtained_marks: '450' } })).toBe(true);
    expect(
      isRowFieldBlank(field, { tenth_marks: { max_marks: '500', obtained_marks: '450', percentage: '90' } })
    ).toBe(false);
  });

  it('treats a non-object marks value as blank', () => {
    expect(isRowFieldBlank(FIELD_BY_KEY.get('tenth_marks')!, { tenth_marks: 'oops' })).toBe(true);
  });
});

describe('missingFieldLabelsForRow', () => {
  it('lists labels for blank applicable fields only', () => {
    const labels = missingFieldLabelsForRow({
      college_email: null,
      section_id: 'sec-1',
      accommodation_type: { name: 'Day Scholar' },
      bus_required: false,
      hostel_category_id: null, // blank but not applicable to a day scholar
    });
    expect(labels).toContain('College Email');
    expect(labels).not.toContain('Section');
    expect(labels).not.toContain('Hostel Room Category');
  });

  it('includes a conditional field when it does apply', () => {
    const labels = missingFieldLabelsForRow({
      accommodation_type: { name: 'Hostel' },
      hostel_category_id: null,
    });
    expect(labels).toContain('Hostel Room Category');
  });

  it('returns labels in catalogue order', () => {
    const labels = missingFieldLabelsForRow({});
    const catalogueOrder = LEARNER_PROFILE_FIELDS
      .filter((f) => f.appliesWhen === 'always')
      .map((f) => f.label);
    expect(labels).toEqual(catalogueOrder);
  });
});

describe('MISSING_FIELDS_SELECT_COLUMNS', () => {
  it('names every catalogue column exactly once', () => {
    const named = MISSING_FIELDS_SELECT_COLUMNS.split(',').map((s) => s.trim()).filter(Boolean);
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(named).toContain(field.column);
    }
    expect(new Set(named).size).toBe(named.length);
  });

  it('includes bus_required, which no field owns but appliesWhen needs', () => {
    expect(MISSING_FIELDS_SELECT_COLUMNS).toContain('bus_required');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/db/__tests__/learner-missing-fields-filter.test.ts`
Expected: FAIL — cannot resolve `../learner-missing-fields-filter`.

- [ ] **Step 3: Write the builder**

Create `lib/db/learner-missing-fields-filter.ts`:

```ts
// ============================================
// MISSING-FIELDS ROW FILTER
// ============================================
// Created: 2026-07-30
// Purpose: Turn a set of catalogue field keys into a PostgREST `or=` expression,
//          and decide per row which fields are actually missing.
//
// Every expression shape here was verified against production on 2026-07-30 by
// comparing PostgREST result counts with the equivalent SQL:
//   or=(col.is.null,col.eq.)                              1058 == 1058
//   or=(tenth_marks->>percentage.is.null,...eq.)          2587 == 2587
//   or=(and(or(a...),or(b...)))                            566 ==  566
//   flat any-of-two                                       2655 == 2655
//   three repeated or= params (ANDed)                      566 ==  566
// ============================================

import {
  FIELD_BY_KEY,
  LEARNER_PROFILE_FIELDS,
  type LearnerProfileFieldDef,
} from '@/lib/constants/learner-profile-fields';

/** 'any' = missing at least one of the selected fields; 'all' = missing every one. */
export type ProfileMissingMatch = 'any' | 'all';

/** A learner row carrying at least the catalogue columns plus the applies-when inputs. */
export interface MissingFieldsRowInput {
  [column: string]: unknown;
  /** Embedded `accommodation_type:accommodation_types(name)`. */
  accommodation_type?: { name?: string | null } | null;
  bus_required?: boolean | null;
}

/**
 * PostgREST `or=` fragments that are true when the field is blank.
 *
 * Text columns need BOTH `is.null` and `eq.` — some columns store only NULL,
 * some only '', and roll_number / permanent_address_taluk use both. Emitting
 * just `is.null` is what made the old filter report 0 learners missing
 * student_email.
 */
export function blankOrFragments(field: LearnerProfileFieldDef): string[] {
  const col = field.column;

  switch (field.blankRule) {
    case 'uuid':
      return [`${col}.is.null`];

    case 'text':
      return [`${col}.is.null`, `${col}.eq.`];

    case 'marks':
      // The JSON key is NOT quoted inside an or= expression — verified.
      return (field.marksKeys ?? []).flatMap((markKey) => [
        `${col}->>${markKey}.is.null`,
        `${col}->>${markKey}.eq.`,
      ]);
  }
}

/**
 * One `or=` value covering the whole selection, or null when nothing valid was
 * selected (the caller then omits the filter).
 *
 * Deliberately ONE param. The route already relies on repeated `or=` params
 * being ANDed for its completion scope and its search; expressing the whole
 * field selection as a single additional param keeps that count at three, which
 * is the highest arrangement verified.
 */
export function buildMissingFieldsOrExpr(
  keys: string[],
  match: ProfileMissingMatch
): string | null {
  const seen = new Set<string>();
  const fields: LearnerProfileFieldDef[] = [];

  for (const key of keys) {
    if (seen.has(key)) continue;
    // Allowlisted via the catalogue, so a group rollup key or an arbitrary
    // string can never reach PostgREST as a column name.
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;
    seen.add(key);
    fields.push(field);
  }

  if (fields.length === 0) return null;

  // One field: and(or(x)) is needless nesting and identical in meaning.
  if (fields.length === 1 || match === 'any') {
    return fields.flatMap(blankOrFragments).join(',');
  }

  return `and(${fields.map((field) => `or(${blankOrFragments(field).join(',')})`).join(',')})`;
}

/**
 * Read the field selection off a query string.
 *
 * `missingField` (singular) is the pre-2026-07-30 param and is still honoured so
 * existing links keep resolving; `missingFields` wins when both are present.
 * Unknown keys are dropped downstream by buildMissingFieldsOrExpr rather than
 * rejected here — a stale bookmark should widen, not 400.
 */
export function parseMissingFieldsParams(searchParams: URLSearchParams): {
  keys: string[];
  match: ProfileMissingMatch;
} {
  const plural = searchParams.get('missingFields');
  const legacy = searchParams.get('missingField');
  const raw = plural ?? legacy ?? '';

  const rawMatch = searchParams.get('missingMatch');
  const match: ProfileMissingMatch = rawMatch === 'all' ? 'all' : 'any';

  return {
    keys: raw.split(',').map((key) => key.trim()).filter(Boolean),
    match,
  };
}

/** Whether this field is required of this particular learner. */
export function fieldAppliesToRow(
  field: LearnerProfileFieldDef,
  row: MissingFieldsRowInput
): boolean {
  if (field.appliesWhen === 'always') return true;

  const accommodation = String(row.accommodation_type?.name ?? '').trim().toUpperCase();

  if (field.appliesWhen === 'hostel') return accommodation === 'HOSTEL';
  return accommodation === 'DAY SCHOLAR' && row.bus_required === true;
}

/** Whether this field carries no value on this row. Mirrors `blankSql`. */
export function isRowFieldBlank(
  field: LearnerProfileFieldDef,
  row: MissingFieldsRowInput
): boolean {
  const value = row[field.column];

  switch (field.blankRule) {
    case 'uuid':
      return value === null || value === undefined;

    case 'text':
      return value === null || value === undefined || String(value).trim() === '';

    case 'marks': {
      if (value === null || value === undefined || typeof value !== 'object') return true;
      const marks = value as Record<string, unknown>;
      if (Object.keys(marks).length === 0) return true;
      return (field.marksKeys ?? []).some((markKey) => {
        const sub = marks[markKey];
        return sub === null || sub === undefined || String(sub).trim() === '';
      });
    }
  }
}

/** Labels of every applicable-and-blank field, in catalogue order. */
export function missingFieldLabelsForRow(row: MissingFieldsRowInput): string[] {
  return LEARNER_PROFILE_FIELDS.filter(
    (field) => fieldAppliesToRow(field, row) && isRowFieldBlank(field, row)
  ).map((field) => field.label);
}

/**
 * Scalar columns a row must carry for the two functions above to work.
 *
 * `bus_required` belongs to no field but gates the two transport fields. Naming
 * a column that does not exist would make PostgREST return 42703 and silently
 * blank the whole embedded selection, so this list is generated, not typed.
 */
export const MISSING_FIELDS_SELECT_COLUMNS: string = [
  ...new Set([...LEARNER_PROFILE_FIELDS.map((field) => field.column), 'bus_required']),
].join(',\n        ');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/db/__tests__/learner-missing-fields-filter.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add lib/db/learner-missing-fields-filter.ts lib/db/__tests__/learner-missing-fields-filter.test.ts
git commit -m "feat(learners): PostgREST predicate builder for missing-field filters

Text columns emit both is.null and eq. — emitting only is.null is what made the
old filter report 0 learners missing student_email when 2,166 were. Marks
columns use verified unquoted JSON-path operands. any/all collapse to a single
or= param so the route's repeated-param count stays at the verified three."
```

---

## Task 9: Extend the drill-down API route

**Files:**
- Modify: `app/api/learners/analytics/incomplete-profiles/route.ts`
- Modify: `types/learner-dashboard.ts`
- Modify: `hooks/use-learner-profiles.ts`

**Interfaces:**
- Consumes: `parseMissingFieldsParams`, `buildMissingFieldsOrExpr`, `missingFieldLabelsForRow`, `MISSING_FIELDS_SELECT_COLUMNS`, `ProfileMissingMatch` (Task 8).
- Produces:
  - `IncompleteProfilesFilters.missingFields?: string[]` and `.missingMatch?: ProfileMissingMatch` replace `.missingField`.
  - `IncompleteProfileDetail.missingFields` now spans the full catalogue.
  - The route accepts `missingFields` + `missingMatch`, still accepts `missingField`.

- [ ] **Step 1: Update the types**

In `types/learner-dashboard.ts`, inside `interface IncompleteProfilesFilters`, replace:

```ts
  /** Narrow to profiles missing this specific field. */
  missingField?: ProfileMissingFieldFilter;
```

with:

```ts
  /**
   * Narrow to profiles missing these catalogue fields. Keys come from
   * lib/constants/learner-profile-fields.ts.
   */
  missingFields?: string[];
  /** How to combine several missingFields. Defaults to 'any' server-side. */
  missingMatch?: ProfileMissingMatch;
```

Add to the imports at the top of the file:

```ts
import type { ProfileMissingMatch } from '@/lib/db/learner-missing-fields-filter';
export type { ProfileMissingMatch };
```

Leave `ProfileMissingFieldFilter`, `PROFILE_MISSING_FIELD_LABELS`, `ProfileRequiredField` and `PROFILE_REQUIRED_FIELD_LABELS` in place for now — Task 10 removes the two that become unreferenced. Removing them here would break `incomplete-profiles-filters.tsx` mid-batch.

Also extend the row type — replace:

```ts
  missingFields: string[];
```

with:

```ts
  /** Labels of every applicable-and-blank catalogue field, in catalogue order. */
  missingFields: string[];
  /** Labels of the four completeness-defining fields that are blank. */
  missingRequiredFields: string[];
```

- [ ] **Step 2: Update the query serialiser**

In `hooks/use-learner-profiles.ts`, in `buildIncompleteProfilesQuery`, replace:

```ts
  if (filters.missingField) params.set('missingField', filters.missingField);
```

with:

```ts
  if (filters.missingFields?.length) {
    params.set('missingFields', filters.missingFields.join(','));
  }
  if (filters.missingMatch) params.set('missingMatch', filters.missingMatch);
```

- [ ] **Step 3: Update the route**

In `app/api/learners/analytics/incomplete-profiles/route.ts`:

**3a.** Replace the `FILTERABLE_MISSING_FIELDS` constant and its comment block (lines ~39-49) with nothing — the catalogue is now the allowlist. Update the imports:

```ts
// BEFORE
import {
  PROFILE_FIELD_MISSING,
  type IncompleteProfileDetail,
  type ProfileCompletionScope,
} from '@/types/learner-dashboard';
```

```ts
// AFTER
import {
  PROFILE_FIELD_MISSING,
  type IncompleteProfileDetail,
  type ProfileCompletionScope,
} from '@/types/learner-dashboard';
import {
  buildMissingFieldsOrExpr,
  missingFieldLabelsForRow,
  parseMissingFieldsParams,
  MISSING_FIELDS_SELECT_COLUMNS,
} from '@/lib/db/learner-missing-fields-filter';
```

**3b.** Widen the `.select()`. Replace the select string with:

```ts
    let query = supabase
      .from('learners_profiles')
      .select(
        `
        id,
        lifecycle_status,
        application_id,
        created_at,
        is_profile_complete,
        ${MISSING_FIELDS_SELECT_COLUMNS},
        program:programs(id, program_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name),
        admission_year:admission_years(id, admission_year_name),
        accommodation_type:accommodation_types(name)
      `,
        { count: 'exact' }
      );
```

Note: `first_name`, `last_name`, `college_email`, `roll_number`, `academic_year_id`, `admission_year_id`, `semester_id` and `section_id` are all catalogue columns, so `MISSING_FIELDS_SELECT_COLUMNS` already names them — do not list them twice or PostgREST returns a duplicate-column error.

**3c.** Replace the missing-field filter block:

```ts
// BEFORE
    const missingField = searchParams.get('missingField');
    if (missingField && FILTERABLE_MISSING_FIELDS.has(missingField)) {
      query = query.is(missingField, null);
    }
```

```ts
// AFTER
    // "Show me only learners missing <fields>". Built from the catalogue's blank
    // rules, so a NOT NULL text column that stores '' for "not answered" is
    // matched — `.is(col, null)` alone reported 0 learners missing student_email
    // when 2,166 were. One `or=` param regardless of how many fields are picked.
    const { keys: missingFieldKeys, match: missingMatch } =
      parseMissingFieldsParams(searchParams);
    const missingFieldsExpr = buildMissingFieldsOrExpr(missingFieldKeys, missingMatch);
    if (missingFieldsExpr) {
      query = query.or(missingFieldsExpr);
    }
```

**3d.** Replace the per-row missing-field computation:

```ts
// BEFORE
      const missingFields: string[] = [];

      for (const field of REQUIRED_FIELDS) {
        if (!row[field.column]) missingFields.push(field.label);
      }
```

```ts
// AFTER
      // Two lists, deliberately: the badges show every catalogue field that is
      // blank, while completeness stays defined by the four required ones.
      const missingFields = missingFieldLabelsForRow(row);
      const missingRequiredFields: string[] = [];

      for (const field of REQUIRED_FIELDS) {
        if (!row[field.column]) missingRequiredFields.push(field.label);
      }
```

**3e.** Update the two places that consumed the old variable:

```ts
// BEFORE
      if (missingFields.length === 0 && row.is_profile_complete !== true) {
        staleIds.push(row.id);
      }
```

```ts
// AFTER
      // Stale-flag detection stays on the four required fields — the flag has
      // never meant "all 33 fields present".
      if (missingRequiredFields.length === 0 && row.is_profile_complete !== true) {
        staleIds.push(row.id);
      }
```

and in the returned object:

```ts
// BEFORE
        missingFields,
        missing_fields_label: missingFields.join(', '),
        ...
        is_profile_complete: missingFields.length === 0,
```

```ts
// AFTER
        missingFields,
        missingRequiredFields,
        missing_fields_label: missingFields.join(', '),
        ...
        is_profile_complete: missingRequiredFields.length === 0,
```

**3f.** Update the route's doc comment — replace the `missingField` line with:

```
 * - missingFields  : comma-separated catalogue field keys (see
 *                    lib/constants/learner-profile-fields.ts). `missingField`
 *                    (singular) is still accepted for older links.
 * - missingMatch   : any (default) | all
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `incomplete-profiles-filters.tsx` and `incomplete-profiles-table.tsx`, which still pass `missingField`. Task 10 fixes those. If any *other* file errors, it consumed `missingField` too — fix it there.

- [ ] **Step 5: Verify the route against SQL**

With `npm run dev` running and signed in as a super admin, compare the API's `total` against SQL for each case:

```
/api/learners/analytics/incomplete-profiles?completion=all&limit=1&missingFields=student_email
   -> total ~2166   (the old missingField=student_email would have returned 0)

/api/learners/analytics/incomplete-profiles?completion=all&limit=1&missingFields=college_email,student_email&missingMatch=any
   -> total ~2655

/api/learners/analytics/incomplete-profiles?completion=all&limit=1&missingFields=college_email,student_email&missingMatch=all
   -> total ~566

/api/learners/analytics/incomplete-profiles?completion=all&limit=1&missingFields=tenth_marks
   -> total ~2606   (strict all-sub-keys rule)

/api/learners/analytics/incomplete-profiles?completion=all&limit=1&missingField=admission_year_id
   -> total ~1889   (legacy param still works)
```

Cross-check each with `execute_sql`. **`any` must be greater than or equal to `all` for the same field set** — that is the invariant; the absolute figures drift with live data.

Also confirm V11: pick any returned row and check that `college_email`, `student_email` and `tenth_marks` are present in the JSON (not `undefined`). A uniformly-absent field means the `.select()` named a nonexistent column and PostgREST swallowed a 42703.

- [ ] **Step 6: Commit**

```bash
git add app/api/learners/analytics/incomplete-profiles/route.ts types/learner-dashboard.ts hooks/use-learner-profiles.ts
git commit -m "feat(learners): drill-down filters on any catalogue field, any/all

missingFields replaces missingField (still accepted). Blank rules come from the
catalogue, so student_email now matches 2,166 rows instead of 0. Row badges span
all 33 fields while completeness stays defined by the four required ones."
```

---

## Task 10: Grouped multi-select picker and the filter bar

**Files:**
- Create: `app/(routes)/learners/analytics/_components/missing-fields-picker.tsx`
- Modify: `app/(routes)/learners/analytics/_components/incomplete-profiles-filters.tsx`
- Modify: `app/(routes)/learners/analytics/_components/incomplete-profiles-table.tsx`
- Modify: `types/learner-dashboard.ts`

**Interfaces:**
- Consumes: catalogue (Task 1), `ProfileMissingMatch` (Task 8).
- Produces:
  - `interface MissingFieldsPickerProps { value: string[]; onChange: (next: string[]) => void; disabledKeys?: Set<string>; disabledHint?: string }`
  - `function MissingFieldsPicker(props): JSX.Element`
  - `ProfileCompletionFilterState` gains `missingFields: string[]` and `missingMatch: ProfileMissingMatch`, losing `missingField`.

- [ ] **Step 1: Write the picker**

Create `app/(routes)/learners/analytics/_components/missing-fields-picker.tsx`:

```tsx
'use client';
// ============================================
// MISSING FIELDS PICKER
// ============================================
// Created: 2026-07-30
// Purpose: Grouped, searchable multi-select over the 33-field catalogue for the
//          Profile Completion drill-down's "Missing Field" filter.
//
// Purpose-built rather than extending SearchableSelect, which is single-select
// by contract. Follows the Command + CommandGroup + CommandItem multi-select
// pattern already used by components/ui/multi-role-selector.tsx.
// ============================================

import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  FIELD_BY_KEY,
  PROFILE_FIELD_GROUPS,
  PROFILE_FIELD_GROUP_LABELS,
  fieldsInGroup,
} from '@/lib/constants/learner-profile-fields';

export interface MissingFieldsPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Keys that cannot be picked in the current scope. */
  disabledKeys?: Set<string>;
  /** Tooltip shown on a disabled row explaining why. */
  disabledHint?: string;
}

export function MissingFieldsPicker({
  value,
  onChange,
  disabledKeys,
  disabledHint,
}: MissingFieldsPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);

  const toggle = (key: string) => {
    if (disabledKeys?.has(key)) return;
    onChange(selected.has(key) ? value.filter((k) => k !== key) : [...value, key]);
  };

  const label =
    value.length === 0
      ? 'Any missing field'
      : value.length === 1
      ? `Missing ${FIELD_BY_KEY.get(value[0])?.label ?? value[0]}`
      : `${value.length} fields selected`;

  return (
    <div className='space-y-1.5'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            className='w-full justify-between font-normal'
          >
            <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
              {label}
            </span>
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[--radix-popover-trigger-width] p-0' align='start'>
          <Command>
            <CommandInput placeholder='Search fields…' />
            <CommandList className='max-h-72'>
              <CommandEmpty>No matching field.</CommandEmpty>
              {PROFILE_FIELD_GROUPS.map((group) => (
                <CommandGroup key={group} heading={PROFILE_FIELD_GROUP_LABELS[group]}>
                  {fieldsInGroup(group).map((field) => {
                    const isDisabled = disabledKeys?.has(field.key) ?? false;
                    return (
                      <CommandItem
                        key={field.key}
                        value={`${field.label} ${field.key}`}
                        disabled={isDisabled}
                        onSelect={() => toggle(field.key)}
                        title={isDisabled ? disabledHint : undefined}
                        className={cn(isDisabled && 'opacity-50')}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selected.has(field.key) ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {field.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          {value.map((key) => (
            <Badge key={key} variant='secondary' className='gap-1 pr-1 text-xs'>
              {FIELD_BY_KEY.get(key)?.label ?? key}
              <button
                type='button'
                onClick={() => onChange(value.filter((k) => k !== key))}
                className='rounded-sm hover:bg-muted-foreground/20'
                aria-label={`Remove ${FIELD_BY_KEY.get(key)?.label ?? key}`}
              >
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rework the filter bar**

In `incomplete-profiles-filters.tsx`:

**2a.** Replace the imports from `@/types/learner-dashboard` and add the new ones:

```tsx
import {
  PROFILE_FIELD_MISSING,
  type IncompleteProfileFilterOptions,
  type ProfileCompletionScope,
  type ProfileFilterOption,
  type ProfileMissingMatch,
} from '@/types/learner-dashboard';
import { PROFILE_REQUIRED_FIELD_KEYS } from '@/lib/constants/learner-profile-fields';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MissingFieldsPicker } from './missing-fields-picker';
```

`PROFILE_REQUIRED_FIELD_KEYS` already exists — Task 1 exports it.

**2b.** Replace the state shape:

```tsx
// BEFORE
export interface ProfileCompletionFilterState {
  completion: ProfileCompletionScope;
  missingField: ProfileMissingFieldFilter | typeof ALL;
```

```tsx
// AFTER
export interface ProfileCompletionFilterState {
  completion: ProfileCompletionScope;
  /** Catalogue field keys. Empty means "any missing field". */
  missingFields: string[];
  /** How to combine several missingFields. */
  missingMatch: ProfileMissingMatch;
```

and the defaults:

```tsx
// BEFORE
  missingField: ALL,
```

```tsx
// AFTER
  missingFields: [],
  missingMatch: 'any',
```

**2c.** Delete `MISSING_FIELD_OPTIONS` and `conflictsWithCompleteScope`, replacing the latter with a set-based version:

```tsx
/**
 * Fields that cannot be missing on a complete profile. Selecting one under the
 * "Complete profiles" scope would guarantee an empty table. Admission year is
 * absent on purpose — a complete profile can legitimately lack one, and most do.
 */
function conflictingKeys(completion: ProfileCompletionScope): Set<string> {
  return completion === 'complete' ? new Set(PROFILE_REQUIRED_FIELD_KEYS) : new Set();
}
```

**2d.** Fix the active-filter count, which currently compares by identity and would read a fresh empty array as active:

```tsx
// BEFORE
  const activeFilterCount = (
    Object.keys(DEFAULT_PROFILE_COMPLETION_FILTERS) as (keyof ProfileCompletionFilterState)[]
  ).filter((key) => value[key] !== DEFAULT_PROFILE_COMPLETION_FILTERS[key]).length;
```

```tsx
// AFTER
  // missingFields is an array, so an identity comparison against the default
  // would count every fresh render as an active filter.
  const activeFilterCount = (
    Object.keys(DEFAULT_PROFILE_COMPLETION_FILTERS) as (keyof ProfileCompletionFilterState)[]
  ).filter((key) => {
    const current = value[key];
    const fallback = DEFAULT_PROFILE_COMPLETION_FILTERS[key];
    if (Array.isArray(current)) return current.length > 0;
    return current !== fallback;
  }).length;
```

**2e.** Replace the "Profile Completion" select's `onValueChange` so it prunes conflicting picks:

```tsx
            onValueChange={(next) => {
              const completion = next as ProfileCompletionScope;
              const conflicting = conflictingKeys(completion);
              set({
                completion,
                // Drop any field a complete profile cannot be missing, rather
                // than leaving a selection that guarantees an empty table.
                missingFields: value.missingFields.filter((key) => !conflicting.has(key)),
              });
            }}
```

**2f.** Replace the whole "2. Missing Field" block with the picker plus the match toggle:

```tsx
        {/* 2. Missing Field — multi-select over the full catalogue */}
        <div className='space-y-1.5 min-w-0'>
          <Label className='text-xs text-muted-foreground'>Missing Field</Label>
          <MissingFieldsPicker
            value={value.missingFields}
            onChange={(missingFields) => set({ missingFields })}
            disabledKeys={conflictingKeys(value.completion)}
            disabledHint='A complete profile always has this field'
          />
          {value.missingFields.length > 1 && (
            <RadioGroup
              value={value.missingMatch}
              onValueChange={(next) => set({ missingMatch: next as ProfileMissingMatch })}
              className='flex items-center gap-4 pt-1'
            >
              <div className='flex items-center gap-1.5'>
                <RadioGroupItem value='any' id='missing-match-any' />
                <Label htmlFor='missing-match-any' className='text-xs font-normal'>
                  Missing any
                </Label>
              </div>
              <div className='flex items-center gap-1.5'>
                <RadioGroupItem value='all' id='missing-match-all' />
                <Label htmlFor='missing-match-all' className='text-xs font-normal'>
                  Missing all
                </Label>
              </div>
            </RadioGroup>
          )}
        </div>
```

- [ ] **Step 3: Update the table's fetch and export subtitle**

In `incomplete-profiles-table.tsx`:

**3a.** Replace the imports from `@/types/learner-dashboard`:

```tsx
import {
  PROFILE_FIELD_MISSING,
  type IncompleteProfileDetail,
  type LearnerDashboardFilters,
  type ProfileFilterOption,
} from '@/types/learner-dashboard';
import { FIELD_BY_KEY } from '@/lib/constants/learner-profile-fields';
```

**3b.** In `fetchData`, replace the `missingField` line and add the match, and update the dep array:

```tsx
// BEFORE
        missingField: omitAll(fieldFilters.missingField) as
          | ProfileMissingFieldFilter
          | undefined,
```

```tsx
// AFTER
        missingFields: fieldFilters.missingFields.length
          ? fieldFilters.missingFields
          : undefined,
        missingMatch: fieldFilters.missingFields.length > 1
          ? fieldFilters.missingMatch
          : undefined,
```

```tsx
// BEFORE (dep array)
      fieldFilters.missingField,
```

```tsx
// AFTER — a stable primitive; the array identity changes every render
      missingFieldsKey,
      fieldFilters.missingMatch,
```

and above `fetchData`, add:

```tsx
  // Stable primitive key: depending on the array directly would rebuild
  // fetchData (and refetch) on every parent render.
  const missingFieldsKey = useMemo(
    () => fieldFilters.missingFields.join(','),
    [fieldFilters.missingFields]
  );
```

Then inside `fetchData`, derive the array from the key so the callback has no stale-array capture:

```tsx
        missingFields: missingFieldsKey ? missingFieldsKey.split(',') : undefined,
```

**3c.** Update `exportSubtitle` — replace the missing-field clause:

```tsx
// BEFORE
    if (fieldFilters.missingField !== ALL) {
      parts.push(`Missing ${PROFILE_MISSING_FIELD_LABELS[fieldFilters.missingField]}`);
    }
```

```tsx
// AFTER
    if (fieldFilters.missingFields.length > 0) {
      const labels = fieldFilters.missingFields
        .map((key) => FIELD_BY_KEY.get(key)?.label ?? key)
        .join(', ');
      parts.push(
        fieldFilters.missingFields.length > 1
          ? `Missing ${fieldFilters.missingMatch === 'all' ? 'all' : 'any'} of: ${labels}`
          : `Missing ${labels}`
      );
    }
```

- [ ] **Step 4: Remove the superseded types**

In `types/learner-dashboard.ts`, delete `ProfileMissingFieldFilter` and `PROFILE_MISSING_FIELD_LABELS`. Keep `ProfileRequiredField` and `PROFILE_REQUIRED_FIELD_LABELS` only if something still imports them:

```bash
grep -rn "ProfileMissingFieldFilter\|PROFILE_MISSING_FIELD_LABELS\|PROFILE_REQUIRED_FIELD_LABELS" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Delete each symbol that returns no hits outside its own declaration.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean, except for `profile-completion-tab.tsx` if Task 7 has not run yet.

- [ ] **Step 6: Verify in the browser**

On `?tab=profile-completion`:
- The Missing Field control opens a grouped, searchable list of 33 fields under 5 headings.
- Select "College Email" and "Student Email" — chips appear, the any/all radio appears, and switching to "Missing all" reduces the row count (any ≥ all).
- Set scope to "Complete profiles" — the four required fields grey out with the hint, and any already-selected one is dropped.
- Clear Filters resets the chips and the badge count returns to zero.

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/learners/analytics/_components/missing-fields-picker.tsx" "app/(routes)/learners/analytics/_components/incomplete-profiles-filters.tsx" "app/(routes)/learners/analytics/_components/incomplete-profiles-table.tsx" types/learner-dashboard.ts
git commit -m "feat(learners): grouped multi-select Missing Field filter with any/all

Also fixes the active-filter badge, which compared the array by identity and
would have counted every render as an active filter."
```

---

## Task 11: Row badges and export over the full catalogue

**Files:**
- Modify: `app/(routes)/learners/analytics/_components/incomplete-profiles-columns.tsx`

**Interfaces:**
- Consumes: `IncompleteProfileDetail.missingFields` / `.missingRequiredFields` (Task 9); catalogue labels and groups (Task 1).
- Produces: unchanged exports — `incompleteProfilesColumns`, `transformIncompleteProfileForExport`, `INCOMPLETE_PROFILES_EXPORT_HEADERS`, `INCOMPLETE_PROFILES_EXPORT_MAPPING`, `INCOMPLETE_PROFILES_EXPORT_WIDTHS`, `INCOMPLETE_PROFILES_PDF_HEADERS`.

- [ ] **Step 1: Replace the per-label colour map with a per-group one**

In `incomplete-profiles-columns.tsx`, replace:

```tsx
/** Badge colour per missing-field label. */
export const MISSING_FIELD_COLORS: Record<string, string> = {
  'College Email': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Academic Year': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Semester: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Section: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};
```

with:

```tsx
/**
 * Badge colour per field GROUP, not per label — 33 hand-written label entries
 * would go stale the first time the catalogue changes. Looked up by label
 * because that is what the API sends on the row.
 */
const GROUP_BADGE_CLASSES: Record<ProfileFieldGroup, string> = {
  admin_assignment: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  basic_details: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  academic_information: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  contact_details: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  accommodation: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

const GROUP_BY_LABEL: ReadonlyMap<string, ProfileFieldGroup> = new Map(
  LEARNER_PROFILE_FIELDS.map((field) => [field.label, field.group])
);

/** Neutral fallback: a label the catalogue no longer knows still renders. */
export function missingFieldBadgeClass(label: string): string {
  const group = GROUP_BY_LABEL.get(label);
  return group ? GROUP_BADGE_CLASSES[group] : 'bg-muted text-muted-foreground';
}
```

Add the imports:

```tsx
import {
  LEARNER_PROFILE_FIELDS,
  type ProfileFieldGroup,
} from '@/lib/constants/learner-profile-fields';
```

- [ ] **Step 2: Cap the badges shown per row**

Find the column whose cell renders `row.original.missingFields` as badges and replace its `cell` with:

```tsx
    cell: ({ row }) => {
      const labels = row.original.missingFields;
      if (labels.length === 0) {
        return <span className='text-sm text-muted-foreground'>None</span>;
      }
      // A learner can be missing 20+ fields; rendering them all makes the row
      // unreadable and the table scroll. Show the first four, count the rest,
      // and put the complete list in the title attribute and the export.
      const shown = labels.slice(0, 4);
      const overflow = labels.length - shown.length;
      return (
        <div className='flex flex-wrap gap-1' title={labels.join(', ')}>
          {shown.map((label) => (
            <Badge
              key={label}
              variant='secondary'
              className={cn('text-xs font-normal', missingFieldBadgeClass(label))}
            >
              {label}
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge variant='outline' className='text-xs font-normal'>
              +{overflow} more
            </Badge>
          )}
        </div>
      );
    },
```

Add `import { cn } from '@/lib/utils';` if it is not already imported.

- [ ] **Step 3: Add a missing-count column and export header**

Add this column definition immediately before the actions column:

```tsx
  {
    accessorKey: 'missing_field_count',
    header: 'Missing Count',
    cell: ({ row }) => (
      <span className='tabular-nums text-sm'>{row.original.missingFields.length}</span>
    ),
    enableSorting: false, // The API sorts on real columns only.
    size: 110,
    minSize: 90,
  },
```

In `transformIncompleteProfileForExport`, add:

```tsx
    missing_field_count: profile.missingFields.length,
    missing_required_fields_label: profile.missingRequiredFields.join(', '),
```

and add `'missing_field_count'` and `'missing_required_fields_label'` to `INCOMPLETE_PROFILES_EXPORT_HEADERS`, with entries in `INCOMPLETE_PROFILES_EXPORT_MAPPING` (`missing_field_count: 'Missing Count'`, `missing_required_fields_label: 'Missing Required Fields'`) and `INCOMPLETE_PROFILES_EXPORT_WIDTHS` (`15` and `40`).

- [ ] **Step 4: Typecheck and verify**

Run: `npm run typecheck`

In the browser, on `?tab=profile-completion` with scope "All profiles": rows show up to 4 coloured badges plus a `+N more` chip, hovering shows the full list, and the Missing Count column is populated. Export to Excel and confirm the `Missing Fields`, `Missing Count` and `Missing Required Fields` columns are all present and consistent.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/learners/analytics/_components/incomplete-profiles-columns.tsx"
git commit -m "feat(learners): full-catalogue missing-field badges, count column and export

Badge colours key off the field GROUP rather than 33 hand-written labels. Rows
cap at four badges plus a +N chip; the full list stays in the title and export."
```

---

**Batch 3 gate.** `npx vitest run lib/` green; `npm run typecheck` clean; Task 9 Step 5's `any >= all` invariant holds and `missingFields=student_email` returns ~2,166 rather than 0.

---

# Batch 4 — Stats correctness and data-driven charts

## Task 12: Fix the profile-completion counts in the service

**Files:**
- Modify: `lib/services/learner-profile-service.ts` (region `1726-1787`)

**Interfaces:**
- Consumes: the deployed RPC (Task 3); `MissingFieldsRpcRow` (Task 4).
- Produces: no signature change. `ProfileCompletionStats.missingCollegeEmail` / `missingAcademicYear` / `missingSemester` / `missingSection` keep their names and types but become **filter-correct and blank-aware**.

**Why this task exists.** The six profile-completion count queries apply **only `filters.institutionIds`** — the academic-year, degree, department, program, semester, section, date-range and gender filters are silently dropped (`service:1728-1775`). Three consumers read these numbers: the Profile tab funnel, `overview-tab.tsx:454-472`, and `export-dashboard-dialog.tsx:269-272`. They are also computed three inconsistent ways: `missingCollegeEmail` is blank-aware (`.or('…is.null,…eq.')`) while the other three use a bare `.is(…)`.

- [ ] **Step 1: Extract a shared filter applier**

Add this private static method to `LearnerProfileService`, immediately above `getDashboardStats`:

```ts
  /**
   * Apply the dashboard filter set to a learners_profiles query.
   *
   * Extracted because the profile-completion counts below used to inline only
   * `institutionIds` — so the Profile and Overview tabs ignored the dashboard's
   * academic-year, department, date and gender filters entirely. One applier
   * means the count queries and the total query can no longer drift.
   */
  private static applyCompletionFilters(
    query: any,
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters
  ): any {
    let next = query;

    if (filters.institutionIds && filters.institutionIds.length > 0) {
      next = next.in('institution_id', filters.institutionIds);
    }
    if (filters.academicYearId) next = next.eq('academic_year_id', filters.academicYearId);
    if (filters.degreeId) next = next.eq('degree_id', filters.degreeId);
    if (filters.departmentId) next = next.eq('department_id', filters.departmentId);
    if (filters.programId) next = next.eq('program_id', filters.programId);
    if (filters.semesterId) next = next.eq('semester_id', filters.semesterId);
    if (filters.sectionId) next = next.eq('section_id', filters.sectionId);
    if (filters.gender) next = next.eq('gender', filters.gender);
    if (filters.dateRange) {
      next = next
        .gte('created_at', filters.dateRange.from.toISOString())
        .lte('created_at', filters.dateRange.to.toISOString());
    }

    return next;
  }
```

Note: `lifecycleStatuses` is deliberately excluded, matching the base `totalCount` query, whose comment at `service:1604` records that filtering the enum here caused type errors and moved to the RPC.

- [ ] **Step 2: Replace the six count queries with two counts plus one RPC**

Replace everything from the `// Profile completion stats - Use server-side counts…` comment through the closing `});` of the debug log (`service:1726-1787`) with:

```ts
      // Profile completion stats.
      //
      // Two flag-based counts (the KPI cards count the stored flag by design —
      // spec D4) plus ONE aggregate RPC for every per-field tally. That RPC
      // replaces four head-count queries AND fixes two bugs they had: they
      // applied only institutionIds, and only college_email was blank-aware.
      let completeQuery = supabase
        .from('learners_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_profile_complete', true);
      completeQuery = this.applyCompletionFilters(completeQuery, filters);
      const { count: completeProfilesCount } = await completeQuery;

      let incompleteQuery = supabase
        .from('learners_profiles')
        .select('*', { count: 'exact', head: true })
        .or('is_profile_complete.eq.false,is_profile_complete.is.null');
      incompleteQuery = this.applyCompletionFilters(incompleteQuery, filters);
      const { count: incompleteProfilesCount } = await incompleteQuery;

      const completionRate =
        totalCount > 0 ? ((completeProfilesCount || 0) / totalCount) * 100 : 0;

      // Awaiting activation - approved learners ready to be activated.
      const awaitingActivation = approvedCount;

      // Missing-field tallies, summed across institutions from the one RPC.
      // Summing per field across institutions is sound: a learner belongs to
      // exactly one institution.
      const missingByField = await safeQuery(
        this.getMissingFieldTotals(filters, supabase),
        {} as Record<string, number>,
        'getMissingFieldTotals'
      );

      const missingCollegeEmail = missingByField['college_email'] ?? 0;
      const missingAcademicYear = missingByField['academic_year_id'] ?? 0;
      const missingSemester = missingByField['semester_id'] ?? 0;
      const missingSection = missingByField['section_id'] ?? 0;

      console.log('[learners/analytics] Profile completion stats:', {
        totalCount,
        completeProfilesCount: completeProfilesCount || 0,
        incompleteProfilesCount: incompleteProfilesCount || 0,
        completionRate: completionRate.toFixed(2) + '%',
        missingCollegeEmail,
        missingAcademicYear,
        missingSemester,
        missingSection,
      });
```

Then delete the later duplicate `const awaitingActivation = approvedCount;` and `const completionRate = …` lines if the replaced region left them behind — search for a second declaration of each and remove it (they are declared above now).

- [ ] **Step 3: Add the RPC helper**

Add this private static method next to the other distribution helpers (near `getDistributionByInstitution`, around `service:2230`):

```ts
  /**
   * Missing-count per catalogue field, summed across institutions.
   *
   * One call to get_learners_missing_fields_by_institution. The RPC honours all
   * 12 filters, which is what makes these numbers respond to the dashboard
   * filter panel — the four head-count queries this replaced did not.
   */
  private static async getMissingFieldTotals(
    filters: import('@/types/learner-dashboard').LearnerDashboardFilters,
    supabaseClient?: any
  ): Promise<Record<string, number>> {
    const supabase = supabaseClient || createClientSupabaseClient();

    const { data, error } = await supabase.rpc(
      'get_learners_missing_fields_by_institution',
      {
        filter_institution_ids: filters.institutionIds || null,
        filter_academic_year_id: filters.academicYearId || null,
        filter_degree_id: filters.degreeId || null,
        filter_department_id: filters.departmentId || null,
        filter_program_id: filters.programId || null,
        filter_semester_id: filters.semesterId || null,
        filter_section_id: filters.sectionId || null,
        filter_lifecycle_statuses: filters.lifecycleStatuses || null,
        filter_gender: filters.gender || null,
        filter_is_profile_complete: filters.isProfileComplete ?? null,
        filter_date_from: filters.dateRange?.from?.toISOString() || null,
        filter_date_to: filters.dateRange?.to?.toISOString() || null,
      }
    );

    if (error) {
      console.error('[learners/analytics] Error in getMissingFieldTotals:', error);
      throw error;
    }

    const totals: Record<string, number> = {};
    for (const row of (data || []) as Array<{ field_key: string; missing_count: number | string }>) {
      const count = Number(row.missing_count) || 0;
      totals[row.field_key] = (totals[row.field_key] ?? 0) + count;
    }

    return totals;
  }
```

- [ ] **Step 4: Hoist `safeQuery` so Step 2 can use it**

`safeQuery` is declared inside `getDashboardStats` at `service:1636`, **before** the `Promise.all`, and the replaced region sits after it — so it is already in scope. Confirm by reading `service:1636` and the line number of your new `missingByField` call; if the call is above the declaration, move the `safeQuery` const above the base-count query instead of changing anything else.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Verify V13 — the tab now responds to the filter panel**

With `npm run dev`, as a super admin on `/learners/analytics?tab=profile-completion`:

1. Note the funnel's "College Email … N missing".
2. Open the dashboard filter panel and pick a single **Department**.
3. The funnel's missing counts must **drop**. Before this task they did not move at all.
4. Cross-check one number with SQL, substituting the department id:

```sql
select count(*) filter (where college_email is null or btrim(college_email) = '') as missing_college_email
from learners_profiles
where department_id = '<department-uuid>';
```

5. Switch to the Overview tab with the same filter applied — its four missing-field figures must match the funnel's.

- [ ] **Step 7: Commit**

```bash
git add lib/services/learner-profile-service.ts
git commit -m "fix(learners): profile-completion counts now honour every dashboard filter

The six count queries applied only institutionIds, so the Profile and Overview
tabs and the dashboard export ignored the academic-year, department, program,
date and gender filters entirely. One applyCompletionFilters helper plus one
aggregate RPC replaces four head-counts, and makes all four figures blank-aware
(only college_email was before)."
```

---

## Task 13: Data-driven bar chart, funnel and recommendations

**Files:**
- Modify: `app/(routes)/learners/analytics/_components/profile-completion-tab.tsx`

**Interfaces:**
- Consumes: `useMissingFieldsMatrix` (Task 5), `topMissingFields` (Task 4), catalogue (Task 1), `handleDrillDown` (Task 7).
- Produces: no new exports.

- [ ] **Step 1: Fetch the matrix once for the whole tab**

The matrix card already fetches it; React Query dedupes by key, so calling `useMissingFieldsMatrix(filters)` again in the tab is a cache hit, not a second request. Add near the top of `ProfileCompletionTab`:

```tsx
  // Same query key as MissingFieldsMatrix uses, so this is a cache hit rather
  // than a second request.
  const { data: matrix } = useMissingFieldsMatrix(filters);

  // The worst 10 fields across the whole scope, by share of applicable missing.
  const worstFields = useMemo(
    () => (matrix ? topMissingFields(matrix.total, 10) : []),
    [matrix]
  );
```

Add the imports:

```tsx
import { useMemo } from 'react';
import { useMissingFieldsMatrix } from '@/hooks/use-learner-profiles';
import { topMissingFields } from '@/lib/services/learners/missing-fields-matrix';
import {
  fieldsInGroup,
  PROFILE_FIELD_GROUP_LABELS,
} from '@/lib/constants/learner-profile-fields';
```

- [ ] **Step 2: Replace the hardcoded `missingFieldsData`**

Replace the whole `const missingFieldsData = [ … ].filter(field => field.count > 0);` block (lines ~96-118) with:

```tsx
  // Was four hardcoded fields off the stats payload. Now the worst 10 of 33,
  // ranked by share of the population the field actually applies to — which is
  // what stops a conditional field like hostel room category from topping the
  // chart on the strength of learners it does not apply to.
  const missingFieldsData = worstFields.map((field) => ({
    name: field.label,
    fieldKey: field.fieldKey,
    count: field.missing,
    percentage: field.share * 100,
  }));
```

`CustomTooltip` already reads `payload[0].payload.name`, `.value` and `.percentage`, so it needs no change.

- [ ] **Step 3: Make the bar chart cells drill down**

In the `<Bar>` inside the Missing Fields Breakdown card, add a click handler:

```tsx
                    <Bar
                      dataKey='count'
                      radius={[8, 8, 0, 0]}
                      onClick={(entry: any) => {
                        if (entry?.payload?.fieldKey) {
                          handleDrillDown({
                            institutionId: null,
                            fieldKeys: [entry.payload.fieldKey],
                          });
                        }
                      }}
                      className='cursor-pointer'
                    >
```

Also add `interval={0}` and `angle={-35}` with `textAnchor='end'` and `height={80}` to the `<XAxis>` — ten field labels do not fit horizontally where four did:

```tsx
                    <XAxis
                      dataKey='name'
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-35}
                      textAnchor='end'
                      height={80}
                    />
```

- [ ] **Step 4: Replace the four copy-pasted funnel blocks with one loop**

Replace the entire contents of the funnel `<CardContent>`'s `<div className="space-y-4">` — the four `{/* Step N: … */}` blocks, but **not** the final `{/* Final: Complete Profiles */}` block — with:

```tsx
            {/* One row per Admin Assignment field. Was four copy-pasted blocks
                differing only in which stat they read. */}
            {fieldsInGroup('admin_assignment').map((field) => {
              const cell = matrix?.total.cells[field.key];
              const applicable = cell?.applicable ?? 0;
              const missing = cell?.missing ?? 0;
              const present = applicable - missing;
              const percent = applicable > 0 ? (present / applicable) * 100 : 0;

              return (
                <div key={field.key} className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='font-medium'>{field.label}</span>
                    <span className='text-muted-foreground'>
                      {present.toLocaleString()} / {applicable.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={percent} className='h-3' />
                  <div className='flex justify-between text-xs text-muted-foreground'>
                    <span>{percent.toFixed(1)}% complete</span>
                    {missing > 0 && (
                      <button
                        type='button'
                        onClick={() =>
                          handleDrillDown({ institutionId: null, fieldKeys: [field.key] })
                        }
                        className='text-orange-600 hover:underline'
                      >
                        {missing.toLocaleString()} missing
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
```

The funnel now covers **five** fields — Admission Year joins the four — because the group is the catalogue's, not a hand-written list. Update the card's `CardDescription` to `Step-by-step completion breakdown by admin assignment field`.

Leave the `{/* Final: Complete Profiles */}` block exactly as it is: it reports the frozen four-field definition off `profileCompletion`, which Task 12 keeps flag-based.

- [ ] **Step 5: Make the recommendations data-driven**

Replace the four hand-written `{profileCompletion.X > 0 && ( … )}` blocks inside the Recommendations `<CardContent>` with:

```tsx
          <div className='space-y-3'>
            {worstFields.slice(0, 4).map((field) => (
              <div
                key={field.fieldKey}
                className='flex items-start gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/10'
              >
                <AlertTriangle className='mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600' />
                <div className='flex-1'>
                  <p className='text-sm font-medium text-blue-900 dark:text-blue-100'>
                    {field.missing.toLocaleString()} learner{field.missing === 1 ? '' : 's'} missing{' '}
                    {field.label}
                  </p>
                  <p className='mt-1 text-xs text-blue-700 dark:text-blue-300'>
                    {(field.share * 100).toFixed(0)}% of the{' '}
                    {field.applicable.toLocaleString()} learners this field applies to.{' '}
                    {PROFILE_FIELD_GROUP_LABELS[
                      // Group label tells the reader which form section to fix it on.
                      (FIELD_BY_KEY.get(field.fieldKey)?.group ?? 'basic_details')
                    ]}{' '}
                    section.
                  </p>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  className='flex-shrink-0'
                  onClick={() =>
                    handleDrillDown({ institutionId: null, fieldKeys: [field.fieldKey] })
                  }
                >
                  View
                </Button>
              </div>
            ))}

            {profileCompletion.critical > 0 && (
              <div className='flex items-start gap-3 rounded-lg bg-red-50 p-3 dark:bg-red-950/10'>
                <XCircle className='mt-0.5 h-5 w-5 flex-shrink-0 text-red-600' />
                <div>
                  <p className='text-sm font-medium text-red-900 dark:text-red-100'>
                    {profileCompletion.critical} profile
                    {profileCompletion.critical > 1 ? 's' : ''} in critical state (&lt;50% complete)
                  </p>
                  <p className='mt-1 text-xs text-red-700 dark:text-red-300'>
                    Prioritise these profiles for immediate data completion
                  </p>
                </div>
              </div>
            )}

            {profileCompletion.awaitingActivation > 0 && (
              <div className='flex items-start gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-950/10'>
                <CheckCircle2 className='mt-0.5 h-5 w-5 flex-shrink-0 text-green-600' />
                <div>
                  <p className='text-sm font-medium text-green-900 dark:text-green-100'>
                    {profileCompletion.awaitingActivation} profile
                    {profileCompletion.awaitingActivation > 1 ? 's' : ''} ready for activation
                  </p>
                  <p className='mt-1 text-xs text-green-700 dark:text-green-300'>
                    Review and activate these complete profiles to update their lifecycle status
                  </p>
                </div>
              </div>
            )}

            {worstFields.length === 0 && profileCompletion.critical === 0 && (
              <p className='text-sm text-muted-foreground'>
                No missing-field gaps in the current scope.
              </p>
            )}
          </div>
```

Add `FIELD_BY_KEY` to the catalogue import.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean. Remove any now-unused imports the linter flags (`CHART_COLORS` is still used by the bar cells; `TIER_COLORS` by the pie).

- [ ] **Step 7: Verify**

On `?tab=profile-completion`:
- The bar chart shows up to 10 fields, ranked by share, labels angled and legible. Clicking a bar filters the table to that field.
- The funnel shows five Admin Assignment rows including Admission Year; each "N missing" is a link that filters the table.
- Recommendations list the four worst fields with their group name and a working View button.
- Apply a Department filter in the dashboard panel — the bar chart, funnel and recommendations all change together.
- Network tab: **one** request to `missing-fields-matrix` per filter change, not two (React Query dedupe).

- [ ] **Step 8: Commit**

```bash
git add "app/(routes)/learners/analytics/_components/profile-completion-tab.tsx"
git commit -m "feat(learners): data-driven missing-fields chart, funnel and recommendations

Bar chart ranks the worst 10 of 33 fields by share of the population each field
applies to. The funnel is one loop over the Admin Assignment group instead of
four copy-pasted blocks, so Admission Year joins it. Every figure drills down."
```

---

**Batch 4 gate.** `npx vitest run lib/` green; `npm run typecheck` clean; V13 confirmed (department filter moves the funnel's numbers, Overview agrees); one matrix request per filter change.

---

## Verification traceability

Every gate from the spec's §7, and where it is checked:

| spec | check | task |
|---|---|---|
| V1 | RPC exists, `prosecdef = false`, 12 args | 3.5 |
| V2 | `hostel_category_id` ≈ 183 not 6,350 | 3.6 |
| V3 | `transport_route_id` ≈ 47 not 5,904 | 3.6 |
| V4 | `student_email` ≈ 2,166 not 0 | 3.6, 9.5 |
| V5 | `roll_number` ≈ 2,020 (NULL + '') | 3.6 |
| V6 | per-institution `college_email` matches §3.6 | 3.6 |
| V7 | `(unassigned)` bucket present | 3.6 |
| V8 | one seq scan under a real principal | 3.5 + measured 366 ms pre-plan |
| V9 | 33 field keys + 5 group keys | 2 (unit), 3.6 (DB) |
| V9b | rollup bounds, and strictly below the sum | 3.7 |
| V10 | any/all semantics | pre-verified against production; 8 (unit), 9.5 (route) |
| V11 | no silently-blank field (42703 guard) | 9.5 |
| V12 | single-institution principal sees one row | 5.4 |
| V13 | dashboard filter panel moves the numbers | 12.6 |
| V14 | matrix cell click matches the table total | 7.4 |
| V15 | 320px, no body h-scroll | 7.4 |

## Deviations from the spec

Recorded here rather than silently absorbed:

1. **§7's absolute counts are reference values, not equality assertions.** The production row count moved (7,159 → 7,156) between two measurements minutes apart. Tasks 3 and 9 assert invariants exactly (`missing ≤ applicable ≤ learner_count`; `max ≤ rollup ≤ min(sum, total)`; `any ≥ all`) and the magnitudes within a tolerance.

2. **§5.4's "a smoke test pins this" became pre-implementation verification.** All five PostgREST forms were measured against production before the plan was written, so Task 8's tests assert the exact expression *strings* the verified behaviour requires rather than re-probing HTTP.

3. **The funnel gains a fifth row.** Driving it from `fieldsInGroup('admin_assignment')` includes Admission Year, which the four hand-written blocks omitted. The spec said "one `.map()` over the catalogue's admin-assignment group", so this follows from it — but it is a visible change to an existing chart.

4. **`IncompleteProfileDetail` gains `missingRequiredFields`.** The spec said row badges span the full catalogue while `is_profile_complete` still reflects the four. That needs both lists on the row, which the spec did not name.

5. **Task 7 must run after Task 10.** It sets `missingFields`/`missingMatch` on the filter state, which Task 10 introduces. Noted in Task 7's preamble.

6. **The matrix response shape is `{ rows, total, generatedAt }`, not §5.3's `{ institutions, fields, generatedAt }`.** The spec sketched a separate `fields` array; the plan folds the per-field data into each row's `cells` map instead. Same information, one fewer join for the renderer, and the field catalogue is already available client-side so shipping it in the payload would be redundant. `total` is a full `MissingFieldsMatrixRow` so the card, the bar chart and the funnel all read it the same way as an institution row.
