/**
 * General Letter Generator
 * Portrait A4, fully customizable body_template with {{placeholder}} substitution.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateLong, getFullName } from '../brand-utils';

export class GeneralLetterGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 20 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const currentDate = formatDateLong(new Date().toISOString());
    const subject = String(data.letter_subject || data.additional_title || '');
    const bodyTemplate = String(data.body_template || '');

    let y = this.drawLetterhead();
    const dark = DEFAULT_COLORS.darkText;

    // Date and ref
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
      this.setTextStyle(9, 'normal', DEFAULT_COLORS.mutedText);
      this.doc.text(String(data.permanent_address_street), this.margin, y); y += 4;
    }
    y += 6;

    // Subject
    if (subject) {
      this.setTextStyle(10, 'bold', dark);
      this.doc.text(`Subject: ${subject}`, this.margin, y);
      y += 8;
    }

    // Salutation
    this.setTextStyle(10, 'normal', dark);
    this.doc.text(`Dear ${fullName},`, this.margin, y);
    y += 8;

    // Body with placeholder substitution
    if (bodyTemplate) {
      const resolved = bodyTemplate
        .replace(/\{\{name\}\}/gi, fullName)
        .replace(/\{\{roll_number\}\}/gi, String(data.roll_number || ''))
        .replace(/\{\{register_number\}\}/gi, String(data.register_number || ''))
        .replace(/\{\{program\}\}/gi, String(data.program_name || ''))
        .replace(/\{\{degree\}\}/gi, String(data.degree_name || ''))
        .replace(/\{\{department\}\}/gi, String(data.department_name || ''))
        .replace(/\{\{semester\}\}/gi, String(data.semester_name || ''))
        .replace(/\{\{section\}\}/gi, String(data.section_name || ''))
        .replace(/\{\{academic_year\}\}/gi, String(data.academic_year_name || ''))
        .replace(/\{\{father_name\}\}/gi, String(data.father_name || ''))
        .replace(/\{\{date\}\}/gi, currentDate);

      const lines = this.doc.splitTextToSize(resolved, this.contentWidth);
      for (const line of lines) {
        this.addNewPageIfNeeded(8);
        this.doc.text(line, this.margin, this.yPosition);
        this.yPosition += 5.5;
      }
    } else {
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'italic');
      const mt = DEFAULT_COLORS.mutedText;
      this.doc.setTextColor(mt.r, mt.g, mt.b);
      this.doc.text('[No body template configured. Please set body_template in template settings.]', this.margin, y);
    }

    this.drawSignatureBlock(this.pageHeight - 45);
    this.drawFooter();
    return this.doc;
  }
}
