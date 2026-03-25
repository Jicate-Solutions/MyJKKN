/**
 * Student Attendance Excel Export API
 * Created: 2025-01-02
 * Description: Generates Excel attendance report for a student
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentAttendanceService } from '@/lib/services/learners/student-attendance-service';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { learnerId, semesterId } = body;

    if (!learnerId || !semesterId) {
      return NextResponse.json(
        { error: 'Missing required fields: learnerId, semesterId' },
        { status: 400 }
      );
    }

    // Verify user has access to this learner's data
    const { data: profile } = await supabase
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    // Only allow students to export their own data, or admins/faculty
    if (profile?.role === 'student' && profile.learner_id !== learnerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch export data
    const exportData = await StudentAttendanceService.exportAttendanceData(
      learnerId,
      semesterId
    );

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
      ['ATTENDANCE REPORT'],
      [''],
      ['Student Information'],
      ['Name', exportData.student.name],
      ['Roll Number', exportData.student.roll_number || 'N/A'],
      ['Section', exportData.student.section || 'N/A'],
      [''],
      ['Semester Information'],
      ['Semester', exportData.semester.name],
      ['Academic Year', exportData.semester.academic_year],
      [''],
      ['Attendance Statistics'],
      ['Total Classes', exportData.statistics.totalClasses],
      ['Present', exportData.statistics.presentCount],
      ['Absent', exportData.statistics.absentCount],
      ['Attendance Percentage', `${exportData.statistics.percentage}%`],
      ['Threshold', `${exportData.statistics.threshold}%`],
      ['Status', exportData.statistics.isAboveThreshold ? 'Above Threshold' : 'Below Threshold'],
      [''],
      ['Generated', format(new Date(), 'MMM dd, yyyy HH:mm')]
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

    // Set column widths for summary
    summarySheet['!cols'] = [{ wch: 25 }, { wch: 35 }];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Sheet 2: Course-wise Attendance
    if (exportData.courseWise.length > 0) {
      const courseHeaders = ['Course Name', 'Course Code', 'Total Classes', 'Present', 'Absent', 'Percentage'];
      const courseData = exportData.courseWise.map(course => [
        course.course_name,
        course.course_code || '-',
        course.total,
        course.present,
        course.absent,
        `${course.percentage}%`
      ]);

      const courseSheet = XLSX.utils.aoa_to_sheet([courseHeaders, ...courseData]);

      // Set column widths for courses
      courseSheet['!cols'] = [
        { wch: 40 },
        { wch: 15 },
        { wch: 15 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 }
      ];

      XLSX.utils.book_append_sheet(workbook, courseSheet, 'Course-wise');
    }

    // Sheet 3: Detailed Records
    if (exportData.records.length > 0) {
      const recordHeaders = ['Date', 'Period', 'Time', 'Course Name', 'Course Code', 'Status'];
      const recordData = exportData.records.map(record => [
        format(parseISO(record.date), 'MMM dd, yyyy'),
        record.period_name,
        record.start_time && record.end_time
          ? `${formatTime(record.start_time)} - ${formatTime(record.end_time)}`
          : '-',
        record.course_name,
        record.course_code || '-',
        record.status
      ]);

      const recordsSheet = XLSX.utils.aoa_to_sheet([recordHeaders, ...recordData]);

      // Set column widths for records
      recordsSheet['!cols'] = [
        { wch: 15 },
        { wch: 25 },
        { wch: 20 },
        { wch: 35 },
        { wch: 15 },
        { wch: 10 }
      ];

      XLSX.utils.book_append_sheet(workbook, recordsSheet, 'Detailed Records');
    }

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return as downloadable Excel file
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="attendance-report-${exportData.student.roll_number || 'student'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx"`,
      },
    });
  } catch (error) {
    logger.error('learners/attendance', 'Excel export failed', error);
    return NextResponse.json(
      { error: 'Failed to generate Excel report' },
      { status: 500 }
    );
  }
}

/**
 * Format time from 24-hour to 12-hour format
 */
function formatTime(time: string): string {
  if (!time) return '-';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${period}`;
}
