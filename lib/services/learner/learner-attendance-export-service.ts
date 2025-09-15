import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type {
  LearnerAttendanceDetails,
  LearnerAttendanceRecord,
  CourseAttendanceStats
} from '@/types/learner-attendance';

export class LearnerAttendanceExportService {
  /**
   * Export attendance data to PDF
   */
  static async exportToPDF(
    attendanceData: LearnerAttendanceDetails,
    options: {
      includeOverview?: boolean;
      includeCourseStats?: boolean;
      includeDetailedRecords?: boolean;
      dateRange?: { from: string; to: string };
    } = {}
  ): Promise<void> {
    const {
      includeOverview = true,
      includeCourseStats = true,
      includeDetailedRecords = true,
      dateRange
    } = options;

    const pdf = new jsPDF();
    let yPosition = 20;

    // Header
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Attendance Report', 105, yPosition, { align: 'center' });
    yPosition += 15;

    // Student Information
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Student: ${attendanceData.student_name}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Roll Number: ${attendanceData.roll_number}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Program: ${attendanceData.program_name}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Department: ${attendanceData.department_name}`, 20, yPosition);
    yPosition += 8;
    pdf.text(
      `Report Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
      20,
      yPosition
    );
    yPosition += 15;

    // Date range if specified
    if (dateRange) {
      pdf.text(
        `Date Range: ${format(
          new Date(dateRange.from),
          'dd/MM/yyyy'
        )} to ${format(new Date(dateRange.to), 'dd/MM/yyyy')}`,
        20,
        yPosition
      );
      yPosition += 15;
    }

    // Overview Section
    if (includeOverview) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Attendance Overview', 20, yPosition);
      yPosition += 10;

      const overviewData = [
        ['Total Days', attendanceData.attendance_stats.total_days.toString()],
        [
          'Present Days',
          attendanceData.attendance_stats.present_days.toString()
        ],
        ['Absent Days', attendanceData.attendance_stats.absent_days.toString()],
        ['Late Days', attendanceData.attendance_stats.late_days.toString()],
        [
          'Permission Days',
          attendanceData.attendance_stats.permission_days.toString()
        ],
        [
          'Overall Percentage',
          `${attendanceData.attendance_stats.overall_percentage.toFixed(2)}%`
        ],
        [
          'Total Periods',
          attendanceData.attendance_stats.total_periods.toString()
        ],
        [
          'Attended Periods',
          attendanceData.attendance_stats.attended_periods.toString()
        ],
        [
          'Period Percentage',
          `${attendanceData.attendance_stats.period_percentage.toFixed(2)}%`
        ]
      ];

      autoTable(pdf, {
        startY: yPosition,
        head: [['Metric', 'Value']],
        body: overviewData,
        margin: { left: 20, right: 20 },
        styles: { fontSize: 10 },
        headStyles: { fillColor: [51, 122, 183] }
      });

