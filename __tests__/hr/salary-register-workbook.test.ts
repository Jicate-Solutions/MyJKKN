/**
 * Salary register workbook — layout contract.
 *
 * The exported file has to drop into the process HR already runs, so its shape
 * is a contract, not an implementation detail: the merged title rows, the
 * column order, the TOTAL formula on the bank sheet. These assertions are taken
 * from the register HR keeps by hand ("6. Salary Register EDITED (1).xlsx"),
 * and the three data rows mirror real people from it.
 *
 * Run: npx vitest run __tests__/hr/salary-register-workbook.test.ts
 */

import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';

import {
  buildSalaryRegisterWorkbook,
  salaryRegisterFilename,
} from '@/lib/services/hr/payroll/salary-register-workbook';
import type { HRSalaryRegisterLine, HRSalaryRegisterRun } from '@/types/hr-payroll';

const run: HRSalaryRegisterRun = {
  id: 'r1',
  hr_organization_id: 'o1',
  institution_id: 'i1',
  period_year: 2026,
  period_month: 6,
  working_days_basis: 22,
  source_attendance_period_ids: ['p1'],
  staff_total: 4,
  included_count: 3,
  excluded_count: 1,
  total_gross: 74700,
  total_deductions: 1363.64,
  total_net: 72654,
  generated_at: '2026-08-30T00:00:00Z',
  generated_by: null,
  superseded_at: null,
  superseded_by: null,
  notes: null,
  created_at: '2026-08-30T00:00:00Z',
  updated_at: '2026-08-30T00:00:00Z',
};

function line(o: Partial<HRSalaryRegisterLine> & { id: string; staff_name: string }): HRSalaryRegisterLine {
  return {
    run_id: 'r1',
    staff_id: o.id,
    serial_no: 1,
    employee_code: null,
    designation: null,
    department_name: null,
    date_of_joining: null,
    bank_account_number: null,
    paid_by_organization_id: null,
    paid_by_name: null,
    work_institution_id: null,
    work_institution_name: null,
    business_working_days: 0,
    casual_leave_days: 0,
    comp_off_days: 0,
    other_paid_leave_days: 0,
    paid_leave_days: 0,
    unpaid_leave_days: 0,
    on_duty_days: 0,
    worked_days: 0,
    paid_days: 0,
    actual_gross: 0,
    basic_pay: 0,
    unpaid_leave_deduction: 0,
    total_earnings: 0,
    total_deductions: 0,
    adjustment_amount: 0,
    net_pay: 0,
    remarks: null,
    is_included: true,
    exclusion_reason: null,
    attendance_period_id: 'p1',
    created_at: '',
    updated_at: '',
    ...o,
  } as HRSalaryRegisterLine;
}

const lines: HRSalaryRegisterLine[] = [
  line({
    id: '1', serial_no: 1, employee_code: 'AHS001', staff_name: 'GIRIDHARAN P',
    designation: 'Lecturer', department_name: 'Department of Allied (UG)',
    date_of_joining: '2024-06-18',
    // Deliberately leading-zeroed: the reason accounts are written as text.
    bank_account_number: '0007312984398',
    business_working_days: 22, paid_leave_days: 1, unpaid_leave_days: 0,
    on_duty_days: 1, worked_days: 20, paid_days: 22,
    actual_gross: 17700, basic_pay: 17700, unpaid_leave_deduction: 0,
    total_earnings: 17700, total_deductions: 0, net_pay: 17700,
  }),
  line({
    id: '2', serial_no: 2, employee_code: 'AHS002', staff_name: 'PRISKALA M',
    designation: 'Tutor', department_name: 'Department of Allied (UG)',
    date_of_joining: '2024-10-23', bank_account_number: '7895658573',
    business_working_days: 22, paid_leave_days: 1, unpaid_leave_days: 2,
    on_duty_days: 0, worked_days: 19, paid_days: 20,
    actual_gross: 15000, basic_pay: 15000, unpaid_leave_deduction: 1363.64,
    total_earnings: 15000, total_deductions: 1363.64,
    adjustment_amount: 682, net_pay: 12954,
    remarks: 'may month cpl issue one day salary deducted',
  }),
  line({
    id: '3', serial_no: 3, employee_code: 'AHS004', staff_name: 'VIJAYSABARI S',
    designation: 'Assistant Professor', department_name: 'Department of Allied (UG)',
    date_of_joining: '2025-07-01', bank_account_number: null,
    business_working_days: 22, paid_leave_days: 0, unpaid_leave_days: 0,
    on_duty_days: 7, worked_days: 15, paid_days: 22,
    actual_gross: 42000, basic_pay: 42000, unpaid_leave_deduction: 0,
    total_earnings: 42000, total_deductions: 0, net_pay: 42000,
  }),
  line({
    id: '4', serial_no: 4, employee_code: 'AHS005', staff_name: 'MURALIDHARAN C',
    designation: 'Assistant professor', department_name: 'Department of Allied (UG)',
    date_of_joining: '2025-08-04',
    is_included: false, exclusion_reason: 'no_salary_recorded',
  }),
];

