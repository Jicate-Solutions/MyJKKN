/**
 * Bonafide Certificate / Letter Generator
 * Portrait A4, letterhead, formal "To Whom It May Concern" style, QR verification.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class BonafideLetterGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, {
      orientation: 'portrait',
      pageSize: 'a4',
      margin: 20,
    });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const fatherName = String(data.father_name || 'N/A');
    const rollNumber = String(data.roll_number || 'N/A');
    const registerNumber = String(data.register_number || 'N/A');
    const programName = String(data.program_name || 'N/A');
    const degreeName = String(data.degree_name || '');
    const departmentName = String(data.department_name || 'N/A');
    const semesterName = String(data.semester_name || 'N/A');
    const sectionName = String(data.section_name || '');
    const academicYear = String(data.academic_year_name || 'N/A');
    const batchName = String(data.batch_name || '');
    const currentDate = formatDateLong(new Date().toISOString());

    // Letterhead
    let y = this.drawLetterhead();

    // Date and reference number (right-aligned)
    const dark = DEFAULT_COLORS.darkText;
    const muted = DEFAULT_COLORS.mutedText;

    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(dark.r, dark.g, dark.b);
    this.doc.text(`Date: ${currentDate}`, this.pageWidth - this.margin, y, { align: 'right' });
    y += 5;
    this.doc.text(`Ref: ${this.metadata.documentNumber}`, this.pageWidth - this.margin, y, { align: 'right' });
    y += 12;

    // Title
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(primary.r, primary.g, primary.b);
    this.doc.text('BONAFIDE CERTIFICATE', this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    // "To Whom It May Concern"
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'italic');
    this.doc.setTextColor(muted.r, muted.g, muted.b);
    this.doc.text('To Whom It May Concern', this.pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Body text
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(dark.r, dark.g, dark.b);

    const programDesc = degreeName ? `${degreeName} — ${programName}` : programName;
    const bodyLines = [
      `This is to certify that ${fullName}, S/D of ${fatherName},`,
      `bearing Roll Number ${rollNumber} and Registration Number ${registerNumber},`,
      `is a bonafide student of this institution, currently enrolled in the`,
      `${programDesc} programme,`,
      `Department of ${departmentName}, during the academic year ${academicYear}.`,
    ];

    if (semesterName && semesterName !== 'N/A') {
      bodyLines.push('');
      bodyLines.push(`Current Semester: ${semesterName}${sectionName ? `, Section ${sectionName}` : ''}`);
    }
    if (batchName && batchName !== 'N/A') {
      bodyLines.push(`Batch: ${batchName}`);
    }

    const lineHeight = 6;
    for (const line of bodyLines) {
      if (line === '') {
        y += 3;
        continue;
      }
      this.doc.text(line, this.margin, y);
      y += lineHeight;
    }

    y += 8;

    // Additional note
    this.doc.setFontSize(10);
    this.doc.setTextColor(muted.r, muted.g, muted.b);
    this.doc.text(
      'This certificate is issued upon request for whatever purpose it may serve.',
      this.margin,
      y
    );
    y += 6;
    this.doc.text(
      'The institution bears no responsibility for the purpose for which this certificate is used.',
      this.margin,
      y
    );

    // QR Code (bottom-right, if enabled)
    if (this.metadata.verificationUrl) {
      await this.drawQRCode(
        this.metadata.verificationUrl,
        this.pageWidth - this.margin - 30,
        this.pageHeight - 60,
        25
      );
      this.doc.setFontSize(6);
      this.doc.setTextColor(muted.r, muted.g, muted.b);
      this.doc.text('Scan to verify', this.pageWidth - this.margin - 17.5, this.pageHeight - 33, { align: 'center' });
    }

    // Signature block
    this.drawSignatureBlock(this.pageHeight - 45);

    // Footer
    this.drawFooter();

    return this.doc;
  }
}
