// ============================================
// PENDING ATTENDANCE — EXPORT CONFIG
// ============================================
// The DataTable export resolves `headers` against the DATA KEYS on each row
// and uses `columnMapping` to label them. The page originally declared the
// display labels ('Date', 'Period', …) as `headers`; nothing matched the row,
// so every exported row was empty and the download opened blank — under a
// green "Export successful" toast.
//
// Declaring one COLUMNS list and deriving headers/columnMapping/columnWidths
// from it makes that class of drift impossible: a key can no longer disagree
// with its label, and there can no longer be a width without a column.
// ============================================

import type { PendingAttendancePeriod } from '@/types/attendance-dashboard';

/** Row fields that carry a plain scalar — the only ones a spreadsheet cell can hold. */
type ExportableField = Extract<
  keyof PendingAttendancePeriod,
  | 'attendance_date'
  | 'period_name'
  | 'course_name'
  | 'institution_name'
  | 'degree_name'
  | 'department_name'
  | 'program_name'
  | 'semester_name'
  | 'section_name'
  | 'academic_year_name'
  | 'primary_staff_name'
>;

interface ExportColumn {
  /** Data key on PendingAttendancePeriod — this is what `headers` carries. */
  key: ExportableField;
  /** Spreadsheet column heading. */
  label: string;
  /** Column width in characters (xlsx `wch`). */
  width: number;
}

const COLUMNS: ExportColumn[] = [
  { key: 'attendance_date', label: 'Date', width: 15 },
  { key: 'period_name', label: 'Period', width: 15 },
  { key: 'course_name', label: 'Course', width: 20 },
  { key: 'institution_name', label: 'Institution', width: 30 },
  { key: 'degree_name', label: 'Degree', width: 15 },
  { key: 'department_name', label: 'Department', width: 25 },
  { key: 'program_name', label: 'Program', width: 25 },
  { key: 'semester_name', label: 'Semester', width: 15 },
  { key: 'section_name', label: 'Section', width: 12 },
  { key: 'academic_year_name', label: 'Academic Year', width: 15 },
  { key: 'primary_staff_name', label: 'Primary Staff', width: 25 },
];

export const PENDING_ATTENDANCE_EXPORT_CONFIG = {
  entityName: 'pending-attendance-periods',
  headers: COLUMNS.map((c) => c.key as string),
  columnMapping: Object.fromEntries(
    COLUMNS.map((c) => [c.key, c.label])
  ) as Record<string, string>,
  columnWidths: COLUMNS.map((c) => ({ wch: c.width })),
};
