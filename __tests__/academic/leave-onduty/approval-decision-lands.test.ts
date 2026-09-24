// __tests__/academic/leave-onduty/approval-decision-lands.test.ts
//
// A learner's leave / on-duty chain must actually move when an approver acts,
// and attendance must be credited only once the application has really become
// 'approved'.
//
// THE DEFECT THESE TESTS PIN (production, 2026-09-24): processApproval ran in
// the browser under the approver's login and wrote
// leave_onduty_applications.current_step / .status directly. That table's
// UPDATE policies admit only super_admin / admin / institution_admin, the
// learner and the sponsor, so for a faculty / HOD / principal those writes
// matched 0 rows WITHOUT an error. The step flipped to 'approved', the screen
// said "approved successfully", the chain never advanced, and on the final
// step the attendance write still ran. 3 of 150 applications were ever
// approved, all by a super admin.
//
// The fake client below enforces those same production UPDATE rules, so a
// silent 0-row write is silent here too. The server-side function itself is
// proved against real PostgreSQL in leave-onduty-decide-step.pg.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const attendanceSpy = vi.fn();
vi.mock('@/lib/services/academic/leave-onduty-attendance-integration-service', () => ({
  LeaveOndutyAttendanceIntegrationService: {
    updateAttendanceOnApproval: (...args: unknown[]) => attendanceSpy(...args),
  },
}));

vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityClient: vi.fn(async () => undefined),
  AcademicActivityTemplates: {
    leaveOndutyApplicationApproved: () => ({ actionType: 'a', resourceType: 'r', description: 'd', sub_type: 's' }),
    leaveOndutyApplicationRejected: () => ({ actionType: 'a', resourceType: 'r', description: 'd', sub_type: 's' }),
  },
}));

// ─── an in-memory database with production's UPDATE rules ──────────────────

type Row = Record<string, any>;

const ADMIN_ROLES = ['super_admin', 'admin', 'institution_admin'];

let db: {
  profiles: Row[];
  applications: Row[];
  approvals: Row[];
};
let actingUid = '';
/** What fn_leave_onduty_decide_step does, or a stand-in for a broken server. */
let decideStepRpc: (args: Row) => { data: any; error: any };

function actingRole(): string | undefined {
  return db.profiles.find((p) => p.id === actingUid)?.role;
}

/** leave_onduty_applications: admins_update_applications only (learner/sponsor are not in play here). */
function canUpdateApplication(): boolean {
  return ADMIN_ROLES.includes(actingRole() ?? '');
}

/** leave_onduty_approvals: approvers_update_own. */
function canUpdateApproval(row: Row): boolean {
  return row.approver_id === actingUid && row.status === 'pending';
}

function tableRows(table: string): Row[] {
  if (table === 'profiles') return db.profiles;
  if (table === 'leave_onduty_applications') return db.applications;
  if (table === 'leave_onduty_approvals') return db.approvals;
  throw new Error(`unexpected table ${table}`);
}

function thenable<T>(value: () => T) {
  return {
    then(resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) {
      try {
        return Promise.resolve(value()).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    },
  };
}

function from(table: string) {
  return {
    select(cols?: string) {
      const filters: Array<[string, unknown]> = [];
      const q: any = {
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return q;
        },
        single() {
          return thenable(() => {
            const row = tableRows(table).find((r) => filters.every(([c, v]) => r[c] === v));
            if (!row) return { data: null, error: { message: 'not found' } };
            if (table === 'leave_onduty_applications' && cols?.includes('approvals')) {
              return {
                data: { ...row, approvals: db.approvals.filter((a) => a.application_id === row.id) },
                error: null,
              };
            }
            return { data: { ...row }, error: null };
          });
        },
      };
      return q;
    },
    update(patch: Row) {
      let target: Row[] = [];
      const apply = (col: string, val: unknown) => {
        target = tableRows(table).filter((r) => r[col] === val);
        const allowed = target.filter((r) =>
          table === 'leave_onduty_applications'
            ? canUpdateApplication()
            : table === 'leave_onduty_approvals'
              ? canUpdateApproval(r)
              : false
        );
        for (const r of allowed) Object.assign(r, patch);
        return allowed;
      };
      return {
        eq(col: string, val: unknown) {
          let landed: Row[] | null = null;
          const run = () => (landed ??= apply(col, val));
          return {
            // PostgREST: a write refused by RLS is 0 rows and NO error.
            then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
              run();
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
            select() {
              return thenable(() => ({ data: run().map((r) => ({ ...r })), error: null }));
            },
          };
        },
      };
    },
    insert(row: Row) {
      return thenable(() => {
        if (table !== 'leave_onduty_approvals') throw new Error(`unexpected insert into ${table}`);
        db.approvals.push({ id: `appr-${db.approvals.length + 1}`, ...row });
        return { data: null, error: null };
      });
    },
  };
}

