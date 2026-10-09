/**
 * Salary Register — Teaching / Non-Teaching split and the figures the payroll
 * documents print (2026-10-07).
 *
 * PURE: no Supabase, no `docx`. The run page imports this for its tabs and the
 * download dialog's preview, and the server-side document builder
 * (salary-register-documents.ts) imports it for the same numbers — so the
 * amount a person previews is, by construction, the amount the letter prints.
 *
 * THE SPLIT KEYS ON `line.is_teaching`, snapshotted from
 * employment_categories at generation (Teaching, Facilitator and Principal are
 * teaching; every other HR category is not). Only INCLUDED lines reach a
 * category: an excluded person has no net pay, and a zero row on a bank list is
 * an instruction to transfer nothing.
 */

import type {
  HRPayrollDocumentSettings,
  HRSalaryRegisterLine,
  PayrollDocumentKind,
  StaffCategoryKey,
} from '@/types/hr-payroll';

export const STAFF_CATEGORY_KEYS: readonly StaffCategoryKey[] = ['teaching', 'non_teaching'];

export const STAFF_CATEGORY_LABEL: Record<StaffCategoryKey, string> = {
  teaching: 'Teaching',
  non_teaching: 'Non-Teaching',
};

export const PAYROLL_DOCUMENT_LABEL: Record<PayrollDocumentKind, string> = {
  bank_letter: 'Bank Letter',
  chairperson_approval: 'Chairperson Approval',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function categoryOf(line: Pick<HRSalaryRegisterLine, 'is_teaching'>): StaffCategoryKey {
  return line.is_teaching ? 'teaching' : 'non_teaching';
}

/** The paid lines of one category, in register order. */
export function linesForCategory(
  lines: HRSalaryRegisterLine[],
  key: StaffCategoryKey,
): HRSalaryRegisterLine[] {
  return lines.filter((l) => l.is_included && categoryOf(l) === key);
}

/** Every line (paid or excluded) of one category — the tab's register view. */
export function allLinesForCategory(
  lines: HRSalaryRegisterLine[],
  key: StaffCategoryKey,
): HRSalaryRegisterLine[] {
  return lines.filter((l) => categoryOf(l) === key);
}

export function hasBankAccount(line: Pick<HRSalaryRegisterLine, 'bank_account_number'>): boolean {
  return Boolean(line.bank_account_number && line.bank_account_number.trim());
}

/**
 * Sums in PAISE. Adding the floats directly yields 0.30000000000000004 and a
 * total that visibly fails to match the rows beneath it on a finance document.
 */
function sumMoney(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round((v || 0) * 100), 0) / 100;
}

export interface RegisterFigures {
  staff: number;
  paid: number;
  excluded: number;
  gross: number;
  /** total_deductions + adjustment — the same definition the run's own total uses. */
  deductions: number;
  net: number;
  missingAccounts: number;
}

/**
 * The figures card for a set of lines. Mirrors recomputeRunTotals in
 * salary-register-service.ts exactly, so the All-staff tab reproduces the
 * run's frozen totals and Teaching + Non-Teaching add up to it.
 */
export function registerFigures(lines: HRSalaryRegisterLine[]): RegisterFigures {
  const paid = lines.filter((l) => l.is_included);
  return {
    staff: lines.length,
    paid: paid.length,
    excluded: lines.length - paid.length,
    gross: sumMoney(paid.map((l) => l.total_earnings)),
    deductions: sumMoney(paid.flatMap((l) => [l.total_deductions, l.adjustment_amount])),
    net: sumMoney(paid.map((l) => l.net_pay)),
    missingAccounts: paid.filter((l) => !hasBankAccount(l)).length,
  };
}

/**
 * Indian digit grouping: 1365649 -> "13,65,649". Paise are printed only when
 * the amount has them (or `forceDecimals`), as the hand-kept documents do.
 */
