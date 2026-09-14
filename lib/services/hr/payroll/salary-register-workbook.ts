/**
 * Salary Register workbook (2026-08-30)
 *
 * Reproduces the layout of the register HR already maintains by hand
 * ("6. Salary Register EDITED (1).xlsx"), so an exported file drops into the
 * same downstream process without anyone re-learning a new shape:
 *
 *   Sheet "Salary Register" — institution name merged across row 1, the month
 *     title merged across row 2, headers on row 3, data from row 4.
 *   Sheet "BANK STATEMENT"  — S.No / Name / Account / Net Pay, closing with a
 *     TOTAL row carrying a live SUM, exactly as the hand-kept file does.
 *   Sheet "By Paying Institution" — what each institution owes for the people
 *     working here. Only when more than one institution pays somebody on it.
 *   Sheet "Excluded Staff"  — only when somebody was left out, naming who and why.
 *
 * THREE DELIBERATE DEPARTURES FROM THE HAND-KEPT FILE:
 *   - "Paid By" and "Remarks" are appended after Net Pay. The register is
 *     grouped by WORK location, so a row's payer may be another institution
 *     entirely — at Main Office every one of the 121 is.
 *   - Allowance, EPF, ESI and TDS were added inside the money block in
 *     2026-09, so columns past Basic Pay no longer carry the letters the
 *     hand-kept file gives them. Nothing reads this sheet by letter: the number
 *     formats, the title merge and the tests all derive their positions from
 *     REGISTER_HEADERS, which is what makes an insertion safe.
 *   - The original leaves the remarks header blank, which reads as an empty
 *     column until you find text in it eight rows down.
 *   - Account numbers are written as TEXT, not numbers. Excel drops leading
 *     zeros from numeric cells, and a bank account that loses its leading zero
 *     is a failed transfer.
 *
 * ExcelJS, not the xlsx reader: this file needs merges, widths and a formula.
 */

import ExcelJS from 'exceljs';
import type { HRSalaryRegisterLine, HRSalaryRegisterRun } from '@/types/hr-payroll';
import { EXCLUSION_LABELS, monthLabel } from './salary-register-service';

/** Shows 17700 as "17,700" and 1363.64 as "1,363.64", matching the sample. */
const MONEY_FMT = '#,##0.##';
/** Shows 22 as "22" and 1.5 as "1.5" — half-days are real. */
const DAYS_FMT = '0.##';

const REGISTER_HEADERS = [
  'S.No', 'Employee Id', 'Employee Name', 'Designation', 'Department',
  'Date Of Join', 'Bank Account Number', 'Business Working Days',
  'Paid Leave Days', 'Unpaid Leave Days', 'On Duty Days', 'Worked Days',
  'Paid Days', 'Actual Gross Salary', 'Basic Pay', 'Allowance', 'Unpaid Leave',
  'EPF', 'ESI', 'TDS',
  'Total Earnings', 'Total Deductions', 'Net Pay', 'Paid By', 'Remarks',
];

/**
 * Widths lifted from the hand-kept file so the export looks familiar.
 *
 * POSITIONAL — index N is the width of REGISTER_HEADERS[N]. A column inserted
 * above without a width inserted here shifts every remaining column's width by
 * one, which reads as a formatting glitch rather than the off-by-one it is.
 */
const REGISTER_WIDTHS = [7, 10.6, 21.1, 12.7, 21.9, 14.4, 15.9, 12.7, 12, 13, 11, 11, 10, 15, 11, 11, 12, 10, 10, 10, 13, 14, 11, 28, 34];

