/**
 * Regression tests for LeaveOndutyApprovalService.getApprovalTimeline.
 *
 * BUG (reported 2026-08-07 with a screenshot): a learner opened their own
 * successfully-submitted OD — approver rows correctly seeded as
 * hod=Dr. Rajesh K.P -> principal=Dr. KATHIRVEL C, both pending — and the
 * Approval Timeline said "No approval workflow configured".
 *
 * The timeline was built by mapping over flow.flow_steps.
 * get_applicable_approval_flow is SECURITY INVOKER, and
 * leave_onduty_approval_flows' only SELECT policy admits staff roles, never
 * 'student'. So for the applicant the flow came back as an ALL-NULL ROW.
 *
 * Two things then went wrong together:
 *   - `if (!flow) return []` never fired, because PostgREST returns an OBJECT
 *     with null fields for a composite return type — `flow` is truthy.
 *   - `flow.flow_steps` was null, so the step list was empty and the entire
 *     chain vanished from the UI even though both approval rows existed and
 *     were readable by the learner (verified by impersonation in SQL).
 *
 * The timeline is now driven by the seeded approval rows, which the applicant
 * CAN read and which record where the request actually went. The flow is only
 * consulted to enrich (is_required).
 *
 * Also fixed here: `step.role` and `step.description` never existed on a flow
 * step — the JSON carries `approver_role` / `role_name`. The timeline heading
 * renders APPROVER_ROLE_LABELS[step.role], so it was blank for EVERY viewer,
 * staff included.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const APPLICATION_ID = '6f54c53a-cccc-4dea-9030-f6dd70056bea';
const HOD_ID = '5b6c8eaf-4e76-4b24-8431-0286fa7eef14';
const PRINCIPAL_ID = 'ce564f06-6e81-496e-a553-21150b3688ea';

const APPROVAL_ROWS = [
  {
    step_order: 1,
    approver_id: HOD_ID,
    approver_role: 'hod',
    status: 'pending',
    comments: null,
    action_taken_at: null,
    approver: { id: HOD_ID, full_name: 'Dr. Rajesh K.P', email: 'hodece@jkkn.ac.in' },
  },
  {
    step_order: 2,
    approver_id: PRINCIPAL_ID,
    approver_role: 'principal',
    status: 'pending',
    comments: null,
    action_taken_at: null,
    approver: { id: PRINCIPAL_ID, full_name: 'Dr. KATHIRVEL C', email: 'principaljkkncet@jkkn.ac.in' },
  },
];

/** Exactly what PostgREST hands back for a composite return the caller's RLS
 *  filtered away: an object whose every field is null — NOT null itself. */
const FLOW_INVISIBLE_TO_LEARNER = {
  id: null,
  institution_id: null,
  department_id: null,
  semester_id: null,
  category: null,
  sub_category: null,
  flow_steps: null,
  is_active: null,
};

const FLOW_VISIBLE_TO_STAFF = {
  id: 'flow-1',
  flow_steps: [
    { step_order: 1, role_id: 'r1', role_name: 'HOD', approver_role: 'hod', approver_ids: [HOD_ID], is_required: true },
    { step_order: 2, role_id: 'r2', role_name: 'Principal', approver_role: 'principal', approver_ids: [PRINCIPAL_ID], is_required: false },
  ],
};

let activeFlow: any = FLOW_INVISIBLE_TO_LEARNER;
let activeApprovals: any[] = APPROVAL_ROWS;
let currentStep = 1;

