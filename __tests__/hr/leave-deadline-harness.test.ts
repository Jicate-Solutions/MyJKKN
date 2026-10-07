/**
 * lib/hr/leave/deadline-harness.ts — the HR staff harness's leave-deadline
 * rules (lane A, 2026-10-01): which requests escalate, who is told, the
 * on-leave rerouting, idempotency, and the comp-off expiry windows.
 *
 * The database half (the record functions that make each step escalate at
 * most once) is exercised against a real PostgreSQL in
 * leave-deadline-enforcement.pg.test.ts.
 */
import { describe, it, expect } from 'vitest';

import {
  buildEscalationNotices,
  capNoticesPerRecipient,
  compOffNudgeKind,
  DEFAULT_ESCALATE_AFTER_HOURS,
  escalationKey,
  findOverdueStep,
  goLiveFromPolicy,
  isAutoLapsed,
  pickCompOffApprovers,
  pickCompOffClaimant,
  pickEscalationRecipients,
  selectOverdue,
  stepEscalateAfterHours,
  stepWaitingSince,
  type EscalationCandidate,
  type EscalationRecipientRow,
} from '@/lib/hr/leave/deadline-harness';
import type { LeaveApprovalStep } from '@/types/hr';

const H = 60 * 60 * 1000;
const FILED = '2026-10-01T04:00:00.000Z';
const at = (hoursAfterFiling: number) => new Date(Date.parse(FILED) + hoursAfterFiling * H);
/** Go-live well before every fixture, so the older tests see the cutoff as open. */
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

function step(over: Partial<LeaveApprovalStep> = {}): LeaveApprovalStep {
  return {
    step_order: 1,
    approver_role: 'hod',
    approver_user_id: null,
    status: 'pending',
    decided_at: null,
    decided_by: null,
    comment: null,
    escalate_after_hours: 48,
    ...over,
  };
}

function app(over: Partial<EscalationCandidate> = {}): EscalationCandidate {
  return {
    id: 'app-1',
    status: 'pending',
    current_step: 0,
    approval_chain: [step()],
    created_at: FILED,
    superseded_by: null,
    final_decided_at: null,
    ...over,
  };
}

describe('stepEscalateAfterHours', () => {
  it('uses the step’s own limit', () => {
    expect(stepEscalateAfterHours(step({ escalate_after_hours: 24 }))).toBe(24);
  });

  it('falls back to 48 for a missing, zero, negative or non-numeric limit', () => {
    expect(DEFAULT_ESCALATE_AFTER_HOURS).toBe(48);
    for (const bad of [undefined, 0, -5, Number.NaN, 'abc' as unknown as number]) {
      expect(stepEscalateAfterHours(step({ escalate_after_hours: bad as number }))).toBe(48);
    }
    expect(stepEscalateAfterHours(null)).toBe(48);
  });
});

