/**
 * Export row-building contract.
 *
 * `exportConfig.headers` are DATA KEYS (`attendance_date`); `columnMapping`
 * turns each key into its display label ('Date'). Passing the LABELS as
 * `headers` matched nothing on the row, so every worksheet row came out `{}`
 * and XLSX wrote a sheet with rows but no columns — a downloaded file that
 * opens empty, under a green "Export successful" toast.
 *
 * Reported on /academic/attendance/pending: "couldnt export the pending
 * attendance downloaded file is empty it shows. no data".
 */
import { describe, it, expect } from 'vitest';
import { buildExcelRows } from '@/components/data-table/utils/export-utils';

// One pending-attendance row, shaped like PendingAttendancePeriod.
const ROW = {
  attendance_date: '2026-08-04',
  period_name: 'Period 1',
  course_name: 'Human Anatomy',
  institution_name: 'JKKN College of Allied Health Sciences',
  degree_name: 'B.Sc.',
  department_name: 'Department of Allied (UG)',
  program_name: 'B.Sc. MLT',
  semester_name: 'Semester 3',
  section_name: 'A',
  academic_year_name: '2026-2027',
  primary_staff_name: 'Vijaysabari S',
};

const COLUMN_MAPPING: Record<string, string> = {
  attendance_date: 'Date',
  period_name: 'Period',
  course_name: 'Course',
  institution_name: 'Institution',
  degree_name: 'Degree',
  department_name: 'Department',
  program_name: 'Program',
  semester_name: 'Semester',
  section_name: 'Section',
  academic_year_name: 'Academic Year',
  primary_staff_name: 'Primary Staff',
};

const KEY_HEADERS = Object.keys(COLUMN_MAPPING);
const LABEL_HEADERS = Object.values(COLUMN_MAPPING);

describe('buildExcelRows', () => {
  it('maps data keys to their labelled columns', () => {
    const { rows, resolvedKeys } = buildExcelRows(
      [ROW],
      KEY_HEADERS,
      COLUMN_MAPPING
    );

    expect(resolvedKeys).toEqual(KEY_HEADERS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      Date: '2026-08-04',
      Period: 'Period 1',
      Course: 'Human Anatomy',
      Institution: 'JKKN College of Allied Health Sciences',
      Degree: 'B.Sc.',
      Department: 'Department of Allied (UG)',
      Program: 'B.Sc. MLT',
      Semester: 'Semester 3',
      Section: 'A',
      'Academic Year': '2026-2027',
      'Primary Staff': 'Vijaysabari S',
    });
  });

  it('resolves nothing when display labels are passed as headers', () => {
    // The exact miswiring behind the empty download. The rows are still
    // produced (so the row count looks right) but carry no columns.
    const { rows, resolvedKeys } = buildExcelRows(
      [ROW],
      LABEL_HEADERS,
      COLUMN_MAPPING
    );

    expect(resolvedKeys).toEqual([]);
    expect(rows.every((r) => Object.keys(r).length === 0)).toBe(true);
  });

  it('keeps columns produced by a transform function', () => {
    const { rows, resolvedKeys } = buildExcelRows(
      [ROW],
      ['attendance_date', 'status'],
      { attendance_date: 'Date', status: 'Status' },
      (r) => ({ ...r, status: 'Overdue' })
    );

    expect(resolvedKeys).toEqual(['attendance_date', 'status']);
    expect(rows[0]).toEqual({ Date: '2026-08-04', Status: 'Overdue' });
  });

  it('skips a header absent from the row without dropping the rest', () => {
    const { rows, resolvedKeys } = buildExcelRows(
      [ROW],
      ['attendance_date', 'not_a_field'],
      COLUMN_MAPPING
    );

    expect(resolvedKeys).toEqual(['attendance_date']);
    expect(rows[0]).toEqual({ Date: '2026-08-04' });
  });
});
