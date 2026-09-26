/**
 * Regression tests for scripts/ci/check-institution-param-guard.mjs —
 * "a SECURITY DEFINER function that takes an institution id from its caller must
 * check the caller may see that institution".
 *
 * Why this gate exists (measured live 2026-09-23): ai_rpc_students_summary and
 * two siblings did `v_inst_id := COALESCE(p_institution_id, <own college>)` and
 * then `WHERE (is_super_admin OR institution_id = v_inst_id)`. A one-college head
 * of department passed another college's id and read its 1,511 learners. The
 * flaw passed two AI reviewers and a human; a deterministic gate is what stops
 * the next one. A gate that is not itself tested quietly stops gating, so every
 * trap below is pinned, and the two real files — the live pre-fix body and PR
 * #3983's fix — are carried as fixtures.
 *
 * These drive the real script as a subprocess with --files (exactly how CI
 * invokes it, minus the git diff) and assert on the exit code AND on which
 * function / parameter the report names — the exit code alone cannot say why.
 *
 * Repair round 1 (2026-09-23) adds a block per reviewer finding / orchestrator
 * decision: the widened parameter names, the row-scoped WARNING, ALTER FUNCTION
 * … SECURITY DEFINER, unnamed parameters, overload-by-signature matching, the
 * computed-but-never-enforced check, and renamed-and-edited migrations. The
 * reviewer's probes (p2, p4, p5, p6) and fixtures are carried as tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-institution-param-guard.mjs');
const FIXTURES = path.resolve(process.cwd(), '__tests__/ci/fixtures');
const PROBLEM_HEADER = 'a lookup takes an institution id from the caller and never checks';

let dir: string;

function run(args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: opts.cwd,
      env: opts.env ?? { ...process.env, GITHUB_ACTIONS: '' },
    });
    return { code: 0, out: strip(out) };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: strip(`${err.stdout ?? ''}${err.stderr ?? ''}`) };
  }
}

function runFile(file: string): { code: number; out: string } {
  return run(['--verbose', '--files', file]);
}

/** Several files, read in this order — the way the gate reads a PR's changed migrations. */
function runSqlFiles(files: Array<{ name: string; sql: string }>) {
  const paths = files.map(f => {
    const p = path.join(dir, f.name);
    writeFileSync(p, f.sql, 'utf8');
    return p;
  });
  return run(['--verbose', '--files', ...paths]);
}

function runSql(sql: string, name = 'fixture.sql') {
  const file = path.join(dir, name);
  writeFileSync(file, sql, 'utf8');
  return runFile(file);
}

function runFixture(name: string) {
  return runFile(path.join(FIXTURES, name));
}

function fixtureText(name: string): string {
  return readFileSync(path.join(FIXTURES, name), 'utf8');
}

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** The `N SECURITY DEFINER function(s) taking an institution id checked` counter. */
function checked(out: string): number {
  const m = /parameter guard — (\d+) SECURITY DEFINER function\(s\) taking an institution id checked/.exec(out);
  return m ? Number(m[1]) : -1;
}

/** True when the failure report names this function (and, if given, this parameter). */
function flagged(out: string, fn: string, param?: string): boolean {
  const at = out.indexOf(PROBLEM_HEADER);
  if (at === -1) return false;
  const report = out.slice(at);
  const block = report.split('  • ').find(b => b.includes(`Function:  ${fn}\n`));
  if (!block) return false;
  return param ? block.includes(`Parameter: ${param}\n`) : true;
}

/** The `⚠ WARNING` lines (the job stays green; these name what the gate could not confirm). */
function warnings(out: string): string[] {
  return out.split('\n').filter(l => l.includes('⚠ WARNING'));
}

/** True when a WARNING line names this function (and contains `text`, if given). */
function warned(out: string, fn: string, text?: string): boolean {
  return warnings(out).some(l => l.includes(` — ${fn} — `) && (!text || l.includes(text)));
}

const ROW_SCOPED = (param: string) => `${param}: passes because some rows are scoped`;

