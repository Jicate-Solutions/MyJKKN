/**
 * Parse the "Salary data import" workbook.
 * Created: 2026-08-21.
 *
 * THE FILE HAS TWO HEADER ROWS. Row 1 carries machine names
 * (`User_Defined_Emp_Id`), row 2 repeats them as human labels
 * ("Employee Id"), and the data starts at row 3. Reading row 2 as data would
 * import an employee called "Employee Name" with a salary of "Basic Salary";
 * treating row 2 as the header would break every column lookup.
 *
 * THE SHEET IS PICKED BY NAME, never by index. The workbook also carries a
 * "Worksheet" tab holding the dropdown validation lists (Yes/No, No overtime /
 * Grade / Employee, Percentage / Amount), and a file saved with that tab active
 * would otherwise parse three rows of vocabulary as three employees.
 *
 * Pure and synchronous: no database, no clock. The validator decides what the
 * rows MEAN; this only decides what they SAY.
 */

import * as XLSX from 'xlsx';

/** Preferred tab. Falls back to the first sheet that has the id header. */
const DATA_SHEET: string = 'Salary data import';

/**
 * Row 1 machine names, in the order the template ships them.
 *
 * EXPORTED so the bulk-edit template writes the same header this parser reads.
 * A template built from its own private copy of this list drifts the moment a
 * column is added here, and the failure is silent: the parser just stops finding
 * the column and defaults the field.
 */
export const SALARY_TEMPLATE_COLUMNS = [
  'User_Defined_Emp_Id',
  'Employee_Name',
  'Salary_Structure',
  'Basic_Salary',
  'Gross_Annual_Salary',
  'Overtime_Level',
  'Overtime_Amount',
  // Each amount sits beside the flag that authorises it. Placement is for the
  // human filling the sheet in — the parser reads every column by NAME, so the
  // order here never affects what is imported.
  'Eligible_For_PF',
  'EPF_Amount',
  'Eligible_For_ESI',
  'ESI_Amount',
  'Exempt_EDLI',
  'Eligible_For_Insurance',
  'Eligible_For_Gratuity',
  'Eligible_For_ETF',
  // User data, so it round-trips. TDS is deliberately absent: it is derived
  // from the bands, and a column in a bulk-EDIT sheet that silently refuses to
  // import is worse than no column at all.
  'Allowance_Amount',
  'Allowance_Label',
  'Effective_Date',
] as const;

/**
 * Row 2, the human labels. Cosmetic to the parser with ONE exception: the id
 * cell must read "Employee Id", because that is how start-of-data detection
 * tells a label row from an employee whose code happens to sit in row 2.
 */
export const SALARY_TEMPLATE_LABELS: Record<(typeof SALARY_TEMPLATE_COLUMNS)[number], string> = {
  User_Defined_Emp_Id: 'Employee Id',
  Employee_Name: 'Employee Name',
  Salary_Structure: 'Salary Structure',
  Basic_Salary: 'Basic Salary',
  Gross_Annual_Salary: 'Gross Annual Salary',
  Overtime_Level: 'Overtime Level',
  Overtime_Amount: 'Overtime Amount',
  Eligible_For_PF: 'Eligible For EPF',
  EPF_Amount: 'EPF Amount',
  Eligible_For_ESI: 'Eligible For ESI',
  ESI_Amount: 'ESI Amount',
  Exempt_EDLI: 'Exempt EDLI',
  Eligible_For_Insurance: 'Eligible For Insurance',
  Eligible_For_Gratuity: 'Eligible For Gratuity',
  Eligible_For_ETF: 'Eligible For ETF',
  Allowance_Amount: 'Allowance Amount',
  Allowance_Label: 'Allowance For',
  Effective_Date: 'Effective Date',
};

export interface ParsedSalaryRow {
  /** 1-based row number in the sheet, so a message can point at it. */
  row_number: number;
  employee_code: string;
  employee_name: string | null;
  salary_structure: string | null;
  /** The sheet's Basic_Salary — the WHOLE monthly pay, not a basic component. */
  monthly_gross: number | null;
  /** As printed. Cross-checked against monthly_gross * 12 by the validator. */
  annual_gross_in_file: number | null;
  overtime_level: string | null;
  overtime_amount: number | null;
  eligible_for_pf: boolean;
  /** Blank cell → null, so "left empty" stays distinguishable from a typed 0. */
  epf_amount: number | null;
  eligible_for_esi: boolean;
  esi_amount: number | null;
  exempt_edli: boolean;
  eligible_for_insurance: boolean;
  eligible_for_gratuity: boolean;
  eligible_for_etf: boolean;
  allowance_amount: number | null;
  allowance_label: string | null;
  /** 'yyyy-MM-dd', or null when the cell is blank — which it is on every row today. */
  effective_from: string | null;
}

