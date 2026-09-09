import { describe, it, expect } from 'vitest';
import {
  classifyBdError,
  selectSuppressedHandles,
  SUPPRESS_AFTER_PERMANENT_FAILURES,
  SUPPRESSION_WINDOW_DAYS,
  type BdErrorLogRow,
} from '@/lib/instagram/business-discovery-errors';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** A social_instagram_logs error row, as the poller writes them. */
function row(username: string, message: string, at: number): BdErrorLogRow {
  return {
    payload: { username },
    error_message: message,
    occurred_at: new Date(at).toISOString(),
  };
}

/** Meta code 110 — 6,647 of the 6,653 recorded failures carry this exact text. */
const INVALID = 'Invalid user id';

describe('classifyBdError', () => {
  it('treats the message behind 99.91% of production failures as permanent', () => {
    expect(classifyBdError(INVALID)).toBe('permanent');
  });

  it('recognises the oversized-response refusal (1 row in 89 days)', () => {
    expect(
      classifyBdError(
        "Please reduce the amount of data you're asking for, then retry your request"
      )
    ).toBe('oversized');
  });

  it('leaves genuine blips transient so a healthy handle is never suppressed', () => {
    expect(classifyBdError('fetch failed')).toBe('transient');
    expect(
      classifyBdError('An unexpected error has occurred. Please retry your request later.')
    ).toBe('transient');
    expect(classifyBdError('ig_accounts upsert failed: TypeError: fetch failed')).toBe(
      'transient'
    );
    expect(classifyBdError(null)).toBe('transient');
  });
});

describe('selectSuppressedHandles', () => {
  // Midday so "today" has hours on both sides of `now`.
  const noon = Date.parse('2026-09-09T12:00:00.000Z');

  it('does not suppress before the threshold is reached', () => {
    const rows = [row('jkkn_otat', INVALID, noon - HOUR), row('jkkn_otat', INVALID, noon - 2 * HOUR)];
    expect(selectSuppressedHandles(rows, noon).size).toBe(0);
  });

  it('suppresses once the threshold is reached and it has failed today', () => {
    const rows = [
      row('jkkn_otat', INVALID, noon - HOUR),
      row('jkkn_otat', INVALID, noon - 2 * HOUR),
      row('jkkn_otat', INVALID, noon - 3 * HOUR),
    ];
    const got = selectSuppressedHandles(rows, noon);
    expect(got.get('jkkn_otat')).toEqual({
      username: 'jkkn_otat',
      permanent_failures: SUPPRESS_AFTER_PERMANENT_FAILURES,
      kind: 'permanent',
    });
  });

  it('matches handles case-insensitively, as the route looks them up', () => {
    const rows = [1, 2, 3].map((h) => row('JKKN_OTAT', INVALID, noon - h * HOUR));
    expect(selectSuppressedHandles(rows, noon).has('jkkn_otat')).toBe(true);
  });

  it('never suppresses on transient failures, however many', () => {
    const rows = [1, 2, 3, 4, 5].map((h) => row('jkkn_english', 'fetch failed', noon - h * HOUR));
    expect(selectSuppressedHandles(rows, noon).size).toBe(0);
  });

  it('never suppresses on the oversized refusal — that path retries smaller instead', () => {
    const rows = [1, 2, 3, 4].map((h) =>
      row(
        'jkkn_oralandmaxillofacialsurge',
        "Please reduce the amount of data you're asking for, then retry your request",
        noon - h * HOUR
      )
    );
    expect(selectSuppressedHandles(rows, noon).size).toBe(0);
  });

  it('ignores failures older than the window', () => {
    const rows = [1, 2, 3].map((d) =>
      row('jkkn_otat', INVALID, noon - (SUPPRESSION_WINDOW_DAYS + d) * DAY)
    );
    expect(selectSuppressedHandles(rows, noon).size).toBe(0);
  });

  // The defect the reviewer caught in the first design: suppression stops the
  // handle calling Meta, which stops it writing the error rows the counter
  // reads. A 24h window would empty itself and un-suppress every day. These two
  // cases pin the steady state at ONE attempt per UTC day.
  describe('steady state does not self-erase', () => {
    it('stays suppressed on one error row per day (the sawtooth case)', () => {
      // What the log looks like after a week of suppression: exactly one row
      // per day, written by that day's single forced attempt.
      const rows = [0, 1, 2, 3, 4, 5, 6].map((d) =>
        row('jkkn_otat', INVALID, noon - d * DAY - HOUR)
      );
      const got = selectSuppressedHandles(rows, noon);
      expect(got.has('jkkn_otat')).toBe(true);
      expect(got.get('jkkn_otat')!.permanent_failures).toBe(7);
    });

    it('lets the first tick of a new UTC day through even at 7 failures', () => {
      // 00:10 UTC: yesterday and the six days before it each hold one failure,
      // but nothing has failed TODAY yet — so the handle is attempted, which is
      // how it recovers without anyone touching it.
      const justAfterMidnight = Date.parse('2026-09-09T00:10:00.000Z');
      const rows = [1, 2, 3, 4, 5, 6, 7].map((d) =>
        row('jkkn_otat', INVALID, justAfterMidnight - d * DAY)
      );
      expect(selectSuppressedHandles(rows, justAfterMidnight).size).toBe(0);
    });
  });

  it('un-suppresses as soon as a handle stops failing', () => {
    // It failed three times two days ago and has produced nothing since — the
    // department fixed the handle. Nothing today, so nothing is suppressed.
    const rows = [1, 2, 3].map((h) => row('jkkn_otat', INVALID, noon - 2 * DAY - h * HOUR));
    expect(selectSuppressedHandles(rows, noon).size).toBe(0);
  });

  it('suppresses each failing handle independently', () => {
    const rows: BdErrorLogRow[] = [];
    for (const h of [1, 2, 3]) {
      rows.push(row('jkkn_otat', INVALID, noon - h * HOUR));
      rows.push(row('jkkn_obgyn', INVALID, noon - h * HOUR));
      rows.push(row('jkkn_pharmacology', 'fetch failed', noon - h * HOUR));
    }
    const got = selectSuppressedHandles(rows, noon);
    expect([...got.keys()].sort()).toEqual(['jkkn_obgyn', 'jkkn_otat']);
  });

  it('ignores rows with no handle in the payload', () => {
    const rows: BdErrorLogRow[] = [
      { payload: null, error_message: INVALID, occurred_at: new Date(noon - HOUR).toISOString() },
      { payload: {}, error_message: INVALID, occurred_at: new Date(noon - HOUR).toISOString() },
      { payload: { username: '  ' }, error_message: INVALID, occurred_at: new Date(noon).toISOString() },
    ];
    expect(selectSuppressedHandles(rows, noon).size).toBe(0);
  });
});
