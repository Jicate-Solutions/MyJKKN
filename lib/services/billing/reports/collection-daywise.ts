// Pure helpers for the Collection report (day-wise view on
// /billing/reports?tab=collection): grouping rows into day sections with
// per-mode subtotals, and the sheet models the Excel export writes. No
// Supabase, no React, no exceljs — unit-tested directly. The exceljs writer
// that turns these models into a styled workbook lives in
// collection-excel.ts so this file stays importable from tests.
import type { CollectionDaywiseRow } from '@/types/billing-schedule';

export interface ModeTotal {
  mode: string;
  count: number;
  gross: number;
  refunds: number;
  net: number;
}

export interface DaySection {
  /** ISO date (YYYY-MM-DD) — the receipt_date. */
  date: string;
  rows: CollectionDaywiseRow[];
  count: number;
  gross: number;
  refunds: number;
  net: number;
  /** Per payment mode, descending by net. '' = mode not recorded. */
  byMode: ModeTotal[];
}

export interface DaywiseSummary {
  count: number;
  gross: number;
  refunds: number;
  net: number;
  byMode: ModeTotal[];
}

/** Known billing_receipts.payment_mode values in the order the export lists
 *  them. Unknown modes keep their raw value (underscores spaced) so nothing is
 *  mislabelled; '' means the mode was never recorded. */
export const PAYMENT_MODE_ORDER = [
  'cash',
  'online',
  'dd',
  'cheque',
  'bank_transfer',
  'combined'
] as const;

export const DAYWISE_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  online: 'Online',
  bank_transfer: 'Bank Transfer',
  dd: 'DD',
  cheque: 'Cheque',
  combined: 'Combined'
};

export function daywiseModeLabel(mode: string | null | undefined): string {
  if (!mode) return 'Not Recorded';
  return DAYWISE_MODE_LABELS[mode] ?? mode.replace(/_/g, ' ');
}

/** Sort key: known modes in PAYMENT_MODE_ORDER, unknown after, '' last. */
function modeRank(mode: string): number {
  if (mode === '') return 1000;
  const i = (PAYMENT_MODE_ORDER as readonly string[]).indexOf(mode);
  return i === -1 ? 500 : i;
}

/** Every mode present in the rows, in catalogue order. */
export function modesPresent(rows: CollectionDaywiseRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(r.payment_mode || '');
  return Array.from(set).sort((a, b) => modeRank(a) - modeRank(b));
}

const num = (v: unknown) => Number(v) || 0;

function tallyModes(rows: CollectionDaywiseRow[]): ModeTotal[] {
  const map = new Map<string, ModeTotal>();
  for (const r of rows) {
    const key = r.payment_mode || '';
    const t = map.get(key) ?? { mode: key, count: 0, gross: 0, refunds: 0, net: 0 };
    t.count += 1;
    t.gross += num(r.payment_amount);
    t.refunds += num(r.total_refunds);
    t.net += num(r.net_amount);
    map.set(key, t);
  }
  return Array.from(map.values()).sort((a, b) => b.net - a.net);
}

/** Groups by receipt_date (ascending) regardless of input order. */
export function groupByDay(rows: CollectionDaywiseRow[]): DaySection[] {
  const map = new Map<string, CollectionDaywiseRow[]>();
  for (const r of rows) {
    const key = (r.receipt_date || '').slice(0, 10);
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) =>
        (a.receipt_number || '').localeCompare(b.receipt_number || '')
      );
      return {
        date,
        rows: sorted,
        count: sorted.length,
        gross: sorted.reduce((s, r) => s + num(r.payment_amount), 0),
        refunds: sorted.reduce((s, r) => s + num(r.total_refunds), 0),
        net: sorted.reduce((s, r) => s + num(r.net_amount), 0),
        byMode: tallyModes(sorted)
      };
    });
}