const DEFINER = (name: string, params: string, body: string, grants = true) => `
CREATE OR REPLACE FUNCTION public.${name}(${params})
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer; v_ok boolean; v_set uuid[];
BEGIN
${body}
  RETURN v_n;
END;
$$;
${grants ? `REVOKE EXECUTE ON FUNCTION public.${name} FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.${name} TO authenticated;` : ''}
`;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'institution-param-guard-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('institution-param guard — the fixtures the Director asked for', () => {
  it('FAILS the unguarded COALESCE shape', () => {
    const { code, out } = runFixture('institution-param-unguarded-coalesce.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_learner_count', 'p_institution_id')).toBe(true);
    expect(out).toContain('role_has_institution_access(p_institution_id)'); // the plain-English fix line
  });

  it('PASSES the same lookup guarded by role_has_institution_access(p_institution_id)', () => {
    const { code, out } = runFixture('institution-param-guarded.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(1); // in scope — a pass that checked nothing would read 0
  });

  it('PASSES the hatch with a reason, and prints the reason', () => {
    const { code, out } = runFixture('institution-param-hatch-with-reason.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(1);
    expect(out).toContain('super-admin only: the first statement raises');
  });

  it('FAILS the hatch with an empty reason', () => {
    const { code, out } = runFixture('institution-param-hatch-empty-reason.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_admin_institution_rename')).toBe(true);
    expect(out).toContain('with NO reason');
  });

  it('IGNORES a SECURITY INVOKER function', () => {
    const { code, out } = runFixture('institution-param-security-invoker.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
  });

  it('IGNORES a function with no institution-id parameter (a RETURNS TABLE column is not a parameter)', () => {
    const { code, out } = runFixture('institution-param-no-such-param.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
  });

  it("PASSES PR #3983's migration — all five readers that take an institution id", () => {
    const { code, out } = runFixture('institution-param-pr3983-ai-rpc-scope-guards.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(5);
  });

  it('FAILS the live pre-fix ai_rpc_students_summary body (20260712134500, verbatim)', () => {
    const { code, out } = runFixture('institution-param-live-prefix-students-summary.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'ai_rpc_students_summary', 'p_institution_id')).toBe(true);
  });
});

describe('institution-param guard — non-vacuity (the pass depends on the guard)', () => {
  it("FAILS PR #3983's migration once its role_has_institution_access(p_institution_id) calls are taken out", () => {
    const text = fixtureText('institution-param-pr3983-ai-rpc-scope-guards.sql');
    const mutated = text.replaceAll('public.role_has_institution_access(p_institution_id)', '(p_institution_id IS NOT NULL)');
    expect(mutated).not.toBe(text);
    const { code, out } = runSql(mutated, 'pr3983-mutated.sql');
    expect(code).toBe(1);
    for (const fn of [
      'ai_rpc_students_summary',
      'ai_rpc_students_by_department',
      'ai_rpc_admission_analytics',
      'ai_rpc_admission_referrers',
      'ai_rpc_academic_context',
    ]) {
      expect(flagged(out, fn, 'p_institution_id')).toBe(true);
    }
  });

  it('FAILS the guarded fixture once its check is commented out', () => {
    const text = fixtureText('institution-param-guarded.sql');
    const mutated = text.replace(
      '  ELSIF public.role_has_institution_access(p_institution_id) THEN',
      '  -- ELSIF public.role_has_institution_access(p_institution_id) THEN\n  ELSIF true THEN'
    );
    expect(mutated).not.toBe(text);
    const { code, out } = runSql(mutated, 'guard-commented-out.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_learner_count', 'p_institution_id')).toBe(true);
  });

  it('FAILS the hatch fixture once the hatch line is removed — a super-admin-only check is not accepted on its own', () => {
    const text = fixtureText('institution-param-hatch-with-reason.sql');
    const mutated = text.replace(/^-- institution-param-guard: allow.*$/m, '-- (hatch removed)');
    expect(mutated).not.toBe(text);
    const { code, out } = runSql(mutated, 'hatch-removed.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_admin_institution_rename', 'p_institution_id')).toBe(true);
  });
});

describe('institution-param guard — traps', () => {
  it('a hatch separated from CREATE FUNCTION by a blank line does not count', () => {
    const { code, out } = runSql(`
-- institution-param-guard: allow a reason that is too far away

${DEFINER('fn_probe_far_hatch', 'p_institution_id uuid', '  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;')}`);
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_far_hatch')).toBe(true);
  });

  it('a hatch covers only the function directly below it', () => {
    const { code, out } = runSql(`
-- institution-param-guard: allow first function only
${DEFINER('fn_probe_hatched', 'p_institution_id uuid', '  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;').trimStart()}
${DEFINER('fn_probe_not_hatched', 'p_institution_id uuid', '  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;')}`);
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_hatched')).toBe(false);
    expect(flagged(out, 'fn_probe_not_hatched')).toBe(true);
  });

  it('is out of scope only when anon, authenticated AND PUBLIC are all revoked (server-only helper)', () => {
    const body = '  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;';
    const serverOnly = runSql(`${DEFINER('fn_probe_server_only', 'p_institution_id uuid', body, false)}
REVOKE EXECUTE ON FUNCTION public.fn_probe_server_only(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_probe_server_only(uuid) TO service_role;`, 'server-only.sql');
    expect(serverOnly.code).toBe(0);
    expect(checked(serverOnly.out)).toBe(0);

    // Revoking anon + PUBLIC leaves Supabase's direct grant to authenticated.
    const halfRevoked = runSql(`${DEFINER('fn_probe_half_revoked', 'p_institution_id uuid', body, false)}
REVOKE EXECUTE ON FUNCTION public.fn_probe_half_revoked(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_probe_half_revoked(uuid) TO service_role;`, 'half-revoked.sql');
    expect(halfRevoked.code).toBe(1);
    expect(flagged(halfRevoked.out, 'fn_probe_half_revoked')).toBe(true);

    // No grant statements at all: CREATE OR REPLACE keeps whatever was granted before.
    const noGrants = runSql(DEFINER('fn_probe_no_grants', 'p_institution_id uuid', body, false), 'no-grants.sql');
    expect(noGrants.code).toBe(1);
    expect(flagged(noGrants.out, 'fn_probe_no_grants')).toBe(true);
  });

  it('ignores an OUT parameter named institution_id and a trigger function', () => {
    const { code, out } = runSql(`
CREATE OR REPLACE FUNCTION public.fn_probe_out(p_learner_id uuid, OUT institution_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN SELECT lp.institution_id INTO institution_id FROM learners_profiles lp WHERE lp.id = p_learner_id; END;
$$;
CREATE OR REPLACE FUNCTION public.fn_probe_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.institution_id := COALESCE(NEW.institution_id, public.get_current_user_institution_id()); RETURN NEW; END;
$$;`);
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
  });

  it('catches other *_institution_id parameter names', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_target',
      'p_target_institution_id uuid',
      '  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_target_institution_id;'
    ));
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_target', 'p_target_institution_id')).toBe(true);
  });

  it('an array parameter (p_institution_ids) fails unguarded and passes when each element is checked', () => {
    const bad = runSql(DEFINER(
      'fn_probe_many',
      'p_institution_ids uuid[]',
      '  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = ANY(p_institution_ids);'
    ), 'array-bad.sql');
    expect(bad.code).toBe(1);
    expect(flagged(bad.out, 'fn_probe_many', 'p_institution_ids')).toBe(true);

    const good = runSql(DEFINER(
      'fn_probe_many',
      'p_institution_ids uuid[]',
      `  IF EXISTS (SELECT 1 FROM unnest(p_institution_ids) x WHERE NOT public.role_has_institution_access(x)) THEN
    RAISE EXCEPTION 'You do not have access to one of those institutions';
  END IF;
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = ANY(p_institution_ids);`
    ), 'array-good.sql');
    expect(good.code).toBe(0);
    expect(checked(good.out)).toBe(1);
  });

  it('a check merely ASSIGNED and never tested does not count; assigned then tested does', () => {
    const bad = runSql(DEFINER(
      'fn_probe_assigned',
      'p_institution_id uuid',
      `  v_ok := public.role_has_institution_access(p_institution_id);
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;`
    ), 'assigned-only.sql');
    expect(bad.code).toBe(1);

    const good = runSql(DEFINER(
      'fn_probe_assigned',
      'p_institution_id uuid',
      `  v_ok := public.role_has_institution_access(p_institution_id);
  IF NOT v_ok THEN RAISE EXCEPTION 'no access'; END IF;
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;`
    ), 'assigned-tested.sql');
    expect(good.code).toBe(0);
  });

  it('accepts a per-domain fn_<x>_can_<verb>(p_institution_id) helper (the college-leadership shape)', () => {
    const { code } = runSql(DEFINER(
      'fn_probe_leadership',
      'p_institution_id uuid',
      `  IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN RAISE EXCEPTION 'no'; END IF;
  SELECT count(*) INTO v_n FROM institution_leadership WHERE institution_id = p_institution_id;`
    ));
    expect(code).toBe(0);
  });

  it('accepts the caller-scoped accessible-institution helpers as a row filter', () => {
    const ai = runSql(DEFINER(
      'fn_probe_ai_scoped',
      'p_institution_id uuid',
      `  v_set := ai_get_accessible_institutions(auth.uid());
  SELECT count(*) INTO v_n FROM departments d
   WHERE (p_institution_id IS NULL OR d.institution_id = p_institution_id)
     AND d.institution_id = ANY(v_set);`
    ), 'ai-helper.sql');
    expect(ai.code).toBe(0);

    const own = runSql(DEFINER(
      'fn_probe_own_scoped',
      'p_institution_id uuid',
      `  SELECT count(*) INTO v_n FROM departments d
   WHERE d.institution_id = p_institution_id
     AND d.institution_id IN (SELECT institution_id FROM public.get_user_accessible_institutions(auth.uid()));`
    ), 'own-helper.sql');
    expect(own.code).toBe(0);
  });

  it('does NOT accept get_user_accessible_institutions() handed a caller-supplied user id', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_deputy',
      'p_user_id uuid, p_institution_id uuid',
      `  SELECT count(*) INTO v_n FROM departments d
   WHERE d.institution_id = p_institution_id
     AND d.institution_id IN (SELECT institution_id FROM public.get_user_accessible_institutions(p_user_id));`
    ));
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_deputy', 'p_institution_id')).toBe(true);
  });

  it('does NOT accept WRITING user_institution_access as a check (the grant-access shape)', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_grant_access',
      'p_user_id uuid, p_institution_id uuid',
      `  INSERT INTO user_institution_access (user_id, institution_id, granted_by)
  VALUES (p_user_id, p_institution_id, auth.uid());`
    ));
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_grant_access', 'p_institution_id')).toBe(true);
  });

  it('accepts reading user_institution_access for the calling user', () => {
    const { code } = runSql(DEFINER(
      'fn_probe_uia_read',
      'p_institution_id uuid',
      `  IF NOT EXISTS (SELECT 1 FROM user_institution_access
                  WHERE user_id = auth.uid() AND institution_id = p_institution_id AND is_active) THEN
    RAISE EXCEPTION 'no access';
  END IF;
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;`
    ));
    expect(code).toBe(0);
  });

  it('a CREATE FUNCTION written inside another function body or a string is not read as a definition', () => {
    const { code, out } = runSql(`
CREATE OR REPLACE FUNCTION public.fn_probe_outer()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'CREATE OR REPLACE FUNCTION public.fn_probe_inner(p_institution_id uuid) RETURNS int LANGUAGE sql SECURITY DEFINER AS 1';
$$;`);
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Repair round 1 (2026-09-23)
// ─────────────────────────────────────────────────────────────────────────────

const LEAK = (param: string) =>
  `  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = ${param};`;
const CHECKED = (param: string) =>
  `  IF NOT public.role_has_institution_access(${param}) THEN RAISE EXCEPTION 'no access'; END IF;
${LEAK(param)}`;

describe('repair round 1 — decision 1: the widened parameter names', () => {
  // The names the reviewer found on main: p_institution (fn_preview/apply_hostel_fee_categories),
  // p_institutions_id (is_board_chairman_for_programme), p_inst (fn_vsr_*_core), plus
  // p_inst_id and p_college_id (fn_internship_get_active_policy_keys).
  const NEW_NAMES = ['p_institution', 'p_institutions_id', 'p_inst', 'p_inst_id', 'p_college_id'];

  it.each(NEW_NAMES)('FAILS a leaking lookup whose parameter is named %s', name => {
    const fn = `fn_probe_named_${name}`;
    const { code, out } = runSql(DEFINER(fn, `${name} uuid`, LEAK(name)), `leak-${name}.sql`);
    expect(code).toBe(1);
    expect(checked(out)).toBe(1);
    expect(flagged(out, fn, name)).toBe(true);
  });

  it.each(NEW_NAMES)('PASSES the same lookup once %s is checked with role_has_institution_access()', name => {
    const { code, out } = runSql(DEFINER(`fn_probe_named_${name}`, `${name} uuid`, CHECKED(name)), `ok-${name}.sql`);
    expect(code).toBe(0);
    expect(checked(out)).toBe(1);
    expect(warnings(out)).toEqual([]);
  });

  it('FAILS reviewer probe p4: p_inst_id in a plain SQL body with no check', () => {
    const { code, out } = runSql(`
CREATE OR REPLACE FUNCTION public.fn_probe_p4(p_inst_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM learners_profiles WHERE institution_id = p_inst_id;
$$;
GRANT EXECUTE ON FUNCTION public.fn_probe_p4(uuid) TO authenticated;`, 'p4.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_p4', 'p_inst_id')).toBe(true);
  });

  it('does NOT match look-alike names (instance, installment, instrument, boolean flags, a bare inst_id)', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_lookalikes',
      'p_instance_id uuid, p_installment_id uuid, p_instrument_id uuid, p_include_non_billing_institutions boolean, p_within_college boolean, inst_id uuid',
      '  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = inst_id AND id = p_instance_id;'
    ), 'lookalikes.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
  });
});

