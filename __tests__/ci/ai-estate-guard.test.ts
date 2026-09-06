/**
 * Tests for the AI estate guard's classifier.
 *
 * WHAT MAKES THESE WORTH ANYTHING
 *   Every `last_status` string below was copied verbatim out of PRODUCTION
 *   `ai_routine_schedules` on 2026-08-04, and every expected tier was confirmed
 *   by hand against the actual routine before being written here.
 *
 *   That distinction matters. A test that re-implements the classifier's own
 *   reasoning proves only that the classifier agrees with itself — the repo has
 *   been bitten by exactly that (a suite where 13 green assertions certified a
 *   live bug). These assertions are anchored to observed reality instead: if the
 *   parser drifts, or a routine changes its wording, these fail.
 *
 *   The guard has no other coverage, and a guard that is not itself tested is a
 *   guard that quietly stops guarding.
 */

import { describe, it, expect } from 'vitest';
import { classify, readCounters } from '../../scripts/ci/ai-estate-guard.mjs';

/** A fixed "now" so staleness assertions never drift with the wall clock. */
const NOW = new Date('2026-08-04T03:00:00Z').getTime();
const RECENT = '2026-08-04T01:00:00Z';
const DAILY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function row(over: Record<string, unknown> = {}) {
  return {
    routine_id: 'test-routine',
    enabled: true,
    last_status: 'HTTP 200',
    last_fired_at: RECENT,
    days_of_week: DAILY,
    ...over,
  } as never;
}

describe('counter parsing', () => {
  it('reads every "word number" pair out of a status line', () => {
    // Verbatim: scf-generate-suggestions, 2026-08-04.
    const c = readCounters('HTTP 200 · generated 0, measured 0, skipped 19, candidates 381');
    expect(c).toMatchObject({ generated: 0, measured: 0, skipped: 19, candidates: 381 });
  });

  it('is not confused by a status with no counters at all', () => {
    expect(readCounters('serviced (windows)')).toEqual({});
  });
});

describe('DOWN — unambiguous failure', () => {
  // Verbatim from the five NAAC routines that had been failing nightly for weeks.
  it('catches a 500 with an error clause', () => {
    const v = classify(
      row({ last_status: 'HTTP 500 · error: there is no unique or exclusion constraint matching the ON CONFLICT specification' }),
      NOW
    );
    expect(v.tier).toBe('DOWN');
  });

  // Verbatim: cac-attendance-rollup. A permission failure, not a code failure.
  it('catches a 503', () => {
    expect(classify(row({ last_status: 'HTTP 503 · error: Not authorised to refresh the CAC attendance rollup' }), NOW).tier)
      .toBe('DOWN');
  });

  // Verbatim: soi-weekly-quiet-digest. Reports no error, does nothing forever.
  it('catches a routine the runner does not know about', () => {
    expect(classify(row({ last_status: 'skipped: not in registry' }), NOW).tier).toBe('DOWN');
  });

  // The three maxlane routines: enabled since creation, never once fired.
  it('catches enabled-but-never-fired', () => {
    const v = classify(row({ last_status: null, last_fired_at: null }), NOW);
    expect(v.tier).toBe('DOWN');
    expect(v.why).toMatch(/never fired/i);
  });
});

describe('SILENT — the tier this guard exists for', () => {
  // Verbatim: scf-learner-notes. Reported success. Produced nothing from 623.
  it('flags work found but nothing produced', () => {
    const v = classify(
      row({ last_status: 'HTTP 200 · generated 0, skipped 0, candidates 623' }),
      NOW
    );
    expect(v.tier).toBe('SILENT');
    expect(v.why).toContain('623');
  });

  // Verbatim: ai-pulse-pde-bridge. 392 candidates, 0 created — but processed 3.
  // Output is non-zero overall, so this is NOT silent. Guards against the
  // classifier over-reporting, which is how an alarm becomes noise.
  it('does NOT flag a routine that produced something', () => {
    expect(classify(row({ last_status: 'HTTP 200 · skipped 392, created 0, candidates 392, processed 3' }), NOW).tier)
      .not.toBe('SILENT');
  });

  // Verbatim: learner-360-verdict. The healthy shape — work found AND done.
  it('does NOT flag a healthy producer', () => {
    expect(classify(row({ last_status: 'HTTP 200 · skipped 0, candidates 200, recorded 190' }), NOW).tier)
      .toBe('OK');
  });
});

describe('NOTE — zero output, but zero to do', () => {
  // Verbatim: measure-gap-outcomes. Nothing found, nothing produced. Correct.
  it('separates "nothing to do" from "found work and failed"', () => {
    const v = classify(row({ last_status: 'HTTP 200 · measured 0' }), NOW);
    expect(v.tier).toBe('NOTE');
  });
});

describe('STALE — judged against the routine\'s own cadence', () => {
  it('flags a daily routine that has not run in 3 days', () => {
    const v = classify(row({ last_fired_at: '2026-08-01T01:00:00Z' }), NOW);
    expect(v.tier).toBe('STALE');
  });

  it('does NOT flag a weekly routine at 3 days', () => {
    const v = classify(
      row({ last_fired_at: '2026-08-01T01:00:00Z', days_of_week: ['mon'] }),
      NOW
    );
    expect(v.tier).not.toBe('STALE');
  });

  it('DOES flag a weekly routine that has missed its whole week', () => {
    const v = classify(
      row({ last_fired_at: '2026-07-20T01:00:00Z', days_of_week: ['mon'] }),
      NOW
    );
    expect(v.tier).toBe('STALE');
  });
});

describe('precedence', () => {
  it('a crash outranks staleness — report the cause, not the symptom', () => {
    // copo-attainment on 2026-08-04: both erroring AND 3 days stale. The error
    // is the actionable fact; "it is late" would bury it.
    const v = classify(
      row({ last_status: 'HTTP 500 · error: no unique constraint', last_fired_at: '2026-08-01T01:00:00Z' }),
      NOW
    );
    expect(v.tier).toBe('DOWN');
  });

  it('a switched-off routine is never reported as broken', () => {
    // maxlane:session-feedback-escalation — deliberately disabled. Silence here
    // is correct; alarming on it would be noise that trains people to ignore.
    expect(classify(row({ enabled: false, last_fired_at: '2026-07-13T01:00:00Z' }), NOW).tier)
      .toBe('OFF');
  });
});
