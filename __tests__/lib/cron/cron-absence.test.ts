/**
 * A scheduled job that STOPS raises the same alarm as one that fails.
 *
 * THE RECEIPT these tests are written against, measured live on 2026-09-14 at
 * 14:05 IST: cron_run_log held 16 runs for `whats-new-highlight-drafts`, every
 * one of them ok = true, and the latest was 08:13 — six hours earlier on a
 * `13,43 * * * *` schedule, so roughly a dozen fires simply did not happen.
 * fn_cron_failure_streaks counts CONSECUTIVE FAILURES, so sixteen successes
 * followed by silence is a streak of zero: nothing tripped, and nothing could.
 *
 * The first test below is that exact job, that exact silence, and it must fire.
 * The rest are the false alarms that would make the alarm worthless — an alarm
 * that fires on noise trains everyone to ignore it, and is then worth less than
 * no alarm at all.
 */
import { describe, it, expect } from 'vitest';
import {
  findAbsentJobs,
  parseExpectedIntervals,
  describeAbsence,
  MIN_SILENCE_MINUTES,
  DEFAULT_ABSENCE_MULTIPLIER,
} from '@/lib/cron/absence';

const NOW = new Date('2026-09-14T14:05:00+05:30');
const at = (iso: string) => new Date(iso).toISOString();

describe('findAbsentJobs — the receipt', () => {
  it('catches the half-hourly job that has not run for six hours', () => {
    const hits = findAbsentJobs({
      lastRuns: [
        {
          job_key: 'whats-new-highlight-drafts',
          path: '/api/cron/whats-new-highlight-drafts',
          last_run_at: at('2026-09-14T08:13:00+05:30'),
          runs_in_window: 16,
        },
      ],
      expected: new Map([['whats-new-highlight-drafts', 30]]),
      now: NOW,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].job_key).toBe('whats-new-highlight-drafts');
    expect(hits[0].silent_minutes).toBe(352);
  });

  it('would have caught it four and a half hours earlier', () => {
    // 30 minutes declared × 3 = 90 minutes of budget. The point of the whole
    // change: the alarm should not need six hours to notice.
    const hits = findAbsentJobs({
      lastRuns: [
        {
          job_key: 'whats-new-highlight-drafts',
          path: null,
          last_run_at: at('2026-09-14T08:13:00+05:30'),
          runs_in_window: 16,
        },
      ],
      expected: new Map([['whats-new-highlight-drafts', 30]]),
      now: new Date('2026-09-14T09:50:00+05:30'),
    });
    expect(hits).toHaveLength(1);
  });

  it('stays quiet while the job is running on time', () => {
    const hits = findAbsentJobs({
      lastRuns: [
        {
          job_key: 'whats-new-highlight-drafts',
          path: null,
          last_run_at: at('2026-09-14T13:43:00+05:30'),
          runs_in_window: 600,
        },
      ],
      expected: new Map([['whats-new-highlight-drafts', 30]]),
      now: NOW,
    });
    expect(hits).toEqual([]);
  });

  it('absorbs a single dropped fire', () => {
    // Vercel drops one occasionally and a deploy skips one. Paging on that is
    // the noise the streak detector's own header refuses, for the same reason.
    const hits = findAbsentJobs({
      lastRuns: [
        {
          job_key: 'whats-new-highlight-drafts',
          path: null,
          last_run_at: at('2026-09-14T13:13:00+05:30'),
          runs_in_window: 600,
        },
      ],
      expected: new Map([['whats-new-highlight-drafts', 30]]),
      now: NOW,
    });
    expect(hits).toEqual([]);
  });
});