describe('repair round 1 — decision 2: a pass through row scoping only is WARNED', () => {
  it('reviewer probe p2 (a partial fix): PASSES, and the WARNING names the file, function and parameter', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_p2',
      'p_institution_id uuid',
      `${LEAK('p_institution_id')}
  SELECT count(*) INTO v_n FROM academic_years ay
   WHERE ay.is_current AND public.role_has_institution_access(ay.institution_id);`
    ), 'p2-partial-fix.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(1);
    expect(warned(out, 'fn_probe_p2', ROW_SCOPED('p_institution_id'))).toBe(true);
    expect(warnings(out)[0]).toContain('p2-partial-fix.sql');
    expect(out).toContain('check every query that uses p_institution_id is scoped too');
  });

  it('reviewer decoys (item 8) — the leaked body plus a check on the caller\'s OWN college, or a scoped dropdown — PASS with the WARNING (decided: warn, not fail)', () => {
    const text = fixtureText('institution-param-unguarded-coalesce.sql');
    const decoy = text.replace(
      '  v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);',
      `  IF NOT public.role_has_institution_access(v_profile.institution_id) THEN RAISE EXCEPTION 'no'; END IF;
  v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);`
    );
    expect(decoy).not.toBe(text);
    const own = runSql(decoy, 'decoy-own-college.sql');
    expect(own.code).toBe(0);
    expect(warned(own.out, 'fn_probe_learner_count', ROW_SCOPED('p_institution_id'))).toBe(true);

    const dropdown = runSql(DEFINER(
      'fn_probe_dropdown',
      'p_institution_id uuid',
      `  SELECT array_agg(i.id) INTO v_set FROM institutions i WHERE public.role_has_institution_access(i.id);
${LEAK('p_institution_id')}`
    ), 'decoy-dropdown.sql');
    expect(dropdown.code).toBe(0);
    expect(warned(dropdown.out, 'fn_probe_dropdown', ROW_SCOPED('p_institution_id'))).toBe(true);
  });

  it('prints NO warning when the parameter itself is checked — the guarded fixture and #3983', () => {
    const guarded = runFixture('institution-param-guarded.sql');
    expect(guarded.code).toBe(0);
    expect(warnings(guarded.out)).toEqual([]);

    const pr3983 = runFixture('institution-param-pr3983-ai-rpc-scope-guards.sql');
    expect(pr3983.code).toBe(0);
    expect(checked(pr3983.out)).toBe(5);
    expect(pr3983.out).toContain('5 guarded');
    expect(warnings(pr3983.out)).toEqual([]);
  });

  it('prints NO warning for a variable that holds the parameter — v := COALESCE(<param>, own) — once that is checked', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_alias',
      'p_institution_id uuid',
      `  v_inst := COALESCE(p_institution_id, public.get_current_user_institution_id());
  IF NOT public.role_has_institution_access(v_inst) THEN RAISE EXCEPTION 'no access'; END IF;
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = v_inst;`
    ).replace('v_set uuid[];', 'v_set uuid[]; v_inst uuid;'), 'alias.sql');
    expect(code).toBe(0);
    expect(warnings(out)).toEqual([]);
  });

  it('non-vacuity: with the caller\'s own college FIRST in the COALESCE the variable never holds the parameter → WARNED', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_alias_wrong_way',
      'p_institution_id uuid',
      `  v_inst := COALESCE(public.get_current_user_institution_id(), p_institution_id);
  IF NOT public.role_has_institution_access(v_inst) THEN RAISE EXCEPTION 'no access'; END IF;
${LEAK('p_institution_id')}`
    ).replace('v_set uuid[];', 'v_set uuid[]; v_inst uuid;'), 'alias-wrong-way.sql');
    expect(code).toBe(0);
    expect(warned(out, 'fn_probe_alias_wrong_way', ROW_SCOPED('p_institution_id'))).toBe(true);
  });

  it('prints NO warning for the parameter tested against the caller\'s set, a caller UIA read naming it, or an array checked per element', () => {
    const inSet = runSql(DEFINER(
      'fn_probe_in_set',
      'p_institution_id uuid',
      `  IF NOT (p_institution_id = ANY(public.ai_get_accessible_institutions(auth.uid()))) THEN RAISE EXCEPTION 'no'; END IF;
${LEAK('p_institution_id')}`
    ), 'in-set.sql');
    expect(inSet.code).toBe(0);
    expect(warnings(inSet.out)).toEqual([]);

    const uia = runSql(DEFINER(
      'fn_probe_uia_tied',
      'p_institution_id uuid',
      `  IF NOT EXISTS (SELECT 1 FROM user_institution_access
                  WHERE user_id = auth.uid() AND institution_id = p_institution_id AND is_active) THEN
    RAISE EXCEPTION 'no access';
  END IF;
${LEAK('p_institution_id')}`
    ), 'uia-tied.sql');
    expect(uia.code).toBe(0);
    expect(warnings(uia.out)).toEqual([]);

    const perElement = runSql(DEFINER(
      'fn_probe_many_tied',
      'p_institution_ids uuid[]',
      `  IF EXISTS (SELECT 1 FROM unnest(p_institution_ids) x WHERE NOT public.role_has_institution_access(x)) THEN
    RAISE EXCEPTION 'no access';
  END IF;
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = ANY(p_institution_ids);`
    ), 'many-tied.sql');
    expect(perElement.code).toBe(0);
    expect(warnings(perElement.out)).toEqual([]);
  });

  it('the caller\'s accessible set used only as a row filter (pattern C) PASSES with the WARNING', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_row_filter',
      'p_institution_id uuid',
      `  v_set := ai_get_accessible_institutions(auth.uid());
  SELECT count(*) INTO v_n FROM departments d
   WHERE (p_institution_id IS NULL OR d.institution_id = p_institution_id)
     AND d.institution_id = ANY(v_set);`
    ), 'row-filter.sql');
    expect(code).toBe(0);
    expect(warned(out, 'fn_probe_row_filter', 'pattern C')).toBe(true);
  });

  it('on GitHub Actions each warning is also a ::warning annotation on the file and line', () => {
    const file = path.join(dir, 'annotated.sql');
    writeFileSync(file, DEFINER(
      'fn_probe_annotated',
      'p_institution_id uuid',
      `${LEAK('p_institution_id')}
  SELECT count(*) INTO v_n FROM academic_years ay WHERE public.role_has_institution_access(ay.institution_id);`
    ), 'utf8');
    const { code, out } = run(['--files', file], { env: { ...process.env, GITHUB_ACTIONS: 'true' } });
    expect(code).toBe(0);
    expect(out).toMatch(/^::warning file=[^,]*annotated\.sql,line=2,title=Institution-id parameter guard::fn_probe_annotated — p_institution_id: passes because some rows are scoped/m);
  });
});

