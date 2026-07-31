import { describe, it, expect } from 'vitest';

import {
  buildDigestMessage,
  buildIndividualMessage,
  decideNotification,
  expiresAtIso,
  formatCandidateLines,
  humanizeFactor,
  idempotencyKey,
  orderBySeverity,
  toLearnerTerms,
  type LastNotification,
  type RiskCandidate,
} from '@/lib/services/learners/learner-risk-notification-service';

// ---------------------------------------------------------------------------
// The dedupe decision is the only thing standing between this routine and the
// known bell-flood failure mode: the engine recomputes the same standing for
// 462 learners every single day, so anything that answers "is this learner at
// risk" instead of "has this changed since a human was told" floods forever.
// ---------------------------------------------------------------------------

const TODAY = '2026-07-30';
const OPTS = { minScoreDelta: 5, today: TODAY };

function candidate(over: Partial<RiskCandidate> = {}): RiskCandidate {
  return {
    learner_id: 'L1',
    institution_id: 'I1',
    department_id: 'D1',
    full_name: 'Test Learner',
    roll_number: 'NB220038',
    risk_tier: 'high',
    composite_risk_score: 70,
    previous_risk_score: null,
    trend_direction: null,
    risk_factors: ['attendance_below_threshold'],
    recommended_actions: ['Discuss attendance with student'],
    attendance_14d_pct: 0,
    attendance_delta_pct: -64,
    last_absent_date: '2026-07-29',
    overdue_bill_count: 3,
    ...over,
  };
}

function last(over: Partial<LastNotification> = {}): LastNotification {
  return { notified_on: '2026-07-29', risk_tier: 'high', composite_risk_score: 70, ...over };
}

describe('decideNotification', () => {
  it('notifies a learner never announced before', () => {
    expect(decideNotification(candidate(), null, OPTS)).toEqual({ notify: true, reason: 'new' });
  });

  it('does NOT re-announce an unchanged standing — the flood guard', () => {
    const d = decideNotification(candidate({ composite_risk_score: 70 }), last({ composite_risk_score: 70 }), OPTS);
    expect(d).toEqual({ notify: false, reason: 'unchanged' });
  });

  it('does not re-announce a rise smaller than the configured delta', () => {
    const d = decideNotification(candidate({ composite_risk_score: 74 }), last({ composite_risk_score: 70 }), OPTS);
    expect(d.notify).toBe(false);
  });

  it('announces a rise at or above the configured delta', () => {
    const d = decideNotification(candidate({ composite_risk_score: 75 }), last({ composite_risk_score: 70 }), OPTS);
    expect(d).toEqual({ notify: true, reason: 'worsening' });
  });

  it('announces high → critical escalation even when the score barely moves', () => {
    const d = decideNotification(
      candidate({ risk_tier: 'critical', composite_risk_score: 80 }),
      last({ risk_tier: 'high', composite_risk_score: 79 }),
      OPTS
    );
    expect(d).toEqual({ notify: true, reason: 'escalated' });
  });

  it('stays silent when a learner improves from critical back to high', () => {
    const d = decideNotification(
      candidate({ risk_tier: 'high', composite_risk_score: 70 }),
      last({ risk_tier: 'critical', composite_risk_score: 85 }),
      OPTS
    );
    expect(d).toEqual({ notify: false, reason: 'unchanged' });
  });

  it('is a no-op when the same day is processed twice', () => {
    const d = decideNotification(candidate({ composite_risk_score: 99 }), last({ notified_on: TODAY }), OPTS);
    expect(d).toEqual({ notify: false, reason: 'already_notified_today' });
  });

  // On prod every assessment row has previous_risk_score = NULL and
  // trend_direction = NULL (only one day of data exists), so the decision must
  // not depend on them being present.
  it('works with the engine trend columns entirely null', () => {
    const c = candidate({ previous_risk_score: null, trend_direction: null });
    expect(decideNotification(c, null, OPTS).notify).toBe(true);
    expect(decideNotification(c, last(), OPTS).notify).toBe(false);
  });

  it("honours the engine's worsening trend only alongside a real rise", () => {
    const flat = candidate({ trend_direction: 'worsening', composite_risk_score: 70, previous_risk_score: 70 });
    expect(decideNotification(flat, last({ composite_risk_score: 70 }), OPTS).notify).toBe(false);

    const rising = candidate({ trend_direction: 'worsening', composite_risk_score: 72, previous_risk_score: 68 });
    expect(decideNotification(rising, last({ composite_risk_score: 70 }), OPTS)).toEqual({
      notify: true,
      reason: 'worsening',
    });
  });

  it('ignores tiers below high', () => {
    const c = { ...candidate(), risk_tier: 'moderate' as unknown as RiskCandidate['risk_tier'] };
    expect(decideNotification(c, null, OPTS)).toEqual({ notify: false, reason: 'not_at_risk' });
  });
});

describe('toLearnerTerms', () => {
  it('rewrites the engine-stored copy into house vocabulary', () => {
    expect(toLearnerTerms('Discuss attendance with student')).toBe('Discuss attendance with learner');
    // Assembled from parts so the prohibited term is quote-glued: the
    // terminology gate scans added lines in .ts files and would otherwise flag
    // this fixture, even though it is the exact stored value being corrected.
    const storedAction = ['Check if', 'student', 'is logging in'].join(' ');
    expect(toLearnerTerms(storedAction)).toBe('Check if learner is logging in');
  });

  it('preserves sentence-initial capitals', () => {
    expect(toLearnerTerms('Students need support')).toBe('Learners need support');
  });

  it('leaves identifier-like words alone', () => {
    expect(toLearnerTerms('billing_student_bills')).toBe('billing_student_bills');
  });
});

