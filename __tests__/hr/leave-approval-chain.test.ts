/**
 * Leave approval chains — ladder resolution, parallel collapse, quorum.
 *
 * THE LADDER NUMBERS ARE PRODUCTION FIGURES, measured 2026-08-31 against the
 * ladder [staff, hod, principal, cao] over 594 active HR staff:
 *
 *   holds no rung   394 people  ->  hod, principal, cao   (via the full ladder)
 *   staff            88         ->  hod, principal, cao
 *   hod              94         ->  principal, cao
 *   principal        13         ->  cao
 *   cao               1         ->  (empty -> fallback approver)
 *
 * THE REGRESSION THAT MATTERS MOST is the last block: 23 live flows and 709
 * in-flight applications are single-step, single-approver, and none of them
 * carry `approvers`, `quorum` or `step_source`. If those stop building the
 * identical one-step chain, every pending leave request in the group changes
 * approver silently.
 *
 * Run: npx vitest run __tests__/hr/leave-approval-chain.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  applyDecision,
  approvalProgress,
  buildChain,
  isQuorumMet,
  readApprovers,
  resolveRungsAbove,
} from '@/lib/hr/leave/approval-chain';
import type { LeaveApprovalStep } from '@/types/hr';
import type { LeaveApprovalFlowStep } from '@/types/hr-leave-types';

const LADDER = ['staff', 'hod', 'principal', 'cao'];

const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const BOB = 'bbbbbbbb-0000-0000-0000-000000000002';
const CARA = 'cccccccc-0000-0000-0000-000000000003';

function flow(over: Partial<Parameters<typeof buildChain>[0]['flow']> = {}) {
  return {
    steps: [] as LeaveApprovalFlowStep[],
    escalate_after_hours: 48,
    step_source: 'explicit' as const,
    run_mode: 'sequential' as const,
    fallback_approver: null,
    ...over,
  };
}

function decision(by: string, d: 'approved' | 'rejected' = 'approved') {
  return { by, at: '2026-08-31T10:00:00.000Z', decision: d, comment: null };
}

// ---------------------------------------------------------------------------

describe('the applicant enters the ladder above their own rung', () => {
  it('sends a staff request up the whole ladder above them', () => {
    expect(resolveRungsAbove(LADDER, ['staff'])).toEqual(['hod', 'principal', 'cao']);
  });

  it('sends an HOD request to principal and cao only', () => {
    expect(resolveRungsAbove(LADDER, ['hod'])).toEqual(['principal', 'cao']);
  });

  it('sends a principal request to cao only', () => {
    expect(resolveRungsAbove(LADDER, ['principal'])).toEqual(['cao']);
  });

  it('leaves the top of the ladder with nobody above them', () => {
    expect(resolveRungsAbove(LADDER, ['cao'])).toEqual([]);
  });

  it('gives the 394 staff who hold no rung the full ladder, never an empty chain', () => {
    expect(resolveRungsAbove(LADDER, ['faculty'])).toEqual(LADDER);
    expect(resolveRungsAbove(LADDER, [])).toEqual(LADDER);
  });

  it('takes the HIGHEST rung held, so an HOD who is also staff enters at hod', () => {
    expect(resolveRungsAbove(LADDER, ['staff', 'hod'])).toEqual(['principal', 'cao']);
    expect(resolveRungsAbove(LADDER, ['cao', 'staff'])).toEqual([]);
  });

  it('ignores roles that are not rungs', () => {
    expect(resolveRungsAbove(LADDER, ['hod', 'librarian'])).toEqual(['principal', 'cao']);
  });
});

describe('ladder + sequential climbs it one step at a time', () => {
  const chain = buildChain({
    flow: flow({ step_source: 'role_ladder', run_mode: 'sequential' }),
    rungsAbove: ['hod', 'principal', 'cao'],
  });

  it('emits one step per rung, in order', () => {
    expect(chain).toHaveLength(3);
    expect(chain.map((s) => s.approver_role)).toEqual(['hod', 'principal', 'cao']);
    expect(chain.map((s) => s.step_order)).toEqual([1, 2, 3]);
  });

  it('starts every step pending with no decisions', () => {
    expect(chain.every((s) => s.status === 'pending')).toBe(true);
    expect(chain.every((s) => (s.decisions ?? []).length === 0)).toBe(true);
  });
});

describe('ladder + parallel is ONE step, so any superior can approve', () => {
  const chain = buildChain({
    flow: flow({ step_source: 'role_ladder', run_mode: 'parallel' }),
    rungsAbove: ['hod', 'principal', 'cao'],
  });

  it('collapses every rung into a single step', () => {
    expect(chain).toHaveLength(1);
    expect(readApprovers(chain[0]).map((a) => a.approver_role)).toEqual([
      'hod',
      'principal',
      'cao',
    ]);
  });

  it('defaults that step to any-one, which is what "any superior" means', () => {
    expect(chain[0].quorum).toBe('any');
    expect(applyDecision(chain[0], decision(ALICE)).satisfied).toBe(true);
  });

  it('keeps current_step meaningful — one step means index 0 is the only step', () => {
    expect(chain[0].step_order).toBe(1);
  });
});

describe('the top of the ladder falls back to a named approver', () => {
  it('routes a CAO request to the fallback rather than approving it unseen', () => {
    const chain = buildChain({
      flow: flow({
        step_source: 'role_ladder',
        fallback_approver: {
          approver_role: 'managing_director',
          approver_user_id: null,
          approver_name: 'Managing Director',
        },
      }),
      rungsAbove: [],
    });
    expect(chain).toHaveLength(1);
    expect(chain[0].approver_role).toBe('managing_director');
  });

  it('returns an EMPTY chain when no fallback is configured, so the caller can raise', () => {
    const chain = buildChain({
      flow: flow({ step_source: 'role_ladder', fallback_approver: null }),
      rungsAbove: [],
    });
    expect(chain).toEqual([]);
  });

  it('ignores a fallback that names nobody', () => {
    const chain = buildChain({
      flow: flow({
        step_source: 'role_ladder',
        fallback_approver: { approver_role: null, approver_user_id: null, approver_name: 'x' },
      }),
      rungsAbove: [],
    });
    expect(chain).toEqual([]);
  });
});

describe('quorum', () => {
  const twoRoles: LeaveApprovalStep = {
    step_order: 0,
    approver_role: 'hod',
    approver_user_id: null,
    approvers: [
      { approver_role: 'hod', approver_user_id: null, approver_name: null },
      { approver_role: 'principal', approver_user_id: null, approver_name: null },
    ],
    quorum: 'all',
    decisions: [],
    status: 'pending',
    escalate_after_hours: 48,
  };

  it('any: the first approval carries the step', () => {
    const step = { ...twoRoles, quorum: 'any' as const };
    expect(applyDecision(step, decision(ALICE)).satisfied).toBe(true);
  });

  it('all: one of two does NOT advance', () => {
    const r = applyDecision(twoRoles, decision(ALICE));
    expect(r.satisfied).toBe(false);
    expect(r.step.status).toBe('pending');
  });

  it('all: two distinct approvers do advance', () => {
    const first = applyDecision(twoRoles, decision(ALICE)).step;
    const second = applyDecision(first, decision(BOB));
    expect(second.satisfied).toBe(true);
    expect(second.step.status).toBe('approved');
  });

  it('all: the SAME person twice cannot satisfy it alone', () => {
    const first = applyDecision(twoRoles, decision(ALICE)).step;
    const again = applyDecision(first, decision(ALICE));
    expect(again.satisfied).toBe(false);
    expect(again.step.decisions).toHaveLength(1);
  });

  it('all: a pinned slot needs that exact person, not just any two', () => {
    const pinned: LeaveApprovalStep = {
      ...twoRoles,
      approvers: [
        { approver_role: null, approver_user_id: CARA, approver_name: 'Cara' },
        { approver_role: 'principal', approver_user_id: null, approver_name: null },
      ],
    };
    const wrongTwo = applyDecision(applyDecision(pinned, decision(ALICE)).step, decision(BOB));
    expect(wrongTwo.satisfied).toBe(false);

    const withCara = applyDecision(wrongTwo.step, decision(CARA));
    expect(withCara.satisfied).toBe(true);
  });

  it('reports progress for the UI', () => {
    const one = applyDecision(twoRoles, decision(ALICE)).step;
    expect(approvalProgress(one)).toEqual({ approved: 1, required: 2 });
    expect(approvalProgress({ ...one, quorum: 'any' })).toEqual({ approved: 1, required: 1 });
  });

  it('an empty decision list never meets a quorum', () => {
    expect(isQuorumMet(twoRoles)).toBe(false);
  });
});

describe('rejection stays terminal at any step', () => {
  it('marks the step rejected and never reports it satisfied', () => {
    const step = buildChain({
      flow: flow({ step_source: 'role_ladder' }),
      rungsAbove: ['hod', 'principal'],
    })[0];
    const r = applyDecision(step, decision(ALICE, 'rejected'));
    expect(r.satisfied).toBe(false);
    expect(r.step.status).toBe('rejected');
    expect(r.step.decided_by).toBe(ALICE);
  });

  it('rejects even on an all-quorum step where others had approved', () => {
    const step: LeaveApprovalStep = {
      step_order: 0,
      approver_role: 'hod',
      approver_user_id: null,
      approvers: [
        { approver_role: 'hod', approver_user_id: null, approver_name: null },
        { approver_role: 'principal', approver_user_id: null, approver_name: null },
      ],
      quorum: 'all',
      decisions: [],
      status: 'pending',
      escalate_after_hours: 48,
    };
    const approved = applyDecision(step, decision(ALICE)).step;
    const rejected = applyDecision(approved, decision(BOB, 'rejected'));
    expect(rejected.step.status).toBe('rejected');
    expect(rejected.satisfied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The 23 live flows and 709 in-flight chains. Nothing below may change.
// ---------------------------------------------------------------------------

describe('legacy single-approver flows build exactly as before', () => {
  const seeded: LeaveApprovalFlowStep = {
    chain_order: 1,
    step_type: 'final',
    approver_role: 'principal',
    approver_user_id: null,
    approver_name: 'HR / Approving Authority',
    escalate_after_hours: 48,
  };

  it('builds the same one-step chain from a flow with no new fields set', () => {
    const chain = buildChain({
      flow: {
        steps: [seeded],
        escalate_after_hours: 48,
        // step_source / run_mode / fallback deliberately ABSENT, as they are on
        // a row that predates the migration being read through an older type.
      } as Parameters<typeof buildChain>[0]['flow'],
    });
    expect(chain).toHaveLength(1);
    expect(chain[0].approver_role).toBe('principal');
    expect(chain[0].approver_user_id).toBeNull();
    expect(chain[0].step_order).toBe(1);
    expect(chain[0].step_type).toBe('final');
    expect(chain[0].escalate_after_hours).toBe(48);
  });

  it('reads a legacy step with no approvers[] as exactly one entry', () => {
    const entries = readApprovers({
      approver_role: 'principal',
      approver_user_id: null,
    } as LeaveApprovalStep);
    expect(entries).toEqual([
      { approver_role: 'principal', approver_user_id: null, approver_name: null },
    ]);
  });

  it('one approval still carries a legacy step, because absent quorum means any', () => {
    const chain = buildChain({ flow: flow({ steps: [seeded] }) });
    expect(chain[0].quorum).toBe('any');
    expect(applyDecision(chain[0], decision(ALICE)).satisfied).toBe(true);
  });

  it('keeps a step that names NOBODY — the database reads that as "any permitted approver"', () => {
    const anon: LeaveApprovalFlowStep = {
      chain_order: 1,
      step_type: 'final',
      approver_role: '',
      approver_user_id: null,
      approver_name: null,
      escalate_after_hours: 48,
    };
    const chain = buildChain({ flow: flow({ steps: [anon] }) });
    expect(chain).toHaveLength(1);
    expect(readApprovers(chain[0])).toEqual([
      { approver_role: null, approver_user_id: null, approver_name: null },
    ]);
  });

  it('orders explicit steps by chain_order, not by array position', () => {
    const chain = buildChain({
      flow: flow({
        steps: [
          { ...seeded, chain_order: 2, approver_role: 'cao' },
          { ...seeded, chain_order: 1, approver_role: 'hod' },
        ],
      }),
    });
    expect(chain.map((s) => s.approver_role)).toEqual(['hod', 'cao']);
  });
});

describe('explicit + parallel and de-duplication', () => {
  it('collapses named people into one step and drops repeats', () => {
    const chain = buildChain({
      flow: flow({
        run_mode: 'parallel',
        steps: [
          {
            chain_order: 1,
            step_type: 'final',
            approver_role: '',
            approver_user_id: null,
            approver_name: null,
            escalate_after_hours: 48,
            quorum: 'all',
            approvers: [
              { approver_role: null, approver_user_id: ALICE, approver_name: 'Alice' },
              { approver_role: null, approver_user_id: BOB, approver_name: 'Bob' },
            ],
          },
          {
            chain_order: 2,
            step_type: 'final',
            approver_role: '',
            approver_user_id: null,
            approver_name: null,
            escalate_after_hours: 48,
            approvers: [
              { approver_role: null, approver_user_id: BOB, approver_name: 'Bob' },
              { approver_role: 'cao', approver_user_id: null, approver_name: null },
            ],
          },
        ],
      }),
    });

    expect(chain).toHaveLength(1);
    expect(readApprovers(chain[0])).toHaveLength(3);
    expect(chain[0].quorum).toBe('all');
  });
});