export function summarise(rows: CollectionDaywiseRow[]): DaywiseSummary {
  return {
    count: rows.length,
    gross: rows.reduce((s, r) => s + num(r.payment_amount), 0),
    refunds: rows.reduce((s, r) => s + num(r.total_refunds), 0),
    net: rows.reduce((s, r) => s + num(r.net_amount), 0),
    byMode: tallyModes(rows)
  };
}

/** The mode-specific detail a counter wants on one line: which instrument
 *  and, for DD, where it was drawn. */
export function transactionDetail(r: CollectionDaywiseRow): string {
  const parts: string[] = [];
  if (r.payment_reference_number) parts.push(r.payment_reference_number);
  if (r.payment_mode === 'dd') {
    const bank = [r.dd_bank_name, r.dd_branch].filter(Boolean).join(', ');
    if (bank) parts.push(bank);
  }
  if (r.payment_mode === 'bank_transfer' && r.remitter_name) {
    parts.push(`Remitter: ${r.remitter_name}`);
  }
  return parts.join(' · ');
}

export function learnerName(r: CollectionDaywiseRow): string {
  return `${r.first_name || ''} ${r.last_name || ''}`.trim();
}

/** Local calendar date as YYYY-MM-DD (not toISOString, which is UTC and rolls
 *  the day back before 05:30 IST). */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Export sheet models ──────────────────────────────────────────────────────

export type ExportCell = string | number | null;

/** How a row should be painted; the writer maps these to fills/fonts. */
export type ExportRowKind =
  | 'header'
  | 'data'
  | 'subtotal' // per-mode subtotal within a day
  | 'day-total'
  | 'grand-total'
  | 'spacer';

export interface ExportRow {
  kind: ExportRowKind;
  cells: ExportCell[];
  /** payment_mode of a data / subtotal row, for the mode colour strip. */
  mode?: string;
}

/** Fixed detail header — the order the sheet is read in at the counter. */
export const DAYWISE_EXPORT_HEADER = [
  'Date',
  'Receipt No',
  'Learner',
  'Roll No',
  'Institution',
  'Program',
  'Semester',
  'Fee Category',
  'Payment Mode',
  'Reference / Txn No',
  'DD Bank',
  'DD Branch',
  'Remitter',
  'Paid Date',
  'Date of Credit',
  'Payer',
  'Payer Contact',
  'Collected By',
  'Remarks',
  'Receipt Amount',
  'Refunds',
  'Net Amount'
] as const;

/** Column indexes (0-based) of the three money columns in the detail sheets. */
export const DETAIL_MONEY_COLS = { gross: 19, refunds: 20, net: 21 } as const;
/** 0-based index of the Payment Mode column in the detail sheets. */
export const DETAIL_MODE_COL = 8;

function totalCells(
  date: string,
  label: string,
  t: { gross: number; refunds: number; net: number }
): ExportCell[] {
  const row: ExportCell[] = new Array(DAYWISE_EXPORT_HEADER.length).fill('');
  row[0] = date;
  row[2] = label;
  row[DETAIL_MONEY_COLS.gross] = t.gross;
  row[DETAIL_MONEY_COLS.refunds] = t.refunds;
  row[DETAIL_MONEY_COLS.net] = t.net;
  return row;
}

/**
 * Detail sheet rows: header, then per day its receipts followed by (on the
 * "All" sheet) one subtotal per payment mode, a day total, a spacer, and a
 * grand total at the end. Per-mode sheets pass withModeSubtotals=false since
 * every row is the same mode.
 */
