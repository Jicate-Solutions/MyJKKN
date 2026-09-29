/**
 * The increment report's data layer, against an in-memory stand-in for the
 * RLS-scoped Supabase client.
 *
 * What these tests are really pinning:
 *
 *  1. The policy is read with an EXPLICIT institution scope. `fn_get_policy`
 *     falls back to a global row, and seven of the nine colleges have no
 *     increment row — a fallback would hand them somebody else's rules and turn
 *     the most important finding on the screen into a wrong answer.
 *  2. A college with no rules still lists its people, so the screen can never
 *     show an empty table that reads as "nobody is due".
 *  3. A caller who can see no college gets an explicit flag, not an empty list.
 *  4. Nothing is written. Ever.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { IncrementReportService } from '@/lib/services/hr/increments/increment-report-service';

// ---------------------------------------------------------------------------
// In-memory stand-in. Records every filter applied, so a test can assert HOW a
// query was scoped and not merely what came back.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

let tables: Record<string, Row[]> = {};
let queryLog: Array<{ table: string; filters: string[] }> = [];
let writeAttempts: string[] = [];

function makeClient() {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const filters: string[] = [];
    const entry = { table, filters };
    queryLog.push(entry);

    const builder: any = {
      select: () => builder,
      order: () => builder,
      eq: (col: string, value: any) => {
        filters.push(`eq:${col}=${value}`);
        rows = rows.filter((r) => r[col] === value);
        return builder;
      },
      in: (col: string, values: any[]) => {
        filters.push(`in:${col}=[${values.length}]`);
        rows = rows.filter((r) => values.includes(r[col]));
        return builder;
      },
      is: (col: string, value: any) => {
        filters.push(`is:${col}=${value}`);
        rows = rows.filter((r) => (value === null ? r[col] == null : r[col] === value));
        return builder;
      },
      // Writers. Calling one is a test failure by itself.
      insert: () => {
        writeAttempts.push(`insert:${table}`);
        return builder;
      },
      update: () => {
        writeAttempts.push(`update:${table}`);
        return builder;
      },
      upsert: () => {
        writeAttempts.push(`upsert:${table}`);
        return builder;
      },
      delete: () => {
        writeAttempts.push(`delete:${table}`);
        return builder;
      },
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return builder;
  }

  return {
    from,
    rpc: vi.fn(async (name: string) => {
      if (name === 'fn_hr_orgs_for_institutions') {
        return { data: tables.__orgs ?? [], error: null };
      }
      return { data: null, error: null };
    }),
  };
}

const ENGINEERING = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const NURSING = 'aaaaaaaa-0000-0000-0000-000000000001';

const SEEDED_INCREMENTS = {
  increments: {
    annual_window_months: 12,
    approver_default: 'Principal',
    approver_for_principal: ['Chairman', 'Secretary'],
    satisfactory_performance_required: true,
    head_of_dept_recommendation_required: true,
    withholding_triggers: ['poor_conduct', 'unsatisfactory_work'],
  },
  yearly_increment_factors: ['contributions', 'research'],
};

/** Rules with everything filled in, so a verdict of "due" is reachable. */
const COMPLETE_INCREMENTS = {
  increments: {
    annual_window_months: 12,
    approver_default: 'Principal',
    satisfactory_performance_required: true,
    satisfactory_min_score: 60,
    head_of_dept_recommendation_required: false,
    withholding_triggers: ['poor_conduct'],
    annual_amount: 1000,
  },
};

