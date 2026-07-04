'use client';

import { Fragment } from 'react';
import { format } from 'date-fns';
import { Table2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  AttendanceConsolidationReport,
  SubjectwiseGroup,
} from '@/types/attendance';

/**
 * SUBJECTWISE (Camu-format) ON-SCREEN MATRIX — Added: 2026-07-04
 * Mirrors the PDF: one matrix per group, students x course codes,
 * cells = % with (attended/taken) periods.
 */

function matrixCell(cell?: { present: number; total: number }) {
  if (!cell || cell.total === 0) {
    return <span className="text-muted-foreground text-[11px]">(0/0)</span>;
  }
  const pct = Math.round((cell.present / cell.total) * 100);
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span
        className={cn(
          'font-semibold',
          pct >= 75 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        )}
      >
        {pct}
      </span>
      <span className="text-[10px] text-muted-foreground">
        ({cell.present}/{cell.total})
      </span>
    </span>
  );
}

function SubjectwiseMatrix({
  report,
  group,
}: {
  report: AttendanceConsolidationReport;
  group: SubjectwiseGroup;
}) {
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

  return (
    <Card className="border shadow-md overflow-hidden">
      <CardHeader className="pb-3 space-y-1 text-center border-b bg-muted/20">
        <CardTitle className="text-base font-bold">
          {report.institution?.name}
        </CardTitle>
        <p className="text-sm font-semibold">Attendance Summary Subjectwise %</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(report.reportParams.dateFrom), 'dd-MMM-yyyy')} To{' '}
          {format(new Date(report.reportParams.dateTo), 'dd-MMM-yyyy')}
        </p>
        {headerLine2 && (
          <p className="text-xs text-muted-foreground">{headerLine2}</p>
        )}
        <p className="text-xs text-muted-foreground">{headerLine3}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted px-2 py-2 text-left border font-semibold min-w-[90px]">
                  Regn. No.
                </th>
                <th className="sticky left-[90px] z-10 bg-muted px-2 py-2 text-left border font-semibold min-w-[180px]">
                  Student Name
                </th>
                {group.courses.map((course) => (
                  <th
                    key={course.courseId}
                    className="px-1.5 py-2 border text-center font-semibold min-w-[64px]"
                    title={course.courseName}
                  >
                    <div>{course.courseCode}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">
                      ({course.totalPeriods})
                    </div>
                  </th>
                ))}
                <th className="px-1.5 py-2 border text-center font-semibold min-w-[70px] bg-muted/60">
                  <div>Overall</div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    ({grandTotal})
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {group.students.map((student, idx) => {
                const overallPct =
                  student.overallTotal > 0
                    ? Math.round(
                        (student.overallPresent / student.overallTotal) * 100
                      )
                    : null;
                return (
                  <tr
                    key={student.studentId}
                    className={cn(
                      'hover:bg-muted/30',
                      idx % 2 === 1 && 'bg-muted/10'
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-background px-2 py-1.5 border font-mono text-[11px]">
                      {student.rollNumber || '-'}
                    </td>
                    <td className="sticky left-[90px] z-10 bg-background px-2 py-1.5 border font-medium whitespace-nowrap">
                      {student.studentName}
                    </td>
                    {group.courses.map((course) => (
                      <td
                        key={course.courseId}
                        className="px-1 py-1.5 border text-center"
                      >
                        {matrixCell(student.perCourse[course.courseId])}
                      </td>
                    ))}
                    <td className="px-1 py-1.5 border text-center bg-muted/20">
                      {overallPct === null ? (
                        <span className="text-muted-foreground text-[11px]">(0/0)</span>
                      ) : (
                        <span className="inline-flex flex-col items-center leading-tight">
                          <span
                            className={cn(
                              'font-bold',
                              overallPct >= 75
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {overallPct}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            ({student.overallPresent}/{student.overallTotal})
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Course-code legend */}
        <div className="px-4 py-3 border-t bg-muted/10 flex flex-wrap gap-x-4 gap-y-1">
          {group.courses.map((course) => (
            <span key={course.courseId} className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{course.courseCode}</span>
              {' — '}
              {course.courseName}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SubjectwiseReportView({
  report,
}: {
  report: AttendanceConsolidationReport;
}) {
  const groups = report.reportData?.subjectwiseGroups || [];

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No attendance data found for the selected filters and date range.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Table2 className="h-5 w-5 text-primary" />
        Subjectwise Attendance Matrix
        <Badge variant="outline" className="ml-auto">
          {groups.length} {groups.length === 1 ? 'Group' : 'Groups'}
        </Badge>
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Student attendance percentage (%) — No. of periods attended by the student
        (A) / No. of periods attendance taken (T).
      </p>
      <div className="space-y-8">
        {groups.map((group) => (
          <Fragment key={group.groupId}>
            <SubjectwiseMatrix report={report} group={group} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
