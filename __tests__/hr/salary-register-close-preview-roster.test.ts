/**
 * The month-close preview lists the people the close FREEZES (who WORK at the
 * institution), not the people the institution PAYS. The issued register keeps
 * the payer roster.
 *
 * The bug (September 2026, Dental): the preview took its roster from
 * hr_staff_payroll (people Dental PAYS) but its day counts from
 * fn_hr_attendance_period_projection(Dental), which only sees attendance stamped
 * at the WORK location. Ten Main Office staff paid by Dental could never have a
 * projection row, so each was reported "No attendance in the closed month" while
 * a full month of records sat under Main Office. And Main Office, which pays
 * nobody, previewed an empty roster for the people working there.
 *
 * A small in-memory stand-in for the Supabase client is enough: loadContext only
 * chains select/eq/neq/in/is/limit/order and awaits the result.
 *
 * Run: npx vitest run __tests__/hr/salary-register-close-preview-roster.test.ts
 */
import { describe, expect, it } from 'vitest';

import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';

type Row = Record<string, unknown>;

function makeClient(
  tables: Record<string, Row[]>,
  rpcs: Record<string, (args: any) => unknown>,
) {
  const rpcCalls: Array<{ name: string; args: any }> = [];

  const from = (table: string) => {
    const filters: Array<['eq' | 'neq' | 'in' | 'is', string, unknown]> = [];
    let single = false;

    const run = () => {
      const rows = (tables[table] ?? []).filter((r) =>
        filters.every(([op, col, val]) => {
          const v = r[col];
          if (op === 'eq') return v === val;
          if (op === 'neq') return v !== val;
          if (op === 'in') return (val as unknown[]).includes(v);
          return (v ?? null) === val; // is
        }),
      );
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };

    const chain: any = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), chain),
      neq: (c: string, v: unknown) => (filters.push(['neq', c, v]), chain),
      in: (c: string, v: unknown) => (filters.push(['in', c, v]), chain),
      is: (c: string, v: unknown) => (filters.push(['is', c, v]), chain),
      maybeSingle: () => {
        single = true;
        return Promise.resolve(run());
      },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  };

  const rpc = (name: string, args: any) => {
    rpcCalls.push({ name, args });
    return Promise.resolve({ data: rpcs[name]?.(args) ?? null, error: null });
  };

  return { client: { from, rpc } as any, rpcCalls };
}

const DENTAL = 'inst-dental';
const MAIN = 'inst-main';

const staff = (id: string, code: string, institution_id: string): Row => ({
  id,
  staff_id: code,
  first_name: code,
  last_name: '',
  designation: null,
  date_of_joining: null,
  institution_id,
  department_id: null,
  is_active: true,
});

const summaryRow = (staff_id: string): Row => ({
  staff_id,
  present_days: 20,
  half_days: 0,
  leave_days: 0,
  on_duty_days: 0,
  comp_off_days: 0,
  lop_days: 3,
  payable_days: 20,
  leave_by_type: {},
  unprocessed_days: 0,
  scheduled_days: 23,
  work_pattern_id: null,
});

function fixture(payerOfA = 'org-dental') {
  const tables: Record<string, Row[]> = {
    hr_organizations: [
      { id: 'org-dental', name: 'Dental', institution_id: DENTAL, is_payroll_entity: true, included_in_hr: true },
      { id: 'org-main', name: 'Main Office', institution_id: MAIN, is_payroll_entity: false, included_in_hr: true },
      { id: 'org-pharm', name: 'Pharmacy', institution_id: 'inst-pharm', is_payroll_entity: true, included_in_hr: true },
    ],
    v_hr_staff: [
      staff('A', 'DCH001', DENTAL), // works at Dental, has attendance
      staff('B', 'DCH002', DENTAL), // works at Dental, NO attendance (a genuine gap)
      staff('C', 'MO056', MAIN), // works at Main Office, PAID BY DENTAL
      staff('D', 'DCH004', DENTAL), // works at Dental, PAID BY PHARMACY
    ],
    hr_staff_payroll: [
      { staff_id: 'A', hr_organization_id: payerOfA },
      { staff_id: 'B', hr_organization_id: 'org-dental' },
      { staff_id: 'C', hr_organization_id: 'org-dental' },
      { staff_id: 'D', hr_organization_id: 'org-pharm' },
    ],
    hr_attendance_periods: [],
    hr_staff_bank_accounts: [],
    hr_tds_slabs: [],
  };

  const rpcs: Record<string, (args: any) => unknown> = {
    user_has_permission: () => true,
    is_super_admin: () => true,
    hr_staff_salaries_in_force: (args) =>
      (args.p_staff_ids as string[]).map((staff_id) => ({
        id: `sal-${staff_id}`,
        staff_id,
        monthly_gross: 30000,
        effective_from: null,
        eligible_for_pf: false,
        epf_amount: 0,
        eligible_for_esi: false,
        esi_amount: 0,
        allowance_amount: 0,
      })),
    // Attendance is projected PER WORK LOCATION, from records stamped there.
    fn_hr_attendance_period_projection: (args) =>
      args.p_institution_id === DENTAL
        ? [summaryRow('A'), summaryRow('D')]
        : args.p_institution_id === MAIN
          ? [summaryRow('C')]
          : [],
  };

  return makeClient(tables, rpcs);
}

