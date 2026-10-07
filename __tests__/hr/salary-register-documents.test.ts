/**
 * Salary register — Teaching / Non-Teaching split and the payroll documents
 * (Bank Letter, Chairperson Approval).
 *
 * The figures are what a bank credits and what the Chairperson sanctions, so
 * the arithmetic is pinned against the hand-typed letters these documents
 * replace ("Bank Details on JKKNCP.docx", "JKKNCOP Madam Approval List
 * 2024.docx"): ₹13,65,649 is "Thirteen Lakhs Sixty-Five Thousand Six Hundred
 * and Forty-Nine", the non-teaching ref carries the NT suffix, and so on.
 *
 * Run: npx vitest run __tests__/hr/salary-register-documents.test.ts
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  amountInWordsIndian,
  documentReference,
  formatINR,
  formatLetterDate,
  linesForCategory,
  payrollDocumentFilename,
  payrollDocumentSummary,
  registerFigures,
  rupeesInWords,
  salaryListPageCount,
} from '@/lib/services/hr/payroll/salary-register-document-model';
import { buildPayrollDocument } from '@/lib/services/hr/payroll/salary-register-documents';
import type { HRPayrollDocumentSettings, HRSalaryRegisterLine } from '@/types/hr-payroll';

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
    staff_category_name: null,
    is_teaching: false,
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
    allowance: 0,
    unpaid_leave_deduction: 0,
    epf_deduction: 0,
    esi_deduction: 0,
    tds_deduction: 0,
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

const settings: HRPayrollDocumentSettings = {
  hr_organization_id: 'o1',
  institution_id: 'i1',
  reference_code: 'JKKNCOP',
  non_teaching_suffix: 'NT',
  bank_name: 'Indian Bank',
  bank_branch: 'Kumarapalayam',
  college_account_number: '1775',
  addressee_title: 'The Manager',
  approval_salutation: 'Respected Madam',
  submitter_title: 'CAO',
  approver_title: 'CHAIRPERSON',
  updated_at: null,
};

const lines: HRSalaryRegisterLine[] = [
  line({
    id: 't1', staff_name: 'SARANYA.MV', is_teaching: true, staff_category_name: 'Teaching',
    bank_account_number: '7327740423', total_earnings: 27391, net_pay: 27391,
  }),
  line({
    id: 't2', staff_name: 'Dr. K. RAJENDRAN', is_teaching: true, staff_category_name: 'Principal',
    bank_account_number: '0012345678', total_earnings: 90000, total_deductions: 1800,
    adjustment_amount: 200, net_pay: 88000,
  }),
  line({
    id: 'n1', staff_name: 'MURUGAN S', is_teaching: false, staff_category_name: 'Lab Technician',
    bank_account_number: null, total_earnings: 15000, net_pay: 15000,
  }),
  line({
    id: 'x1', staff_name: 'EXCLUDED TEACHER', is_teaching: true,
    is_included: false, exclusion_reason: 'no_salary_recorded',
  }),
];

describe('amount in words (Indian system)', () => {
  it.each([
    [1365649, 'Thirteen Lakhs Sixty-Five Thousand Six Hundred and Forty-Nine'],
    [419341, 'Four Lakhs Nineteen Thousand Three Hundred and Forty-One'],
    [61019, 'Sixty-One Thousand Nineteen'],
    [100000, 'One Lakh'],
    [172698, 'One Lakh Seventy-Two Thousand Six Hundred and Ninety-Eight'],
    [10000000, 'One Crore'],
    [25000000, 'Two Crores Fifty Lakhs'],
    [27391, 'Twenty-Seven Thousand Three Hundred and Ninety-One'],
    [0, 'Zero'],
  ])('%d -> %s', (n, words) => {
    expect(amountInWordsIndian(n)).toBe(words);
  });

  it('spells paise after the rupees', () => {
    expect(amountInWordsIndian(1500.5)).toBe('One Thousand Five Hundred and Fifty Paise');
  });

  it('wraps the parenthetical the letters print', () => {
    expect(rupeesInWords(61019)).toBe('Rupees Sixty-One Thousand Nineteen only');
  });
});

describe('Indian digit grouping', () => {
  it.each([
    [1365649, '13,65,649'],
    [419341, '4,19,341'],
    [61019, '61,019'],
    [999, '999'],
    [10000000, '1,00,00,000'],
  ])('%d -> %s', (n, out) => {
    expect(formatINR(n)).toBe(out);
  });

  it('prints paise only when present, or when forced', () => {
    expect(formatINR(27391)).toBe('27,391');
    expect(formatINR(27391, { forceDecimals: true })).toBe('27,391.00');
    expect(formatINR(1363.6)).toBe('1,363.60');
  });
});

describe('reference and date', () => {
  it('uses the salary month, with NT for non-teaching', () => {
    expect(documentReference(settings, 'teaching', 2026, 8)).toBe('JKKNCOP/ AUGUST SALARY/ 2026');
    expect(documentReference(settings, 'non_teaching', 2026, 8)).toBe('JKKNCOPNT/ AUGUST SALARY/ 2026');
  });

  it('formats the letter date as DD.MM.YYYY', () => {
    expect(formatLetterDate('2026-09-09')).toBe('09.09.2026');
  });
});

describe('category split', () => {
  it('takes only PAID lines of the category', () => {
    expect(linesForCategory(lines, 'teaching').map((l) => l.id)).toEqual(['t1', 't2']);
    expect(linesForCategory(lines, 'non_teaching').map((l) => l.id)).toEqual(['n1']);
  });

  it('mirrors the run total definition, and the halves add up', () => {
    const all = registerFigures(lines);
    const t = registerFigures(lines.filter((l) => l.is_teaching));
    const n = registerFigures(lines.filter((l) => !l.is_teaching));
    expect(all.net).toBe(27391 + 88000 + 15000);
    // Deductions include the adjustment, as recomputeRunTotals does.
    expect(t.deductions).toBe(2000);
    expect(t.net + n.net).toBe(all.net);
    expect(t.excluded).toBe(1);
    expect(n.missingAccounts).toBe(1);
  });

  it('summarises a document the way it will print', () => {
    const s = payrollDocumentSummary({ lines, category: 'teaching', settings, periodYear: 2026, periodMonth: 8 });
    expect(s.staffCount).toBe(2);
    expect(s.amount).toBe(115391);
    expect(s.amountFigures).toBe('1,15,391');
    expect(s.amountWords).toBe('Rupees One Lakh Fifteen Thousand Three Hundred and Ninety-One only');
    expect(s.salaryListPages).toBe(1);
  });
});

describe('salary list page count', () => {
  it('fits a short list on one page', () => {
    expect(salaryListPageCount(Array.from({ length: 20 }, () => 'A NAME'))).toBe(1);
  });

  it('spills a long list onto more pages', () => {
    expect(salaryListPageCount(Array.from({ length: 62 }, () => 'A NAME'))).toBeGreaterThanOrEqual(2);
    expect(salaryListPageCount(Array.from({ length: 200 }, () => 'A NAME'))).toBeGreaterThanOrEqual(6);
  });

  it('counts a wrapping name as more than one row', () => {
    // 20 single-line rows + TOTAL fit the first page; 20 two-line rows do not.
    const short = Array.from({ length: 20 }, () => 'A NAME');
    const long = Array.from({ length: 20 }, () => 'A VERY LONG NAME THAT WILL CERTAINLY WRAP IN THE CELL');
    expect(salaryListPageCount(short)).toBe(1);
    expect(salaryListPageCount(long)).toBe(2);
  });
});

async function documentText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  // Paragraph ends become newlines; every other tag is dropped.
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&');
}

describe('bank letter document', () => {
  it('writes the letter and the salary list for one category', async () => {
    const buffer = await buildPayrollDocument({
      kind: 'bank_letter',
      category: 'teaching',
      organisationName: 'JKKN College of Pharmacy',
      periodYear: 2026,
      periodMonth: 8,
      letterDate: '2026-09-09',
      settings,
      lines,
    });
    const text = await documentText(buffer);

    expect(text).toContain('Ref: JKKNCOP/ AUGUST SALARY/ 2026\tDate: 09.09.2026');
    expect(text).toContain('Indian Bank');
    expect(text).toContain('Kumarapalayam.');
    expect(text).toContain('Sub: JKKN College of Pharmacy – Payment of August Month Salary to Staff account – Reg.');
    expect(text).toContain(
      'We enclose herewith a cheque of ₹1,15,391/- (Rupees One Lakh Fifteen Thousand Three Hundred and Ninety-One only)',
    );
    expect(text).toContain('Encl.: 1. INDIAN BANK,');
    expect(text).toContain('A/C No: 1775');
    expect(text).toContain('Dated: 09.09.2026 for ₹1,15,391/-');
    expect(text).toContain('2. Salary list – 1 Page.');
    // Salary list: both teachers, with leading zeros kept; nobody else.
    expect(text).toContain('SARANYA.MV');
    expect(text).toContain('0012345678');
    expect(text).toContain('88,000.00');
    expect(text).toContain('TOTAL');
    expect(text).toContain('1,15,391.00');
    expect(text).not.toContain('MURUGAN S');
    expect(text).not.toContain('EXCLUDED TEACHER');
  });

  it('says "Non-Teaching Staff", uses the NT ref, and flags a missing account', async () => {
    const buffer = await buildPayrollDocument({
      kind: 'bank_letter',
      category: 'non_teaching',
      organisationName: 'JKKN College of Pharmacy',
      periodYear: 2026,
      periodMonth: 8,
      letterDate: '2026-09-09',
      chequeNumber: '004512',
      settings,
      lines,
    });
    const text = await documentText(buffer);
    expect(text).toContain('JKKNCOPNT/ AUGUST SALARY/ 2026');
    expect(text).toContain('to Non-Teaching Staff account – Reg.');
    expect(text).toContain('Cheque No. 004512');
    expect(text).toContain('(not recorded)');
  });

  it('refuses a category with nobody paid', async () => {
    await expect(
      buildPayrollDocument({
        kind: 'bank_letter',
        category: 'non_teaching',
        organisationName: 'X',
        periodYear: 2026,
        periodMonth: 8,
        letterDate: '2026-09-09',
        settings,
        lines: lines.filter((l) => l.is_teaching),
      }),
    ).rejects.toThrow(/No non-teaching staff/);
  });
});

describe('chairperson approval document', () => {
  it('writes the requisition, the particulars table, and the signatories', async () => {
    const buffer = await buildPayrollDocument({
      kind: 'chairperson_approval',
      category: 'non_teaching',
      organisationName: 'JKKN College of Pharmacy',
      periodYear: 2026,
      periodMonth: 8,
      letterDate: '2026-09-09',
      settings,
      lines,
    });
    const text = await documentText(buffer);
    expect(text).toContain('JKKNCOPNT/ AUGUST SALARY/ 2026\tDate: 09.09.2026');
    expect(text).toContain('SUBMITTED TO THE CHAIRPERSON FOR APPROVAL');
    expect(text).toContain('Respected Madam,');
    expect(text).toContain('Sub: JKKN College of Pharmacy Non-Teaching Staff Salary for the Month of August 2026 – Reg.');
    expect(text).toContain(
      'sanction and release of a sum of ₹15,000/- (Rupees Fifteen Thousand only) towards the salary for the month of AUGUST 2026, to be released by the Trust Office.',
    );
    expect(text).toContain('Amount: ₹15,000/-');
    expect(text).toContain('In words: Rupees Fifteen Thousand only.');
    expect(text).toContain('Non-Teaching Staff Salary');
    expect(text).toContain('Total (Rs.)');
    expect(text).toMatch(/CAO\tCHAIRPERSON/);
  });
});

describe('filename', () => {
  it('names the document, category, college and month', () => {
    expect(
      payrollDocumentFilename('chairperson_approval', 'teaching', 'JKKN College of Arts and Science (Self)', 2026, 8),
    ).toBe('Chairperson Approval - Teaching - JKKN College of Arts and Science (Self) - August 2026.docx');
  });
});
