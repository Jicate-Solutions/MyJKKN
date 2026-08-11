/**
 * Excel + PDF export for the Auto-Allocate preview
 * (Campus Living → Allocations → Auto-Allocate → Preview).
 *
 * Exports the rows the operator is actually looking at — the preview table's
 * FILTERED set — because the point of the export is triage: carry the excluded
 * candidates and their exclusion reasons out to Billing / Physical Rooms and
 * fix them. The filter and scope context is stamped into both files so an
 * exported sheet can't be mistaken for the full cohort.
 *
 * Same jspdf + jspdf-autotable shape as the sibling exporters
 * (rooms-pdf.ts, batch-allocations-pdf.ts): landscape A4, header + summary +
 * auto-table + page numbers. This whole module is loaded by dynamic import from
 * candidate-validation-table.tsx so xlsx and jsPDF stay out of the page bundle.
 */

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { AllocationCandidate } from '@/types/allocation-batch';
import { CANDIDATE_PDF_COLUMNS, toExportRow, type CandidateExportRow } from './candidate-display';

export interface CandidatesExportContext {
  /** 'boys' | 'girls' — the hostel type the preview was run for. */
  hostelType: string;
  /** The Strict physical rules toggle at the time of the preview. */
  strict: boolean;
  /** The overflow toggle the preview ran with — changes which rows are 'In'. */
  allowOverflow: boolean;
  /** Page-level cohort selection, pre-labelled (e.g. 'Institution: JKKN Dental'). */
  scope: string[];
  /** Table-level active filters, pre-labelled. [] => none. */
  filters: string[];
  /** Candidates returned by the RPC, before the table filters narrowed them. */
  totalCandidates: number;
  /** Eligible (verdict 'in') across that full set — not just the exported rows. */
  totalEligible: number;
  availableBeds: number;
}

const COLUMN_WIDTH: Record<string, number> = {
  Student: 28,
  'Roll No': 16,
  Email: 30,
  Institution: 34,
  Program: 30,
  Semester: 14,
  'Admission Year': 15,
  'Fee Basis Year': 15,
  'Bill Status': 16,
  'Goes To Block': 22,
  'Room Category': 20,
  'Mess Category': 20,
  'Exclusion Reason': 48,
};

const stamp = () => format(new Date(), 'dd MMM yyyy, HH:mm');
const fileStamp = () => format(new Date(), 'yyyy-MM-dd');
const typeLabel = (t: string) => (t === 'boys' ? 'Boys' : t === 'girls' ? 'Girls' : t || '—');

/** The scope/filter block both formats print, so the two can't disagree. */
function contextLines(ctx: CandidatesExportContext, exported: number): string[][] {
  return [
    ['Hostel type', typeLabel(ctx.hostelType)],
    ['Strict physical rules', ctx.strict ? 'On' : 'Off'],
    ['Overflow to unreserved rooms', ctx.allowOverflow ? 'On' : 'Off'],
    ['Cohort selection', ctx.scope.length ? ctx.scope.join('  ·  ') : 'All institutions / programs / semesters'],
    ['Table filters', ctx.filters.length ? ctx.filters.join('  ·  ') : 'None (all preview rows)'],
    ['Rows exported', `${exported} of ${ctx.totalCandidates} candidates`],
    ['Eligible (full preview)', String(ctx.totalEligible)],
    ['Available beds', String(ctx.availableBeds)],
    ['Generated', stamp()],
  ];
}

function baseFilename(ctx: CandidatesExportContext) {
  return `auto-allocate-preview_${ctx.hostelType || 'all'}_${fileStamp()}`;
}

// ── Excel ─────────────────────────────────────────────────────────────────
export function exportCandidatesExcel(
  candidates: AllocationCandidate[],
  ctx: CandidatesExportContext
): void {
  const rows: CandidateExportRow[] = candidates.map(toExportRow);
  const headers = Object.keys(rows[0]);

  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: COLUMN_WIDTH[h] ?? 14 }));
  // Autofilter on the header row — the sheet is a triage worklist, so the
  // operator keeps slicing it after export.
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: headers.length - 1 },
    }),
  };

  const summary = XLSX.utils.aoa_to_sheet([
    ['Auto-Allocate Preview'],
    [],
    ...contextLines(ctx, rows.length),
    [],
    ['Verdict breakdown (exported rows)'],
    ['In (eligible)', rows.filter((r) => r.Verdict === 'In').length],
    ['Out (excluded)', rows.filter((r) => r.Verdict === 'Out').length],
    ['No usable academic fee', rows.filter((r) => r['Band Fee'] === '').length],
  ]);
  summary['!cols'] = [{ wch: 26 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');
  XLSX.writeFile(wb, `${baseFilename(ctx)}.xlsx`);
}

// ── PDF ───────────────────────────────────────────────────────────────────
export function exportCandidatesPdf(
  candidates: AllocationCandidate[],
  ctx: CandidatesExportContext
): void {
  const rows = candidates.map(toExportRow);

  const doc = new jsPDF('l', 'mm', 'a4'); // landscape — CANDIDATE_PDF_COLUMNS is wide
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Auto-Allocate Preview — ${typeLabel(ctx.hostelType)}`, margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  for (const [label, value] of contextLines(ctx, rows.length)) {
    // splitTextToSize keeps a long filter/scope line inside the page instead of
    // running off the right edge.
    const lines = doc.splitTextToSize(`${label}: ${value}`, pageWidth - margin * 2) as string[];
    doc.text(lines, margin, y);
    y += 4.5 * lines.length;
  }
  doc.setTextColor(0, 0, 0);
  y += 4;

  // ── Summary ─────────────────────────────────────────────────────────────
  const eligible = rows.filter((r) => r.Verdict === 'In').length;
  autoTable(doc, {
    startY: y,
    head: [['Rows Exported', 'Eligible', 'Excluded', 'Available Beds']],
    body: [[
      String(rows.length),
      String(eligible),
      String(rows.length - eligible),
      String(ctx.availableBeds),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 10, fontStyle: 'bold', halign: 'center' },
    margin: { left: margin, right: margin },
    tableWidth: 130,
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Main table ──────────────────────────────────────────────────────────
  // jsPDF's built-in helvetica is WinAnsi — it has no rupee glyph, so the fee
  // column is printed as a plain grouped number under an "(Rs.)" header.
  const cell = (row: CandidateExportRow, key: string) => {
    const v = row[key];
    if (v === '' || v == null) return '—';
    if (key === 'Band Fee') return Number(v).toLocaleString('en-IN');
    return String(v);
  };

  autoTable(doc, {
    startY: y,
    head: [CANDIDATE_PDF_COLUMNS.map((h) => (h === 'Band Fee' ? 'Band Fee (Rs.)' : h))],
    body: rows.map((r) => CANDIDATE_PDF_COLUMNS.map((h) => cell(r, h))),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 7, cellPadding: 1.6, overflow: 'linebreak' },
    // Derived from the column list rather than hardcoded — autoTable keys these
    // by position, so a literal index silently lands on the wrong column the
    // moment CANDIDATE_PDF_COLUMNS gains a field.
    columnStyles: {
      [CANDIDATE_PDF_COLUMNS.indexOf('Band Fee')]: { halign: 'right' },
      [CANDIDATE_PDF_COLUMNS.indexOf('Verdict')]: { halign: 'center' },
    },
    margin: { left: margin, right: margin },
  });

  // ── Page numbers ────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  doc.save(`${baseFilename(ctx)}.pdf`);
}
