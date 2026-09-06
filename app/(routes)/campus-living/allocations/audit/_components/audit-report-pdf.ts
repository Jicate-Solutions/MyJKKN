/**
 * PDF export for the Allocation Audit (Campus Living → Allocations → Audit).
 *
 * Same jspdf + jspdf-autotable shape as the sibling exporters
 * (candidates-export.ts, rooms-pdf.ts, batch-allocations-pdf.ts): landscape A4,
 * header + context + summary tables + detail table + page numbers. Loaded by
 * dynamic import from page.tsx so jsPDF stays out of the page bundle.
 *
 * Scope: exports the rows the operator is actually looking at — the advanced
 * filters AND the verdict chip — and stamps that scope onto page 1, so an
 * exported report can never be mistaken for the full cohort.
 *
 * Division of labour with the Excel export: this PDF is the readable report you
 * circulate (summary + the evidence columns). The Excel export carries all 43
 * fields per row for slicing. Neither is a substitute for the other.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { AllocationAuditRow } from '@/types/campus-living-allocation-audit';
// Labels come from the badge module so the PDF, the table and the drawer word
// every verdict identically — a report that renamed them would read as a
// different finding.
import { VERDICT_META, RULE_META, BILL_STATE_META, YEAR_SOURCE_META } from './audit-badges';

export interface AuditPdfContext {
  /** The allocation-status scope, pre-labelled (e.g. 'Active allocations'). */
  statusLabel: string;
  /** Active advanced filters, pre-labelled. [] => none. */
  filters: string[];
  /** The verdict quick-filter chip in force. */
  chipLabel: string;
  /** Rows in the audit before the chip/search narrowed them. */
  totalAudited: number;
  /**
   * When the audit data itself was computed (React Query's dataUpdatedAt), as
   * distinct from when this PDF was generated. They differ whenever the page
   * has been open a while, and stamping only "Generated" would present stale
   * verdicts as current — the exact error the Re-audit button exists to avoid.
   */
  dataAsOf?: number | null;
}

const stamp = () => format(new Date(), 'dd MMM yyyy, HH:mm');
const fileStamp = () => format(new Date(), 'yyyy-MM-dd');

/**
 * jsPDF's built-in helvetica is WinAnsi — it has NO rupee glyph, and emitting
 * '₹' renders a replacement box. Every money value in this file is therefore a
 * plain grouped number, with the unit carried in the column header as '(Rs.)'.
 */
const money = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const feeWindow = (r: AllocationAuditRow): string => {
  if (r.matched_fee_min === null && r.matched_fee_max === null) return '—';
  return `${r.matched_fee_min === null ? '0' : money(r.matched_fee_min)} - ${
    r.matched_fee_max === null ? 'no cap' : money(r.matched_fee_max)
  }`;
};

// `width` omitted => flexible: autoTable gives that column the page's residual
// width. At least one flexible column per table, or the leftover is unassignable.
const PDF_COLUMNS: ReadonlyArray<{ header: string; width?: number; align?: 'right' | 'center' }> = [
  { header: 'Learner', width: 28 },
  { header: 'Institution / Program' },
  { header: 'Admitted -> Band Yr', width: 21 },
  { header: 'Basis', width: 13, align: 'center' },
  { header: 'Band Fee (Rs.)', width: 17, align: 'right' },
  { header: 'Fee Band (Rs.)', width: 22 },
  { header: 'Entitled', width: 19 },
  { header: 'Occupied', width: 19 },
  { header: 'Block / Room', width: 23 },
  { header: 'Upgrade', width: 19 },
  { header: 'Rule', width: 13, align: 'center' },
  { header: 'Verdict' },
];

