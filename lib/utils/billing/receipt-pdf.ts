/**
 * Billing Receipt PDF generator.
 *
 * Single source of truth for turning a BillingReceipt into a downloadable PDF.
 * Used by BillingReceiptService.downloadReceiptPDF, which every download
 * surface routes through (student detail Receipts tab, receipt detail page,
 * receipts list page).
 *
 * Built with jsPDF + jspdf-autotable — the same stack already used across the
 * app (e.g. lib/utils/internal-marks/internal-marks-pdf.ts). Browser-only:
 * doc.save() needs `document`, so this can't run in a server action.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BillingReceipt } from '@/types/billing-schedule';

// jsPDF's built-in fonts (helvetica/courier) are WinAnsi/CP1252 only — the
// rupee sign ₹ (U+20B9) is NOT in that range and renders as garbage (same
// gotcha documented in lib/utils/ims-receipt-pdf.ts). Format money with an
// ASCII "Rs." prefix instead of relying on Intl's ₹ glyph.
function formatINR(amount: number | null | undefined): string {
  const value = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
  return `Rs. ${value}`;
}

function formatDate(date?: string | null): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

const titleCase = (value?: string | null): string =>
  (value || '').toString().replace(/_/g, ' ').toUpperCase();

/**
 * Build (but do not save) the receipt PDF document.
 * Exported separately so callers like email/print can reuse the same layout
 * without forcing a download.
 */
export function generateReceiptPdf(receipt: BillingReceipt): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 18;

  // Refund context — a receipt can be partially/fully refunded.
  const processedRefunds = (receipt.refunds || []).filter(
    (r) => r.approval_status === 'processed'
  );
  const totalRefunded = processedRefunds.reduce(
    (sum, r) => sum + (Number(r.refund_amount) || 0),
    0
  );
  const hasRefunds = processedRefunds.length > 0;
  const netAmount = (Number(receipt.payment_amount) || 0) - totalRefunded;

  // ─── Header ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PAYMENT RECEIPT', pageWidth / 2, y, { align: 'center' });
  y += 7;

  doc.setFontSize(12);
  doc.text(receipt.institution?.name || 'Institution', pageWidth / 2, y, {
    align: 'center'
  });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Receipt No: ${receipt.receipt_number}`, pageWidth / 2, y, {
    align: 'center'
  });
  y += 8;

  // ─── Receipt / student / payer info (two-column key-value table) ────────
  const studentName =
    `${receipt.student?.first_name || ''} ${receipt.student?.last_name || ''}`.trim() ||
    'N/A';

  const infoRows: Array<[string, string]> = [
    ['Receipt Date', formatDate(receipt.receipt_date)],
    ['Payment Date', formatDate(receipt.payment_paid_date)],
    ['Payment Mode', titleCase(receipt.payment_mode)]
  ];
  if (receipt.payment_reference_number) {
    infoRows.push(['Reference No', receipt.payment_reference_number]);
  }
  infoRows.push(['Student', studentName]);
  if (receipt.student?.roll_number) {
    infoRows.push(['Roll Number', receipt.student.roll_number]);
  }
  if (receipt.student?.college_email) {
    infoRows.push(['Email', receipt.student.college_email]);
  }
  infoRows.push(['Payer Name', receipt.payer_name || 'N/A']);
  if (receipt.payer_contact) {
    infoRows.push(['Payer Contact', receipt.payer_contact]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { cellWidth: 'auto' }
    },
    body: infoRows
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Payment details table ──────────────────────────────────────────────
  const items = receipt.receipt_items || [];
  if (items.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      head: [['Description', 'Due Date', 'Bill Amount', 'Amount Paid']],
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold'
      },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      body: items.map((item) => [
        item.bill?.bill_description ||
          (item.bill as any)?.category?.category_name ||
          'N/A',
        item.bill?.due_date ? formatDate(item.bill.due_date) : 'N/A',
        item.bill?.final_amount != null ? formatINR(item.bill.final_amount) : 'N/A',
        formatINR(item.amount_paid)
      ]),
      foot: [['', '', 'Total Paid', formatINR(receipt.payment_amount)]],
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: 20,
        fontStyle: 'bold',
        halign: 'right'
      }
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Amount Paid: ${formatINR(receipt.payment_amount)}`, marginX, y);
    y += 8;
  }

  // ─── Refund details (only when something was actually refunded) ─────────
  if (hasRefunds) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      head: [['Refund Date', 'Category', 'Method', 'Amount']],
      headStyles: {
        fillColor: [220, 38, 38],
        textColor: 255,
        fontStyle: 'bold'
      },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 3: { halign: 'right' } },
      body: processedRefunds.map((r) => [
        formatDate(r.refund_date),
        titleCase(r.refund_category),
        titleCase(r.refund_method),
        formatINR(r.refund_amount)
      ]),
      foot: [
        ['', '', 'Total Refunded', `- ${formatINR(totalRefunded)}`],
        ['', '', 'Net Amount', formatINR(netAmount)]
      ],
      footStyles: { fontStyle: 'bold', halign: 'right' }
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── Remarks ────────────────────────────────────────────────────────────
  if (receipt.payment_remarks) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Remarks', marginX, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const remarkLines = doc.splitTextToSize(
      receipt.payment_remarks,
      pageWidth - marginX * 2
    );
    doc.text(remarkLines, marginX, y);
    y += remarkLines.length * 5 + 4;
  }

  // ─── Footer ─────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('This is a computer-generated receipt.', pageWidth / 2, y, {
    align: 'center'
  });
  y += 4;
  doc.text(
    `Generated on: ${new Date().toLocaleString('en-IN')}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  if (hasRefunds) {
    y += 4;
    doc.setTextColor(220, 38, 38);
    doc.text(
      'Note: This receipt has been partially or fully refunded.',
      pageWidth / 2,
      y,
      { align: 'center' }
    );
  }
  doc.setTextColor(0);

  return doc;
}

/**
 * Generate the receipt PDF and trigger a browser download.
 */
export function downloadReceiptPdf(receipt: BillingReceipt): void {
  const doc = generateReceiptPdf(receipt);
  doc.save(`receipt-${receipt.receipt_number}.pdf`);
}