export function buildDetailRows(
  sections: DaySection[],
  opts: { withModeSubtotals: boolean } = { withModeSubtotals: true }
): ExportRow[] {
  const out: ExportRow[] = [{ kind: 'header', cells: [...DAYWISE_EXPORT_HEADER] }];
  const grand = { count: 0, gross: 0, refunds: 0, net: 0 };

  for (const day of sections) {
    for (const r of day.rows) {
      out.push({
        kind: 'data',
        mode: r.payment_mode || '',
        cells: [
          day.date,
          r.receipt_number,
          learnerName(r),
          r.roll_number ?? '',
          r.institution_name ?? '',
          r.program_name ?? '',
          r.semester_name ?? '',
          r.categories ?? '',
          daywiseModeLabel(r.payment_mode),
          r.payment_reference_number ?? '',
          r.dd_bank_name ?? '',
          r.dd_branch ?? '',
          r.remitter_name ?? '',
          r.payment_paid_date ?? '',
          r.date_of_credit ?? '',
          r.payer_name ?? '',
          r.payer_contact ?? '',
          r.collected_by ?? 'System',
          r.payment_remarks ?? '',
          num(r.payment_amount),
          num(r.total_refunds),
          num(r.net_amount)
        ]
      });
    }
    if (opts.withModeSubtotals) {
      for (const m of day.byMode) {
        out.push({
          kind: 'subtotal',
          mode: m.mode,
          cells: totalCells(day.date, `${daywiseModeLabel(m.mode)} (${m.count})`, m)
        });
      }
    }
    out.push({ kind: 'day-total', cells: totalCells(day.date, `Day Total (${day.count})`, day) });
    out.push({ kind: 'spacer', cells: [] });
    grand.count += day.count;
    grand.gross += day.gross;
    grand.refunds += day.refunds;
    grand.net += day.net;
  }

  out.push({ kind: 'grand-total', cells: totalCells('', `Grand Total (${grand.count})`, grand) });
  return out;
}

/**
 * Plain array-of-arrays view of the "All" detail sheet — what
 * XLSX.utils.aoa_to_sheet takes. Spacer rows come out as `[]`.
 */
export function buildExportRows(sections: DaySection[]): ExportCell[][] {
  return buildDetailRows(sections, { withModeSubtotals: true }).map((r) => r.cells);
}

/** A titled table on the Summary sheet. Money columns are flagged so the
 *  writer can apply the ₹ number format; `modeCols` says which header cells
 *  are payment modes so they get the mode colour. */
export interface SummaryTable {
  title: string;
  header: string[];
  rows: ExportCell[][];
  /** Last row is a total row when true. */
  hasTotal: boolean;
  /** 0-based indexes of numeric-money columns. */
  moneyCols: number[];
  /** 0-based index → payment_mode key, for coloured mode headers. */
  modeCols?: Record<number, string>;
}

export interface SummaryModel {
  title: string;
  /** "From – To" or "All dates". */
  rangeLabel: string;
  /** The one institution every row belongs to, when the export is scoped to
   *  a single college (or the data happens to hold only one); null when the
   *  rows span several institutions. */
  institutionLabel: string | null;
  generatedAt: string;
  /** Headline tiles: label + value (+ optional money flag). */
  tiles: { label: string; value: string | number; money?: boolean }[];
  tables: SummaryTable[];
}

/** mode × (count, gross, refunds, net, share) pivot for a set of rows. */
function modeBreakdownTable(title: string, rows: CollectionDaywiseRow[]): SummaryTable {
  const s = summarise(rows);
  const ordered = [...s.byMode].sort((a, b) => modeRank(a.mode) - modeRank(b.mode));
  const body: ExportCell[][] = ordered.map((m) => [
    daywiseModeLabel(m.mode),
    m.count,
    m.gross,
    m.refunds,
    m.net,
    s.net > 0 ? Math.round((m.net / s.net) * 1000) / 10 : 0
  ]);
  body.push(['Total', s.count, s.gross, s.refunds, s.net, s.net > 0 ? 100 : 0]);
  return {
    title,
    header: ['Payment Mode', 'Receipts', 'Gross', 'Refunds', 'Net', 'Share %'],
    rows: body,
    hasTotal: true,
    moneyCols: [2, 3, 4]
  };
}

