'use client';

/**
 * Build the bulk-edit workbook: the roster, pre-filled, in the exact shape the
 * importer reads back.
 *
 * THIS IS THE OTHER HALF OF THE IMPORT. Setting 754 salaries one dialog at a
 * time is not a workflow, and hand-building a workbook that satisfies a
 * two-header-row parser is worse. Download the roster, type the amounts in
 * Excel, upload it through Import salaries.
 *
 * THE HEADER COMES FROM THE PARSER'S OWN CONSTANTS — SALARY_TEMPLATE_COLUMNS and
 * SALARY_TEMPLATE_LABELS. A private copy here would drift the first time a
 * column is added to the parser, and the failure is silent: the import would
 * simply stop finding that column and default the field.
 *
 * ROW 1 machine names, ROW 2 human labels, data from row 3 — and row 2's id cell
 * must read "Employee Id", because that string is how start-of-data detection
 * distinguishes a label row from an employee.
 *
 * Generated in the browser from rows already on screen, so the file matches what
 * the user filtered or selected. No round trip, and no second definition of
 * "which staff".
 */

import * as XLSX from 'xlsx';

import {
  SALARY_TEMPLATE_COLUMNS,
  SALARY_TEMPLATE_LABELS,
} from '@/lib/hr/payroll/parse-salary-sheet';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

/** The importer looks for this tab by name before falling back to a header scan. */
const SHEET_NAME = 'Salary data import';

const YES_NO = (v: boolean): string => (v ? 'Yes' : 'No');

/** The template's date format is dd/mm/yyyy, and the parser never reads it as mm/dd. */
function toDDMMYYYY(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

function cellsFor(r: StaffSalaryDirectoryRow): Record<string, string | number> {
  return {
    User_Defined_Emp_Id: r.staff_code ?? '',
    Employee_Name: r.person_name,
    Salary_Structure: r.salary_structure ?? 'Monthly',
    // Blank, not 0, when unset. A zero would import as an invalid amount and be
    // reported as an error on every unfilled row; blank reads as "not answered".
    Basic_Salary: r.monthly_gross ?? '',
    Gross_Annual_Salary: r.annual_gross ?? '',
    Overtime_Level: r.overtime_level ?? 'No overtime',
    Overtime_Amount: r.overtime_amount ?? 0,
    Eligible_For_PF: YES_NO(r.eligible_for_pf),
    // Blank rather than 0 when the flag is off — an amount beside a "No" is a
    // figure nobody decided, and the importer would discard it anyway.
    EPF_Amount: r.eligible_for_pf ? (r.epf_amount ?? 0) : '',
    Eligible_For_ESI: YES_NO(r.eligible_for_esi),
    ESI_Amount: r.eligible_for_esi ? (r.esi_amount ?? 0) : '',
    Exempt_EDLI: YES_NO(r.exempt_edli),
    Eligible_For_Insurance: YES_NO(r.eligible_for_insurance),
    Eligible_For_Gratuity: YES_NO(r.eligible_for_gratuity),
    Eligible_For_ETF: YES_NO(r.eligible_for_etf),
    // Blank rather than 0 when there is no allowance, matching every other
    // optional money cell in this sheet.
    Allowance_Amount: r.allowance_amount ? r.allowance_amount : '',
    Allowance_Label: r.allowance_label ?? '',
    Effective_Date: toDDMMYYYY(r.effective_from),
  };
}

export interface SalaryTemplateResult {
  fileName: string;
  rowCount: number;
  /** Rows written with no employee code — the importer cannot match these. */
  missingCode: number;
}

/**
 * Builds the workbook bytes. Pure — no DOM, no clock — so a test can feed the
 * output straight back into parseSalarySheet() and prove the round trip, which
 * is the only thing that actually guarantees the export and the import agree.
 */
export function buildSalaryTemplateWorkbook(
  rows: StaffSalaryDirectoryRow[]
): { bytes: Uint8Array; missingCode: number } {
  const header = [...SALARY_TEMPLATE_COLUMNS];
  const labels = header.map((c) => SALARY_TEMPLATE_LABELS[c]);

  const aoa: Array<Array<string | number>> = [header as unknown as string[], labels];
  let missingCode = 0;

  for (const r of rows) {
    const cells = cellsFor(r);
    if (!r.staff_code) missingCode += 1;
    aoa.push(header.map((c) => cells[c] ?? ''));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Column widths derived from the header array, never hardcoded — a new column
  // would otherwise silently inherit the width meant for its neighbour.
  ws['!cols'] = header.map((c) => ({ wch: Math.max(14, SALARY_TEMPLATE_LABELS[c].length + 4) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return { bytes: new Uint8Array(out), missingCode };
}

/**
 * Writes the workbook and triggers the download.
 *
 * `today` is passed in rather than read from a clock so the caller owns the
 * filename's date and this stays testable.
 */
export function downloadSalaryTemplate(
  rows: StaffSalaryDirectoryRow[],
  today: string
): SalaryTemplateResult {
  const { bytes, missingCode } = buildSalaryTemplateWorkbook(rows);

  const fileName = `salary-bulk-edit-${today}.xlsx`;
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { fileName, rowCount: rows.length, missingCode };
}
