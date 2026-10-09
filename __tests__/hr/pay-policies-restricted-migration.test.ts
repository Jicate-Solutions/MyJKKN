/**
 * Text checks on migration 20270506090000 (pay rows readable only with the
 * salary key, scoped per college). The behaviour itself was rehearsed on a
 * throwaway PostgreSQL 16; these tests pin the parts a later edit could
 * silently break:
 *
 *   - both restrictive policies exist, are RESTRICTIVE + FOR SELECT, use the
 *     canonical admin/permission triad with no role names, and scope the key
 *     holder's arm to college rows they can access (NULL-scope rows admin-only);
 *   - the policies, fn_get_policy and the setup mirrors name the SAME pay keys,
 *     pinned below (hr.salary_suggestion_rule included; it is locked here but
 *     served by the salary suggestion feature's own route, not the editors' route);
 *   - fn_get_policy's main SELECT is byte-identical to 20260731180000;
 *   - the setup mirror of fn_get_policy is what the database runs: the newest
 *     migration that creates it, plus the Director-list guard 20270520090000
 *     patches in place when that patch came later;
 *   - fn_prepare_payroll_period is 20260629000000's body byte for byte except
 *     the role check (NULL = refused) and the one v_pay_matrix assignment,
 *     which is fn_get_policy's SELECT with the
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
/** Patches fn_get_policy IN PLACE (section 7): no CREATE of its own. */
const DIRECTOR_LIST_FILE = '20270520090000_the_director_list.sql';
const DIRECTOR_LIST_GUARD =
  " AND (p_key IS DISTINCT FROM 'platform.the_director_profile_ids'" +
  ' OR (SELECT public.is_super_admin()) OR (SELECT public.fn_is_the_director()))';

const read = (p: string) => readFileSync(p, 'utf8');
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const norm = (s: string) => stripSqlComments(s).replace(/\s+/g, ' ').trim();

const migration = read(join(MIG_DIR, FILE));
const code = stripSqlComments(migration);
const setupPolicies = read(join(ROOT, 'supabase', 'setup', '03_policies.sql'));
const setupFunctions = read(join(ROOT, 'supabase', 'setup', '02_functions.sql'));

/** Every key whose rows carry pay figures. Pinned: adding or dropping one is a decision. */
const PAY_KEYS = ['hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule'];
const KEY_LIST = `('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule')`;
/** Pay keys the editors' compensation route serves. The suggestion rule is read by its own route. */
const ROUTE_SERVED_PAY_KEYS = ['hr.pay_scales', 'hr.allowances_and_increments'];
const PAY_KEY_ALT = 'pay_scales|allowances_and_increments|salary_suggestion_rule';

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
/** The role check: NULL (a caller with no team-member role) used to skip the RAISE. */
const OLD_GUARD = "    OR v_caller_role IN ('hr_officer','hr_admin','hr_manager','director')\n";
const NEW_GUARD =
  "    OR (v_caller_role IS NOT NULL AND v_caller_role IN ('hr_officer','hr_admin','hr_manager','director'))\n";

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

  it('adds no permissive write policy and alters no existing policy', () => {
    const writePolicies = code.match(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)[^;]*;/g) ?? [];
    expect(writePolicies).toHaveLength(3);
    for (const p of writePolicies) expect(p).toMatch(/AS RESTRICTIVE/);
    expect(code).not.toMatch(/ALTER POLICY/);
    // The generic write policies and the role-name one stay as they are.
    expect(code).not.toMatch(/DROP POLICY IF EXISTS (platform_policies_(insert|update|delete)|"Admins can update platform_policies") /);
  });
});

