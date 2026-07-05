import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type {
  AttendanceConsolidationReport,
  SubjectwiseGroup,
} from '@/types/attendance';

/**
 * SUBJECTWISE (Camu-format) PDF EXPORTER
 * =====================================================
 * Created: 2026-07-04
 * Replicates the Camu "Attendance Summary Subjectwise %" report:
 * one landscape matrix per group — students as rows, course codes as
 * columns, cells = attendance % with (attended/taken) period counts.
 */

const LEGEND_TEXT =
  'Student attendance percentage (%) ( No. of period attended by the student ' +
  'for the month (A) / No. of period attendance taken for the month (T) ).';

class ConsolidationSubjectwisePDFExporter {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin = 10;

  constructor() {
    this.doc = new jsPDF('landscape', 'mm', 'a4');
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  export(report: AttendanceConsolidationReport): void {
    const groups = report.reportData?.subjectwiseGroups || [];

    if (groups.length === 0) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(11);
      this.doc.text(
        'No attendance data found for the selected filters and date range.',
        this.pageWidth / 2,
        40,
        { align: 'center' }
      );
    }

    groups.forEach((group, index) => {
      if (index > 0) this.doc.addPage();
      this.renderGroup(report, group);
    });

    this.addPageNumbers();

    const fileName = `${report.reportName.replace(/[^a-z0-9]/gi, '_')}_subjectwise_${format(
      new Date(),
      'yyyy-MM-dd'
    )}.pdf`;
    this.doc.save(fileName);
  }

  private renderGroup(
    report: AttendanceConsolidationReport,
    group: SubjectwiseGroup
  ): void {
    let y = 12;
    const centerX = this.pageWidth / 2;
    const dateRange = `${format(new Date(report.reportParams.dateFrom), 'dd-MMM-yyyy')} To ${format(
      new Date(report.reportParams.dateTo),
      'dd-MMM-yyyy'
    )}`;

    // ---- Header block (Camu layout) ----
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.text(report.institution?.name || '', centerX, y, { align: 'center' });
    y += 6;

    this.doc.setFontSize(11);
    this.doc.text('Attendance Summary Subjectwise %', centerX, y, { align: 'center' });
    y += 5.5;

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.text(dateRange, centerX, y, { align: 'center' });
    y += 5;

    // Degree | Program | Academic Year
    const line2 = [group.degreeName, group.programName, group.academicYearName]
      .filter(Boolean)
      .join(' | ');
    if (line2) {
      this.doc.text(line2, centerX, y, { align: 'center' });
      y += 5;
    }

    // Department | Semester (Section) | Section | Mode
    const semesterWithSection =
      group.semesterName && group.sectionName
        ? `${group.semesterName} (${group.sectionName})`
        : group.semesterName || group.groupName;
    const line3 = [
      group.departmentName,
      semesterWithSection,
      group.sectionName,
      'For All Attendances - Subjectwise',
    ]
      .filter(Boolean)
      .join(' | ');
    this.doc.text(line3, centerX, y, { align: 'center' });
    y += 5;

    // Legend sentence
    this.doc.setFontSize(7);
    this.doc.setTextColor(80, 80, 80);
    this.doc.text(LEGEND_TEXT, centerX, y, {
      align: 'center',
      maxWidth: this.pageWidth - this.margin * 2,
    });
    this.doc.setTextColor(0, 0, 0);
    y += 6;

    // ---- Matrix ----
    const courses = group.courses;
    const grandTotal = courses.reduce((sum, c) => sum + c.totalPeriods, 0);

    const headRow1 = [
      'Regn. No.',
      'Student Name',
      ...courses.map((c) => c.courseCode),
      'Overall',
    ];
    const headRow2 = [
      '',
      'Total no. of periods',
      ...courses.map((c) => `(${c.totalPeriods})`),
      `(${grandTotal})`,
    ];
    const headRow3 = ['', '', ...courses.map(() => '% (A/T)'), '% (A/T)'];

    const body = group.students.map((student) => {
      const cells = courses.map((course) => {
        const cell = student.perCourse[course.courseId];
        if (!cell || cell.total === 0) return '(0/0)';
        const pct = Math.round((cell.present / cell.total) * 100);
        return `${pct}\n(${cell.present}/${cell.total})`;
      });
      const overall =
        student.overallTotal > 0
          ? `${Math.round((student.overallPresent / student.overallTotal) * 100)}\n(${student.overallPresent}/${student.overallTotal})`
          : '(0/0)';
      return [
        student.rollNumber || '-',
        student.studentName,
        ...cells,
        overall,
      ];
    });

    // Column widths: fixed identity columns, courses share the rest
    const regnWidth = 20;
    const nameWidth = 42;
    const overallWidth = 17;
    const available =
      this.pageWidth - this.margin * 2 - regnWidth - nameWidth - overallWidth;
    const courseWidth = courses.length > 0 ? available / courses.length : available;

    const columnStyles: Record<number, any> = {
      0: { cellWidth: regnWidth, halign: 'left' },
      1: { cellWidth: nameWidth, halign: 'left' },
    };
    courses.forEach((_, i) => {
      columnStyles[i + 2] = { cellWidth: courseWidth, halign: 'center' };
    });
    columnStyles[courses.length + 2] = {
      cellWidth: overallWidth,
      halign: 'center',
      fontStyle: 'bold',
    };

    autoTable(this.doc, {
      startY: y,
      head: [headRow1, headRow2, headRow3],
      body,
      margin: { left: this.margin, right: this.margin },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 6.5,
        cellPadding: 0.8,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.1,
        lineColor: [120, 120, 120],
        textColor: [0, 0, 0],
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 6.5,
      },
      columnStyles,
      didParseCell: (data) => {
        // Highlight sub-75% overall cells like a register would
        if (
          data.section === 'body' &&
          data.column.index === courses.length + 2 &&
          typeof data.cell.raw === 'string'
        ) {
          const pct = parseInt(String(data.cell.raw).split('\n')[0], 10);
          if (!Number.isNaN(pct) && pct < 75) {
            data.cell.styles.textColor = [200, 0, 0];
          }
        }
      },
    });

    // ---- Course code legend ----
    const finalY = (this.doc as any).lastAutoTable?.finalY || y;
    const legendLines = courses.map(
      (c) => `${c.courseCode} - ${c.courseName} `
    );
    if (legendLines.length > 0) {
      let legendY = finalY + 5;
      if (legendY > this.pageHeight - 20) {
        this.doc.addPage();
        legendY = 15;
      }
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7);
      this.doc.text('Course Codes:', this.margin, legendY);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(legendLines.join(' | '), this.margin, legendY + 3.5, {
        maxWidth: this.pageWidth - this.margin * 2,
      });
    }
  }

  private addPageNumbers(): void {
    const pageCount = this.doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(120, 120, 120);
      this.doc.text(
        `Page ${i} of ${pageCount}`,
        this.pageWidth - this.margin,
        this.pageHeight - 5,
        { align: 'right' }
      );
      this.doc.setTextColor(0, 0, 0);
    }
  }
}

export function exportConsolidationSubjectwisePDF(
  report: AttendanceConsolidationReport
): void {
  new ConsolidationSubjectwisePDFExporter().export(report);
}
