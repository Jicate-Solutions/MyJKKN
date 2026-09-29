/**
 * Text checks on migration 20270506090000 (pay rows readable only with the
 * salary key, scoped per college). The behaviour itself was rehearsed on a
 * throwaway PostgreSQL 16; these tests pin the parts a later edit could
 * silently break:
 *
 *   - both restrictive policies exist, are RESTRICTIVE + FOR SELECT, use the
 *     canonical admin/permission triad with no role names, and scope the key
 *     holder's arm to college rows they can access (NULL-scope rows admin-only);
 *   - the policies, fn_get_policy and the setup mirrors name the SAME pay keys;
 *   - fn_get_policy's main SELECT is byte-identical to 20260731180000;
 *   - fn_prepare_payroll_period is 20260629000000's body byte for byte except
 *     the one v_pay_matrix assignment, which is fn_get_policy's SELECT with the
 *     key and scope substituted (so the snapshot is unchanged) and no longer
 *     calls the gated fn_get_policy;
 *   - hr_compensation_policies gates on the triad and scopes by college;
 *   - grants restated with anon and PUBLIC revoked.
 *
 * Run: npx vitest run __tests__/hr/pay-policies-restricted-migration.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COMPENSATION_POLICY_READ_KEYS } from '@/lib/services/hr/compensation-policies/compensation-policy-read-service';

const ROOT = join(__dirname, '..', '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const FILE = '20270506090000_hr_pay_policies_readable_only_with_salary_view.sql';
const RESOLVER_FILE = '20260731180000_platform_policies_cohort_scope.sql';
const PREPARE_FILE = '20260629000000_t4_3_pr2_payroll_rpcs.sql';

const read = (p: string) => readFileSync(p, 'utf8');
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => stripSqlComments(s).replace(/\s+/g, ' ').trim();

const migration = read(join(MIG_DIR, FILE));
const code = stripSqlComments(migration);
const setupPolicies = read(join(ROOT, 'supabase', 'setup', '03_policies.sql'));
const setupFunctions = read(join(ROOT, 'supabase', 'setup', '02_functions.sql'));

const PAY_KEYS = ['hr.pay_scales', 'hr.allowances_and_increments'];
const KEY_LIST = `('hr.pay_scales', 'hr.allowances_and_increments')`;

function slice(sql: string, start: string, end: string): string {
  const s = sql.indexOf(start);
  expect(s, start).toBeGreaterThan(-1);
  const e = sql.indexOf(end, s);
  expect(e, end).toBeGreaterThan(s);
  return sql.slice(s, e + end.length);
}
const policyBlock = (sql: string, name: string) => slice(sql, `CREATE POLICY ${name}`, ');\n');
const fnGetPolicy = (sql: string) =>
  slice(sql, 'CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text', '$function$;');
const prepareFn = (sql: string) =>
  slice(sql, 'CREATE OR REPLACE FUNCTION public.fn_prepare_payroll_period(', '\n$$;');
const compRpc = (sql: string) =>
  slice(sql, 'CREATE OR REPLACE FUNCTION public.hr_compensation_policies(p_key text)', '$function$;');

/** The resolver SELECT of a fn_get_policy body, `SELECT value FROM platform_policies` … `LIMIT 1`. */
function resolverSelect(fnBody: string): string {
  return slice(fnBody, 'SELECT value FROM platform_policies', 'LIMIT 1');
}

const OLD_READ = "  v_pay_matrix := public.fn_get_policy('hr.pay_scales', v_period.institution_id);";

