/**
 * hr_attendance_period_console() must count only HR-category staff as "active"
 * (migration 20271006110000), read as TEXT.
 *
 * The bug: active_staff counted EVERY active staff row at the institution, so
 * categories excluded from HR (Ayaah, Driver, Security, ...) inflated the
 * "N staff member(s) have no attendance data" warning and could never be cleared
 * — Dental read 42 when only 20 were real HR staff without records; Main Office
 * read 88 when none were. The behaviour itself was checked against the live
 * console for September 2026; this catches a later edit quietly bringing it back.
 *
 * Run: npx vitest run __tests__/hr/attendance-console-hr-category.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const FILE = '20271006110000_hr_attendance_console_hr_category_staff.sql';
const SQL = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8');

/** The active-staff lateral only — the header prose quotes the old query. */
const ACTIVE_LATERAL = SQL.slice(SQL.indexOf('SELECT count(*) AS active_ct'), SQL.indexOf(') h ON true'));

describe('hr_attendance_period_console — active staff are HR-category staff', () => {
  it('is versioned after the earlier fixes so a replay cannot undo it', () => {
    expect(FILE.slice(0, 14) > '20271006100000').toBe(true);
  });

  it('joins employment_categories and requires included_in_hr', () => {
    expect(ACTIVE_LATERAL).toMatch(/JOIN public\.employment_categories ec\s+ON ec\.id = s3\.category_id AND ec\.included_in_hr/);
  });

  it('still counts only ACTIVE staff of THIS institution', () => {
    expect(ACTIVE_LATERAL).toMatch(/s3\.institution_id = i\.id/);
    expect(ACTIVE_LATERAL).toMatch(/COALESCE\(s3\.is_active, false\)/);
  });

  it('does not narrow staff_with_records — a record is a record', () => {
    const records = SQL.slice(SQL.indexOf('count(DISTINCT rr.employee_id) AS staff_ct'), SQL.indexOf(') r ON true'));
    expect(records).not.toMatch(/included_in_hr/);
  });

  it('keeps the signature and the permission gate', () => {
    expect(SQL).toMatch(/hr_attendance_period_console\(p_year integer, p_month integer\)/);
    expect(SQL).toMatch(/hr\.attendance\.period\.view/);
    expect(SQL).toMatch(/SECURITY DEFINER/);
    expect(SQL).toMatch(/SET search_path TO 'public'/);
  });

  it('is mirrored into the setup reference file', () => {
    const setup = readFileSync(join(ROOT, 'supabase', 'setup', '02_functions.sql'), 'utf8');
    expect(setup).toContain(`Source: ${FILE}`);
  });
});
