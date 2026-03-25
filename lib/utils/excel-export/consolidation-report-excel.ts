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
import type { AttendanceConsolidationReport } from '@/types/attendance';

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
 * Export a consolidation report to an advanced multi-sheet Excel file.
 * Downloads the file immediately in the browser.
 */
export function exportConsolidationReportToExcel(report: AttendanceConsolidationReport): void {
  if (!report.reportData) {
    throw new Error('Report data is not available');
  }

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(report), 'Summary');
  XLSX.utils.book_append_sheet(wb, buildStudentDetailsSheet(report), 'Student Details');

  const fileName = `${report.reportName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