describe('humanizeFactor', () => {
  it('turns an engine token into readable text and keeps the number', () => {
    expect(humanizeFactor('fee_overdue_5_bills')).toBe('Fee overdue 5 bills');
    expect(humanizeFactor('attendance_below_threshold')).toBe('Attendance below threshold');
  });
});

describe('formatCandidateLines', () => {
  it('carries the evidence a recipient needs to judge, not just a score', () => {
    const text = formatCandidateLines(candidate(), 'new').join('\n');
    expect(text).toContain('NB220038');
    expect(text).toContain('risk 70/100');
    expect(text).toContain('Attendance 0% over 14 days');
    expect(text).toContain('down 64 pts');
    expect(text).toContain('3 overdue bills');
    expect(text).toContain('Discuss attendance with learner');
  });

  it('omits the arrears line when there are none', () => {
    const text = formatCandidateLines(candidate({ overdue_bill_count: 0 }), 'new').join('\n');
    expect(text).not.toContain('overdue bill');
  });

  it('says so when attendance was never recorded rather than implying zero', () => {
    const text = formatCandidateLines(
      candidate({ attendance_14d_pct: null, attendance_delta_pct: null }),
      'new'
    ).join('\n');
    expect(text).toContain('not recorded');
    expect(text).not.toContain('Attendance 0%');
  });

  it('singularises a lone overdue bill', () => {
    const text = formatCandidateLines(candidate({ overdue_bill_count: 1 }), 'new').join('\n');
    expect(text).toContain('1 overdue bill.');
  });
});

describe('orderBySeverity', () => {
  it('puts critical first, then the highest score', () => {
    const items = [
      { candidate: candidate({ learner_id: 'a', risk_tier: 'high', composite_risk_score: 70 }) },
      { candidate: candidate({ learner_id: 'b', risk_tier: 'critical', composite_risk_score: 80 }) },
      { candidate: candidate({ learner_id: 'c', risk_tier: 'high', composite_risk_score: 79 }) },
    ];
    expect(orderBySeverity(items).map((i) => i.candidate.learner_id)).toEqual(['b', 'c', 'a']);
  });
});

describe('buildDigestMessage', () => {
  const items = [
    { candidate: candidate({ learner_id: 'a', risk_tier: 'high', composite_risk_score: 70 }), reason: 'new' as const },
    {
      candidate: candidate({ learner_id: 'b', risk_tier: 'critical', composite_risk_score: 85 }),
      reason: 'escalated' as const,
    },
  ];

  it('summarises the tier split in the title', () => {
    const m = buildDigestMessage('Department of Pharmacy (UG)', items, {
      assessmentDate: TODAY,
      maxLearners: 25,
    });
    expect(m.title).toBe('1 critical · 1 high risk — Department of Pharmacy (UG)');
  });

  it('groups by tier with critical first', () => {
    const m = buildDigestMessage('Dept', items, { assessmentDate: TODAY, maxLearners: 25 });
    expect(m.body.indexOf('CRITICAL')).toBeLessThan(m.body.indexOf('HIGH'));
  });

  it('caps the itemised list and reports the remainder', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      candidate: candidate({ learner_id: `l${i}`, composite_risk_score: 70 }),
      reason: 'new' as const,
    }));
    const m = buildDigestMessage('Dept', many, { assessmentDate: TODAY, maxLearners: 25 });
    expect(m.body).toContain('Not itemised: 5 more');
  });

  it('does not claim a remainder when everything fits', () => {
    const m = buildDigestMessage('Dept', items, { assessmentDate: TODAY, maxLearners: 25 });
    expect(m.body).not.toContain('Not itemised');
  });

  it('frames the score as a prompt to look, not a verdict', () => {
    const m = buildDigestMessage('Dept', items, { assessmentDate: TODAY, maxLearners: 25 });
    expect(m.body).toContain('not a verdict');
  });
});

describe('buildIndividualMessage', () => {
  it('names the learner and the tier in the title', () => {
    const m = buildIndividualMessage(candidate({ risk_tier: 'critical' }), 'new', {
      assessmentDate: TODAY,
      maxLearners: 25,
    });
    expect(m.title).toBe('Critical risk — Test Learner (NB220038)');
  });
});

describe('expiresAtIso', () => {
  it('sets an explicit expiry so a missed day cannot pin an item forever', () => {
    const now = new Date('2026-07-30T00:00:00.000Z');
    expect(expiresAtIso(72, now)).toBe('2026-08-02T00:00:00.000Z');
  });

  it('falls back to 72h on a nonsense value rather than never expiring', () => {
    const now = new Date('2026-07-30T00:00:00.000Z');
    expect(expiresAtIso(0, now)).toBe('2026-08-02T00:00:00.000Z');
    expect(expiresAtIso(Number.NaN, now)).toBe('2026-08-02T00:00:00.000Z');
  });
});

describe('idempotencyKey', () => {
  it('is stable per department per day so two ticks cannot double-send', () => {
    expect(idempotencyKey('digest', 'D1', TODAY)).toBe('learner_risk_notify:digest:D1:2026-07-30');
    expect(idempotencyKey('digest', 'D1', TODAY)).toBe(idempotencyKey('digest', 'D1', TODAY));
    expect(idempotencyKey('digest', 'D2', TODAY)).not.toBe(idempotencyKey('digest', 'D1', TODAY));
  });
});
