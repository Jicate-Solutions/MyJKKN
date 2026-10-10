import { describe, it, expect } from 'vitest';
import {
  activeStepPositions,
  daysUntil,
  decidedSubjectKey,
  goLiveFromPolicy,
  isDaytimeIst,
  ledgerKey,
  nextStepAfterCompletion,
  planOnboardingNotices,
  planRegularizationNotices,
  positiveNumberOr,
  readOnboardingSteps,
  stepSubjectKey,
  stepTurnStartedAt,
  workingDaysElapsed,
  type OnboardingStepState,
} from '@/lib/services/hr/duty-notices/selection';

// HR staff harness (2026-10-01), duties R9 + A3 — the pure "which notice is
// due" rules. Times are UTC instants; the rules count in IST dates.

/** 09:00 IST on the given date. */
const ist9 = (ymd: string) => new Date(`${ymd}T03:30:00.000Z`);
/** Go-live well before every fixture, so the older tests see the cutoff as open. */
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

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
      LONG_AGO,
    );
    expect(plan).toEqual([]);
  });

  it('one reminder to the ACTIVE step owner once held for more than 2 working days', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: null, steps: steps([null, null]) },
      ist9('2026-10-08'),
      none,
      LONG_AGO,
    );
    expect(plan).toEqual([{ kind: 'step_reminder', position: 0, reason: 'held_too_long' }]);
  });

  it('never a second reminder for the same step', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: null, steps: steps([null, null]) },
      ist9('2026-10-20'),
      new Set([ledgerKey('c1', stepSubjectKey(steps([null])[0], started), 'step_reminder')]),
      LONG_AGO,
    );
    expect(plan).toEqual([]);
  });

  it('within 3 days of joining: ONE notice for the joiner, however many steps are open (review #4150 risk 4)', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-08', steps: steps([null, null, '2026-10-05T06:00:00Z']) },
      ist9('2026-10-05'),
      none,
      LONG_AGO,
    );
    expect(plan).toEqual([{ kind: 'joining_soon', position: null, reason: 'joining_soon' }]);
    expect(
      planOnboardingNotices(
        { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-08', steps: steps([null, null, '2026-10-05T06:00:00Z']) },
        ist9('2026-10-06'),
        new Set([ledgerKey('c1', '', 'joining_soon')]),
        LONG_AGO,
      ),
    ).toEqual([]);
  });

  it('a step already reminded for being held too long still gets the joining-soon notice (review #4150 item 5)', () => {
    const c = { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-12', steps: steps([null, null]) };
    const heldSent = new Set([ledgerKey('c1', stepSubjectKey(c.steps[0], started), 'step_reminder')]);
    expect(planOnboardingNotices(c, ist9('2026-10-09'), heldSent, LONG_AGO)).toEqual([
      { kind: 'joining_soon', position: null, reason: 'joining_soon' },
    ]);
    // ...and the reverse: the joining-soon notice does not swallow the held-too-long one.
    expect(
      planOnboardingNotices(c, ist9('2026-10-09'), new Set([ledgerKey('c1', '', 'joining_soon')]), LONG_AGO),
    ).toEqual([{ kind: 'step_reminder', position: 0, reason: 'held_too_long' }]);
  });

  it('once the joining date has passed: one HR-head notice, no more step reminders', () => {
    const c = { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-06', steps: steps([null]) };
    expect(planOnboardingNotices(c, ist9('2026-10-07'), none, LONG_AGO)).toEqual([
      { kind: 'joining_passed', position: null, reason: 'joining_passed' },
    ]);
    expect(planOnboardingNotices(c, ist9('2026-10-09'), new Set([ledgerKey('c1', '', 'joining_passed')]), LONG_AGO)).toEqual([]);
  });

  it('a finished or never-started checklist gets nothing', () => {
    expect(
      planOnboardingNotices(
        { id: 'c1', onboardingStartedAt: started, joiningDate: '2026-10-01', steps: steps(['2026-10-05T06:00:00Z']) },
        ist9('2026-10-09'),
        none,
        LONG_AGO,
      ),
    ).toEqual([]);
    expect(
      planOnboardingNotices({ id: 'c1', onboardingStartedAt: null, joiningDate: null, steps: steps([null]) }, ist9('2026-10-20'), none, LONG_AGO),
    ).toEqual([]);
  });

  it('honours a retuned threshold', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: started, joiningDate: null, steps: steps([null]) },
      ist9('2026-10-06'),
      none,
      LONG_AGO,
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
    expect(planRegularizationNotices(pending, hoursLater(1), new Set(), LONG_AGO)).toEqual([{ kind: 'submitted' }]);
  });

  it('backlog: submitted now, the reminder no earlier than the next run', () => {
    expect(planRegularizationNotices(pending, hoursLater(60), new Set(), LONG_AGO)).toEqual([{ kind: 'submitted' }]);
  });

  it('one reminder after 48 hours, never two', () => {
    const sent = new Set([ledgerKey('r1', '', 'submitted')]);
    expect(planRegularizationNotices(pending, hoursLater(47), sent, LONG_AGO)).toEqual([]);
    expect(planRegularizationNotices(pending, hoursLater(49), sent, LONG_AGO)).toEqual([{ kind: 'reminder' }]);
    sent.add(ledgerKey('r1', '', 'reminder'));
    expect(planRegularizationNotices(pending, hoursLater(80), sent, LONG_AGO)).toEqual([]);
  });

  it('HR head once after 4 days pending', () => {
    const sent = new Set([ledgerKey('r1', '', 'submitted'), ledgerKey('r1', '', 'reminder')]);
    expect(planRegularizationNotices(pending, hoursLater(97), sent, LONG_AGO)).toEqual([{ kind: 'hr_head' }]);
    sent.add(ledgerKey('r1', '', 'hr_head'));
    expect(planRegularizationNotices(pending, hoursLater(200), sent, LONG_AGO)).toEqual([]);
  });

  it('a decision is told to the requester only for a request that was announced', () => {
    const decided = { id: 'r1', status: 'rejected', created_at: created, approved_at: hoursLater(5).toISOString() };
    expect(planRegularizationNotices(decided, hoursLater(6), new Set(), LONG_AGO)).toEqual([]);
    const sent = new Set([ledgerKey('r1', '', 'submitted')]);
    expect(planRegularizationNotices(decided, hoursLater(6), sent, LONG_AGO)).toEqual([{ kind: 'decided' }]);
    sent.add(ledgerKey('r1', decidedSubjectKey('rejected'), 'decided'));
    expect(planRegularizationNotices(decided, hoursLater(6), sent, LONG_AGO)).toEqual([]);
  });

  it('a request approved and later rejected gets a second decision notice (review #4150 item 4)', () => {
    const sent = new Set([ledgerKey('r1', '', 'submitted'), ledgerKey('r1', decidedSubjectKey('approved'), 'decided')]);
    const approved = { id: 'r1', status: 'approved', created_at: created, approved_at: hoursLater(5).toISOString() };
    expect(planRegularizationNotices(approved, hoursLater(6), sent, LONG_AGO)).toEqual([]);
    const reversed = { ...approved, status: 'rejected', approved_at: hoursLater(30).toISOString() };
    expect(planRegularizationNotices(reversed, hoursLater(31), sent, LONG_AGO)).toEqual([{ kind: 'decided' }]);
  });

  it('an old decision past the backstop window is left alone', () => {
    const decided = { id: 'r1', status: 'approved', created_at: created, approved_at: hoursLater(5).toISOString() };
    const sent = new Set([ledgerKey('r1', '', 'submitted')]);
    expect(planRegularizationNotices(decided, hoursLater(24 * 20), sent, LONG_AGO)).toEqual([]);
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

// ---------------------------------------------------------------------------
// Go-live cutoff (Director, 7 Oct 2026): no reminders about items from before go-live
// ---------------------------------------------------------------------------

describe('go-live cutoff', () => {
  const GO_LIVE = new Date('2026-10-07T06:00:00.000Z');
  const before = '2026-10-05T04:00:00.000Z'; // Monday, before go-live
  const after = '2026-10-08T04:00:00.000Z'; // Thursday, after go-live
  const none = new Set<string>();

  /** Every scheduled notice an item would get, overdue by every rule. */
  function everyNotice(startedAt: string, goLiveAt: Date) {
    const reg = planRegularizationNotices(
      { id: 'r1', status: 'pending', created_at: startedAt, approved_at: null },
      ist9('2026-10-20'),
      new Set([ledgerKey('r1', '', 'submitted')]),
      goLiveAt,
    ).map((p) => `reg:${p.kind}`);
    const lateSubmitted = planRegularizationNotices(
      { id: 'r2', status: 'pending', created_at: startedAt, approved_at: null },
      ist9('2026-10-20'),
      none,
      goLiveAt,
    ).map((p) => `reg2:${p.kind}`);
    const held = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: startedAt, joiningDate: null, steps: steps([null, null]) },
      ist9('2026-10-20'),
      none,
      goLiveAt,
    ).map((p) => `onb:${p.reason}`);
    const soon = planOnboardingNotices(
      { id: 'c2', onboardingStartedAt: startedAt, joiningDate: '2026-10-21', steps: steps([null]) },
      ist9('2026-10-20'),
      none,
      goLiveAt,
    ).map((p) => `onb:${p.reason}`);
    const passed = planOnboardingNotices(
      { id: 'c3', onboardingStartedAt: startedAt, joiningDate: '2026-10-19', steps: steps([null]) },
      ist9('2026-10-20'),
      none,
      goLiveAt,
    ).map((p) => `onb:${p.reason}`);
    return [...reg, ...lateSubmitted, ...held, ...soon, ...passed].sort();
  }

  // The joining-soon candidate's single step has also been held too long, and
  // the two reminders are independent (review #4150 item 5), so it gets both.
  const EVERY = [
    'onb:held_too_long',
    'onb:held_too_long',
    'onb:joining_passed',
    'onb:joining_soon',
    'reg2:hr_head',
    'reg2:submitted',
    'reg:hr_head',
    'reg:reminder',
  ];

  it('(a) an item that arrived BEFORE go-live gets no reminder', () => {
    expect(everyNotice(before, GO_LIVE)).toEqual([]);
  });

  it('(b) an item that arrived AFTER go-live is reminded as before', () => {
    expect(everyNotice(after, GO_LIVE)).toEqual(EVERY);
  });

  it('(b) a step of an old onboarding that became someone\'s turn after go-live is a new wait', () => {
    const plan = planOnboardingNotices(
      { id: 'c1', onboardingStartedAt: before, joiningDate: null, steps: steps([after, null]) },
      ist9('2026-10-20'),
      none,
      GO_LIVE,
    );
    expect(plan).toEqual([{ kind: 'step_reminder', position: 1, reason: 'held_too_long' }]);
  });

  it('(c) with the cutoff row missing or unreadable, go-live is NOW and old items get none', () => {
    const now = ist9('2026-10-20');
    for (const stored of [undefined, null, 'not a date', 42, {}]) {
      expect(goLiveFromPolicy(stored, now)).toEqual(now);
      expect(everyNotice(before, goLiveFromPolicy(stored, now))).toEqual([]);
      expect(everyNotice(after, goLiveFromPolicy(stored, now))).toEqual([]);
    }
  });

  it('reads the timestamp Postgres stores with to_jsonb(now())', () => {
    expect(goLiveFromPolicy('2026-10-07T10:55:12.123456+00:00', new Date()).toISOString()).toBe('2026-10-07T10:55:12.123Z');
  });
});