      yPosition = (pdf as any).lastAutoTable.finalY + 15;
    }

    // Course-wise Statistics
    if (
      includeCourseStats &&
      attendanceData.attendance_stats.course_wise_stats.length > 0
    ) {
      // Check if we need a new page
      if (yPosition > 220) {
        pdf.addPage();
        yPosition = 20;
      }

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Course-wise Attendance', 20, yPosition);
      yPosition += 10;

      const courseData = attendanceData.attendance_stats.course_wise_stats.map(
        (course) => [
          course.course_code || course.course_name,
          course.course_name,
          course.attended_periods.toString(),
          course.total_periods.toString(),
          `${course.percentage.toFixed(2)}%`,
          course.faculty_name || 'N/A'
        ]
      );

      autoTable(pdf, {
        startY: yPosition,
        head: [
          [
            'Course Code',
            'Course Name',
            'Attended',
            'Total',
            'Percentage',
            'Faculty'
          ]
        ],
        body: courseData,
        margin: { left: 20, right: 20 },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [51, 122, 183] },
        columnStyles: {
          4: { halign: 'center' }
        }
      });

      yPosition = (pdf as any).lastAutoTable.finalY + 15;
    }

    // Detailed Records
    if (includeDetailedRecords && attendanceData.recent_attendance.length > 0) {
      // Add new page for detailed records
      pdf.addPage();
      yPosition = 20;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Detailed Attendance Records', 20, yPosition);
      yPosition += 10;

      // Flatten the records from recent attendance
      const detailedData: string[][] = [];
      attendanceData.recent_attendance.forEach((day) => {
        day.periods.forEach((period) => {
          detailedData.push([
            format(new Date(day.date), 'dd/MM/yyyy'),
            period.period_name,
            period.start_time,
            period.end_time,
            period.course_code || period.course_name,
            period.status,
            period.faculty_name || 'N/A'
          ]);
        });
      });

      autoTable(pdf, {
        startY: yPosition,
        head: [
          [
            'Date',
            'Period',
            'Start Time',
            'End Time',
            'Course',
            'Status',
            'Faculty'
          ]
        ],
        body: detailedData,
        margin: { left: 20, right: 20 },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [51, 122, 183] },
        columnStyles: {
          5: {
            halign: 'center',
            cellWidth: 20
          }
        },
        didParseCell: function (data) {
          if (data.column.index === 5 && data.section === 'body') {
            const status = data.cell.text[0];
            if (status === 'Present') {
              data.cell.styles.textColor = [0, 128, 0];
            } else if (status === 'Absent') {
              data.cell.styles.textColor = [255, 0, 0];
            } else if (status === 'Late') {
              data.cell.styles.textColor = [255, 165, 0];
            }
          }
        }
      });
    }

    // Save the PDF
    const fileName = `attendance_report_${attendanceData.roll_number}_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`;
    pdf.save(fileName);
  }

  /**
   * Export attendance data to Excel
   */
  static async exportToExcel(
    attendanceData: LearnerAttendanceDetails,
    options: {
      includeOverview?: boolean;
      includeCourseStats?: boolean;
      includeDetailedRecords?: boolean;
      includeMonthlyBreakdown?: boolean;
      dateRange?: { from: string; to: string };
    } = {}
  ): Promise<void> {
    const {
      includeOverview = true,
      includeCourseStats = true,
      includeDetailedRecords = true,
      includeMonthlyBreakdown = true,
      dateRange
    } = options;

    const workbook = XLSX.utils.book_new();

    // Student Information Sheet
    const studentInfo = [
      ['Student Information', ''],
      ['Name', attendanceData.student_name],
      ['Roll Number', attendanceData.roll_number],
      ['Program', attendanceData.program_name],
      ['Department', attendanceData.department_name],
      ['Semester', attendanceData.semester_name],
      ['Section', attendanceData.section_name],
      ['Report Generated', format(new Date(), 'dd/MM/yyyy HH:mm')],
      ['', '']
    ];

    if (dateRange) {
      studentInfo.push([
        'Date Range',
        `${format(new Date(dateRange.from), 'dd/MM/yyyy')} to ${format(
          new Date(dateRange.to),
          'dd/MM/yyyy'
        )}`
      ]);
      studentInfo.push(['', '']);
    }

    // Overview Section
    if (includeOverview) {
      studentInfo.push(
        ['Attendance Overview', ''],
        ['Total Days', attendanceData.attendance_stats.total_days.toString()],
        [
          'Present Days',
          attendanceData.attendance_stats.present_days.toString()
        ],
        ['Absent Days', attendanceData.attendance_stats.absent_days.toString()],
        ['Late Days', attendanceData.attendance_stats.late_days.toString()],
        [
          'Permission Days',
          attendanceData.attendance_stats.permission_days.toString()
        ],
        [
          'Overall Percentage',
          `${attendanceData.attendance_stats.overall_percentage.toFixed(2)}%`
        ],
        ['', ''],
        ['Period-wise Statistics', ''],
        [
          'Total Periods',
          attendanceData.attendance_stats.total_periods.toString()
        ],
        [
          'Attended Periods',
          attendanceData.attendance_stats.attended_periods.toString()
        ],
        [
          'Missed Periods',
          attendanceData.attendance_stats.missed_periods.toString()
        ],
        [
          'Period Percentage',
          `${attendanceData.attendance_stats.period_percentage.toFixed(2)}%`
        ]
      );
    }

    const infoSheet = XLSX.utils.aoa_to_sheet(studentInfo);
    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Student Info');

    // Course-wise Statistics Sheet
    if (
      includeCourseStats &&
      attendanceData.attendance_stats.course_wise_stats.length > 0
    ) {
      const courseData = [
        [
          'Course Code',
          'Course Name',
          'Attended Periods',
          'Total Periods',
          'Percentage',
          'Faculty Name'
        ]
      ];

      attendanceData.attendance_stats.course_wise_stats.forEach((course) => {
        courseData.push([
          course.course_code || '',
          course.course_name,
          course.attended_periods.toString(),
          course.total_periods.toString(),
          course.percentage.toFixed(2),
          course.faculty_name || 'N/A'
        ]);
      });

      const courseSheet = XLSX.utils.aoa_to_sheet(courseData);
      XLSX.utils.book_append_sheet(workbook, courseSheet, 'Course Statistics');
    }

    // Monthly Breakdown Sheet
    if (
      includeMonthlyBreakdown &&
      attendanceData.attendance_stats.monthly_breakdown.length > 0
    ) {
      const monthlyData = [
        [
          'Month',
          'Year',
          'Total Days',
          'Present Days',
          'Percentage',
          'Total Periods',
          'Attended Periods'
        ]
      ];

      attendanceData.attendance_stats.monthly_breakdown.forEach((month) => {
        monthlyData.push([
          month.month,
          month.year.toString(),
          month.total_days.toString(),
          month.present_days.toString(),
          month.percentage.toFixed(2),
          month.total_periods.toString(),
          month.attended_periods.toString()
        ]);
      });

      const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
      XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly Breakdown');
    }

    // Detailed Records Sheet
    if (includeDetailedRecords && attendanceData.recent_attendance.length > 0) {
      const detailedData = [
        [
          'Date',
          'Day',
          'Period Name',
          'Start Time',
          'End Time',
          'Course Code',
          'Course Name',
          'Status',
          'Faculty Name',
          'Marked At',
          'Remarks'
        ]
      ];

      attendanceData.recent_attendance.forEach((day) => {
        day.periods.forEach((period) => {
          detailedData.push([
            day.date,
            day.day_name,
            period.period_name,
            period.start_time,
            period.end_time,
            period.course_code || '',
            period.course_name,
            period.status,
            period.faculty_name || 'N/A',
            period.marked_at || '',
            period.remarks || ''
          ]);
        });
      });

      const detailedSheet = XLSX.utils.aoa_to_sheet(detailedData);
      XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Detailed Records');
    }

    // Generate and save the Excel file
    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array'
    });
    const fileName = `attendance_report_${attendanceData.roll_number}_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.xlsx`;

    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    saveAs(blob, fileName);
  }

  /**
   * Export course-wise attendance to Excel
   */
  static async exportCourseAttendanceToExcel(
    courseStats: CourseAttendanceStats[],
    studentInfo: {
      name: string;
      rollNumber: string;
      program: string;
    }
  ): Promise<void> {
    const workbook = XLSX.utils.book_new();

    // Course Summary
    const summaryData = [
      ['Course-wise Attendance Report', ''],
      ['Student', studentInfo.name],
      ['Roll Number', studentInfo.rollNumber],
      ['Program', studentInfo.program],
      ['Report Generated', format(new Date(), 'dd/MM/yyyy HH:mm')],
      ['', ''],
      [
        'Course Code',
        'Course Name',
        'Attended',
        'Total',
        'Percentage',
        'Status',
        'Faculty'
      ]
    ];

    courseStats.forEach((course) => {
      const status =
        course.percentage >= 75
          ? 'Good'
          : course.percentage >= 60
          ? 'Warning'
          : 'Critical';
      summaryData.push([
        course.course_code || '',
        course.course_name,
        course.attended_periods.toString(),
        course.total_periods.toString(),
        course.percentage.toFixed(2),
        status,
        course.faculty_name || 'N/A'
      ]);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Course Summary');

    // Individual course sheets with recent classes
    courseStats.forEach((course) => {
      if (course.recent_classes && course.recent_classes.length > 0) {
        const courseData = [
          [`${course.course_name} - Detailed Records`, ''],
          ['Course Code', course.course_code || 'N/A'],
          ['Faculty', course.faculty_name || 'N/A'],
          ['Overall Attendance', `${course.percentage.toFixed(2)}%`],
          ['', ''],
          [
            'Date',
            'Period',
            'Start Time',
            'End Time',
            'Status',
            'Marked At',
            'Remarks'
          ]
        ];

        course.recent_classes.forEach((record) => {
          courseData.push([
            record.attendance_date,
            record.period_name,
            record.start_time,
            record.end_time,
            record.status,
            record.marked_at || '',
            record.remarks || ''
          ]);
        });

        const courseSheet = XLSX.utils.aoa_to_sheet(courseData);
        const sheetName = (course.course_code || course.course_name).substring(
          0,
          30
        ); // Excel sheet name limit
        XLSX.utils.book_append_sheet(workbook, courseSheet, sheetName);
      }
    });

    // Generate and save the Excel file
    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array'
    });
    const fileName = `course_attendance_${studentInfo.rollNumber}_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.xlsx`;

    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    saveAs(blob, fileName);
  }

  /**
   * Export attendance summary as CSV
   */
  static async exportToCSV(
    attendanceData: LearnerAttendanceDetails
  ): Promise<void> {
    const csvData: string[][] = [
      [
        'Date',
        'Day',
        'Period',
        'Course',
        'Status',
        'Faculty',
        'Start Time',
        'End Time'
      ]
    ];

    attendanceData.recent_attendance.forEach((day) => {
      day.periods.forEach((period) => {
        csvData.push([
          day.date,
          day.day_name,
          period.period_name,
          period.course_code || period.course_name,
          period.status,
          period.faculty_name || 'N/A',
          period.start_time,
          period.end_time
        ]);
      });
    });

    const csvContent = csvData.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `attendance_${attendanceData.roll_number}_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.csv`;

    saveAs(blob, fileName);
  }
}
