/**
 * Training Certificate Generator
 * Landscape A4, for training programs and workshops, QR verification.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class TrainingCertificateGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'landscape', pageSize: 'a4' });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const trainingName = String(data.training_name || data.additional_title || 'Training Program');
    const duration = String(data.training_duration || '');
    const startDate = formatDateLong(data.training_start_date as string);
    const endDate = formatDateLong(data.training_end_date as string);
    const skills = data.skills_covered as string[] | undefined;

    this.drawBackground();
    this.drawBorder();
    this.drawCornerAccents();
    this.drawWatermark();
    let y = this.drawInstitutionHeader(12);
    this.drawAccentSeparator(y);
    y += 6;

    y = this.drawTitle('TRAINING CERTIFICATE', y, 22);
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
    this.doc.text(`has successfully completed the training on`, this.pageWidth / 2, y, { align: 'center' });
    y += 7;

    this.setTextStyle(14, 'bold', primary);
    this.doc.text(trainingName, this.pageWidth / 2, y, { align: 'center', maxWidth: this.contentWidth - 40 });
    y += 8;

    const muted = DEFAULT_COLORS.mutedText;
    this.setTextStyle(9, 'normal', muted);
    const details: string[] = [];
    if (duration) details.push(`Duration: ${duration}`);
    if (startDate !== 'N/A' && endDate !== 'N/A') details.push(`Period: ${startDate} to ${endDate}`);
    if (details.length > 0) {
      this.doc.text(details.join('  |  '), this.pageWidth / 2, y, { align: 'center' });
      y += 6;
    }

    if (skills && skills.length > 0) {
      this.setTextStyle(9, 'normal', dark);
      this.doc.text(`Skills Covered: ${skills.join(', ')}`, this.pageWidth / 2, y, { align: 'center', maxWidth: this.contentWidth - 40 });
    }

    if (this.metadata.verificationUrl) {
      await this.drawQRCode(this.metadata.verificationUrl, this.pageWidth - 47, this.pageHeight - 47, 28);
    }

    this.drawSignatureBlock(this.pageHeight - 38);
    this.drawFooter();
    return this.doc;
  }
}
