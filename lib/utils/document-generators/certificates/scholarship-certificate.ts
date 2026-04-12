/**
 * Scholarship Certificate Generator
 * Landscape A4, branded borders, QR verification.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, getFullName } from '../brand-utils';

export class ScholarshipCertificateGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'landscape', pageSize: 'a4' });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const scholarshipName = String(data.scholarship_name || data.additional_title || 'Merit Scholarship');
    const amount = data.scholarship_amount ? `Rs. ${Number(data.scholarship_amount).toLocaleString('en-IN')}` : '';
    const academicYear = String(data.academic_year_name || '');
    const programName = String(data.program_name || '');

    this.drawBackground();
    this.drawBorder();
    this.drawCornerAccents();
    this.drawWatermark();
    let y = this.drawInstitutionHeader(12);

    this.drawAccentSeparator(y);
    y += 6;

    // Title
    y = this.drawTitle('SCHOLARSHIP CERTIFICATE', y, 22);
    y += 4;

    // Body
    const dark = DEFAULT_COLORS.darkText;
    this.setTextStyle(11, 'normal', dark);
    this.doc.text('This is to certify that', this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Name
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.doc.setFontSize(20);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(primary.r, primary.g, primary.b);
    this.doc.text(fullName, this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    this.setTextStyle(11, 'normal', dark);
    const desc = [`has been awarded the ${scholarshipName}`];
    if (amount) desc.push(`of ${amount}`);
    if (programName) desc.push(`for excellence in ${programName}`);
    if (academicYear) desc.push(`during the academic year ${academicYear}`);
    this.doc.text(desc.join(' '), this.pageWidth / 2, y, { align: 'center', maxWidth: this.contentWidth - 40 });
    y += 14;

    if (data.register_number) {
      const muted = DEFAULT_COLORS.mutedText;
      this.setTextStyle(9, 'normal', muted);
      this.doc.text(`Register No: ${data.register_number}`, this.pageWidth / 2, y, { align: 'center' });
    }

    if (this.metadata.verificationUrl) {
      await this.drawQRCode(this.metadata.verificationUrl, this.pageWidth - 47, this.pageHeight - 47, 28);
    }

    this.drawSignatureBlock(this.pageHeight - 38);
    this.drawFooter();
    return this.doc;
  }
}
