/**
 * Guard: no file may cite the payroll "design lock" spec that was never written.
 *
 * WHY
 *   Nine files cited `specs/<name below>` as the "Director-locked" payroll
 *   design. That file has never existed on any branch (`git log --all -- <path>`
 *   is empty), so the citation gave the payroll code an authority nobody can
 *   check. The comments now say where each rule actually lives.
 *
 * SCOPE — deliberately narrow
 *   Only this one filename is checked, so unrelated work cannot turn it red.
 *   If someone writes the real spec at that path, the guard passes on its own.
 *
 * ALLOWED
 *   The three applied payroll migrations below keep their old header comment.
 *   Editing a migration file makes the ship wave treat it as pending and try to
 *   re-apply it to production, so history files are left untouched. A NEW
 *   migration citing the missing spec still fails.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Built from two halves so this test file never matches its own search.
const SPEC_NAME = 't4-payroll-design-lock' + '-2026-05-15.md';
const SPEC_PATH = `specs/${SPEC_NAME}`;

const ALLOWED = new Set([
  'supabase/migrations/20260626000000_hr_pay_components_and_payslip_line_items.sql',
  'supabase/migrations/20260628000000_t4_3_payroll_periods_approvals_payslips.sql',
  'supabase/migrations/20260629000000_t4_3_pr2_payroll_rpcs.sql',
]);

function filesCiting(needle: string): string[] {
  try {
    const out = execFileSync('git', ['grep', '-l', '-F', needle], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    // git grep exits 1 when nothing matches; anything else is a real failure.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe('payroll missing-spec citation guard', () => {
  it('no tracked file cites the never-written payroll design-lock spec', () => {
    if (existsSync(path.join(REPO_ROOT, SPEC_PATH))) return; // spec now exists: citations are fine

    const offenders = filesCiting(SPEC_NAME).filter((f) => !ALLOWED.has(f));
    expect(
      offenders,
      `${SPEC_PATH} does not exist. Cite the code, migration or test that enforces the rule instead, ` +
        'or write "(no written spec; the rule lives in this code)".',
    ).toEqual([]);
  });
});
