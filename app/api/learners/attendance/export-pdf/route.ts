/**
 * Student Attendance PDF Export API
 * Created: 2025-01-02
 * Description: Generates PDF attendance report for a student
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StudentAttendanceService } from '@/lib/services/learners/student-attendance-service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

    // Generate PDF
    const doc = new jsPDF('p', 'mm', 'a4');
    let yPosition = 15;

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ATTENDANCE REPORT', doc.internal.pageSize.width / 2, yPosition, {
      align: 'center'
    });
    yPosition += 10;

    // Student Info Box
    doc.setFontSize(10);
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, yPosition - 3, 182, 28, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.text(`Student: ${exportData.student.name}`, 18, yPosition + 3);
    doc.setFont('helvetica', 'normal');
    doc.text(`Roll Number: ${exportData.student.roll_number || 'N/A'}`, 18, yPosition + 9);
    doc.text(`Section: ${exportData.student.section || 'N/A'}`, 18, yPosition + 15);
    doc.text(`Semester: ${exportData.semester.name}`, 100, yPosition + 3);
    doc.text(`Academic Year: ${exportData.semester.academic_year}`, 100, yPosition + 9);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 100, yPosition + 15);

    yPosition += 32;

    // Statistics Section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ATTENDANCE SUMMARY', 14, yPosition);
    yPosition += 6;

    // Stats box
    doc.setFillColor(240, 253, 244); // Light green background
    doc.rect(14, yPosition - 3, 90, 20, 'F');
    doc.setFillColor(254, 242, 242); // Light red background
    doc.rect(106, yPosition - 3, 90, 20, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Left stats box
    doc.text(`Total Classes: ${exportData.statistics.totalClasses}`, 18, yPosition + 3);
    doc.text(`Present: ${exportData.statistics.presentCount}`, 18, yPosition + 9);
    doc.setFont('helvetica', 'bold');
    const percentage = exportData.statistics.percentage;
    doc.setTextColor(percentage >= 75 ? 34 : 239, percentage >= 75 ? 197 : 68, percentage >= 75 ? 94 : 68);
    doc.text(`Attendance: ${percentage}%`, 18, yPosition + 15);
    doc.setTextColor(0, 0, 0);

    // Right stats box
    doc.setFont('helvetica', 'normal');
    doc.text(`Absent: ${exportData.statistics.absentCount}`, 110, yPosition + 3);
    doc.text(`Threshold: ${exportData.statistics.threshold}%`, 110, yPosition + 9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(exportData.statistics.isAboveThreshold ? 34 : 239, exportData.statistics.isAboveThreshold ? 197 : 68, exportData.statistics.isAboveThreshold ? 94 : 68);
    doc.text(`Status: ${exportData.statistics.isAboveThreshold ? 'Above Threshold' : 'Below Threshold'}`, 110, yPosition + 15);
    doc.setTextColor(0, 0, 0);

    yPosition += 25;

    // Course-wise Attendance Table
    if (exportData.courseWise.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('COURSE-WISE ATTENDANCE', 14, yPosition);
      yPosition += 5;

      const courseTableData = exportData.courseWise.map(course => [
        course.course_name,
        course.course_code || '-',
        course.total.toString(),
        course.present.toString(),
        course.absent.toString(),
        `${course.percentage}%`
      ]);

      autoTable(doc, {
        head: [['Course Name', 'Code', 'Total', 'Present', 'Absent', 'Percentage']],
        body: courseTableData,
        startY: yPosition,
        styles: {
          fontSize: 9,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 25 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
        },
        didParseCell: function(data) {
          if (data.column.index === 5 && data.cell.section === 'body') {
            const pct = parseInt(String(data.cell.raw).replace('%', ''), 10);
            data.cell.styles.textColor = pct >= 75 ? [34, 197, 94] : [239, 68, 68];
          }
        }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }

    // Detailed Records Table
    if (exportData.records.length > 0) {
      // Check if we need a new page
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 15;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DETAILED ATTENDANCE RECORDS', 14, yPosition);
      yPosition += 5;

      const recordsTableData = exportData.records.map(record => [
        format(parseISO(record.date), 'MMM dd, yyyy'),
        record.period_name,
        record.start_time && record.end_time
          ? `${formatTime(record.start_time)} - ${formatTime(record.end_time)}`
          : '-',
        record.course_name,
        record.course_code || '-',
        record.status
      ]);

      autoTable(doc, {
        head: [['Date', 'Period', 'Time', 'Course', 'Code', 'Status']],
        body: recordsTableData,
        startY: yPosition,
        styles: {
          fontSize: 8,
          cellPadding: 1.5
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          3: { cellWidth: 45 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }
        },
        didParseCell: function(data) {
          if (data.column.index === 5 && data.cell.section === 'body') {
            if (data.cell.raw === 'Present') {
              data.cell.styles.textColor = [34, 197, 94];
            } else if (data.cell.raw === 'Absent') {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
        }
      });
    }

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text(`Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 10);
      doc.text(
        'MyJKKN - Student Attendance Report',
        doc.internal.pageSize.width - 14,
        doc.internal.pageSize.height - 10,
        { align: 'right' }
      );
    }

    // Generate PDF buffer
    const pdfBuffer = doc.output('arraybuffer');

    // Return as downloadable PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="attendance-report-${exportData.student.roll_number || 'student'}-${format(new Date(), 'yyyy-MM-dd')}.pdf"`,
      },
    });
  } catch (error) {
    logger.error('learners/attendance', 'PDF export failed', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF report' },
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
