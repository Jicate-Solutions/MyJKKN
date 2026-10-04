/**
 * fn_prepare_payroll_period is replaced by TWO open PRs:
 *   - #4111 (fix/hr-pay-policies-not-readable-by-everyone), migration 20270506090000
 *   - fix/hr-payroll-prepare-refuses-non-staff, migration 20270507090000
 * Whichever is applied second overwrites the other's body. So both carry the
 * SAME body, byte for byte: the pay matrix read directly as the owner (needed by
 * #4111) and the role check that refuses a caller with no team-member role (the hole
 * both PRs close). This test exists in BOTH PRs with the same hash; an edit to
 * one copy without the other fails here instead of reverting silently.
 *
 * If you change the body on purpose, change it in both migrations and update
 * this hash in both test files.
 *
 * Run: npx vitest run __tests__/hr/payroll-prepare-body-shared.test.ts
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SHARED_BODY_SHA256 = '917df19f855676e2643a9d5b255bfc615de8c6abef2d4bb013c91614c89b6e55';
const MIGRATIONS_CARRYING_IT = [
  '20270506090000_hr_pay_policies_readable_only_with_salary_view.sql',
  '20270507090000_hr_payroll_prepare_and_backdate_refuse_non_staff.sql',
];

const MIG_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

function prepareBody(sql: string): string {
  const s = sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_prepare_payroll_period(');
  expect(s).toBeGreaterThan(-1);
  const e = sql.indexOf('\n$$;', s);
  return sql.slice(s, e + '\n$$;'.length);
}

describe('fn_prepare_payroll_period: one body across the two PRs that replace it', () => {
  const present = MIGRATIONS_CARRYING_IT.filter((f) => readdirSync(MIG_DIR).includes(f));

  it('at least this PR’s migration is present', () => {
    expect(present.length).toBeGreaterThan(0);
  });

  for (const f of MIGRATIONS_CARRYING_IT) {
    it(`${f} (when present) carries the shared body`, () => {
      if (!present.includes(f)) return;
      const body = prepareBody(readFileSync(join(MIG_DIR, f), 'utf8'));
      expect(createHash('sha256').update(body).digest('hex')).toBe(SHARED_BODY_SHA256);
    });
  }

  it('the shared body reads the matrix as the owner and refuses a caller with no team-member role', () => {
    const body = prepareBody(readFileSync(join(MIG_DIR, present[0]), 'utf8'));
    expect(body).not.toMatch(/fn_get_policy\('hr\.pay_scales'/);
    expect(body).toContain("WHERE policy_key = 'hr.pay_scales' AND is_active = true");
    expect(body).toContain(
      "OR (v_caller_role IS NOT NULL AND v_caller_role IN ('hr_officer','hr_admin','hr_manager','director'))",
    );
  });
});
