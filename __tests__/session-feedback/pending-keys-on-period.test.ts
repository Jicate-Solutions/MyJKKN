import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A learner who attends the same subject in two SEPARATE periods of a day must
 * be able to confirm both; a back-to-back block class still asks once.
 *
 * fn_scf_pending_for_learner hid an answered session by matching the period OR
 * the course anywhere in the day: production 1-16 Sep, on days where the course
 * genuinely ran two separated periods, 1,485 of 1,488 engaged learner-days could
 * only ever confirm one. The course arm now only reaches periods of the same
 * block. Behaviour is proved in pending-separate-periods.pg.test.ts; this file
 * pins the shape of the migration.
 *
 * Comments are stripped before matching, so the explanation above the SQL (and
 * inside it) cannot satisfy these checks.
 */
const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20270208090000_scf_pending_separate_periods_offered.sql',
  ),
  'utf8',
).replace(/^\s*--.*$/gm, '');

describe('the pending list hides the same period, or the same course only within its block', () => {
  it('excludes an answered session by period id', () => {
    expect(sql).toMatch(/f\.period_id = period\.key/);
  });

  it('the course arm is limited to the same block', () => {
    expect(sql).toMatch(
      /f\.course_id = NULLIF\(period\.value ->> 'course_id',''\)::uuid\s+AND f\.period_id = ANY \(public\.fn_scf_block_period_keys\(sa\.attendance_data, period\.key\)\)/,
    );
  });

  it('a block is broken by a gap of more than 10 minutes', () => {
    expect(sql).toMatch(/st > prev_et \+ interval '10 minutes'/);
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

  it('adds one pure helper and replaces one function — no table or policy, and no change to who may call it', () => {
    for (const forbidden of [/\bALTER TABLE\b/i, /\bDROP\s+TABLE\b/i, /CREATE POLICY/i]) {
      expect(sql).not.toMatch(forbidden);
    }
    expect((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length).toBe(2);
    expect(sql).not.toMatch(/fn_scf_block_period_keys[\s\S]*?SECURITY DEFINER[\s\S]*?CREATE OR REPLACE FUNCTION public\.fn_scf_pending/);

    // The anon-lock gate needs the revoke written in every migration that
    // replaces a SECURITY DEFINER function. The only grant/revoke allowed here
    // is the exact pair already on main (20260815100000) — re-stated, not changed.
    const grants = (sql.match(/^\s*(GRANT|REVOKE)\b.*$/gim) || []).map((l) => l.trim().replace(/\s+/g, ' '));
    expect(grants).toEqual([
      'REVOKE EXECUTE ON FUNCTION public.fn_scf_block_period_keys(jsonb, text) FROM anon, PUBLIC;',
      'GRANT EXECUTE ON FUNCTION public.fn_scf_block_period_keys(jsonb, text) TO authenticated, service_role;',
      'REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;',
      'GRANT EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated, service_role;',
    ]);
  });
});
