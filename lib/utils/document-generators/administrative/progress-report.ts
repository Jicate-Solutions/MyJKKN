/**
 * Progress Report Generator
 * Portrait A4, attendance summary, course enrollment, PDE scores if available.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, getFullName } from '../brand-utils';

export class ProgressReportGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 16 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const attendancePercentage = data.attendance_percentage != null ? `${Number(data.attendance_percentage).toFixed(1)}%` : 'N/A';
    const totalClasses = data.totalClasses != null ? String(data.totalClasses) : 'N/A';
    const presentCount = data.presentCount != null ? String(data.presentCount) : 'N/A';
    const absentCount = data.absentCount != null ? String(data.absentCount) : 'N/A';
    const courseWise = (data.courseWise as Array<{ course_name: string; course_code?: string; total: number; present: number; percentage: number }>) || [];
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;

    let y = this.drawInstitutionHeader();
    y = this.drawTitle('STUDENT PROGRESS REPORT', y, 14);
    y += 2;

    // Student info
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

    // Attendance summary box
    this.setTextStyle(11, 'bold', primary);
    this.doc.text('Attendance Summary', this.margin, y);
    y += 6;

    y = this.drawKeyValuePair('Total Classes:', totalClasses, 'Present:', presentCount, y);
    y = this.drawKeyValuePair('Absent:', absentCount, 'Percentage:', attendancePercentage, y);
    y += 2;

    // Attendance bar visualization
    const pct = data.attendance_percentage != null ? Number(data.attendance_percentage) : 0;
    const barY = y;
    const barWidth = this.contentWidth;
    const barHeight = 6;
    // Background
    this.doc.setFillColor(230, 230, 220);
    this.doc.rect(this.margin, barY, barWidth, barHeight, 'F');
    // Fill
    const fillColor = pct >= 75 ? primary : { r: 220, g: 50, b: 50 };
    this.doc.setFillColor(fillColor.r, fillColor.g, fillColor.b);
    this.doc.rect(this.margin, barY, barWidth * (pct / 100), barHeight, 'F');
    // Border
    this.doc.setDrawColor(180, 180, 180);
    this.doc.setLineWidth(0.2);
    this.doc.rect(this.margin, barY, barWidth, barHeight);
    // Label
    this.setTextStyle(7, 'bold', DEFAULT_COLORS.white);
    if (pct > 15) {
      this.doc.text(`${pct.toFixed(1)}%`, this.margin + 3, barY + 4.5);
    }
    y = barY + barHeight + 6;

    // Course-wise table
    if (courseWise.length > 0) {
      this.setTextStyle(10, 'bold', primary);
      this.doc.text('Course-wise Breakdown', this.margin, y);
      y += 4;

      const tableBody = courseWise.map((c, i) => [
        String(i + 1),
        c.course_code || '',
        c.course_name,
        String(c.total),
        String(c.present),
        `${c.percentage.toFixed(1)}%`,
      ]);

      this.doc.autoTable({
        startY: y,
        margin: { left: this.margin, right: this.margin },
        head: [['#', 'Code', 'Course', 'Total', 'Present', '%']],
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
      });

      y = this.doc.lastAutoTable.finalY + 6;
    }

    // Remarks
    this.drawSeparator(y);
    y += 4;
    this.setTextStyle(10, 'bold');
    this.doc.text('Remarks:', this.margin, y);
    y += 5;
    this.setTextStyle(9, 'normal');
    this.doc.text(String(data.remarks || 'Keep up the good work.'), this.margin, y, { maxWidth: this.contentWidth });

    this.drawSignatureBlock();
    this.drawFooter(1, 1);
    return this.doc;
  }
}
