/**
 * Salary Register — Bank Letter and Chairperson Approval documents (2026-10-07)
 *
 * Reproduces the two letters HR typed by hand every month, per paying college,
 * once for teaching and once for non-teaching staff:
 *
 *   Bank Letter         ("Bank Details on JKKNCP.docx") — page 1 is the covering
 *     letter to the college's bank enclosing one cheque for the month's net pay;
 *     page 2 onward is the salary list (S.No / Name / Account Number / Amount,
 *     closing with a TOTAL) the bank credits from.
 *   Chairperson Approval ("JKKNCOP Madam Approval List 2024.docx") — the
 *     requisition for the Trust Office to sanction and release that amount.
 *
 * BOTH ARE PRINTED ON THE COLLEGE'S PRE-PRINTED LETTERHEAD, so each opens with
 * the same blank band the hand-kept files leave (seven empty lines under a 1"
 * margin) instead of printing a heading of its own.
 *
 * Every figure comes from salary-register-document-model.ts — the module the
 * download dialog previews from — so what HR previews is what the letter says.
 * The college constants (ref code, bank, branch, account) come from
 * hr_payroll_document_settings.
 *
 * Bookman Old Style throughout, as in the originals. The rupee sign is set in
 * Arial: Bookman predates U+20B9 and renders it as an empty box (the originals
 * used a "Rupee Foradian" font for the same reason).
 *
 * Server-side: Packer.toBuffer, streamed by the documents route.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type {
  HRPayrollDocumentSettings,
  HRSalaryRegisterLine,
  PayrollDocumentKind,
  StaffCategoryKey,
} from '@/types/hr-payroll';
import {
  LIST_HEADER_ROW_TWIPS,
  LIST_ROW_TWIPS,
  STAFF_CATEGORY_LABEL,
  formatINR,
  formatLetterDate,
  hasBankAccount,
  linesForCategory,
  monthName,
  payrollDocumentSummary,
} from './salary-register-document-model';

const FONT = 'Bookman Old Style';
const RUPEE_FONT = 'Arial';
/** Half-points: 24 = 12pt (the letters' body), 26 = 13pt (the amount paragraph). */
const SIZE = 24;
const SIZE_BODY = 26;
const SIZE_LIST = 22;

const PAGE = { width: 11906, height: 16838 }; // A4 in twips

/** Bank letter margins, from the original. */
const BANK_MARGIN = { top: 1440, right: 746, bottom: 1440, left: 1134 };
const BANK_TEXT_WIDTH = PAGE.width - BANK_MARGIN.left - BANK_MARGIN.right;

/** Approval margins: the original's sides, with the letterhead band on top. */
const APPROVAL_MARGIN = { top: 1440, right: 707, bottom: 851, left: 851 };
const APPROVAL_TEXT_WIDTH = PAGE.width - APPROVAL_MARGIN.left - APPROVAL_MARGIN.right;

/** Blank lines under the top margin, where the letterhead is printed. */
const LETTERHEAD_LINES = 7;

const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE };

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

interface RunOpts {
  bold?: boolean;
  size?: number;
}

/**
 * Text as runs, with every ₹ split into its own Arial run (see header). The
 * rest of the text keeps Bookman, so the letter reads in one face.
 */
function runs(text: string, opts: RunOpts = {}): TextRun[] {
  const size = opts.size ?? SIZE;
  return text.split(/(₹)/).filter(Boolean).map((part) =>
    new TextRun({
      text: part,
      bold: opts.bold,
      size,
      font: part === '₹' ? RUPEE_FONT : FONT,
    }),
  );
}

function para(
  text: string,
  opts: RunOpts & {
    align?: Align;
    after?: number;
    firstLine?: number;
    left?: number;
    hanging?: number;
  } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 0 },
    indent:
      opts.firstLine || opts.left || opts.hanging
        ? { firstLine: opts.firstLine, left: opts.left, hanging: opts.hanging }
        : undefined,
    children: runs(text, opts),
  });
}

