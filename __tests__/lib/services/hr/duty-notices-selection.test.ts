import { describe, it, expect } from 'vitest';
import {
  activeStepPositions,
  daysUntil,
  ledgerKey,
  nextStepAfterCompletion,
  planOnboardingNotices,
  planRegularizationNotices,
  positiveNumberOr,
  readOnboardingSteps,
  stepTurnStartedAt,
  workingDaysElapsed,
  type OnboardingStepState,
} from '@/lib/services/hr/duty-notices/selection';

// HR staff harness (2026-10-01), duties R9 + A3 — the pure "which notice is
// due" rules. Times are UTC instants; the rules count in IST dates.

/** 09:00 IST on the given date. */
const ist9 = (ymd: string) => new Date(`${ymd}T03:30:00.000Z`);

function steps(done: Array<string | null>): OnboardingStepState[] {
  return done.map((completedAt, i) => ({
    index: i,
    step: `Step ${i + 1}`,
    completed: completedAt !== null,
    completed_at: completedAt,
  }));
}

describe('workingDaysElapsed (IST, Sunday off)', () => {
  it('counts whole working days after the start date, up to today', () => {
    // 2026-10-05 is a Monday.
    const start = ist9('2026-10-05').toISOString();
    expect(workingDaysElapsed(start, ist9('2026-10-05'))).toBe(0);
    expect(workingDaysElapsed(start, ist9('2026-10-06'))).toBe(1);
    expect(workingDaysElapsed(start, ist9('2026-10-08'))).toBe(3);
  });

  it('does not count Sunday', () => {
    // Friday 2026-10-09 → Monday 2026-10-12: Saturday + Monday = 2.
    expect(workingDaysElapsed(ist9('2026-10-09').toISOString(), ist9('2026-10-12'))).toBe(2);
  });

  it('uses the IST date, not the UTC one', () => {
    // 20:00 UTC on the 5th is 01:30 IST on the 6th.
    expect(workingDaysElapsed('2026-10-05T20:00:00.000Z', ist9('2026-10-06'))).toBe(0);
  });
});

describe('daysUntil', () => {
  it('is 0 today, positive ahead, negative once passed', () => {
    const now = ist9('2026-10-05');
    expect(daysUntil('2026-10-05', now)).toBe(0);
    expect(daysUntil('2026-10-08', now)).toBe(3);
    expect(daysUntil('2026-10-04', now)).toBe(-1);
  });
});

describe('readOnboardingSteps', () => {
  it('reads the stamped shape and survives junk', () => {
    expect(readOnboardingSteps(null)).toEqual([]);
    expect(readOnboardingSteps({ onboarding_steps: 'x' })).toEqual([]);
    const s = readOnboardingSteps({
      onboarding_steps: [{ step: 'ID card', completed: true, completed_at: '2026-10-01T00:00:00Z', assigned_role: 'hr_officer' }, {}],
    });
    expect(s[0]).toMatchObject({ index: 0, step: 'ID card', completed: true, assigned_role: 'hr_officer' });
    expect(s[1]).toMatchObject({ index: 1, step: 'Step 2', completed: false, assigned_user_id: null });
  });
});

describe('nextStepAfterCompletion', () => {
  const t = '2026-10-05T05:00:00.000Z';

  it('is the next open step after the one just ticked', () => {
    expect(nextStepAfterCompletion(steps([t, null, null]), 0)).toBe(1);
  });

  it('skips steps already done out of order', () => {
    expect(nextStepAfterCompletion(steps([t, t, null]), 0)).toBe(2);
  });

  it('wraps to the first open step when everything after is done', () => {
    expect(nextStepAfterCompletion(steps([null, t, t]), 2)).toBe(0);
  });

  it('is null when the checklist is complete', () => {
    expect(nextStepAfterCompletion(steps([t, t]), 1)).toBeNull();
  });
});

describe('activeStepPositions / stepTurnStartedAt', () => {
  it('only the first open step, and open steps right after a done one, are active', () => {
    const t = '2026-10-05T05:00:00.000Z';
    expect(activeStepPositions(steps([null, null, null]))).toEqual([0]);
    expect(activeStepPositions(steps([t, null, null]))).toEqual([1]);
    expect(activeStepPositions(steps([null, t, null]))).toEqual([0, 2]);
  });

  it("a step's turn starts when the step before it was done", () => {
    const started = '2026-10-01T04:00:00.000Z';
    const s = steps(['2026-10-03T06:00:00.000Z', null]);
    expect(stepTurnStartedAt(s, 0, started)).toBe(started);
    expect(stepTurnStartedAt(s, 1, started)).toBe('2026-10-03T06:00:00.000Z');
  });
});

