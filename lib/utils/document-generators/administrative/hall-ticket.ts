/**
 * Hall Ticket Generator
 * Portrait A4, student photo, exam course table, instructions, QR code.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateIndian, getFullName, fetchImageAsDataUrl } from '../brand-utils';

export class HallTicketGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 16 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const examName = String(data.exam_name || data.additional_title || 'Semester Examination');
    const examDate = formatDateIndian(data.exam_date as string);
    const photoUrl = data.student_photo_url as string | undefined;
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    const courses = (data.exam_courses as Array<{ course_code: string; course_name: string; exam_date?: string; time?: string }>) || [];

    // Header
    let y = this.drawInstitutionHeader();
    y = this.drawTitle('HALL TICKET', y, 16);
    y += 2;

    // Exam name
    this.setTextStyle(11, 'bold', primary);
    this.doc.text(examName, this.pageWidth / 2, y, { align: 'center' });
    y += 6;
    if (examDate !== 'N/A') {
      this.setTextStyle(9, 'normal', DEFAULT_COLORS.mutedText);
      this.doc.text(`Examination Date: ${examDate}`, this.pageWidth / 2, y, { align: 'center' });
      y += 5;
    }
    this.drawSeparator(y);
    y += 4;

    // Student info with photo
    const photoX = this.pageWidth - this.margin - 28;
    const photoY = y;

    // Try to render student photo
    if (photoUrl) {
      const photoData = await fetchImageAsDataUrl(photoUrl);
      if (photoData) {
        try {
          this.doc.addImage(photoData, 'JPEG', photoX, photoY, 25, 30);
          // Photo border
          this.doc.setDrawColor(primary.r, primary.g, primary.b);
          this.doc.setLineWidth(0.5);
          this.doc.rect(photoX, photoY, 25, 30);
        } catch {
          // Placeholder box
          this.doc.setDrawColor(200, 200, 200);
          this.doc.rect(photoX, photoY, 25, 30);
          this.setTextStyle(7, 'normal', DEFAULT_COLORS.mutedText);
          this.doc.text('Photo', photoX + 12.5, photoY + 16, { align: 'center' });
        }
      }
    } else {
      this.doc.setDrawColor(200, 200, 200);
      this.doc.rect(photoX, photoY, 25, 30);
      this.setTextStyle(7, 'normal', DEFAULT_COLORS.mutedText);
      this.doc.text('Photo', photoX + 12.5, photoY + 16, { align: 'center' });
    }

    // Student details (left of photo)
    y = this.drawKeyValueRow('Name:', fullName, y, 45);
    y = this.drawKeyValueRow('Roll No:', String(data.roll_number || 'N/A'), y, 45);
    y = this.drawKeyValueRow('Reg. No:', String(data.register_number || 'N/A'), y, 45);
    y = this.drawKeyValueRow('Programme:', String(data.program_name || 'N/A'), y, 45);
    y = this.drawKeyValueRow('Semester:', String(data.semester_name || 'N/A'), y, 45);
    y = this.drawKeyValueRow('Section:', String(data.section_name || 'N/A'), y, 45);
    y = Math.max(y, photoY + 34);

    this.drawSeparator(y);
    y += 4;

    // Exam courses table
    if (courses.length > 0) {
      const tableBody = courses.map((c, i) => [
        String(i + 1),
        c.course_code,
        c.course_name,
        c.exam_date ? formatDateIndian(c.exam_date) : '',
        c.time || '',
      ]);

      this.doc.autoTable({
        startY: y,
        margin: { left: this.margin, right: this.margin },
        head: [['#', 'Code', 'Course', 'Date', 'Time']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [primary.r, primary.g, primary.b],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
        },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 20 },
          3: { cellWidth: 22 },
          4: { cellWidth: 22 },
        },
      });

      y = this.doc.lastAutoTable.finalY + 6;
    }

    // Instructions
    this.setTextStyle(9, 'bold');
    this.doc.text('Instructions:', this.margin, y);
    y += 5;
    this.setTextStyle(8, 'normal', DEFAULT_COLORS.mutedText);
    const instructions = [
      '1. Candidates must carry this hall ticket to the examination hall.',
      '2. Use of mobile phones and electronic devices is strictly prohibited.',
      '3. Candidates must be seated 15 minutes before the examination.',
      '4. Any form of malpractice will lead to disqualification.',
    ];
    for (const inst of instructions) {
      this.doc.text(inst, this.margin + 2, y);
      y += 4;
    }

    // QR code
    if (this.metadata.verificationUrl) {
      await this.drawQRCode(this.metadata.verificationUrl, this.pageWidth - this.margin - 28, y - 16, 22);
    }

    this.drawSignatureBlock();
    this.drawFooter(1, 1);
    return this.doc;
  }
}
