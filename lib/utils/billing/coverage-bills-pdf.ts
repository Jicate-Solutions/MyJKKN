// Bill Coverage → PDF: every learner in the current filter, with each of their
// bills broken out (academic year, due date, total, paid, pending).
//
// Rendered as ONE autoTable rather than one per learner. A thousand separate
// autoTable calls is measurably slow and, more importantly, loses the repeating
// column header on page breaks — a finance document that shows amounts under no
// headings on page 2 is worse than useless. Learner boundaries are drawn with
// full-width colSpan rows instead.
//
// jsPDF's default export is the constructor only in a browser bundle; this file
// is imported from a client component, matching receipt-pdf.ts.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CoverageLearnerBillRow } from '@/types/billing-coverage';

const inr = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(n: number | null | undefined): string {
  return n == null ? '—' : inr.format(n);
}

function shortDate(d: string | null): string {
  if (!d) return '—';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Some live bills carry a NULL description with a category set, so fall back
 *  rather than printing a blank line in a financial document. */
function billLabel(r: CoverageLearnerBillRow): string {
  return r.bill_description || r.category_name || 'Untitled bill';
}

export interface CoverageBillsPdfOptions {
  rows: CoverageLearnerBillRow[];
  /** True learner count BEFORE the server-side cap; drives the truncation note. */
  learnerCount: number;
  /** Human-readable description of the filters this was exported under. */
  filterSummary?: string[];
}

interface LearnerGroup {
  learner: CoverageLearnerBillRow;
  bills: CoverageLearnerBillRow[];
}

/** The RPC returns rows already ordered by institution → roll → due date, so a
 *  single pass preserves that order without re-sorting. */
function groupByLearner(rows: CoverageLearnerBillRow[]): LearnerGroup[] {
  const groups: LearnerGroup[] = [];
  let current: LearnerGroup | null = null;

  for (const r of rows) {
    if (!current || current.learner.learner_id !== r.learner_id) {
      current = { learner: r, bills: [] };
      groups.push(current);
    }
    // bill_id is null for a learner with no bills — the LEFT JOIN placeholder.
    if (r.bill_id) current.bills.push(r);
  }
  return groups;
}

export function generateCoverageBillsPdf(opts: CoverageBillsPdfOptions): jsPDF {
  const { rows, learnerCount, filterSummary = [] } = opts;
  const groups = groupByLearner(rows);

  // Landscape: eight columns of financial data do not fit portrait without
  // wrapping amounts, which makes them hard to scan down a column.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Bill Coverage — Learner Bill Details', 40, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);

  const generated = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.text(`Generated ${generated}`, 40, 56);

  let cursor = 70;
  if (filterSummary.length) {
    doc.text(`Filters: ${filterSummary.join('  ·  ')}`, 40, cursor, {
      maxWidth: pageWidth - 80,
    });
    cursor += 14;
  }

  const shown = groups.length;
  doc.text(
    shown < learnerCount
      ? `Showing ${shown} of ${learnerCount} learners (capped for export size)`
      : `${shown} learner${shown === 1 ? '' : 's'}`,
    40,
    cursor
  );
  cursor += 6;
  doc.setTextColor(0);

  const body: any[] = [];
  let grandTotal = 0;
  let grandPaid = 0;
  let grandPending = 0;

  for (const g of groups) {
    const l = g.learner;
    const identity = [
      l.full_name,
      l.roll_number || l.register_number || null,
      l.institution_name,
      l.program_name,
      l.semester_section,
    ]
      .filter(Boolean)
      .join('  ·  ');

    body.push([
      {
        content: identity,
        colSpan: 8,
        styles: {
          fillColor: [237, 242, 247] as [number, number, number],
          textColor: [26, 32, 44] as [number, number, number],
          fontStyle: 'bold' as const,
        },
      },
    ]);

    if (!g.bills.length) {
      body.push([
        {
          content: 'No bills generated',
          colSpan: 8,
          styles: {
            textColor: [160, 60, 60] as [number, number, number],
            fontStyle: 'italic' as const,
          },
        },
      ]);
    } else {
      for (const b of g.bills) {
        body.push([
          billLabel(b),
          b.category_name ?? '—',
          b.bill_academic_year ?? '—',
          shortDate(b.due_date),
          b.bill_status ?? '—',
          money(b.total_amount),
          money(b.paid_amount),
          money(b.pending_amount),
        ]);
      }
    }

    // Per-learner subtotal comes from the RPC's own aggregate, not a re-sum of
    // the printed rows, so it stays correct even if the bill list is ever capped.
    body.push([
      {
        content: 'Learner total',
        colSpan: 5,
        styles: { fontStyle: 'bold' as const, halign: 'right' as const },
      },
      { content: money(l.learner_total), styles: { fontStyle: 'bold' as const } },
      { content: money(l.learner_paid), styles: { fontStyle: 'bold' as const } },
      { content: money(l.learner_pending), styles: { fontStyle: 'bold' as const } },
    ]);

    grandTotal += l.learner_total;
    grandPaid += l.learner_paid;
    grandPending += l.learner_pending;
  }

  if (groups.length) {
    body.push([
      {
        content: `Grand total (${groups.length} learners)`,
        colSpan: 5,
        styles: {
          fontStyle: 'bold' as const,
          halign: 'right' as const,
          fillColor: [26, 32, 44] as [number, number, number],
          textColor: [255, 255, 255] as [number, number, number],
        },
      },
      ...[grandTotal, grandPaid, grandPending].map((v) => ({
        content: money(v),
        styles: {
          fontStyle: 'bold' as const,
          fillColor: [26, 32, 44] as [number, number, number],
          textColor: [255, 255, 255] as [number, number, number],
        },
      })),
    ]);
  }

  autoTable(doc, {
    startY: cursor + 10,
    head: [
      [
        'Bill',
        'Category',
        'Academic Year',
        'Due Date',
        'Status',
        'Total',
        'Paid',
        'Pending',
      ],
    ],
    body: body.length
      ? body
      : [[{ content: 'No learners match these filters.', colSpan: 8 }]],
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [45, 55, 72], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 150 },
      1: { cellWidth: 95 },
      2: { cellWidth: 70 },
      3: { cellWidth: 70 },
      4: { cellWidth: 55 },
      5: { cellWidth: 70, halign: 'right' },
      6: { cellWidth: 70, halign: 'right' },
      7: { cellWidth: 70, halign: 'right' },
    },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Page ${page}`,
        pageWidth - 40,
        doc.internal.pageSize.getHeight() - 20,
        { align: 'right' }
      );
      doc.setTextColor(0);
    },
  });

  return doc;
}

export function downloadCoverageBillsPdf(opts: CoverageBillsPdfOptions): void {
  const doc = generateCoverageBillsPdf(opts);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`bill-coverage-details-${stamp}.pdf`);
}