export function formatINR(amount: number, opts: { forceDecimals?: boolean } = {}): string {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;

  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`
    : last3;

  const sign = amount < 0 ? '-' : '';
  const decimals = paise > 0 || opts.forceDecimals ? `.${String(paise).padStart(2, '0')}` : '';
  return `${sign}${grouped}${decimals}`;
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0..99 -> "Sixty-Five". */
function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const unit = n % 10;
  return unit ? `${TENS[Math.floor(n / 10)]}-${ONES[unit]}` : TENS[Math.floor(n / 10)];
}

/** 0..999 -> "Six Hundred and Forty-Nine". */
function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return belowHundred(rest);
  return rest ? `${ONES[hundreds]} Hundred and ${belowHundred(rest)}` : `${ONES[hundreds]} Hundred`;
}

function wholeRupeesInWords(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  // Crores above 99 recurse ("One Hundred and Fifty Crores").
  if (crore) parts.push(`${wholeRupeesInWords(crore)} ${crore === 1 ? 'Crore' : 'Crores'}`);
  if (lakh) parts.push(`${belowHundred(lakh)} ${lakh === 1 ? 'Lakh' : 'Lakhs'}`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/**
 * Indian-system amount in words, the way the hand-kept letters write it:
 * 1365649 -> "Thirteen Lakhs Sixty-Five Thousand Six Hundred and Forty-Nine".
 * The caller wraps it ("Rupees … only"). Paise, if a total ever carries them,
 * follow as "and Fifty Paise".
 */
export function amountInWordsIndian(amount: number): string {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const words = wholeRupeesInWords(rupees);
  return paise ? `${words} and ${belowHundred(paise)} Paise` : words;
}

/** "Rupees Thirteen Lakhs … only" — the parenthetical both documents print. */
export function rupeesInWords(amount: number): string {
  return `Rupees ${amountInWordsIndian(amount)} only`;
}

/**
 * "JKKNCOP/ AUGUST SALARY/ 2026" — or "JKKNCOPNT/ …" for non-teaching. The
 * month is the SALARY month, not the letter's month: August salary goes out
 * under a letter dated in September.
 */
export function documentReference(
  settings: Pick<HRPayrollDocumentSettings, 'reference_code' | 'non_teaching_suffix'>,
  key: StaffCategoryKey,
  year: number,
  month: number,
): string {
  const code = `${settings.reference_code.trim()}${key === 'non_teaching' ? settings.non_teaching_suffix.trim() : ''}`;
  return `${code}/ ${monthName(month).toUpperCase()} SALARY/ ${year}`;
}

/** "2026-09-09" -> "09.09.2026", the date format both letters use. */
export function formatLetterDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Today in Asia/Kolkata as YYYY-MM-DD — the default letter date. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/**
 * SALARY LIST PAGINATION.
 *
 * The bank letter's enclosure line says "Salary list – N Pages", so N must be
 * known when the letter is written. Word paginates at render time, so the list
 * is laid out with a fixed geometry the builder ALSO uses: every row is at least
 * LIST_ROW_TWIPS tall, and a name longer than LIST_NAME_CHARS_PER_LINE is
 * assumed to wrap. The estimate errs toward one row of headroom per page so a
 * table that nearly fills a page does not push its TOTAL row onto an unexpected
 * extra one.
 */
export const LIST_PAGE_BODY_TWIPS = 16838 - 1440 - 1440; // A4 minus 1" top/bottom
export const LIST_HEADING_TWIPS = 1100; // title + subtitle above the table
export const LIST_HEADER_ROW_TWIPS = 480;
export const LIST_ROW_TWIPS = 400;
export const LIST_NAME_CHARS_PER_LINE = 30;

export function salaryListPageCount(names: string[]): number {
  // Rows to place: every staff row (some wrap to 2+ lines) plus the TOTAL row.
  const rowUnits = names.map((n) => Math.max(1, Math.ceil((n || '').length / LIST_NAME_CHARS_PER_LINE)));
  rowUnits.push(1);

  const firstCapacity =
    Math.floor((LIST_PAGE_BODY_TWIPS - LIST_HEADING_TWIPS - LIST_HEADER_ROW_TWIPS) / LIST_ROW_TWIPS) - 1;
  const nextCapacity =
    Math.floor((LIST_PAGE_BODY_TWIPS - LIST_HEADER_ROW_TWIPS) / LIST_ROW_TWIPS) - 1;

  let pages = 1;
  let room = firstCapacity;
  for (const units of rowUnits) {
    if (units > room) {
      pages++;
      room = nextCapacity;
    }
    room -= units;
  }
  return pages;
}

/** What the download dialog previews and the documents print. */
export interface PayrollDocumentSummary {
  category: StaffCategoryKey;
  reference: string;
  staffCount: number;
  amount: number;
  amountFigures: string;
  amountWords: string;
  missingAccounts: number;
  salaryListPages: number;
}

export function payrollDocumentSummary(input: {
  lines: HRSalaryRegisterLine[];
  category: StaffCategoryKey;
  settings: Pick<HRPayrollDocumentSettings, 'reference_code' | 'non_teaching_suffix'>;
  periodYear: number;
  periodMonth: number;
}): PayrollDocumentSummary {
  const paid = linesForCategory(input.lines, input.category);
  const amount = sumMoney(paid.map((l) => l.net_pay));
  return {
    category: input.category,
    reference: documentReference(input.settings, input.category, input.periodYear, input.periodMonth),
    staffCount: paid.length,
    amount,
    amountFigures: formatINR(amount),
    amountWords: rupeesInWords(amount),
    missingAccounts: paid.filter((l) => !hasBankAccount(l)).length,
    salaryListPages: salaryListPageCount(paid.map((l) => l.staff_name)),
  };
}

/** `Bank Letter - Teaching - JKKN College of Pharmacy - August 2026.docx` */
export function payrollDocumentFilename(
  kind: PayrollDocumentKind,
  category: StaffCategoryKey,
  organisationName: string,
  year: number,
  month: number,
): string {
  const safe = organisationName.replace(/[\\/:*?"<>|]/g, '-').trim();
  return `${PAYROLL_DOCUMENT_LABEL[kind]} - ${STAFF_CATEGORY_LABEL[category]} - ${safe} - ${monthName(month)} ${year}.docx`;
}
