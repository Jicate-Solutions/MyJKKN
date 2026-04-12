/**
 * Completion Certificate Generator
 * Landscape A4, double border, JKKN branding, QR verification.
 * Closely follows the existing certificate-pdf.ts pattern.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class CompletionCertificateGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, {
      orientation: 'landscape',
      pageSize: 'a4',
      margin: 14,
    });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const programName = String(data.program_name || data.course_name || 'the program');
    const completionDate = formatDateLong(data.completion_date as string || data.generated_at as string);
    const degreeName = String(data.degree_name || '');
    const departmentName = String(data.department_name || '');

    // Background
    this.drawBackground();

    // Double border
    this.drawBorder();

    // Corner accents
    this.drawCornerAccents();

    // Watermark
    this.drawWatermark();

    // Institution header (centered)
    let y = this.drawInstitutionHeader(12);

    // Yellow accent separator
    this.drawAccentSeparator(y);
    y += 6;

    // Certificate title
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.doc.setFontSize(24);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(primary.r, primary.g, primary.b);
    this.doc.text('CERTIFICATE OF COMPLETION', this.pageWidth / 2, y, { align: 'center' });
    y += 12;

    // "This is to certify that" line
    const dark = DEFAULT_COLORS.darkText;
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(dark.r, dark.g, dark.b);
    this.doc.text('This is to certify that', this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Learner name (large, underlined)
    this.doc.setFontSize(20);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(primary.r, primary.g, primary.b);
    this.doc.text(fullName, this.pageWidth / 2, y, { align: 'center' });
    // Underline
    const nameWidth = this.doc.getTextWidth(fullName);
    const underlineY = y + 1.5;
    const secondary = this.branding.secondaryColor ?? DEFAULT_COLORS.secondary;
    this.doc.setDrawColor(secondary.r, secondary.g, secondary.b);
    this.doc.setLineWidth(0.8);
    this.doc.line(
      this.pageWidth / 2 - nameWidth / 2,
      underlineY,
      this.pageWidth / 2 + nameWidth / 2,
      underlineY
    );
    y += 10;

    // Program description
    this.doc.setFontSize(11);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(dark.r, dark.g, dark.b);

    const lines: string[] = [];
    if (degreeName && departmentName) {
      lines.push(`has successfully completed the requirements for`);
      lines.push(`${degreeName} in ${departmentName}`);
    } else {
      lines.push(`has successfully completed`);
    }
    lines.push(`${programName}`);

    for (const line of lines) {
      this.doc.text(line, this.pageWidth / 2, y, { align: 'center' });
      y += 6;
    }

    // Completion date
    y += 2;
    const muted = DEFAULT_COLORS.mutedText;
    this.doc.setFontSize(10);
    this.doc.setTextColor(muted.r, muted.g, muted.b);
    this.doc.text(`Date of Completion: ${completionDate}`, this.pageWidth / 2, y, { align: 'center' });
    y += 4;

    // Registration number (if available)
    if (data.register_number) {
      this.doc.setFontSize(9);
      this.doc.text(`Register No: ${data.register_number}`, this.pageWidth / 2, y, { align: 'center' });
    }

    // QR Code (bottom-right)
    if (this.metadata.verificationUrl) {
      await this.drawQRCode(
        this.metadata.verificationUrl,
        this.pageWidth - 47,
        this.pageHeight - 47,
        28
      );
      // Label under QR
      this.doc.setFontSize(6);
      this.doc.setTextColor(muted.r, muted.g, muted.b);
      this.doc.text('Scan to verify', this.pageWidth - 33, this.pageHeight - 17, { align: 'center' });
    }

    // Signature block
    this.drawSignatureBlock(this.pageHeight - 38);

    // Footer
    this.drawFooter();

    // Document number (bottom-left)
    this.doc.setFontSize(7);
    this.doc.setTextColor(muted.r, muted.g, muted.b);
    this.doc.text(`Certificate No: ${this.metadata.documentNumber}`, this.margin + 5, this.pageHeight - 17);

    return this.doc;
  }
}
