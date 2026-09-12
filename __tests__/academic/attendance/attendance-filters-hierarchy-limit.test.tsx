// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => cleanup());

/**
 * BUG-003190 (PR #3420) — the attendance search filters must ask the hierarchy
 * services for the WHOLE list. Every one of DegreeService / ProgramService /
 * DepartmentService / SemesterService / SectionService pages at
 * `filters.limit || 10` ordered by created_at desc, so a dropdown that omits
 * `limit` silently shows only the 10 newest-created rows and the rest look like
 * missing data. The sibling dashboard-filters.tsx already carries this fix.
 *
 * The hooks are mocked to behave like the services: they return
 * `rows.slice(0, filters.limit ?? 10)`. A 12-row semester list (a 5-year
 * programme with odd/even semesters plus internship rows) must reach the
 * component intact.
 */

const SEMESTER_ROWS = Array.from({ length: 12 }, (_, i) => ({
  id: `sem-${i + 1}`,
  semester_name: `Semester ${i + 1}`,
  semester_code: `S${i + 1}`
}));

function pagedLike(rows: Array<{ id: string }>) {
  return (filters: { limit?: number }) => ({
    data: { data: rows.slice(0, filters.limit ?? 10) },
    refetch: vi.fn()
  });
}

const useDegreesMock = vi.fn(pagedLike([]));
const useProgramsMock = vi.fn(pagedLike([]));
const useDepartmentsMock = vi.fn(pagedLike([]));
const useSemestersMock = vi.fn(pagedLike(SEMESTER_ROWS));
const useSectionsMock = vi.fn(pagedLike([]));

vi.mock('@/hooks/organization/use-degrees', () => ({
  useDegrees: (f: any) => useDegreesMock(f)
}));
vi.mock('@/hooks/organization/use-programs', () => ({
  usePrograms: (f: any) => useProgramsMock(f)
}));
vi.mock('@/hooks/organization/use-departments', () => ({
  useDepartments: (f: any) => useDepartmentsMock(f)
}));
vi.mock('@/hooks/organization/use-semesters', () => ({
  useSemesters: (f: any) => useSemestersMock(f)
}));
vi.mock('@/hooks/organization/use-sections', () => ({
  useSections: (f: any) => useSectionsMock(f)
}));
vi.mock('@/hooks/organization/use-institutions-with-access', () => ({
  useInstitutionsWithAccess: () => ({ institutions: [], refetch: vi.fn() })
}));
vi.mock('@/hooks/academic/use-academic-years', () => ({
  useAcademicYearsByInstitution: () => ({ academicYears: [] })
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isSuperAdmin: false })
}));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { id: 'staff-1', role: 'faculty' }, isLoading: false, error: null })
}));
vi.mock('@/hooks/use-adaptive-labels', () => ({
  useAdaptiveLabels: () => (s: string) => s
}));
vi.mock('@/lib/services/academic/attendance-service', () => ({
  AttendanceService: { getTimetableTypeForSemester: vi.fn().mockResolvedValue('semester') }
}));
vi.mock('@/lib/services/organization/department-service', () => ({
  DepartmentService: { getDepartment: vi.fn() }
}));

import { AttendanceFilters } from '@/app/(routes)/academic/attendance/_components/attendance-filters';

const searchContext: any = {
  attendance_date: '2026-04-07',
  institution_id: 'inst-1',
  academic_year_id: 'ay-1',
  degree_id: 'deg-1',
  department_id: 'dept-1',
  program_id: 'prog-1',
  semester_id: '',
  section_id: ''
};

describe('AttendanceFilters hierarchy dropdowns (BUG-003190)', () => {
  it('asks every hierarchy lookup for more than the 10-row default page', () => {
    render(
      <AttendanceFilters searchContext={searchContext} onContextChange={vi.fn()} loading={false} />
    );

    for (const [name, mock] of [
      ['degrees', useDegreesMock],
      ['programs', useProgramsMock],
      ['departments', useDepartmentsMock],
      ['semesters', useSemestersMock],
      ['sections', useSectionsMock]
    ] as const) {
      expect(mock, name).toHaveBeenCalled();
      const filters = mock.mock.calls[0][0];
      expect(filters.limit, `${name} limit`).toBeGreaterThan(10);
    }
  });

  it('receives all 12 semesters of a long programme, not the first 10', () => {
    render(
      <AttendanceFilters searchContext={searchContext} onContextChange={vi.fn()} loading={false} />
    );

    const { limit } = useSemestersMock.mock.calls[0][0];
    expect(SEMESTER_ROWS.slice(0, limit ?? 10)).toHaveLength(12);
  });
});
