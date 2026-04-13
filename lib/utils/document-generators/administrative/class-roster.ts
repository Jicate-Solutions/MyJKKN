/**
 * Class Roster Generator
 * Landscape A4, section-wide student list table using autotable.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS } from '../brand-utils';

export class ClassRosterGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'landscape', pageSize: 'a4', margin: 14 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const students = (data.students as Array<{
      roll_number?: string;
      register_number?: string;
      first_name: string;
      last_name: string;
      gender?: string;
      student_mobile?: string;
      father_name?: string;
    }>) || [];

    const sectionName = String(data.section_name || '');
    const semesterName = String(data.semester_name || '');
    const programName = String(data.program_name || '');
    const departmentName = String(data.department_name || '');
    const academicYear = String(data.academic_year_name || '');
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;

    let y = this.drawInstitutionHeader(8);
    y = this.drawTitle('CLASS ROSTER', y, 14);
    y += 2;

    // Section info
    this.setTextStyle(9, 'normal');
    const sectionInfo = [programName, departmentName, semesterName, sectionName ? `Section ${sectionName}` : '', academicYear].filter(Boolean).join('  |  ');
    this.doc.text(sectionInfo, this.pageWidth / 2, y, { align: 'center' });
    y += 4;

    this.setTextStyle(9, 'bold', primary);
    this.doc.text(`Total Students: ${students.length}`, this.pageWidth / 2, y, { align: 'center' });
    y += 4;

    this.drawSeparator(y);
    y += 3;

    // Student table
    if (students.length > 0) {
      const tableBody = students.map((s, i) => [
        String(i + 1),
        s.roll_number || '',
        s.register_number || '',
        `${s.first_name} ${s.last_name}`.trim(),
        s.gender || '',
        s.father_name || '',
        s.student_mobile || '',
      ]);

      this.doc.autoTable({
        startY: y,
        margin: { left: this.margin, right: this.margin },
        head: [['#', 'Roll No', 'Reg. No', 'Student Name', 'Gender', "Father's Name", 'Mobile']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [primary.r, primary.g, primary.b],
          textColor: [255, 255, 255],
          fontSize: 7,
          fontStyle: 'bold',
        },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 248, 240] },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 22 },
          2: { cellWidth: 28 },
          4: { cellWidth: 16 },
          6: { cellWidth: 25 },
        },
        didDrawPage: () => {
          // Add page number on each page
          const pageCount = this.doc.getNumberOfPages();
          for (let i = 1; i <= pageCount; i++) {
            this.doc.setPage(i);
            this.drawFooter(i, pageCount);
          }
        },
      });
    } else {
      this.setTextStyle(10, 'normal', DEFAULT_COLORS.mutedText);
      this.doc.text('No students found in this section.', this.pageWidth / 2, y + 10, { align: 'center' });
    }

    // Footer on last page
    const totalPages = this.doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);
      this.drawFooter(i, totalPages);
    }

    return this.doc;
  }
}