function blank(count = 1, size = SIZE): Paragraph[] {
  return Array.from({ length: count }, () =>
    new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: '', size, font: FONT })] }),
  );
}

/** "LEFT<tab>RIGHT" with the right part flush to the text edge. */
function splitLine(left: string, right: string, width: number, opts: RunOpts = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 0 },
    tabStops: [{ type: TabStopType.RIGHT, position: width }],
    children: [
      ...runs(left, opts),
      new TextRun({ children: [new Tab()], size: opts.size ?? SIZE, font: FONT }),
      ...runs(right, opts),
    ],
  });
}

function cell(
  text: string,
  width: number,
  opts: RunOpts & { align?: Align; span?: number } = {},
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: opts.span && opts.span > 1 ? opts.span : undefined,
    verticalAlign: VerticalAlign.CENTER,
    borders: BORDERS,
    margins: { top: 40, bottom: 40, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { after: 0 },
        children: runs(text, { bold: opts.bold, size: opts.size }),
      }),
    ],
  });
}

/**
 * "Staff" for teaching, "Non-Teaching Staff" otherwise — the wording the
 * hand-kept letters use ("…Salary to Staff account" / "…to Non-Teaching Staff
 * account"). The reference code (…NT) and the particulars row carry the rest.
 */
function staffWord(category: StaffCategoryKey): string {
  return category === 'teaching' ? 'Staff' : 'Non-Teaching Staff';
}

export interface PayrollDocumentInput {
  kind: PayrollDocumentKind;
  category: StaffCategoryKey;
  organisationName: string;
  periodYear: number;
  periodMonth: number;
  /** YYYY-MM-DD. */
  letterDate: string;
  /** Left as a blank to write in by hand when absent. */
  chequeNumber?: string | null;
  settings: HRPayrollDocumentSettings;
  /** The whole run's lines; the builder takes the paid lines of `category`. */
  lines: HRSalaryRegisterLine[];
}

// ── Bank letter ────────────────────────────────────────────────────────────

/** Salary list columns; they sum to BANK_TEXT_WIDTH. */
const LIST_COLS = [900, 4300, 2826, 2000];

function salaryListTable(lines: HRSalaryRegisterLine[], total: number): Table {
  const [cSno, cName, cAcct, cAmt] = LIST_COLS;
  const atLeast = (value: number) => ({ value, rule: HeightRule.ATLEAST });

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    height: atLeast(LIST_HEADER_ROW_TWIPS),
    children: [
      cell('S.No', cSno, { bold: true, align: AlignmentType.CENTER, size: SIZE_LIST }),
      cell('Name of the Staff', cName, { bold: true, align: AlignmentType.CENTER, size: SIZE_LIST }),
      cell('Account Number', cAcct, { bold: true, align: AlignmentType.CENTER, size: SIZE_LIST }),
      cell('Amount Rs.', cAmt, { bold: true, align: AlignmentType.CENTER, size: SIZE_LIST }),
    ],
  });

  const body = lines.map((l, i) =>
    new TableRow({
      cantSplit: true,
      height: atLeast(LIST_ROW_TWIPS),
      children: [
        cell(`${i + 1}.`, cSno, { align: AlignmentType.CENTER, size: SIZE_LIST }),
        cell(l.staff_name, cName, { size: SIZE_LIST }),
        // Never blank: an empty account cell on an instruction to a bank reads
        // as an oversight. Saying so makes it a thing to resolve before posting.
        cell(hasBankAccount(l) ? (l.bank_account_number as string).trim() : '(not recorded)', cAcct, {
          align: AlignmentType.CENTER,
          size: SIZE_LIST,
        }),
        cell(formatINR(l.net_pay, { forceDecimals: true }), cAmt, { align: AlignmentType.RIGHT, size: SIZE_LIST }),
      ],
    }),
  );

  const totalRow = new TableRow({
    cantSplit: true,
    height: atLeast(LIST_ROW_TWIPS),
    children: [
      cell('TOTAL', cSno + cName + cAcct, { bold: true, align: AlignmentType.RIGHT, span: 3, size: SIZE_LIST }),
      cell(formatINR(total, { forceDecimals: true }), cAmt, { bold: true, align: AlignmentType.RIGHT, size: SIZE_LIST }),
    ],
  });

  return new Table({
    width: { size: BANK_TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: LIST_COLS,
    layout: TableLayoutType.FIXED,
    rows: [header, ...body, totalRow],
  });
}

