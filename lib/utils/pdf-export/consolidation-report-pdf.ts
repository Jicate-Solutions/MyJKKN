/**
 * PDF Export Utility for Attendance Consolidation Reports
 * Created: 2026-01-24
 * Purpose: Generate PDF exports of consolidation reports with complete data
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { AttendanceConsolidationReport } from '@/types/attendance';

interface PDFExportOptions {
  includeAbsentDetails?: boolean;
  includePeriodBreakdown?: boolean;
}

export class ConsolidationReportPDFExporter {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin = 14;
  private yPosition = 14;
  private isLandscape = false;

  constructor(landscape = false) {
    this.isLandscape = landscape;
    this.doc = new jsPDF(landscape ? 'l' : 'p', 'mm', 'a4');
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  /**
   * Export consolidation report to PDF
   */
  async exportReport(report: AttendanceConsolidationReport, options: PDFExportOptions = {}): Promise<void> {
    if (!report.reportData) {
      throw new Error('Report data is not available');
    }

    const { summary, groups } = report.reportData;

    // Add header
    this.addReportHeader(report);

    // Add summary statistics
    this.addSummarySection(summary);

    // Add groups and student details
    this.addGroupsSection(groups, report.reportParams.groupBy, {
      includeAbsentDetails: options.includeAbsentDetails || report.reportParams.includeAbsentDetails,
      includePeriodBreakdown: options.includePeriodBreakdown || report.reportParams.includePeriodBreakdown,
    });

    // Add footer to all pages
    this.addPageNumbers();

    // Add orientation note
    if (this.isLandscape) {
      this.doc.setPage(1);
      this.doc.setFontSize(7);
      this.doc.setTextColor(150, 150, 150);
      this.doc.text('(Landscape format for better hierarchy visibility)', this.margin, this.pageHeight - 5);
    }

    // Save the PDF
    const fileName = `${report.reportName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    this.doc.save(fileName);
  }

  /**
   * Add report header with title and metadata
   */
  private addReportHeader(report: AttendanceConsolidationReport) {
    const { reportName, reportDescription, reportParams, institution, createdAt } = report;

    // Title
    this.doc.setFontSize(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(reportName, this.margin, this.yPosition);
    this.yPosition += 8;

    // Description
    if (reportDescription) {
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'normal');
      const descLines = this.doc.splitTextToSize(reportDescription, this.pageWidth - this.margin * 2);
      this.doc.text(descLines, this.margin, this.yPosition);
      this.yPosition += descLines.length * 5 + 3;
    }

    // Metadata table
    this.doc.setFontSize(9);
    const metadata = [
      ['Institution', institution?.name || 'N/A'],
      ['Date Range', `${reportParams.dateFrom} to ${reportParams.dateTo}`],
      ['Grouped By', reportParams.groupBy.charAt(0).toUpperCase() + reportParams.groupBy.slice(1)],
      ['Generated', format(new Date(createdAt), 'PPp')],
    ];

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [],
      body: metadata,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 'auto' },
      },
      margin: { left: this.margin },
    });

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 8;
    this.addSeparator();
  }

  /**
   * Add overall summary statistics
   */
  private addSummarySection(summary: any) {
    this.addSectionTitle('Overall Summary');

    const totalPeriods = (summary.totalPresent || 0) + (summary.totalAbsent || 0);
    const summaryData = [
      ['Total Students', summary.totalStudents.toString()],
      ['Total Periods', totalPeriods.toString()],
      ['Average Attendance', `${summary.averageAttendance.toFixed(2)}%`],
      ['Total Present Periods', summary.totalPresent?.toString() || '0'],
      ['Total Absent Periods', summary.totalAbsent?.toString() || '0'],
    ];

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], fontSize: 10, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto', halign: 'right' },
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 8;
    this.addSeparator();
  }

  /**
   * Add groups and student details
   */
  private addGroupsSection(
    groups: any[],
    groupBy: string,
    options: { includeAbsentDetails?: boolean; includePeriodBreakdown?: boolean }
  ) {
    groups.forEach((group, index) => {
      // Check if we need a new page
      if (this.yPosition > this.pageHeight - 60) {
        this.doc.addPage();
        this.yPosition = this.margin;
      }

      // Group header
      this.addGroupHeader(group, groupBy);

      // Group statistics
      this.addGroupStatistics(group);

      // Student details table
      this.addStudentDetailsTable(group.students, options);

      // Add spacing between groups
      if (index < groups.length - 1) {
        this.yPosition += 5;
        this.addSeparator();
      }
    });
  }

  /**
   * Add group header with name and metadata
   */
  private addGroupHeader(group: any, groupBy: string) {
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'bold');

    const groupTypeLabel = groupBy.charAt(0).toUpperCase() + groupBy.slice(1);
    this.doc.text(`${groupTypeLabel}: ${group.groupName}`, this.margin, this.yPosition);
    this.yPosition += 6;

    // Add hierarchy breadcrumb if available (from first student's data)
    if (group.students && group.students.length > 0) {
      const firstStudent = group.students[0];
      const hierarchyParts: string[] = [];

      if (firstStudent.degreeName) hierarchyParts.push(firstStudent.degreeName);
      if (firstStudent.departmentName) hierarchyParts.push(firstStudent.departmentName);
      if (firstStudent.programName) hierarchyParts.push(firstStudent.programName);
      if (firstStudent.semesterName && groupBy !== 'semester') hierarchyParts.push(firstStudent.semesterName);
      if (firstStudent.sectionName && groupBy !== 'section') hierarchyParts.push(firstStudent.sectionName);

      if (hierarchyParts.length > 0) {
        this.doc.setFontSize(8);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(100, 100, 100);
        this.doc.text(hierarchyParts.join(' > '), this.margin, this.yPosition);
        this.doc.setTextColor(0, 0, 0);
        this.yPosition += 5;
      }
    }
  }

  /**
   * Add group statistics summary
   */
  private addGroupStatistics(group: any) {
    // Build hierarchy info from first student if available
    const hierarchyInfo: string[] = [];
    if (group.students && group.students.length > 0) {
      const student = group.students[0];
      if (student.degreeName) hierarchyInfo.push(`Degree: ${student.degreeName}`);
      if (student.departmentName) hierarchyInfo.push(`Dept: ${student.departmentName}`);
      if (student.programName) hierarchyInfo.push(`Program: ${student.programName}`);
    }

    const statsData = [
      [
        `Students: ${group.totalStudents}`,
        `Avg. Attendance: ${group.averageAttendance.toFixed(2)}%`,
        `Present: ${group.totalPresent || 0}`,
        `Absent: ${group.totalAbsent || 0}`,
        ...hierarchyInfo,
      ],
    ];

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [],
      body: statsData,
      theme: 'plain',
      styles: { fontSize: 7.5, cellPadding: 2, fontStyle: 'bold', textColor: [100, 100, 100] },
      margin: { left: this.margin },
    });

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 4;
  }

  /**
   * Add student details table
   */
  private addStudentDetailsTable(
    students: any[],
    options: { includeAbsentDetails?: boolean; includePeriodBreakdown?: boolean }
  ) {
    // Check if we have hierarchy data to show
    const hasHierarchyData = students.some(s =>
      s.degreeName || s.departmentName || s.programName || s.semesterName || s.sectionName
    );

    // Prepare table headers
    const headers = hasHierarchyData
      ? ['#', 'Roll No.', 'Student Name', 'Degree', 'Dept.', 'Program', 'Sem.', 'Section', 'Total', 'Present', 'Absent', 'Att. %']
      : ['#', 'Roll No.', 'Student Name', 'Total Periods', 'Present', 'Absent', 'Attendance %'];

    // Prepare table data
    const tableData = students.map((student, index) => {
      const totalPeriods = student.totalPresent + student.totalAbsent;

      if (hasHierarchyData) {
        return [
          (index + 1).toString(),
          student.rollNumber || 'N/A',
          student.studentName,
          student.degreeName || '-',
          student.departmentName || '-',
          student.programName || '-',
          student.semesterName || '-',
          student.sectionName || '-',
          totalPeriods.toString(),
          student.totalPresent.toString(),
          student.totalAbsent.toString(),
          `${student.attendancePercentage.toFixed(2)}%`,
        ];
      } else {
        return [
          (index + 1).toString(),
          student.rollNumber || 'N/A',
          student.studentName,
          totalPeriods.toString(),
          student.totalPresent.toString(),
          student.totalAbsent.toString(),
          `${student.attendancePercentage.toFixed(2)}%`,
        ];
      }
    });

    // Configure column styles based on hierarchy data
    const columnStyles = hasHierarchyData
      ? {
          0: { cellWidth: 8, halign: 'center' },    // #
          1: { cellWidth: 18, halign: 'center' },   // Roll No.
          2: { cellWidth: 'auto', minCellWidth: 30 }, // Student Name
          3: { cellWidth: 20, fontSize: 7 },        // Degree
          4: { cellWidth: 20, fontSize: 7 },        // Dept.
          5: { cellWidth: 20, fontSize: 7 },        // Program
          6: { cellWidth: 12, halign: 'center', fontSize: 7 }, // Sem.
          7: { cellWidth: 15, fontSize: 7 },        // Section
          8: { cellWidth: 15, halign: 'center', fontSize: 7 },  // Total
          9: { cellWidth: 15, halign: 'center', fontSize: 7 },  // Present
          10: { cellWidth: 15, halign: 'center', fontSize: 7 }, // Absent
          11: { cellWidth: 18, halign: 'center' },  // Att. %
        }
      : {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 25, halign: 'center' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 20, halign: 'center' },
          6: { cellWidth: 25, halign: 'center' },
        };

    const attendanceColIndex = hasHierarchyData ? 11 : 6;

    autoTable(this.doc, {
      startY: this.yPosition,
      head: [headers],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [34, 197, 94],
        fontSize: hasHierarchyData ? 7 : 9,
        fontStyle: 'bold',
        halign: 'center',
      },
      styles: {
        fontSize: hasHierarchyData ? 6.5 : 8,
        cellPadding: hasHierarchyData ? 1.5 : 2,
      },
      columnStyles,
      margin: { left: this.margin, right: this.margin },
      didParseCell: (data) => {
        // Color attendance percentage based on value
        if (data.column.index === attendanceColIndex && data.section === 'body') {
          const percentage = parseFloat(data.cell.text[0]);
          if (percentage >= 90) {
            data.cell.styles.textColor = [22, 163, 74]; // Green
          } else if (percentage >= 75) {
            data.cell.styles.textColor = [59, 130, 246]; // Blue
          } else if (percentage >= 60) {
            data.cell.styles.textColor = [234, 179, 8]; // Yellow
          } else {
            data.cell.styles.textColor = [239, 68, 68]; // Red
          }
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    this.yPosition = (this.doc as any).lastAutoTable.finalY + 2;

    // Add absent details if requested
    if (options.includeAbsentDetails) {
      this.addAbsentDetailsSection(students);
    }

    this.yPosition += 3;
  }

  /**
   * Add absent details section (if requested)
   */
  private addAbsentDetailsSection(students: any[]) {
    const studentsWithAbsences = students.filter(
      (s) => s.absentDates && s.absentDates.length > 0
    );

    if (studentsWithAbsences.length === 0) return;

    // Check if we need a new page
    if (this.yPosition > this.pageHeight - 40) {
      this.doc.addPage();
      this.yPosition = this.margin;
    }

    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Absent Details:', this.margin, this.yPosition);
    this.yPosition += 5;

    studentsWithAbsences.forEach((student) => {
      if (this.yPosition > this.pageHeight - 20) {
        this.doc.addPage();
        this.yPosition = this.margin;
      }

      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`${student.studentName} (${student.rollNumber || 'N/A'}):`, this.margin + 3, this.yPosition);
      this.yPosition += 4;

      this.doc.setFont('helvetica', 'normal');
      const absentDatesText = student.absentDates.join(', ');
      const lines = this.doc.splitTextToSize(absentDatesText, this.pageWidth - this.margin * 2 - 6);
      this.doc.text(lines, this.margin + 6, this.yPosition);
      this.yPosition += lines.length * 4 + 2;
    });

    this.yPosition += 2;
  }

  /**
   * Add section title
   */
  private addSectionTitle(title: string) {
    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin, this.yPosition);
    this.yPosition += 7;
  }

  /**
   * Add horizontal separator line
   */
  private addSeparator() {
    this.doc.setDrawColor(200, 200, 200);
    this.doc.setLineWidth(0.2);
    this.doc.line(this.margin, this.yPosition, this.pageWidth - this.margin, this.yPosition);
    this.yPosition += 5;
  }

  /**
   * Add page numbers to all pages
   */
  private addPageNumbers() {
    const totalPages = this.doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(150, 150, 150);
      this.doc.text(
        `Page ${i} of ${totalPages}`,
        this.pageWidth / 2,
        this.pageHeight - 10,
        { align: 'center' }
      );
    }
  }
}

/**
 * Export consolidation report to PDF
 */
export async function exportConsolidationReportToPDF(
  report: AttendanceConsolidationReport,
  options?: PDFExportOptions
): Promise<void> {
  // Auto-detect if we need landscape orientation based on hierarchy data
  let useLandscape = false;
  if (report.reportData?.groups && report.reportData.groups.length > 0) {
    const firstGroup = report.reportData.groups[0];
    if (firstGroup.students && firstGroup.students.length > 0) {
      const student = firstGroup.students[0];
      useLandscape = !!(student.degreeName || student.departmentName || student.programName);
    }
  }

  const exporter = new ConsolidationReportPDFExporter(useLandscape);
  await exporter.exportReport(report, options);
}
