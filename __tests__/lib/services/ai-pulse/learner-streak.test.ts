/**
 * AI Pulse learner streak — the batched walk.
 * =============================================================================
 *
 * `getMyStreak` used to await `getMyAttendance()` once per cycle, up to 12
 * serial round trips at the tail of the My AI Pulse waterfall. It now does one
 * `ai_pulse_live_attendance` read for all 12 cycles and hands the rows to
 * `streakFromAttendance`.
 *
 * These tests pin the semantics the old loop had, so the collapse cannot
 * quietly change anyone's streak:
 *
 *   - newest cycle first, stop at the first cycle that is not engaged;
 *   - a cycle with NO attendance row ends the chain (it classified as
 *     'pending');
 *   - per event, the row with the newest joined_at wins — the old query took
 *     `.order('joined_at', desc).limit(1)`, and the batched read preserves that
 *     by keeping the first row it sees for each event.
 *
 * Engagement itself is an honest 2-of-3 over joined / stayed / quiz
 * (`isEngagedFromGates`), so `joined_within_5min` + `quiz_passed` is engaged and
 * `joined_within_5min` alone is not.
 */

import { describe, it, expect } from 'vitest';

import {
  streakFromAttendance,
  type AttendanceRow,
} from '@/lib/services/ai-pulse/learner-service';

const ENGAGED = { joined_within_5min: true, quiz_passed: true };
const NOT_ENGAGED = { joined_within_5min: true };

function row(
  event_id: string,
  signals: Record<string, unknown> | null,
  joined_at = '2026-07-30T09:00:00Z',
): AttendanceRow {
  return { event_id, joined_at, engagement_signals: signals };
}

describe('streakFromAttendance', () => {
  it('counts consecutive engaged cycles from the newest', () => {
    const cycles = ['c3', 'c2', 'c1'];
    const rows = [row('c3', ENGAGED), row('c2', ENGAGED), row('c1', ENGAGED)];
    expect(streakFromAttendance(cycles, rows)).toBe(3);
  });

  it('stops at the first cycle that is not engaged', () => {
    const cycles = ['c3', 'c2', 'c1'];
    const rows = [
      row('c3', ENGAGED),
      row('c2', NOT_ENGAGED),
      row('c1', ENGAGED), // engaged, but the chain already broke at c2
    ];
    expect(streakFromAttendance(cycles, rows)).toBe(1);
  });

  it('treats a cycle with no attendance row as the end of the chain', () => {
    const cycles = ['c3', 'c2', 'c1'];
    const rows = [row('c3', ENGAGED), row('c1', ENGAGED)]; // c2 missing
    expect(streakFromAttendance(cycles, rows)).toBe(1);
  });

  it('is 0 when the newest cycle has no row at all', () => {
    expect(streakFromAttendance(['c3', 'c2'], [row('c2', ENGAGED)])).toBe(0);
  });

  it('is 0 when there are no rows', () => {
    expect(streakFromAttendance(['c3', 'c2', 'c1'], [])).toBe(0);
  });

  it('is 0 when there are no cycles', () => {
    expect(streakFromAttendance([], [row('c1', ENGAGED)])).toBe(0);
  });

  it('keeps the newest row per event, matching the old order+limit(1) read', () => {
    // Rows arrive joined_at DESC, so the FIRST row seen for an event is the one
    // the per-cycle query would have returned. A stale earlier row must not win.
    const rows = [
      row('c1', ENGAGED, '2026-07-30T10:00:00Z'),
      row('c1', NOT_ENGAGED, '2026-07-30T08:00:00Z'),
    ];
    expect(streakFromAttendance(['c1'], rows)).toBe(1);
  });

  it('does not let a stale engaged row rescue a newer non-engaged one', () => {
    const rows = [
      row('c1', NOT_ENGAGED, '2026-07-30T10:00:00Z'),
      row('c1', ENGAGED, '2026-07-30T08:00:00Z'),
    ];
    expect(streakFromAttendance(['c1'], rows)).toBe(0);
  });

  it('treats a row with null signals as joined-but-partial, so the chain ends', () => {
    const rows = [row('c2', null), row('c1', ENGAGED)];
    expect(streakFromAttendance(['c2', 'c1'], rows)).toBe(0);
  });

  it('ignores rows for cycles outside the window', () => {
    const rows = [row('c9', ENGAGED), row('c1', ENGAGED)];
    expect(streakFromAttendance(['c1'], rows)).toBe(1);
  });
});