function bankLetterChildren(input: PayrollDocumentInput): (Paragraph | Table)[] {
  const { category, organisationName, periodYear, periodMonth, settings } = input;
  const summary = payrollDocumentSummary({
    lines: input.lines,
    category,
    settings,
    periodYear,
    periodMonth,
  });
  const paid = linesForCategory(input.lines, category);
  const date = formatLetterDate(input.letterDate);
  const amount = `₹${summary.amountFigures}/-`;
  const cheque = input.chequeNumber?.trim() || '________________';
  const pages = summary.salaryListPages;

  return [
    ...blank(LETTERHEAD_LINES),
    splitLine(`Ref: ${summary.reference}`, `Date: ${date}`, BANK_TEXT_WIDTH, { bold: true }),
    ...blank(2),
    para('To,'),
    ...blank(),
    para(`${settings.addressee_title.trim()},`),
    para(settings.bank_name.trim()),
    para(`${settings.bank_branch.trim()}.`),
    ...blank(),
    para('Sir,'),
    ...blank(),
    para(
      `Sub: ${organisationName} – Payment of ${monthName(periodMonth)} Month Salary to ${staffWord(category)} account – Reg.`,
      { bold: true, left: 720, hanging: 540 },
    ),
    ...blank(2),
    para(
      `We enclose herewith a cheque of ${amount} (${summary.amountWords}) with a request to credit the amount to our Staff Members Savings Bank Account with your Branch, as per the List enclosed herewith.`,
      { bold: true, size: SIZE_BODY, align: AlignmentType.JUSTIFIED, firstLine: 720 },
    ),
    ...blank(),
    para('Thanking you,', { align: AlignmentType.CENTER }),
    ...blank(),
    para('Yours faithfully,', { align: AlignmentType.RIGHT }),
    ...blank(4),
    para(`Encl.: 1. ${settings.bank_name.trim().toUpperCase()},`),
    para(`A/C No: ${settings.college_account_number.trim()}   Cheque No. ${cheque}`, { left: 1100 }),
    para(`Dated: ${date} for ${amount}`, { bold: true, left: 1100 }),
    para(`2. Salary list – ${pages} ${pages === 1 ? 'Page' : 'Pages'}.`, { left: 720 }),

    // ── Enclosure: the salary list, from page 2 ──
    new Paragraph({
      pageBreakBefore: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: runs(organisationName.toUpperCase(), { bold: true }),
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: runs(
        `SALARY LIST – ${STAFF_CATEGORY_LABEL[category].toUpperCase()} STAFF – ${monthName(periodMonth).toUpperCase()} ${periodYear}`,
        { bold: true, size: SIZE_LIST },
      ),
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: runs(`Ref: ${summary.reference}`, { size: SIZE_LIST }),
    }),
    salaryListTable(paid, summary.amount),
    // Word requires a paragraph after a closing table. Kept tiny so a table
    // that exactly fills its page cannot spill a blank page after it.
    new Paragraph({ spacing: { after: 0, line: 20 }, children: [new TextRun({ text: '', size: 2 })] }),
  ];
}

// ── Chairperson approval ───────────────────────────────────────────────────

/** Particulars table columns, from the original; they sum to < APPROVAL_TEXT_WIDTH. */
const APPROVAL_COLS = [1133, 5266, 3559];

