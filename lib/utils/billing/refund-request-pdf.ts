/**
 * Refund Request PDF generator.
 *
 * Turns a RefundRequest (with its bills + approval trail) into a downloadable
 * PDF — used by the refund request detail page's "Export PDF" button.
 *
 * Built with jsPDF + jspdf-autotable, mirroring lib/utils/billing/receipt-pdf.ts.
 * Browser-only: doc.save() needs `document`, so this can't run in a server action.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RefundRequest } from '@/types/billing-refund-workflow';

// jsPDF's built-in fonts (helvetica/courier) are WinAnsi/CP1252 only — the
// rupee sign ₹ (U+20B9) is NOT in that range and renders as garbage (same
// gotcha documented in receipt-pdf.ts / ims-receipt-pdf.ts). Format money
// with an ASCII "Rs." prefix instead of relying on Intl's ₹ glyph.
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
 * Build (but do not save) the refund request PDF document.
 * Exported separately so callers can reuse the same layout without forcing
 * a download.
 */
export function buildRefundRequestPdf(request: RefundRequest): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const marginTop = 18;
  let y = marginTop;

  // Advance past a page break when the next block won't fit.
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage();
      y = marginTop;
    }
  };

  // ─── 1. Title: request number + status ──────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('REFUND REQUEST', pageWidth / 2, y, { align: 'center' });
  y += 7;

  doc.setFontSize(12);
  doc.text(request.request_number, pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Status: ${titleCase(request.status)}`, pageWidth / 2, y, {
    align: 'center'
  });
  y += 9;

  // ─── 2. Learner block ────────────────────────────────────────────────────
  const studentName =
    `${request.student?.first_name || ''} ${request.student?.last_name || ''}`.trim() ||
    'N/A';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Learner', marginX, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { cellWidth: 'auto' }
    },
    body: [
      ['Name', studentName],
      ['Roll Number', request.student?.roll_number || 'N/A']
    ]
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── 3. Request block ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Request Details', marginX, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { cellWidth: 'auto' }
    },
    body: [
      ['Refund Type', titleCase(request.refund_type)],
      ['Initiated At', formatDate(request.initiated_at)],
      ['Total Refund', formatINR(request.total_refund_amount)]
    ]
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── 4. Bills table ──────────────────────────────────────────────────────
  const bills = request.bills || [];
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    head: [['Description', 'Paid', 'Refund Amount']],
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold'
    },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    body: bills.map((b) => [
      b.bill?.bill_description || 'Bill',
      formatINR(b.paid_amount_snapshot),
      formatINR(b.refund_amount)
    ]),
    foot: [['Total', '', formatINR(request.total_refund_amount)]],
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: 20,
      fontStyle: 'bold',
      halign: 'right'
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ─── 5. Approval trail ───────────────────────────────────────────────────
  const actions = [...(request.actions || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  ensureSpace(12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Approval Trail', marginX, y);
  y += 6;

  if (actions.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('No actions recorded.', marginX, y);
    y += 6;
  }

  for (const action of actions) {
    ensureSpace(12);

    const actorName = action.actor?.full_name || 'Unknown';
    const roleSuffix = action.actor_role_name ? ` (${action.actor_role_name})` : '';
    const header = `[${action.stage_name}] ${titleCase(action.action_type)} by ${actorName}${roleSuffix} at ${formatDate(action.created_at)}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const headerLines = doc.splitTextToSize(header, pageWidth - marginX * 2);
    ensureSpace(headerLines.length * 4.5);
    doc.text(headerLines, marginX, y);
    y += headerLines.length * 4.5 + 1;

    if (action.notes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(action.notes, pageWidth - marginX * 2 - 4);
      ensureSpace(noteLines.length * 4.5);
      doc.text(noteLines, marginX + 4, y);
      y += noteLines.length * 4.5 + 1;
    }

    if (action.attachments && action.attachments.length > 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      for (const att of action.attachments) {
        ensureSpace(4.5);
        const line = `- ${att.name}: ${att.drive_url}`;
        const lines = doc.splitTextToSize(line, pageWidth - marginX * 2 - 4);
        doc.text(lines, marginX + 4, y);
        y += lines.length * 4 + 0.5;
      }
    }

    y += 3;
  }

  // ─── 6. Disbursement block (only when disbursed) ────────────────────────
  if (request.status === 'disbursed') {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Disbursement', marginX, y);
    y += 5;

    const details = request.payment_details || {};
    const rows: Array<[string, string]> = [
      ['Payment Mode', titleCase(request.payment_mode)]
    ];
    Object.entries(details).forEach(([k, v]) => {
      rows.push([k.replace(/_/g, ' '), String(v)]);
    });
    rows.push(['Disbursed At', formatDate(request.disbursed_at)]);

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 45 },
        1: { cellWidth: 'auto' }
      },
      body: rows
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── 7. Decline block (only when declined) ──────────────────────────────
  if (request.status === 'declined') {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Decline', marginX, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 45 },
        1: { cellWidth: 'auto' }
      },
      body: [
        ['Declined Stage', request.declined_stage_name || 'N/A'],
        ['Reason', request.decline_reason || 'N/A']
      ]
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  return doc;
}

/**
 * Generate the refund request PDF and trigger a browser download.
 */
export function generateRefundRequestPdf(request: RefundRequest): void {
  const doc = buildRefundRequestPdf(request);
  doc.save(`${request.request_number}.pdf`);
}
