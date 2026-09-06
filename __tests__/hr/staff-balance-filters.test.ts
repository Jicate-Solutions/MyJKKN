/**
 * Staff Balances tab — filter predicate and facet counts.
 *
 * The invariant under test is the one that broke /hr/payroll/organisation: a
 * facet option that advertises "(N)" must produce exactly N rows when selected.
 * Counting options against the unfiltered array satisfies the type checker and
 * still renders a bare "No results." for the user, so only an assertion tying
 * the two together catches it.
 */

import { describe, expect, it } from 'vitest';

import {
  ANY,
  EMPTY_FILTERS,
  FACET_PROJECTIONS,
  UNASSIGNED,
  activeFilterKeys,
  buildFacet,
  countWith,
  findBlockingFilters,
  matchesStaffBalanceFilters,
  type StaffBalanceFilters,
} from '@/app/(routes)/hr/admin/leave-balances/_components/staff-balance-filters';
import type { HRStaffBalanceRow } from '@/types/hr-leave-staff-balances';

const NO_FLAGS = { missing_rows: 0, negative: 0, overdrawn: 0, off_policy: 0 };

function row(over: Partial<HRStaffBalanceRow> = {}): HRStaffBalanceRow {
  const name = over.name ?? 'Asha Kumar';
  return {
    employee_id: Math.random().toString(36).slice(2),
    staff_code: 'E001',
    name,
    department_id: 'dept-a',
    department: 'Prosthodontics',
    designation: 'Professor',
    // Derived from the name so each row is distinct — a shared default email
    // would make every email search match everything and hide a real bug.
    email: `${name.split(' ')[0].toLowerCase()}@jkkn.ac.in`,
    gender: 'female',
    category_id: 'cat-teach',
    category_name: 'Teaching',
    is_teaching: true,
    role_key: 'faculty',
    role_name: 'Facilitator',
    balances: {},
    flags: { ...NO_FLAGS },
    ...over,
  };
}

/** A set shaped like a real institution: mixed departments, cadres, flags. */
const ROWS: HRStaffBalanceRow[] = [
  row({ name: 'Asha Kumar', staff_code: 'E001' }),
  row({ name: 'Bala Raj', staff_code: 'E002', designation: 'Reader' }),
  row({
    name: 'Chitra Devi',
    staff_code: 'E003',
    department_id: 'dept-b',
    department: 'Orthodontics',
    designation: 'Professor',
    flags: { ...NO_FLAGS, negative: 1 },
  }),
  row({
    // Non-teaching, no department at all — the Main Office shape.
    name: 'Dinesh M',
    staff_code: 'E004',
    department_id: null,
    department: null,
    designation: 'Driver',
    gender: 'male',
    category_id: 'cat-driver',
    category_name: 'Driver',
    is_teaching: false,
    role_key: 'driver',
    role_name: 'Driver',
    flags: { ...NO_FLAGS, missing_rows: 2 },
  }),
  row({
    name: 'Elango S',
    staff_code: 'E005',
    department_id: null,
    department: null,
    designation: null,
    gender: null,
    category_id: null,
    category_name: null,
    is_teaching: null,
    role_key: null,
    role_name: null,
  }),
];

const applied = (f: StaffBalanceFilters) =>
  ROWS.filter((r) => matchesStaffBalanceFilters(r, f));

describe('facet counts agree with the ANDed table', () => {
  it('every option produces exactly the row count it advertises, with no other filter set', () => {
    for (const key of ['departmentId', 'categoryId', 'designation', 'roleKey', 'gender'] as const) {
      for (const opt of buildFacet(ROWS, EMPTY_FILTERS, key, FACET_PROJECTIONS[key])) {
        const selected = { ...EMPTY_FILTERS, [key]: opt.value };
        expect(
          applied(selected).length,
          `${key}=${opt.label} advertised ${opt.count}`
        ).toBe(opt.count);
      }
    }
  });

  it('holds when a SECOND filter is already active — the case that broke payroll', () => {
    // Teaching-only narrows the set; the department facet must now count within
    // that narrowing, not across all five rows.
    const base: StaffBalanceFilters = { ...EMPTY_FILTERS, teaching: 'teaching' };
    for (const opt of buildFacet(ROWS, base, 'departmentId', FACET_PROJECTIONS.departmentId)) {
      const selected = { ...base, departmentId: opt.value };
      expect(
        applied(selected).length,
        `department ${opt.label} advertised ${opt.count} under teaching-only`
      ).toBe(opt.count);
    }
  });

  it('a facet never counts against itself', () => {
    // With Orthodontics selected, the department facet must still show
    // Prosthodontics' real count — otherwise switching departments is
    // impossible because every other option reads (0).
    const f: StaffBalanceFilters = { ...EMPTY_FILTERS, departmentId: 'dept-b' };
    const facet = buildFacet(ROWS, f, 'departmentId', FACET_PROJECTIONS.departmentId);
    expect(facet.find((o) => o.value === 'dept-a')?.count).toBe(2);
  });

  it('keeps a zero-count option listed so the selected value stays labelled', () => {
    // Driver is non-teaching, so under teaching-only its count is 0 — but it
    // must remain in the list, because that 0 is the explanation.
    const f: StaffBalanceFilters = { ...EMPTY_FILTERS, teaching: 'teaching' };
    const facet = buildFacet(ROWS, f, 'roleKey', FACET_PROJECTIONS.roleKey);
    const driver = facet.find((o) => o.value === 'driver');
    expect(driver).toBeDefined();
    expect(driver?.count).toBe(0);
  });

  it('sorts the Unassigned bucket last', () => {
    const facet = buildFacet(ROWS, EMPTY_FILTERS, 'departmentId', FACET_PROJECTIONS.departmentId);
    expect(facet.at(-1)?.value).toBe(UNASSIGNED);
  });
});

