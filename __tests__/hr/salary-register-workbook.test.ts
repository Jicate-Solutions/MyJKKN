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
    business_working_days: 0,
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
      'Paid Leave Days', 'Unpaid Leave Days', 'On Duty Days', 'Worked Days',
      'Paid Days', 'Actual Gross Salary', 'Basic Pay', 'Allowance',
      'Unpaid Leave', 'EPF', 'ESI', 'TDS',
      'Total Earnings', 'Total Deductions', 'Net Pay', 'Paid By', 'Remarks',
    ]);
  });

  it('keeps columns A-O exactly as the hand-kept file has them', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(reg.getCell('A3').value).toBe('S.No');
    expect(reg.getCell('B3').value).toBe('Employee Id');
    expect(reg.getCell('H3').value).toBe('Business Working Days');
    expect(reg.getCell('N3').value).toBe('Actual Gross Salary');
    expect(reg.getCell('O3').value).toBe('Basic Pay');
  });

  it('breaks earnings and deductions out between Basic Pay and the totals', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    expect(reg.getCell('P3').value).toBe('Allowance');
    expect(reg.getCell('Q3').value).toBe('Unpaid Leave');
    expect(reg.getCell('R3').value).toBe('EPF');
    expect(reg.getCell('S3').value).toBe('ESI');
    expect(reg.getCell('T3').value).toBe('TDS');
    expect(reg.getCell('U3').value).toBe('Total Earnings');
    expect(reg.getCell('V3').value).toBe('Total Deductions');
    expect(reg.getCell('W3').value).toBe('Net Pay');
  });

  it('appends Paid By and Remarks after Net Pay', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    // Both are additions to the hand-kept layout, placed after the money block.
    expect(reg.getCell('X3').value).toBe('Paid By');
    expect(reg.getCell('Y3').value).toBe('Remarks');
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
    expect(reg.getCell('Q4').value).toBeNull();
    expect(reg.getCell('Q5').value).toBe(1363.64);
  });

  it('satisfies the register identities on every payable row', async () => {
    const wb = await build();
    const reg = wb.getWorksheet('Salary Register')!;
    for (const r of [4, 5, 6]) {
      const n = (c: string) => Number(reg.getCell(`${c}${r}`).value ?? 0);
      // Worked = Business - Paid Leave - Unpaid - On Duty
      expect(n('L')).toBe(n('H') - n('I') - n('J') - n('K'));
      // Paid Days = Business - Unpaid
      expect(n('M')).toBe(n('H') - n('J'));
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

describe('salary register workbook — the Main Office case', () => {
  /**
   * The register is grouped by WORK location, so one institution's register can
   * be paid for by several others. Main Office is the live example: 121 people
   * work there and it pays none of them. Without this sheet, the register says
   * what is owed in total but not by whom — which is the only question finance
   * asks about it.
   */
  const mixed: HRSalaryRegisterLine[] = [
    line({
      id: 'm1', serial_no: 1, staff_name: 'PAID BY PHARMACY',
      paid_by_organization_id: 'org-pharm', paid_by_name: 'JKKN College of Pharmacy',
      business_working_days: 22, worked_days: 22, paid_days: 22,
      actual_gross: 30000, basic_pay: 30000, total_earnings: 30000,
      total_deductions: 0, net_pay: 30000,
    }),
    line({
      id: 'm2', serial_no: 2, staff_name: 'ALSO PHARMACY',
      paid_by_organization_id: 'org-pharm', paid_by_name: 'JKKN College of Pharmacy',
      business_working_days: 22, worked_days: 22, paid_days: 22,
      actual_gross: 20000, basic_pay: 20000, total_earnings: 20000,
      total_deductions: 0, net_pay: 20000,
    }),
    line({
      id: 'm3', serial_no: 3, staff_name: 'PAID BY DENTAL',
      paid_by_organization_id: 'org-dental', paid_by_name: 'JKKN Dental College and Hospital',
      business_working_days: 22, worked_days: 20, paid_days: 20,
      actual_gross: 22000, basic_pay: 22000, unpaid_leave_deduction: 2000,
      total_earnings: 22000, total_deductions: 2000, net_pay: 20000,
    }),
    line({
      id: 'm4', serial_no: 4, staff_name: 'NOBODY RECORDED',
      business_working_days: 22, worked_days: 22, paid_days: 22,
      actual_gross: 11000, basic_pay: 11000, total_earnings: 11000,
      total_deductions: 0, net_pay: 11000,
    }),
  ];

  async function buildMixed(): Promise<ExcelJS.Workbook> {
    const buffer = await buildSalaryRegisterWorkbook({
      run, lines: mixed, institutionName: 'JKKN Main Office',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it('adds a By Paying Institution sheet when more than one institution pays', async () => {
    const wb = await buildMixed();
    expect(wb.worksheets.map((w) => w.name)).toContain('By Paying Institution');
  });

  it('subtotals by payer, largest liability first', async () => {
    const split = (await buildMixed()).getWorksheet('By Paying Institution')!;
    expect(split.getCell('B4').value).toBe('JKKN College of Pharmacy');
    expect(split.getCell('C4').value).toBe(2);
    expect(split.getCell('F4').value).toBe(50000);
    expect(split.getCell('B5').value).toBe('JKKN Dental College and Hospital');
    expect(split.getCell('F5').value).toBe(20000);
  });

  it('gives staff with no recorded payer their own line rather than dropping them', async () => {
    const split = (await buildMixed()).getWorksheet('By Paying Institution')!;
    const names = [4, 5, 6].map((r) => split.getCell(`B${r}`).value);
    expect(names).toContain('Not recorded');
  });

  it('totals the split with a live formula so it reconciles against the bank sheet', async () => {
    const split = (await buildMixed()).getWorksheet('By Paying Institution')!;
    // 3 payer groups -> total row is 4 + 3 = 7
    expect(String(split.getCell('A7').value)).toBe('TOTAL');
    expect((split.getCell('F7').value as { formula: string }).formula).toBe('SUM(F4:F6)');
  });

  it('omits the sheet when a single institution pays everybody', async () => {
    const buffer = await buildSalaryRegisterWorkbook({
      run,
      lines: mixed.slice(0, 2), // both Pharmacy
      institutionName: 'JKKN Main Office',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).not.toContain('By Paying Institution');
  });

  it('prints the payer on each register row', async () => {
    const reg = (await buildMixed()).getWorksheet('Salary Register')!;
    expect(reg.getCell('X4').value).toBe('JKKN College of Pharmacy');
    // Blank, not "Unknown" — a data gap someone can go and fill.
    expect(reg.getCell('X7').value).toBe('');
  });
});
