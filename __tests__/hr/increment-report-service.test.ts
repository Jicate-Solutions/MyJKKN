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

// The service reads the Director's per-department rule through the server
// key (#4111 keeps it unreadable to signed-in accounts). Same fake tables.
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => makeClient() }));

import {
  IncrementReportService,
  todayInIndia,
} from '@/lib/services/hr/increments/increment-report-service';

// ---------------------------------------------------------------------------
// In-memory stand-in. Records every filter applied, so a test can assert HOW a
// query was scoped and not merely what came back.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

let tables: Record<string, Row[]> = {};
let queryLog: Array<{ table: string; filters: string[] }> = [];
let writeAttempts: string[] = [];
/** Per-table read errors, to stand in for a failed query. */
let tableErrors: Record<string, { message: string }> = {};
/** What `is_super_admin` answers. Only a super admin's RLS sees every case. */
let superAdminAnswer: { data: unknown; error: { message: string } | null } = {
  data: true,
  error: null,
};
/** What `is_admin` answers. Admins see every appraisal, not every case. */
let adminAnswer: { data: unknown; error: { message: string } | null } = { data: false, error: null };
/** Like PostgREST: a read returns at most this many rows, with no error. */
const MAX_ROWS = 1000;

function makeClient() {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const filters: string[] = [];
    const entry = { table, filters };
    queryLog.push(entry);

    const builder: any = {
      select: () => builder,
      order: () => builder,
      range: (from: number, to: number) => {
        filters.push(`range:${from}-${to}`);
        rows = rows.slice(from, to + 1);
        return builder;
      },
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
      then: (resolve: any) =>
        resolve(
          tableErrors[table]
            ? { data: null, error: tableErrors[table] }
            : { data: rows.slice(0, MAX_ROWS), error: null },
        ),
    };
    return builder;
  }

  return {
    from,
    rpc: vi.fn(async (name: string) => {
      if (name === 'fn_hr_orgs_for_institutions') {
        return { data: tables.__orgs ?? [], error: null };
      }
      if (name === 'is_super_admin') return superAdminAnswer;
      if (name === 'is_admin') return adminAnswer;
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
  tableErrors = {};
  superAdminAnswer = { data: true, error: null };
  adminAnswer = { data: false, error: null };
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
        is_active: true,
        scope_type: 'institution',
        scope_id: ENGINEERING,
        value: COMPLETE_INCREMENTS,
      },
      // A GLOBAL row for the same key. Nothing must inherit it.
      {
        policy_key: 'hr.allowances_and_increments',
        is_active: true,
        scope_type: 'global',
        scope_id: null,
        value: SEEDED_INCREMENTS,
      },
      // The Director's per-department amounts (30 Sep 2026): the amount of
      // every increment, whatever the college's own rules say.
      {
        policy_key: 'hr.salary_suggestion_rule',
        scope_type: 'global',
        scope_id: null,
        is_active: true,
        publication_state: 'published',
        value: { per_year_by_department: { 'aaaaaaaa-0000-4000-8000-000000000d01': 1000 } },
      },
    ],
    staff: [
      {
        id: 's1',
        first_name: 'Asha',
        last_name: 'Raman',
        designation: 'Senior Learner',
        institution_id: ENGINEERING,
        department_id: 'aaaaaaaa-0000-4000-8000-000000000d01',
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
        department_id: 'aaaaaaaa-0000-4000-8000-000000000d01',
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

  // A failed or refused disciplinary read used to look exactly like a clean
  // record (W12 critic, #4105). Each of these must keep s1 out of "Due".
  function asha(report: Awaited<ReturnType<typeof IncrementReportService.build>>) {
    return report.colleges
      .find((c) => c.institutionId === ENGINEERING)!
      .proposals.find((p) => p.staffId === 's1')!;
  }

  it('reads an empty disciplinary record as clean only when every case is visible', async () => {
    tables.hr_disciplinary_cases = [];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('due');
    expect(asha(report).checks.find((c) => c.id === 'conduct')!.status).toBe('pass');
  });

  it('does not show Due when the disciplinary read errors', async () => {
    tableErrors.hr_disciplinary_cases = { message: 'connection reset' };
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    expect(asha(report).verdict).toBe('cannot_tell');
    expect(asha(report).reason).toMatch(/Could not check conduct — not decided/);
    expect(eng.counts.due).toBe(0);
  });

  it('does not show Due when RLS refuses the read (a caller who is not a super admin)', async () => {
    // RLS answers a refused read with zero rows and no error.
    tables.hr_disciplinary_cases = [];
    superAdminAnswer = { data: false, error: null };
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const eng = report.colleges.find((c) => c.institutionId === ENGINEERING)!;
    expect(asha(report).verdict).toBe('cannot_tell');
    expect(asha(report).checks.find((c) => c.id === 'conduct')!.status).toBe('unknown');
    expect(eng.counts.due).toBe(0);
  });

  it('does not show Due when it cannot ask whether the caller sees every case', async () => {
    superAdminAnswer = { data: null, error: { message: 'rpc failed' } };
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('cannot_tell');
  });

  // --- Every read the Due verdict depends on (#4105 panel round 1) -------
  it('does not show Due when the pay read errors', async () => {
    tableErrors.hr_staff_salaries = { message: 'URI too long' };
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('cannot_tell');
    expect(asha(report).reason).toMatch(/Could not check pay — not decided/);
    expect(report.colleges.find((c) => c.institutionId === ENGINEERING)!.counts.due).toBe(0);
  });

  it('does not count the year from the joining date when the person has no pay row', async () => {
    tables.hr_staff_salaries = tables.hr_staff_salaries.filter((r) => r.staff_id !== 's1');
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('cannot_tell');
    expect(asha(report).reason).toMatch(/No pay record is in force/);
  });

  it('does not show Due when two pay rows are in force for one person', async () => {
    tables.hr_staff_salaries.push({
      id: 'sal-x',
      staff_id: 's1',
      monthly_gross: 30000,
      effective_from: '2024-01-01',
      hr_organization_id: 'other-org',
      superseded_by: null,
    });
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('cannot_tell');
    expect(asha(report).reason).toMatch(/More than one pay record is in force/);
  });

  it('leaves a pay row dated after the report date out of the pay in force', async () => {
    tables.hr_staff_salaries.push({
      id: 'sal-next',
      staff_id: 's1',
      monthly_gross: 26000,
      effective_from: '2026-11-01',
      superseded_by: null,
    });
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).currentMonthlyGross).toBe(24000);
    expect(asha(report).verdict).toBe('due');
  });

  it('does not show Due when the appraisal read errors', async () => {
    tableErrors.hr_performance_reviews = { message: 'timeout' };
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('cannot_tell');
    expect(asha(report).checks.find((c) => c.id === 'performance')!.detail).toMatch(
      /Could not check performance — not decided/,
    );
  });

  it('does not show Due when the caller cannot see every appraisal (RLS answers with zero rows)', async () => {
    // Sees every case (super admin answer is what the conduct read needs) but
    // the appraisal question is is_super_admin OR is_admin; both false here.
    superAdminAnswer = { data: false, error: null };
    adminAnswer = { data: false, error: null };
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).checks.find((c) => c.id === 'performance')!.status).toBe('unknown');
    expect(asha(report).verdict).toBe('cannot_tell');
  });

  it('does not use an appraisal whose cycle ended before the year began', async () => {
    tables.hr_performance_reviews = [
      {
        id: 'rev-old',
        staff_id: 's1',
        status: 'final_approved',
        final_score: 90,
        final_approved_at: '2024-07-01T00:00:00Z',
        cycle: { cycle_year: 2024, end_date: '2024-06-30' },
      },
    ];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('cannot_tell');
    expect(asha(report).checks.find((c) => c.id === 'performance')!.detail).toMatch(/does not judge this year/);
  });

  it('reads past the 1000-row cut-off, so the newest appraisal is not lost', async () => {
    const old = Array.from({ length: 1200 }, (_, i) => ({
      id: `rev-${String(i).padStart(5, '0')}`,
      staff_id: 's1',
      status: 'final_approved',
      final_score: 10,
      final_approved_at: '2023-07-01T00:00:00Z',
      cycle: { cycle_year: 2023, end_date: '2023-06-30' },
    }));
    tables.hr_performance_reviews = [
      ...old,
      {
        id: 'rev-zz-newest',
        staff_id: 's1',
        status: 'final_approved',
        final_score: 82,
        final_approved_at: '2026-07-01T00:00:00Z',
        cycle: { cycle_year: 2026, end_date: '2026-06-30' },
      },
    ];
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).checks.find((c) => c.id === 'performance')!.detail).toMatch(/scored 82/);
    expect(asha(report).verdict).toBe('due');
    const pages = queryLog.filter((q) => q.table === 'hr_performance_reviews');
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  it('asks for at most 200 ids per read', async () => {
    const extra = Array.from({ length: 450 }, (_, i) => ({
      id: `x${i}`,
      first_name: 'Extra',
      last_name: String(i),
      designation: 'Typist',
      institution_id: ENGINEERING,
      date_of_joining: '2020-01-01',
      is_active: true,
    }));
    tables.staff = [...tables.staff, ...extra];
    await IncrementReportService.build(makeClient(), { asOf: ASOF });
    const sizes = queryLog
      .filter((q) => q.table === 'hr_staff_salaries')
      .flatMap((q) => q.filters.filter((f) => f.startsWith('in:staff_id=')))
      .map((f) => Number(/\[(\d+)\]/.exec(f)![1]));
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(200);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(452);
  });

  it('shows no amount when the department rule is a draft that was never published', async () => {
    tables.platform_policies = tables.platform_policies.map((r) =>
      r.policy_key === 'hr.salary_suggestion_rule' ? { ...r, publication_state: 'draft_only' } : r,
    );
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).verdict).toBe('due');
    expect(asha(report).proposedMonthlyIncrease).toBeNull();
  });

  it('shows no amount when the department rule is switched off', async () => {
    tables.platform_policies = tables.platform_policies.map((r) =>
      r.policy_key === 'hr.salary_suggestion_rule' ? { ...r, is_active: false } : r,
    );
    const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
    expect(asha(report).proposedMonthlyIncrease).toBeNull();
  });

  it('does not use a college rule set that is switched off or only a draft', async () => {
    for (const change of [{ is_active: false }, { publication_state: 'draft_only' }]) {
      tables.platform_policies = tables.platform_policies.map((r) =>
        r.policy_key === 'hr.allowances_and_increments' && r.scope_id === ENGINEERING
          ? { ...r, is_active: true, publication_state: 'published', ...change }
          : r,
      );
      const report = await IncrementReportService.build(makeClient(), { asOf: ASOF });
      expect(asha(report).verdict, JSON.stringify(change)).toBe('no_rules');
    }
  });

  it('refuses an impossible report date instead of reading anything', async () => {
    for (const bad of ['2026-02-31', '2026-99-99', '2026-1-1']) {
      await expect(IncrementReportService.build(makeClient(), { asOf: bad }), bad).rejects.toThrow(
        /not a real date/,
      );
    }
  });

  it("defaults to today's date in India, not in UTC", () => {
    // 00:30 IST on 30 Sep is still 29 Sep in UTC.
    expect(todayInIndia(new Date('2026-09-29T19:00:00Z'))).toBe('2026-09-30');
    expect(todayInIndia(new Date('2026-09-29T12:00:00Z'))).toBe('2026-09-29');
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
        is_active: true,
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
        is_active: true,
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