export interface ParsedSalarySheet {
  sheet_name: string;
  rows: ParsedSalaryRow[];
  warnings: string[];
}

/** 'Yes'/'No'/'Y'/'TRUE'/1 → boolean. Anything unrecognised is false. */
function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

/** Tolerates "26,500", " 26500 " and a real number cell. */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[,\s₹]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * The template says dd/mm/yyyy. Excel may still hand back a serial number if
 * someone retyped the cell as a date, so both are accepted — and dd/mm is NEVER
 * read as mm/dd, which would silently move 03/04 to April 3rd.
 */
function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial: days since 1899-12-30 in the 1900 system.
    const ms = Math.round((v - 25569) * 86_400_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return iso ? s : null;
}

export function parseSalarySheet(data: Uint8Array): ParsedSalarySheet {
  const warnings: string[] = [];
  const wb = XLSX.read(data, { type: 'array', raw: false, cellDates: false });

  let sheetName = wb.SheetNames.find((n) => n === DATA_SHEET);
  if (!sheetName) {
    // Fall back to the first sheet whose row 1 actually looks like the template.
    sheetName = wb.SheetNames.find((n) => {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], {
        header: 1, blankrows: false, defval: null,
      });
      return (aoa[0] ?? []).some((c) => String(c ?? '').trim() === 'User_Defined_Emp_Id');
    });
    if (sheetName) {
      warnings.push(`Sheet "${DATA_SHEET}" was not found; read "${sheetName}" instead.`);
    }
  }

  if (!sheetName) {
    return {
      sheet_name: '',
      rows: [],
      warnings: [
        `No sheet has a "User_Defined_Emp_Id" header. Expected a tab named "${DATA_SHEET}".`,
      ],
    };
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: null,
  });

  const header = (aoa[0] ?? []).map((c) => String(c ?? '').trim());
  const idx = new Map<string, number>();
  for (const name of SALARY_TEMPLATE_COLUMNS) {
    const at = header.indexOf(name);
    if (at >= 0) idx.set(name, at);
  }

  const missing = SALARY_TEMPLATE_COLUMNS.filter((c) => !idx.has(c));
  if (missing.length > 0) {
    warnings.push(`Missing column(s): ${missing.join(', ')}. Those fields default.`);
  }

  const cell = (r: unknown[], name: string): unknown => {
    const at = idx.get(name);
    return at === undefined ? null : r[at];
  };

  const rows: ParsedSalaryRow[] = [];
  // Row 1 is the machine header and row 2 the human labels, so data starts at
  // index 2. A file whose row 2 has been deleted still parses: the label row is
  // detected by its id cell reading "Employee Id" rather than a code.
  let start = 1;
  const second = aoa[1];
  if (second && String(cell(second, 'User_Defined_Emp_Id') ?? '').trim().toLowerCase() === 'employee id') {
    start = 2;
  }

  for (let i = start; i < aoa.length; i += 1) {
    const r = aoa[i];
    if (!r) continue;
    const code = String(cell(r, 'User_Defined_Emp_Id') ?? '').trim();
    if (code === '') continue;

    rows.push({
      row_number: i + 1,
      employee_code: code,
      employee_name: String(cell(r, 'Employee_Name') ?? '').trim() || null,
      salary_structure: String(cell(r, 'Salary_Structure') ?? '').trim() || null,
      monthly_gross: toNumber(cell(r, 'Basic_Salary')),
      annual_gross_in_file: toNumber(cell(r, 'Gross_Annual_Salary')),
      overtime_level: String(cell(r, 'Overtime_Level') ?? '').trim() || null,
      overtime_amount: toNumber(cell(r, 'Overtime_Amount')) ?? 0,
      eligible_for_pf: toBool(cell(r, 'Eligible_For_PF')),
      epf_amount: toNumber(cell(r, 'EPF_Amount')),
      eligible_for_esi: toBool(cell(r, 'Eligible_For_ESI')),
      esi_amount: toNumber(cell(r, 'ESI_Amount')),
      exempt_edli: toBool(cell(r, 'Exempt_EDLI')),
      eligible_for_insurance: toBool(cell(r, 'Eligible_For_Insurance')),
      eligible_for_gratuity: toBool(cell(r, 'Eligible_For_Gratuity')),
      eligible_for_etf: toBool(cell(r, 'Eligible_For_ETF')),
      allowance_amount: toNumber(cell(r, 'Allowance_Amount')),
      allowance_label: String(cell(r, 'Allowance_Label') ?? '').trim() || null,
      effective_from: toISODate(cell(r, 'Effective_Date')),
    });
  }

  return { sheet_name: sheetName, rows, warnings };
}
