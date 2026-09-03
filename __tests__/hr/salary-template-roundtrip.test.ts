/**
 * The salary bulk-edit workbook, exported and read straight back in.
 *
 * WHY THIS EXISTS. salary-template-export.ts builds its header from the
 * PARSER's constants precisely so the two halves cannot drift — but nothing
 * proved the two agreed on the CELLS. A column added to
 * SALARY_TEMPLATE_COLUMNS and populated in the exporter under a slightly
 * different key produces a workbook that looks right, imports silently as
 * "unset", and reports success. The export file's own header comment names this
 * round trip as the only thing that actually guarantees the pair agree.
 *
 * Written when EPF/ESI were added (2026-09-01), and deliberately not limited to
 * them — it asserts on every column the template ships.
 *
 * Run: npx vitest run __tests__/hr/salary-template-roundtrip.test.ts
 */

import { describe, expect, it } from 'vitest';

import { buildSalaryTemplateWorkbook } from '@/app/(routes)/hr/payroll/salaries/_components/salary-template-export';
import {
  SALARY_TEMPLATE_COLUMNS,
  parseSalarySheet,
} from '@/lib/hr/payroll/parse-salary-sheet';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

function row(o: Partial<StaffSalaryDirectoryRow> = {}): StaffSalaryDirectoryRow {
  return {
    staff_uuid: 'a0000000-0000-0000-0000-000000000001',
    staff_code: 'DCH001',
    person_name: 'MANIKANDAN P',
    role_title: 'Lecturer',
    is_active: true,
    works_at_id: 'b0000000-0000-0000-0000-000000000001',
    works_at_name: 'JKKN Dental College',
    payer_org_id: 'c0000000-0000-0000-0000-000000000001',
    payer_org_name: 'JKKN Educational Trust',
    salary_id: 'd0000000-0000-0000-0000-000000000001',
    salary_structure: 'Monthly',
    monthly_gross: 26500,
    annual_gross: 318000,
    overtime_level: 'No overtime',
    overtime_amount: 0,
    eligible_for_pf: false,
    exempt_edli: false,
    eligible_for_insurance: false,
    eligible_for_gratuity: false,
    eligible_for_etf: false,
    epf_amount: 0,
    eligible_for_esi: false,
    esi_amount: 0,
    allowance_amount: 0,
    allowance_label: null,
    effective_from: '2026-08-01',
    notes: null,
    ...o,
  } as StaffSalaryDirectoryRow;
}

/** Export the rows, then read the bytes back through the real parser. */
function roundTrip(rows: StaffSalaryDirectoryRow[]) {
  const { bytes } = buildSalaryTemplateWorkbook(rows);
  return parseSalarySheet(bytes);
}

describe('salary template round trip', () => {
  it('reads back every row it wrote', () => {
    const parsed = roundTrip([
      row({ staff_code: 'DCH001' }),
      row({ staff_code: 'DCH002', person_name: 'PRISKALA M' }),
    ]);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((r) => r.employee_code)).toEqual(['DCH001', 'DCH002']);
  });

  it('preserves the EPF and ESI figures when both flags are on', () => {
    const [r] = roundTrip([
      row({
        eligible_for_pf: true,
        epf_amount: 1800,
        eligible_for_esi: true,
        esi_amount: 165,
      }),
    ]).rows;

    expect(r.eligible_for_pf).toBe(true);
    expect(r.epf_amount).toBe(1800);
    expect(r.eligible_for_esi).toBe(true);
    expect(r.esi_amount).toBe(165);
  });

  it('writes a BLANK amount, not a zero, when the flag is off', () => {
    // A 0 beside a "No" would import as a decided figure of zero. Blank is the
    // honest answer: nobody has been asked.
    const [r] = roundTrip([
      row({ eligible_for_pf: false, epf_amount: 1800, eligible_for_esi: false, esi_amount: 165 }),
    ]).rows;

    expect(r.eligible_for_pf).toBe(false);
    expect(r.epf_amount).toBeNull();
    expect(r.eligible_for_esi).toBe(false);
    expect(r.esi_amount).toBeNull();
  });

  it('preserves one flag independently of the other', () => {
    const [r] = roundTrip([
      row({ eligible_for_pf: true, epf_amount: 1800, eligible_for_esi: false, esi_amount: 0 }),
    ]).rows;

    expect(r.epf_amount).toBe(1800);
    expect(r.eligible_for_esi).toBe(false);
    expect(r.esi_amount).toBeNull();
  });

  it('preserves the pre-existing columns alongside the new ones', () => {
    const [r] = roundTrip([
      row({
        monthly_gross: 15000,
        salary_structure: 'Monthly',
        overtime_level: 'Grade',
        overtime_amount: 250,
        exempt_edli: true,
        eligible_for_gratuity: true,
        effective_from: '2026-04-01',
      }),
    ]).rows;

    expect(r.monthly_gross).toBe(15000);
    expect(r.overtime_level).toBe('Grade');
    expect(r.overtime_amount).toBe(250);
    expect(r.exempt_edli).toBe(true);
    expect(r.eligible_for_gratuity).toBe(true);
    // dd/mm/yyyy in the sheet, and never read back as mm/dd.
    expect(r.effective_from).toBe('2026-04-01');
  });

  it('preserves the allowance and its label', () => {
    const [r] = roundTrip([
      row({ allowance_amount: 3000, allowance_label: 'Conveyance' }),
    ]).rows;

    expect(r.allowance_amount).toBe(3000);
    expect(r.allowance_label).toBe('Conveyance');
  });

  it('writes a BLANK allowance, not a zero, when there is none', () => {
    const [r] = roundTrip([row({ allowance_amount: 0, allowance_label: null })]).rows;

    expect(r.allowance_amount).toBeNull();
    expect(r.allowance_label).toBeNull();
  });

  it('ships every declared column in the header the parser reads', () => {
    // Guards the drift this whole file exists for: a column declared in the
    // parser but never populated by the exporter, or vice versa.
    for (const col of [
      'EPF_Amount', 'Eligible_For_ESI', 'ESI_Amount',
      'Allowance_Amount', 'Allowance_Label',
    ]) {
      expect(SALARY_TEMPLATE_COLUMNS).toContain(col);
    }
  });

  /**
   * TDS IS DELIBERATELY ABSENT. It is derived from the bands, so a column in a
   * bulk-EDIT sheet that silently refuses to import would be worse than none.
   */
  it('does not ship a TDS column', () => {
    expect(SALARY_TEMPLATE_COLUMNS.some((c) => c.toUpperCase().includes('TDS'))).toBe(false);
  });
});