describe('writes: compensation keys are super-admin only', () => {
  /** Every compensation key. Pinned: adding or dropping one is a decision. */
  const WRITE_KEY_LIST =
    "('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule', 'hr.motivation_fund')";
  const ARM = `policy_key NOT IN ${WRITE_KEY_LIST} OR (SELECT public.is_super_admin())`;

  for (const [cmd, clauses] of [
    ['INSERT', ['WITH CHECK']],
    ['UPDATE', ['USING', 'WITH CHECK']],
    ['DELETE', ['USING']],
  ] as const) {
    const name = `platform_policies_pay_keys_${cmd.toLowerCase()}_super_admin_only`;

    it(`${name}: RESTRICTIVE ${cmd} for authenticated and anon, super admin only`, () => {
      const block = norm(policyBlock(code, name));
      expect(block).toContain(`ON public.platform_policies AS RESTRICTIVE FOR ${cmd} TO authenticated, anon`);
      // Every clause the command takes carries the same arm (UPDATE: USING and WITH CHECK,
      // so no row can be renamed into a pay key) and nothing else.
      for (const c of clauses) expect(block).toContain(`${c} ( ${ARM} )`);
      expect(block.split(ARM)).toHaveLength(clauses.length + 1);
      expect(block).not.toMatch(/is_admin|user_has_permission|service_role|role\s*(=|IN)/i);
      expect(code).toContain(`DROP POLICY IF EXISTS ${name} ON public.platform_policies;`);
    });

    it(`${name} is mirrored verbatim in setup/03_policies.sql`, () => {
      expect(policyBlock(setupPolicies, name)).toBe(policyBlock(migration, name));
    });
  }

  it('the write key list is the read list plus hr.motivation_fund, and the same everywhere', () => {
    expect(WRITE_KEY_LIST).toBe(`(${[...PAY_KEYS, 'hr.motivation_fund'].map((k) => `'${k}'`).join(', ')})`);
    // 1 (INSERT) + 2 (UPDATE) + 1 (DELETE) in the migration and in the setup mirror.
    expect(code.split(`policy_key NOT IN ${WRITE_KEY_LIST}`)).toHaveLength(5);
    expect(setupPolicies.split(`policy_key NOT IN ${WRITE_KEY_LIST}`)).toHaveLength(5);
    // Every key the editors' route serves is write-locked.
    for (const k of COMPENSATION_POLICY_READ_KEYS) expect(WRITE_KEY_LIST).toContain(`'${k}'`);
  });

  it('an apply-time check fails the migration unless all three are RESTRICTIVE', () => {
    const n = norm(code);
    expect(n).toContain("AND permissive = 'RESTRICTIVE'");
    expect(n).toContain('IF v_n <> 3 THEN RAISE EXCEPTION');
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

  it('is mirrored in setup/02_functions.sql as the database runs it', () => {
    // The newest migration that CREATEs fn_get_policy, so a later re-create is
    // followed rather than this test pinning an old body.
    const definers = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => read(join(MIG_DIR, f)).includes('CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text'));
    const newest = definers[definers.length - 1];
    let live = fnGetPolicy(read(join(MIG_DIR, newest)));
    // 20270520090000 adds its guard after every "policy_key = p_key" of the
    // body the database holds. A CREATE newer than it must carry the guard itself.
    if (newest < DIRECTOR_LIST_FILE) {
      live = live.replace(/(policy_key\s*=\s*p_key)\b/g, `$1${DIRECTOR_LIST_GUARD}`);
    }
    expect(live.split('the_director_profile_ids')).toHaveLength(3);
    expect(norm(fnGetPolicy(setupFunctions))).toBe(norm(live));
  });

  it("the guard is the one 20270520090000's in-place patch adds", () => {
    const patch = read(join(MIG_DIR, DIRECTOR_LIST_FILE));
    // c_guard is two concatenated SQL literals; quotes are doubled inside them.
    const [first, second] = [
      DIRECTOR_LIST_GUARD.slice(0, DIRECTOR_LIST_GUARD.indexOf(' OR (SELECT')),
      DIRECTOR_LIST_GUARD.slice(DIRECTOR_LIST_GUARD.indexOf(' OR (SELECT')),
    ];
    expect(patch).toContain(`'${first.replace(/'/g, "''")}'`);
    expect(patch).toContain(`'${second}'`);
    expect(patch).toContain("'public.fn_get_policy(text, uuid)'");
    expect(patch).toContain("regexp_replace(v_def, '(policy_key\\s*=\\s*p_key)\\M', '\\1' || c_guard, 'g')");
  });
});

describe('fn_prepare_payroll_period reads the matrix as its owner', () => {
  const original = prepareFn(read(join(MIG_DIR, PREPARE_FILE)));
  // The one other allowed change: the role check, shared with
  // fix/hr-payroll-prepare-refuses-non-staff so neither PR reverts the other.
  const prev = original.replace(OLD_GUARD, NEW_GUARD);
  const next = prepareFn(migration);

  it('changes the role check to refuse a caller with no team-member role, and nothing else in it', () => {
    expect(original.split(OLD_GUARD)).toHaveLength(2);
    expect(next.split(NEW_GUARD)).toHaveLength(2);
    expect(next).not.toContain(OLD_GUARD);
  });

  // fix/hr-payroll-prepare-refuses-non-staff (#4112) replaces the same function
  // with the same body on purpose (see payroll-prepare-body-shared.test.ts).
  const SIBLING_FILE = '20270507090000_hr_payroll_prepare_and_backdate_refuse_non_staff.sql';

  it('20260629000000 is the only other definition in supabase/migrations, besides the #4112 sibling', () => {
    const definers = readdirSync(MIG_DIR).filter(
      (f) =>
        f !== FILE &&
        f.endsWith('.sql') &&
        /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(public\.)?fn_prepare_payroll_period\s*\(/.test(
          read(join(MIG_DIR, f)),
        ),
    );
    expect(definers.filter((f) => f !== SIBLING_FILE)).toEqual([PREPARE_FILE]);
  });

  it('the #4112 sibling, when present, carries this exact body', () => {
    if (!readdirSync(MIG_DIR).includes(SIBLING_FILE)) return;
    expect(prepareFn(read(join(MIG_DIR, SIBLING_FILE)))).toBe(next);
  });

  it('the body is byte-identical except the role check and the one v_pay_matrix assignment', () => {
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
    expect(n).not.toMatch(new RegExp(`fn_get_policy\\(\\s*'hr\\.(${PAY_KEY_ALT})'`));
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
        new RegExp(`fn_get_policy(_json|_text|_int|_bool)?\\(\\s*'hr\\.(${PAY_KEY_ALT})'`).test(
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
    const keyLists = code.match(/IN \('hr\.pay_scales'(, 'hr\.[a-z_]+')*\)/g) ?? [];
    // two policies + fn_get_policy + hr_compensation_policies (its own list, checked below)
    const payLists = keyLists.filter((l) => !l.includes('hr.motivation_fund'));
    expect(payLists).toHaveLength(3);
    for (const l of payLists) expect(l).toBe(`IN ${KEY_LIST}`);
    expect(KEY_LIST).toBe(`(${PAY_KEYS.map((k) => `'${k}'`).join(', ')})`);
  });

  it('the same key list is in the setup mirrors', () => {
    expect(setupPolicies.split(`policy_key NOT IN ${KEY_LIST}`)).toHaveLength(3);
    expect(setupFunctions.split(`IF p_key IN ${KEY_LIST} THEN`)).toHaveLength(2);
  });

  it('the editors\' route serves the pay scales and allowances, and NOT the salary suggestion rule', () => {
    for (const k of ROUTE_SERVED_PAY_KEYS) expect(COMPENSATION_POLICY_READ_KEYS as readonly string[]).toContain(k);
    expect(COMPENSATION_POLICY_READ_KEYS as readonly string[]).not.toContain('hr.salary_suggestion_rule');
    expect(norm(compRpc(migration))).not.toContain('hr.salary_suggestion_rule');
  });
});

describe('migration version', () => {
  it('no other migration file claims the same version', () => {
    const version = FILE.slice(0, 14);
    expect(readdirSync(MIG_DIR).filter((f) => f.startsWith(version))).toEqual([FILE]);
  });
});
