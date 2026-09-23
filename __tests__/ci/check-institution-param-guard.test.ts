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
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-institution-param-guard.mjs');
const FIXTURES = path.resolve(process.cwd(), '__tests__/ci/fixtures');
const PROBLEM_HEADER = 'a lookup takes an institution id from the caller and never checks';

let dir: string;

function runFile(file: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, '--verbose', '--files', file], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, out: strip(out) };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: strip(`${err.stdout ?? ''}${err.stderr ?? ''}`) };
  }
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
