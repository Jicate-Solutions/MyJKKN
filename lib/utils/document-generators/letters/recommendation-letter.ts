/**
 * Recommendation Letter Generator
 * Portrait A4, formal recommendation letter with customizable body.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class RecommendationLetterGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 20 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const programName = String(data.program_name || '');
    const degreeName = String(data.degree_name || '');
    const departmentName = String(data.department_name || '');
    const currentDate = formatDateLong(new Date().toISOString());
    const customBody = data.body_template as string | undefined;
    const recommendedFor = String(data.recommended_for || 'higher studies and career opportunities');

    let y = this.drawLetterhead();
    const dark = DEFAULT_COLORS.darkText;

    this.setTextStyle(9, 'normal', dark);
    this.doc.text(`Date: ${currentDate}`, this.pageWidth - this.margin, y, { align: 'right' });
    this.doc.text(`Ref: ${this.metadata.documentNumber}`, this.margin, y);
    y += 10;

    this.setTextStyle(14, 'bold', this.branding.primaryColor ?? DEFAULT_COLORS.primary);
    this.doc.text('LETTER OF RECOMMENDATION', this.pageWidth / 2, y, { align: 'center' });
    y += 8;

    this.setTextStyle(11, 'italic', DEFAULT_COLORS.mutedText);
    this.doc.text('To Whom It May Concern', this.pageWidth / 2, y, { align: 'center' });
    y += 10;

    this.setTextStyle(10, 'normal', dark);
    const lineH = 5.5;

    if (customBody) {
      // Use custom body template with placeholder substitution
      const resolved = customBody
        .replace(/\{\{name\}\}/gi, fullName)
        .replace(/\{\{program\}\}/gi, programName)
        .replace(/\{\{degree\}\}/gi, degreeName)
        .replace(/\{\{department\}\}/gi, departmentName);
      const lines = this.doc.splitTextToSize(resolved, this.contentWidth);
      for (const line of lines) {
        this.doc.text(line, this.margin, y);
        y += lineH;
      }
    } else {
      const programDesc = degreeName ? `${degreeName} in ${programName}` : programName;
      const defaultBody = [
        `I am writing to recommend ${fullName}, who is a student of ${programDesc}`,
        `in the Department of ${departmentName || 'our institution'}.`,
        ``,
        `During their time at our institution, ${fullName} has demonstrated`,
        `dedication, academic excellence, and a strong commitment to personal growth.`,
        ``,
        `I strongly recommend ${fullName} for ${recommendedFor}.`,
        `I am confident they will continue to excel in their future endeavours.`,
        ``,
        `Please do not hesitate to contact me for any further information.`,
      ];
      for (const line of defaultBody) {
        if (line === '') { y += 3; continue; }
        this.doc.text(line, this.margin, y, { maxWidth: this.contentWidth });
        y += lineH;
      }
    }

    y += 8;
    this.doc.text('Yours faithfully,', this.margin, y);

    this.drawSignatureBlock(this.pageHeight - 45);
    this.drawFooter();
    return this.doc;
  }
}