const bodyRow = (r: AllocationAuditRow): string[] => [
  [r.full_name ?? '—', r.roll_number ?? ''].filter(Boolean).join('\n'),
  [r.institution_name ?? '—', r.program_name ?? ''].filter(Boolean).join('\n'),
  `${r.admission_year ?? '—'} -> ${r.band_academic_year_name ?? '—'}`,
  YEAR_SOURCE_META[r.band_year_source]?.label ?? r.band_year_source,
  money(r.band_fee),
  feeWindow(r),
  r.entitled_room_category_name ?? '—',
  // The upgrade story in one cell: only show the arrow when it actually moved.
  r.is_upgraded
    ? `${r.first_room_category_name ?? '—'}\n-> ${r.occupied_room_category_name ?? '—'}`
    : (r.occupied_room_category_name ?? '—'),
  `${r.block_name ?? '—'}\n${r.room_number ?? '—'} / Bed ${r.bed_number ?? '—'}`,
  r.upgrade_bill_count > 0
    ? `${BILL_STATE_META[r.upgrade_bill_state]?.label ?? r.upgrade_bill_state}\n${money(r.upgrade_bill_total)}`
    : (BILL_STATE_META[r.upgrade_bill_state]?.label ?? '—'),
  RULE_META[r.room_rule_verdict]?.label ?? r.room_rule_verdict,
  VERDICT_META[r.verdict]?.label ?? r.verdict,
];

function contextLines(ctx: AuditPdfContext, exported: number): string[][] {
  return [
    ['Scope', ctx.statusLabel],
    ['Advanced filters', ctx.filters.length ? ctx.filters.join('  ·  ') : 'None (all institutions / programs / blocks)'],
    ['Verdict filter', ctx.chipLabel],
    ['Rows in report', `${exported} of ${ctx.totalAudited} audited allocations`],
    [
      'Audit computed',
      ctx.dataAsOf ? format(new Date(ctx.dataAsOf), 'dd MMM yyyy, HH:mm:ss') : stamp(),
    ],
    ['Report generated', stamp()],
  ];
}

