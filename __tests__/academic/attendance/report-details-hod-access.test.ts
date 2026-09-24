/**
 * BUG-006125 - an HOD opening an attendance report from their own department
 * was denied ("Faculty not assigned to this report") because the details page
 * sent every HOD as 'faculty'. An HOD of the report's department + institution
 * must see the whole report; everyone else keeps the assigned-or-marker rule.
 *
 *   npx vitest run __tests__/academic/attendance/report-details-hod-access.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const tables: Record<string, any> = {};

/** A chainable PostgREST stand-in: every filter returns itself, awaits resolve to the table's rows. */
function query(table: string) {
  const result = () => ({ data: tables[table] ?? null, error: null });
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    single: () => Promise.resolve(result()),
    then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej)
  };
  return q;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: (t: string) => query(t), rpc: vi.fn() })
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

import { AttendanceReportService } from '@/lib/services/academic/attendance-report-service';

const USER = 'hod-user';

function period(facultyId: string, markerId: string) {
  return {
    period_id: `p-${facultyId}`,
    start_time: '09:00',
    assigned_faculty: [{ faculty_id: facultyId, faculty_name: 'X', is_primary: true }],
    marked_by_details: { marker_id: markerId },
    students: []
  };
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.student_attendance = {
    id: 'report-1',
    institution_id: 'inst-1',
    department_id: 'dept-1',
    attendance_data: {
      'slot-a': period('someone-else', 'other-marker'),
      'slot-b': period('another-one', 'other-marker')
    }
  };
  tables.staff = [{ id: 'hod-staff' }];
});

describe('getReportDetails - HOD access (BUG-006125)', () => {
  it('lets an HOD open an unassigned report from their own department, with every period', async () => {
    tables.profiles = { role: 'hod', is_super_admin: false, department_id: 'dept-1', institution_id: 'inst-1' };

    const { data, error } = await AttendanceReportService.getReportDetails('report-1', 'hod', USER);

    expect(error).toBeNull();
    expect((data as any).period_details).toHaveLength(2);
  });

  it('still denies an HOD of a different department who is not assigned', async () => {
    tables.profiles = { role: 'hod', is_super_admin: false, department_id: 'dept-2', institution_id: 'inst-1' };

    const { data, error } = await AttendanceReportService.getReportDetails('report-1', 'hod', USER);

    expect(data).toBeNull();
    expect(error).toMatch(/not assigned/);
  });

  it('still denies an unassigned senior learner of the same department', async () => {
    tables.profiles = { role: 'faculty', is_super_admin: false, department_id: 'dept-1', institution_id: 'inst-1' };

    const { data, error } = await AttendanceReportService.getReportDetails('report-1', 'faculty', USER);

    expect(data).toBeNull();
    expect(error).toMatch(/not assigned/);
  });

  it('shows an assigned senior learner only their own period', async () => {
    tables.profiles = { role: 'faculty', is_super_admin: false, department_id: 'dept-1', institution_id: 'inst-1' };
    tables.staff = [{ id: 'someone-else' }];

    const { data, error } = await AttendanceReportService.getReportDetails('report-1', 'faculty', USER);

    expect(error).toBeNull();
    expect((data as any).period_details).toHaveLength(1);
  });
});
