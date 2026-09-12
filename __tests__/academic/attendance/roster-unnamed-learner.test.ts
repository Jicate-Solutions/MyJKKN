// Added: 2026-09-12 (BUG-003176) - A learner whose profile has no first or last
// name on file must still be identifiable on the attendance marking screen.
//
// The roster card reads `student_name`, which AttendanceRosterService computes
// from the fn_attendance_roster rows. This pins the contract the card relies on:
// null/empty names collapse to 'Unknown Student', never to '' or 'null null',
// and a learner with a real name keeps it untouched.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AttendanceRosterService } from '@/lib/services/academic/attendance-roster-service';

function rosterRow(overrides: Record<string, unknown>) {
  return {
    id: 'learner-1',
    first_name: 'Asha',
    last_name: 'Kumar',
    roll_number: 'R001',
    student_photo_url: null,
    institution_id: 'inst-1',
    degree_id: 'deg-1',
    program_id: 'prog-1',
    department_id: 'dept-1',
    semester_id: 'sem-1',
    section_id: 'sec-1',
    lifecycle_status: 'active',
    ...overrides,
  };
}

const filters = { institution_id: 'inst-1', section_id: 'sec-1' };

describe('AttendanceRosterService.getStudentsForAttendance — learner with no name on file', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('falls back to "Unknown Student" when first and last name are both null', async () => {
    rpc.mockResolvedValueOnce({
      data: [rosterRow({ id: 'learner-null', first_name: null, last_name: null })],
      error: null,
    });

    const [student] = await AttendanceRosterService.getStudentsForAttendance(filters);

    expect(student.id).toBe('learner-null');
    expect(student.student_name).toBe('Unknown Student');
  });

  it('falls back to "Unknown Student" when first and last name are both empty strings', async () => {
    rpc.mockResolvedValueOnce({
      data: [rosterRow({ id: 'learner-empty', first_name: '', last_name: '   ' })],
      error: null,
    });

    const [student] = await AttendanceRosterService.getStudentsForAttendance(filters);

    expect(student.student_name).toBe('Unknown Student');
  });

  it('keeps a real name intact and trims a missing half', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        rosterRow({ id: 'learner-full' }),
        rosterRow({ id: 'learner-first-only', first_name: 'Priya', last_name: null }),
      ],
      error: null,
    });

    const students = await AttendanceRosterService.getStudentsForAttendance(filters);

    expect(students.map((s) => s.student_name)).toEqual(['Asha Kumar', 'Priya']);
  });

  it('queries fn_attendance_roster with the section scope (never learners_profiles directly)', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });

    await AttendanceRosterService.getStudentsForAttendance(filters);

    expect(rpc).toHaveBeenCalledWith(
      'fn_attendance_roster',
      expect.objectContaining({ p_institution_id: 'inst-1', p_section_ids: ['sec-1'] })
    );
  });
});
