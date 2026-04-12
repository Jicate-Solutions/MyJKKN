/**
 * Achievement Certificate Generator
 * Landscape A4, recognizes specific achievements or merits.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class AchievementCertificateGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'landscape', pageSize: 'a4' });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const achievementTitle = String(data.achievement_title || data.additional_title || 'Outstanding Achievement');
    const achievementDescription = String(data.achievement_description || '');
    const eventName = String(data.event_name || '');
    const achievementDate = formatDateLong(data.achievement_date as string);

    this.drawBackground();
    this.drawBorder();
    this.drawCornerAccents();
    this.drawWatermark();
    let y = this.drawInstitutionHeader(12);
    this.drawAccentSeparator(y);
    y += 6;

    y = this.drawTitle('CERTIFICATE OF ACHIEVEMENT', y, 22);
    y += 2;

    const dark = DEFAULT_COLORS.darkText;
    this.setTextStyle(11, 'normal', dark);
    this.doc.text('This certificate is proudly presented to', this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;
    this.setTextStyle(20, 'bold', primary);
    this.doc.text(fullName, this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    this.setTextStyle(12, 'normal', dark);
    this.doc.text(`in recognition of: ${achievementTitle}`, this.pageWidth / 2, y, { align: 'center', maxWidth: this.contentWidth - 40 });
    y += 8;

    if (achievementDescription) {
      this.setTextStyle(10, 'normal', DEFAULT_COLORS.mutedText);
      this.doc.text(achievementDescription, this.pageWidth / 2, y, { align: 'center', maxWidth: this.contentWidth - 60 });
      y += 8;
    }

    if (eventName) {
      this.setTextStyle(10, 'normal', dark);
      this.doc.text(`Event: ${eventName}`, this.pageWidth / 2, y, { align: 'center' });
      y += 6;
    }

    if (achievementDate !== 'N/A') {
      this.setTextStyle(9, 'normal', DEFAULT_COLORS.mutedText);
      this.doc.text(`Date: ${achievementDate}`, this.pageWidth / 2, y, { align: 'center' });
    }

    this.drawSignatureBlock(this.pageHeight - 38);
    this.drawFooter();
    return this.doc;
  }
}
