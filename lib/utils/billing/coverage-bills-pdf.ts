// Bill Coverage → PDF: a statistics summary, a category-wise breakdown, then
// every learner in the current filter with each of their bills.
//
// LAYOUT NOTES
//  - Column widths are FRACTIONS of the usable page width, not fixed points.
//    The previous fixed widths summed to 650pt on a 762pt page, wasting 15% of
//    every row and cramping the bill description while amounts had space spare.
//  - Card and cell text is shrunk to fit rather than allowed to overflow: a
//    clipped amount in a finance document is a wrong amount.
//  - ONE autoTable for the detail, not one per learner. A thousand tables is
//    slow and loses the repeating column header across page breaks — amounts
//    printed under no headings on page 2 are worse than no report. Learner
//    boundaries are full-width colSpan rows carrying that learner's subtotal,
//    which also saves a row per learner over a separate subtotal line.
//  - ONE BOX PER LEARNER holding every bill they have. Grouping is keyed by
//    learner_id and the groups are sorted here, never inherited from the row
//    order — see groupByLearner. Relying on the RPC's order split learners who
//    tie on roll number into one box per billing category.
//
// WHY THE STATS ARE COMPUTED FROM THE RETURNED ROWS, NOT A SECOND QUERY
//    The RPC caps at 1,000 learners. A server-side aggregate would describe the
//    whole filtered population while the detail below lists only the capped
//    subset — a summary contradicting its own detail. Deriving both from one
//    dataset makes them agree by construction; the cap is stated separately and
//    prominently instead.
//
// jsPDF's default export is the constructor only in a browser bundle; this file
// is imported from a client component, matching receipt-pdf.ts.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CoverageLearnerBillRow } from '@/types/billing-coverage';

type RGB = [number, number, number];

const INK: RGB = [26, 32, 44];
const SLATE: RGB = [45, 55, 72];
const MUTED: RGB = [113, 128, 150];
const CARD_BG: RGB = [247, 250, 252];
const CARD_LINE: RGB = [226, 232, 240];
const BAND: RGB = [237, 242, 247];
const GREEN: RGB = [21, 128, 61];
const RED: RGB = [185, 28, 28];
const AMBER: RGB = [180, 83, 9];

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

