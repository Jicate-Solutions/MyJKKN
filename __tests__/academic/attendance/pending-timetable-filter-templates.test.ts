/**
 * BUG-006094 — "I year attendance list is not available to record attendance".
 *
 * The Pending Attendance Timetable dropdown asked for `is_template: false`, but
 * "Save as Template" flags the LIVE timetable in place. At JKKN Arts and Science
 * (Aided) the first-year B.Sc timetables carry the flag and are marked daily, so
 * they were missing from the dropdown while the Pending list (which reads every
 * active timetable) could still produce rows for them.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/academic/timetable-service', () => ({
  TimetableService: { getTimetables: vi.fn() },
}));

import { buildPendingTimetableFilters } from '@/hooks/academic/use-timetables-for-pending';

describe('buildPendingTimetableFilters', () => {
  it('does not exclude template-flagged timetables', () => {
    const filters = buildPendingTimetableFilters({ institutionId: 'inst-1' });
    expect(filters).not.toHaveProperty('is_template');
  });

  it('still restricts to active timetables and passes the hierarchy through', () => {
    expect(
      buildPendingTimetableFilters({
        institutionId: 'inst-1',
        academicYearId: 'ay-1',
        departmentId: 'dept-1',
        semesterId: 'sem-1',
      })
    ).toEqual({
      institution_id: 'inst-1',
      academic_year_id: 'ay-1',
      department_id: 'dept-1',
      semester: 'sem-1',
      is_active: true,
      limit: 100,
    });
  });
});
