// exceljs writer for the Collection report export. Takes the pure models from
// collection-daywise.ts and paints them: coloured section headers, a colour
// strip per payment mode, ₹ number formats, frozen headers and autofilter on
// the detail sheets. Client-only (dynamic-imported from the tab).
import ExcelJS from 'exceljs';
import {
  DAYWISE_EXPORT_HEADER,
  DETAIL_MODE_COL,
  DETAIL_MONEY_COLS,
  type ExportRow,
  type SummaryModel,
  type SummaryTable,
  type WorkbookModel
} from './collection-daywise';

const INR_FMT = '"₹"#,##0;[Red]-"₹"#,##0';
const PCT_FMT = '0.0"%"';

// Brand-ish palette: header teal, then a distinct pastel per payment mode so
// the same colour identifies a mode on every sheet.
const COLOR = {
  title: 'FF0F766E', // teal-700
  header: 'FF115E59', // teal-800
  headerText: 'FFFFFFFF',
  tileFill: 'FFE0F2F1',
  tileNet: 'FFDCFCE7',
  dayTotal: 'FFD1FAE5', // emerald-100
  grandTotal: 'FF99F6E4', // teal-200
  subtotal: 'FFF1F5F9',
  border: 'FFCBD5E1',
  zebra: 'FFF8FAFC'
} as const;

const MODE_FILL: Record<string, string> = {
  cash: 'FFD9F99D', // lime-200
  online: 'FFBFDBFE', // blue-200
  dd: 'FFFED7AA', // orange-200
  cheque: 'FFE5E7EB', // gray-200
  bank_transfer: 'FFE9D5FF', // purple-200
  combined: 'FFFDE68A', // amber-200
  '': 'FFF3F4F6'
};

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
  row.height = 22;
}

// ── Summary sheet ────────────────────────────────────────────────────────────

function writeSummary(wb: ExcelJS.Workbook, model: SummaryModel) {
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 14 }, ...Array.from({ length: 14 }, () => ({ width: 16 }))];

  // Title block
  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = model.title;
  title.font = { bold: true, size: 18, color: { argb: COLOR.headerText } };
  title.fill = fill(COLOR.title);
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:H2');
  const sub = ws.getCell('A2');
  sub.value = `Period: ${model.rangeLabel}    ·    Generated: ${model.generatedAt}`;
  sub.font = { italic: true, color: { argb: 'FF475569' } };
  sub.alignment = { indent: 1 };

  // Single-college export: name the college under the title so a printed
  // sheet says whose money it is. Multi-institution exports carry the
  // institution-wise tables instead.
  let r = 4;
  if (model.institutionLabel) {
    ws.mergeCells('A3:H3');
    const inst = ws.getCell('A3');
    inst.value = `Institution: ${model.institutionLabel}`;
    inst.font = { bold: true, size: 12, color: { argb: COLOR.title } };
    inst.alignment = { indent: 1 };
    ws.getRow(3).height = 20;
    r = 5;
  }

  // Tiles: one per column, label above value.
  model.tiles.forEach((t, i) => {
    const col = 1 + i;
    const label = ws.getRow(r).getCell(col);
    const value = ws.getRow(r + 1).getCell(col);
    label.value = t.label;
    label.font = { size: 9, bold: true, color: { argb: 'FF334155' } };
    label.alignment = { horizontal: 'center' };
    label.fill = fill(t.label === 'Net Collected' ? COLOR.tileNet : COLOR.tileFill);
    label.border = box;
    value.value = t.value;
    value.font = { size: 14, bold: true, color: { argb: t.label === 'Refunds' && Number(t.value) > 0 ? 'FFB91C1C' : 'FF0F172A' } };
    value.alignment = { horizontal: 'center' };
    value.fill = fill(t.label === 'Net Collected' ? COLOR.tileNet : COLOR.tileFill);
    value.border = box;
    if (t.money) value.numFmt = INR_FMT;
  });
  ws.getRow(r + 1).height = 26;
  r += 3;

  for (const table of model.tables) {
    r = writeSummaryTable(ws, table, r) + 2;
  }
}

