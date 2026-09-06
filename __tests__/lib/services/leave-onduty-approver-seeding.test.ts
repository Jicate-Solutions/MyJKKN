/**
 * Regression tests for approver seeding in LeaveOndutyService.createApplication.
 *
 * BUG (reported 2026-08-07, JKKNCET ECE learner): submitting an OD failed with
 * "No approver is set up for your class yet…" even for cohorts that had a
 * perfectly good approval flow configured.
 *
 * createApplication runs in the BROWSER (getSupabase() is
 * createClientSupabaseClient, application-form.tsx is a client component), so
 * every statement carries the learner's own JWT. Two RLS layers blocked the
 * applicant, both reproduced by impersonating the reporter in SQL:
 *
 *   1. get_applicable_approval_flow is SECURITY INVOKER, so RLS on
 *      leave_onduty_approval_flows applied. That table's only SELECT policy
 *      excludes 'student', so EVERY learner resolved a NULL flow and was
 *      refused — including an AHS learner whose cohort had flow 02d8bc8e….
 *   2. The client then inserted the approver rows itself, which
 *      leave_onduty_approvals' INSERT policy rejects for a learner naming their
 *      HOD/Principal (42501: new row violates row-level security policy).
 *
 * Seeding therefore moved server-side into fn_seed_application_approvals
 * (SECURITY DEFINER, migration 20260815050000). Widening RLS instead would have
 * let a learner name ANY approver, including themselves.
 *
 * These tests pin the CLIENT contract: createApplication must delegate seeding
 * to the RPC, must never write leave_onduty_approvals itself, and must roll the
 * application back rather than strand it whenever no chain could be built.
 * Approver RESOLUTION (pinned approver_ids -> legacy approver_id -> role
 * lookup) now lives in SQL and is verified against the database directly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const LEARNER_ID = 'db3f0149-4113-4c5a-ad1e-4a452adef7a6';
const INSTITUTION_ID = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const SEMESTER_ID = 'd15bc8fe-70e4-4bc6-8877-38e6572d33ef';
const SECTION_ID = '3896c106-229f-496d-8552-50823e615c56';
const DEPARTMENT_ID = '57047edf-b70b-4785-b68a-52b8880cad2a';
const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';

// 2026-08-13 is a Thursday, far enough ahead that the backdate rule in
// validateApplicationData does not reject it.
const APPLY_DATE = '2026-08-13';
const PERIOD_ID = 'd0f0d519-43ef-467b-8385-fcc961185b93';
const COURSE_ID = 'd990aed1-95b2-4f18-86f8-f9223dc3d8ec';

const TIMETABLE = {
  id: '288dae4a-e4d7-457e-a276-659b4a4d4448',
  section_id: SECTION_ID,
  semester_id: SEMESTER_ID,
  is_active: true,
  timetable_format: 'regular',
  selected_dates: null,
  timetable_data: {
    THURSDAY: { [PERIOD_ID]: { slot_id: 's1', course_id: COURSE_ID, is_break_slot: false } },
  },
};

const PERIOD_ROWS = [
  { id: PERIOD_ID, period_name: 'CET P1', start_time: '09:15:00', end_time: '10:00:00', is_break: false },
];

/** What fn_seed_application_approvals returns. Swapped per test. */
let seedResult: { data: number | null; error: any } = { data: 2, error: null };
/** Every rpc(name, args) the service made. */
let rpcCalls: Array<{ fn: string; args: any }> = [];
/** Applications the service deleted (the rollback path). */
let deletedApplicationIds: string[] = [];
/** Tables the service wrote to directly — must never include approvals. */
let insertedTables: string[] = [];
/** Whether the sub-category demands sponsor pre-approval. */
let requiresSponsorApproval = false;

