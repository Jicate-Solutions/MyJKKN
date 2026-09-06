/**
 * The /academic/attendance/pending Export must produce a populated file.
 *
 * The page shipped `headers: ['Date', 'Period', ...]` — the display LABELS —
 * while the export pipeline resolves `headers` against the row's DATA KEYS.
 * Nothing matched, so every exported row was empty and the HOD who reported
 * this downloaded a blank spreadsheet.
 *
 * This locks the contract at the config level so a label can never be passed
 * as a header again.
 */
import { describe, it, expect } from 'vitest';
import { PENDING_ATTENDANCE_EXPORT_CONFIG } from '@/app/(routes)/academic/attendance/pending/_components/pending-attendance-export-config';
import { createColumns } from '@/app/(routes)/academic/attendance/dashboard/_components/pending-attendance-columns';
import { buildExcelRows } from '@/components/data-table/utils/export-utils';
import type { PendingAttendancePeriod } from '@/types/attendance-dashboard';

// A row exactly as AttendanceDashboardService.getTodayPendingAttendance returns it.
const PERIOD: PendingAttendancePeriod = {
  attendance_date: '2026-08-04',
  period_name: 'Period 1',
  period_id: 'period-1',
  start_time: '09:00:00',
  end_time: '09:50:00',
  course_id: 'course-1',
  course_name: 'Human Anatomy',
  course_code: 'AHS101',
  institution_id: '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
  institution_name: 'JKKN College of Allied Health Sciences',
  degree_id: 'degree-1',
  degree_name: 'B.Sc.',
  department_id: '7646521a-a252-4756-bd8f-ba7c1d36ff56',
  department_name: 'Department of Allied (UG)',
  program_id: 'program-1',
  program_name: 'B.Sc. MLT',
  semester_id: 'semester-1',
  semester_name: 'Semester 3',
  section_id: 'section-1',
  section_name: 'A',
  academic_year_id: 'ay-1',
  academic_year_name: '2026-2027',
  assigned_staff: [
    { staff_id: 'staff-1', staff_name: 'Vijaysabari S', is_primary: true },
  ],
  primary_staff_name: 'Vijaysabari S',
  timetable_id: 'timetable-1',
};

describe('pending attendance export config', () => {
  const { headers, columnMapping, columnWidths } = PENDING_ATTENDANCE_EXPORT_CONFIG;

  it('lists data keys, not display labels, as headers', () => {
    const rowKeys = Object.keys(PERIOD);
    const notOnTheRow = headers.filter((h) => !rowKeys.includes(h));

    expect(notOnTheRow).toEqual([]);
  });

  it('maps every header to a label', () => {
    const unmapped = headers.filter((h) => !columnMapping[h]);

    expect(unmapped).toEqual([]);
  });

  it('supplies one width per header', () => {
    expect(columnWidths).toHaveLength(headers.length);
  });

  // DataTableExport keeps a header only if it is NOT a table column (a
  // transform-only column) or IS a visible one. Several export columns —
  // institution/department/program/semester/section/primary staff — are folded
  // into composite table columns, so they survive as transform-only columns.
  // This is the step that decides what actually lands in the file.
  it.each([
    ['a department HOD', false],
    ['an all-institutions viewer', true],
  ])('keeps every column for %s', (_who, canViewAllInstitutions) => {
    const columns = createColumns(
      canViewAllInstitutions,
      () => {},
      () => {}
    );
    const tableColumnIds = columns
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c) => (c as any).id ?? (c as any).accessorKey)
      .filter((id: string) => id !== 'actions' && id !== 'select');

    // Default visibility: every column is shown.
    const visibleColumnIds = tableColumnIds;

    const exportHeaders = headers.filter(
      (h) => !tableColumnIds.includes(h) || visibleColumnIds.includes(h)
    );

    expect(exportHeaders).toEqual(headers);
  });

  it('exports a populated row', () => {
    const { rows, resolvedKeys } = buildExcelRows(
      [PERIOD as unknown as Record<string, string>],
      headers,
      columnMapping
    );

    expect(resolvedKeys).toEqual(headers);
    expect(Object.keys(rows[0])).toHaveLength(headers.length);
    expect(rows[0]).toMatchObject({
      Date: '2026-08-04',
      Course: 'Human Anatomy',
      Department: 'Department of Allied (UG)',
      'Primary Staff': 'Vijaysabari S',
    });
  });
});
