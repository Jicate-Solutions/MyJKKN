// exceljs writer for the Awaiting Payment report. Renders the pure model from
// awaiting-payment-report.ts: a Summary sheet (reason × status, institution ×
// reason) and a Details sheet (one row per learner). Styling follows
// lib/services/billing/reports/collection-excel.ts. Client-only
// (dynamic-imported from the export button).
import ExcelJS from 'exceljs';
import { BLOCKED_REASONS, BLOCKED_REASON_LABELS } from '@/types/learner-onboarding';
import {
  formatReportDate,
  summariseByInstitution,
  summariseByReason,
  type AwaitingPaymentReport
} from './awaiting-payment-report';

const INR_FMT = '"₹"#,##0;[Red]-"₹"#,##0';
const PCT_FMT = '0.0"%"';

const COLOR = {
  title: 'FF0369A1', // sky-700
  header: 'FF075985', // sky-800
  headerText: 'FFFFFFFF',
  total: 'FFE0F2FE', // sky-100
  border: 'FFCBD5E1',
  zebra: 'FFF8FAFC',
  gate: 'FFFEE2E2', // red-100 — stage ① blockers
  stuck: 'FFFEF3C7' // amber-100 — rule met, status not moved
} as const;

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin: ExcelJS.Border = { style: 'thin', color: { argb: COLOR.border } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function styleHeaderRow(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(COLOR.header);
    cell.font = { bold: true, color: { argb: COLOR.headerText } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = box;
  }
  row.height = 30;
}

function boxRow(row: ExcelJS.Row, cols: number, argb?: string, bold = false) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.border = box;
    if (argb) cell.fill = fill(argb);
    if (bold) cell.font = { bold: true };
  }
}

function titleBlock(ws: ExcelJS.Worksheet, report: AwaitingPaymentReport, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = 'Learner Onboarding — Awaiting Payment (Blocked At) Report';
  t.font = { bold: true, size: 14, color: { argb: COLOR.headerText } };
  t.fill = fill(COLOR.title);
  t.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 24;

  const lines = [
    `Generated: ${new Date(report.generatedAt).toLocaleString('en-IN')}`,
    `Threshold to ${report.target_label}: ${report.threshold_pct ?? '—'}% ${report.threshold_basis_label}`,
    `Filters: ${report.filters.length ? report.filters.join(' · ') : 'None (all Account + Reserved learners you can see)'}`,
    `Learners: ${report.rows.length}`
  ];
  lines.forEach((text, i) => {
    ws.mergeCells(2 + i, 1, 2 + i, span);
    ws.getCell(2 + i, 1).value = text;
    ws.getCell(2 + i, 1).font = { italic: i === 2, color: { argb: 'FF475569' } };
  });
  return 2 + lines.length + 1; // next free row, after one blank
}

function buildSummarySheet(wb: ExcelJS.Workbook, report: AwaitingPaymentReport) {
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  const reasonCols = BLOCKED_REASONS.length;
  const span = Math.max(4, reasonCols + 4);
  let r = titleBlock(ws, report, span);

  // Reason × status
  ws.getCell(r, 1).value = 'Why learners are not moving (Account → Reserved → Admitted)';
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  r++;
  const head = ws.getRow(r);
  head.values = ['Blocked at', 'Account', 'Reserved', 'Total'];
  styleHeaderRow(head, 4);
  r++;
  const byReason = summariseByReason(report.rows);
  for (const line of byReason) {
    const row = ws.getRow(r);
    row.values = [line.label, line.account, line.reserved, line.total];
    const tint =
      line.reason === 'gate_no_bills' || line.reason === 'gate_unpaid'
        ? COLOR.gate
        : line.reason.endsWith('_stuck')
          ? COLOR.stuck
          : undefined;
    boxRow(row, 4, tint);
    r++;
  }
  const tot = ws.getRow(r);
  tot.values = [
    'Total',
    byReason.reduce((s, l) => s + l.account, 0),
    byReason.reduce((s, l) => s + l.reserved, 0),
    byReason.reduce((s, l) => s + l.total, 0)
  ];
  boxRow(tot, 4, COLOR.total, true);
  r += 2;

  // Institution × reason
  ws.getCell(r, 1).value = 'By institution';
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  r++;
  const instHead = ws.getRow(r);
  instHead.values = [
    'Institution',
    ...BLOCKED_REASONS.map((k) => BLOCKED_REASON_LABELS[k]),
    'Total',
    'Total billed',
    'Total paid'
  ];
  styleHeaderRow(instHead, reasonCols + 4);
  r++;
  for (const line of summariseByInstitution(report.rows)) {
    const row = ws.getRow(r);
    row.values = [
      line.institution,
      ...BLOCKED_REASONS.map((k) => line.byReason[k] || null),
      line.total,
      line.total_billed,
      line.total_paid
    ];
    boxRow(row, reasonCols + 4);
    row.getCell(reasonCols + 3).numFmt = INR_FMT;
    row.getCell(reasonCols + 4).numFmt = INR_FMT;
    r++;
  }

  ws.getColumn(1).width = 44;
  for (let c = 2; c <= reasonCols + 4; c++) ws.getColumn(c).width = 16;
}