describe('planOnboardingNotices', () => {
  const started = ist9('2026-10-05').toISOString(); // Monday
  const none = new Set<string>();

  it('nothing before the owner has held the step for more than 2 working days', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: null, steps: steps([null, null]) },
      ist9('2026-10-07'),
      none,
    );
    expect(plan).toEqual([]);
  });

  it('one reminder to the ACTIVE step owner once held for more than 2 working days', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: null, steps: steps([null, null]) },
      ist9('2026-10-08'),
      none,
    );
    expect(plan).toEqual([{ kind: 'step_reminder', position: 0, reason: 'held_too_long' }]);
  });

  it('never a second reminder for the same step', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: null, steps: steps([null, null]) },
      ist9('2026-10-20'),
      new Set([ledgerKey('c1', '0', 'step_reminder')]),
    );
    expect(plan).toEqual([]);
  });

  it('within 3 days of joining, every open step owner gets their one reminder', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-08', steps: steps([null, null, '2026-10-05T06:00:00Z']) },
      ist9('2026-10-05'),
      new Set([ledgerKey('c1', '1', 'step_reminder')]),
    );
    expect(plan).toEqual([{ kind: 'step_reminder', position: 0, reason: 'joining_soon' }]);
  });

  it('once the joining date has passed: one HR-head notice, no more step reminders', () => {
    const c = { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-06', steps: steps([null]) };
    expect(planOnboardingNotices(c, ist9('2026-10-07'), none)).toEqual([
      { kind: 'joining_passed', position: null, reason: 'joining_passed' },
    ]);
    expect(planOnboardingNotices(c, ist9('2026-10-09'), new Set([ledgerKey('c1', '', 'joining_passed')]))).toEqual([]);
  });

  it('a finished or never-started checklist gets nothing', () => {
    expect(
      planOnboardingNotices(
        { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-01', steps: steps(['2026-10-05T06:00:00Z']) },
        ist9('2026-10-09'),
        none,
      ),
    ).toEqual([]);
    expect(
      planOnboardingNotices({ id: 'c1', onboardingStartedAt: null, joiningDate: null, steps: steps([null]) }, ist9('2026-10-20'), none),
    ).toEqual([]);
  });

  it('honours a retuned threshold', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: null, steps: steps([null]) },
      ist9('2026-10-06'),
      none,
      { reminderAfterWorkingDays: 0, joiningSoonDays: 3 },
    );
    expect(plan).toHaveLength(1);
  });
});

describe('planRegularizationNotices', () => {
  const created = '2026-10-05T04:00:00.000Z';
  const hoursLater = (h: number) => new Date(new Date(created).getTime() + h * 3600_000);
  const pending = { id: 'r1', status: 'pending', created_at: created, approved_at: null };

  it('a new request that never had its notice gets "submitted" first', () => {
    expect(planRegularizationNotices(pending, hoursLater(1), new Set())).toEqual([{ kind: 'submitted' }]);
  });

  it('backlog: submitted now, the reminder no earlier than the next run', () => {
    expect(planRegularizationNotices(pending, hoursLater(60), new Set())).toEqual([{ kind: 'submitted' }]);
  });

  it('one reminder after 48 hours, never two', () => {
    const sent = new Set([ledgerKey('r1', '', 'submitted')]);
    expect(planRegularizationNotices(pending, hoursLater(47), sent)).toEqual([]);
    expect(planRegularizationNotices(pending, hoursLater(49), sent)).toEqual([{ kind: 'reminder' }]);
    sent.add(ledgerKey('r1', '', 'reminder'));
    expect(planRegularizationNotices(pending, hoursLater(80), sent)).toEqual([]);
  });

  it('HR head once after 4 days pending', () => {
    const sent = new Set([ledgerKey('r1', '', 'submitted'), ledgerKey('r1', '', 'reminder')]);
    expect(planRegularizationNotices(pending, hoursLater(97), sent)).toEqual([{ kind: 'hr_head' }]);
    sent.add(ledgerKey('r1', '', 'hr_head'));
    expect(planRegularizationNotices(pending, hoursLater(200), sent)).toEqual([]);
  });

  it('a decision is told to the requester only for a request that was announced', () => {
    const decided = { id: 'r1', status: 'rejected', created_at: created, approved_at: hoursLater(5).toISOString() };
    expect(planRegularizationNotices(decided, hoursLater(6), new Set())).toEqual([]);
    const sent = new Set([ledgerKey('r1', '', 'submitted')]);
    expect(planRegularizationNotices(decided, hoursLater(6), sent)).toEqual([{ kind: 'decided' }]);
    sent.add(ledgerKey('r1', '', 'decided'));
    expect(planRegularizationNotices(decided, hoursLater(6), sent)).toEqual([]);
  });

  it('an old decision past the backstop window is left alone', () => {
    const decided = { id: 'r1', status: 'approved', created_at: created, approved_at: hoursLater(5).toISOString() };
    const sent = new Set([ledgerKey('r1', '', 'submitted')]);
    expect(planRegularizationNotices(decided, hoursLater(24 * 20), sent)).toEqual([]);
  });
});

describe('positiveNumberOr', () => {
  it('keeps the default for anything unusable', () => {
    expect(positiveNumberOr(5, 2)).toBe(5);
    expect(positiveNumberOr('48', 2)).toBe(48);
    expect(positiveNumberOr(0, 2)).toBe(2);
    expect(positiveNumberOr(null, 2)).toBe(2);
    expect(positiveNumberOr('x', 2)).toBe(2);
  });
});
