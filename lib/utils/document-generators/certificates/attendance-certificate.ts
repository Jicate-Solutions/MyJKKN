/**
 * Attendance Certificate Generator
 * Landscape A4, awarded for meeting attendance threshold.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, getFullName } from '../brand-utils';

export class AttendanceCertificateGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'landscape', pageSize: 'a4' });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const percentage = data.attendance_percentage != null ? `${Number(data.attendance_percentage).toFixed(1)}%` : 'N/A';
    const threshold = data.attendance_threshold ? `${data.attendance_threshold}%` : '75%';
    const semesterName = String(data.semester_name || '');
    const programName = String(data.program_name || '');

    this.drawBackground();
    this.drawBorder();
    this.drawCornerAccents();
    this.drawWatermark();
    let y = this.drawInstitutionHeader(12);
    this.drawAccentSeparator(y);
    y += 6;

    y = this.drawTitle('ATTENDANCE CERTIFICATE', y, 22);
    y += 4;

    const dark = DEFAULT_COLORS.darkText;
    this.setTextStyle(11, 'normal', dark);
    this.doc.text('This is to certify that', this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.setTextStyle(20, 'bold', primary);
    this.doc.text(fullName, this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    this.setTextStyle(11, 'normal', dark);
    const lines = [
      `has maintained an attendance of ${percentage}`,
      `exceeding the required threshold of ${threshold}`,
    ];
    if (semesterName) lines.push(`during ${semesterName}`);
    if (programName) lines.push(`in ${programName}`);

    for (const line of lines) {
      this.doc.text(line, this.pageWidth / 2, y, { align: 'center' });
      y += 6;
    }

    this.drawSignatureBlock(this.pageHeight - 38);
    this.drawFooter();
    return this.doc;
  }
}