function pct(part: number, whole: number): string {
  // A negative denominator (a net-credit population) would render a misleading
  // negative "collected %" rather than an obviously-absent one.
  if (!whole || whole < 0) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** Bills with no category still have to land somewhere. The KPI count and the
 *  category table MUST bucket them identically, or the page contradicts itself:
 *  one live bill currently has a null category. */
const UNCATEGORISED = 'Uncategorised';

/** Some live bills carry a NULL description with a category set, so fall back
 *  rather than printing a blank line in a financial document. */
function billLabel(r: CoverageLearnerBillRow): string {
  return r.bill_description || r.category_name || 'Untitled bill';
}

/** Shrink to fit instead of overflowing — a clipped amount reads as a wrong one. */
function fitText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize = 6
): number {
  let size = startSize;
  doc.setFontSize(size);
  while (doc.getTextWidth(text) > maxWidth && size > minSize) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

export interface CoverageBillsPdfOptions {
  rows: CoverageLearnerBillRow[];
  /** True learner count BEFORE the server-side cap; drives the truncation note. */
  learnerCount: number;
  filterSummary?: string[];
}

interface LearnerGroup {
  learner: CoverageLearnerBillRow;
  bills: CoverageLearnerBillRow[];
}

interface CategoryStat {
  category: string;
  bills: number;
  learners: number;
  total: number;
  paid: number;
  pending: number;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Sorts NULL last, matching the RPC's `NULLS LAST` so the two agree. */
function cmpNullsLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return collator.compare(a, b);
}

/**
 * Keyed by learner_id — NOT "did the id differ from the previous row".
 *
 * The RPC orders by institution → roll number → due date → bill description
 * with NO learner key in the sort. Learner identity is only IMPLIED by the roll
 * number, so the moment two learners tie on it their bills interleave and the
 * trailing `bill_description` key clusters the whole institution by bill name.
 * A previous-row comparison then opened a fresh box per run of rows, printing
 * the same learner once per billing category — the exact opposite of the
 * one-box-per-learner this document exists to give. Both tie sources are live:
 * 1,120 learners carry a NULL roll number, and 457 more share one inside their
 * institution.
 *
 * Order is imposed here rather than inherited, so the document reads the same
 * whatever order the rows arrive in. Institution leads because the detail table
 * bands each institution once and that banding assumes its learners are
 * consecutive.
 */
function groupByLearner(rows: CoverageLearnerBillRow[]): LearnerGroup[] {
  const byLearner = new Map<string, LearnerGroup>();

  for (const r of rows) {
    let g = byLearner.get(r.learner_id);
    if (!g) {
      g = { learner: r, bills: [] };
      byLearner.set(r.learner_id, g);
    }
    // bill_id is null for a learner with no bills — the LEFT JOIN placeholder.
    if (r.bill_id) g.bills.push(r);
  }

  const groups = Array.from(byLearner.values());

  groups.sort((x, y) => {
    const a = x.learner;
    const b = y.learner;
    return (
      cmpNullsLast(a.institution_name, b.institution_name) ||
      cmpNullsLast(a.roll_number, b.roll_number) ||
      collator.compare(a.full_name || '', b.full_name || '') ||
      // Two namesakes with no roll number still have to land in a fixed order,
      // or the same filter exports in a different order each run.
      a.learner_id.localeCompare(b.learner_id)
    );
  });

  for (const g of groups) {
    g.bills.sort(
      (a, b) =>
        // ISO dates sort lexically; the sentinel keeps undated bills last.
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
        collator.compare(billLabel(a), billLabel(b))
    );
  }

  return groups;
}

/**
 * Money is summed over BILL rows, never over learner_total: learner_total is
 * repeated on every row of that learner, so summing the flat list would
 * multiply it by their bill count.
 */
function computeStats(groups: LearnerGroup[]) {
  let bills = 0;
  let total = 0;
  let paid = 0;
  let pending = 0;
  const categories = new Set<string>();

  for (const g of groups) {
    for (const b of g.bills) {
      bills += 1;
      total += b.total_amount ?? 0;
      paid += b.paid_amount ?? 0;
      pending += b.pending_amount ?? 0;
      categories.add(b.category_name || UNCATEGORISED);
    }
  }

  const withBills = groups.filter((g) => g.bills.length > 0).length;
  return {
    learners: groups.length,
    withBills,
    withoutBills: groups.length - withBills,
    categories: categories.size,
    bills,
    total,
    paid,
    pending,
  };
}

function computeCategoryStats(groups: LearnerGroup[]): CategoryStat[] {
  const map = new Map<string, CategoryStat & { learnerIds: Set<string> }>();

  for (const g of groups) {
    for (const b of g.bills) {
      const key = b.category_name || UNCATEGORISED;
      let e = map.get(key);
      if (!e) {
        e = {
          category: key,
          bills: 0,
          learners: 0,
          total: 0,
          paid: 0,
          pending: 0,
          learnerIds: new Set<string>(),
        };
        map.set(key, e);
      }
      e.bills += 1;
      e.total += b.total_amount ?? 0;
      e.paid += b.paid_amount ?? 0;
      e.pending += b.pending_amount ?? 0;
      e.learnerIds.add(b.learner_id);
    }
  }

  return Array.from(map.values())
    .map(({ learnerIds, ...rest }) => ({ ...rest, learners: learnerIds.size }))
    // Largest exposure first — that is what a reader is looking for.
    .sort((a, b) => b.total - a.total);
}

function drawTitleBand(
  doc: jsPDF,
  stats: ReturnType<typeof computeStats>,
  learnerCount: number,
  filterSummary: string[]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...SLATE);
  doc.rect(0, 0, pageWidth, 54, 'F');

  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Bill Coverage — Learner Bill Details', 40, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const generated = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.text(`Generated ${generated}`, 40, 42);

  const countLabel =
    stats.learners < learnerCount
      ? `${stats.learners} of ${learnerCount} learners`
      : `${stats.learners} learner${stats.learners === 1 ? '' : 's'}`;
  doc.setFont('helvetica', 'bold');
  doc.text(countLabel, pageWidth - 40, 42, { align: 'right' });

  doc.setTextColor(...INK);
  let y = 72;

  if (filterSummary.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FILTERS', 40, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(
      filterSummary.join('   ·   '),
      pageWidth - 80 - 52
    );
    doc.text(lines, 92, y);
    y += Math.max(lines.length * 10, 10) + 6;
    doc.setTextColor(...INK);
  }

  // The cap makes the document incomplete; say so where it cannot be missed
  // rather than only in a toast the reader never saw.
  if (stats.learners < learnerCount) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.roundedRect(40, y, pageWidth - 80, 20, 3, 3, 'FD');
    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      `Partial export — the first ${stats.learners} of ${learnerCount} matching learners. ` +
        `Every figure below describes these ${stats.learners} only. Narrow the filters for the rest.`,
      50,
      y + 13
    );
    doc.setTextColor(...INK);
    y += 30;
  }

  return y;
}