describe('findAbsentJobs — the false alarms it must not raise', () => {
  it('says nothing about a job nobody declared a cadence for', () => {
    // Cadence is declared, never inferred. A job's own history normalises its
    // breakage — 16 runs in 14 days on a half-hourly schedule makes six hours
    // of silence look ordinary — so an undeclared job is not watched at all
    // rather than watched against a number derived from its own fault.
    const hits = findAbsentJobs({
      lastRuns: [
        { job_key: 'some-other-cron', path: null, last_run_at: at('2026-08-01T00:00:00Z'), runs_in_window: 3 },
      ],
      expected: new Map([['whats-new-highlight-drafts', 30]]),
      now: NOW,
    });
    expect(hits).toEqual([]);
  });

  it('does not page about a healthy weekly job between its bursts', () => {
    // aipulse-domain-starter-notify fires ten times on a Thursday and then not
    // for six days. Declared as its LONGEST normal gap (7 days), a Friday is
    // silence the schedule expects.
    const hits = findAbsentJobs({
      lastRuns: [
        {
          job_key: 'aipulse-domain-starter-notify',
          path: null,
          last_run_at: at('2026-09-11T23:00:00+05:30'),
          runs_in_window: 20,
        },
      ],
      expected: new Map([['aipulse-domain-starter-notify', 7 * 24 * 60]]),
      now: NOW,
    });
    expect(hits).toEqual([]);
  });

  it('never pages on less than the floor, however short the declared interval', () => {
    const hits = findAbsentJobs({
      lastRuns: [
        {
          job_key: 'every-minute',
          path: null,
          last_run_at: new Date(NOW.getTime() - (MIN_SILENCE_MINUTES - 5) * 60_000).toISOString(),
          runs_in_window: 5000,
        },
      ],
      expected: new Map([['every-minute', 1]]),
      now: NOW,
    });
    expect(hits).toEqual([]);
  });

  it('ignores an unparseable or future timestamp rather than inventing silence', () => {
    const hits = findAbsentJobs({
      lastRuns: [
        { job_key: 'a', path: null, last_run_at: 'not a date', runs_in_window: 4 },
        { job_key: 'b', path: null, last_run_at: at('2026-09-20T00:00:00Z'), runs_in_window: 4 },
      ],
      expected: new Map([['a', 30], ['b', 30]]),
      now: NOW,
    });
    expect(hits).toEqual([]);
  });

  it('says nothing about a declared job that has never run', () => {
    // It has no row and therefore no last_run_at to key an alert on. Paging
    // from the moment a route is declared — including before it is deployed —
    // is a different failure from the one this exists to catch.
    const hits = findAbsentJobs({ lastRuns: [], expected: new Map([['a', 30]]), now: NOW });
    expect(hits).toEqual([]);
  });

  it('reports the longest silence first', () => {
    const hits = findAbsentJobs({
      lastRuns: [
        { job_key: 'recent', path: null, last_run_at: at('2026-09-14T05:00:00+05:30'), runs_in_window: 9 },
        { job_key: 'ancient', path: null, last_run_at: at('2026-09-10T05:00:00+05:30'), runs_in_window: 9 },
      ],
      expected: new Map([['recent', 30], ['ancient', 30]]),
      now: NOW,
    });
    expect(hits.map((h) => h.job_key)).toEqual(['ancient', 'recent']);
  });

  it('uses the documented multiplier by default and honours an override', () => {
    const lastRuns = [
      { job_key: 'a', path: null, last_run_at: at('2026-09-14T11:20:00+05:30'), runs_in_window: 9 },
    ];
    const expected = new Map([['a', 60]]);
    expect(DEFAULT_ABSENCE_MULTIPLIER).toBe(3);
    // 165 minutes of silence against a 60-minute interval: inside 3x, outside 2x.
    expect(findAbsentJobs({ lastRuns, expected, now: NOW })).toEqual([]);
    expect(findAbsentJobs({ lastRuns, expected, now: NOW, multiplier: 2 })).toHaveLength(1);
  });
});

describe('parseExpectedIntervals', () => {
  it('reads the config row', () => {
    const m = parseExpectedIntervals({ 'whats-new-highlight-drafts': 30, other: '60' });
    expect(m.get('whats-new-highlight-drafts')).toBe(30);
    expect(m.get('other')).toBe(60);
  });

  it('drops a malformed entry without taking the rest of the map down', () => {
    // One bad value must not stop every other job being watched.
    const m = parseExpectedIntervals({ good: 30, zero: 0, negative: -5, words: 'soon', nothing: null });
    expect([...m.keys()]).toEqual(['good']);
  });

  it('survives a policy row that is missing or the wrong shape', () => {
    expect(parseExpectedIntervals(null).size).toBe(0);
    expect(parseExpectedIntervals(undefined).size).toBe(0);
    expect(parseExpectedIntervals('30').size).toBe(0);
    expect(parseExpectedIntervals([1, 2]).size).toBe(0);
  });
});

describe('describeAbsence', () => {
  it('says how long the silence is in units a person reads', () => {
    expect(
      describeAbsence({
        job_key: 'whats-new-highlight-drafts',
        path: null,
        expected_interval_minutes: 30,
        silent_minutes: 352,
        last_run_at: at('2026-09-14T08:13:00+05:30'),
        runs_in_window: 16,
      })
    ).toBe('whats-new-highlight-drafts: no run for 5 hours (expected every 30 min)');
  });
});
