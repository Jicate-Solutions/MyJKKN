/**
 * Regression guard for fn_bug_cluster_scan's group head.
 *
 * The scan keys every group by one of its members and upserts with
 *   ON CONFLICT (seed_bug_id) DO UPDATE ... WHERE bc.status = 'proposed'
 * `seed_bug_id` is UNIQUE. So if the chosen head is already the head of a
 * CONFIRMED or DISMISSED cluster, the update is skipped (its WHERE is false)
 * and the insert is skipped too (the conflict was taken): the whole group
 * disappears with no error and no counter. Every later scan rebuilds the same
 * component, picks the same head, and loses it again — measured on production
 * 2026-09-16 as 160 grouped reports where 264 should have been.
 *
 * The fix is one clause: pick the oldest member that is NOT already a decided
 * cluster's head. This test pins that clause against the most likely way it is
 * lost — someone regenerating the function body from an older migration, or
 * from `pg_get_functiondef` taken before the fix is applied. It reads the
 * newest migration that replaces the function, so it keeps working when the
 * function is next edited for an unrelated reason.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function newestScanMigration(): { name: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, files[i]), 'utf8');
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_bug_cluster_scan\s*\(/i.test(sql)) {
      return { name: files[i], sql };
    }
  }
  throw new Error('no migration defines public.fn_bug_cluster_scan');
}

describe('fn_bug_cluster_scan — a group is never keyed by a decided cluster’s head', () => {
  const { name, sql } = newestScanMigration();

  it(`picks a head that is free (newest definition: ${name})`, () => {
    // The seed subquery must exclude ids that already head a non-proposed cluster.
    const guard =
      /seed_bug_id\s*=\s*u\.m[\s\S]{0,200}?status\s*<>\s*'proposed'|status\s*<>\s*'proposed'[\s\S]{0,200}?seed_bug_id\s*=\s*u\.m/i;
    expect(sql).toMatch(guard);
  });

  it('does not key a group by its oldest member outright', () => {
    // The pre-fix shape: the head is member[1] with no freeness check.
    const preFix = /\(ARRAY_AGG\(p\.id ORDER BY p\.created_at ASC\)\)\[1\]\s+AS seed_bug_id/i;
    expect(sql).not.toMatch(preFix);
  });

  it('still refuses a group with no free head rather than inventing one', () => {
    expect(sql).toMatch(/WHERE\s+seed_bug_id\s+IS\s+NOT\s+NULL/i);
  });

  it('leaves the upsert’s decided-cluster protection in place', () => {
    // The fix must not "solve" the conflict by letting the scan overwrite a
    // human decision — that guard is the reason the bug was invisible, and it
    // is still the right guard.
    expect(sql).toMatch(/ON CONFLICT \(seed_bug_id\) DO UPDATE/i);
    expect(sql).toMatch(/WHERE\s+bc\.status\s*=\s*'proposed'/i);
  });
});
