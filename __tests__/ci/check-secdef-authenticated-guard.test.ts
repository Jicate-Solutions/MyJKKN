/**
 * Regression tests for assertion 2 of scripts/ci/check-secdef-anon-revoke.mjs —
 * "a SECURITY DEFINER function reachable by every signed-in user must show an
 * authorization check".
 *
 * A security gate that is not itself tested is a gate that quietly stops gating,
 * and this one exists precisely because the gate next to it was silent: PR #3130
 * shipped three functions correctly revoked from anon, granted to `authenticated`,
 * with no check in the body, and all 28 CI checks were green.
 *
 * These drive the real script as a subprocess with --files (exactly how CI invokes
 * it, minus the git diff) and assert on the exit code plus the guard section of the
 * report — the exit code alone cannot say WHICH assertion fired.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-secdef-anon-revoke.mjs');
const GUARD_HEADER = 'callable by every signed-in user with no authorization check';

let dir: string;

function runGate(sql: string, name = 'fixture.sql'): { code: number; out: string } {
  const file = path.join(dir, name);
  writeFileSync(file, sql, 'utf8');
  try {
    const out = execFileSync('node', [SCRIPT, '--verbose', '--files', file], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** True when the GUARD section (not the anon section) names this function. */
function guardFlagged(out: string, fn: string): boolean {
  const at = out.indexOf(GUARD_HEADER);
  return at !== -1 && out.slice(at).includes(fn);
}

