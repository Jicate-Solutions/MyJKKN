import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A learner who attends the same subject twice in a day must be able to
 * confirm both.
 *
 * fn_scf_pending_for_learner hid an answered session by matching the period OR
 * the course. The course arm meant the first confirmation of a course on a day
 * suppressed every other period of it: production 1-16 Sep, on days where the
 * course genuinely ran two separated periods, 1,485 of 1,488 engaged
 * learner-days could only ever confirm one; exactly 3 recorded both.
 *
 * Comments are stripped before matching, so the explanation above the SQL (and
 * inside it) cannot satisfy these checks.
 */
const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20270208090000_scf_pending_keys_on_period_not_course.sql',
  ),
  'utf8',
).replace(/^\s*--.*$/gm, '');

describe('the pending list keys on the period, not the course', () => {
  it('excludes an answered session by period id', () => {
    expect(sql).toMatch(/AND f\.period_id = period\.key/);
  });

  it('no longer falls back to the course id', () => {
    expect(sql).not.toMatch(/f\.course_id\s*=/);
    expect(sql).not.toMatch(/OR\s*\(\s*NULLIF\(period\.value\s*->>\s*'course_id'/);
  });

  it('still scopes the exclusion to this learner and this day', () => {
    expect(sql).toMatch(/f\.student_id = v_lp/);
    expect(sql).toMatch(/f\.attendance_date = sa\.attendance_date/);
  });

  it('keeps the Present requirement, so it cannot start offering sessions nobody attended', () => {
    expect(sql).toMatch(/st ->> 'status' = 'Present'/);
  });

  it('keeps the two-sided window, so it cannot re-offer expired sessions', () => {
    expect(sql).toMatch(/session_feedback\.window_hours/);
    expect(sql).toMatch(/now\(\) <= /);
  });

  it('replaces only the function — no table or policy, and no change to who may call it', () => {
    for (const forbidden of [/\bALTER TABLE\b/i, /\bDROP\s+TABLE\b/i, /CREATE POLICY/i]) {
      expect(sql).not.toMatch(forbidden);
    }
    expect((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length).toBe(1);

    // The anon-lock gate needs the revoke written in every migration that
    // replaces a SECURITY DEFINER function. The only grant/revoke allowed here
    // is the exact pair already on main (20260815100000) — re-stated, not changed.
    const grants = (sql.match(/^\s*(GRANT|REVOKE)\b.*$/gim) || []).map((l) => l.trim().replace(/\s+/g, ' '));
    expect(grants).toEqual([
      'REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;',
      'GRANT EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated, service_role;',
    ]);
  });
});