function makeClient() {
  return {
    rpc(fn: string, _args: any) {
      if (fn === 'get_applicable_approval_flow') {
        return Promise.resolve({ data: activeFlow, error: null });
      }
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    from(table: string) {
      if (table === 'leave_onduty_applications') {
        const b: any = {
          select: () => b,
          eq: () => b,
          single: () =>
            Promise.resolve({
              data: {
                id: APPLICATION_ID,
                institution_id: 'inst',
                department_id: 'dept',
                semester_id: 'sem',
                category: 'onduty',
                sub_category: 'industrial_visits',
                current_step: currentStep,
                approvals: activeApprovals,
              },
              error: null,
            }),
        };
        return b;
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

vi.mock('./leave-onduty-attendance-integration-service', () => ({
  LeaveOndutyAttendanceIntegrationService: {},
}));

import { LeaveOndutyApprovalService } from '@/lib/services/academic/leave-onduty-approval-service';

beforeEach(() => {
  activeFlow = FLOW_INVISIBLE_TO_LEARNER;
  activeApprovals = APPROVAL_ROWS;
  currentStep = 1;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getApprovalTimeline — applicant view (flow hidden by RLS)', () => {
  it('shows the full chain from the seeded approval rows', async () => {
    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline).toHaveLength(2);
    expect(timeline.map((s) => s.step_order)).toEqual([1, 2]);
    expect(timeline.map((s) => s.role)).toEqual(['hod', 'principal']);
    expect(timeline.map((s) => s.approver_name)).toEqual(['Dr. Rajesh K.P', 'Dr. KATHIRVEL C']);
    expect(timeline.map((s) => s.approver_email)).toEqual([
      'hodece@jkkn.ac.in',
      'principaljkkncet@jkkn.ac.in',
    ]);
  });

  it('marks the application current_step as the live one', async () => {
    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline.map((s) => s.is_current)).toEqual([true, false]);
    expect(timeline.every((s) => s.status === 'pending')).toBe(true);
  });

  it('assumes a step is required when the flow cannot be read', async () => {
    // Downgrading a mandatory approval to "optional" just because the viewer
    // cannot see the flow would misrepresent the process to the learner.
    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline.every((s) => s.is_required)).toBe(true);
  });

  it('orders steps numerically even when the approval rows come back shuffled', async () => {
    activeApprovals = [APPROVAL_ROWS[1], APPROVAL_ROWS[0]];

    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline.map((s) => s.step_order)).toEqual([1, 2]);
    expect(timeline.map((s) => s.role)).toEqual(['hod', 'principal']);
  });

  it('reflects a decision already taken', async () => {
    activeApprovals = [
      { ...APPROVAL_ROWS[0], status: 'approved', action_taken_at: '2026-08-07T10:00:00Z', comments: 'Go ahead' },
      APPROVAL_ROWS[1],
    ];
    currentStep = 2;

    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline[0].status).toBe('approved');
    expect(timeline[0].comments).toBe('Go ahead');
    expect(timeline[0].is_current).toBe(false);
    expect(timeline[1].is_current).toBe(true);
  });
});

describe('getApprovalTimeline — staff view (flow readable)', () => {
  it('takes is_required from the flow when it is visible', async () => {
    activeFlow = FLOW_VISIBLE_TO_STAFF;

    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline.map((s) => s.is_required)).toEqual([true, false]);
    // Role still resolves — it comes from approver_role, never the `role` field
    // that no flow step has ever carried.
    expect(timeline.map((s) => s.role)).toEqual(['hod', 'principal']);
  });

  it('falls back to the flow steps when no approver row exists yet', async () => {
    activeFlow = FLOW_VISIBLE_TO_STAFF;
    activeApprovals = [];

    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline).toHaveLength(2);
    expect(timeline.map((s) => s.role)).toEqual(['hod', 'principal']);
    expect(timeline.every((s) => s.status === 'pending')).toBe(true);
    expect(timeline.every((s) => s.approver_name === null)).toBe(true);
  });
});

describe('getApprovalTimeline — genuinely unconfigured', () => {
  it('returns empty only when there are neither approval rows nor flow steps', async () => {
    activeFlow = FLOW_INVISIBLE_TO_LEARNER;
    activeApprovals = [];

    const timeline = await LeaveOndutyApprovalService.getApprovalTimeline(APPLICATION_ID);

    expect(timeline).toEqual([]);
  });
});
