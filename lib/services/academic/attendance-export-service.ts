import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AttendanceReport,
  DetailedAttendanceReport
} from '@/types/attendance-reports';

export class AttendanceExportService {
  /**
   * Export attendance reports to Excel
   */
  static async exportToExcel(
    reports: AttendanceReport[],
    filename: string = 'attendance-reports'
  ) {
    try {
      // Prepare data for Excel
      const excelData = reports.map((report) => ({
        Date: report.attendance_date,
        Institution: report.institution_name || '-',
        Department: report.department_name || '-',
        Program: report.program_name || '-',
        Degree: report.degree_name || '-',
        Semester: report.semester_name || '-',
        Section: report.section_name || '-',
        Periods: report.periods_count,
        'Total Students': report.total_students,
        'Attendance %': report.average_attendance.toFixed(2),
        Faculty: report.faculty_details.map((f) => f.faculty_name).join(', '),
        Courses: report.courses.map((c) => c.course_name).join(', ')
      }));

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Reports');

      // Auto-size columns
      const maxWidth = 50;
      const wscols = Object.keys(excelData[0] || {}).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...excelData.map((row) => String((row as any)[key] || '').length)
        );
        return { wch: Math.min(maxLength + 2, maxWidth) };
      });
      ws['!cols'] = wscols;

      // Save file
      XLSX.writeFile(
        wb,
        `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`
      );

      return { success: true, error: null };
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Export detailed attendance report to Excel
   */
  static async exportDetailedToExcel(
    report: DetailedAttendanceReport,
    filename: string = 'attendance-detail'
  ) {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryData = [
        {
          'Report Date': report.attendance_date,
          Institution: report.institution_name,
          Department: report.department_name,
          Program: report.program_name,
          Degree: report.degree_name,
          Semester: report.semester_name,
          Section: report.section_name,
          'Academic Year': report.academic_year_name,
          Timetable: report.timetable_name || 'N/A',
          'Total Students': report.total_students,
          Present: report.total_present,
          Absent: report.total_absent,
          'Attendance %': report.average_attendance.toFixed(2),
          'Total Periods': report.period_details.length,
          'Created At': new Date(report.created_at).toLocaleString()
        }
      ];
      const ws1 = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

      // Sheet 2: Period-wise Details
      const periodData = report.period_details.map((period, index) => ({
        'Period Number': period.period_number || index + 1,
        'Period Name':
          period.period_name || `Period ${period.period_number || index + 1}`,
        'Start Time': period.start_time,
        'End Time': period.end_time,
        'Course Name': period.course_name,
        'Course Code': period.course_code || 'N/A',
        'Faculty Name(s)': period.faculty.map((f) => f.faculty_name).join(', '),
        'Faculty Email(s)': period.faculty
          .map((f) => f.faculty_email)
          .join(', '),
        'Marked By': period.marked_by_details
          ? period.marked_by_details.marker_name
          : 'N/A',
        'Marked By Email': period.marked_by_details
          ? period.marked_by_details.marker_email
          : 'N/A',
        'Total Students': period.total_count,
        'Present Count': period.present_count,
        'Absent Count': period.absent_count,
        'Attendance %': period.attendance_percentage.toFixed(2)
      }));
      const ws2 = XLSX.utils.json_to_sheet(periodData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Period Summary');

      // Sheet 3: Overall Student Attendance
      const studentData = report.consolidated_students
        .sort((a, b) =>
          (a.roll_number || '').localeCompare(b.roll_number || '')
        )
        .map((student) => ({
          'Roll No': student.roll_number || '-',
          'Student Name': student.student_name,
          'Overall Status': student.is_present ? 'Present' : 'Absent',
          'Periods Attended': student.periods_attended.join(', ') || 'None',
          'Total Periods Attended': student.periods_attended.length,
          'Total Periods': report.period_details.length,
          'Attendance %': student.attendance_percentage.toFixed(2)
        }));
      const ws3 = XLSX.utils.json_to_sheet(studentData);
      XLSX.utils.book_append_sheet(wb, ws3, 'Overall Attendance');

      // Sheet 4+: Individual Period Student Lists
      report.period_details.forEach((period, index) => {
        const periodStudentData = period.students
          .sort((a, b) =>
            (a.roll_number || '').localeCompare(b.roll_number || '')
          )
          .map((student, studentIndex) => ({
            'S.No': studentIndex + 1,
            'Roll Number': student.roll_number || 'N/A',
            'Student Name': student.student_name,
            'Attendance Status': student.is_present ? 'Present' : 'Absent',
            Period:
              period.period_name ||
              `Period ${period.period_number || index + 1}`,
            Course: period.course_name,
            'Course Code': period.course_code || 'N/A',
            Time: `${period.start_time} - ${period.end_time}`,
            Faculty: period.faculty.map((f) => f.faculty_name).join(', ')
          }));

        const wsName = `P${period.period_number || index + 1} - ${(
          period.period_name || 'Period'
        ).substring(0, 20)}`;
        const wsPeriod = XLSX.utils.json_to_sheet(periodStudentData);

        // Add summary at the top of each period sheet
        const summaryRow = [
          [
            `Period: ${
              period.period_name ||
              `Period ${period.period_number || index + 1}`
            }`
          ],
          [`Course: ${period.course_name} (${period.course_code || 'N/A'})`],
          [`Time: ${period.start_time} - ${period.end_time}`],
          [`Faculty: ${period.faculty.map((f) => f.faculty_name).join(', ')}`],
          [
            `Present: ${period.present_count} | Absent: ${period.absent_count} | Total: ${period.total_count}`
          ],
          [`Attendance Rate: ${period.attendance_percentage.toFixed(2)}%`],
          [''],
          ['Student Details:']
        ];

        XLSX.utils.book_append_sheet(wb, wsPeriod, wsName.substring(0, 31));
      });

      // Auto-size columns for all sheets
      wb.SheetNames.forEach((sheetName) => {
        const worksheet = wb.Sheets[sheetName];
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const maxWidth = 50;

        for (let C = range.s.c; C <= range.e.c; ++C) {
          let maxLength = 0;
          for (let R = range.s.r; R <= range.e.r; ++R) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (worksheet[cellAddress] && worksheet[cellAddress].v) {
              maxLength = Math.max(
                maxLength,
                String(worksheet[cellAddress].v).length
              );
            }
          }
          if (!worksheet['!cols']) worksheet['!cols'] = [];
          worksheet['!cols'][C] = { wch: Math.min(maxLength + 2, maxWidth) };
        }
      });

      // Save file
      XLSX.writeFile(wb, `${filename}-${report.attendance_date}-detailed.xlsx`);

      return { success: true, error: null };
    } catch (error) {
      console.error('Error exporting detailed report to Excel:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Export attendance reports to PDF
   */
  static async exportToPDF(
    reports: AttendanceReport[],
    filename: string = 'attendance-reports'
  ) {
    try {
      const doc = new jsPDF();

      // Add title
      doc.setFontSize(20);
      doc.text('Attendance Reports', 14, 22);

      // Add generation date
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

      // Prepare table data
      const tableData = reports.map((report) => [
        new Date(report.attendance_date).toLocaleDateString(),
        report.section_name || '-',
        report.semester_name || '-',
        `${report.periods_count}`,
        `${report.total_students}`,
        `${report.average_attendance.toFixed(1)}%`,
        report.faculty_details.map((f) => f.faculty_name).join(', ')
      ]);

      // Add table
      autoTable(doc, {
        head: [
          [
            'Date',
            'Section',
            'Semester',
            'Periods',
            'Students',
            'Attendance',
            'Faculty'
          ]
        ],
        body: tableData,
        startY: 35,
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      });

      // Save PDF
      doc.save(`${filename}-${new Date().toISOString().split('T')[0]}.pdf`);

      return { success: true, error: null };
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Export detailed attendance report to PDF
   */
  static async exportDetailedToPDF(
    report: DetailedAttendanceReport,
    filename: string = 'attendance-detail'
  ) {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      let yPosition = 15;

      // Header with institution name
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(
        report.institution_name || 'Institution',
        doc.internal.pageSize.width / 2,
        yPosition,
        { align: 'center' }
      );
      yPosition += 8;

      // Title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'ATTENDANCE REPORT',
        doc.internal.pageSize.width / 2,
        yPosition,
        { align: 'center' }
      );
      yPosition += 10;

      // Report Info Box
      doc.setFontSize(10);
      doc.setDrawColor(200);
      doc.setFillColor(245, 245, 245);
      doc.rect(14, yPosition - 5, 182, 40, 'FD');

      // Left column info
      doc.text(
        `Date: ${new Date(report.attendance_date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}`,
        18,
        yPosition
      );
      yPosition += 6;
      doc.text(`Department: ${report.department_name || 'N/A'}`, 18, yPosition);
      yPosition += 6;
      doc.text(
        `Program: ${report.program_name || 'N/A'} | Degree: ${
          report.degree_name || 'N/A'
        }`,
        18,
        yPosition
      );
      yPosition += 6;
      doc.text(
        `Section: ${report.section_name || 'N/A'} | Semester: ${
          report.semester_name || 'N/A'
        }`,
        18,
        yPosition
      );
      yPosition += 6;
      doc.text(
        `Academic Year: ${report.academic_year_name || 'N/A'}`,
        18,
        yPosition
      );

      // Right column - Overall Statistics
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Overall Attendance: ${report.average_attendance.toFixed(1)}%`,
        120,
        yPosition - 24
      );
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Students: ${report.total_students}`, 120, yPosition - 18);
      doc.text(
        `Present: ${report.total_present} | Absent: ${report.total_absent}`,
        120,
        yPosition - 12
      );
      doc.text(
        `Total Periods: ${report.period_details.length}`,
        120,
        yPosition - 6
      );

      yPosition += 10;

      // Period-wise Detailed Table
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PERIOD-WISE ATTENDANCE DETAILS', 14, yPosition);
      yPosition += 5;

      const periodTableData = report.period_details.map((period, index) => [
        period.period_name || `Period ${period.period_number || index + 1}`,
        `${period.start_time}\n${period.end_time}`,
        `${period.course_name}\n${period.course_code || 'N/A'}`,
        period.faculty.map((f) => f.faculty_name).join('\n'),
        period.marked_by_details ? period.marked_by_details.marker_name : 'N/A',
        `${period.present_count}`,
        `${period.absent_count}`,
        `${period.attendance_percentage.toFixed(1)}%`
      ]);

      autoTable(doc, {
        head: [
          [
            'Period',
            'Time',
            'Course\nCode',
            'Faculty',
            'Marked By',
            'Present',
            'Absent',
            'Rate'
          ]
        ],
        body: periodTableData,
        startY: yPosition,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 25, halign: 'center' },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 25 },
          5: { cellWidth: 15, halign: 'center' },
          6: { cellWidth: 15, halign: 'center' },
          7: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }
        }
      });

      // Period-wise Student Attendance Details
      report.period_details.forEach((period, periodIndex) => {
        doc.addPage();
        yPosition = 15;

        // Period Header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(
          `${
            period.period_name ||
            `Period ${period.period_number || periodIndex + 1}`
          } - Student Attendance`,
          14,
          yPosition
        );
        yPosition += 6;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Course: ${period.course_name} (${period.course_code || 'N/A'})`,
          14,
          yPosition
        );
        yPosition += 5;
        doc.text(
          `Time: ${period.start_time} - ${period.end_time}`,
          14,
          yPosition
        );
        yPosition += 5;
        doc.text(
          `Faculty: ${period.faculty.map((f) => f.faculty_name).join(', ')}`,
          14,
          yPosition
        );
        yPosition += 5;
        doc.text(
          `Marked By: ${
            period.marked_by_details
              ? period.marked_by_details.marker_name
              : 'N/A'
          }`,
          14,
          yPosition
        );
        yPosition += 5;

        // Statistics bar
        doc.setFillColor(240, 240, 240);
        doc.rect(14, yPosition, 182, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text(
          `Present: ${period.present_count} | Absent: ${
            period.absent_count
          } | Total: ${
            period.total_count
          } | Attendance: ${period.attendance_percentage.toFixed(1)}%`,
          doc.internal.pageSize.width / 2,
          yPosition + 5,
          { align: 'center' }
        );
        yPosition += 12;

        // Student list for this period
        const periodStudentData = period.students
          .sort((a, b) =>
            (a.roll_number || '').localeCompare(b.roll_number || '')
          )
          .map((student, idx) => [
            (idx + 1).toString(),
            student.roll_number || 'N/A',
            student.student_name,
            student.is_present ? 'Present' : 'Absent'
          ]);

        autoTable(doc, {
          head: [['S.No', 'Roll No', 'Student Name', 'Status']],
          body: periodStudentData,
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
          bodyStyles: {
            textColor: 50
          },
          columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 30 },
            2: { cellWidth: 100 },
            3: {
              cellWidth: 25,
              halign: 'center',
              fontStyle: 'bold'
            }
          },
          didParseCell: function (data) {
            // Color code the status column
            if (data.column.index === 3 && data.cell.section === 'body') {
              if (data.cell.raw === 'Present') {
                data.cell.styles.textColor = [34, 197, 94];
              } else if (data.cell.raw === 'Absent') {
                data.cell.styles.textColor = [239, 68, 68];
              }
            }
          }
        });
      });

      // Overall Student Summary
      doc.addPage();
      yPosition = 15;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('OVERALL STUDENT ATTENDANCE SUMMARY', 14, yPosition);
      yPosition += 8;

      // Overall Student Table
      const studentTableData = report.consolidated_students
        .sort((a, b) =>
          (a.roll_number || '').localeCompare(b.roll_number || '')
        )
        .map((student, idx) => [
          (idx + 1).toString(),
          student.roll_number || 'N/A',
          student.student_name,
          student.is_present ? 'Present' : 'Absent',
          student.periods_attended.join(', ') || 'None',
          `${student.attendance_percentage.toFixed(1)}%`
        ]);

      autoTable(doc, {
        head: [
          [
            'S.No',
            'Roll No',
            'Name',
            'Status',
            'Periods Attended',
            'Attendance %'
          ]
        ],
        body: studentTableData,
        startY: yPosition,
        styles: {
          fontSize: 7,
          cellPadding: 1.5
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 50 },
          3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 50 },
          5: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
        },
        didParseCell: function (data) {
          // Color code the status column
          if (data.column.index === 3 && data.cell.section === 'body') {
            if (data.cell.raw === 'Present') {
              data.cell.styles.textColor = [34, 197, 94];
            } else if (data.cell.raw === 'Absent') {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
          // Color code attendance percentage
          if (data.column.index === 5 && data.cell.section === 'body') {
            const percentage = parseFloat(String(data.cell.raw || '0'));
            if (percentage >= 75) {
              data.cell.styles.textColor = [34, 197, 94];
            } else {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
        }
      });

      // Footer on all pages
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(
          `Page ${i} of ${pageCount}`,
          14,
          doc.internal.pageSize.height - 10
        );
        doc.text(
          `Generated: ${new Date().toLocaleString()}`,
          doc.internal.pageSize.width - 14,
          doc.internal.pageSize.height - 10,
          { align: 'right' }
        );
      }

      // Save PDF
      doc.save(`${filename}-${report.attendance_date}-detailed.pdf`);

      return { success: true, error: null };
    } catch (error) {
      console.error('Error exporting detailed report to PDF:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Export to CSV
   */
  static async exportToCSV(
    reports: AttendanceReport[],
    filename: string = 'attendance-reports'
  ) {
    try {
      // Prepare CSV content
      const headers = [
        'Date',
        'Institution',
        'Department',
        'Program',
        'Degree',
        'Semester',
        'Section',
        'Periods',
        'Total Students',
        'Attendance %',
        'Faculty',
        'Courses'
      ];

      const rows = reports.map((report) => [
        report.attendance_date,
        report.institution_name || '-',
        report.department_name || '-',
        report.program_name || '-',
        report.degree_name || '-',
        report.semester_name || '-',
        report.section_name || '-',
        report.periods_count,
        report.total_students,
        report.average_attendance.toFixed(2),
        report.faculty_details.map((f) => f.faculty_name).join('; '),
        report.courses.map((c) => c.course_name).join('; ')
      ]);

      // Create CSV content
      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `${filename}-${new Date().toISOString().split('T')[0]}.csv`
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return { success: true, error: null };
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