function drawKpiCards(
  doc: jsPDF,
  y: number,
  stats: ReturnType<typeof computeStats>
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - 80;
  const gap = 10;
  const perRow = 4;
  const cardW = (usable - gap * (perRow - 1)) / perRow;
  const cardH = 44;

  const rows: Array<Array<{ label: string; value: string; tone?: RGB }>> = [
    [
      { label: 'Learners', value: String(stats.learners) },
      { label: 'With bills', value: String(stats.withBills), tone: GREEN },
      { label: 'Without bills', value: String(stats.withoutBills), tone: RED },
      { label: 'Billing categories', value: String(stats.categories) },
    ],
    [
      { label: 'Bills', value: String(stats.bills) },
      { label: 'Total billed', value: money(stats.total) },
      { label: 'Paid', value: money(stats.paid), tone: GREEN },
      { label: 'Pending', value: money(stats.pending), tone: RED },
    ],
  ];

  for (const row of rows) {
    row.forEach((card, i) => {
      const x = 40 + i * (cardW + gap);
      doc.setFillColor(...CARD_BG);
      doc.setDrawColor(...CARD_LINE);
      doc.roundedRect(x, y, cardW, cardH, 3, 3, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(card.label.toUpperCase(), x + 9, y + 14);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(card.tone ?? INK));
      // Fit rather than overflow — amounts can run to 9 digits plus paise.
      fitText(doc, card.value, cardW - 18, 13);
      doc.text(card.value, x + 9, y + 33);
    });
    y += cardH + gap;
  }

  // Collection rate is the one derived number worth stating outright.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `Collected ${pct(stats.paid, stats.total)} of total billed` +
      (stats.withoutBills
        ? `   ·   ${stats.withoutBills} ${
            stats.withoutBills === 1 ? 'learner has' : 'learners have'
          } no bill at all`
        : ''),
    40,
    y + 4
  );
  doc.setTextColor(...INK);

  return y + 16;
}

function sectionHeading(doc: jsPDF, y: number, text: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(text, 40, y);
  doc.setDrawColor(...CARD_LINE);
  doc.line(40, y + 4, doc.internal.pageSize.getWidth() - 40, y + 4);
  return y + 14;
}