function writeSummaryTable(ws: ExcelJS.Worksheet, t: SummaryTable, startRow: number): number {
  const cols = t.header.length;
  ws.mergeCells(startRow, 1, startRow, cols);
  const title = ws.getCell(startRow, 1);
  title.value = t.title;
  title.font = { bold: true, size: 12, color: { argb: COLOR.title } };
  title.alignment = { indent: 0 };
  ws.getRow(startRow).height = 20;

  const header = ws.getRow(startRow + 1);
  t.header.forEach((h, i) => { header.getCell(i + 1).value = h; });
  styleHeaderRow(header, cols);
  // Mode columns get their strip colour on the header so the legend is the
  // header itself.
  if (t.modeCols) {
    for (const [idx, mode] of Object.entries(t.modeCols)) {
      const cell = header.getCell(Number(idx) + 1);
      cell.fill = fill(MODE_FILL[mode] ?? MODE_FILL['']);
      cell.font = { bold: true, color: { argb: 'FF0F172A' } };
    }
  }

  let r = startRow + 2;
  t.rows.forEach((cells, ri) => {
    const isTotal = t.hasTotal && ri === t.rows.length - 1;
    const row = ws.getRow(r);
    cells.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.border = box;
      if (t.moneyCols.includes(ci)) cell.numFmt = INR_FMT;
      if (t.header[ci] === 'Share %') cell.numFmt = PCT_FMT;
      if (typeof v === 'number') cell.alignment = { horizontal: 'right' };
      if (isTotal) {
        cell.font = { bold: true };
        cell.fill = fill(COLOR.grandTotal);
      } else if (ri % 2 === 1) {
        cell.fill = fill(COLOR.zebra);
      }
    });
    // Mode-breakdown table: colour the mode name cell with its strip.
    if (t.header[0] === 'Payment Mode' && !isTotal) {
      const label = String(cells[0]);
      const key = Object.entries(MODE_FILL).find(([k]) => k !== '' && labelOf(k) === label)?.[0]
        ?? (label === 'Not Recorded' ? '' : undefined);
      if (key !== undefined) row.getCell(1).fill = fill(MODE_FILL[key]);
    }
    r += 1;
  });
  return r - 1;
}

function labelOf(mode: string): string {
  return ({
    cash: 'Cash', online: 'Online', dd: 'DD', cheque: 'Cheque',
    bank_transfer: 'Bank Transfer', combined: 'Combined'
  } as Record<string, string>)[mode] ?? mode;
}

// ── Detail sheets ────────────────────────────────────────────────────────────

const DETAIL_WIDTHS = [12, 18, 28, 14, 12, 34, 30, 12, 28, 14, 24, 16, 16, 20, 12, 14, 26, 14, 20, 30, 15, 12, 15];

function writeDetail(wb: ExcelJS.Workbook, name: string, rows: ExportRow[], mode: string | null) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = DETAIL_WIDTHS.map((width) => ({ width }));
  const cols = DAYWISE_EXPORT_HEADER.length;

  // Tab colour = mode strip, so the sheet tabs double as a legend.
  if (mode !== null) ws.properties.tabColor = { argb: MODE_FILL[mode] ?? MODE_FILL[''] };

  let dataIdx = 0;
  rows.forEach((er, i) => {
    const row = ws.getRow(i + 1);
    if (er.kind === 'spacer') return;
    er.cells.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v as ExcelJS.CellValue;
    });

    if (er.kind === 'header') {
      styleHeaderRow(row, cols);
      return;
    }

    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.border = box;
      const ci = c - 1;
      if (ci === DETAIL_MONEY_COLS.gross || ci === DETAIL_MONEY_COLS.refunds || ci === DETAIL_MONEY_COLS.net) {
        cell.numFmt = INR_FMT;
        cell.alignment = { horizontal: 'right' };
      }
    }

    switch (er.kind) {
      case 'data': {
        if (dataIdx % 2 === 1) {
          for (let c = 1; c <= cols; c++) row.getCell(c).fill = fill(COLOR.zebra);
        }
        // Payment Mode cell carries the strip colour.
        row.getCell(DETAIL_MODE_COL + 1).fill = fill(MODE_FILL[er.mode ?? ''] ?? MODE_FILL['']);
        row.getCell(DETAIL_MODE_COL + 1).alignment = { horizontal: 'center' };
        dataIdx += 1;
        break;
      }
      case 'subtotal': {
        for (let c = 1; c <= cols; c++) {
          row.getCell(c).fill = fill(COLOR.subtotal);
          row.getCell(c).font = { italic: true };
        }
        row.getCell(3).fill = fill(MODE_FILL[er.mode ?? ''] ?? MODE_FILL['']);
        row.getCell(3).font = { italic: true, bold: true };
        break;
      }
      case 'day-total': {
        for (let c = 1; c <= cols; c++) {
          row.getCell(c).fill = fill(COLOR.dayTotal);
          row.getCell(c).font = { bold: true };
        }
        dataIdx = 0;
        break;
      }
      case 'grand-total': {
        for (let c = 1; c <= cols; c++) {
          row.getCell(c).fill = fill(COLOR.grandTotal);
          row.getCell(c).font = { bold: true, size: 12 };
        }
        row.height = 22;
        break;
      }
    }
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function writeCollectionWorkbook(model: WorkbookModel): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MyJKKN';
  wb.created = new Date();
  writeSummary(wb, model.summary);
  for (const sheet of model.detailSheets) {
    writeDetail(wb, sheet.name, sheet.rows, sheet.mode);
  }
  return wb.xlsx.writeBuffer() as unknown as Promise<ArrayBuffer>;
}

/** Browser download helper. */
export function downloadWorkbook(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
