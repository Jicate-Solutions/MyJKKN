/**
 * Text checks on migration 20270507090000: fn_prepare_payroll_period and
 * fn_backdate_payroll_period refuse a caller with no team-member role.
 *
 * The hole: `IF NOT (is_super_admin() OR is_admin() OR v_caller_role ...)` is
 * NULL when fn_get_caller_role_key() returns NULL, and plpgsql skips the RAISE.
 * The behaviour was rehearsed on a throwaway PostgreSQL 16; these tests pin that
 * each body is main's newest (20260629000000) with ONLY the intended lines
 * changed, and that no stage RPC keeps the NULL-passes form.
 *
 * Run: npx vitest run __tests__/hr/payroll-stage-guards-refuse-non-staff.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const FILE = '20270507090000_hr_payroll_prepare_and_backdate_refuse_non_staff.sql';
const ORIGIN = '20260629000000_t4_3_pr2_payroll_rpcs.sql';
const RESOLVER_FILE = '20260731180000_platform_policies_cohort_scope.sql';
/** #4111 replaces fn_prepare_payroll_period with the same body; it may or may not be on this branch. */
const SIBLING = '20270506090000_hr_pay_policies_readable_only_with_salary_view.sql';

const read = (f: string) => readFileSync(join(MIG_DIR, f), 'utf8');
const migration = read(FILE);
const origin = read(ORIGIN);
const setupFunctions = readFileSync(join(ROOT, 'supabase', 'setup', '02_functions.sql'), 'utf8');

function fnBody(sql: string, name: string): string {
  const s = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(s, name).toBeGreaterThan(-1);
  return sql.slice(s, sql.indexOf('\n$$;', s) + '\n$$;'.length);
}

const PREP_OLD_GUARD = "    OR v_caller_role IN ('hr_officer','hr_admin','hr_manager','director')\n";
const PREP_NEW_GUARD =
  "    OR (v_caller_role IS NOT NULL AND v_caller_role IN ('hr_officer','hr_admin','hr_manager','director'))\n";
const BACK_OLD_GUARD = "    OR v_caller_role = 'director'\n";
const BACK_NEW_GUARD = "    OR (v_caller_role IS NOT NULL AND v_caller_role = 'director')\n";
const OLD_READ = "  v_pay_matrix := public.fn_get_policy('hr.pay_scales', v_period.institution_id);";

describe('fn_backdate_payroll_period', () => {
  const prev = fnBody(origin, 'fn_backdate_payroll_period');
  const next = fnBody(migration, 'fn_backdate_payroll_period');

  it('is main’s body with ONLY the role check changed', () => {
    expect(prev.split(BACK_OLD_GUARD)).toHaveLength(2);
    expect(next).toBe(prev.replace(BACK_OLD_GUARD, BACK_NEW_GUARD));
  });

  it('keeps its grant with anon and PUBLIC revoked', () => {
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.fn_backdate_payroll_period(uuid, text) FROM anon, PUBLIC;');
    expect(migration).toContain('GRANT  EXECUTE ON FUNCTION public.fn_backdate_payroll_period(uuid, text) TO authenticated;');
  });

  it('is mirrored in setup/02_functions.sql', () => {
    expect(fnBody(setupFunctions, 'fn_backdate_payroll_period')).toBe(next);
  });
});

describe('fn_prepare_payroll_period', () => {
  const prev = fnBody(origin, 'fn_prepare_payroll_period');
  const next = fnBody(migration, 'fn_prepare_payroll_period');

  it('is main’s body with the role check changed and the shared owner read of the matrix, nothing else', () => {
    expect(prev.split(PREP_OLD_GUARD)).toHaveLength(2);
    expect(prev.split(OLD_READ)).toHaveLength(2);
    const withGuard = prev.replace(PREP_OLD_GUARD, PREP_NEW_GUARD);
    const [before, after] = withGuard.split(OLD_READ);
    expect(next.startsWith(before)).toBe(true);
    expect(next.endsWith(after)).toBe(true);
  });

  it("the owner read is fn_get_policy's own SELECT with the key and scope substituted (same result on main)", () => {
    const resolverSql = read(RESOLVER_FILE);
    const at = resolverSql.indexOf('CREATE OR REPLACE FUNCTION public.fn_get_policy(');
    const s = resolverSql.indexOf('SELECT value FROM platform_policies', at);
    const resolver = resolverSql.slice(s, resolverSql.indexOf('LIMIT 1', s) + 'LIMIT 1'.length);
    const expected = resolver
      .replace('policy_key = p_key', "policy_key = 'hr.pay_scales'")
      .split('scope_id=p_scope_id')
      .join('scope_id=v_period.institution_id');
    expect(next).toContain(`v_pay_matrix := (\n  ${expected}\n  );`);
  });

  it('keeps its grant with anon and PUBLIC revoked', () => {
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) FROM anon, PUBLIC;');
    expect(migration).toContain('GRANT  EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) TO authenticated;');
  });

  it('is mirrored in setup/02_functions.sql', () => {
    expect(fnBody(setupFunctions, 'fn_prepare_payroll_period')).toBe(next);
  });
});

describe('scope', () => {
  it('20260629000000 is the only other definition of either function (besides #4111’s shared prepare body)', () => {
    for (const name of ['fn_prepare_payroll_period', 'fn_backdate_payroll_period']) {
      const re = new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(public\\.)?${name}\\s*\\(`);
      const definers = readdirSync(MIG_DIR).filter(
        (f) => f.endsWith('.sql') && f !== FILE && f !== SIBLING && re.test(read(f)),
      );
      expect(definers, name).toEqual([ORIGIN]);
    }
  });

  it('no function that calls fn_get_caller_role_key() keeps the NULL-passes form after this file', () => {
    const callers = readdirSync(MIG_DIR).filter(
      (f) => f.endsWith('.sql') && f !== FILE && f !== SIBLING && read(f).includes('fn_get_caller_role_key()'),
    );
    expect(callers).toEqual([ORIGIN]);
    // In the origin file, the only bare `OR v_caller_role ...` lines are the two replaced here.
    const bare = origin.split('\n').filter((l) => /^\s*OR v_caller_role\b/.test(l));
    expect(bare.map((l) => l.trim())).toEqual([PREP_OLD_GUARD.trim(), BACK_OLD_GUARD.trim()]);
    expect(migration.split('\n').filter((l) => /^\s*OR v_caller_role\b/.test(l))).toEqual([]);
  });

  it('changes no table, policy or grant beyond the two functions', () => {
    const code = migration.replace(/--[^\n]*/g, '');
    expect(code).not.toMatch(/CREATE (TABLE|POLICY)|ALTER (TABLE|POLICY)|DROP /);
    expect((code.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(2);
    expect(code).not.toMatch(/GRANT[^;]*\banon\b/);
  });

  it('no other migration file claims the same version', () => {
    expect(readdirSync(MIG_DIR).filter((f) => f.startsWith(FILE.slice(0, 14)))).toEqual([FILE]);
  });
});
