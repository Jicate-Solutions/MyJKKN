/**
 * When the all-history attendance figure was last worked out.
 *
 * cac_attendance_rollup is filled by a nightly job. From the page there is no
 * difference between a job that runs every night and a job that stopped three
 * weeks ago — both leave a table with rows in it — so the age is the only
 * signal a reader gets, and getting it wrong is worse than not showing it.
 *
 * Two states carry the weight:
 *
 *   - `never`, which is where the table stands today. It has zero rows. The
 *     one thing this must not do is fall back to a dash or to today's date,
 *     because a job that has never once run would then read as one that ran
 *     this morning.
 *
 *   - `stale`, which cannot be proved by waiting a day and cannot be proved by
 *     writing an old timestamp into production. Both the clock and the stored
 *     value are injected here instead, so the 24h boundary is exercised from
 *     both sides without touching the table.
 *
 * `unknown` is kept apart from `never` deliberately: "nobody computed this"
 * and "we could not find out" are different claims, and only the first is a
 * statement about the job.
 *
 * Pure function, tested without a database — the hook around it pulls in the
 * Supabase client and cannot be imported under vitest.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyRollupFreshness,
  CAC_ROLLUP_STALE_AFTER_MS,
} from '@/hooks/accreditation/use-cac-metrics';

const NOW = new Date('2026-08-01T09:00:00.000Z');

/** A stored computed_at that is `ms` old relative to NOW. */
function agedBy(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const HOUR = 60 * 60 * 1000;

describe('classifyRollupFreshness', () => {
  it('reports never when the rollup holds nothing — the state on 2026-08-01', () => {
    expect(classifyRollupFreshness(null, false, NOW)).toEqual({
      state: 'never',
    });
  });

  it('treats an absent computed_at the same as an absent row', () => {
    expect(classifyRollupFreshness(undefined, false, NOW).state).toBe('never');
  });

  it('never carries a date, so nothing downstream can print one', () => {
    const verdict = classifyRollupFreshness(null, false, NOW);
    expect(verdict).not.toHaveProperty('computedAt');
  });

  it('is fresh just inside the window', () => {
    const verdict = classifyRollupFreshness(agedBy(23 * HOUR), false, NOW);
    expect(verdict.state).toBe('fresh');
  });

  it('is stale just outside the window', () => {
    const verdict = classifyRollupFreshness(agedBy(25 * HOUR), false, NOW);
    expect(verdict.state).toBe('stale');
  });

  // The boundary itself. `>` not `>=`, so exactly 24h old is still fresh: a job
  // that runs at 02:40 every night is 24h old the moment before it runs again,
  // and flagging that would put the page permanently amber on a healthy job.
  it('is fresh at exactly the threshold and stale one millisecond past it', () => {
    expect(
      classifyRollupFreshness(agedBy(CAC_ROLLUP_STALE_AFTER_MS), false, NOW)
        .state,
    ).toBe('fresh');
    expect(
      classifyRollupFreshness(agedBy(CAC_ROLLUP_STALE_AFTER_MS + 1), false, NOW)
        .state,
    ).toBe('stale');
  });

  it('keeps the parsed timestamp on both computed states so the page can show it', () => {
    const at = agedBy(2 * HOUR);
    const fresh = classifyRollupFreshness(at, false, NOW);
    const stale = classifyRollupFreshness(agedBy(48 * HOUR), false, NOW);
    expect(fresh).toMatchObject({ state: 'fresh' });
    expect(stale).toMatchObject({ state: 'stale' });
    if (fresh.state !== 'fresh' || stale.state !== 'stale') {
      throw new Error('narrowing guard — both states must carry computedAt');
    }
    expect(fresh.computedAt.toISOString()).toBe(at);
    expect(stale.computedAt.getTime()).toBeLessThan(NOW.getTime());
  });

  it('does not call a failed read "never" — that would blame the job', () => {
    expect(classifyRollupFreshness(null, true, NOW).state).toBe('unknown');
    expect(classifyRollupFreshness(agedBy(HOUR), true, NOW).state).toBe(
      'unknown',
    );
  });

  it('does not call an unparseable timestamp "never" either', () => {
    expect(classifyRollupFreshness('not a timestamp', false, NOW).state).toBe(
      'unknown',
    );
  });

  // Clock skew between the database and the browser can put computed_at very
  // slightly ahead of now. A negative age must not wrap into stale.
  it('treats a timestamp fractionally in the future as fresh, not stale', () => {
    const ahead = new Date(NOW.getTime() + 30 * 1000).toISOString();
    expect(classifyRollupFreshness(ahead, false, NOW).state).toBe('fresh');
  });

  it('honours an injected window so the threshold is not hardcoded downstream', () => {
    const at = agedBy(2 * HOUR);
    expect(classifyRollupFreshness(at, false, NOW, HOUR).state).toBe('stale');
    expect(classifyRollupFreshness(at, false, NOW, 3 * HOUR).state).toBe(
      'fresh',
    );
  });

  it('defaults the window to 24 hours', () => {
    expect(CAC_ROLLUP_STALE_AFTER_MS).toBe(24 * HOUR);
  });
});