async function build(): Promise<ExcelJS.Workbook> {
  const buffer = await buildSalaryRegisterWorkbook({
    run,
    lines,
    institutionName: 'JKKN College of Allied Health Sciences',
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe('salary register workbook', () => {
  it('emits the register, the bank statement, and an exclusions sheet', async () => {
    const wb = await build();
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Salary Register',
      'BANK STATEMENT',
      'Excluded Staff',
    ]);
  });

  it('heads both sheets with the institution and the month', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(String(reg.getCell('A1').value)).toContain('ALLIED HEALTH SCIENCES');
    expect(reg.getCell('A2').value).toBe('SALARY REGISTER FOR THE MONTH OF JUNE 2026');
  });

  /**
   * COLUMNS A-O STILL MATCH THE HAND-KEPT FILE, through Basic Pay.
   *
   * PAST O THE LETTERS HAVE MOVED TWICE: EPF and ESI went in on 2026-09-01,
   * then Allowance and TDS on 2026-09-02. That is deliberate — a deduction
   * printed AFTER Net Pay reads as an afterthought, and the register is meant to
   * show how the net was arrived at.
   *
   * Nothing reads the register sheet by letter — the only cell formulas in the
   * workbook are on the BANK STATEMENT and PAYER SPLIT sheets, which have their
   * own layouts — and the in-sheet number formats are derived from
   * REGISTER_HEADERS rather than hardcoded, precisely so this move could not
   * mis-format a column silently.
   */
  /**
   * THE WHOLE HEADER, PINNED IN ORDER.
   *
   * The per-letter assertions below are the contract finance reads; this one is
   * the diff a developer needs. Inserting a column used to fail four or five
   * cell-letter checks at once with messages like "expected 'Allowance' to be
   * 'Unpaid Leave'", which say nothing about what actually changed. One failing
   * array comparison says everything.
   */
  it('ships exactly these columns, in this order', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    // ExcelJS row.values is 1-based with a leading hole.
    const header = (reg.getRow(3).values as unknown[]).slice(1);
    expect(header).toEqual([
      'S.No', 'Employee Id', 'Employee Name', 'Designation', 'Department',
      'Date Of Join', 'Bank Account Number', 'Business Working Days',
      'Casual Leave Days', 'On Duty Days', 'Comp Off Days', 'Other Paid Leave Days',
      'Paid Leave Days', 'Unpaid Leave Days', 'Worked Days',
      'Paid Days', 'Actual Gross Salary', 'Basic Pay', 'Allowance',
      'Unpaid Leave', 'EPF', 'ESI', 'TDS', 'Adjustment',
      'Total Earnings', 'Total Deductions', 'Net Pay', 'Works At', 'Remarks',
    ]);
  });

  // A-H still match the hand-kept file. Since 2026-09-23 the day block follows
  // the on-screen register (casual leave, on duty, comp off, other paid leave,
  // then the paid-leave total), so Gross and Basic moved from N/O to Q/R.
  it('keeps the identity columns and moves the money block past the day block', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(reg.getCell('A3').value).toBe('S.No');
    expect(reg.getCell('B3').value).toBe('Employee Id');
    expect(reg.getCell('H3').value).toBe('Business Working Days');
    expect(reg.getCell('I3').value).toBe('Casual Leave Days');
    expect(reg.getCell('Q3').value).toBe('Actual Gross Salary');
    expect(reg.getCell('R3').value).toBe('Basic Pay');
  });

  it('breaks earnings and deductions out between Basic Pay and the totals', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(reg.getCell('S3').value).toBe('Allowance');
    expect(reg.getCell('T3').value).toBe('Unpaid Leave');
    expect(reg.getCell('U3').value).toBe('EPF');
    expect(reg.getCell('V3').value).toBe('ESI');
    expect(reg.getCell('W3').value).toBe('TDS');
    expect(reg.getCell('X3').value).toBe('Adjustment');
    expect(reg.getCell('Y3').value).toBe('Total Earnings');
    expect(reg.getCell('Z3').value).toBe('Total Deductions');
    expect(reg.getCell('AA3').value).toBe('Net Pay');
  });

  it('appends Works At and Remarks after Net Pay', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    // Both are additions to the hand-kept layout, placed after the money block.
    expect(reg.getCell('AB3').value).toBe('Works At');
    expect(reg.getCell('AC3').value).toBe('Remarks');
  });

  it('writes only payable rows to the register, renumbered from 1', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(reg.getCell('A4').value).toBe(1);
    expect(reg.getCell('C4').value).toBe('GIRIDHARAN P');
    expect(reg.getCell('C6').value).toBe('VIJAYSABARI S');
    // The excluded person must not appear here at all.
    expect(reg.getCell('C7').value).toBeFalsy();
  });

  it('preserves a leading zero in the account number', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    // Written as text on purpose — a numeric cell drops the zeros and the
    // transfer fails.
    expect(reg.getCell('G4').value).toBe('0007312984398');
  });

  it('formats the join date as DD/MM/YYYY', async () => {
    const wb = await build();
    expect(wb.getWorksheet('Salary Register')!.getCell('F4').value).toBe('18/06/2024');
  });

  it('leaves the deduction cell blank rather than writing 0', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(reg.getCell('T4').value).toBeNull();
    expect(reg.getCell('T5').value).toBe(1363.64);
    expect(reg.getCell('X4').value).toBeNull();
    expect(reg.getCell('X5').value).toBe(682);
  });

  // '0.##' printed 23 as "23." — whole numbers must carry no decimal point.
  it('formats whole numbers without a trailing decimal point', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(reg.getCell('H4').numFmt).toBe('0');
    expect(reg.getCell('Q4').numFmt).toBe('#,##0');
    expect(reg.getCell('AA4').numFmt).toBe('#,##0');
    expect(reg.getCell('T5').numFmt).toBe('#,##0.00');
    expect(wb.getWorksheet('BANK STATEMENT')!.getCell('D4').numFmt).toBe('#,##0');
  });

  it('satisfies the register identities on every payable row', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    for (const r of [4, 5, 6]) {
      const n = (c: string) => Number(reg.getCell(`${c}${r}`).value ?? 0);
      // Worked = Business - Paid Leave - Unpaid - On Duty
      expect(n('O')).toBe(n('H') - n('M') - n('N') - n('J'));
      // Paid Days = Business - Unpaid
      expect(n('P')).toBe(n('H') - n('N'));
    }
  });

  it('closes the bank statement with a live SUM over exactly the data rows', async () => {
    const wb = await build();
    const bank = wb.getWorksheet('BANK STATEMENT')!;
    expect(bank.getCell('B4').value).toBe('GIRIDHARAN P');
    // Blank, not omitted: the gap has to be visible.
    expect(bank.getCell('C6').value).toBe('');
    expect(String(bank.getCell('A7').value)).toBe('TOTAL');
    expect((bank.getCell('D7').value as { formula: string }).formula).toBe('SUM(D4:D6)');
  });

  it('names the excluded staff and why they were not paid', async () => {
    const wb = await build();
    const ex = wb.getWorksheet('Excluded Staff')!;
    expect(ex.getCell('C4').value).toBe('MURALIDHARAN C');
    expect(ex.getCell('F4').value).toBe('No salary recorded');
  });

  it('omits the exclusions sheet when everyone was paid', async () => {
    const buffer = await buildSalaryRegisterWorkbook({
      run,
      lines: lines.filter((l) => l.is_included),
      institutionName: 'JKKN College of Allied Health Sciences',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Salary Register', 'BANK STATEMENT']);
  });

  it('builds a filename safe for institutions with punctuation', async () => {
    expect(salaryRegisterFilename('JKKN College of Arts and Science (Self)', 2026, 6)).toBe(
      'Salary Register - JKKN College of Arts and Science (Self) - June 2026.xlsx',
    );
  });
});