function makeClient() {
  const thenable = (result: any) => ({
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  });

  return {
    rpc(fn: string, args: any) {
      rpcCalls.push({ fn, args });
      if (fn === 'fn_seed_application_approvals') return Promise.resolve(seedResult);
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    from(table: string) {
      if (table === 'learners_profiles') {
        const b: any = {
          select: () => b,
          eq: () => b,
          single: () =>
            Promise.resolve({
              data: {
                department_id: DEPARTMENT_ID,
                semester_id: SEMESTER_ID,
                section_id: SECTION_ID,
              },
              error: null,
            }),
        };
        return b;
      }

      if (table === 'timetables') {
        const b: any = {
          select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
          maybeSingle: () => Promise.resolve({ data: TIMETABLE, error: null }),
        };
        return b;
      }

      if (table === 'periods') {
        return {
          select: () => ({
            in: (_c: string, ids: string[]) =>
              Promise.resolve({ data: PERIOD_ROWS.filter((r) => ids.includes(r.id)), error: null }),
          }),
        };
      }

      if (table === 'courses') {
        return {
          select: () => ({
            in: (_c: string, ids: string[]) =>
              Promise.resolve({
                data: ids.includes(COURSE_ID)
                  ? [{ id: COURSE_ID, course_name: 'Signals', course_code: 'EC101' }]
                  : [],
                error: null,
              }),
          }),
        };
      }

      if (table === 'leave_onduty_sub_categories') {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: () =>
            Promise.resolve({
              data: { requires_sponsor_approval: requiresSponsorApproval },
              error: null,
            }),
        };
        return b;
      }

      if (table === 'leave_onduty_applications') {
        const b: any = {
          insert: () => { insertedTables.push(table); return b; },
          select: () => b,
          single: () => Promise.resolve({ data: { id: APPLICATION_ID }, error: null }),
          delete: () => ({
            eq: (_c: string, id: string) => {
              deletedApplicationIds.push(id);
              return thenable({ error: null });
            },
          }),
        };
        return b;
      }

      // Reaching either of these means the client is doing seeding work that
      // now belongs to the database — the exact thing RLS rejected.
      if (table === 'leave_onduty_approvals' || table === 'profiles') {
        insertedTables.push(table);
        throw new Error(`createApplication must not touch "${table}" directly`);
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => makeClient(),
}));

vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityClient: vi.fn(),
  AcademicActivityTemplates: {},
}));

import { LeaveOndutyService } from '@/lib/services/academic/leave-onduty-service';

const APPLICATION_INPUT: any = {
  category: 'onduty',
  sub_category: 'industrial_visits',
  start_date: APPLY_DATE,
  end_date: APPLY_DATE,
  period_type: 'fullday',
  selected_periods: [],
  reason: 'Industrial visit',
  applicable_type: 'individual',
};

beforeEach(() => {
  seedResult = { data: 2, error: null };
  rpcCalls = [];
  deletedApplicationIds = [];
  insertedTables = [];
  requiresSponsorApproval = false;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createApplication — approver seeding', () => {
  it('delegates seeding to fn_seed_application_approvals for the new application', async () => {
    const app = await LeaveOndutyService.createApplication(
      APPLICATION_INPUT, LEARNER_ID, INSTITUTION_ID
    );

    expect(app).toEqual({ id: APPLICATION_ID });
    expect(rpcCalls).toEqual([
      { fn: 'fn_seed_application_approvals', args: { p_application_id: APPLICATION_ID } },
    ]);
    expect(deletedApplicationIds).toEqual([]);
  });

  it('never writes leave_onduty_approvals or reads profiles from the client', async () => {
    await LeaveOndutyService.createApplication(APPLICATION_INPUT, LEARNER_ID, INSTITUTION_ID);

    // The mock throws on those tables; reaching here proves neither was touched.
    expect(insertedTables).toEqual(['leave_onduty_applications']);
  });

  it('rolls the application back and refuses when no approver could be seeded', async () => {
    seedResult = { data: 0, error: null };

    await expect(
      LeaveOndutyService.createApplication(APPLICATION_INPUT, LEARNER_ID, INSTITUTION_ID)
    ).rejects.toThrow(/No approver is set up/i);

    expect(deletedApplicationIds).toEqual([APPLICATION_ID]);
  });

  it('rolls the application back when the seeding call itself fails', async () => {
    seedResult = { data: null, error: { message: 'permission denied' } };

    await expect(
      LeaveOndutyService.createApplication(APPLICATION_INPUT, LEARNER_ID, INSTITUTION_ID)
    ).rejects.toThrow(/Failed to seed approvers: permission denied/);

    expect(deletedApplicationIds).toEqual([APPLICATION_ID]);
  });

  it('treats a non-numeric seed result as zero rather than silently accepting', async () => {
    seedResult = { data: null, error: null };

    await expect(
      LeaveOndutyService.createApplication(APPLICATION_INPUT, LEARNER_ID, INSTITUTION_ID)
    ).rejects.toThrow(/No approver is set up/i);

    expect(deletedApplicationIds).toEqual([APPLICATION_ID]);
  });

  it('skips seeding entirely for a sponsor-gated sub-category', async () => {
    // The academic chain is seeded after the sponsor approves, so zero approvers
    // at creation is expected here and must NOT trigger the rollback.
    requiresSponsorApproval = true;

    const app = await LeaveOndutyService.createApplication(
      { ...APPLICATION_INPUT, sponsor_id: '33333333-3333-4333-8333-333333333333' },
      LEARNER_ID,
      INSTITUTION_ID
    );

    expect(app).toEqual({ id: APPLICATION_ID });
    expect(rpcCalls).toEqual([]);
    expect(deletedApplicationIds).toEqual([]);
  });
});
