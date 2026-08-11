/**
 * Guard: the two KEYED ai_pulse notification generators must keep stamping a
 * cycle-derived expiry, and must never start clearing existing rows.
 *
 * WHY THIS EXISTS
 *   `category='ai_pulse'` was the one open follow-up left by
 *   __tests__/ci/notification-generator-ttl-guard.test.ts (PR #2971). Measured
 *   on production 2026-08-11: 1,005 ai_pulse rows, ALL 1,005 with
 *   expires_at IS NULL — 575 ai_pulse_weekly_digest, 429
 *   ai_pulse_domain_starter_notify, 1 un-keyed per-incident escalation.
 *
 *   The stamp that fixes that is one line per route, and a deleted line looks
 *   like nothing in review — the failure is silent and only shows up as an
 *   unread count climbing weeks later.
 *
 * WHAT THESE ASSERTIONS ARE ANCHORED TO
 *   Two different things, on purpose. The route assertions read the SOURCE
 *   FILES off disk rather than re-deriving the rule (a test that recomputes the
 *   logic it checks proves only that it agrees with itself; this repo has been
 *   bitten by exactly that). The derivation assertions instead RUN the helper
 *   against fixed cycle rows and check the instant it returns, because the
 *   whole point of this change is that the number is computed, not written
 *   down.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  cycleStartsAt,
  cycleLengthMs,
  cycleEndsAt,
  cycleNotificationExpiresAt,
  type AiPulseCycleRow,
} from '@/lib/services/ai-pulse/cycle-window';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const NOTIFY_ROUTE = 'app/api/cron/aipulse-domain-starter-notify/route.ts';
const DIGEST_ROUTE = 'app/api/cron/ai-pulse-weekly-digest/route.ts';

/**
 * The window after a category literal in which its expiry stamp must appear.
 * Mirrors the sibling guard: generous enough to span the justifying comment,
 * tight enough that it cannot match a different call site's stamp.
 */
const WINDOW = 1600;

function stampedNear(source: string, marker: string, stamp: RegExp): boolean {
  const at = source.indexOf(marker);
  if (at === -1) throw new Error(`marker not found in source: ${marker}`);
  return stamp.test(source.slice(at, at + WINDOW));
}

const DAY = 24 * 60 * 60 * 1000;

/** Production shape, read 2026-08-11: weekly Thursdays, 18:55 IST session. */
function cycle(day: string, id = day): AiPulseCycleRow {
  return {
    id,
    demo_date: `${day}T00:00:00+00:00`,
    config: { kind: 'ai_pulse', ai_pulse: { session_start_time: '18:55', session_end_time: '19:30' } },
  };
}

const PROD_CYCLES: AiPulseCycleRow[] = [
  cycle('2026-08-13'),
  cycle('2026-08-06'),
  cycle('2026-07-30'),
  cycle('2026-07-23'),
  cycle('2026-07-16'),
  cycle('2026-07-09'),
  cycle('2026-07-02'),
  cycle('2026-06-25'),
];

