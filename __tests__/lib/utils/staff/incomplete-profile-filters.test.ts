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
    // Comparing a date to '' raises "invalid input syntax for type date",
    // which PostgREST surfaces as a 400 for the whole request. Both
    // date_of_birth and date_of_joining are STAFF_REQUIRED_FIELDS, so this
    // path is reachable from the default fieldScope.
    expect(missingColumnFilter('date_of_joining')).toBe('date_of_joining.is.null');
  });

  it('checks only null on a boolean column', () => {
    expect(missingColumnFilter('is_active')).toBe('is_active.is.null');
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

  // Two rows that both have a non-blank value on a real (non-missing_count)
  // column — the primary `compared * direction` line, and the id tiebreak
  // right after it, are only reachable when neither early return fires.
  const c = { id: 'c', first_name: 'Chitra', missing_count: 3, designation: 'Assistant Professor' };
  const d = { id: 'd', first_name: 'Deepak', missing_count: 1, designation: 'Professor' };

  it('orders two populated values on a real column ascending', () => {
    // 'Assistant Professor' < 'Professor' lexicographically.
    expect(compareIncompleteRows(c, d, 'designation', 'asc')).toBeLessThan(0);
  });

  it('reverses two populated values on a real column for descending', () => {
    expect(compareIncompleteRows(c, d, 'designation', 'desc')).toBeGreaterThan(0);
  });

  it('breaks a tie on a real column by id, the same way regardless of direction', () => {
    const tieA = { id: 'tie-a', first_name: 'Elan', missing_count: 4, designation: 'Professor' };
    const tieB = { id: 'tie-b', first_name: 'Farah', missing_count: 4, designation: 'Professor' };
    // The id tiebreak line has no `* direction` — it is intentionally the
    // same order both ways, so paging stays stable under either sort.
    expect(compareIncompleteRows(tieA, tieB, 'designation', 'asc')).toBeLessThan(0);
    expect(compareIncompleteRows(tieA, tieB, 'designation', 'desc')).toBeLessThan(0);
  });

  it('collates numerically, so "Item 10" sorts after "Item 9"', () => {
    const nine = { id: 'nine', first_name: 'Nine', missing_count: 1, label: 'Item 9' };
    const ten = { id: 'ten', first_name: 'Ten', missing_count: 1, label: 'Item 10' };
    // Plain string comparison would put 'Item 10' first ('1' < '9'); the
    // numeric:true collation option is what makes 9 sort before 10.
    expect(compareIncompleteRows(nine, ten, 'label', 'asc')).toBeLessThan(0);
  });
});
