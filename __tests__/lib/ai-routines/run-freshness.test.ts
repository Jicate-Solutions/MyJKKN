import { describe, it, expect } from 'vitest';

// The REAL functions shipped in the admin screen — imported, never re-modelled.
// A test that re-implements the rule only proves the test agrees with itself.
import {
  classifyRunFreshness,
  maxScheduledGapHours,
} from '@/app/(routes)/admin/ai-routines/_components/ai-routines-control';
import type { ScheduleRow } from '@/app/(routes)/admin/ai-routines/_components/schedule-editor';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** A dispatcher-managed, enabled row — the shape the rule is meant to judge. */
function row(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    routine_id: 'scf-learner-notes',
    enabled: true,
    managed: true,
    days_of_week: EVERY_DAY,
    minute_of_day: 277, // 04:37 IST — the case where the UTC stamp lands on the PREVIOUS day
    last_fired_slot: null,
    last_fired_at: null,
    last_status: null,
    ...over,
  };
}

const HOUR = 3_600_000;
/** A fixed "now" so no test depends on the wall clock. */
const NOW = Date.parse('2026-08-05T09:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * HOUR).toISOString();

describe('maxScheduledGapHours', () => {
  it('every day → 24h', () => {
    expect(maxScheduledGapHours(EVERY_DAY)).toBe(24);
  });

  it('a single day a week → 168h, wrapping onto itself', () => {
    expect(maxScheduledGapHours([2])).toBe(168);
  });

  it('Mon + Thu → 96h (the LONGER of the two gaps: Thu back round to Mon)', () => {
    expect(maxScheduledGapHours([1, 4])).toBe(96);
  });

  it('weekdays only → 72h (Fri back round to Mon across the weekend)', () => {
    expect(maxScheduledGapHours([1, 2, 3, 4, 5])).toBe(72);
  });

  it('is order- and duplicate-insensitive', () => {
    expect(maxScheduledGapHours([4, 1, 4])).toBe(96);
  });

  it('returns null when nothing is scheduled', () => {
    expect(maxScheduledGapHours([])).toBeNull();
    expect(maxScheduledGapHours(null)).toBeNull();
    expect(maxScheduledGapHours(undefined)).toBeNull();
  });

  it('ignores out-of-range day numbers rather than trusting them', () => {
    expect(maxScheduledGapHours([1, 9, -3, 4])).toBe(96);
  });
});

describe('classifyRunFreshness — overdue', () => {
  it('flags a daily routine silent for more than 36h (24h schedule + 12h grace)', () => {
    const out = classifyRunFreshness(row({ last_fired_at: hoursAgo(40) }), NOW);
    expect(out).toEqual({ verdict: 'overdue', hoursSince: 40, expectedGapHours: 24 });
  });

  it('flags a weekly routine only after 180h, not after 40h', () => {
    const weekly = { days_of_week: [2], last_fired_at: hoursAgo(40) };
    expect(classifyRunFreshness(row(weekly), NOW)).toEqual({ verdict: 'on-time' });
    expect(
      classifyRunFreshness(row({ days_of_week: [2], last_fired_at: hoursAgo(200) }), NOW),
    ).toEqual({ verdict: 'overdue', hoursSince: 200, expectedGapHours: 168 });
  });

  it('does not care that the UTC stamp falls on the previous IST day', () => {
    // 04:37 IST on 04 Aug is 23:07 UTC on 03 Aug. The rule compares two absolute
    // instants, so the date labels never enter into it.
    const out = classifyRunFreshness(
      row({ minute_of_day: 277, last_fired_at: '2026-08-03T23:07:00.000Z' }),
      Date.parse('2026-08-05T12:00:00.000Z'),
    );
    expect(out.verdict).toBe('overdue');
  });
});

describe('classifyRunFreshness — on time', () => {
  it('a daily routine that fired 20h ago is on time', () => {
    expect(classifyRunFreshness(row({ last_fired_at: hoursAgo(20) }), NOW)).toEqual({
      verdict: 'on-time',
    });
  });

  it('a daily routine that missed its slot by a few hours is still within grace', () => {
    // 30h: the slot was missed, but a late dispatcher tick looks the same. We
    // wait out the full grace rather than cry wolf.
    expect(classifyRunFreshness(row({ last_fired_at: hoursAgo(30) }), NOW)).toEqual({
      verdict: 'on-time',
    });
  });

  it('the boundary itself (exactly 36h) is on time, not overdue', () => {
    expect(classifyRunFreshness(row({ last_fired_at: hoursAgo(36) }), NOW)).toEqual({
      verdict: 'on-time',
    });
  });
});

describe('classifyRunFreshness — deliberately says nothing', () => {
  it('a paused routine — already badged "paused", never badge it twice', () => {
    expect(
      classifyRunFreshness(row({ enabled: false, last_fired_at: hoursAgo(400) }), NOW),
    ).toEqual({ verdict: 'unknown' });
  });

  it('a row the cloud dispatcher does not own (managed=false, e.g. a maxlane twin)', () => {
    expect(
      classifyRunFreshness(row({ managed: false, last_fired_at: hoursAgo(400) }), NOW),
    ).toEqual({ verdict: 'unknown' });
  });

  it('a routine that has never fired — a different state with its own handling', () => {
    expect(classifyRunFreshness(row({ last_fired_at: null }), NOW)).toEqual({
      verdict: 'unknown',
    });
  });

  it('a routine with no scheduled days', () => {
    expect(
      classifyRunFreshness(row({ days_of_week: [], last_fired_at: hoursAgo(400) }), NOW),
    ).toEqual({ verdict: 'unknown' });
  });

  it('an unparseable timestamp', () => {
    expect(classifyRunFreshness(row({ last_fired_at: 'not a date' }), NOW)).toEqual({
      verdict: 'unknown',
    });
  });

  it('a timestamp in the future — a clock disagreement, not a late routine', () => {
    expect(classifyRunFreshness(row({ last_fired_at: hoursAgo(-5) }), NOW)).toEqual({
      verdict: 'unknown',
    });
  });

  it('no schedule row at all', () => {
    expect(classifyRunFreshness(undefined, NOW)).toEqual({ verdict: 'unknown' });
    expect(classifyRunFreshness(null, NOW)).toEqual({ verdict: 'unknown' });
  });
});

describe('freshness is independent of what a run REPORTED', () => {
  // These two production cases are why this PR does not ship a rule based on a
  // routine's own output counts.
  //
  // `scf-learner-notes` reported `HTTP 200 · generated 0, skipped 0,
  // candidates 623` on 3-4 Aug and was working correctly the whole time:
  //   - `candidates` is the PRE-filter count. The route also returns
  //     `eligible` = candidates minus every (learner, course) noted within
  //     REGEN_DAYS = 7 (app/api/cron/scf-learner-notes/route.ts). All 623
  //     already had a current note, so the generation loop never ran.
  //   - the same route returns `generated: 0, skipped: 0` verbatim when
  //     shouldDeferToMaxLane() is true and a different worker does the work.
  // A "produced nothing from N waiting" rule fires on both and is wrong twice.
  //
  // Firing time cannot be faked the same way, so that is what we judge.
  it('says on-time for the status line that a zero-output rule would have flagged', () => {
    expect(
      classifyRunFreshness(
        row({
          last_fired_at: hoursAgo(20),
          last_status: 'HTTP 200 · generated 0, skipped 0, candidates 623',
        }),
        NOW,
      ),
    ).toEqual({ verdict: 'on-time' });
  });

  it('says on-time for a Max-lane deferral, which also reports generated 0', () => {
    expect(
      classifyRunFreshness(
        row({ last_fired_at: hoursAgo(20), last_status: 'HTTP 200 · generated 0, skipped 0' }),
        NOW,
      ),
    ).toEqual({ verdict: 'on-time' });
  });

  it('flags a routine that stopped firing even when its last status read healthy', () => {
    expect(
      classifyRunFreshness(
        row({
          last_fired_at: hoursAgo(72),
          last_status: 'HTTP 200 · generated 23, skipped 0, candidates 615',
        }),
        NOW,
      ),
    ).toEqual({ verdict: 'overdue', hoursSince: 72, expectedGapHours: 24 });
  });
});
