// @vitest-environment jsdom
/**
 * What the APPLICANT sees after their approved leave is revoked (2026-09-12).
 *
 * This is the screen that shipped wrong: a revocation and a rejection both store
 * status='rejected' and both fill rejection_reason, so LeaveRequestDetail showed
 * somebody whose approved leave had just been taken back a red "Rejection
 * reason" box — telling them it had been refused all along, which is not what
 * happened and does not explain where the leave they were granted went.
 *
 * revoked_at is the ONLY discriminator. Every assertion here exists to stop the
 * row's own `status` being trusted for that question again.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HRLeaveApplicationDetail } from '@/types/hr';

const APPROVER = 'a196f963-8a45-415e-8fe7-f210d147a286';

const app = (p: Partial<HRLeaveApplicationDetail> = {}) => ({
  id: 'app-1',
  hr_organization_id: 'org-1',
  employee_id: 'emp-1',
  leave_type_id: 'lt-cl',
  hr_academic_year_id: 'ay-1',
  start_date: '2026-08-29',
  end_date: '2026-08-29',
  duration_type: 'full' as const,
  start_time: null,
  end_time: null,
  total_days: 1,
  reason: 'personal work',
  documents: [],
  is_emergency: false,
  status: 'rejected' as const,
  approval_chain: [
    {
      step_order: 1,
      approver_role: 'pinned_user',
      approver_user_id: APPROVER,
      approver_name: 'DR. RAJENDIRAN K M',
      status: 'revoked' as const,
      escalate_after_hours: 48,
      step_type: 'final' as const,
      decided_at: '2026-09-05T04:29:01.222Z',
      decided_by: APPROVER,
      revoked_by: APPROVER,
      revoked_at: '2026-09-12T06:57:14.576Z',
      revoke_reason: 'testing',
      decisions: [
        { by: APPROVER, at: '2026-09-05T04:29:01.222Z', decision: 'approved' as const, comment: null },
        { by: APPROVER, at: '2026-09-12T06:57:14.576Z', decision: 'revoked' as const, comment: 'testing' },
      ],
    },
  ],
  current_step: 1,
  final_approver_id: APPROVER,
  final_decided_at: '2026-09-12T06:57:14.576Z',
  rejection_reason: 'testing',
  revoked_at: '2026-09-12T06:57:14.576Z',
  revoked_by: APPROVER,
  revoke_reason: 'testing',
  applied_by: 'prof-applicant',
  superseded_by: null,
  created_at: '2026-09-02T11:04:22.000Z',
  updated_at: '2026-09-12T06:57:14.576Z',
  applicant: { name: 'BOOBALAN A', staff_code: 'NOTJMO056' },
  chain_names: { people: { [APPROVER]: 'DR. RAJENDIRAN K M' }, roles: {} },
  ...p,
}) as unknown as HRLeaveApplicationDetail;

const current = { value: app() };

vi.mock('@/hooks/hr/use-leave', () => ({
  useApplication: () => ({ data: current.value, isLoading: false }),
  useWithdrawApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/app/(routes)/hr/leave/_components/leave-document-list', () => ({
  LeaveDocumentList: () => null,
}));

import { LeaveRequestDetail } from '@/app/(routes)/hr/leave/_components/leave-request-detail';

afterEach(cleanup);

describe('an applicant reading a revoked request', () => {
  it('says the approval was revoked, not that the request was rejected', () => {
    current.value = app();
    render(<LeaveRequestDetail applicationId="app-1" leaveTypeName="Casual Leave" />);

    expect(screen.getByText(/This approval was revoked/)).toBeInTheDocument();
    expect(screen.getByText(/by DR\. RAJENDIRAN K M/)).toBeInTheDocument();
    expect(screen.queryByText('Rejection reason')).toBeNull();
    // The badge reads the revocation, never the raw 'rejected' status. ('Revoked'
    // legitimately appears more than once — header badge, field label, step badge.)
    expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Rejected')).toHaveLength(0);
  });

  it('labels the timestamp Revoked, not Decided', () => {
    current.value = app();
    render(<LeaveRequestDetail applicationId="app-1" leaveTypeName="Casual Leave" />);
    const labels = screen.getAllByText('Revoked').map((el) => el.tagName);
    expect(labels).toContain('DT');
    expect(screen.queryByText('Decided')).toBeNull();
  });

  it('renders the chain as revoked, keeping the original approval visible', () => {
    current.value = app();
    render(<LeaveRequestDetail applicationId="app-1" leaveTypeName="Casual Leave" />);

    // Both decisions survive: a chain that forgets the grant cannot explain how
    // the request reached 'rejected'.
    expect(screen.getAllByText(/^approved ·/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^revoked the approval ·/).length).toBeGreaterThan(0);
    // The step is NOT 'Not reached' — the shipped bug, from a status the badge
    // map did not know.
    expect(screen.queryByText('Not reached')).toBeNull();
  });

  it('still shows a plain rejection as a rejection', () => {
    current.value = app({
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      rejection_reason: 'exam week',
      approval_chain: [
        {
          step_order: 1,
          approver_role: 'pinned_user',
          approver_user_id: APPROVER,
          approver_name: 'DR. RAJENDIRAN K M',
          status: 'rejected',
          escalate_after_hours: 48,
          step_type: 'final',
          decided_at: '2026-09-05T04:29:01.222Z',
          decided_by: APPROVER,
          comment: 'exam week',
        },
      ],
    } as Partial<HRLeaveApplicationDetail>);
    render(<LeaveRequestDetail applicationId="app-1" leaveTypeName="Casual Leave" />);

    expect(screen.getByText('Rejection reason')).toBeInTheDocument();
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
    expect(screen.queryByText(/This approval was revoked/)).toBeNull();
    expect(screen.queryAllByText('Revoked')).toHaveLength(0);
  });
});
