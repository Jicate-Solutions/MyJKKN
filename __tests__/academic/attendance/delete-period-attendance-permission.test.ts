// BUG-006133 — who may undo a mis-marked period.
//
// The undo did not exist before this bug: once a slot key landed in
// attendance_data nothing could remove it, so a faculty member who marked the
// wrong period had to file a ticket. These tests fence the new permission so
// the undo stays a correction and does not become a way to erase a class.

import { describe, it, expect } from 'vitest';
import { AttendanceCoreService } from '@/lib/services/academic/attendance-core-service';

const DEPT = 'e73d1763-7479-4771-9c9e-cdea547d0205';
const INSTITUTION = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const MARKER = '66d788e7-6138-401d-9cf7-b2ca09385453';
const PERIOD_KEY = '04f71bf6-8c2e-4748-978b-27b28fcda584';
const DATE = '2026-09-16';

// 2026-09-16 18:00 IST — same business day as DATE.
const SAME_DAY = new Date('2026-09-16T12:30:00.000Z');
// 2026-09-17 09:00 IST — next business day.
const NEXT_DAY = new Date('2026-09-17T03:30:00.000Z');

const period = (overrides: any = {}) =>
  ({
    period_id: PERIOD_KEY,
    period_name: 'CET P8',
    start_time: '15:45:00',
    end_time: '16:30:00',
    course_id: 'c1',
    course_name: 'Oral Medicine',
    students: [
      { student_id: 's1', status: 'Present' },
    ],
    marked_by_details: {
      marker_id: MARKER,
      marker_name: 'MR. ARUN V P',
      marker_role: 'faculty',
      marker_email: 'arunvp@jkkn.ac.in',
      marked_at: '2026-09-16T07:39:52.259Z'
    },
    ...overrides
  }) as any;

const check = (overrides: any = {}) =>
  AttendanceCoreService.canDeletePeriodAttendance({
    period: period(),
    attendanceDate: DATE,
    record: { department_id: DEPT, institution_id: INSTITUTION },
    auditEntries: [],
    now: SAME_DAY,
    ...overrides
  });

describe('canDeletePeriodAttendance', () => {
  it('lets the person who marked it undo their own mistake the same day', () => {
    const result = check({
      actor: { id: MARKER, role: 'faculty', department_id: DEPT, institution_id: INSTITUTION }
    });
    expect(result.allowed).toBe(true);
  });

  it('refuses a different senior learner', () => {
    const result = check({
      actor: { id: 'someone-else', role: 'faculty', department_id: DEPT, institution_id: INSTITUTION }
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/only the person who marked/i);
  });

  it('refuses the marker on a later day', () => {
    const result = check({
      actor: { id: MARKER, role: 'faculty', department_id: DEPT, institution_id: INSTITUTION },
      now: NEXT_DAY
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/same day/i);
  });

  it('refuses the marker once someone else has edited the period', () => {
    const result = check({
      actor: { id: MARKER, role: 'faculty', department_id: DEPT, institution_id: INSTITUTION },
      auditEntries: [{ period_id: PERIOD_KEY, edited_by: 'a-hod' }]
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already edited/i);
  });

  it('ignores the marker’s own earlier edits', () => {
    const result = check({
      actor: { id: MARKER, role: 'faculty', department_id: DEPT, institution_id: INSTITUTION },
      auditEntries: [{ period_id: PERIOD_KEY, edited_by: MARKER }]
    });
    expect(result.allowed).toBe(true);
  });

  it('ignores edits to a different period on the same record', () => {
    const result = check({
      actor: { id: MARKER, role: 'faculty', department_id: DEPT, institution_id: INSTITUTION },
      auditEntries: [{ period_id: 'another-period', edited_by: 'a-hod' }]
    });
    expect(result.allowed).toBe(true);
  });

  it('allows a super admin unconditionally, even days later', () => {
    const result = check({
      actor: { id: 'sa', role: 'super_admin' },
      now: NEXT_DAY
    });
    expect(result.allowed).toBe(true);
  });

  it('allows a HOD inside their own department and institution', () => {
    const result = check({
      actor: { id: 'hod', role: 'hod', department_id: DEPT, institution_id: INSTITUTION },
      now: NEXT_DAY
    });
    expect(result.allowed).toBe(true);
  });

  it('refuses a HOD from another department', () => {
    const result = check({
      actor: { id: 'hod', role: 'hod', department_id: 'other-dept', institution_id: INSTITUTION }
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/own department/i);
  });

  it('refuses a HOD from another institution', () => {
    const result = check({
      actor: { id: 'hod', role: 'hod', department_id: DEPT, institution_id: 'other-institution' }
    });
    expect(result.allowed).toBe(false);
  });

  it('refuses a learner outright', () => {
    const result = check({ actor: { id: 'stu', role: 'student' } });
    expect(result.allowed).toBe(false);
  });

  it('refuses when the period is not on the record', () => {
    const result = check({
      period: undefined,
      actor: { id: 'sa', role: 'super_admin' }
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it('refuses a period with no recorded marker', () => {
    const result = check({
      period: period({ marked_by_details: undefined }),
      actor: { id: MARKER, role: 'faculty', department_id: DEPT, institution_id: INSTITUTION }
    });
    expect(result.allowed).toBe(false);
  });
});
