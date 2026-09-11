// __tests__/resource-management/approval-chain.test.ts
// BUG-004008 — the approvals queue offered an Approve button out of turn.
// These cover the pure turn-taking helper that mirrors the sequential gate in
// supabase/migrations/20260619150000_fix_reservation_approval_sequential_level_drift.sql

import { describe, it, expect } from 'vitest';
import {
  evaluateApprovalTurn,
  isSequentialApprovalBlockError
} from '@/lib/services/reservation/approval-chain';
import type { ApprovalConfiguration } from '@/types/resource-management';

const LEVEL_1 = 'user-level-1';
const LEVEL_2 = 'user-level-2';
const OUTSIDER = 'user-outsider';

function config(overrides: Partial<ApprovalConfiguration> = {}): ApprovalConfiguration {
  return {
    enabled: true,
    approvers: [
      { id: 'a1', user_id: LEVEL_1, level: 1, is_required: true },
      { id: 'a2', user_id: LEVEL_2, level: 2, is_required: true }
    ],
    ...overrides
  };
}

describe('evaluateApprovalTurn', () => {
  it('blocks a level-2 approver while level 1 is still pending and names level 1', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config(),
      approvals: [
        { approver_user_id: LEVEL_1, approval_level: 1, status: 'pending' },
        { approver_user_id: LEVEL_2, approval_level: 2, status: 'pending' }
      ],
      userId: LEVEL_2
    });

    expect(turn.state).toBe('waiting_for_level');
    expect(turn.can_approve).toBe(false);
    expect(turn.waiting_for_level).toBe(1);
    expect(turn.my_level).toBe(2);
  });

  it('allows the level-1 approver to act first', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config(),
      approvals: [
        { approver_user_id: LEVEL_1, approval_level: 1, status: 'pending' },
        { approver_user_id: LEVEL_2, approval_level: 2, status: 'pending' }
      ],
      userId: LEVEL_1
    });

    expect(turn.state).toBe('can_approve');
    expect(turn.can_approve).toBe(true);
    expect(turn.waiting_for_level).toBeNull();
  });

  it('unblocks level 2 once level 1 has approved', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config(),
      approvals: [
        { approver_user_id: LEVEL_1, approval_level: 1, status: 'approved' },
        { approver_user_id: LEVEL_2, approval_level: 2, status: 'pending' }
      ],
      userId: LEVEL_2
    });

    expect(turn.state).toBe('can_approve');
    expect(turn.can_approve).toBe(true);
  });

  it('reports already_acted for an approver who has recorded a decision', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config(),
      approvals: [
        { approver_user_id: LEVEL_1, approval_level: 1, status: 'approved' }
      ],
      userId: LEVEL_1
    });

    expect(turn.state).toBe('already_acted');
    expect(turn.can_approve).toBe(false);
  });

  it('reports not_an_approver for a user outside the chain', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config(),
      approvals: [],
      userId: OUTSIDER
    });

    expect(turn.state).toBe('not_an_approver');
    expect(turn.can_approve).toBe(false);
  });

  it('lets a super admin outside the chain act', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config(),
      approvals: [],
      userId: OUTSIDER,
      isSuperAdmin: true
    });

    expect(turn.state).toBe('can_approve');
    expect(turn.can_approve).toBe(true);
  });

  it('still gates a super admin who IS in the chain, as the database does', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config(),
      approvals: [],
      userId: LEVEL_2,
      isSuperAdmin: true
    });

    expect(turn.state).toBe('waiting_for_level');
    expect(turn.waiting_for_level).toBe(1);
  });

  it('does not block when the chain is parallel', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: config({ approval_type: 'parallel' as any }),
      approvals: [],
      userId: LEVEL_2
    });

    expect(turn.state).toBe('can_approve');
    expect(turn.can_approve).toBe(true);
  });

  it('defaults a missing approval_type to sequential', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: { approvers: config().approvers },
      approvals: [],
      userId: LEVEL_2
    });

    expect(turn.state).toBe('waiting_for_level');
    expect(turn.waiting_for_level).toBe(1);
  });

  it('treats an empty or missing config as not_an_approver', () => {
    expect(
      evaluateApprovalTurn({ approvalConfig: null, approvals: [], userId: LEVEL_1 }).state
    ).toBe('not_an_approver');
    expect(
      evaluateApprovalTurn({ approvalConfig: config(), approvals: [], userId: undefined }).state
    ).toBe('not_an_approver');
  });

  it('ignores role-only approver entries when matching the current user', () => {
    const turn = evaluateApprovalTurn({
      approvalConfig: {
        approvers: [
          { id: 'r1', role_key: 'warden', level: 1, is_required: true },
          { id: 'a2', user_id: LEVEL_2, level: 2, is_required: true }
        ]
      },
      approvals: [],
      userId: LEVEL_2
    });

    // The role entry has no user_id, so it can never be satisfied by an
    // approved row keyed on user_id — level 2 must still wait on level 1.
    expect(turn.state).toBe('waiting_for_level');
    expect(turn.waiting_for_level).toBe(1);
  });
});

describe('isSequentialApprovalBlockError', () => {
  it('recognises the database sequential-gate error', () => {
    expect(
      isSequentialApprovalBlockError({
        code: 'P0001',
        message:
          'Approval at level 1 is still pending; you cannot approve at level 2 yet'
      })
    ).toBe(true);
  });

  it('does not swallow other P0001 errors', () => {
    expect(
      isSequentialApprovalBlockError({
        code: 'P0001',
        message: 'Reservation is already approved, cannot approve'
      })
    ).toBe(false);
  });

  it('does not swallow unrelated failures', () => {
    expect(isSequentialApprovalBlockError(new Error('Network request failed'))).toBe(
      false
    );
    expect(
      isSequentialApprovalBlockError({
        code: '42501',
        message: 'You are not authorized to approve this reservation'
      })
    ).toBe(false);
    expect(isSequentialApprovalBlockError(null)).toBe(false);
  });
});