const flow = {
  id: 'flow-1',
  flow_type: 'sequential',
  flow_steps: [
    { step_order: 1, approver_role: 'hod', is_required: true },
    { step_order: 2, approver_role: 'principal', is_required: true },
  ],
};

const fakeClient = {
  from,
  rpc(name: string, args: Row) {
    return thenable(() => {
      if (name === 'get_applicable_approval_flow') return { data: flow, error: null };
      if (name === 'fn_leave_onduty_decide_step') return decideStepRpc(args);
      throw new Error(`unexpected rpc ${name}`);
    });
  },
};

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => fakeClient,
}));

/**
 * A minimal stand-in for the server function: it runs as the definer, so the
 * table's UPDATE rules do not apply to it. Its real behaviour is proved in the
 * .pg.test.ts suite; here it only has to report the stored state honestly.
 */
function serverDecideStep(args: Row) {
  const app = db.applications.find((a) => a.id === args.p_application_id)!;
  const pending = db.approvals
    .filter((a) => a.application_id === app.id && a.status === 'pending')
    .sort((x, y) => x.step_order - y.step_order);
  const current = pending[0]?.step_order;
  const mine = pending.find((a) => a.approver_id === actingUid && a.step_order === current);
  if (!mine) {
    return {
      data: null,
      error: { message: "You are not the approver for this application's current step", code: '42501' },
    };
  }
  mine.status = args.p_decision;
  if (args.p_decision === 'rejected') {
    app.status = 'rejected';
  } else {
    const next = db.approvals
      .filter((a) => a.application_id === app.id && a.status === 'pending')
      .sort((x, y) => x.step_order - y.step_order)[0]?.step_order;
    if (next === undefined) app.status = 'approved';
    else app.current_step = next;
  }
  return {
    data: {
      application_id: app.id,
      decision: args.p_decision,
      decided_step: mine.step_order,
      step_status: mine.status,
      status: app.status,
      current_step: app.current_step,
    },
    error: null,
  };
}

import { LeaveOndutyApprovalService } from '@/lib/services/academic/leave-onduty-approval-service';

const APP = 'app-1';
const HOD = 'u-hod';
const PRINCIPAL = 'u-principal';
const SUPER = 'u-super';

beforeEach(() => {
  attendanceSpy.mockReset();
  attendanceSpy.mockResolvedValue(undefined);
  decideStepRpc = serverDecideStep;
  db = {
    profiles: [
      { id: HOD, role: 'hod' },
      { id: PRINCIPAL, role: 'principal' },
      { id: SUPER, role: 'super_admin' },
    ],
    applications: [
      {
        id: APP,
        learner_id: 'learner-1',
        institution_id: 'inst-1',
        department_id: 'dept-1',
        semester_id: 'sem-1',
        category: 'onduty',
        sub_category: 'event_participation',
        status: 'pending',
        current_step: 1,
        sponsor_approval_status: null,
      },
    ],
    approvals: [
      { id: 'appr-1', application_id: APP, step_order: 1, approver_id: HOD, approver_role: 'hod', status: 'pending' },
      { id: 'appr-2', application_id: APP, step_order: 2, approver_id: PRINCIPAL, approver_role: 'principal', status: 'pending' },
    ],
  };
});