describe('repair round 1 — decision 3: ALTER FUNCTION … SECURITY DEFINER', () => {
  const INVOKER_LEAK = (fn: string) => `
CREATE OR REPLACE FUNCTION public.${fn}(p_institution_id uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(*) FROM learners_profiles WHERE institution_id = p_institution_id;
$$;
`;

  it('FAILS reviewer probe p5: a function made SECURITY DEFINER by ALTER, body unguarded', () => {
    const { code, out } = runSql(`${INVOKER_LEAK('leak5')}
ALTER FUNCTION public.leak5(uuid) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.leak5(uuid) TO authenticated;`, 'p5.sql');
    expect(code).toBe(1);
    expect(checked(out)).toBe(1);
    expect(flagged(out, 'leak5', 'p_institution_id')).toBe(true);
    expect(out).toContain('made SECURITY DEFINER by the ALTER FUNCTION on this line');
  });

  it('non-vacuity: without the ALTER the same function is SECURITY INVOKER and is not checked', () => {
    const { code, out } = runSql(`${INVOKER_LEAK('leak5')}
GRANT EXECUTE ON FUNCTION public.leak5(uuid) TO authenticated;`, 'p5-no-alter.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
  });

  it('PASSES an ALTERed function whose body checks the parameter, and accepts the hatch above the ALTER line', () => {
    const guarded = runSql(`
CREATE OR REPLACE FUNCTION public.fn_probe_alter_ok(p_institution_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF NOT public.role_has_institution_access(p_institution_id) THEN RAISE EXCEPTION 'no access'; END IF;
  RETURN (SELECT count(*) FROM learners_profiles WHERE institution_id = p_institution_id);
END;
$$;
ALTER FUNCTION public.fn_probe_alter_ok(p_institution_id uuid) SECURITY DEFINER;`, 'alter-ok.sql');
    expect(guarded.code).toBe(0);
    expect(checked(guarded.out)).toBe(1);

    const hatched = runSql(`${INVOKER_LEAK('fn_probe_alter_hatch')}
-- institution-param-guard: allow super-admin reporting job; server calls only through a service key
ALTER FUNCTION public.fn_probe_alter_hatch(uuid) SECURITY DEFINER;`, 'alter-hatch.sql');
    expect(hatched.code).toBe(0);
    expect(checked(hatched.out)).toBe(1);
    expect(hatched.out).toContain('super-admin reporting job');
  });

  it('reads the PR\'s files in order: CREATE in one file, ALTER in a later one → FAILS, reported at the ALTER', () => {
    const { code, out } = runSqlFiles([
      { name: '20990101000000_create.sql', sql: INVOKER_LEAK('fn_probe_two_files') },
      { name: '20990101000001_alter.sql', sql: 'ALTER FUNCTION public.fn_probe_two_files(uuid) SECURITY DEFINER;\n' },
    ]);
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_two_files', 'p_institution_id')).toBe(true);
    expect(out).toMatch(/File: +\S*20990101000001_alter\.sql \(line 1\)/);
    expect(out).toContain('20990101000000_create.sql:2');
  });

  it('an ALTER whose body is not in the PR PASSES with a WARNING that it could not be checked', () => {
    const { code, out } = runSql('ALTER FUNCTION public.fn_defined_elsewhere(uuid, text) SECURITY DEFINER;\n', 'alter-only.sql');
    expect(code).toBe(0);
    expect(warned(out, 'fn_defined_elsewhere', 'its body is not in this PR')).toBe(true);
  });

  it('an ALTER that comes BEFORE the only CREATE applies to the old body: WARNED, and the INVOKER CREATE is not checked', () => {
    const { code, out } = runSqlFiles([
      { name: '20990101000002_alter_first.sql', sql: 'ALTER FUNCTION public.fn_probe_order(uuid) SECURITY DEFINER;\n' },
      { name: '20990101000003_create_later.sql', sql: INVOKER_LEAK('fn_probe_order') },
    ]);
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
    expect(warned(out, 'fn_probe_order', 'its body is not in this PR')).toBe(true);
  });
});

describe('repair round 1 — decision 4: unnamed (positional) parameters are WARNED, not failed', () => {
  it('reviewer probe p6: an unnamed uuid read as $1 → PASSES with a WARNING that the gate cannot check it', () => {
    const { code, out } = runSql(`
CREATE OR REPLACE FUNCTION public.leak6(uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM learners_profiles WHERE institution_id = $1;
$$;
GRANT EXECUTE ON FUNCTION public.leak6(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.leak7(double precision, timestamp with time zone, uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM learners_profiles WHERE institution_id = $3;
$$;`, 'p6.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
    expect(warned(out, 'leak6', '1 unnamed parameter(s)')).toBe(true);
    // Multi-word type names are one parameter each, not "a parameter named double".
    expect(warned(out, 'leak7', '3 unnamed parameter(s)')).toBe(true);
  });

  it('no warning when the function is revoked from anon, authenticated and PUBLIC', () => {
    const { code, out } = runSql(`
CREATE OR REPLACE FUNCTION public.leak6(uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM learners_profiles WHERE institution_id = $1;
$$;
REVOKE EXECUTE ON FUNCTION public.leak6(uuid) FROM anon, authenticated, PUBLIC;`, 'p6-revoked.sql');
    expect(code).toBe(0);
    expect(warnings(out)).toEqual([]);
  });
});

describe('repair round 1 — decision 5: GRANT/REVOKE matched by signature, not by name', () => {
  const OVERLOADS = `
CREATE OR REPLACE FUNCTION public.ai_rpc_t(p_institution_id uuid, p_x int)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;
  RETURN v_n;
END;
$$;
CREATE OR REPLACE FUNCTION public.ai_rpc_t(p_x int)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT p_x; $$;
`;

  it('reviewer item 9: revoking the (int) overload leaves the unguarded (uuid, int) one in scope → FAILS', () => {
    const { code, out } = runSql(`${OVERLOADS}
REVOKE ALL ON FUNCTION public.ai_rpc_t(int) FROM anon, authenticated, PUBLIC;`, 'overload-other-revoked.sql');
    expect(code).toBe(1);
    expect(checked(out)).toBe(1);
    expect(flagged(out, 'ai_rpc_t', 'p_institution_id')).toBe(true);
  });

  it('revoking the SAME signature, spelled differently (integer for int), takes it out of scope', () => {
    const { code, out } = runSql(`${OVERLOADS}
REVOKE ALL ON FUNCTION public.ai_rpc_t(uuid, integer) FROM anon, authenticated, PUBLIC;`, 'overload-same-revoked.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
    expect(warnings(out)).toEqual([]);
  });

  it('normalises type spellings (uuid[] = _uuid, timestamp with time zone = timestamptz, integer = int4) and keeps a real mismatch in scope', () => {
    const fn = `
CREATE OR REPLACE FUNCTION public.fn_probe_sig(p_institution_ids uuid[], p_from timestamp with time zone, p_n integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = ANY(p_institution_ids);
  RETURN v_n;
END;
$$;`;
    const same = runSql(`${fn}
REVOKE EXECUTE ON FUNCTION public.fn_probe_sig(_uuid, timestamptz, int4) FROM anon, authenticated, PUBLIC;`, 'sig-same.sql');
    expect(same.code).toBe(0);
    expect(checked(same.out)).toBe(0);

    const other = runSql(`${fn}
REVOKE EXECUTE ON FUNCTION public.fn_probe_sig(uuid[], timestamptz, bigint) FROM anon, authenticated, PUBLIC;`, 'sig-other.sql');
    expect(other.code).toBe(1);
    expect(flagged(other.out, 'fn_probe_sig', 'p_institution_ids')).toBe(true);
  });

  it('a REVOKE with no argument list is matched by name, and WARNED when that is what takes the function out of scope', () => {
    const { code, out } = runSql(`${DEFINER('fn_probe_name_only', 'p_institution_id uuid', LEAK('p_institution_id'), false)}
REVOKE EXECUTE ON FUNCTION public.fn_probe_name_only FROM anon, authenticated, PUBLIC;`, 'name-only.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(0);
    expect(warned(out, 'fn_probe_name_only', 'matched by name only')).toBe(true);
  });
});

describe('repair round 1 — reviewer item 10: a check computed but never enforced does not count', () => {
  it('FAILS COALESCE(role_has_institution_access(p), false) that is only returned as a value', () => {
    const { code, out } = runSql(`
CREATE OR REPLACE FUNCTION public.fn_probe_computed(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('allowed', COALESCE(public.role_has_institution_access(p_institution_id), false),
    'rows', (SELECT count(*) FROM learners_profiles WHERE institution_id = p_institution_id));
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_probe_computed(uuid) TO authenticated;`, 'computed.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_computed', 'p_institution_id')).toBe(true);
  });

  it('still PASSES the same COALESCE when it decides: IF NOT COALESCE(…, false) THEN RAISE', () => {
    const { code, out } = runSql(DEFINER(
      'fn_probe_coalesce_decides',
      'p_institution_id uuid',
      `  IF NOT COALESCE(public.role_has_institution_access(p_institution_id), false) THEN RAISE EXCEPTION 'no'; END IF;
${LEAK('p_institution_id')}`
    ), 'coalesce-decides.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(1);
    expect(warnings(out)).toEqual([]);
  });
});

describe('repair round 1 — reviewer item 15: which files a PR changed', () => {
  it('checks a migration that is renamed AND edited (git status R < 100), and skips a pure rename', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'institution-param-git-'));
    try {
      const git = (...args: string[]) => execFileSync('git', [
        '-c', 'user.name=gate-test', '-c', 'user.email=gate-test@example.invalid',
        '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
      ], { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const MIG = 'supabase/migrations';
      const padding = Array.from({ length: 30 }, (_, i) => `-- unchanged context line ${i}`).join('\n');
      const guarded = `${padding}\n${DEFINER('fn_probe_renumbered', 'p_institution_id uuid', CHECKED('p_institution_id'))}`;
      git('init', '-q', '-b', 'main');
      mkdirSync(path.join(repo, MIG), { recursive: true });
      writeFileSync(path.join(repo, MIG, '20990101000000_probe.sql'), guarded, 'utf8');
      git('add', '.');
      git('commit', '-q', '-m', 'base');

      git('checkout', '-q', '-b', 'pure-rename');
      git('mv', `${MIG}/20990101000000_probe.sql`, `${MIG}/20990102000000_probe.sql`);
      git('commit', '-q', '-m', 'renumber only');
      expect(git('diff', '--name-status', '-M', 'main...HEAD')).toMatch(/^R100\t/);
      const pure = run(['--base', 'main'], { cwd: repo });
      expect(pure.code).toBe(0);
      expect(pure.out).toContain('No added or changed migration files');

      git('checkout', '-q', 'main');
      git('checkout', '-q', '-b', 'rename-and-edit');
      git('mv', `${MIG}/20990101000000_probe.sql`, `${MIG}/20990102000000_probe.sql`);
      writeFileSync(path.join(repo, MIG, '20990102000000_probe.sql'),
        guarded.replace(`  IF NOT public.role_has_institution_access(p_institution_id) THEN RAISE EXCEPTION 'no access'; END IF;\n`, ''), 'utf8');
      git('commit', '-q', '-am', 'renumber and drop the check');
      // Non-vacuity: git really reports this as a rename with edits, which --diff-filter=AM skipped.
      expect(git('diff', '--name-status', '-M', 'main...HEAD')).toMatch(/^R0[0-9]{2}\t/);
      const edited = run(['--base', 'main'], { cwd: repo });
      expect(edited.code).toBe(1);
      expect(flagged(edited.out, 'fn_probe_renumbered', 'p_institution_id')).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('repair round 2 — a check inside a string literal does not count', () => {
  // Fresh adversarial review, 2026-09-24 (fixtures a08 / a09): comments were
  // already stripped, but a check that only appears inside a single-quoted
  // literal still read as a real check.
  it('FAILS when the only check is text inside a RAISE LOG message (a08)', () => {
    const { code, out } = runSql(`CREATE OR REPLACE FUNCTION public.fx_str(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RAISE LOG 'TODO: add IF NOT role_has_institution_access(p_institution_id) THEN';
  RETURN (SELECT jsonb_agg(l) FROM learners_profiles l WHERE l.institution_id = p_institution_id);
END $$;
`, 'a08_string_check_leak.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fx_str', 'p_institution_id')).toBe(true);
  });

  it('FAILS when the check is only named inside a RAISE EXCEPTION message (a09)', () => {
    const { code, out } = runSql(`CREATE OR REPLACE FUNCTION public.fx_str2(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_super_admin() AND p_institution_id IS NULL THEN
    RAISE EXCEPTION 'caller must pass role_has_institution_access(p_institution_id)';
  END IF;
  RETURN (SELECT jsonb_agg(l) FROM learners_profiles l WHERE l.institution_id = p_institution_id);
END $$;
`, 'a09_string_msg_leak.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fx_str2', 'p_institution_id')).toBe(true);
  });

  it("FAILS when the check is only inside an E'…' literal with an escaped quote", () => {
    const { code, out } = runSql(DEFINER('fn_probe_estring', 'p_institution_id uuid',
      `  RAISE LOG E'it\\'s IF NOT role_has_institution_access(p_institution_id) THEN';
  SELECT count(*) INTO v_n FROM learners_profiles WHERE institution_id = p_institution_id;`), 'estring.sql');
    expect(code).toBe(1);
    expect(flagged(out, 'fn_probe_estring', 'p_institution_id')).toBe(true);
  });

  it("a body given AS '…' is still read: a real check inside it passes", () => {
    const { code, out } = runSql(`CREATE FUNCTION fx_sq_guard(p_inst_id uuid) RETURNS int
LANGUAGE sql EXTERNAL SECURITY DEFINER AS 'SELECT count(*)::int FROM learners_profiles WHERE institution_id = p_inst_id AND role_has_institution_access(p_inst_id)';
`, 'sq-body-guard.sql');
    expect(code).toBe(0);
    expect(checked(out)).toBe(1);
  });

  it("a body given AS '…': a check inside a literal ('') or a comment WITHIN it does not count", () => {
    const lit = runSql(`CREATE FUNCTION fx_sq_lit(p_inst_id uuid) RETURNS int
LANGUAGE sql SECURITY DEFINER AS 'SELECT count(*)::int FROM learners_profiles WHERE institution_id = p_inst_id AND note <> ''AND role_has_institution_access(p_inst_id)''';
`, 'sq-body-literal.sql');
    expect(lit.code).toBe(1);
    expect(flagged(lit.out, 'fx_sq_lit', 'p_inst_id')).toBe(true);

    const comment = runSql(`CREATE FUNCTION fx_sq_comment(p_inst_id uuid) RETURNS int
LANGUAGE sql SECURITY DEFINER AS 'SELECT count(*)::int FROM learners_profiles WHERE institution_id = p_inst_id
  -- AND role_has_institution_access(p_inst_id)
';
`, 'sq-body-comment.sql');
    expect(comment.code).toBe(1);
    expect(flagged(comment.out, 'fx_sq_comment', 'p_inst_id')).toBe(true);
  });

  it("a quoted identifier holding a ' does not upset the literal blanking (the real check still passes)", () => {
    const { code } = runSql(DEFINER('fn_probe_quoted_ident', 'p_institution_id uuid',
      `  IF NOT public.role_has_institution_access(p_institution_id) THEN RAISE EXCEPTION 'no access'; END IF;
  SELECT count(*) INTO v_n FROM "odd'name" WHERE institution_id = p_institution_id;`), 'quoted-ident.sql');
    expect(code).toBe(0);
  });
});
