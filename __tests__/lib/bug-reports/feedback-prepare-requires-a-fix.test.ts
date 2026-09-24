import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A "is this fixed for you?" prompt may not be sent without a fix.
 *
 * fn_bug_feedback_prepare accepted `single_fix_feasible` — the assessor's
 * PREDICTION that one fix would cover the group — as grounds to ask every
 * reporter to confirm a fix, with no fix written. Production, 23 Sep 2026:
 * 20 such requests across 8 groups, none of those groups carrying a fix even
 * now; 9 answered, 7 of them "fixed", counted in the loop's headline rate.
 *
 * Comments are stripped before matching so the prose above the SQL cannot
 * satisfy these checks.
 */
const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20270207090000_bug_feedback_prepare_requires_a_recorded_fix.sql',
  ),
  'utf8',
)
  .replace(/^\s*--.*$/gm, '');

describe('fn_bug_feedback_prepare requires a recorded fix', () => {
  it('refuses when no fix reference can be resolved', () => {
    expect(sql).toMatch(/IF v_fix_pr IS NULL THEN/);
    expect(sql).toMatch(/a fix_check needs a recorded fix/);
  });

  it('resolves the reference from the argument or the group, in that order', () => {
    const i = sql.indexOf('v_fix_pr := COALESCE(');
    expect(i).toBeGreaterThan(-1);
    const block = sql.slice(i, sql.indexOf(');', i));
    expect(block.indexOf('p_fix_pr')).toBeLessThan(block.indexOf("'fixability'"));
  });

  it('stores what it resolved, not the raw argument, so every request is traceable', () => {
    expect(sql).toMatch(/e\.reporter_user_id,\s*v_fix_pr,\s*v_deploy_sha/);
    expect(sql).not.toMatch(/e\.reporter_user_id,\s*p_fix_pr,\s*p_deploy_sha/);
  });

  it('checks the fix BEFORE inserting any request row', () => {
    expect(sql.indexOf('IF v_fix_pr IS NULL THEN')).toBeLessThan(
      sql.indexOf('INSERT INTO public.bug_fix_feedback_requests'),
    );
  });

  it('touches no table or policy, and does not change who may call it — it only replaces the function', () => {
    for (const forbidden of [/\bALTER TABLE\b/i, /\bDROP\b/i, /CREATE POLICY/i]) {
      expect(sql).not.toMatch(forbidden);
    }
    expect((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length).toBe(1);

    // The anon-lock gate needs the revoke written in every migration that
    // replaces a SECURITY DEFINER function. The only grant/revoke allowed here
    // is the exact service-role-only pair already on main (20261227090000).
    const grants = (sql.match(/^\s*(GRANT|REVOKE)\b.*$/gim) || []).map((l) => l.trim().replace(/\s+/g, ' '));
    expect(grants).toEqual([
      'REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) FROM anon, PUBLIC, authenticated;',
      'GRANT EXECUTE ON FUNCTION public.fn_bug_feedback_prepare(uuid, text, text) TO service_role;',
    ]);
  });
});