describe('stepSubjectKey (review #4150 item 8)', () => {
  const started = '2026-10-05T04:00:00.000Z';
  const named = (index: number, step: string): OnboardingStepState => ({
    index, step, completed: false, completed_at: null,
  });

  it('does not change when HR inserts a step before it (array positions shift)', () => {
    const before = [named(0, 'Offer signed'), named(1, 'Create email')];
    const after = [named(0, 'Offer signed'), named(5, 'Police verification'), named(1, 'Create email')];
    expect(stepSubjectKey(after[2], started)).toBe(stepSubjectKey(before[1], started));
    // The inserted step does not inherit the old step 2's key.
    expect(stepSubjectKey(after[1], started)).not.toBe(stepSubjectKey(before[1], started));
  });

  it('a restarted onboarding is a fresh checklist', () => {
    const s = named(0, 'Offer signed');
    expect(stepSubjectKey(s, started)).not.toBe(stepSubjectKey(s, '2026-11-01T04:00:00.000Z'));
  });

  it('never contains the ledger separator', () => {
    expect(stepSubjectKey(named(0, 'IT | email'), started)).not.toContain('|');
  });
});

describe('isDaytimeIst (review #4150 item 6)', () => {
  it('Monday-Saturday 08:00-20:00 IST only', () => {
    expect(isDaytimeIst(new Date('2026-10-10T04:37:00Z'))).toBe(true); // Sat 10:07 IST, the schedule
    expect(isDaytimeIst(new Date('2026-10-10T02:30:00Z'))).toBe(true); // Sat 08:00 IST
    expect(isDaytimeIst(new Date('2026-10-10T02:29:00Z'))).toBe(false); // Sat 07:59 IST
    expect(isDaytimeIst(new Date('2026-10-10T14:29:00Z'))).toBe(true); // Sat 19:59 IST
    expect(isDaytimeIst(new Date('2026-10-10T14:30:00Z'))).toBe(false); // Sat 20:00 IST
    expect(isDaytimeIst(new Date('2026-10-11T04:37:00Z'))).toBe(false); // Sun 10:07 IST
    expect(isDaytimeIst(new Date('2026-10-11T19:00:00Z'))).toBe(false); // Mon 00:30 IST
  });
});