beforeEach(() => {
  queryLog = [];
  writeAttempts = [];
  tables = {
    __orgs: [
      {
        institution_id: ENGINEERING,
        hr_organization_id: 'org-eng',
        organization_name: 'JKKN Engineering (HR)',
      },
      {
        institution_id: NURSING,
        hr_organization_id: 'org-nur',
        organization_name: 'JKKN Nursing (HR)',
      },
    ],
    institutions: [
      { id: ENGINEERING, name: 'JKKN College of Engineering and Technology' },
      { id: NURSING, name: 'JKKN College of Nursing' },
    ],
    platform_policies: [
      {
        policy_key: 'hr.allowances_and_increments',
        scope_type: 'institution',
        scope_id: ENGINEERING,
        value: COMPLETE_INCREMENTS,
      },
      // A GLOBAL row for the same key. Nothing must inherit it.
      {
        policy_key: 'hr.allowances_and_increments',
        scope_type: 'global',
        scope_id: null,
        value: SEEDED_INCREMENTS,
      },
    ],
    staff: [
      {
        id: 's1',
        first_name: 'Asha',
        last_name: 'Raman',
        designation: 'Senior Learner',
        institution_id: ENGINEERING,
        date_of_joining: '2019-07-01',
        is_active: true,
      },
      {
        id: 's2',
        first_name: 'Bala',
        last_name: 'Kumar',
        designation: 'Office Assistant',
        institution_id: NURSING,
        date_of_joining: '2021-01-10',
        is_active: true,
      },
      {
        id: 's3',
        first_name: 'Gone',
        last_name: 'Away',
        designation: 'Typist',
        institution_id: ENGINEERING,
        date_of_joining: '2015-01-01',
        is_active: false,
      },
    ],
    hr_staff_salaries: [
      {
        staff_id: 's1',
        monthly_gross: 24000,
        effective_from: '2025-04-01',
        superseded_by: null,
      },
      // A superseded row for the same person. It must not be read.
      {
        staff_id: 's1',
        monthly_gross: 21000,
        effective_from: '2024-04-01',
        superseded_by: 'some-later-row',
      },
      {
        staff_id: 's2',
        monthly_gross: 12000,
        effective_from: '2026-08-01',
        superseded_by: null,
      },
    ],
    hr_performance_reviews: [
      {
        staff_id: 's1',
        status: 'final_approved',
        final_score: 82,
        final_approved_at: '2026-07-01T00:00:00Z',
        cycle: { cycle_year: 2026, end_date: '2026-06-30' },
      },
      // An older cycle, which must lose to the newer one above.
      {
        staff_id: 's1',
        status: 'final_approved',
        final_score: 40,
        final_approved_at: '2025-07-01T00:00:00Z',
        cycle: { cycle_year: 2025, end_date: '2025-06-30' },
      },
    ],
    hr_disciplinary_cases: [],
    hr_staff_details: [{ staff_id: 's1', designation_id: 'd-asst-prof' }],
    hr_pay_scales: [
      {
        designation_id: 'd-asst-prof',
        basic_pay: 20000,
        grade_pay: 2000,
        superseded_by: null,
      },
    ],
  };
});

const ASOF = '2026-09-29';

