/**
 * Excel Export Utility for Attendance Consolidation Reports
 * Created: 2026-03-04
 * Purpose: Generate advanced multi-sheet Excel exports of consolidation reports
 *
 * Sheet structure:
 *   Sheet 1 "Summary"       → Report metadata + overall stats + group statistics table
 *   Sheet 2 "Student Details" → Flat list of all students across all groups with full hierarchy
 */

import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type {
  AttendanceConsolidationReport,
  SubjectwiseGroup,
} from '@/types/attendance';

/**
 * Build the Summary sheet: metadata, overall stats, and group-level table
 */
function buildSummarySheet(report: AttendanceConsolidationReport): XLSX.WorkSheet {
  const { summary, groups } = report.reportData!;

  const rows: (string | number)[][] = [
    // Title block
    ['ATTENDANCE CONSOLIDATION REPORT'],
    [],
    ['Report Name', report.reportName],
    ['Description', report.reportDescription || ''],
    ['Institution', report.institution?.name || ''],
    ['Date Range', `${report.reportParams.dateFrom} to ${report.reportParams.dateTo}`],
    ['Grouped By', report.reportParams.groupBy.charAt(0).toUpperCase() + report.reportParams.groupBy.slice(1)],
    ['Generated At', format(new Date(report.createdAt), 'PPp')],
    [],
    // Overall stats block
    ['OVERALL STATISTICS'],
    ['Total Students', summary.totalStudents],
    ['Total Working Days', summary.totalWorkingDays],
    ['Average Attendance (%)', Number(summary.averageAttendance.toFixed(2))],
    ['Total Present Periods', summary.totalPresent],
    ['Total Absent Periods', summary.totalAbsent],
    [],
    // Group statistics header
    ['GROUP STATISTICS'],
    ['Group Name', 'Group Type', 'Students', 'Working Days', 'Avg Attendance (%)', 'Present Periods', 'Absent Periods'],
    // One row per group
    ...groups.map((g) => [
      g.groupName,
      g.groupType.charAt(0).toUpperCase() + g.groupType.slice(1),
      g.totalStudents,
      g.totalWorkingDays,
      Number(g.averageAttendance.toFixed(2)),
      g.totalPresent,
      g.totalAbsent,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 30 }, // Column A
    { wch: 28 }, // Column B
    { wch: 12 }, // Column C
    { wch: 14 }, // Column D
    { wch: 22 }, // Column E
    { wch: 16 }, // Column F
    { wch: 16 }, // Column G
  ];

  return ws;
}

/**
 * Build the Student Details sheet: one row per student, all groups flattened
 */
function buildStudentDetailsSheet(report: AttendanceConsolidationReport): XLSX.WorkSheet {
  const { groups } = report.reportData!;
  const includeAbsentDetails = report.reportParams.includeAbsentDetails;

  const headers = [
    'S.No.',
    'Group',
    'Student Name',
    'Roll No.',
    'Degree',
    'Department',
    'Program',
    'Semester',
    'Section',
    'Working Days',
    'Total Periods',
    'Present Periods',
    'Absent Periods',
    'Attendance (%)',
    ...(includeAbsentDetails ? ['Absent Dates'] : []),
  ];

  const rows: (string | number)[][] = [headers];
  let rowIndex = 1;

  for (const group of groups) {
    for (const student of group.students) {
      const totalPeriods = student.totalPresent + student.totalAbsent;
      const row: (string | number)[] = [
        rowIndex,
        group.groupName,
        student.studentName,
        student.rollNumber || '',
        student.degreeName || '',
        student.departmentName || '',
        student.programName || '',
        student.semesterName || '',
        student.sectionName || '',
        student.totalWorkingDays,
        totalPeriods,
        student.totalPresent,
        student.totalAbsent,
        Number(student.attendancePercentage.toFixed(2)),
      ];
      if (includeAbsentDetails) {
        row.push(student.absentDates?.join(', ') || '');
      }
      rows.push(row);
      rowIndex++;
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },  // S.No.
    { wch: 28 }, // Group
    { wch: 30 }, // Student Name
    { wch: 14 }, // Roll No.
    { wch: 22 }, // Degree
    { wch: 22 }, // Department
    { wch: 22 }, // Program
    { wch: 16 }, // Semester
    { wch: 12 }, // Section
    { wch: 13 }, // Working Days
    { wch: 13 }, // Total Periods
    { wch: 14 }, // Present Periods
    { wch: 13 }, // Absent Periods
    { wch: 15 }, // Attendance %
    ...(includeAbsentDetails ? [{ wch: 50 }] : []), // Absent Dates
  ];

  return ws;
}

/**
 * Build one Subjectwise (Camu-format) matrix sheet per group.
 * Layout mirrors the PDF: header block, then Regn No | Name | course codes | Overall,
 * a "(T)" totals row, and % + (A/T) per cell. Added: 2026-07-04.
 */
function buildSubjectwiseSheet(
  report: AttendanceConsolidationReport,
  group: SubjectwiseGroup
): XLSX.WorkSheet {
  const grandTotal = group.courses.reduce((sum, c) => sum + c.totalPeriods, 0);

  const headerLine2 = [group.degreeName, group.programName, group.academicYearName]
    .filter(Boolean)
    .join(' | ');
  const headerLine3 = [
    group.departmentName,
    group.semesterName && group.sectionName
      ? `${group.semesterName} (${group.sectionName})`
      : group.semesterName || group.groupName,
    group.sectionName,
    'For All Attendances - Subjectwise',
  ]
    .filter(Boolean)
    .join(' | ');

  const rows: (string | number)[][] = [
    [report.institution?.name || ''],
    ['Attendance Summary Subjectwise %'],
    [`${report.reportParams.dateFrom} To ${report.reportParams.dateTo}`],
    [headerLine2],
    [headerLine3],
    [],
    ['Regn. No.', 'Student Name', ...group.courses.map((c) => c.courseCode), 'Overall'],
    ['', 'Total no. of periods', ...group.courses.map((c) => `(${c.totalPeriods})`), `(${grandTotal})`],
    ['', '', ...group.courses.map(() => '% (A/T)'), '% (A/T)'],
    ...group.students.map((student) => {
      const cells = group.courses.map((course) => {
        const cell = student.perCourse[course.courseId];
        if (!cell || cell.total === 0) return '(0/0)';
        const pct = Math.round((cell.present / cell.total) * 100);
        return `${pct} (${cell.present}/${cell.total})`;
      });
      const overall =
        student.overallTotal > 0
          ? `${Math.round((student.overallPresent / student.overallTotal) * 100)} (${student.overallPresent}/${student.overallTotal})`
          : '(0/0)';
      return [student.rollNumber || '-', student.studentName, ...cells, overall];
    }),
    [],
    ['Course Codes:'],
    ...group.courses.map((c) => [c.courseCode, c.courseName]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 }, // Regn. No.
    { wch: 32 }, // Student Name
    ...group.courses.map(() => ({ wch: 11 })),
    { wch: 13 }, // Overall
  ];
  return ws;
}

/**
 * Export a consolidation report to an advanced multi-sheet Excel file.
 * Downloads the file immediately in the browser.
 */
export function exportConsolidationReportToExcel(report: AttendanceConsolidationReport): void {
  if (!report.reportData) {
    throw new Error('Report data is not available');
  }

  const wb = XLSX.utils.book_new();

  // Subjectwise (Camu) template: one matrix sheet per group (Added: 2026-07-04)
  if (report.reportParams.template === 'subjectwise') {
    const groups = report.reportData.subjectwiseGroups || [];
    if (groups.length === 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([['No attendance data found for the selected filters']]),
        'Subjectwise'
      );
    }
    // Sheet names: max 31 chars, no []:*?/\ characters, must be unique
    const usedNames = new Set<string>();
    groups.forEach((group, i) => {
      let safeName =
        group.groupName.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 28) || `Group ${i + 1}`;
      if (usedNames.has(safeName)) safeName = `${safeName.slice(0, 24)} (${i + 1})`;
      usedNames.add(safeName);
      XLSX.utils.book_append_sheet(wb, buildSubjectwiseSheet(report, group), safeName);
    });
  } else {
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(report), 'Summary');
    XLSX.utils.book_append_sheet(wb, buildStudentDetailsSheet(report), 'Student Details');
  }

  const fileName = `${report.reportName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
