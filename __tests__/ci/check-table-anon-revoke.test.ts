/**
 * Regression tests for scripts/ci/check-table-anon-revoke.mjs.
 *
 * A security gate that is not itself tested is a gate that quietly stops gating.
 * These drive the real script as a subprocess (exactly how CI invokes it) against
 * fixtures written to a temp dir, and assert on the process exit code — the only
 * signal CI actually reads.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-table-anon-revoke.mjs');

let dir: string;

/** Run the gate over one fixture. Returns { code, out }. */
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

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'table-anon-revoke-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('check-table-anon-revoke gate', () => {
  it('FAILS a new table with no anon revoke (the shape of every leaking migration)', () => {
    const { code, out } = runGate(`
      CREATE TABLE IF NOT EXISTS public.probe_leaky_table (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id uuid NOT NULL
      );
      ALTER TABLE public.probe_leaky_table ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "p" ON public.probe_leaky_table FOR SELECT USING (is_super_admin());
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_leaky_table');
  });

  it('FAILS when the only revoke is commented out (a dead comment must not satisfy a security gate)', () => {
    const { code, out } = runGate(`
      -- REVOKE ALL ON TABLE public.probe_commented FROM anon, PUBLIC;
      /* REVOKE ALL ON TABLE public.probe_commented FROM anon; */
      CREATE TABLE public.probe_commented (id uuid PRIMARY KEY);
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_commented');
  });

  it('FAILS when the file revokes anon on a FUNCTION but not on the table', () => {
    // The exact live shape of 20260726181500 / 20260803060000: function revokes
    // present, table revokes absent. A character-window regex scores this as
    // covered; per-statement matching does not.
    const { code, out } = runGate(`
      CREATE TABLE public.probe_fn_only (id uuid PRIMARY KEY);
      CREATE OR REPLACE FUNCTION public.fn_probe_fn_only() RETURNS int
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT 1 $$;
      REVOKE EXECUTE ON FUNCTION public.fn_probe_fn_only() FROM anon, PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.fn_probe_fn_only() TO service_role;
    `);
    expect(code).toBe(1);
    expect(out).toContain('probe_fn_only');
  });

  it('PASSES a correctly locked table', () => {
    const { code } = runGate(`
      CREATE TABLE public.probe_ok (id uuid PRIMARY KEY);
      REVOKE ALL ON TABLE public.probe_ok FROM anon, PUBLIC;
      GRANT SELECT ON TABLE public.probe_ok TO authenticated;
      ALTER TABLE public.probe_ok ENABLE ROW LEVEL SECURITY;
    `);
    expect(code).toBe(0);
  });

  it('PASSES a CREATE TABLE AS (CTAS) that carries a revoke, and CATCHES one that does not', () => {
    expect(runGate(`
      CREATE TABLE public._bak_probe_20260726 AS SELECT 1 AS id;
      REVOKE ALL ON TABLE public._bak_probe_20260726 FROM anon, PUBLIC;
    `, 'ctas-ok.sql').code).toBe(0);

    const bad = runGate(`
      CREATE TABLE public._bak_probe_bare_20260726 AS SELECT 1 AS id;
    `, 'ctas-bad.sql');
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('_bak_probe_bare_20260726');
  });

  it('PASSES an intentionally-public table locked by an explicit GRANT TO anon (newline before TO)', () => {
    const { code } = runGate(`
      -- unauthenticated admission landing page reads this
      CREATE TABLE public.probe_public_lookup (code text PRIMARY KEY);
      GRANT SELECT ON TABLE public.probe_public_lookup
         TO anon, authenticated;
    `);
    expect(code).toBe(0);
  });

  it('IGNORES temp tables and non-public schemas', () => {
    const { code, out } = runGate(`
      CREATE TEMP TABLE scratch_rows (id uuid);
      CREATE TEMPORARY TABLE scratch_rows_2 (id uuid);
      CREATE TABLE storage.probe_other_schema (id uuid);
    `);
    expect(code).toBe(0);
    expect(out).toContain('0 new table(s) checked');
  });

  it('does NOT invent a table from prose in a header comment', () => {
    // The real 20260726180000 header contains "created with plain CREATE TABLE AS";
    // a comment-blind scanner extracts a table literally named "AS" from it.
    const { code, out } = runGate(`
      -- Cause: leftovers created with plain CREATE TABLE AS. That inherits the
      -- Supabase default grant to anon and does NOT enable RLS.
      REVOKE ALL ON TABLE public.some_existing_table FROM anon, PUBLIC;
    `);
    expect(code).toBe(0);
    expect(out).toContain('0 new table(s) checked');
  });

  it('honours the -- ci:allow-anon-table escape hatch', () => {
    const { code, out } = runGate(`
      -- ci:allow-anon-table scratch table dropped at the end of this migration
      CREATE TABLE public.probe_escape_hatch (id uuid PRIMARY KEY);
    `);
    expect(code).toBe(0);
    expect(out).toContain('ci:allow-anon-table');
  });

  it('accepts a blanket REVOKE ... ON ALL TABLES IN SCHEMA public FROM anon', () => {
    const { code } = runGate(`
      CREATE TABLE public.probe_blanket_a (id uuid PRIMARY KEY);
      CREATE TABLE public.probe_blanket_b (id uuid PRIMARY KEY);
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    `);
    expect(code).toBe(0);
  });
});