describe('the ai_pulse cycle window — the derivation itself', () => {
  it('reads a cycle start as its demo_date at the IST session_start_time', () => {
    // 18:55 IST is 13:25 UTC.
    expect(cycleStartsAt(cycle('2026-08-13'))?.toISOString()).toBe(
      '2026-08-13T13:25:00.000Z'
    );
  });

  it('falls back to the seeded 18:55 when the cycle carries no session time', () => {
    expect(cycleStartsAt({ id: 'x', demo_date: '2026-08-13' })?.toISOString()).toBe(
      '2026-08-13T13:25:00.000Z'
    );
  });

  it('returns null (leave the column NULL) for a cycle with no demo_date', () => {
    expect(cycleStartsAt({ id: 'x', demo_date: null })).toBeNull();
    expect(cycleNotificationExpiresAt({ id: 'x' }, PROD_CYCLES)).toBeNull();
  });

  it('measures the cycle length from the cycles, and it is 7 days on prod', () => {
    expect(cycleLengthMs(PROD_CYCLES)).toBe(7 * DAY);
  });

  it('uses the MEDIAN gap, so the real 2026-06-17/06-18 pair cannot drag it', () => {
    const withOutlier = [...PROD_CYCLES, cycle('2026-06-18'), cycle('2026-06-17')];
    expect(cycleLengthMs(withOutlier)).toBe(7 * DAY);
  });

  it('falls back to a week only when there is nothing to measure', () => {
    expect(cycleLengthMs([cycle('2026-08-13')])).toBe(7 * DAY);
    expect(cycleLengthMs([])).toBe(7 * DAY);
  });

  it('ends a cycle at its SUCCESSOR\'s session start when one exists', () => {
    expect(cycleEndsAt(cycle('2026-08-06'), PROD_CYCLES)?.toISOString()).toBe(
      '2026-08-13T13:25:00.000Z'
    );
  });

  it('ends the NEWEST cycle one measured length after its own start', () => {
    // No successor row exists — this is the normal case for both emitters.
    expect(cycleEndsAt(cycle('2026-08-13'), PROD_CYCLES)?.toISOString()).toBe(
      '2026-08-20T13:25:00.000Z'
    );
  });

  it('stamps half a cycle PAST the cycle end (the 1.5x margin)', () => {
    // Emission at the 2026-08-13 session end, the first hourly notify sweep.
    const now = new Date('2026-08-13T14:00:00Z');
    expect(cycleNotificationExpiresAt(cycle('2026-08-13'), PROD_CYCLES, now)).toBe(
      '2026-08-24T01:25:00.000Z'
    );
  });

  it('outlives the successor cycle\'s own first sweep, which 1x would not', () => {
    const now = new Date('2026-08-13T14:00:00Z');
    const expires = Date.parse(
      cycleNotificationExpiresAt(cycle('2026-08-13'), PROD_CYCLES, now) as string
    );
    // The replacement lands at the NEXT cycle's 19:30 IST = 14:00 UTC sweep.
    const replacementLands = Date.parse('2026-08-20T14:00:00Z');
    expect(expires).toBeGreaterThan(replacementLands);
  });

  it('never returns an instant in the past, even for a long-stalled cycle', () => {
    // Cycles paused: the newest cycle is six weeks old but a digest still fires.
    const now = new Date('2026-09-24T04:15:00Z');
    const expires = Date.parse(
      cycleNotificationExpiresAt(cycle('2026-08-13'), PROD_CYCLES, now) as string
    );
    expect(expires).toBeGreaterThan(now.getTime());
    // And it is floored at half a cycle from now, not at the stale cycle end.
    expect(expires).toBe(now.getTime() + 3.5 * DAY);
  });
});

describe('the two keyed ai_pulse generators keep their expiry stamp', () => {
  it('aipulse-domain-starter-notify stamps expires_at on the row it inserts', () => {
    const src = read(NOTIFY_ROUTE);
    expect(stampedNear(src, `category: 'ai_pulse'`, /expires_at: expiresAt/)).toBe(true);
  });

  it('ai-pulse-weekly-digest stamps expires_at on the row it inserts', () => {
    const src = read(DIGEST_ROUTE);
    expect(stampedNear(src, `category: 'ai_pulse'`, /expires_at: expiresAt/)).toBe(true);
  });

  it('both derive the TTL from the cycle instead of hardcoding hours', () => {
    // A literal would be wrong in both directions here: the starter prompt is
    // superseded by the next cycle's prompt, not by a clock, and the digest's
    // own cadence lives in ai_routine_schedules (editable with no deploy).
    //
    // This asserts the CALL, not the import. Mutation-testing this guard caught
    // it passing on a route whose body had been swapped for a 36h literal while
    // the now-unused import lingered — `toMatch(/cycleNotificationExpiresAt/)`
    // alone is satisfied by the import line.
    for (const rel of [NOTIFY_ROUTE, DIGEST_ROUTE]) {
      const src = read(rel);
      expect(src).toMatch(/@\/lib\/services\/ai-pulse\/cycle-window/);
      expect(src).toMatch(/const expiresAt = cycleNotificationExpiresAt\(/);
      // And the value is never wall-clock arithmetic from the emitting route.
      expect(src).not.toMatch(/expiresAt\s*=\s*new Date\(/);
    }
  });

  it('neither route retroactively expires anything (the no-backfill constraint)', () => {
    // 1,005 rows already sit unexpired on production. Clearing them is a
    // separate Director decision; a generator must never take it by implication.
    for (const rel of [NOTIFY_ROUTE, DIGEST_ROUTE]) {
      const src = read(rel);
      expect(src).not.toMatch(/from\('notifications'\)[\s\S]{0,120}\.update\(/);
      expect(src).not.toMatch(/from\('notifications'\)[\s\S]{0,120}\.delete\(/);
    }
  });
});

/**
 * Still NOT stamped, deliberately — unchanged from the sibling guard. These two
 * are one-off, human-triggered records of a specific incident with no
 * idempotency key and no re-emission (1 such row exists on production), so
 * expiring them would delete the only copy of a real event.
 */
describe('ai_pulse per-incident escalations stay un-stamped', () => {
  it('rotation escalation and dept-heatmap intervention keep expires_at NULL', () => {
    const rotation = read('lib/services/ai-pulse/rotation-service.ts');
    const heatmap = read('lib/services/ai-pulse/dept-heatmap-service.ts');
    expect(stampedNear(rotation, `category: 'ai_pulse'`, /expires_at/)).toBe(false);
    expect(stampedNear(heatmap, `category: 'ai_pulse'`, /expires_at/)).toBe(false);
  });
});