const DETAIL_COLUMNS: { header: string; key: string; width: number; fmt?: string }[] = [
  { header: 'S.No', key: 'sno', width: 6 },
  { header: 'Learner Name', key: 'name', width: 26 },
  { header: 'Roll No', key: 'roll_number', width: 14 },
  { header: 'Institution', key: 'institution', width: 34 },
  { header: 'Program', key: 'program', width: 26 },
  { header: 'Admission Year', key: 'admission_year', width: 16 },
  { header: 'Status', key: 'status', width: 11 },
  { header: 'Blocked At', key: 'blocked_label', width: 24 },
  { header: 'Reason Detail', key: 'reason_detail', width: 50 },
  { header: 'App Fee Billed', key: 'app_billed', width: 13, fmt: INR_FMT },
  { header: 'App Fee Paid', key: 'app_paid', width: 13, fmt: INR_FMT },
  { header: 'Univ Fee Billed', key: 'uni_billed', width: 13, fmt: INR_FMT },
  { header: 'Univ Fee Paid', key: 'uni_paid', width: 13, fmt: INR_FMT },
  { header: 'Total Billed', key: 'total_billed', width: 14, fmt: INR_FMT },
  { header: 'Total Paid', key: 'total_paid', width: 14, fmt: INR_FMT },
  { header: '% of Total Billed Paid', key: 'pct_billed', width: 12, fmt: PCT_FMT },
  { header: 'Rule Basis Billed', key: 'fees_due', width: 14, fmt: INR_FMT },
  { header: 'Rule Basis Paid', key: 'fees_paid', width: 14, fmt: INR_FMT },
  { header: 'Rule Basis Balance', key: 'fees_balance', width: 14, fmt: INR_FMT },
  { header: '% Paid (Rule Basis)', key: 'pct_due', width: 11, fmt: PCT_FMT },
  { header: 'Need to Admit (30% floor)', key: 'need_to_admit', width: 14, fmt: INR_FMT },
  { header: 'Need to Admit (program rule)', key: 'rule_to_admit', width: 14, fmt: INR_FMT },
  { header: 'Next Instalment', key: 'next_due', width: 14 },
  { header: 'Next Instalment Amount', key: 'next_due_amount', width: 14, fmt: INR_FMT },
  { header: 'Profile Fields', key: 'profile', width: 10 }
];

function buildDetailSheet(wb: ExcelJS.Workbook, report: AwaitingPaymentReport) {
  const ws = wb.addWorksheet('Details', { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
  ws.columns = DETAIL_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
  styleHeaderRow(ws.getRow(1), DETAIL_COLUMNS.length);

  report.rows.forEach((r, i) => {
    const row = ws.addRow({
      sno: i + 1,
      ...r,
      next_due: r.next_due_date ? formatReportDate(r.next_due_date) : '',
      profile: `${r.profile_filled}/4`
    });
    DETAIL_COLUMNS.forEach((c, idx) => {
      const cell = row.getCell(idx + 1);
      cell.border = box;
      if (c.fmt) cell.numFmt = c.fmt;
      if (c.key === 'reason_detail') cell.alignment = { wrapText: true, vertical: 'top' };
    });
    if (i % 2 === 1) boxRow(row, DETAIL_COLUMNS.length, COLOR.zebra);
    const tint =
      r.blocked_reason === 'gate_no_bills' || r.blocked_reason === 'gate_unpaid'
        ? COLOR.gate
        : r.blocked_reason.endsWith('_stuck')
          ? COLOR.stuck
          : undefined;
    if (tint) row.getCell(8).fill = fill(tint);
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DETAIL_COLUMNS.length } };
}

export async function buildAwaitingPaymentWorkbook(report: AwaitingPaymentReport): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MyJKKN';
  wb.created = new Date(report.generatedAt);
  buildSummarySheet(wb, report);
  buildDetailSheet(wb, report);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