/** DD/MM/YYYY — the format the hand-kept register uses. */
function formatDMY(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function titleRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  lastCol: string,
  text: string,
  size: number,
): void {
  ws.mergeCells(`A${rowNumber}:${lastCol}${rowNumber}`);
  const cell = ws.getCell(`A${rowNumber}`);
  cell.value = text;
  cell.font = { bold: true, size };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  // Room around the titles. At the default 15 they sat flush against the header
  // band, so the sheet opened with three lines of bold text stacked together.
  ws.getRow(rowNumber).height = size >= 14 ? 26 : 22;
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  // Taller than the default 15: these headers wrap to two lines ("Business
  // Working Days"), and at default height the second line was clipped.
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9E9E9E' } },
      left: { style: 'thin', color: { argb: 'FF9E9E9E' } },
      bottom: { style: 'medium', color: { argb: 'FF9E9E9E' } },
      right: { style: 'thin', color: { argb: 'FF9E9E9E' } },
    };
  });
}

/** Hairline grey — visible as a grid, quiet enough not to fight the figures. */
const GRID: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFD4D4D4' } };

/**
 * Rule every data cell, band alternate rows, and give the sheet room to breathe.
 *
 * WHY THIS EXISTS. Only the header row was ruled, so the body was a borderless
 * field of numbers 25 columns wide — following one person across it meant
 * tracking a straight line by eye, which on a finance document is where
 * transcription errors come from. The banding does the same job as a ruler laid
 * under the row.
 *
 * Cosmetic only, and deliberately so: it sets borders, fills, heights and print
 * options, and touches no cell VALUE. The workbook's shape is a contract with
 * the process downstream of it (see the file header) and the tests pin exact
 * cells, so nothing here may move a figure.
 */
function finishSheet(
  ws: ExcelJS.Worksheet,
  opts: {
    headerRow: number;
    firstDataRow: number;
    /** Inclusive. Pass a number BELOW firstDataRow for an empty sheet. */
    lastRow: number;
    lastCol: number;
    /** Rows that close the sheet — ruled above, and never banded. */
    totalRow?: number;
  },
): void {
  const { headerRow, firstDataRow, lastRow, lastCol, totalRow } = opts;

  for (let r = firstDataRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    // 18 against a default of 15. Enough that a ruled grid reads as a table
    // rather than as lines pressed together.
    row.height = 18;
    const banded = (r - firstDataRow) % 2 === 1 && r !== totalRow;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.border = { top: GRID, left: GRID, bottom: GRID, right: GRID };
      if (banded) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
      }
      // Set only when the cell has no alignment of its own — the money, day and
      // wrap-text alignments are applied by the callers and must survive.
      if (!cell.alignment) cell.alignment = { vertical: 'middle' };
      else if (cell.alignment.vertical === undefined) {
        cell.alignment = { ...cell.alignment, vertical: 'middle' };
      }
    }
  }

  if (totalRow) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getRow(totalRow).getCell(c);
      cell.border = {
        ...cell.border,
        top: { style: 'medium', color: { argb: 'FF9E9E9E' } },
      };
    }
  }

  // Sort and filter without selecting the range by hand — the first thing
  // anyone does with a 25-column register is narrow it.
  if (lastRow >= firstDataRow) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: totalRow ? totalRow - 1 : lastRow, column: lastCol },
    };
  }

  /*
   * PRINT SETUP. A 25-column register printed at default settings spills across
   * four pages with no headers on three of them. Landscape, scaled to one page
   * wide, with the title and header rows repeated on every sheet.
   */
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2,
    },
    printTitlesRow: `1:${headerRow}`,
  } as ExcelJS.PageSetup;
}

export interface SalaryRegisterWorkbookInput {
  run: HRSalaryRegisterRun;
  lines: HRSalaryRegisterLine[];
  institutionName: string;
}

/**
 * Build the workbook. Returns a Buffer ready to stream from a route handler.
 *
 * Only INCLUDED lines reach the two money sheets — an excluded person has no
 * net pay, and a zero row on a bank statement is an instruction to transfer
 * nothing, which is not the same as "we did not pay them". They appear on the
 * third sheet instead, with the reason.
 */