describe('month-close preview — the roster is who WORKS at the institution', () => {
  it('does not report a person paid by Dental but working at Main Office as "No attendance"', async () => {
    const { client } = fixture();
    const preview = await SalaryRegisterService.previewForClose(client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });

    const everyone = [...preview.payable, ...preview.excluded].map((r) => r.employee_code);
    expect(everyone).not.toContain('MO056');
    expect(preview.excluded.map((r) => r.employee_code)).not.toContain('MO056');
  });

  it('lists the people who work there, whoever pays them, with their payer named', async () => {
    const { client } = fixture();
    const preview = await SalaryRegisterService.previewForClose(client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });

    expect(preview.roster_count).toBe(3); // A, B, D — not C
    expect(preview.payable.map((r) => r.employee_code).sort()).toEqual(['DCH001', 'DCH004']);

    const byCode = Object.fromEntries(preview.payable.map((r) => [r.employee_code, r.paid_by_name]));
    expect(byCode.DCH001).toBe('Dental');
    expect(byCode.DCH004).toBe('Pharmacy'); // works at Dental, paid elsewhere: now verified here
  });

  it('still excludes a person who really has no attendance at that institution', async () => {
    const { client } = fixture();
    const preview = await SalaryRegisterService.previewForClose(client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });

    expect(preview.excluded).toHaveLength(1);
    expect(preview.excluded[0]).toMatchObject({ employee_code: 'DCH002', reason: 'no_attendance_summary' });
  });

  it('mentions the people it pays who work elsewhere, without counting them as unpaid', async () => {
    const { client } = fixture();
    const preview = await SalaryRegisterService.previewForClose(client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });

    expect(preview.paid_elsewhere).toEqual([{ institution_name: 'Main Office', count: 1 }]);
    expect(preview.excluded).toHaveLength(1); // only the genuine gap
  });

  it('gives a workplace that pays nobody (Main Office) a real preview of its own people', async () => {
    const { client } = fixture();
    const preview = await SalaryRegisterService.previewForClose(client, {
      hrOrganizationId: 'org-main',
      year: 2026,
      month: 9,
    });

    expect(preview.roster_count).toBe(1);
    expect(preview.payable).toHaveLength(1);
    expect(preview.payable[0]).toMatchObject({ employee_code: 'MO056', paid_by_name: 'Dental' });
    expect(preview.excluded).toHaveLength(0);
  });

  it('asks the projection for THIS institution only', async () => {
    const { client, rpcCalls } = fixture();
    await SalaryRegisterService.previewForClose(client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });

    const projections = rpcCalls.filter((c) => c.name === 'fn_hr_attendance_period_projection');
    expect(projections).toHaveLength(1);
    expect(projections[0].args.p_institution_id).toBe(DENTAL);
  });

  it('keeps the fingerprint independent of who pays', async () => {
    const a = fixture();
    const base = await SalaryRegisterService.previewForClose(a.client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });

    // Same person, same figures, a different PAYER.
    const b = fixture('org-pharm');
    const reassigned = await SalaryRegisterService.previewForClose(b.client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });
    expect(reassigned.payable.find((r) => r.employee_code === 'DCH001')?.paid_by_name).toBe('Pharmacy');
    // The stale-confirmation guard must not trip because a payer label changed.
    expect(reassigned.fingerprint).toBe(base.fingerprint);
  });
});

describe('the issued register keeps the PAYER roster', () => {
  it('preflight for Dental is still built from the people Dental pays (A, B, C)', async () => {
    const { client } = fixture();
    const result = await SalaryRegisterService.preflight(client, {
      hrOrganizationId: 'org-dental',
      year: 2026,
      month: 9,
    });

    expect(result.roster_count).toBe(3);
  });
});