describe('findOverdueStep — which requests escalate', () => {
  it('does not escalate before the step’s limit, and does at exactly the limit', () => {
    expect(findOverdueStep(app(), at(47.9))).toBeNull();
    const o = findOverdueStep(app(), at(48));
    expect(o).toMatchObject({ applicationId: 'app-1', stepIndex: 0, escalateAfterHours: 48, hoursWaited: 48 });
    expect(o?.dueAt).toBe(at(48).toISOString());
  });

  it('honours a per-step limit rather than a global 48 hours', () => {
    const a = app({ approval_chain: [step({ escalate_after_hours: 6 })] });
    expect(findOverdueStep(a, at(5))).toBeNull();
    expect(findOverdueStep(a, at(6))?.escalateAfterHours).toBe(6);
  });

  it('never escalates a request that is already decided in any way', () => {
    for (const status of ['approved', 'rejected', 'withdrawn', 'cancelled']) {
      expect(findOverdueStep(app({ status }), at(500))).toBeNull();
    }
    expect(findOverdueStep(app({ superseded_by: 'other' }), at(500))).toBeNull();
    expect(findOverdueStep(app({ final_decided_at: FILED }), at(500))).toBeNull();
  });

  it('never escalates when the current step itself is no longer pending', () => {
    for (const status of ['approved', 'rejected', 'skipped', 'revoked'] as const) {
      expect(findOverdueStep(app({ approval_chain: [step({ status })] }), at(500))).toBeNull();
    }
  });

  it('keeps an already-escalated request eligible for its NEXT step', () => {
    const a = app({
      status: 'escalated',
      current_step: 1,
      approval_chain: [
        step({ status: 'approved', decided_at: at(60).toISOString() }),
        step({ step_order: 2, approver_role: 'principal' }),
      ],
    });
    // Step 2 started waiting when step 1 was approved at hour 60.
    expect(findOverdueStep(a, at(107))).toBeNull();
    expect(findOverdueStep(a, at(108))).toMatchObject({ stepIndex: 1, hoursWaited: 48 });
  });

  it('is idempotent: a step already in the ledger is not escalated again', () => {
    const done = new Set([escalationKey('app-1', 0)]);
    expect(findOverdueStep(app(), at(500), done)).toBeNull();
    // ...but a different step of the same request is not blocked by it.
    const a = app({
      current_step: 1,
      approval_chain: [step({ status: 'approved', decided_at: FILED }), step({ step_order: 2 })],
    });
    expect(findOverdueStep(a, at(500), done)?.stepIndex).toBe(1);
  });

  it('ignores a request with no usable chain or a current_step past its end', () => {
    expect(findOverdueStep(app({ approval_chain: [] }), at(500))).toBeNull();
    expect(findOverdueStep(app({ approval_chain: null }), at(500))).toBeNull();
    expect(findOverdueStep(app({ approval_chain: { not: 'an array' } }), at(500))).toBeNull();
    expect(findOverdueStep(app({ current_step: 3 }), at(500))).toBeNull();
    expect(findOverdueStep(app({ current_step: -1 }), at(500))).toBeNull();
  });

  it('reports whether the waiting step is the final one', () => {
    const two = app({ approval_chain: [step(), step({ step_order: 2, step_type: 'final' })] });
    expect(findOverdueStep(two, at(48))?.isFinalStep).toBe(false);
    expect(findOverdueStep(app(), at(48))?.isFinalStep).toBe(true);
  });
});

describe('stepWaitingSince', () => {
  it('is the filing time for the first step', () => {
    expect(stepWaitingSince([step()], 0, FILED)).toBe(FILED);
  });

  it('is the latest decision, skip or decided_at on any EARLIER step', () => {
    const chain = [
      step({ decided_at: at(10).toISOString(), decisions: [{ by: 'a', at: at(12).toISOString(), decision: 'approved', comment: null }] }),
      step({ status: 'skipped', skipped_at: at(20).toISOString() }),
      step(),
    ];
    expect(stepWaitingSince(chain, 2, FILED)).toBe(at(20).toISOString());
  });

  it('does not restart the clock for a partial decision on the CURRENT step', () => {
    const chain = [
      step({ quorum: 'all', decisions: [{ by: 'a', at: at(30).toISOString(), decision: 'approved', comment: null }] }),
    ];
    expect(stepWaitingSince(chain, 0, FILED)).toBe(FILED);
  });
});

describe('selectOverdue', () => {
  it('orders oldest-due first and caps the run', () => {
    const apps = [
      app({ id: 'late', created_at: at(-100).toISOString() }),
      app({ id: 'later', created_at: at(-10).toISOString() }),
      app({ id: 'not-yet', created_at: at(0).toISOString() }),
    ];
    const now = at(40);
    expect(selectOverdue(apps, now, new Set(), LONG_AGO).map((o) => o.applicationId)).toEqual(['late', 'later']);
    expect(selectOverdue(apps, now, new Set(), LONG_AGO, 1).map((o) => o.applicationId)).toEqual(['late']);
  });
});

