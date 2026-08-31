/**
 * Course payment receipt PDF.
 *
 * Mirrors lib/utils/billing/receipt-pdf.ts in stack and layout, but takes a
 * course shape rather than a BillingReceipt: a course participant has an
 * enrolment and an instalment, not a learner bill and a fee head, and forcing
 * one into the other's type would mean a receipt full of empty fields.
 *
 * BROWSER ONLY. doc.save() needs `document`, so this cannot run in a server
 * action or a route handler.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CourseReceiptData {
  receiptNumber: string;
  paidOn: string | null;
  amountPaid: number;
  paymentMode: string;
  razorpayPaymentId: string | null;

  participantName: string;
  jkknId: string | null;

  courseTitle: string;
  institutionName: string | null;
  enrollmentNumber: string | null;

  billNumber: string;
  instalmentLabel: string;
  instalmentDueDate: string | null;
  billTotal: number;

  /** Enrolment totals AFTER this payment, so the reader can see where they are. */
  totalPayable: number;
  totalPaid: number;
  balance: number;
}

/**
 * jsPDF's built-in fonts are WinAnsi/CP1252 only — the rupee sign (U+20B9) is
 * NOT in that range and renders as garbage. Same gotcha the billing and IMS
 * receipt generators document. Use an ASCII "Rs." prefix.
 */
function formatINR(amount: number | null | undefined): string {
  const value = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
  return `Rs. ${value}`;
}

function formatDate(date?: string | null): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Build (but do not save) the receipt, so a future print/email surface can
 *  reuse the identical layout rather than reimplementing it. */
export function generateCourseReceiptPdf(r: CourseReceiptData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('JKKN INSTITUTIONS', pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  if (r.institutionName) {
    doc.text(r.institutionName, pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('COURSE FEE RECEIPT', pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 6;

  // Column 1 is fixed and column 2 is 'auto'. Assigning BOTH a width leaves
  // unassignable residue and autoTable throws "could not fit page" — the
  // failure documented for this stack elsewhere in the repo.
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { cellWidth: 'auto' } },
    body: [
      ['Receipt No.', r.receiptNumber],
      ['Date', formatDate(r.paidOn)],
      ['Participant', r.participantName],
      ['JKKN ID', r.jkknId ?? 'N/A'],
      ['Course', r.courseTitle],
      ['Enrolment No.', r.enrollmentNumber ?? 'N/A'],
    ],
    margin: { left: marginX, right: marginX },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    head: [['Instalment', 'Due date', 'Amount']],
    body: [
      [
        `${r.instalmentLabel}\n${r.billNumber}`,
        formatDate(r.instalmentDueDate),
        formatINR(r.amountPaid),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [24, 24, 27], fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 2.4 },
    columnStyles: { 2: { halign: 'right' } },
    margin: { left: marginX, right: marginX },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { cellWidth: 'auto', halign: 'right' } },
    body: [
      ['Amount paid', formatINR(r.amountPaid)],
      ['Payment mode', r.paymentMode === 'razorpay' ? 'Online (Razorpay)' : r.paymentMode],
      ...(r.razorpayPaymentId ? [['Reference', r.razorpayPaymentId]] : []),
      ['Course total', formatINR(r.totalPayable)],
      ['Paid to date', formatINR(r.totalPaid)],
      ['Balance', formatINR(r.balance)],
    ],
    margin: { left: marginX, right: marginX },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    'This is a computer-generated receipt and does not require a signature.',
    pageWidth / 2,
    y,
    { align: 'center' },
  );

  return doc;
}

/** Filesystem-safe stem so the download lands with a recognisable name. */
const safeStem = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'receipt';

export function downloadCourseReceiptPdf(r: CourseReceiptData): void {
  generateCourseReceiptPdf(r).save(`${safeStem(r.receiptNumber)}.pdf`);
}