export function exportAuditPdf(rows: AllocationAuditRow[], ctx: AuditPdfContext): void {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = 14;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Hostel Allocation Audit', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(
    'Every allocated learner checked against the fee band resolved from their admission-year academic bill, '
      + 'and the physical-room rules covering the room they occupy.',
    margin,
    y
  );
  y += 6;

  for (const [label, value] of contextLines(ctx, rows.length)) {
    const lines = doc.splitTextToSize(`${label}: ${value}`, pageWidth - margin * 2) as string[];
    doc.text(lines, margin, y);
    y += 4.5 * lines.length;
  }
  doc.setTextColor(0, 0, 0);
  y += 4;

  // ── Summary 1: verdict breakdown ──────────────────────────────────────────
  const verdictCounts = new Map<string, number>();
  for (const r of rows) verdictCounts.set(r.verdict, (verdictCounts.get(r.verdict) ?? 0) + 1);
  const pct = (n: number) => (rows.length ? `${((n / rows.length) * 100).toFixed(1)}%` : '—');

  autoTable(doc, {
    startY: y,
    head: [['Verdict', 'Learners', 'Share', 'Meaning']],
    body: [...verdictCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => [
        VERDICT_META[v as keyof typeof VERDICT_META]?.label ?? v,
        String(n),
        pct(n),
        VERDICT_META[v as keyof typeof VERDICT_META]?.hint ?? '',
      ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 16, halign: 'right' },
      2: { cellWidth: 16, halign: 'right' },
      // 'Meaning' left flexible — it absorbs the page's residual width.
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Summary 2: which year the band was read from ──────────────────────────
  // Broken out because it is the finding most likely to be acted on: a band
  // resolved against a year the learner was not admitted in is a config gap,
  // not a placement error, and it is invisible on every other screen.
  const basisCounts = new Map<string, number>();
  for (const r of rows) basisCounts.set(r.band_year_source, (basisCounts.get(r.band_year_source) ?? 0) + 1);

  autoTable(doc, {
    startY: y,
    head: [['Fee band read from', 'Learners', 'What it means']],
    body: [...basisCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => [
        YEAR_SOURCE_META[k as keyof typeof YEAR_SOURCE_META]?.label ?? k,
        String(n),
        YEAR_SOURCE_META[k as keyof typeof YEAR_SOURCE_META]?.hint ?? '',
      ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 16, halign: 'right' },
      // 'What it means' left flexible — absorbs the residual width.
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Summary 3: upgrade money ──────────────────────────────────────────────
  const billed = rows.reduce((s, r) => s + r.upgrade_bill_total, 0);
  const collected = rows.reduce((s, r) => s + r.upgrade_bill_paid, 0);
  const outstanding = rows.reduce((s, r) => s + r.upgrade_bill_balance, 0);
  const aboveNoBill = rows.filter(
    (r) => r.verdict === 'upgrade_unbilled' || r.verdict === 'upgrade_bill_cancelled'
  ).length;

  autoTable(doc, {
    startY: y,
    head: [['Upgrade billed (Rs.)', 'Collected (Rs.)', 'Outstanding (Rs.)', 'Above band, no live bill']],
    body: [[money(billed), money(collected), money(outstanding), String(aboveNoBill)]],
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 9, fontStyle: 'bold', halign: 'center' },
    margin: { left: margin, right: margin },
    tableWidth: 180,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Summary 4: per institution ────────────────────────────────────────────
  const byInst = new Map<
    string,
    { audited: number; correct: number; due: number; unexplained: number; rule: number }
  >();
  for (const r of rows) {
    const k = r.institution_name ?? '—';
    const e = byInst.get(k) ?? { audited: 0, correct: 0, due: 0, unexplained: 0, rule: 0 };
    e.audited++;
    if (r.verdict === 'clean' || r.verdict === 'upgrade_paid') e.correct++;
    if (r.verdict === 'upgrade_unpaid' || r.verdict === 'upgrade_partial') e.due++;
    if (r.verdict === 'upgrade_unbilled' || r.verdict === 'upgrade_bill_cancelled') e.unexplained++;
    if (r.verdict === 'room_rule_violation' || r.verdict === 'band_and_rule_violation') e.rule++;
    byInst.set(k, e);
  }

  autoTable(doc, {
    startY: y,
    head: [['Institution', 'Audited', 'Correct', 'Upgrade due', 'Unexplained', 'Rule violation']],
    body: [...byInst.entries()]
      .sort((a, b) => b[1].audited - a[1].audited)
      .map(([k, v]) => [
        k,
        String(v.audited),
        String(v.correct),
        String(v.due),
        String(v.unexplained),
        String(v.rule),
      ]),
    foot: [[
      'Total',
      String(rows.length),
      String([...byInst.values()].reduce((s, v) => s + v.correct, 0)),
      String([...byInst.values()].reduce((s, v) => s + v.due, 0)),
      String([...byInst.values()].reduce((s, v) => s + v.unexplained, 0)),
      String([...byInst.values()].reduce((s, v) => s + v.rule, 0)),
    ]],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
    columnStyles: {
      // Institution name left flexible — absorbs the residual width.
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  // ── Detail table ──────────────────────────────────────────────────────────
  doc.addPage('a4', 'l');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Allocation detail', margin, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(
    'Basis: Same = band read from the admission year. Fallback / No anchor = read from another year.',
    margin,
    19
  );
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 23,
    head: [PDF_COLUMNS.map((c) => c.header)],
    body: rows.map(bodyRow),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 6.5, cellPadding: 1.2, overflow: 'linebreak', valign: 'middle' },
    // Widths derived from PDF_COLUMNS by position rather than hardcoded — a
    // literal index silently lands on the wrong column the moment the list
    // gains a field.
    columnStyles: Object.fromEntries(
      PDF_COLUMNS.map((c, i) => [
        i,
        { ...(c.width ? { cellWidth: c.width } : {}), ...(c.align ? { halign: c.align } : {}) },
      ])
    ) as Record<number, Record<string, unknown>>,
    margin: { left: margin, right: margin },
  });

  // ── Page numbers ──────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Hostel Allocation Audit · ${stamp()} · Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  doc.save(`hostel-allocation-audit_${fileStamp()}.pdf`);
}