export function generateCoverageBillsPdf(opts: CoverageBillsPdfOptions): jsPDF {
  const { rows, learnerCount, filterSummary = [] } = opts;
  const groups = groupByLearner(rows);
  const stats = computeStats(groups);
  const categoryStats = computeCategoryStats(groups);

  // Landscape: eight columns of financial data do not fit portrait without
  // wrapping amounts, which makes them hard to scan down a column.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  // Column widths are deliberately NOT set. Measured with a probe: left to
  // auto-size, autoTable distributes by content and fills the usable width
  // exactly (761.9pt of 761.9pt on landscape A4). Hand-picked fractions did
  // worse on both counts — they warned "N units width could not fit page"
  // because some columns were given less than their content needs (Academic
  // Year wants ~96pt, was given 75) while others were over-allocated (Status
  // needs ~47pt, was given 68). Only alignment is pinned below.

  let y = drawTitleBand(doc, stats, learnerCount, filterSummary);
  y = drawKpiCards(doc, y, stats);

  // ── Category-wise breakdown ──────────────────────────────────────────────
  y = sectionHeading(doc, y + 10, 'Bills by category');

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [
      ['Category', 'Bills', 'Learners', 'Total billed', 'Paid', 'Pending', 'Collected'],
    ],
    body: categoryStats.length
      ? [
          ...categoryStats.map((c) => [
            c.category,
            String(c.bills),
            String(c.learners),
            money(c.total),
            money(c.paid),
            money(c.pending),
            pct(c.paid, c.total),
          ]),
          [
            { content: 'All categories', styles: { fontStyle: 'bold' as const } },
            { content: String(stats.bills), styles: { fontStyle: 'bold' as const } },
            // Distinct, so it is deliberately LESS than the column above it: a
            // learner billed in three categories appears in three rows. Labelled
            // rather than left looking like a column that fails to add up.
            {
              content: `${stats.withBills} distinct`,
              styles: { fontStyle: 'bold' as const },
            },
            { content: money(stats.total), styles: { fontStyle: 'bold' as const } },
            { content: money(stats.paid), styles: { fontStyle: 'bold' as const } },
            { content: money(stats.pending), styles: { fontStyle: 'bold' as const } },
            { content: pct(stats.paid, stats.total), styles: { fontStyle: 'bold' as const } },
          ],
        ]
      : [
          [
            {
              content: 'No bills exist for the learners in this filter.',
              colSpan: 7,
              styles: { fontStyle: 'italic' as const, textColor: RED },
            },
          ],
        ],
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: SLATE, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: 40, right: 40 },
  });

  // ── Per-learner detail ───────────────────────────────────────────────────
  // Continue on the same page when there is real room left, rather than always
  // burning a page on a short report; break when the heading plus a couple of
  // rows would not fit, which is what makes a stranded heading look broken.
  const afterCategory = (doc as any).lastAutoTable?.finalY ?? y;
  const pageHeight = doc.internal.pageSize.getHeight();
  const needed = 90;
  let detailStart: number;
  if (afterCategory + needed > pageHeight - 40) {
    doc.addPage();
    detailStart = sectionHeading(doc, 50, 'Learner-wise bill details');
  } else {
    detailStart = sectionHeading(doc, afterCategory + 26, 'Learner-wise bill details');
  }

  const body: any[] = [];
  let currentInstitution: string | null | undefined = undefined;

  for (const g of groups) {
    const l = g.learner;

    // Institution banded once instead of repeated on every learner line. The
    // RPC already orders by institution, so a single pass groups correctly —
    // and it stops the identity line wrapping to two rows, which was costing
    // roughly a quarter of the page count.
    if (l.institution_name !== currentInstitution) {
      currentInstitution = l.institution_name;
      body.push([
        {
          content: currentInstitution ?? 'Unknown institution',
          colSpan: 8,
          styles: {
            fillColor: SLATE,
            textColor: [255, 255, 255] as RGB,
            fontStyle: 'bold' as const,
            fontSize: 8.5,
          },
        },
      ]);
    }

    const identity = [
      l.full_name,
      l.roll_number || l.register_number || null,
      l.program_name,
      l.semester_section,
    ]
      .filter(Boolean)
      .join('  ·  ');

    // Subtotal summed from THIS learner's PRINTED rows, not from the RPC's
    // learner_total. The two agree today, but mixing sources means the bands
    // only happen to sum to the KPI totals rather than provably doing so — and
    // "summary and detail agree by construction" is the whole point of deriving
    // every figure in this document from one dataset.
    const sub = g.bills.reduce(
      (acc, b) => ({
        total: acc.total + (b.total_amount ?? 0),
        paid: acc.paid + (b.paid_amount ?? 0),
        pending: acc.pending + (b.pending_amount ?? 0),
      }),
      { total: 0, paid: 0, pending: 0 }
    );

    // Bill count on the band, so a reader can tell at a glance that the box
    // holds EVERY bill this learner has rather than a fragment of them — the
    // failure this document had when a learner could appear in several boxes.
    const bandLabel = g.bills.length
      ? `${identity}   —   ${g.bills.length} bill${g.bills.length === 1 ? '' : 's'}`
      : identity;

    // Identity band carries the subtotal in the amount columns, so it doubles
    // as the subtotal row — one row per learner instead of two, which matters
    // across a thousand of them.
    body.push([
      {
        content: bandLabel,
        colSpan: 5,
        styles: { fillColor: BAND, textColor: INK, fontStyle: 'bold' as const },
      },
      {
        content: money(sub.total),
        styles: { fillColor: BAND, fontStyle: 'bold' as const, halign: 'right' as const },
      },
      {
        content: money(sub.paid),
        styles: {
          fillColor: BAND,
          textColor: GREEN,
          fontStyle: 'bold' as const,
          halign: 'right' as const,
        },
      },
      {
        content: money(sub.pending),
        styles: {
          fillColor: BAND,
          textColor: sub.pending > 0 ? RED : GREEN,
          fontStyle: 'bold' as const,
          halign: 'right' as const,
        },
      },
    ]);

    if (!g.bills.length) {
      body.push([
        {
          content: 'No bills generated',
          colSpan: 8,
          styles: { textColor: RED, fontStyle: 'italic' as const },
        },
      ]);
    } else {
      // Numbered within the learner, so the box reads as one itemised list and
      // a missing line is obvious.
      for (const [i, b] of g.bills.entries()) {
        body.push([
          `${i + 1}.  ${billLabel(b)}`,
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
  }

  autoTable(doc, {
    startY: detailStart,
    theme: 'grid',
    head: [
      ['Bill', 'Category', 'Academic Year', 'Due Date', 'Status', 'Total', 'Paid', 'Pending'],
    ],
    body: body.length
      ? body
      : [[{ content: 'No learners match these filters.', colSpan: 8 }]],
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: SLATE, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    margin: { left: 40, right: 40 },
    didParseCell: (data) => {
      // Bill rows are plain 8-element arrays; learner bands and "no bills" rows
      // are shorter arrays of colSpan objects. Keying on length keeps the status
      // colouring off the bands, whose column indices shift under colSpan.
      const raw = data.row.raw as unknown[];
      if (data.section !== 'body' || !Array.isArray(raw) || raw.length !== 8) return;
      if (data.column.index !== 4) return;

      const status = String(data.cell.raw ?? '').toLowerCase();
      if (status === 'paid') data.cell.styles.textColor = GREEN;
      else if (status.includes('partial')) data.cell.styles.textColor = AMBER;
      else if (status === 'unpaid' || status === 'overdue') data.cell.styles.textColor = RED;
    },
  });

  // Footers last, so the total page count is known. didDrawPage cannot do this —
  // it fires before later pages exist.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      'MyJKKN · Bill Coverage',
      40,
      doc.internal.pageSize.getHeight() - 18
    );
    doc.text(
      `Page ${i} of ${pages}`,
      pageWidth - 40,
      doc.internal.pageSize.getHeight() - 18,
      { align: 'right' }
    );
    doc.setTextColor(...INK);
  }

  return doc;
}

export function downloadCoverageBillsPdf(opts: CoverageBillsPdfOptions): void {
  const doc = generateCoverageBillsPdf(opts);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`bill-coverage-details-${stamp}.pdf`);
}