const app = () => db.applications[0];

async function act(uid: string, status: 'approved' | 'rejected') {
  actingUid = uid;
  return LeaveOndutyApprovalService.processApproval({
    application_id: APP,
    approver_id: uid,
    status,
    comments: '',
  });
}

describe('an approver (not an admin) acting on their own step', () => {
  it('HOD approval of step 1 moves the application on to step 2 — not a silent no-op', async () => {
    await act(HOD, 'approved');

    expect(app().current_step).toBe(2);
    expect(app().status).toBe('pending');
    expect(attendanceSpy).not.toHaveBeenCalled();
  });

  it('the final approver makes the application approved, and only then is attendance credited', async () => {
    await act(HOD, 'approved');
    await act(PRINCIPAL, 'approved');

    expect(app().status).toBe('approved');
    expect(attendanceSpy).toHaveBeenCalledTimes(1);
    expect(attendanceSpy).toHaveBeenCalledWith(APP);
  });

  it('a rejection by the HOD really rejects the application', async () => {
    await act(HOD, 'rejected');

    expect(app().status).toBe('rejected');
    expect(attendanceSpy).not.toHaveBeenCalled();
  });

  it('when the server cannot record the decision, it is an explicit error and attendance is never written', async () => {
    // Step 2 of 2: the old code judged "last step" and wrote attendance even
    // though its 'approved' status update was refused under RLS.
    db.approvals[0].status = 'approved';
    app().current_step = 2;
    decideStepRpc = () => ({
      data: null,
      error: { message: 'Could not find the function public.fn_leave_onduty_decide_step', code: 'PGRST202' },
    });

    await expect(act(PRINCIPAL, 'approved')).rejects.toThrow(/fn_leave_onduty_decide_step/);
    expect(app().status).toBe('pending');
    expect(attendanceSpy).not.toHaveBeenCalled();
  });

  it('a reply that does not prove the step was stored is refused, never reported as success', async () => {
    decideStepRpc = (args) => ({
      data: {
        application_id: args.p_application_id,
        decision: args.p_decision,
        decided_step: 1,
        step_status: 'pending',
        status: 'pending',
        current_step: 1,
      },
      error: null,
    });

    await expect(act(HOD, 'approved')).rejects.toThrow(/not saved/);
    expect(attendanceSpy).not.toHaveBeenCalled();
  });

  it('an empty reply is refused too', async () => {
    decideStepRpc = () => ({ data: null, error: null });

    await expect(act(HOD, 'approved')).rejects.toThrow(/not saved/);
  });

  it("the server's refusal reaches the approver word for word (e.g. acting out of turn)", async () => {
    await expect(act(PRINCIPAL, 'approved')).rejects.toThrow(
      "You are not the approver for this application's current step"
    );
    expect(app().status).toBe('pending');
    expect(db.approvals[1].status).toBe('pending');
  });
});

describe('super admin override', () => {
  it('approves directly and credits attendance once the approved status has landed', async () => {
    await act(SUPER, 'approved');

    expect(app().status).toBe('approved');
    expect(attendanceSpy).toHaveBeenCalledTimes(1);
  });

  it('does not write attendance when the approved status did not land (0 rows, no error)', async () => {
    // The table refuses the write anyway (e.g. the account lost the role
    // after the page loaded). PostgREST answers with 0 rows and no error.
    const refusedFrom = (table: string) => {
      const builder = from(table);
      if (table !== 'leave_onduty_applications') return builder;
      return {
        ...builder,
        update: () => ({
          eq: () => ({
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
            select: () => thenable(() => ({ data: [], error: null })),
          }),
        }),
      };
    };
    fakeClient.from = refusedFrom as typeof from;
    try {
      await expect(act(SUPER, 'approved')).rejects.toThrow(/not saved/);
      expect(app().status).toBe('pending');
      expect(attendanceSpy).not.toHaveBeenCalled();
    } finally {
      fakeClient.from = from;
    }
  });
});