describe('restrictive select policies', () => {
  for (const [table, name] of [
    ['public.platform_policies', 'platform_policies_pay_keys_restricted'],
    ['public.hr_policy_audit_log', 'hr_policy_audit_log_pay_keys_restricted'],
  ] as const) {
    it(`${name}: RESTRICTIVE, SELECT-only, triad, college-scoped key holders`, () => {
      const block = norm(policyBlock(code, name));
      expect(block).toContain(`ON ${table}`);
      expect(block).toContain('AS RESTRICTIVE FOR SELECT TO authenticated, anon');
      expect(block).toContain(
        `policy_key NOT IN ${KEY_LIST} OR (SELECT public.is_super_admin()) OR (SELECT public.is_admin()) OR ( ` +
          "scope_type = 'institution' AND scope_id IS NOT NULL " +
          "AND (SELECT public.user_has_permission('hr.payroll.salary.view')) " +
          'AND public.role_has_institution_access(scope_id) )',
      );
      expect(block).not.toMatch(/role\s*(=|IN)\s*\(?'/i);
      expect(code).toContain(`DROP POLICY IF EXISTS ${name} ON ${table};`);
    });

    it(`${name} is mirrored verbatim in setup/03_policies.sql`, () => {
      expect(policyBlock(setupPolicies, name)).toBe(policyBlock(migration, name));
    });
  }

  it('touches no INSERT, UPDATE or DELETE policy', () => {
    expect(code).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(code).not.toMatch(/ALTER POLICY/);
  });
});

describe('fn_get_policy guard', () => {
  const fn = fnGetPolicy(migration);
  const body = stripSqlComments(fn);

  it('keeps SECURITY DEFINER, jsonb and the pinned search_path', () => {
    expect(body).toMatch(/RETURNS jsonb/);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it("its main SELECT is byte-identical to 20260731180000's", () => {
    const prev = read(join(MIG_DIR, RESOLVER_FILE));
    const prevFn = slice(prev, 'CREATE OR REPLACE FUNCTION public.fn_get_policy(', '$function$;');
    expect(resolverSelect(fn)).toBe(resolverSelect(prevFn));
  });

  it('pay keys: signed-in non-admins need the key AND the college, get that college row only, else 42501', () => {
    const n = norm(fn);
    expect(n).toContain(`IF p_key IN ${KEY_LIST} THEN`);
    expect(n).toContain('IF auth.uid() IS NOT NULL AND NOT (public.is_super_admin() OR public.is_admin()) THEN');
    expect(n).toContain(
      "IF NOT public.user_has_permission('hr.payroll.salary.view') OR p_scope_id IS NULL " +
        'OR NOT public.role_has_institution_access(p_scope_id) THEN RAISE EXCEPTION',
    );
    expect(n).toContain("USING ERRCODE = '42501'");
    expect(n).toContain(
      "SELECT pp.value FROM platform_policies pp WHERE pp.policy_key = p_key AND pp.is_active = true " +
        "AND pp.scope_type = 'institution' AND pp.scope_id = p_scope_id LIMIT 1",
    );
    // The key test comes first, so other keys never pay for the permission lookup.
    expect(body.indexOf('IF p_key IN')).toBeLessThan(body.indexOf('auth.uid() IS NOT NULL'));
  });

  it('restates the grants: anon and PUBLIC revoked', () => {
    expect(code).toContain('REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM anon, PUBLIC;');
    expect(code).toContain(
      'GRANT  EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) TO authenticated, service_role;',
    );
    expect(code).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
  });

  it('is mirrored in setup/02_functions.sql', () => {
    expect(norm(fnGetPolicy(setupFunctions))).toBe(norm(fn));
  });
});

describe('fn_prepare_payroll_period reads the matrix as its owner', () => {
  const prev = prepareFn(read(join(MIG_DIR, PREPARE_FILE)));
  const next = prepareFn(migration);

  it('20260629000000 is the only other definition in supabase/migrations', () => {
    const definers = readdirSync(MIG_DIR).filter(
      (f) =>
        f !== FILE &&
        f.endsWith('.sql') &&
        /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(public\.)?fn_prepare_payroll_period\s*\(/.test(
          read(join(MIG_DIR, f)),
        ),
    );
    expect(definers).toEqual([PREPARE_FILE]);
  });

  it('the body is byte-identical except the one v_pay_matrix assignment', () => {
    expect(prev.split(OLD_READ)).toHaveLength(2);
    const [before, after] = prev.split(OLD_READ);
    expect(next.startsWith(before)).toBe(true);
    expect(next.endsWith(after)).toBe(true);
  });

  it("the new assignment is fn_get_policy's own SELECT with key and scope substituted", () => {
    const [before, after] = prev.split(OLD_READ);
    const replacement = next.slice(before.length, next.length - after.length);
    const resolver = resolverSelect(
      slice(read(join(MIG_DIR, RESOLVER_FILE)), 'CREATE OR REPLACE FUNCTION public.fn_get_policy(', '$function$;'),
    );
    const expected = resolver
      .replace('policy_key = p_key', "policy_key = 'hr.pay_scales'")
      .split('scope_id=p_scope_id')
      .join('scope_id=v_period.institution_id');
    expect(replacement).toContain(`v_pay_matrix := (\n  ${expected}\n  );`);
  });

  it('no longer reads a pay key through the gated fn_get_policy (the deduction keys still do)', () => {
    const n = stripSqlComments(next);
    expect(n).not.toMatch(/fn_get_policy\(\s*'hr\.(pay_scales|allowances_and_increments)'/);
    expect(n).toContain("public.fn_get_policy('hr.payroll.tds_slabs',");
  });

  it('keeps SECURITY DEFINER and its grant, with anon and PUBLIC revoked', () => {
    expect(next).toMatch(/LANGUAGE plpgsql SECURITY DEFINER/);
    expect(code).toContain('REVOKE EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) FROM anon, PUBLIC;');
    expect(code).toContain('GRANT  EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) TO authenticated;');
  });

  it('is mirrored in setup/02_functions.sql', () => {
    expect(prepareFn(setupFunctions)).toBe(next);
  });

  it('no other SQL function in supabase/migrations reads a pay key through fn_get_policy', () => {
    const readers = readdirSync(MIG_DIR)
      .filter((f) => f !== FILE && f !== PREPARE_FILE && f.endsWith('.sql'))
      .filter((f) =>
        /fn_get_policy(_json|_text|_int|_bool)?\(\s*'hr\.(pay_scales|allowances_and_increments)'/.test(
          stripSqlComments(read(join(MIG_DIR, f))),
        ),
      );
    expect(readers).toEqual([]);
  });
});

describe('hr_compensation_policies', () => {
  const fn = compRpc(migration);
  const n = norm(fn);

  it('serves only the three compensation keys the route serves', () => {
    expect(n).toContain("p_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.motivation_fund')");
    expect([...COMPENSATION_POLICY_READ_KEYS].sort()).toEqual(
      ['hr.allowances_and_increments', 'hr.motivation_fund', 'hr.pay_scales'],
    );
  });

  it('raises without admin or the salary key, and scopes rows by college for non-admins', () => {
    expect(n).toContain('v_admin := public.is_super_admin() OR public.is_admin();');
    expect(n).toContain(
      "IF NOT (v_admin OR public.user_has_permission('hr.payroll.salary.view')) THEN RAISE EXCEPTION",
    );
    expect(n).toContain("USING ERRCODE = 'insufficient_privilege'");
    expect(n).toContain('WHERE v_admin OR public.role_has_institution_access(i.id)');
    expect(n).toContain("AND pp.scope_type = 'institution' AND pp.scope_id = i.id");
  });

  it('is locked from anon and mirrored in setup/02_functions.sql', () => {
    expect(code).toContain('REVOKE EXECUTE ON FUNCTION public.hr_compensation_policies(text) FROM anon, PUBLIC;');
    expect(code).toContain('GRANT  EXECUTE ON FUNCTION public.hr_compensation_policies(text) TO authenticated;');
    expect(compRpc(setupFunctions)).toBe(fn);
  });
});

describe('the pay key list is one list', () => {
  it('the two policies and fn_get_policy name exactly the same pay keys', () => {
    const twoKeyLists = code.match(/\('hr\.pay_scales', 'hr\.[a-z_]+'\)/g) ?? [];
    expect(twoKeyLists).toHaveLength(3);
    for (const l of twoKeyLists) expect(l).toBe(KEY_LIST);
  });

  it('every pay key is one the gated route serves', () => {
    for (const k of PAY_KEYS) expect(COMPENSATION_POLICY_READ_KEYS as readonly string[]).toContain(k);
  });
});

describe('migration version', () => {
  it('no other migration file claims the same version', () => {
    const version = FILE.slice(0, 14);
    expect(readdirSync(MIG_DIR).filter((f) => f.startsWith(version))).toEqual([FILE]);
  });
});