describe('salary register workbook — staff working elsewhere', () => {
  /**
   * The register is grouped by the PAYING institution (2026-09-23), so one
   * register can list people working at several places — Pharmacy pays 10
   * people at Main Office. Where each works is printed per row; the old
   * per-payer split sheet is gone because every row has the same payer.
   */
  const mixed: HRSalaryRegisterLine[] = [
    line({
      id: 'w1', serial_no: 1, staff_name: 'WORKS AT PHARMACY',
      work_institution_id: 'inst-pharm', work_institution_name: 'JKKN College of Pharmacy',
      business_working_days: 23, worked_days: 23, paid_days: 23,
      actual_gross: 30000, basic_pay: 30000, total_earnings: 30000,
      total_deductions: 0, net_pay: 30000,
    }),
    line({
      id: 'w2', serial_no: 2, staff_name: 'WORKS AT MAIN OFFICE',
      work_institution_id: 'inst-mo', work_institution_name: 'JKKN Main Office',
      business_working_days: 23, worked_days: 23, paid_days: 23,
      actual_gross: 20000, basic_pay: 20000, total_earnings: 20000,
      total_deductions: 0, net_pay: 20000,
    }),
    line({
      id: 'w3', serial_no: 3, staff_name: 'OLD LINE, NOT RECORDED',
      business_working_days: 23, worked_days: 23, paid_days: 23,
      actual_gross: 11000, basic_pay: 11000, total_earnings: 11000,
      total_deductions: 0, net_pay: 11000,
    }),
  ];

  async function buildMixed(): Promise<ExcelJS.Workbook> {
    const buffer = await buildSalaryRegisterWorkbook({
      run, lines: mixed, institutionName: 'JKKN College of Pharmacy',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it('prints where each person works', async () => {
    const reg = (await buildMixed()).getWorksheet('Salary Register')!;
    expect(reg.getCell('AB4').value).toBe('JKKN College of Pharmacy');
    expect(reg.getCell('AB5').value).toBe('JKKN Main Office');
    // Blank, not "Unknown", on lines generated before the column existed.
    expect(reg.getCell('AB6').value).toBe('');
  });

  it('no longer emits a per-payer split sheet', async () => {
    const wb = await buildMixed();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Salary Register', 'BANK STATEMENT']);
  });
});
