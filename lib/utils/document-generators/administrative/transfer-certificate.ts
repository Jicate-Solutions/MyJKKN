/**
 * Transfer Certificate (TC) Generator
 * Portrait A4, formal TC with serial number, conduct, dates, QR verification.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class TransferCertificateGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 20 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const fatherName = String(data.father_name || 'N/A');
    const dob = formatDateLong(data.date_of_birth as string);
    const community = String(data.community || 'N/A');
    const religion = String(data.religion || 'N/A');
    const programName = String(data.program_name || 'N/A');
    const admissionDate = formatDateLong(data.admission_date as string || data.created_at as string);
    const leavingDate = formatDateLong(data.leaving_date as string || new Date().toISOString());
    const conduct = String(data.conduct || 'Good');
    const reason = String(data.leaving_reason || 'Completion of Course');
    const currentDate = formatDateLong(new Date().toISOString());

    let y = this.drawLetterhead();

    // Date and TC number
    this.setTextStyle(9, 'normal');
    this.doc.text(`Date: ${currentDate}`, this.pageWidth - this.margin, y, { align: 'right' });
    this.doc.text(`TC No: ${this.metadata.documentNumber}`, this.margin, y);
    y += 10;

    // Title
    y = this.drawTitle('TRANSFER CERTIFICATE', y, 16);
    this.drawAccentSeparator(y);
    y += 6;

    // TC fields as key-value rows
    const fields: [string, string][] = [
      ['Name of the Student', fullName],
      ["Father's / Guardian's Name", fatherName],
      ['Date of Birth', dob],
      ['Community / Caste', `${community} / ${String(data.caste || 'N/A')}`],
      ['Religion', religion],
      ['Programme of Study', programName],
      ['Register Number', String(data.register_number || 'N/A')],
      ['Date of Admission', admissionDate],
      ['Date of Leaving', leavingDate],
      ['Reason for Leaving', reason],
      ['Conduct and Character', conduct],
      ['Whether Qualified for Promotion', String(data.qualified_for_promotion || 'Yes')],
      ['Whether Fee has been Paid', String(data.fees_paid || 'Yes')],
      ['Remarks', String(data.tc_remarks || 'Nil')],
    ];

    const labelWidth = 65;
    for (const [label, value] of fields) {
      this.setTextStyle(9, 'bold', DEFAULT_COLORS.mutedText);
      this.doc.text(`${label}:`, this.margin, y);
      this.setTextStyle(9, 'normal');
      this.doc.text(value, this.margin + labelWidth, y);
      y += 6;
    }

    y += 4;
    this.drawSeparator(y);
    y += 4;

    // Certification text
    this.setTextStyle(9, 'normal', DEFAULT_COLORS.mutedText);
    this.doc.text(
      'Certified that the above information is true to the best of our knowledge and records.',
      this.margin, y, { maxWidth: this.contentWidth }
    );

    // QR code
    if (this.metadata.verificationUrl) {
      await this.drawQRCode(this.metadata.verificationUrl, this.pageWidth - this.margin - 28, this.pageHeight - 58, 22);
      this.setTextStyle(6, 'normal', DEFAULT_COLORS.mutedText);
      this.doc.text('Scan to verify', this.pageWidth - this.margin - 17, this.pageHeight - 34, { align: 'center' });
    }

    this.drawSignatureBlock(this.pageHeight - 45);
    this.drawFooter();
    return this.doc;
  }
}
