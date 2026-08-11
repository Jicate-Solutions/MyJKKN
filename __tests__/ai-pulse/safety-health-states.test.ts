// __tests__/ai-pulse/safety-health-states.test.ts
// ============================================================================
// The safety health card must be able to name FOUR states apart.
//
// This locks the specific misreadings that produced a false alarm on a healthy
// production system on 2026-08-06, where the run log read, every ten minutes:
//     {"phase":"done","enabled":true,"skipped":44,"enqueued":0,"recorded":0}
//
// It tests the pure resolver only. It does NOT re-derive the SQL that computes
// eligible_waiting_count — a test that re-implements the query it is checking
// proves only that it agrees with itself. The eligibility arithmetic is asserted
// against live production data instead, in the pull request that ships it.
// ============================================================================

import { describe, expect, it } from 'vitest';

import { resolveCheckerState } from '@/app/(routes)/ai-pulse/admin/reports/_components/safety-health-card';

const NOW = Date.parse('2026-08-06T06:24:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('resolveCheckerState', () => {
  it('reads the real production condition as healthy and idle, not as a fault', () => {
    // Exactly what production returned: switched on, heartbeat 4 minutes old,
    // and nothing the checker is allowed to act on.
    const s = resolveCheckerState(
      { checker_enabled: true, checker_last_ran_at: minutesAgo(4), eligible_waiting_count: 0 },
      NOW,
    );
    expect(s.activity).toBe('idle');
    expect(s.disabled).toBe(false);
  });

  it('separates a switched-off checker from a stopped one', () => {
    // The cron writes its heartbeat BEFORE it reads the kill switch, so a
    // disabled checker still ticks. Off-and-ticking must not read as stalled.
    const off = resolveCheckerState(
      { checker_enabled: false, checker_last_ran_at: minutesAgo(4), eligible_waiting_count: 0 },
      NOW,
    );
    expect(off.disabled).toBe(true);
    expect(off.activity).not.toBe('stalled');

    // ...and being switched off must never suppress a genuine stall.
    const offAndSilent = resolveCheckerState(
      { checker_enabled: false, checker_last_ran_at: minutesAgo(90), eligible_waiting_count: 0 },
      NOW,
    );
    expect(offAndSilent.disabled).toBe(true);
    expect(offAndSilent.activity).toBe('stalled');
  });

  it('calls a missing heartbeat stalled only past three missed runs', () => {
    expect(
      resolveCheckerState(
        { checker_enabled: true, checker_last_ran_at: minutesAgo(29), eligible_waiting_count: 0 },
        NOW,
      ).activity,
    ).toBe('idle');
    expect(
      resolveCheckerState(
        { checker_enabled: true, checker_last_ran_at: minutesAgo(31), eligible_waiting_count: 0 },
        NOW,
      ).activity,
    ).toBe('stalled');
  });

  it('treats a never-run checker as its own state, not as stopped', () => {
    const s = resolveCheckerState(
      { checker_enabled: true, checker_last_ran_at: null, eligible_waiting_count: 0 },
      NOW,
    );
    expect(s.activity).toBe('never-ran');
    expect(s.minutesSinceLastRun).toBeNull();
  });

  it('reports work in progress when eligible prompts are queued', () => {
    expect(
      resolveCheckerState(
        { checker_enabled: true, checker_last_ran_at: minutesAgo(2), eligible_waiting_count: 7 },
        NOW,
      ).activity,
    ).toBe('working');
  });

  it('says "unknown" rather than guessing when the migration has not been applied', () => {
    // The migration in this change is applied by hand, separately from the
    // deploy, so for a while the RPC returns the older columns and both new
    // fields arrive null. Null must never be read as "switched off" or as
    // "zero eligible" — that would recreate the false alarm from the client.
    const s = resolveCheckerState(
      { checker_enabled: null, checker_last_ran_at: minutesAgo(4), eligible_waiting_count: null },
      NOW,
    );
    expect(s.disabled).toBeNull();
    expect(s.activity).toBe('unknown');
  });

  it('still detects a stall when the reader is too old to report the switch', () => {
    const s = resolveCheckerState(
      { checker_enabled: null, checker_last_ran_at: minutesAgo(120), eligible_waiting_count: null },
      NOW,
    );
    expect(s.activity).toBe('stalled');
  });

  it('does not crash on an unparseable timestamp', () => {
    const s = resolveCheckerState(
      { checker_enabled: true, checker_last_ran_at: 'not-a-date', eligible_waiting_count: 0 },
      NOW,
    );
    expect(s.minutesSinceLastRun).toBeNull();
    expect(s.activity).toBe('never-ran');
  });
});
