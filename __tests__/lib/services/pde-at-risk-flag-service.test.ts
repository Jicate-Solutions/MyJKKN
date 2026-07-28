import { describe, it, expect } from 'vitest';

import {
  isFlaggableRiskLevel,
  reduceToWorstPerLearner,
  utcFlagDate,
  type AtRiskViewRow,
} from '@/lib/services/pde-at-risk-flag-service';

// ---------------------------------------------------------------------------
// The sweep's only real judgment is collapsing per-(learner, course) view rows
// to one row per learner. Getting it wrong makes "days flagged" count cron runs
// instead of days, so it is worth pinning.
// ---------------------------------------------------------------------------

function row(over: Partial<AtRiskViewRow>): AtRiskViewRow {
  return {
    learner_id: 'L1',
    course_id: 'C1',
    full_name: 'Test Learner',
    email: 'test@jkkn.ac.in',
    last_active_date: '2026-07-10',
    days_inactive: 4,
    avg_score: 62,
    total_time: 120,
    total_lessons_completed: 8,
    risk_level: 'warning',
    ...over,
  };
}

describe('utcFlagDate', () => {
  it('returns the UTC calendar day, not the local one', () => {
    // 2026-07-21T23:30Z is still the 21st in UTC even where local time is the 22nd.
    expect(utcFlagDate(new Date('2026-07-21T23:30:00.000Z'))).toBe('2026-07-21');
    expect(utcFlagDate(new Date('2026-07-22T00:05:00.000Z'))).toBe('2026-07-22');
  });
});

describe('isFlaggableRiskLevel', () => {
  it('accepts the three flag bands', () => {
    expect(isFlaggableRiskLevel('critical')).toBe(true);
    expect(isFlaggableRiskLevel('warning')).toBe(true);
    expect(isFlaggableRiskLevel('struggling')).toBe(true);
  });

  it('rejects on_track and null — an on-track learner is not a flag', () => {
    expect(isFlaggableRiskLevel('on_track')).toBe(false);
    expect(isFlaggableRiskLevel(null)).toBe(false);
  });
});

describe('reduceToWorstPerLearner', () => {
  it('collapses multiple course rows into one entry per learner', () => {
    const out = reduceToWorstPerLearner([
      row({ course_id: 'C1', risk_level: 'warning' }),
      row({ course_id: 'C2', risk_level: 'struggling' }),
      row({ course_id: 'C3', risk_level: 'warning' }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].courses_flagged).toBe(3);
    expect(out[0].course_ids.sort()).toEqual(['C1', 'C2', 'C3']);
  });

  it('keeps the worst band regardless of input order', () => {
    const ascending = reduceToWorstPerLearner([
      row({ course_id: 'C1', risk_level: 'struggling' }),
      row({ course_id: 'C2', risk_level: 'critical', days_inactive: 12 }),
    ]);
    const descending = reduceToWorstPerLearner([
      row({ course_id: 'C2', risk_level: 'critical', days_inactive: 12 }),
      row({ course_id: 'C1', risk_level: 'struggling' }),
    ]);

    expect(ascending[0].risk_level).toBe('critical');
    expect(ascending[0].course_id).toBe('C2');
    expect(descending[0].risk_level).toBe('critical');
    expect(descending[0].course_id).toBe('C2');
  });

  it('breaks ties on the higher days_inactive', () => {
    const out = reduceToWorstPerLearner([
      row({ course_id: 'C1', risk_level: 'warning', days_inactive: 4 }),
      row({ course_id: 'C2', risk_level: 'warning', days_inactive: 6 }),
    ]);

    expect(out[0].course_id).toBe('C2');
    expect(out[0].days_inactive).toBe(6);
    expect(out[0].courses_flagged).toBe(2);
  });

  it('keeps distinct learners separate', () => {
    const out = reduceToWorstPerLearner([
      row({ learner_id: 'L1' }),
      row({ learner_id: 'L2', risk_level: 'critical' }),
    ]);

    expect(out).toHaveLength(2);
    expect(out.find((o) => o.learner_id === 'L2')?.risk_level).toBe('critical');
  });

  it('drops on_track and rows with no learner id', () => {
    const out = reduceToWorstPerLearner([
      row({ learner_id: 'L1', risk_level: 'on_track' }),
      row({ learner_id: null }),
      row({ learner_id: 'L2', risk_level: 'critical' }),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].learner_id).toBe('L2');
  });

  it('tolerates a null course_id without polluting course_ids', () => {
    const out = reduceToWorstPerLearner([
      row({ course_id: null, risk_level: 'critical', days_inactive: 20 }),
      row({ course_id: 'C2', risk_level: 'warning' }),
    ]);

    expect(out[0].risk_level).toBe('critical');
    expect(out[0].course_id).toBeNull();
    expect(out[0].course_ids).toEqual(['C2']);
  });
});