function approvalChildren(input: PayrollDocumentInput): (Paragraph | Table)[] {
  const { category, organisationName, periodYear, periodMonth, settings } = input;
  const summary = payrollDocumentSummary({
    lines: input.lines,
    category,
    settings,
    periodYear,
    periodMonth,
  });
  const date = formatLetterDate(input.letterDate);
  const amount = `₹${summary.amountFigures}/-`;
  const monthUpper = `${monthName(periodMonth).toUpperCase()} ${periodYear}`;
  const [cSno, cPart, cAmt] = APPROVAL_COLS;

  const table = new Table({
    width: { size: cSno + cPart + cAmt, type: WidthType.DXA },
    columnWidths: APPROVAL_COLS,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    rows: [
      new TableRow({
        height: { value: 520, rule: HeightRule.ATLEAST },
        children: [
          cell('S. No.', cSno, { bold: true, align: AlignmentType.CENTER }),
          cell('Particulars', cPart, { bold: true, align: AlignmentType.CENTER }),
          cell('Amount (Rs.)', cAmt, { bold: true, align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        height: { value: 520, rule: HeightRule.ATLEAST },
        children: [
          cell('1.', cSno, { align: AlignmentType.CENTER }),
          cell(`${STAFF_CATEGORY_LABEL[category]} Staff Salary`, cPart),
          cell(summary.amountFigures, cAmt, { align: AlignmentType.RIGHT }),
        ],
      }),
      new TableRow({
        height: { value: 520, rule: HeightRule.ATLEAST },
        children: [
          cell('Total (Rs.)', cSno + cPart, { bold: true, align: AlignmentType.RIGHT, span: 2 }),
          cell(summary.amountFigures, cAmt, { bold: true, align: AlignmentType.RIGHT }),
        ],
      }),
    ],
  });

  return [
    ...blank(LETTERHEAD_LINES),
    splitLine(summary.reference, `Date: ${date}`, APPROVAL_TEXT_WIDTH, { bold: true }),
    ...blank(),
    para(`SUBMITTED TO THE ${settings.approver_title.trim().toUpperCase()} FOR APPROVAL`, {
      bold: true,
      align: AlignmentType.CENTER,
    }),
    ...blank(),
    para(`${settings.approval_salutation.trim()},`, { bold: true }),
    ...blank(),
    para(
      `Sub: ${organisationName} ${staffWord(category)} Salary for the Month of ${monthName(periodMonth)} ${periodYear} – Reg.`,
      { bold: true, left: 720, hanging: 540 },
    ),
    ...blank(),
    para(
      `I am submitting this requisition for the sanction and release of a sum of ${amount} (${summary.amountWords}) towards the salary for the month of ${monthUpper}, to be released by the Trust Office.`,
      { bold: true, size: SIZE_BODY, align: AlignmentType.JUSTIFIED, firstLine: 1440 },
    ),
    ...blank(),
    para('The particulars are given below:', { size: SIZE_BODY }),
    ...blank(),
    para(`Amount: ${amount}`, { bold: true, size: SIZE_BODY }),
    para(`In words: ${summary.amountWords}.`, { bold: true, size: SIZE_BODY }),
    ...blank(),
    table,
    ...blank(5),
    splitLine(
      `      ${settings.submitter_title.trim().toUpperCase()}`,
      settings.approver_title.trim().toUpperCase(),
      APPROVAL_TEXT_WIDTH - 400,
      { bold: true },
    ),
  ];
}

// ── Entry point ────────────────────────────────────────────────────────────

/**
 * Builds one document for one category. Throws when the category has nobody
 * paid — a letter enclosing a cheque for ₹0 is not a document anyone should
 * sign; the route answers 422 before it gets here.
 */
export async function buildPayrollDocument(input: PayrollDocumentInput): Promise<Buffer> {
  if (linesForCategory(input.lines, input.category).length === 0) {
    throw new Error(`No ${STAFF_CATEGORY_LABEL[input.category].toLowerCase()} staff are paid on this register.`);
  }

  const isBank = input.kind === 'bank_letter';
  const doc = new Document({
    creator: 'MyJKKN',
    title: `${isBank ? 'Bank Letter' : 'Chairperson Approval'} – ${input.organisationName}`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: PAGE,
            margin: isBank ? BANK_MARGIN : APPROVAL_MARGIN,
          },
        },
        children: isBank ? bankLetterChildren(input) : approvalChildren(input),
      },
    ],
  });

  return Packer.toBuffer(doc);
}