/** key × mode pivot (net amounts) with a Receipts and Total column. */
function pivotTable(
  title: string,
  keyHeader: string,
  rows: CollectionDaywiseRow[],
  keyOf: (r: CollectionDaywiseRow) => string,
  sortKeys?: (a: string, b: string) => number
): SummaryTable {
  const modes = modesPresent(rows);
  const byKey = new Map<string, CollectionDaywiseRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  const keys = Array.from(byKey.keys()).sort(sortKeys ?? ((a, b) => a.localeCompare(b)));
  const body: ExportCell[][] = [];
  const colTotals = new Array<number>(modes.length).fill(0);
  let totalCount = 0;
  let totalNet = 0;
  for (const k of keys) {
    const list = byKey.get(k)!;
    const s = summarise(list);
    const cells: ExportCell[] = [k, s.count];
    modes.forEach((m, i) => {
      const t = s.byMode.find((x) => x.mode === m);
      const v = t ? t.net : 0;
      colTotals[i] += v;
      cells.push(v);
    });
    cells.push(s.net);
    totalCount += s.count;
    totalNet += s.net;
    body.push(cells);
  }
  body.push(['Total', totalCount, ...colTotals, totalNet]);
  const modeCols: Record<number, string> = {};
  modes.forEach((m, i) => { modeCols[2 + i] = m; });
  return {
    title,
    header: [keyHeader, 'Receipts', ...modes.map(daywiseModeLabel), 'Total Net'],
    rows: body,
    hasTotal: true,
    moneyCols: modes.map((_, i) => 2 + i).concat([2 + modes.length]),
    modeCols
  };
}

/** Fee-category x (receipts, amount, share) table from category_breakdown.
 *  Amounts are amount_paid per category, gross of refunds (refunds are not
 *  attributed to a category), so this table's total is the gross figure. */
function categoryTable(title: string, rows: CollectionDaywiseRow[]): SummaryTable {
  const map = new Map<string, { receipts: Set<string>; amount: number }>();
  for (const r of rows) {
    for (const c of r.category_breakdown ?? []) {
      const key = c.category || 'Uncategorised';
      const t = map.get(key) ?? { receipts: new Set<string>(), amount: 0 };
      t.receipts.add(r.receipt_id);
      t.amount += num(c.amount);
      map.set(key, t);
    }
  }
  const entries = Array.from(map.entries()).sort((a, b) => b[1].amount - a[1].amount);
  const total = entries.reduce((s, [, t]) => s + t.amount, 0);
  const body: ExportCell[][] = entries.map(([k, t]) => [
    k, t.receipts.size, t.amount, total > 0 ? Math.round((t.amount / total) * 1000) / 10 : 0
  ]);
  body.push(['Total', rows.length, total, total > 0 ? 100 : 0]);
  return {
    title,
    header: ['Fee Category', 'Receipts', 'Amount', 'Share %'],
    rows: body,
    hasTotal: true,
    moneyCols: [2]
  };
}

/** institution x fee category pivot (amount_paid). */
function institutionCategoryTable(rows: CollectionDaywiseRow[]): SummaryTable {
  const cats = new Map<string, number>();
  for (const r of rows) for (const c of r.category_breakdown ?? []) {
    const k = c.category || 'Uncategorised';
    cats.set(k, (cats.get(k) ?? 0) + num(c.amount));
  }
  const catNames = Array.from(cats.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const insts = institutionsPresent(rows);
  const body: ExportCell[][] = [];
  const colTotals = new Array<number>(catNames.length).fill(0);
  let grand = 0;
  for (const inst of insts) {
    const sub = rows.filter((r) => (r.institution_name || 'Unknown') === inst);
    const cells: ExportCell[] = [inst];
    let rowTotal = 0;
    catNames.forEach((cn, i) => {
      let v = 0;
      for (const r of sub) for (const c of r.category_breakdown ?? []) {
        if ((c.category || 'Uncategorised') === cn) v += num(c.amount);
      }
      colTotals[i] += v;
      rowTotal += v;
      cells.push(v);
    });
    cells.push(rowTotal);
    grand += rowTotal;
    body.push(cells);
  }
  body.push(['Total', ...colTotals, grand]);
  return {
    title: 'Institution-wise by Fee Category',
    header: ['Institution', ...catNames, 'Total'],
    rows: body,
    hasTotal: true,
    moneyCols: catNames.map((_, i) => 1 + i).concat([1 + catNames.length])
  };
}

export function institutionsPresent(rows: CollectionDaywiseRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.institution_name || 'Unknown'))).sort();
}

