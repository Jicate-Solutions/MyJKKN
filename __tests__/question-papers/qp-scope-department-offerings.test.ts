import { describe, it, expect, vi } from 'vitest';

vi.mock('@/types/internal-marks', () => ({ istToday: () => '2026-09-24' }));

import {
  resolveQpScope,
  departmentCourseCodesFor,
  isDepartmentOfferedScope,
} from '@/lib/utils/question-papers/qp-scope';

/**
 * Shape of the live 24 Sep 2026 case (BUG-006115 / BUG-005821 / BUG-005912):
 * the Zoology HOD teaches in PZO/UZO/PCH/PHI, while her department's staff teach
 * Generic Elective Zoology-I (24UZOGE1) and NME Sericulture (24UZONM2) into
 * I B.Sc Chemistry (UCH). UCH was never in her scope, so the paper never listed.
 */
type Row = Record<string, any>;
const db: Record<string, Row[]> = {
  staff: [
    { id: 'st-hod', profile_id: 'u-hod', department_id: 'd-zoo' },
    { id: 'st-peer', profile_id: 'u-peer', department_id: 'd-zoo' },
    { id: 'st-chem', profile_id: 'u-chem', department_id: 'd-chem' },
  ],
  departments: [
    { id: 'd-zoo', head_of_department_id: null },
    { id: 'd-chem', head_of_department_id: null },
  ],
  staff_plan_courses: [
    { staff_id: 'st-hod', course_id: 'c-uzo-core', staff_plan_id: 'p-uzo5' },
    { staff_id: 'st-peer', course_id: 'c-ge1', staff_plan_id: 'p-uch1' },
    { staff_id: 'st-peer', course_id: 'c-nm2', staff_plan_id: 'p-uch1' },
    { staff_id: 'st-peer', course_id: 'c-uzo-core', staff_plan_id: 'p-uzo5' },
    { staff_id: 'st-peer', course_id: 'c-old', staff_plan_id: 'p-expired' },
    { staff_id: 'st-chem', course_id: 'c-chem-core', staff_plan_id: 'p-uch1' },
  ],
  staff_plans: [
    { id: 'p-uzo5', program_id: 'pr-uzo', semester_id: 's5', is_active: true, start_date: '2026-06-15', end_date: '2026-10-31' },
    { id: 'p-uch1', program_id: 'pr-uch', semester_id: 's1', is_active: true, start_date: '2026-06-15', end_date: '2026-10-31' },
    { id: 'p-expired', program_id: 'pr-ucm', semester_id: 's1', is_active: true, start_date: '2025-06-15', end_date: '2025-10-31' },
  ],
  courses: [
    { id: 'c-uzo-core', course_code: '24UZOC08' },
    { id: 'c-ge1', course_code: '24UZOGE1' },
    { id: 'c-nm2', course_code: '24UZONM2' },
    { id: 'c-old', course_code: '24UZONM9' },
    { id: 'c-chem-core', course_code: '24UCHC01' },
  ],
  programs: [
    { id: 'pr-uzo', program_id: 'UZO' },
    { id: 'pr-uch', program_id: 'UCH' },
    { id: 'pr-ucm', program_id: 'UCM' },
  ],
  semesters: [
    { id: 's1', semester_order: 1 },
    { id: 's5', semester_order: 5 },
  ],
};

/** Minimal PostgREST-style fake: eq / in / lte / gte filters, then await or maybeSingle. */
function fakeSupabase(roleKeys: string[]) {
  const query = (table: string) => {
    let rows = [...(db[table] ?? [])];
    const q: any = {
      select: () => q,
      eq: (col: string, v: any) => ((rows = rows.filter((r) => r[col] === v)), q),
      in: (col: string, vs: any[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), q),
      lte: (col: string, v: any) => ((rows = rows.filter((r) => r[col] <= v)), q),
      gte: (col: string, v: any) => ((rows = rows.filter((r) => r[col] >= v)), q),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return {
    from: query,
    rpc: async () => ({ data: roleKeys.map((role_key) => ({ role_key })), error: null }),
  };
}

describe('resolveQpScope — HOD department offerings', () => {
  it('opens only the department courses in another department\'s program', async () => {
    const scope = await resolveQpScope(fakeSupabase(['hod']), 'u-hod', false, 'hod');
    expect(scope.level).toBe('program');
    expect(scope.programCodes).toEqual(['UZO']);
    const uch = departmentCourseCodesFor(scope, 'UCH', 1).sort();
    // Chemistry's own core paper (24UCHC01) must NOT open; the expired plan's course must not either.
    expect(uch).toEqual(['24UZOGE1', '24UZONM2']);
    expect(isDepartmentOfferedScope(scope, 'UCH', 1)).toBe(true);
    expect(isDepartmentOfferedScope(scope, 'UCH', 3)).toBe(false);
    expect(isDepartmentOfferedScope(scope, 'UCM', 1)).toBe(false);
  });

  it('does not duplicate the HOD\'s own programs as offerings', async () => {
    const scope = await resolveQpScope(fakeSupabase(['hod']), 'u-hod', false, 'hod');
    expect(departmentCourseCodesFor(scope, 'UZO')).toEqual([]);
  });

  it('gives the course tier no department offerings', async () => {
    const scope = await resolveQpScope(fakeSupabase(['faculty']), 'u-peer', false, 'faculty');
    expect(scope.level).toBe('course');
    expect(scope.departmentOfferings).toEqual([]);
  });

  it('super admin carries an empty offerings list', async () => {
    const scope = await resolveQpScope(fakeSupabase([]), 'u-x', true, null);
    expect(scope.departmentOfferings).toEqual([]);
  });
});

describe('departmentCourseCodesFor', () => {
  const scope = {
    departmentOfferings: [
      { programCode: 'UCH', semesterNumber: 1, courseCode: 'A' },
      { programCode: 'UCH', semesterNumber: 3, courseCode: 'B' },
      { programCode: 'UCM', semesterNumber: 1, courseCode: 'A' },
    ],
  };
  it('returns every semester when none is given', () => {
    expect(departmentCourseCodesFor(scope, 'UCH').sort()).toEqual(['A', 'B']);
  });
  it('returns nothing for a missing program', () => {
    expect(departmentCourseCodesFor(scope, undefined)).toEqual([]);
    expect(departmentCourseCodesFor(scope, 'UEN', 1)).toEqual([]);
  });
});