describe('predicate semantics', () => {
  it('groups null attributes into the Unassigned bucket', () => {
    const f: StaffBalanceFilters = { ...EMPTY_FILTERS, departmentId: UNASSIGNED };
    expect(applied(f).map((r) => r.name)).toEqual(['Dinesh M', 'Elango S']);
  });

  it('excludes null is_teaching from BOTH teaching buckets', () => {
    // `!row.is_teaching` would sweep the null row into non-teaching and report
    // an employment split that does not exist.
    const teaching = applied({ ...EMPTY_FILTERS, teaching: 'teaching' });
    const nonTeaching = applied({ ...EMPTY_FILTERS, teaching: 'non_teaching' });
    expect(teaching.map((r) => r.name)).not.toContain('Elango S');
    expect(nonTeaching.map((r) => r.name)).not.toContain('Elango S');
    expect(teaching.length + nonTeaching.length).toBe(ROWS.length - 1);
  });

  it('ANDs search tokens across fields rather than matching one substring', () => {
    // "professor ortho" spans designation AND department — a single substring
    // match against either field alone would miss it.
    expect(applied({ ...EMPTY_FILTERS, search: 'professor ortho' }).map((r) => r.name)).toEqual([
      'Chitra Devi',
    ]);
  });

  it('searches fields the table does not render (email, role)', () => {
    expect(applied({ ...EMPTY_FILTERS, search: 'asha@jkkn' })).toHaveLength(1);
    expect(applied({ ...EMPTY_FILTERS, search: 'facilitator' })).toHaveLength(3);
  });

  it('matches gender case-insensitively against the lowercase stored value', () => {
    expect(applied({ ...EMPTY_FILTERS, gender: 'female' })).toHaveLength(3);
    expect(applied({ ...EMPTY_FILTERS, gender: UNASSIGNED }).map((r) => r.name)).toEqual([
      'Elango S',
    ]);
  });

  it('narrows the attention facet to one flag rather than any flag', () => {
    expect(applied({ ...EMPTY_FILTERS, attention: 'any' })).toHaveLength(2);
    expect(applied({ ...EMPTY_FILTERS, attention: 'negative' }).map((r) => r.name)).toEqual([
      'Chitra Devi',
    ]);
    expect(applied({ ...EMPTY_FILTERS, attention: 'no_row' }).map((r) => r.name)).toEqual([
      'Dinesh M',
    ]);
  });

  it('treats ANY and the defaults as inactive', () => {
    expect(activeFilterKeys(EMPTY_FILTERS)).toEqual([]);
    expect(activeFilterKeys({ ...EMPTY_FILTERS, search: '   ' })).toEqual([]);
    expect(activeFilterKeys({ ...EMPTY_FILTERS, roleKey: ANY })).toEqual([]);
    expect(activeFilterKeys({ ...EMPTY_FILTERS, roleKey: 'driver', attention: 'negative' })).toEqual(
      ['roleKey', 'attention']
    );
  });

  it('countWith reports the contextual size of a fixed choice', () => {
    expect(countWith(ROWS, EMPTY_FILTERS, 'teaching', 'teaching')).toBe(3);
    const underDriver: StaffBalanceFilters = { ...EMPTY_FILTERS, roleKey: 'driver' };
    expect(countWith(ROWS, underDriver, 'teaching', 'teaching')).toBe(0);
  });
});

describe('empty-state diagnosis', () => {
  it('names the filter whose removal brings rows back', () => {
    // Driver is non-teaching, so role=driver AND teaching=teaching is empty.
    const f: StaffBalanceFilters = {
      ...EMPTY_FILTERS,
      roleKey: 'driver',
      teaching: 'teaching',
    };
    expect(applied(f)).toHaveLength(0);
    expect(findBlockingFilters(ROWS, f)).toEqual(expect.arrayContaining(['roleKey', 'teaching']));
  });

  it('suggests the OTHER filter first when one was just changed', () => {
    const f: StaffBalanceFilters = {
      ...EMPTY_FILTERS,
      roleKey: 'driver',
      teaching: 'teaching',
    };
    // The user just picked Teaching, so that is what they meant — the stale
    // Role filter is the one worth suggesting they clear.
    expect(findBlockingFilters(ROWS, f, 'teaching')[0]).toBe('roleKey');
    expect(findBlockingFilters(ROWS, f, 'roleKey')[0]).toBe('teaching');
  });

  it('returns nothing when no single filter unblocks the set', () => {
    const f: StaffBalanceFilters = { ...EMPTY_FILTERS, search: 'nobody-by-this-name' };
    expect(applied(f)).toHaveLength(0);
    expect(findBlockingFilters(ROWS, f)).toEqual(['search']);
  });
});
