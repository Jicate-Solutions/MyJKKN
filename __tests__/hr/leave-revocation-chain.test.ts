/**
 * applyRevocation — taking an approval back on the step that granted it.
 *
 * The point of every test here is the same one: a revoked request stores
 * status='rejected', and the ONLY thing that can later explain how it got there
 * is the chain. If the original approval is lost, the audit trail says the
 * request was refused, which is not what happened.
 */

import { describe, expect, it } from 'vitest';

import { applyDecision, applyRevocation, finalStepIndex } from '@/lib/hr/leave/approval-chain';
import type { LeaveApprovalStep } from '@/types/hr';

const APPROVER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function approvedStep(by = APPROVER): LeaveApprovalStep {
  const step: LeaveApprovalStep = {
    step_order: 1,
    approver_role: 'principal',
    approver_user_id: null,
    status: 'pending',
    escalate_after_hours: 48,
    step_type: 'final',
  };
  return applyDecision(step, {
    by,
    at: '2026-09-10T04:00:00.000Z',
    decision: 'approved',
    comment: 'Granted',
  }).step;
}

describe('applyRevocation', () => {
  it('keeps the original approval instead of replacing it', () => {
    const granted = approvedStep();
    expect(granted.status).toBe('approved');
    expect(granted.decisions).toHaveLength(1);

    const revoked = applyRevocation(granted, {
      by: APPROVER,
      at: '2026-09-12T06:00:00.000Z',
      comment: 'Approved in error',
    });

    expect(revoked.decisions).toHaveLength(2);
    expect(revoked.decisions?.[0]).toMatchObject({ by: APPROVER, decision: 'approved' });
    expect(revoked.decisions?.[1]).toMatchObject({ by: APPROVER, decision: 'revoked' });
  });

  it('is what separates it from applyDecision, which would drop the approval', () => {
    const granted = approvedStep();

    // The trap this helper exists to avoid: applyDecision filters out any
    // earlier decision by the same person, so re-deciding as the approver erases
    // the grant from the record.
    const viaApplyDecision = applyDecision(granted, {
      by: APPROVER,
      at: '2026-09-12T06:00:00.000Z',
      decision: 'rejected',
      comment: 'Approved in error',
    }).step;
    expect(viaApplyDecision.decisions).toHaveLength(1);
    expect(viaApplyDecision.decisions?.[0].decision).toBe('rejected');

    const viaApplyRevocation = applyRevocation(granted, {
      by: APPROVER,
      at: '2026-09-12T06:00:00.000Z',
      comment: 'Approved in error',
    });
    expect(viaApplyRevocation.decisions?.some((d) => d.decision === 'approved')).toBe(true);
  });

  it('stamps who revoked it, when, and why', () => {
    const revoked = applyRevocation(approvedStep(), {
      by: OTHER,
      at: '2026-09-12T06:00:00.000Z',
      comment: 'Wrong person',
    });

    expect(revoked.status).toBe('revoked');
    expect(revoked.revoked_by).toBe(OTHER);
    expect(revoked.revoked_at).toBe('2026-09-12T06:00:00.000Z');
    expect(revoked.revoke_reason).toBe('Wrong person');
  });

  it('keeps a colleague’s approval on a parallel step', () => {
    const parallel: LeaveApprovalStep = {
      step_order: 1,
      approver_role: 'hod',
      approver_user_id: null,
      status: 'pending',
      escalate_after_hours: 48,
      step_type: 'final',
      quorum: 'all',
      approvers: [
        { approver_role: 'hod', approver_user_id: APPROVER, approver_name: null },
        { approver_role: 'principal', approver_user_id: OTHER, approver_name: null },
      ],
    };
    const one = applyDecision(parallel, {
      by: APPROVER, at: '2026-09-10T04:00:00.000Z', decision: 'approved', comment: null,
    }).step;
    const both = applyDecision(one, {
      by: OTHER, at: '2026-09-10T05:00:00.000Z', decision: 'approved', comment: null,
    }).step;
    expect(both.status).toBe('approved');

    const revoked = applyRevocation(both, {
      by: OTHER, at: '2026-09-12T06:00:00.000Z', comment: 'Approved in error',
    });

    expect(revoked.decisions).toHaveLength(3);
    expect(revoked.decisions?.filter((d) => d.decision === 'approved')).toHaveLength(2);
  });

  it('leaves finalStepIndex able to find the step it revoked', () => {
    // The service revokes on finalStepIndex(chain); if a 'revoked' status moved
    // that index the next read of the chain would point at the wrong step.
    const chain: LeaveApprovalStep[] = [
      { step_order: 1, approver_role: 'hod', approver_user_id: null, status: 'approved',
        escalate_after_hours: 48, step_type: 'review' },
      approvedStep(),
    ];
    expect(finalStepIndex(chain)).toBe(1);

    chain[1] = applyRevocation(chain[1], {
      by: APPROVER, at: '2026-09-12T06:00:00.000Z', comment: 'Approved in error',
    });
    expect(finalStepIndex(chain)).toBe(1);
  });
});
