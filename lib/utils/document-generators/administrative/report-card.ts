/**
 * Report Card Generator
 * Portrait A4, student info box, course attendance table, remarks.
 * v1: No grades table exists — shows attendance + course enrollment.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, getFullName } from '../brand-utils';

export class ReportCardGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 16 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const courseWise = (data.courseWise as Array<{ course_name: string; course_code?: string; total: number; present: number; absent: number; percentage: number }>) || [];
    const attendancePercentage = data.attendance_percentage != null ? `${Number(data.attendance_percentage).toFixed(1)}%` : 'N/A';
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;

    // Header
    let y = this.drawInstitutionHeader();
    y = this.drawTitle('REPORT CARD', y, 16);
    y += 2;

    // Student info box
    y = this.drawStudentInfoBox({
      full_name: fullName,
      roll_number: data.roll_number,
      program_name: data.program_name,
      semester_name: data.semester_name,
      department_name: data.department_name,
      section_name: data.section_name,
      register_number: data.register_number,
      academic_year_name: data.academic_year_name,
    }, y);

    this.drawSeparator(y);
    y += 4;

    // Overall attendance
    this.setTextStyle(10, 'bold');
    this.doc.text(`Overall Attendance: ${attendancePercentage}`, this.margin, y);
    y += 6;

    // Course-wise attendance table
    if (courseWise.length > 0) {
      this.setTextStyle(10, 'bold', primary);
      this.doc.text('Course-wise Attendance', this.margin, y);
      y += 4;

      const tableBody = courseWise.map((c, i) => [
        String(i + 1),
        c.course_code || '',
        c.course_name,
        String(c.total),
        String(c.present),
        String(c.absent),
        `${c.percentage.toFixed(1)}%`,
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.doc as any).autoTable({
        startY: y,
        margin: { left: this.margin, right: this.margin },
        head: [['#', 'Code', 'Course', 'Total', 'Present', 'Absent', '%']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [primary.r, primary.g, primary.b],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
        },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 248, 240] },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 18 },
          3: { cellWidth: 14, halign: 'center' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 14, halign: 'center' },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (this.doc as any).lastAutoTable.finalY + 6;
    } else {
      this.setTextStyle(9, 'italic', DEFAULT_COLORS.mutedText);
      this.doc.text('Course-wise attendance data not available.', this.margin, y);
      y += 6;
    }

    // Grades placeholder
    this.setTextStyle(9, 'normal', DEFAULT_COLORS.mutedText);
    this.doc.text('Note: Semester grades will be available after examination results are published.', this.margin, y);
    y += 8;

    // Remarks section
    this.drawSeparator(y);
    y += 4;
    this.setTextStyle(10, 'bold');
    this.doc.text('Remarks:', this.margin, y);
    y += 5;
    this.setTextStyle(9, 'normal');
    const remarks = String(data.remarks || 'No remarks.');
    this.doc.text(remarks, this.margin, y, { maxWidth: this.contentWidth });

    // Signature and footer
    this.drawSignatureBlock();
    this.drawFooter(1, 1);

    return this.doc;
  }
}