/**
 * Summary sheet model. Institution-wise tables appear only when the rows span
 * more than one institution — a single-institution export would just repeat
 * the mode table.
 */
export function buildSummaryModel(
  rows: CollectionDaywiseRow[],
  opts: { rangeLabel: string; generatedAt?: string }
): SummaryModel {
  const s = summarise(rows);
  const sections = groupByDay(rows);
  const institutions = institutionsPresent(rows);
  const multiInstitution = institutions.length > 1;

  const tiles: SummaryModel['tiles'] = [
    { label: 'Days', value: sections.length },
    { label: 'Receipts', value: s.count },
    { label: 'Gross Collected', value: s.gross, money: true },
    { label: 'Refunds', value: s.refunds, money: true },
    { label: 'Net Collected', value: s.net, money: true }
  ];
  if (multiInstitution) tiles.splice(1, 0, { label: 'Institutions', value: institutions.length });

  const tables: SummaryTable[] = [modeBreakdownTable('Collection by Payment Mode', rows)];

  if (multiInstitution) {
    tables.push(
      pivotTable('Institution-wise Collection', 'Institution', rows, (r) => r.institution_name || 'Unknown')
    );
  }

  const hasCategories = rows.some((r) => (r.category_breakdown ?? []).length > 0);
  if (hasCategories) {
    tables.push(categoryTable('Collection by Fee Category', rows));
    if (multiInstitution) tables.push(institutionCategoryTable(rows));
  }

  tables.push(pivotTable('Day-wise Collection', 'Date', rows, (r) => (r.receipt_date || '').slice(0, 10)));

  if (multiInstitution && sections.length > 1) {
    // One block per institution so a multi-college, multi-day range reads
    // per college without the reader having to filter the All sheet.
    for (const inst of institutions) {
      const sub = rows.filter((r) => (r.institution_name || 'Unknown') === inst);
      tables.push(pivotTable(`${inst} — Day-wise`, 'Date', sub, (r) => (r.receipt_date || '').slice(0, 10)));
    }
  }

  return {
    title: 'Fee Collection Report',
    rangeLabel: opts.rangeLabel,
    institutionLabel: institutions.length === 1 ? institutions[0] : null,
    generatedAt: opts.generatedAt ?? new Date().toLocaleString('en-IN'),
    tiles,
    tables
  };
}

export interface WorkbookModel {
  summary: SummaryModel;
  /** Sheet name → detail rows. First is "All", then one per mode present. */
  detailSheets: { name: string; mode: string | null; rows: ExportRow[] }[];
}

/** Excel sheet names: ≤31 chars, none of  \ / ? * [ ] : */
export function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
}

export function buildWorkbookModel(
  rows: CollectionDaywiseRow[],
  opts: { rangeLabel: string; generatedAt?: string }
): WorkbookModel {
  const detailSheets: WorkbookModel['detailSheets'] = [
    { name: 'All', mode: null, rows: buildDetailRows(groupByDay(rows), { withModeSubtotals: true }) }
  ];
  for (const m of modesPresent(rows)) {
    const sub = rows.filter((r) => (r.payment_mode || '') === m);
    detailSheets.push({
      name: safeSheetName(daywiseModeLabel(m)),
      mode: m,
      rows: buildDetailRows(groupByDay(sub), { withModeSubtotals: false })
    });
  }
  return { summary: buildSummaryModel(rows, opts), detailSheets };
}
