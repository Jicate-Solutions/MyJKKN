// @vitest-environment jsdom
/**
 * Regression guard for the Leave Types detail modal naming only ONE approver.
 *
 * A step holds a SET of approvers since 2026-08-31, and the group defaults seed
 * Casual Leave as one final step -> [Principal, CAO], quorum 'any'. The modal
 * read only the step's legacy singular fields, which the save path fills from
 * the FIRST approver, so it printed "Principal" and dropped the CAO — while the
 * editor, the frozen chain and the database gate all carried both. Measured
 * 2026-09-11: 19 of 67 live leave flows have a multi-approver step.
 *
 * The modal now reads the flow through buildChain(), the same builder that
 * freezes the chain onto an application, so what it lists is what applies.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HRLeaveType, LeaveApprovalFlow } from '@/types/hr-leave-types';

const flowMock = vi.fn();

vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/hr/use-hr-org-mappings', () => ({
  useHrOrgMappings: () => ({ orgNameById: new Map<string, string>() }),
}));
vi.mock('@/hooks/hr/use-leave-approval-flows', () => ({
  useLeaveApprovalFlow: () => flowMock(),
  useLeaveApproverRoles: () => ({
    data: [
      { role_key: 'principal', role_name: 'Principal', user_count: 13, grants_approve: false },
      { role_key: 'cao', role_name: 'Chief Administrative Officer', user_count: 1, grants_approve: false },
      { role_key: 'hod', role_name: 'Head of Department', user_count: 94, grants_approve: false },
    ],
  }),
}));

import { LeaveTypeDetailDialog } from '@/app/(routes)/hr/admin/leave-types/_components/leave-type-detail-dialog';

const leaveType = {
  id: 'lt-cl', hr_organization_id: 'org-cet', leave_type_name: 'Casual Leave',
  leave_type_code: 'CL', color_code: '#2563eb', request_category: 'leave',
  is_active: true, display_order: 1, description: null,
  default_entitled_days: 12, accrual_type: 'none', accrual_rate: 0,
  allow_carry_forward: false, max_carry_forward_days: null,
  is_encashable: false, max_encashable_days: null,
  duration_type: 'full_day', allow_half_day: true, allow_hourly: false,
  skip_weekends: true, skip_holidays: true, requires_approval: true,
  min_advance_notice_days: 0, max_continuous_days: 2, requires_documents: false,
  document_required_after_days: null, applicable_gender: 'all',
  applicable_cadre_ids: [], valid_from: '2026-04-01', valid_until: null,
} as unknown as HRLeaveType;

const role = (approver_role: string) => ({ approver_role, approver_user_id: null, approver_name: null });

function flow(p: Partial<LeaveApprovalFlow>): LeaveApprovalFlow {
  return {
    id: 'flow-1', hr_organization_id: 'org-cet', flow_name: 'Casual Leave approval',
    conditions: { leave_type_id: 'lt-cl' }, steps: [], is_active: true,
    escalate_after_hours: 48, step_source: 'explicit', run_mode: 'sequential',
    role_ladder: [], fallback_approver: null, ...p,
  };
}

function renderWith(f: LeaveApprovalFlow) {
  flowMock.mockReturnValue({ data: { own: f, fallback: null, effective: f }, isLoading: false });
  render(
    <LeaveTypeDetailDialog
      leaveType={leaveType} open onOpenChange={() => {}}
      canManage={false} onEdit={() => {}} onAssign={() => {}}
    />
  );
  return within(screen.getByTestId('approval-flow-steps'));
}

afterEach(() => { cleanup(); flowMock.mockReset(); });

describe('Leave type detail — approvers on a step', () => {
  it('lists EVERY approver on a multi-approver step, not just the first', () => {
    const list = renderWith(flow({
      steps: [{
        chain_order: 1, step_type: 'final', quorum: 'any',
        approvers: [role('principal'), role('cao')],
        // What the save path writes: the singular fields mirror approver #1 only.
        approver_role: 'principal', approver_user_id: null, approver_name: null,
        escalate_after_hours: 48,
      }],
    }));

    expect(list.getByText('Principal')).toBeInTheDocument();
    expect(list.getByText('Chief Administrative Officer')).toBeInTheDocument();
    expect(list.getByText(/any one of them can approve/i)).toBeInTheDocument();
  });

  it("states an 'all' quorum", () => {
    const list = renderWith(flow({
      steps: [{
        chain_order: 1, step_type: 'final', quorum: 'all',
        approvers: [role('principal'), role('cao')],
        approver_role: 'principal', approver_user_id: null, approver_name: null,
        escalate_after_hours: 48,
      }],
    }));

    expect(list.getByText(/all of them must approve/i)).toBeInTheDocument();
  });

  it('keeps a legacy single-approver step reading as its ROLE, not its generic label', () => {
    // The seeded catch-alls carry approver_name 'HR / Approving Authority' on a
    // role step. That is a label, not a person, and must not be shown as one.
    const list = renderWith(flow({
      steps: [{
        chain_order: 1, step_type: 'final',
        approver_role: 'principal', approver_user_id: null,
        approver_name: 'HR / Approving Authority', escalate_after_hours: 48,
      }],
    }));

    expect(list.getByText('Principal')).toBeInTheDocument();
    expect(list.queryByText('HR / Approving Authority')).not.toBeInTheDocument();
  });

  it('shows a review step and the final step in order', () => {
    const list = renderWith(flow({
      steps: [
        { chain_order: 1, step_type: 'review', approvers: [role('hod')],
          approver_role: 'hod', approver_user_id: null, approver_name: null, escalate_after_hours: 48 },
        { chain_order: 2, step_type: 'final', approvers: [role('cao')],
          approver_role: 'cao', approver_user_id: null, approver_name: null, escalate_after_hours: 48 },
      ],
    }));

    const items = list.getAllByRole('listitem').filter((li) => li.dataset.step);
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Head of Department')).toBeInTheDocument();
    expect(within(items[0]).getByText('Reviews')).toBeInTheDocument();
    expect(within(items[1]).getByText('Chief Administrative Officer')).toBeInTheDocument();
    expect(within(items[1]).getByText('Approves')).toBeInTheDocument();
  });

  it('shows a parallel flow as the ONE step it becomes at apply time', () => {
    const list = renderWith(flow({
      run_mode: 'parallel',
      steps: [
        { chain_order: 1, step_type: 'review', quorum: 'any', approvers: [role('hod')],
          approver_role: 'hod', approver_user_id: null, approver_name: null, escalate_after_hours: 48 },
        { chain_order: 2, step_type: 'final', approvers: [role('principal')],
          approver_role: 'principal', approver_user_id: null, approver_name: null, escalate_after_hours: 48 },
      ],
    }));

    const items = list.getAllByRole('listitem').filter((li) => li.dataset.step);
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText('Head of Department')).toBeInTheDocument();
    expect(within(items[0]).getByText('Principal')).toBeInTheDocument();
  });

  it('does not call a role-ladder flow incomplete just because it stores no steps', () => {
    const list = renderWith(flow({
      step_source: 'role_ladder', role_ladder: ['hod', 'principal'], steps: [],
    }));

    expect(screen.queryByText(/can never complete/i)).not.toBeInTheDocument();
    expect(list.getByText('Head of Department')).toBeInTheDocument();
    expect(list.getByText('Principal')).toBeInTheDocument();
  });
});
