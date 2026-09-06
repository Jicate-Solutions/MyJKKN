/**
 * Guard: the notification generators that were given a TTL must keep it.
 *
 * WHY THIS EXISTS
 *   Every generator below used to insert `notifications` rows with
 *   expires_at NULL, so each edition stayed in the bell forever. Measured on
 *   production 2026-08-10 (rows created in the last 14 days, expires_at IS NULL):
 *   dashboard:scf_nudge 17,162 · schools_network 148 ·
 *   meetings:calendar-connect-needed 47 · meetings:calendar-connect-weekly 37.
 *
 *   The stamps that fix that are one line each, in four different files, and a
 *   deleted line looks like nothing in review — the failure is silent and only
 *   shows up as an unread count climbing weeks later. So they are asserted here.
 *
 * WHAT THESE ASSERTIONS ARE ANCHORED TO
 *   The SOURCE FILES themselves, read off disk — not a re-derivation of the
 *   TTL rule. A test that recomputes the logic it is checking proves only that
 *   it agrees with itself; this repo has been bitten by exactly that. If someone
 *   removes a stamp, the file no longer contains it and these fail.
 *
 *   The SQL case is checked against the LEXICOGRAPHICALLY NEWEST migration that
 *   defines the function, not against a fixed filename. That is the regression
 *   that actually happened here: a correct definition existed in the repo
 *   (20260803070000) while production ran an older body, and `CREATE OR REPLACE`
 *   does not warn when an older copy lands last. A new migration that redefines
 *   the function without the stamp fails this test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * The window after a category literal in which its expiry stamp must appear.
 * Generous enough to span the comment justifying the TTL, tight enough that it
 * cannot accidentally match a *different* call site's stamp.
 */
const WINDOW = 1600;

function stampedNear(source: string, marker: string, stamp: RegExp): boolean {
  const at = source.indexOf(marker);
  if (at === -1) throw new Error(`marker not found in source: ${marker}`);
  return stamp.test(source.slice(at, at + WINDOW));
}

describe('dashboard:scf_nudge — the generator behind 84% of the flood', () => {
  const defining = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) =>
      /CREATE OR REPLACE FUNCTION public\.fn_scf_nudge_pending_learners/.test(
        readFileSync(path.join(MIGRATIONS, f), 'utf8')
      )
    )
    .sort();

  const newest = defining[defining.length - 1];
  const sql = readFileSync(path.join(MIGRATIONS, newest), 'utf8');

  it('has a migration defining the function at all', () => {
    expect(defining.length).toBeGreaterThan(0);
  });

  it('the NEWEST definition inserts expires_at', () => {
    // The column must be in the INSERT list and fed a real value — a column
    // list alone would still write NULL.
    expect(sql).toMatch(/created_at, updated_at, expires_at/);
    expect(sql).toMatch(/v_expires_at/);
  });

  it('derives the TTL from the routine cadence instead of hardcoding hours', () => {
    // This routine is NOT in vercel.json — its schedule lives in
    // ai_routine_schedules and is editable with no deploy, so a literal TTL can
    // be silently outrun by a cadence change.
    expect(sql).toMatch(/ai_routine_schedules/);
    expect(sql).toMatch(/session-feedback-nudge/);
  });

  it('does NOT retroactively expire existing rows', () => {
    // The no-backfill constraint. The never-applied 20260803070000 carries a
    // "supersede-on-resend" UPDATE that would expire ~17,162 existing rows on
    // its first run; the live definition must not reintroduce it.
    expect(sql).not.toMatch(/UPDATE\s+public\.notifications/i);
  });

  it('re-asserts the anon/PUBLIC revoke, per CLAUDE.md', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_scf_nudge_pending_learners\(int\) FROM anon, PUBLIC, authenticated/
    );
  });
});

describe('TypeScript cron generators keep their expiry stamp', () => {
  it('meetings:calendar-connect-needed (per-day key)', () => {
    const src = read('lib/services/meetings/meeting-trigger-service.ts');
    expect(
      stampedNear(src, `category: 'meetings:calendar-connect-needed'`, /expiresAt:/)
    ).toBe(true);
  });

  it('meetings:calendar-connect-weekly (per-ISO-week key)', () => {
    const src = read('lib/services/meetings/meeting-trigger-service.ts');
    expect(stampedNear(src, 'category: WEEKLY_SUMMARY_CATEGORY', /expiresAt:/)).toBe(
      true
    );
  });

  it('schools_network visit nudge (per-school, 7-day realert)', () => {
    const src = read('app/api/schools-network/visit-nudges/cron/route.ts');
    expect(stampedNear(src, `category: 'schools_network'`, /expires_at:/)).toBe(true);
  });

  it('the schools_network TTL is derived from REALERT_DAYS, not a literal', () => {
    // A TTL shorter than the realert window would leave the coordinator with no
    // live nudge for the rest of it — worse than the accumulation being fixed.
    const src = read('app/api/schools-network/visit-nudges/cron/route.ts');
    expect(src).toMatch(/const NUDGE_TTL_MS = Math\.round\(REALERT_DAYS \*/);
  });

  it('createBellNotification only stamps when a caller opts in', () => {
    // Every other caller in that file must keep expires_at NULL — the opt-in
    // default is what makes this change safe to ship without auditing all ~15.
    const src = read('lib/services/meetings/meeting-trigger-service.ts');
    expect(src).toMatch(/if \(opts\.expiresAt\) row\.expires_at = opts\.expiresAt;/);
    // Exactly the two call sites above opt in.
    expect(src.match(/^\s*expiresAt:/gm) ?? []).toHaveLength(2);
  });
});

/**
 * NOT stamped, deliberately. Recorded so a later reader can see the list was
 * considered rather than missed, and does not "finish the job" by expiring a
 * row that is the only record of a specific un-actioned item.
 *
 *   dashboard:rescue (1,445)   per stale lead / per unresolved bug
 *   dashboard:approval (987)   per leave / recruitment / service request
 *   dashboard:escalation (41)  review-meeting escalations
 *   accreditation (47)         per-narrative capout notices, not re-emitted
 *   ai_pulse (596)             see below
 *
 * The first four were already ruled on in
 * 20260816040000_notification_expiry_director_categories.sql, which expires the
 * DIGEST rows in those categories and deliberately leaves the per-item ones.
 *
 * ai_pulse is the one open follow-up. Its two keyed emitters
 * (app/api/cron/ai-pulse-weekly-digest, app/api/cron/aipulse-domain-starter-notify)
 * are keyed per CYCLE, not per day, and each announces that cycle's own
 * deliverable rather than restating a standing fact — so the correct TTL is the
 * cycle's end, not a fixed number of hours, and it needs the cycle lifecycle
 * read rather than guessed. Left alone here on purpose.
 */
describe('deliberate non-stamps stay un-stamped', () => {
  it('ai_pulse per-incident escalations are not given a TTL', () => {
    const rotation = read('lib/services/ai-pulse/rotation-service.ts');
    const heatmap = read('lib/services/ai-pulse/dept-heatmap-service.ts');
    // Both are one-off, human-triggered records of a specific incident with no
    // idempotency key and no re-emission — expiring them would delete the only
    // copy of a real event.
    expect(stampedNear(rotation, `category: 'ai_pulse'`, /expires_at/)).toBe(false);
    expect(stampedNear(heatmap, `category: 'ai_pulse'`, /expires_at/)).toBe(false);
  });
});
