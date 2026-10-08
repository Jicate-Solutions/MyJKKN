/**
 * hr_staff_salaries_in_force() must treat a salary with NO effective date as in
 * force (migration 20271006100000), read as TEXT.
 *
 * The bug: the function picked rows with `effective_from <= p_on`, and
 * `NULL <= date` is NULL, so every undated salary vanished — 276 staff across 8
 * institutions on 2026-10-06, because the bulk import left effective_from blank.
 * Month Close then listed them as "No salary recorded" while the Salaries screen
 * showed the figure. The behaviour itself was checked against the live database
 * (undated rows dropped: 276 -> 0); these catch a later edit quietly bringing it
 * back, which would not announce itself — the salary would just be "missing".
 *
 * Run: npx vitest run __tests__/hr/salaries-in-force-null-date.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const ORIGINAL_FILE = '20270519090000_hr_salary_revision_requests.sql';
const FIX_FILE = '20271006100000_hr_salaries_in_force_null_date_is_in_force.sql';
const FIX = read(`supabase/migrations/${FIX_FILE}`);

/** The function body only — the header prose mentions the old predicate. */
const BODY = FIX.slice(FIX.indexOf('AS $function$'), FIX.lastIndexOf('$function$;'));

describe('hr_staff_salaries_in_force — an undated salary is in force', () => {
  it('is versioned AFTER the migration that created it', () => {
    // Replaying in order would otherwise recreate the buggy body over the fix.
    expect(FIX_FILE.slice(0, 14) > ORIGINAL_FILE.slice(0, 14)).toBe(true);
  });

  it('picks a row with no effective_from instead of dropping it', () => {
    expect(BODY).toMatch(/WHERE c\.effective_from IS NULL OR c\.effective_from <= p_on/);
  });

  it('never goes back to the bare comparison that dropped undated rows', () => {
    // `WHERE c.effective_from <= p_on` with nothing before it is the bug itself.
    expect(BODY).not.toMatch(/WHERE c\.effective_from <= p_on/);
  });

  it('still walks back along superseded_by only while the row starts AFTER p_on', () => {
    // Unchanged on purpose: NULL > date is NULL, so the walk stops at an undated
    // row, which is right — nothing earlier can be more "in force" than that.
    expect(BODY).toMatch(/WHERE c\.effective_from > p_on AND c\.depth < 100/);
  });

  it('keeps the function SECURITY INVOKER with a pinned search_path', () => {
    expect(FIX).toMatch(/SECURITY INVOKER\s+SET search_path TO 'public'/);
    expect(FIX).not.toMatch(/SECURITY DEFINER/);
  });

  it('is mirrored into the setup reference file', () => {
    const setup = read('supabase/setup/02_functions.sql');
    expect(setup).toContain(`Source: ${FIX_FILE}`);
    expect(setup).toContain('WHERE c.effective_from IS NULL OR c.effective_from <= p_on');
  });
});
