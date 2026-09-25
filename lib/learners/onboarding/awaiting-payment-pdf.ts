// jsPDF writer for the Awaiting Payment report. A4 landscape: summary tables
// first, then one section per blocked reason in pipeline order. Renders the
// same pure model as the Excel writer. Client-only (dynamic-imported).
//
// Amounts are printed as "Rs." — the built-in Helvetica has no ₹ glyph and
// renders it as a box.
import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { BLOCKED_REASONS } from '@/types/learner-onboarding';
import {
  formatReportDate,
  summariseByInstitution,
  summariseByReason,
  type AwaitingPaymentReport,
  type AwaitingPaymentReportRow
} from './awaiting-payment-report';

const HEADER_FILL: [number, number, number] = [7, 89, 133]; // sky-800
const MARGIN = 10;

const rs = (n: number | null) => (n == null ? '—' : `Rs. ${Math.round(n).toLocaleString('en-IN')}`);
const paidOf = (paid: number | null, billed: number | null) =>
  billed == null ? 'No bill' : `${rs(paid)} / ${rs(billed)}`;

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };
const nextY = (doc: jsPDF, gap = 6) => ((doc as AutoTableDoc).lastAutoTable?.finalY ?? MARGIN) + gap;

function header(doc: jsPDF, report: AwaitingPaymentReport): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('JKKN Educational Institutions', w / 2, 14, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Learner Onboarding — Awaiting Payment (Blocked At) Report', w / 2, 21, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const meta = [
    `Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}   ·   Learners: ${report.rows.length}   ·   ` +
      `Threshold to ${report.target_label}: ${report.threshold_pct ?? '—'}% ${report.threshold_basis_label}`,
    `Filters: ${report.filters.length ? report.filters.join(' · ') : 'None (all Account + Reserved learners you can see)'}`
  ];
  doc.text(meta, w / 2, 27, { align: 'center' });
  return 36;
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  const h = doc.internal.pageSize.getHeight();
  if (y > h - 30) {
    doc.addPage();
    y = MARGIN + 4;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(7, 89, 133);
  doc.text(text, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  return y + 3;
}

function detailRows(rows: AwaitingPaymentReportRow[]): RowInput[] {
  return rows.map((r, i) => [
    String(i + 1),
    `${r.name}${r.roll_number ? `\n${r.roll_number}` : ''}`,
    `${r.institution}\n${r.program}`,
    r.status,
    paidOf(r.app_paid, r.app_billed),
    paidOf(r.uni_paid, r.uni_billed),
    `${rs(r.total_paid)} / ${rs(r.total_billed)}`,
    `${r.pct_billed.toFixed(1)}%`,
    `${r.pct_due.toFixed(1)}%`,
    rs(r.need_to_admit),
    r.next_due_date ? `${formatReportDate(r.next_due_date)}\n${rs(r.next_due_amount)}` : '—',
    r.reason_detail
  ]);
}

export function buildAwaitingPaymentPdf(report: AwaitingPaymentReport): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = header(doc, report);

  // ── Summary: reason × status ─────────────────────────────────────────────
  y = sectionTitle(doc, 'Why learners are not moving (Account -> Reserved -> Admitted)', y);
  const byReason = summariseByReason(report.rows);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Blocked at', 'Account', 'Reserved', 'Total']],
    body: byReason.map((l) => [l.label, l.account, l.reserved, l.total]),
    foot: [[
      'Total',
      byReason.reduce((s, l) => s + l.account, 0),
      byReason.reduce((s, l) => s + l.reserved, 0),
      byReason.reduce((s, l) => s + l.total, 0)
    ]],
    theme: 'grid',
    tableWidth: 140,
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: HEADER_FILL },
    footStyles: { fillColor: [224, 242, 254], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } }
  });

  // ── Summary: institution ─────────────────────────────────────────────────
  y = sectionTitle(doc, 'By institution', nextY(doc, 8));
  const reasons = BLOCKED_REASONS.filter((k) => byReason.some((l) => l.reason === k));
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Institution', ...reasons.map((k) => byReason.find((l) => l.reason === k)!.label), 'Total', 'Billed', 'Paid']],
    body: summariseByInstitution(report.rows).map((l) => [
      l.institution,
      ...reasons.map((k) => l.byReason[k] || '—'),
      l.total,
      rs(l.total_billed),
      rs(l.total_paid)
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: HEADER_FILL, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 70 },
      [reasons.length + 2]: { cellWidth: 28, halign: 'right' },
      [reasons.length + 3]: { cellWidth: 28, halign: 'right' }
    }
  });

  // ── One section per reason ───────────────────────────────────────────────
  for (const line of byReason) {
    const rows = report.rows.filter((r) => r.blocked_reason === line.reason);
    doc.addPage();
    y = sectionTitle(doc, `${line.label} — ${rows.length} learner${rows.length === 1 ? '' : 's'}`, MARGIN + 4);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [[
        '#', 'Learner / Roll No', 'Institution / Program', 'Status',
        'App Fee\npaid / billed', 'Univ Fee\npaid / billed', 'Total\npaid / billed',
        '% of\nbilled', '% of\ndue', 'Need to\nAdmit', 'Next\nInstalment', 'Reason detail'
      ]],
      body: detailRows(rows),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.3, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: HEADER_FILL, halign: 'center', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        1: { cellWidth: 32 },
        2: { cellWidth: 40 },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 36, halign: 'right' },
        7: { cellWidth: 11, halign: 'center' },
        8: { cellWidth: 11, halign: 'center' },
        9: { cellWidth: 18, halign: 'right' },
        10: { cellWidth: 20, halign: 'center' },
        11: { cellWidth: 'auto' }
      }
    });
  }

  // Footer: page numbers on every page.
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text('MyJKKN · Learner Onboarding · Awaiting Payment report', MARGIN, h - 5);
    doc.text(`Page ${p} of ${pages}`, w - MARGIN, h - 5, { align: 'right' });
  }

  return doc.output('blob');
}