describe('IncrementReportService.build', () => {
  it('reads the policy scoped to the institution, never a global fallback', async () => {
    await IncrementReportService.build(makeClient(), { asOf: ASOF });

    const policyQuery = queryLog.find((q) => q.table === 'platform_policies');
    expect(policyQuery).toBeDefined();
    expect(policyQuery!.filters).toContain('eq:policy_key=hr.allowances_and_increments');
    expect(policyQuery!.filters).toContain('eq:scope_type=institution');
    expect(policyQuery!.filters.some((f) => f.startsWith('in:scope_id='))).toBe(true);
  });

  it('does NOT give the global row to a college that has no row of its own', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const nursing = report.colleges.find((c) => c.institutionId === NURSING)!;
    expect(nursing.hasRules).toBe(false);
    expect(nursing.rules).toBeNull();
    expect(report.collegesWithoutRules).toContain('JKKN College of Nursing');
  });

  it('still lists the people at a college with no rules', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const nursing = report.colleges.find((c) => c.institutionId === NURSING)!;
    expect(nursing.proposals).toHaveLength(1);
    expect(nursing.proposals[0].staffName).toBe('Bala Kumar');
    expect(nursing.proposals[0].verdict).toBe('no_rules');
    expect(nursing.counts.no_rules).toBe(1);
  });

  it('prefers the institution name over the HR organisation label', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(report.colleges.map((c) => c.institutionName)).toContain(
      'JKKN College of Engineering and Technology',
    );
  });

  it('reads the salary in force and ignores the superseded one', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    const asha = eng.proposals.find((p) => p.staffId === 's1')!;
    expect(asha.currentMonthlyGross).toBe(24000);
    expect(asha.verdict).toBe('due');
    expect(asha.proposedMonthlyIncrease).toBe(1000);
    expect(asha.proposedNewMonthlyGross).toBe(25000);

    const salaryQuery = queryLog.find((q) => q.table === 'hr_staff_salaries');
    expect(salaryQuery!.filters).toContain('is:superseded_by=null');
  });

  it('takes the newest review cycle, not the worst score on file', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    const asha = eng.proposals.find((p) => p.staffId === 's1')!;
    const performance = asha.checks.find((c) => c.id === 'performance')!;
    expect(performance.status).toBe('pass');
    expect(performance.detail).toMatch(/scored 82/);
  });

  it('leaves out inactive team members', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    expect(eng.proposals.map((p) => p.staffId)).not.toContain('s3');
    const staffQuery = queryLog.find((q) => q.table === 'staff');
    expect(staffQuery!.filters).toContain('eq:is_active=true');
  });

  it('attaches the reference scale only where the job title has been sorted', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    const nur = report.colleges.find((c) => c.institutionId === NURSING)!;
    expect(eng.proposals.find((p) => p.staffId === 's1')!.scale).toEqual({
      basicPay: 20000,
      gradePay: 2000,
    });
    expect(nur.proposals.find((p) => p.staffId === 's2')!.scale).toBeNull();
  });

  it('counts an undecided disciplinary case as undecided, not as clear', async () => {
    tables.hr_disciplinary_cases = [
      {
        staff_id: 's1',
        case_number: 'DC-2026-0009',
        outcome: null,
        outcome_date: null,
        status: 'active',
        current_stage: 'enquiry',
      },
    ];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const asha = report.colleges
      .find((c) => c.institutionId === ENGINEERING)!
      .proposals.find((p) => p.staffId === 's1')!;
    expect(asha.verdict).toBe('cannot_tell');
    expect(asha.reason).toMatch(/open with no decision yet/);
  });

  it('withholds on a decided case inside the year', async () => {
    tables.hr_disciplinary_cases = [
      {
        staff_id: 's1',
        case_number: 'DC-2026-0010',
        outcome: 'suspension',
        outcome_date: '2026-05-02T00:00:00Z',
        status: 'closed',
        current_stage: 'closed',
      },
    ];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const asha = report.colleges
      .find((c) => c.institutionId === ENGINEERING)!
      .proposals.find((p) => p.staffId === 's1')!;
    expect(asha.verdict).toBe('withheld');
  });

  it('flags no accessible colleges explicitly instead of returning an empty list', async () => {
    tables.__orgs = [];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(report.noAccessibleColleges).toBe(true);
    expect(report.colleges).toEqual([]);
  });

  it('gets its college list from the access-scoped RPC, not from a table scan', async () => {
    const client = makeClient();
    await IncrementReportService.build(client, { asOf: ASOF });
    expect(client.rpc).toHaveBeenCalledWith('fn_hr_orgs_for_institutions');
    expect(queryLog.map((q) => q.table)).not.toContain('hr_organizations');
  });

  it('copes with a college that has rules and nobody in it', async () => {
    tables.staff = [];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(report.noAccessibleColleges).toBe(false);
    expect(report.colleges).toHaveLength(2);
    expect(report.colleges.every((c) => c.proposals.length === 0)).toBe(true);
  });

  it('lists the colleges that hold rules before the ones that do not', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(report.colleges[0].hasRules).toBe(true);
    expect(report.colleges[report.colleges.length - 1].hasRules).toBe(false);
  });

  it('unwraps a policy stored as { value: {...} }', async () => {
    tables.platform_policies = [
      {
        policy_key: 'hr.allowances_and_increments',
        scope_type: 'institution',
        scope_id: ENGINEERING,
        value: { value: COMPLETE_INCREMENTS },
      },
    ];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    expect(eng.hasRules).toBe(true);
    expect(eng.rules!.annualWindowMonths).toBe(12);
  });

  it('writes nothing', async () => {
    await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(writeAttempts).toEqual([]);
  });
});

describe('IncrementReportService — the real seeded policy', () => {
  beforeEach(() => {
    tables.platform_policies = [
      {
        policy_key: 'hr.allowances_and_increments',
        scope_type: 'institution',
        scope_id: ENGINEERING,
        value: SEEDED_INCREMENTS,
      },
    ];
  });

  it('cannot declare anyone due, and says exactly what is missing', async () => {
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    expect(eng.hasRules).toBe(true);
    expect(eng.counts.due).toBe(0);
    expect(eng.counts.cannot_tell).toBe(1);
    const asha = eng.proposals[0];
    expect(asha.reason).toMatch(/head of department/i);
    expect(asha.reason).toMatch(/what score counts as satisfactory/i);
  });
});