export async function buildSalaryRegisterWorkbook(
  input: SalaryRegisterWorkbookInput,
): Promise<Buffer> {
  const { run, lines, institutionName } = input;
  const included = lines.filter((l) => l.is_included);
  const excluded = lines.filter((l) => !l.is_included);

  const heading = institutionName.toUpperCase();
  const subheading = `SALARY REGISTER FOR THE MONTH OF ${monthLabel(run.period_year, run.period_month).toUpperCase()}`;

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // ── Sheet 1: Salary Register ─────────────────────────────────────────────
  const reg = wb.addWorksheet('Salary Register');
  REGISTER_WIDTHS.forEach((w, i) => { reg.getColumn(i + 1).width = w; });

  // Merged from A through Net Pay, leaving Paid By and Remarks outside — as in
  // the hand-kept file, where the remarks column sits apart from the titled body.
  //
  // DERIVED, not the literal 'S' it used to be. That letter was correct only
  // while Net Pay happened to be the 19th column; after the EPF/ESI/TDS and
  // allowance insertions it pointed at Total Earnings, so the title silently
  // stopped three columns short of the table it titles.
  const titleLastCol = reg.getColumn(REGISTER_HEADERS.indexOf('Net Pay') + 1).letter;
  titleRow(reg, 1, titleLastCol, heading, 14);
  titleRow(reg, 2, titleLastCol, subheading, 12);

  reg.addRow(REGISTER_HEADERS);
  styleHeaderRow(reg.getRow(3));

  // Serial numbers restart at 1 across the INCLUDED rows so the register reads
  // 1..n. line.serial_no counts the whole roster, exclusions included, and
  // would leave visible gaps.
  included.forEach((l, i) => {
    reg.addRow([
      i + 1,
      l.employee_code ?? '',
      l.staff_name,
      l.designation ?? '',
      l.department_name ?? '',
      formatDMY(l.date_of_joining),
      l.bank_account_number ?? '',
      l.business_working_days,
      l.paid_leave_days,
      l.unpaid_leave_days,
      l.on_duty_days,
      l.worked_days,
      l.paid_days,
      l.actual_gross,
      l.basic_pay,
      // Blank rather than 0.00 when nothing was deducted — the hand-kept file
      // leaves these empty, and a column of zeroes hides the rows that matter.
      l.allowance || null,
      l.unpaid_leave_deduction || null,
      // Same blank-not-zero treatment: only the people who actually contribute
      // should carry a figure, so the rows that matter stand out. On a 433-strong
      // roster only 9 salaries even reach the lowest TDS band.
      l.epf_deduction || null,
      l.esi_deduction || null,
      l.tds_deduction || null,
      l.total_earnings,
      l.total_deductions,
      l.net_pay,
      // Blank rather than a placeholder when unrecorded — 105 active staff have
      // no payer, and a column of "Unknown" reads as a system fault rather than
      // a data gap someone can go and fill.
      l.paid_by_name ?? '',
      l.remarks ?? '',
    ]);
  });

  const firstDataRow = 4;
  const lastDataRow = firstDataRow + included.length - 1;

  /**
   * Formatting runs are DERIVED from the header array, not hardcoded.
   *
   * They used to be literals (`c = 14; c <= 19`, then cells 20 and 21), which
   * meant inserting the EPF and ESI columns left the last two money columns
   * unformatted and put the wrap-text alignment on Net Pay and Paid By instead
   * of Paid By and Remarks — a quiet cosmetic wrong-answer in a finance
   * document. ExcelJS columns are 1-based, hence the +1.
   */
  const colOf = (header: string): number => REGISTER_HEADERS.indexOf(header) + 1;
  const firstDayCol = colOf('Business Working Days');
  const lastDayCol = colOf('Paid Days');
  const firstMoneyCol = colOf('Actual Gross Salary');
  const lastMoneyCol = colOf('Net Pay');

  if (included.length > 0) {
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      const row = reg.getRow(r);
      for (let c = firstDayCol; c <= lastDayCol; c++) {
        row.getCell(c).numFmt = DAYS_FMT;
        row.getCell(c).alignment = { horizontal: 'center' };
      }
      for (let c = firstMoneyCol; c <= lastMoneyCol; c++) {
        row.getCell(c).numFmt = MONEY_FMT;
      }
      // Text, so a leading zero survives.
      row.getCell(colOf('Bank Account Number')).alignment = { horizontal: 'left' };
      row.getCell(colOf('Paid By')).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(colOf('Remarks')).alignment = { wrapText: true, vertical: 'top' };
    }
  }

  reg.views = [{ state: 'frozen', xSplit: 3, ySplit: 3 }];
  finishSheet(reg, {
    headerRow: 3,
    firstDataRow,
    lastRow: lastDataRow,
    lastCol: REGISTER_HEADERS.length,
  });

  // ── Sheet 2: BANK STATEMENT ──────────────────────────────────────────────
  const bank = wb.addWorksheet('BANK STATEMENT');
  bank.getColumn(1).width = 7;
  bank.getColumn(2).width = 29.7;
  bank.getColumn(3).width = 22;
  bank.getColumn(4).width = 14;

  titleRow(bank, 1, 'D', heading, 14);
  titleRow(bank, 2, 'D', subheading, 12);

  bank.addRow(['S.No', 'Employee Name', 'Bank Account Number', 'Net Pay']);
  styleHeaderRow(bank.getRow(3));

  included.forEach((l, i) => {
    const row = bank.addRow([i + 1, l.staff_name, l.bank_account_number ?? '', l.net_pay]);
    row.getCell(3).alignment = { horizontal: 'left' };
    row.getCell(4).numFmt = MONEY_FMT;
  });

  if (included.length > 0) {
    const totalRowNumber = firstDataRow + included.length;
    bank.mergeCells(`A${totalRowNumber}:C${totalRowNumber}`);
    const labelCell = bank.getCell(`A${totalRowNumber}`);
    labelCell.value = 'TOTAL';
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: 'right' };

    // A live formula, not a computed constant — the hand-kept file carries
    // =SUM(D4:D18), and finance re-checks the total after editing a row.
    const totalCell = bank.getCell(`D${totalRowNumber}`);
    totalCell.value = { formula: `SUM(D${firstDataRow}:D${totalRowNumber - 1})` };
    totalCell.font = { bold: true };
    totalCell.numFmt = MONEY_FMT;
  }

  bank.views = [{ state: 'frozen', ySplit: 3 }];
  finishSheet(bank, {
    headerRow: 3,
    firstDataRow,
    lastRow: firstDataRow + included.length,
    lastCol: 4,
    totalRow: included.length > 0 ? firstDataRow + included.length : undefined,
  });

  // ── Sheet 3: By Paying Institution ───────────────────────────────────────
  // THE POINT OF GROUPING BY WORK LOCATION. One Main Office register lists all
  // 121 people who work there; this sheet splits its cost across the five
  // institutions that actually pay them, which is the question that could not be
  // asked while the roster itself was split five ways.
  //
  // Omitted when a single institution pays everybody — for eleven of thirteen
  // institutions that is the case, and a one-row breakdown of a number already
  // on the register is noise.
  const byPayer = new Map<string, { name: string; count: number; gross: number; deductions: number; net: number }>();
  for (const l of included) {
    // Null groups under its own heading rather than being dropped: an unrecorded
    // payer is a number somebody still has to account for.
    const key = l.paid_by_organization_id ?? '__none__';
    const entry = byPayer.get(key) ?? {
      name: l.paid_by_name ?? 'Not recorded',
      count: 0, gross: 0, deductions: 0, net: 0,
    };
    entry.count += 1;
    entry.gross += l.total_earnings;
    entry.deductions += l.total_deductions + l.adjustment_amount;
    entry.net += l.net_pay;
    byPayer.set(key, entry);
  }

  if (byPayer.size > 1) {
    const split = wb.addWorksheet('By Paying Institution');
    split.getColumn(1).width = 7;
    split.getColumn(2).width = 42;
    split.getColumn(3).width = 12;
    split.getColumn(4).width = 16;
    split.getColumn(5).width = 16;
    split.getColumn(6).width = 16;

    titleRow(split, 1, 'F', heading, 14);
    titleRow(split, 2, 'F', `WHAT EACH INSTITUTION OWES FOR ${monthLabel(run.period_year, run.period_month).toUpperCase()}`, 12);

    split.addRow(['S.No', 'Paying Institution', 'Staff', 'Total Earnings', 'Total Deductions', 'Net Payable']);
    styleHeaderRow(split.getRow(3));

    // Largest liability first — that is the order a finance conversation takes.
    const rows = Array.from(byPayer.values()).sort((a, b) => b.net - a.net);
    rows.forEach((r, i) => {
      const row = split.addRow([i + 1, r.name, r.count, r.gross, r.deductions, r.net]);
      for (let c = 4; c <= 6; c++) row.getCell(c).numFmt = MONEY_FMT;
      row.getCell(3).alignment = { horizontal: 'center' };
    });

    const totalRow = firstDataRow + rows.length;
    split.mergeCells(`A${totalRow}:B${totalRow}`);
    const label = split.getCell(`A${totalRow}`);
    label.value = 'TOTAL';
    label.font = { bold: true };
    label.alignment = { horizontal: 'right' };

    // Live formulas, so the sheet re-totals if finance edits a figure — and so
    // the net here can be eyeballed against the BANK STATEMENT total.
    for (const col of ['C', 'D', 'E', 'F']) {
      const cell = split.getCell(`${col}${totalRow}`);
      cell.value = { formula: `SUM(${col}${firstDataRow}:${col}${totalRow - 1})` };
      cell.font = { bold: true };
      if (col !== 'C') cell.numFmt = MONEY_FMT;
    }

    split.views = [{ state: 'frozen', ySplit: 3 }];
    finishSheet(split, {
      headerRow: 3,
      firstDataRow,
      lastRow: totalRow,
      lastCol: 6,
      totalRow,
    });
  }

  // ── Sheet 4: Excluded Staff (only when there are any) ─────────────────────
  if (excluded.length > 0) {
    const ex = wb.addWorksheet('Excluded Staff');
    ex.getColumn(1).width = 7;
    ex.getColumn(2).width = 14;
    ex.getColumn(3).width = 28;
    ex.getColumn(4).width = 18;
    ex.getColumn(5).width = 24;
    ex.getColumn(6).width = 42;

    titleRow(ex, 1, 'F', heading, 14);
    titleRow(
      ex, 2, 'F',
      `STAFF EXCLUDED FROM THE ${monthLabel(run.period_year, run.period_month).toUpperCase()} REGISTER`,
      12,
    );

    ex.addRow(['S.No', 'Employee Id', 'Employee Name', 'Designation', 'Department', 'Reason not paid']);
    styleHeaderRow(ex.getRow(3));

    excluded.forEach((l, i) => {
      const row = ex.addRow([
        i + 1,
        l.employee_code ?? '',
        l.staff_name,
        l.designation ?? '',
        l.department_name ?? '',
        l.exclusion_reason ? EXCLUSION_LABELS[l.exclusion_reason] : 'Unknown',
      ]);
      // The reason is a sentence, not a code, and it is the column anyone opens
      // this sheet for.
      row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };
    });

    ex.views = [{ state: 'frozen', ySplit: 3 }];
    finishSheet(ex, {
      headerRow: 3,
      firstDataRow,
      lastRow: firstDataRow + excluded.length - 1,
      lastCol: 6,
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** `Salary Register - JKKN College of Pharmacy - June 2026.xlsx` */
export function salaryRegisterFilename(
  institutionName: string,
  year: number,
  month: number,
): string {
  const safe = institutionName.replace(/[\\/:*?"<>|]/g, '-').trim();
  return `Salary Register - ${safe} - ${monthLabel(year, month)}.xlsx`;
}
