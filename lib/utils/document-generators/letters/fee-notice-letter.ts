/**
 * Fee Notice Letter Generator
 * Portrait A4, letterhead, outstanding fee table using autotable.
 */

import type jsPDF from 'jspdf';
import type { DocumentBranding, DocumentMetadata } from '@/types/documents';
import { BaseDocumentGenerator } from '../base-document-generator';
import { DEFAULT_COLORS, formatDateIndian, formatDateLong, getFullName } from '../brand-utils';

export class FeeNoticeLetterGenerator extends BaseDocumentGenerator {
  constructor(branding: DocumentBranding, metadata: DocumentMetadata) {
    super(branding, metadata, { orientation: 'portrait', pageSize: 'a4', margin: 20 });
  }

  async generate(data: Record<string, unknown>): Promise<jsPDF> {
    const fullName = getFullName(data.first_name as string, data.last_name as string);
    const rollNumber = String(data.roll_number || '');
    const programName = String(data.program_name || '');
    const currentDate = formatDateLong(new Date().toISOString());
    const bills = (data.bills as Array<{ description: string; amount: number; due_date: string; status: string; balance: number }>) || [];
    const totalOutstanding = data.totalOutstanding != null ? Number(data.totalOutstanding) : bills.reduce((s, b) => s + (b.balance || 0), 0);

    let y = this.drawLetterhead();
    const dark = DEFAULT_COLORS.darkText;
    const muted = DEFAULT_COLORS.mutedText;
    const primary = this.branding.primaryColor ?? DEFAULT_COLORS.primary;

    this.setTextStyle(9, 'normal', dark);
    this.doc.text(`Date: ${currentDate}`, this.pageWidth - this.margin, y, { align: 'right' });
    this.doc.text(`Ref: ${this.metadata.documentNumber}`, this.margin, y);
    y += 10;

    // Title
    this.setTextStyle(14, 'bold', primary);
    this.doc.text('FEE NOTICE', this.pageWidth / 2, y, { align: 'center' });
    y += 8;

    // Student info
    this.setTextStyle(10, 'normal', dark);
    this.doc.text(`Dear ${fullName},`, this.margin, y); y += 6;

    const intro = [
      `This is to notify you that the following fees are outstanding for your account`,
      rollNumber ? `(Roll No: ${rollNumber}, ${programName}).` : `(${programName}).`,
      ``,
      `Please arrange payment at the earliest to avoid any inconvenience.`,
    ];
    for (const line of intro) {
      if (line === '') { y += 3; continue; }
      this.doc.text(line, this.margin, y, { maxWidth: this.contentWidth });
      y += 5.5;
    }
    y += 4;

    // Fee table using autotable
    if (bills.length > 0) {
      const tableBody = bills.map((b, i) => [
        String(i + 1),
        b.description || 'Fee',
        `Rs. ${Number(b.amount).toLocaleString('en-IN')}`,
        formatDateIndian(b.due_date),
        b.status?.toUpperCase() || 'UNPAID',
        `Rs. ${Number(b.balance).toLocaleString('en-IN')}`,
      ]);

      this.doc.autoTable({
        startY: y,
        margin: { left: this.margin, right: this.margin },
        head: [['#', 'Description', 'Amount', 'Due Date', 'Status', 'Balance']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [primary.r, primary.g, primary.b],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
        },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 248, 240] },
        foot: [['', '', '', '', 'TOTAL', `Rs. ${totalOutstanding.toLocaleString('en-IN')}`]],
        footStyles: {
          fillColor: [primary.r, primary.g, primary.b],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
        },
      });

      y = this.doc.lastAutoTable.finalY + 8;
    } else {
      this.setTextStyle(10, 'normal', muted);
      this.doc.text('No outstanding bills found.', this.margin, y);
      y += 8;
    }

    // Payment note
    this.setTextStyle(9, 'normal', muted);
    this.doc.text('Please contact the accounts department for payment methods and queries.', this.margin, y);
    y += 6;
    this.doc.text('Ignore this notice if payment has already been made.', this.margin, y);

    this.drawSignatureBlock(this.pageHeight - 45);
    this.drawFooter();
    return this.doc;
  }
}
