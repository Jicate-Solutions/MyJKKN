/**
 * Structural pins on the SQL guards in
 * supabase/migrations/20261224164500_hr_staff_photo_bind_path_and_lock_review.sql.
 *
 * WHY THIS FILE EXISTS. The critic's third finding was that the diff carries no
 * test for the database half, and it was right: every guard in that migration
 * was verified by hand against a throwaway PostgreSQL 16 and then the evidence
 * lived only in a commit message. A guard nothing pins is a guard the next edit
 * can loosen silently — and this particular guard was already written wrong
 * TWICE (uuid-anywhere, then folder-anywhere-with-no-host), so "somebody will
 * notice" is not supported by the history.
 *
 * WHAT THIS IS AND IS NOT. These are STRUCTURAL assertions on the shipped SQL
 * text, not behavioural ones — a behavioural suite needs a live PostgreSQL,
 * which CI here does not have. They cannot prove the guards work. They can
 * prove that the specific properties three rounds of review asked for are still
 * present, and they fail loudly if a later edit drops one. That is a real but
 * limited claim, and it is the honest one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20261224164500_hr_staff_photo_bind_path_and_lock_review.sql',
  ),
  'utf8',
);

/**
 * The file WITHOUT its comments.
 *
 * This mattered immediately: the first version of the ordering test below read
 * `FOR UPDATE` out of the header comment that EXPLAINS the lock, decided the
 * lock came 8,000 characters before the permission check, and failed. A
 * structural test that cannot tell prose from code is testing the prose.
 */
const CODE = SQL.replace(/--[^\n]*/g, '');

describe('team member photo migration keeps the guards review asked for', () => {
  it('binds the submitted key to the caller’s own resolved folder', () => {
    // Not LIKE: no character in a storage key may be read as a pattern.
    expect(SQL).toContain('left(p_storage_path, length(v_prefix)) IS DISTINCT FROM v_prefix');
  });

  it('re-asserts that binding at REVIEW time, for rows queued before the fix', () => {
    expect(SQL).toContain(
      "left(v_path, length(v_staff::text) + 1) IS DISTINCT FROM v_staff::text || '/'",
    );
  });

  it('takes a row lock before deciding', () => {
    expect(CODE).toContain('FOR UPDATE');
  });

  it('authorises BEFORE locking, so no caller can hold a lock on an arbitrary id', () => {
    const authzAt = CODE.indexOf("user_has_permission('hr.staff_photo.review')");
    const lockAt = CODE.indexOf('FOR UPDATE');
    expect(authzAt).toBeGreaterThan(0);
    expect(lockAt).toBeGreaterThan(authzAt);
  });

  it('matches the approved URL WHOLE — anchored, host pinned, one filename segment', () => {
    // The property that was wrong twice. `^` and `$` are the whole point:
    // without them this is a substring search again.
    expect(SQL).toContain("'^https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/staff-images/'");
    expect(SQL).toContain("'/[^/?#]+$'");
    // And the old, broken forms must not come back.
    expect(SQL).not.toContain('position(v_staff::text in p_public_url)');
  });

  it('refuses rather than guesses when a login has two active team member records', () => {
    expect(SQL).toContain('IF v_matches > 1 THEN');
  });

  it('refuses the backlog of already-queued poisoned rows at apply time', () => {
    expect(SQL).toContain('BUG-006144 backlog');
    expect(SQL).toMatch(/UPDATE public\.hr_staff_photo_submissions[\s\S]*?SET status\s*=\s*'rejected'/);
  });

  it('keeps both functions locked away from anon', () => {
    expect(SQL).toContain('REVOKE EXECUTE ON FUNCTION public.fn_submit_my_staff_photo(text) FROM anon, PUBLIC;');
    expect(SQL).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_review_staff_photo_submission(uuid, boolean, text, text) FROM anon, PUBLIC;',
    );
  });

  it('records stranded objects as a bucket-qualified list, not a scalar that overwrites', () => {
    expect(SQL).toContain('orphaned_objects jsonb');
    expect(SQL).not.toContain('orphaned_object text;');
  });
});
