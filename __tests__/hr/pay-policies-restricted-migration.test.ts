/**
 * Text checks on migration 20270506090000 (pay rows readable only with the
 * salary key). The behaviour itself was rehearsed on a throwaway PostgreSQL 16;
 * these tests pin the parts a later edit could silently break:
 *
 *   - both restrictive policies exist, are RESTRICTIVE + FOR SELECT, and use the
 *     canonical admin/permission triad with no role names;
 *   - the two policies, the function and the setup mirrors all name the SAME
 *     pay keys (a key added to one and not the others would reopen a path);
 *   - fn_get_policy's SELECT is byte-identical to the newest body in the repo
 *     (20260731180000), so the change is the guard and nothing else;
 *   - the guard only fires for a signed-in caller, raises 42501, and the grants
 *     are restated with anon and PUBLIC revoked;
 *   - every pay key is one the gated route serves.
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
const PREVIOUS_BODY_FILE = '20260731180000_platform_policies_cohort_scope.sql';

const read = (p: string) => readFileSync(p, 'utf8');
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

const migration = read(join(MIG_DIR, FILE));
const code = stripSqlComments(migration);
const setupPolicies = read(join(ROOT, 'supabase', 'setup', '03_policies.sql'));
const setupFunctions = read(join(ROOT, 'supabase', 'setup', '02_functions.sql'));

const PAY_KEYS = ['hr.pay_scales', 'hr.allowances_and_increments'];
const KEY_LIST = `('hr.pay_scales', 'hr.allowances_and_increments')`;
const TRIAD = [
  '(SELECT public.is_super_admin())',
  '(SELECT public.is_admin())',
  "(SELECT public.user_has_permission('hr.payroll.salary.view'))",
];

function policyBlock(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE POLICY ${name}`);
  expect(start, `CREATE POLICY ${name}`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(';', start) + 1);
}

/** The SELECT a fn_get_policy body returns, from `SELECT value FROM` to `LIMIT 1`. */
function resolverSelect(sql: string, createAt: number): string {
  const s = sql.indexOf('SELECT value FROM platform_policies', createAt);
  const e = sql.indexOf('LIMIT 1', s);
  expect(s).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(s);
  return sql.slice(s, e + 'LIMIT 1'.length);
}

describe('migration 20270506090000: restrictive select policies', () => {
  for (const [table, name] of [
    ['public.platform_policies', 'platform_policies_pay_keys_restricted'],
    ['public.hr_policy_audit_log', 'hr_policy_audit_log_pay_keys_restricted'],
  ] as const) {
    it(`${name} is RESTRICTIVE, SELECT-only, on ${table}, and uses the triad`, () => {
      const block = policyBlock(code, name);
      expect(block).toContain(`ON ${table}`);
      expect(block).toMatch(/AS RESTRICTIVE\s+FOR SELECT\s+TO authenticated, anon/);
      expect(block).toContain(`policy_key NOT IN ${KEY_LIST}`);
      for (const arm of TRIAD) expect(block).toContain(arm);
      // Never a role name: Role Management decides who holds the key.
      expect(block).not.toMatch(/role\s*(=|IN)/i);
      expect(code).toContain(`DROP POLICY IF EXISTS ${name} ON ${table};`);
    });

    it(`${name} is mirrored verbatim in setup/03_policies.sql`, () => {
      expect(policyBlock(setupPolicies, name)).toBe(policyBlock(code, name));
    });
  }

  it('touches no INSERT, UPDATE or DELETE policy', () => {
    expect(code).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(code).not.toMatch(/ALTER POLICY/);
  });
});

describe('migration 20270506090000: fn_get_policy guard', () => {
  const createAt = code.indexOf('CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid');

  it('keeps SECURITY DEFINER and the pinned search_path', () => {
    expect(createAt).toBeGreaterThan(-1);
    const header = code.slice(createAt, code.indexOf('AS $function$', createAt));
    expect(header).toMatch(/RETURNS jsonb/);
    expect(header).toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it("returns a SELECT byte-identical to 20260731180000's body", () => {
    const prev = read(join(MIG_DIR, PREVIOUS_BODY_FILE));
    const prevAt = prev.indexOf('CREATE OR REPLACE FUNCTION public.fn_get_policy(');
    expect(resolverSelect(migration, migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_get_policy('))).toBe(
      resolverSelect(prev, prevAt),
    );
  });

  it('refuses only the pay keys, only for a signed-in caller, with 42501', () => {
    const body = code.slice(createAt, code.indexOf('$function$;', createAt));
    expect(body).toContain(`IF p_key IN ${KEY_LIST} THEN`);
    expect(body).toContain('IF auth.uid() IS NOT NULL');
    expect(body).toMatch(
      /NOT \(\s*public\.is_super_admin\(\)\s*OR public\.is_admin\(\)\s*OR public\.user_has_permission\('hr\.payroll\.salary\.view'\)\s*\)/,
    );
    expect(body).toMatch(/RAISE EXCEPTION[\s\S]*USING ERRCODE = '42501'/);
    // The key test comes first, so other keys never pay for the permission lookup.
    expect(body.indexOf('IF p_key IN')).toBeLessThan(body.indexOf('auth.uid() IS NOT NULL'));
  });

  it('restates the grants: anon and PUBLIC revoked, authenticated + service_role granted', () => {
    expect(code).toContain('REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM anon, PUBLIC;');
    expect(code).toContain(
      'GRANT  EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) TO authenticated, service_role;',
    );
    expect(code).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
  });

  it('is mirrored in setup/02_functions.sql with the same guard and SELECT', () => {
    const at = setupFunctions.indexOf('CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text');
    expect(at).toBeGreaterThan(-1);
    const end = setupFunctions.indexOf('$function$;', at);
    const mirror = setupFunctions.slice(at, end);
    const mine = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_get_policy('), migration.indexOf('$function$;', createAt));
    const norm = (s: string) => stripSqlComments(s).replace(/\s+/g, ' ').trim();
    expect(norm(mirror)).toBe(norm(mine));
  });
});

describe('the pay key list is one list', () => {
  it('every place names exactly the same pay keys', () => {
    const lists = code.match(/\('hr\.[a-z_]+'(?:, 'hr\.[a-z_]+')*\)/g) ?? [];
    expect(lists.length).toBe(3); // two policies + the function
    for (const l of lists) expect(l).toBe(KEY_LIST);
  });

  it('every pay key is one the gated route serves, so no editor is left reading it from the browser', () => {
    for (const k of PAY_KEYS) expect(COMPENSATION_POLICY_READ_KEYS as readonly string[]).toContain(k);
  });
});

describe('migration version', () => {
  it('no other migration file claims the same version', () => {
    const version = FILE.slice(0, 14);
    const same = readdirSync(MIG_DIR).filter((f) => f.startsWith(version));
    expect(same).toEqual([FILE]);
  });
});