describe('pickEscalationRecipients — who is told', () => {
  const row = (tier: string, user_id: string, on_leave_today = false): EscalationRecipientRow => ({
    tier,
    user_id,
    on_leave_today,
  });

  it('below the final step: the current approver AND the final approver', () => {
    const r = pickEscalationRecipients(
      [row('current', 'hod'), row('final', 'principal'), row('hr', 'hrhead')],
      { currentIsFinal: false }
    );
    expect(r).toMatchObject({ approvers: ['hod'], nextLevel: ['principal'], nextLevelTier: 'final' });
  });

  it('on the final step: the current approver AND HR', () => {
    const r = pickEscalationRecipients(
      [row('current', 'principal'), row('final', 'ignored'), row('hr', 'hrhead')],
      { currentIsFinal: true }
    );
    expect(r).toMatchObject({ approvers: ['principal'], nextLevel: ['hrhead'], nextLevelTier: 'hr' });
  });

  it('never chases an approver on leave today — the request goes to the next level instead', () => {
    const r = pickEscalationRecipients(
      [row('current', 'hod', true), row('final', 'principal'), row('hr', 'hrhead')],
      { currentIsFinal: false }
    );
    expect(r.approvers).toEqual([]);
    expect(r.currentOnLeave).toEqual(['hod']);
    expect(r.nextLevel).toEqual(['principal']);
    expect(r.skippedOnLeave).toEqual(['hod']);
  });

  it('falls through to HR when the final approver is also on leave', () => {
    const r = pickEscalationRecipients(
      [row('current', 'hod', true), row('final', 'principal', true), row('hr', 'hrhead')],
      { currentIsFinal: false }
    );
    expect(r).toMatchObject({ approvers: [], nextLevel: ['hrhead'], nextLevelTier: 'hr' });
    expect(r.skippedOnLeave.sort()).toEqual(['hod', 'principal']);
  });

  it('falls through to HR when nobody on the final step can be resolved', () => {
    const r = pickEscalationRecipients([row('current', 'hod'), row('hr', 'hrhead')], {
      currentIsFinal: false,
    });
    expect(r).toMatchObject({ nextLevel: ['hrhead'], nextLevelTier: 'hr' });
  });

  it('tells a person once, as an approver, when they also sit on a higher tier', () => {
    const r = pickEscalationRecipients(
      [row('current', 'same'), row('final', 'same'), row('hr', 'same'), row('hr', 'hrhead')],
      { currentIsFinal: false }
    );
    expect(r.approvers).toEqual(['same']);
    expect(r.nextLevel).toEqual(['hrhead']);
    expect(r.nextLevelTier).toBe('hr');
  });

  it('reports nobody reachable when everyone is on leave', () => {
    const r = pickEscalationRecipients(
      [row('current', 'a', true), row('hr', 'b', true)],
      { currentIsFinal: true }
    );
    expect(r).toMatchObject({ approvers: [], nextLevel: [], nextLevelTier: null });
  });

  it('dedupes a person listed twice on one tier', () => {
    const r = pickEscalationRecipients([row('current', 'a'), row('current', 'a')], { currentIsFinal: true });
    expect(r.approvers).toEqual(['a']);
  });
});

describe('buildEscalationNotices', () => {
  const overdue = findOverdueStep(
    app({ approval_chain: [step(), step({ step_order: 2, step_type: 'final' })] }),
    at(50)
  )!;
  const ctx = { applicantName: 'Priya R', leaveTypeName: 'Casual Leave', startDate: '05 Oct 2026', endDate: '05 Oct 2026' };

  it('opens the item: names the person, the leave, the dates and the wait', () => {
    const notices = buildEscalationNotices(
      overdue,
      { approvers: ['hod'], nextLevel: ['principal'], nextLevelTier: 'final', currentOnLeave: [], skippedOnLeave: [] },
      ctx
    );
    expect(notices).toHaveLength(2);
    const [mine, up] = notices;
    expect(mine).toMatchObject({ userId: 'hod', audience: 'approver', applicationId: 'app-1' });
    expect(mine.message).toContain("Priya R's Casual Leave request (05 Oct 2026)");
    expect(mine.message).toContain('50 hours');
    expect(mine.message).toContain('final approver has also been told');
    expect(up).toMatchObject({ userId: 'principal', audience: 'next_level' });
    expect(up.message).toContain('step 1 of 2');
    expect(up.message).toContain('approve or reject it directly');
  });

  it('tells the next level when the approver is away', () => {
    const [up] = buildEscalationNotices(
      overdue,
      { approvers: [], nextLevel: ['hrhead'], nextLevelTier: 'hr', currentOnLeave: ['hod'], skippedOnLeave: ['hod'] },
      ctx
    );
    expect(up.message).toContain('on leave today');
    expect(up.message).toContain('follow up');
  });
});

