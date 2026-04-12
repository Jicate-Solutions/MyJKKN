/**
 * Admission Letter Generator
 * Portrait A4, letterhead, formal admission/welcome letter.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class AdmissionLetterGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 20 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const programName = String(data.program_name || 'N/A');
    const degreeName = String(data.degree_name || '');
    const departmentName = String(data.department_name || '');
    const academicYear = String(data.academic_year_name || '');
    const currentDate = formatDateLong(new Date().toISOString());
    const reportingDate = formatDateLong(data.reporting_date as string);

    let y = this.drawLetterhead();
    const dark = DEFAULT_COLORS.darkText;
    const muted = DEFAULT_COLORS.mutedText;

    // Date
    this.setTextStyle(9, 'normal', dark);
    this.doc.text(`Date: ${currentDate}`, this.pageWidth - this.margin, y, { align: 'right' });
    this.doc.text(`Ref: ${this.metadata.documentNumber}`, this.margin, y);
    y += 8;

    // Addressee
    this.setTextStyle(10, 'normal', dark);
    this.doc.text(`To,`, this.margin, y); y += 5;
    this.setTextStyle(10, 'bold', dark);
    this.doc.text(fullName, this.margin, y); y += 5;
    if (data.permanent_address_street) {
      this.setTextStyle(9, 'normal', muted);
      this.doc.text(String(data.permanent_address_street), this.margin, y); y += 4;
      const addr = [data.permanent_address_district, data.permanent_address_state, data.permanent_address_pin_code].filter(Boolean).join(', ');
      if (addr) { this.doc.text(addr, this.margin, y); y += 4; }
    }
    y += 6;

    // Subject
    this.setTextStyle(10, 'bold', dark);
    const programDesc = degreeName ? `${degreeName} — ${programName}` : programName;
    this.doc.text(`Subject: Admission to ${programDesc}`, this.margin, y);
    y += 8;

    // Salutation
    this.setTextStyle(10, 'normal', dark);
    this.doc.text(`Dear ${fullName},`, this.margin, y);
    y += 8;

    // Body
    const lineH = 5.5;
    const body = [
      `We are pleased to inform you that you have been admitted to the ${programDesc} programme`,
      `in the Department of ${departmentName || 'the assigned department'}${academicYear ? ` for the academic year ${academicYear}` : ''}.`,
      ``,
      `We congratulate you on this achievement and look forward to welcoming you to our institution.`,
      ``,
      `Please note the following:`,
    ];

    for (const line of body) {
      if (line === '') { y += 3; continue; }
      this.doc.text(line, this.margin, y, { maxWidth: this.contentWidth });
      y += lineH;
    }

    y += 2;
    const bullet = '\u2022';
    const items = [
      reportingDate !== 'N/A' ? `Reporting Date: ${reportingDate}` : null,
      `Programme: ${programDesc}`,
      departmentName ? `Department: ${departmentName}` : null,
      `Please bring all original documents for verification.`,
      `Fee payment details will be communicated separately.`,
    ].filter(Boolean) as string[];

    for (const item of items) {
      this.doc.text(`  ${bullet}  ${item}`, this.margin, y, { maxWidth: this.contentWidth - 10 });
      y += lineH;
    }

    y += 8;
    this.doc.text('We wish you a successful academic journey ahead.', this.margin, y);
    y += 10;
    this.doc.text('Yours sincerely,', this.margin, y);

    this.drawSignatureBlock(this.pageHeight - 45);
    this.drawFooter();
    return this.doc;
  }
}