/** The `N broadly-granted function(s) checked` counter, for in-scope assertions. */
function guardChecked(out: string): number {
  const plain = out.replace(/\[[0-9;]*m/g, '');
  const m = /authz-guard\s+—\s+(\d+) broadly-granted/.exec(plain);
  return m ? Number(m[1]) : -1;
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'secdef-authz-guard-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('secdef authz-guard gate', () => {
  // ── (a) the #3130 shape ───────────────────────────────────────────────────
  it('FLAGS a guard-less secdef function granted to authenticated', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_switch(p_enabled boolean)
      RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.platform_policies SET value = to_jsonb(p_enabled)
         WHERE policy_key = 'probe.enabled';
        RETURN 0;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_switch(boolean) FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_switch(boolean) TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_switch')).toBe(true);
  });

  it('reproduces the live PR #3130 shape verbatim — anon locked, still flagged', () => {
    // The exact bytes that passed 28 green checks: a correct anon revoke, an
    // authenticated grant, and auth.uid() present only to RECORD who acted.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_calendar_lock_set_enabled(p_enabled boolean)
      RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      DECLARE v_cleared integer := 0;
      BEGIN
        UPDATE public.platform_policies
           SET value = to_jsonb(p_enabled), updated_at = now(), updated_by = auth.uid()
         WHERE policy_key = 'meetings.calendar_lock.enabled';
        IF p_enabled THEN RETURN 0; END IF;
        UPDATE public.profiles SET calendar_lock_active = false
         WHERE calendar_lock_active;
        GET DIAGNOSTICS v_cleared = ROW_COUNT;
        RETURN v_cleared;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_calendar_lock_set_enabled(boolean) FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_calendar_lock_set_enabled(boolean) TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_calendar_lock_set_enabled')).toBe(true);
    // …and the anon assertion still passes it, which is the whole point.
    expect(out).not.toContain('missing an explicit anon lock');
  });

  it('TRAP 1 — auth.uid() used to RECORD, not to CHECK, does not count as a guard', () => {
    // An earlier detector matched auth.uid() here and reported has_guard:true.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_records_actor(p_note text)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        INSERT INTO public.probe_audit (note, acted_by, acted_at)
        VALUES (p_note, auth.uid(), now());
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_records_actor(text) FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_records_actor(text) TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_records_actor')).toBe(true);
  });

  it('TRAP 1b — `auth.uid() IS NOT NULL` alone is not authorization for an authenticated grant', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_logged_in_only()
      RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
        UPDATE public.probe_state SET armed = true;
        RETURN 1;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_logged_in_only() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_logged_in_only() TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_logged_in_only')).toBe(true);
  });

  // ── (b) a real guard passes ───────────────────────────────────────────────
  it('PASSES the same function once a super-admin guard is added', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_switch(p_enabled boolean)
      RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN
          RAISE EXCEPTION 'fn_probe_switch: super-admin only';
        END IF;
        UPDATE public.platform_policies SET value = to_jsonb(p_enabled)
         WHERE policy_key = 'probe.enabled';
        RETURN 0;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_switch(boolean) FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_switch(boolean) TO authenticated;
    `);
    expect(code).toBe(0);
    expect(guardChecked(out)).toBe(1);
  });

  it('PASSES a user_has_permission() guard', () => {
    const { code } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_perm_guarded(p_id uuid)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF NOT public.user_has_permission('meetings.calendar.manage') THEN
          RAISE EXCEPTION 'not permitted';
        END IF;
        DELETE FROM public.probe_rows WHERE id = p_id;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_perm_guarded(uuid) FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_perm_guarded(uuid) TO authenticated;
    `);
    expect(code).toBe(0);
  });

  it('PASSES a per-domain fn_<domain>_can_<verb>() helper guard', () => {
    const { code } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_domain_guarded(p_id uuid)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF NOT public.fn_induction_can_manage_training(p_id) THEN
          RAISE EXCEPTION 'not permitted';
        END IF;
        UPDATE public.probe_rows SET done = true WHERE id = p_id;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_domain_guarded(uuid) FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_domain_guarded(uuid) TO authenticated;
    `);
    expect(code).toBe(0);
  });

  it('PASSES a LANGUAGE sql body whose expression is the authorization check', () => {
    const { code } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_sql_guarded()
      RETURNS TABLE (id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT r.id FROM public.probe_rows r
         WHERE is_super_admin() OR role_has_institution_access(r.institution_id)
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_sql_guarded() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_sql_guarded() TO authenticated;
    `);
    expect(code).toBe(0);
  });

  it('FLAGS a guard that exists only in a comment', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_commented_guard()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        -- IF NOT is_super_admin() THEN RAISE EXCEPTION 'nope'; END IF;
        /* IF NOT user_has_permission('x.y') THEN RAISE EXCEPTION 'nope'; END IF; */
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_commented_guard() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_commented_guard() TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_commented_guard')).toBe(true);
  });

  it('does not read a neighbouring CREATE POLICY as the function own guard', () => {
    // The policy below is genuinely guarded; the function above it is not.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_next_to_policy()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_next_to_policy() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_next_to_policy() TO authenticated;
      CREATE POLICY "probe_select" ON public.probe_state FOR SELECT
        USING (is_super_admin() OR user_has_permission('probe.view'));
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_next_to_policy')).toBe(true);
  });

  // ── (c) the escape hatch ──────────────────────────────────────────────────
  it('PASSES when the file carries the ci:allow-secdef-authenticated marker', () => {
    const { code, out } = runGate(`
      -- ci:allow-secdef-authenticated read-only self-service lookup; returns only the caller own row
      CREATE OR REPLACE FUNCTION public.fn_probe_hatched()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_hatched() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_hatched() TO authenticated;
    `);
    expect(code).toBe(0);
    expect(guardChecked(out)).toBe(0);
  });

  it('the ci:allow-secdef-anon hatch does NOT waive the authz-guard assertion', () => {
    // Two hatches, two questions: one waives "who unauthenticated can call this",
    // the other waives "who signed-in can call this".
    const { code, out } = runGate(`
      -- ci:allow-secdef-anon intentionally public landing-page read
      CREATE OR REPLACE FUNCTION public.fn_probe_anon_hatched()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
      GRANT EXECUTE ON FUNCTION public.fn_probe_anon_hatched() TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_anon_hatched')).toBe(true);
  });

  // ── (d) trigger functions are exempt ──────────────────────────────────────
  it('EXEMPTS a RETURNS trigger function', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_touch_updated_at()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        NEW.updated_at := now();
        RETURN NEW;
      END;
      $$;
      GRANT EXECUTE ON FUNCTION public.fn_probe_touch_updated_at() TO authenticated;
    `);
    expect(code).toBe(0);
    expect(guardChecked(out)).toBe(0);
  });

  it('IGNORES a SECURITY INVOKER function granted to authenticated', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_invoker()
      RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
        SELECT count(*)::int FROM public.probe_rows
      $$;
      GRANT EXECUTE ON FUNCTION public.fn_probe_invoker() TO authenticated;
    `);
    expect(code).toBe(0);
    expect(guardChecked(out)).toBe(0);
  });

  // ── (e) service_role only ─────────────────────────────────────────────────
  it('PASSES a guard-less function granted only to service_role, with PUBLIC revoked', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_service_only(p_id uuid)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.probe_rows SET done = true WHERE id = p_id;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_service_only(uuid) FROM anon, authenticated, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_service_only(uuid) TO service_role;
    `);
    expect(code).toBe(0);
    expect(guardChecked(out)).toBe(0);
  });

  // ── TRAP 2 — anon is a member of PUBLIC, and so is authenticated ──────────
  it('TRAP 2 — revoking authenticated does not undo a grant to PUBLIC', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_public_grant()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_public_grant() FROM anon, authenticated;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_public_grant() TO PUBLIC;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_public_grant')).toBe(true);
  });

  it('TRAP 2b — revoking only anon leaves the Postgres PUBLIC default in place', () => {
    // Assertion 1 is satisfied by the bare anon revoke. Assertion 2 is not:
    // authenticated still reaches the function through PUBLIC.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_anon_only_revoke()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_anon_only_revoke() FROM anon;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_anon_only_revoke() TO service_role;
    `);
    expect(code).toBe(1);
    expect(out).not.toContain('missing an explicit anon lock');
    expect(guardFlagged(out, 'fn_probe_anon_only_revoke')).toBe(true);
  });

  // ── net-effect ordering ───────────────────────────────────────────────────
  it('PASSES when a later REVOKE cancels an earlier GRANT to authenticated', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_regranted()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_regranted() TO authenticated;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_regranted() FROM anon, authenticated, PUBLIC;
    `);
    expect(code).toBe(0);
    expect(guardChecked(out)).toBe(0);
  });

  it('attributes grants per function, not per file', () => {
    // Two functions, one grant. Only the granted one is in scope.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_locked()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN UPDATE public.probe_state SET a = 1; END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_locked() FROM anon, authenticated, PUBLIC;

      CREATE OR REPLACE FUNCTION public.fn_probe_open()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN UPDATE public.probe_state SET b = 2; END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_open() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_open() TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardChecked(out)).toBe(1);
    expect(guardFlagged(out, 'fn_probe_open')).toBe(true);
    const at = out.indexOf(GUARD_HEADER);
    expect(out.slice(at)).not.toContain('fn_probe_locked');
  });

  it('treats GRANT ON ALL FUNCTIONS IN SCHEMA as reaching every function in the file', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_schema_wide()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN UPDATE public.probe_state SET armed = true; END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_schema_wide() FROM anon, authenticated, PUBLIC;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    `);
    expect(code).toBe(1);
    expect(guardFlagged(out, 'fn_probe_schema_wide')).toBe(true);
  });

  it('does not flag on prose that merely mentions granting to authenticated', () => {
    // 20260901140000 header prose contains exactly this phrasing.
    const { code, out } = runGate(`
      -- This function was GRANTed to \`authenticated\` before 20260901140000.
      -- GRANT EXECUTE ON FUNCTION public.fn_probe_prose() TO authenticated;
      CREATE OR REPLACE FUNCTION public.fn_probe_prose()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN UPDATE public.probe_state SET armed = true; END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_prose() FROM anon, authenticated, PUBLIC;
    `);
    expect(code).toBe(0);
    expect(guardChecked(out)).toBe(0);
  });

  it('keeps assertion 1 working — a new secdef function with no anon lock still fails', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_probe_no_anon_lock()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN
        IF NOT is_super_admin() THEN RAISE EXCEPTION 'nope'; END IF;
        UPDATE public.probe_state SET armed = true;
      END;
      $$;
    `);
    expect(code).toBe(1);
    expect(out).toContain('missing an explicit anon lock');
    expect(out).toContain('fn_probe_no_anon_lock');
  });
});

/**
 * The false-negative branch. Both the PR body and the script header assert that
 * "a predicate merely assigned or logged does not clear the gate" — the whole
 * reason assertion 2 exists. Branch (c) of hasAuthorizationGuard broke that
 * promise: it is documented as covering a LANGUAGE sql one-expression body
 * (`RETURN is_super_admin()`), but its regex matches ANY `select … <predicate>`,
 * including plpgsql's `SELECT is_super_admin() INTO v_flag;` — which RECORDS the
 * answer and gates nothing.
 *
 * This is the same shape that has bitten repeatedly: auth.uid() inside
 * COALESCE(granted_by, auth.uid()) reads like a guard and is an audit column.
 */
describe('assertion 2 — a predicate that is ASSIGNED, not CHECKED', () => {
  it('FLAGS a plpgsql function whose only predicate use is SELECT … INTO', () => {
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_records_but_does_not_check(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE v_flag boolean;
      BEGIN
        -- Records who asked. Never branches on it. This must NOT clear the gate.
        SELECT is_super_admin() INTO v_flag;
        UPDATE platform_policies SET value = 'true'::jsonb WHERE id = p_id;
      END;
      $$;
      REVOKE EXECUTE ON FUNCTION public.fn_records_but_does_not_check(uuid) FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_records_but_does_not_check(uuid) TO authenticated;
    `, 'records-not-checks.sql');

    expect(guardChecked(out)).toBe(1);
    expect(guardFlagged(out, 'fn_records_but_does_not_check')).toBe(true);
    expect(code).toBe(1);
  });

  it('still PASSES a real LANGUAGE sql one-expression body', () => {
    // Branch (c) exists for this shape and must keep working: the predicate IS
    // the returned expression, so it genuinely gates.
    const { code, out } = runGate(`
      CREATE OR REPLACE FUNCTION public.fn_sql_expression_guard()
      RETURNS boolean
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$ SELECT is_super_admin() $$;
      REVOKE EXECUTE ON FUNCTION public.fn_sql_expression_guard() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_sql_expression_guard() TO authenticated;
    `, 'sql-expression-guard.sql');

    expect(guardFlagged(out, 'fn_sql_expression_guard')).toBe(false);
    expect(code).toBe(0);
  });
});