describe('capNoticesPerRecipient', () => {
  it('keeps the first N per person and counts the rest', () => {
    const notices = [
      ...Array.from({ length: 12 }, (_, i) => ({ userId: 'hrhead', n: i })),
      { userId: 'hod', n: 99 },
    ];
    const { items, overflow } = capNoticesPerRecipient(notices, 10);
    expect(items.filter((x) => x.userId === 'hrhead').map((x) => x.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(items.filter((x) => x.userId === 'hod')).toHaveLength(1);
    expect(overflow.get('hrhead')).toBe(2);
    expect(overflow.has('hod')).toBe(false);
  });
});

describe('comp-off expiry windows', () => {
  const today = '2026-10-01';

  it('7 to 3 days before expiry → the 7-day nudge', () => {
    expect(compOffNudgeKind('2026-10-08', today)).toBe('comp_off_expiry_7d');
    expect(compOffNudgeKind('2026-10-04', today)).toBe('comp_off_expiry_7d');
  });

  it('2 days to the expiry day itself → the 2-day nudge', () => {
    expect(compOffNudgeKind('2026-10-03', today)).toBe('comp_off_expiry_2d');
    expect(compOffNudgeKind('2026-10-01', today)).toBe('comp_off_expiry_2d');
  });

  it('nothing further out than 7 days, or once the credit has expired', () => {
    expect(compOffNudgeKind('2026-10-09', today)).toBeNull();
    expect(compOffNudgeKind('2026-09-30', today)).toBeNull();
  });

  it('crosses a month end correctly', () => {
    expect(compOffNudgeKind('2026-11-02', '2026-10-31')).toBe('comp_off_expiry_2d');
  });
});

describe('comp-off recipients and lapses', () => {
  it('only the nightly auto-reject counts as a lapse — never a person’s rejection', () => {
    const reason = 'Automatically rejected: not approved before the credit’s one-month expiry on 01/10/2026.';
    expect(isAutoLapsed({ status: 'rejected', approved_by: null, rejection_reason: reason })).toBe(true);
    expect(isAutoLapsed({ status: 'rejected', approved_by: 'someone', rejection_reason: reason })).toBe(false);
    expect(isAutoLapsed({ status: 'rejected', approved_by: null, rejection_reason: 'Not a working day' })).toBe(false);
    expect(isAutoLapsed({ status: 'pending', approved_by: null, rejection_reason: reason })).toBe(false);
  });

  it('skips approvers on leave; the claimant is found whatever their leave', () => {
    const rows = [
      { tier: 'approver', user_id: 'hr1', on_leave_today: false },
      { tier: 'approver', user_id: 'hr2', on_leave_today: true },
      { tier: 'claimant', user_id: 'me', on_leave_today: true },
    ];
    expect(pickCompOffApprovers(rows)).toEqual(['hr1']);
    expect(pickCompOffClaimant(rows)).toBe('me');
    expect(pickCompOffClaimant([])).toBeNull();
  });
});

describe('go-live cutoff (Director, 7 Oct 2026): no escalation of the backlog', () => {
  // Go-live 10 hours after FILED. Every request below is far past its 48-hour limit.
  const GO_LIVE = at(10);
  const NOW = at(500);

  it('(a) a request whose step began waiting BEFORE go-live is never escalated', () => {
    expect(selectOverdue([app({ id: 'old', created_at: at(0).toISOString() })], NOW, new Set(), GO_LIVE)).toEqual([]);
  });

  it('(b) a request filed AFTER go-live is escalated as before', () => {
    const out = selectOverdue([app({ id: 'new', created_at: at(20).toISOString() })], NOW, new Set(), GO_LIVE);
    expect(out.map((o) => o.applicationId)).toEqual(['new']);
  });

  it('(b) an old request whose NEXT step began waiting after go-live is a new wait', () => {
    const a = app({
      id: 'old-step-2',
      current_step: 1,
      approval_chain: [step({ status: 'approved', decided_at: at(30).toISOString() }), step()],
    });
    expect(selectOverdue([a], NOW, new Set(), GO_LIVE).map((o) => o.stepIndex)).toEqual([1]);
  });

  it('(c) with the cutoff row missing or unreadable, go-live is NOW and nothing old escalates', () => {
    for (const stored of [undefined, null, 'not a date', 42, {}]) {
      expect(goLiveFromPolicy(stored, NOW)).toEqual(NOW);
      const apps = [app({ id: 'old' }), app({ id: 'new', created_at: at(20).toISOString() })];
      expect(selectOverdue(apps, NOW, new Set(), goLiveFromPolicy(stored, NOW))).toEqual([]);
    }
  });

  it('reads the timestamp Postgres stores with to_jsonb(now())', () => {
    expect(goLiveFromPolicy('2026-10-07T10:55:12.123456+00:00', new Date()).toISOString()).toBe('2026-10-07T10:55:12.123Z');
  });
});
