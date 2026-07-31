/**
 * Regression tests for scripts/ci/check-anon-exposure-live.mjs.
 *
 * A security gate that is not itself tested is a gate that quietly stops gating.
 * These drive the real script as a subprocess against fixture rows (--fixture)
 * and a fixture allow-list (--allowlist), so the decision logic is exercised
 * without production credentials, and assert on the exit code — the only signal
 * a scheduled run actually reports.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-anon-exposure-live.mjs');

let dir: string;

type Row = {
  name: string;
  kind: string;
  rls_on: boolean;
  rows: number;
  identity_cols: string;
};

type Entry = {
  name: string;
  status: 'approved' | 'grandfathered';
  rows_at_grandfather?: number;
  reason: string;
};

function run(rows: Row[], relations: Entry[], extra: string[] = []): { code: number; out: string } {
  const rowsFile = path.join(dir, `rows-${Math.random().toString(36).slice(2)}.json`);
  const allowFile = path.join(dir, `allow-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(rowsFile, JSON.stringify(rows), 'utf8');
  writeFileSync(allowFile, JSON.stringify({ relations }), 'utf8');
  // spawnSync, not execFileSync: findings are written to stderr (correctly), and
  // execFileSync surfaces stderr only when the process EXITS NON-ZERO. Under
  // --report-only the script exits 0 on purpose, so the finding detail would be
  // invisible to the test — which is exactly what the first run of these tests
  // reported. spawnSync returns both streams regardless of exit code.
  const r = spawnSync(
    'node',
    [SCRIPT, '--fixture', rowsFile, '--allowlist', allowFile, ...extra],
    { encoding: 'utf8' },
  );
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const row = (over: Partial<Row> & { name: string }): Row => ({
  kind: 'r', rls_on: false, rows: 0, identity_cols: '', ...over,
});

type Fn = { name: string; args: string; writes_data: boolean; has_guard: boolean };
type FnEntry = { name: string; status: 'approved' | 'grandfathered'; writes_data?: boolean; reason: string };

/** Drive the FUNCTION half: fixture functions + fixture function allow-list. */
function runFns(fns: Fn[], entries: FnEntry[], extra: string[] = []): { code: number; out: string } {
  const rowsFile = path.join(dir, `rows-${Math.random().toString(36).slice(2)}.json`);
  const allowFile = path.join(dir, `allow-${Math.random().toString(36).slice(2)}.json`);
  const fnFile = path.join(dir, `fns-${Math.random().toString(36).slice(2)}.json`);
  const fnAllowFile = path.join(dir, `fnallow-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(rowsFile, '[]', 'utf8');
  writeFileSync(allowFile, JSON.stringify({ relations: [] }), 'utf8');
  writeFileSync(fnFile, JSON.stringify(fns), 'utf8');
  writeFileSync(fnAllowFile, JSON.stringify({ functions: entries }), 'utf8');
  const r = spawnSync('node', [SCRIPT,
    '--fixture', rowsFile, '--allowlist', allowFile,
    '--fn-fixture', fnFile, '--fn-allowlist', fnAllowFile, ...extra], { encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const fn = (over: Partial<Fn> & { name: string }): Fn => ({
  args: 'p_id uuid', writes_data: false, has_guard: false, ...over,
});

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'anon-exposure-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('check-anon-exposure-live gate', () => {
  it('FAILS on a relation nobody approved — the shape of every recent leak', () => {
    const { code, out } = run(
      [row({ name: '_bak_hostel_to_dayscholar_20260729', rows: 21, identity_cols: 'learner_name,college_email,roll_number' })],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('_bak_hostel_to_dayscholar_20260729');
    expect(out).toContain('nobody approved');
  });

  it('PASSES an approved relation silently', () => {
    const { code } = run(
      [row({ name: 'castes', rows: 1069 })],
      [{ name: 'castes', status: 'approved', reason: 'unauthenticated admission intake' }],
    );
    expect(code).toBe(0);
  });

  it('WARNS but does NOT fail a quiet grandfathered relation', () => {
    const { code, out } = run(
      [row({ name: 'project_statuses', rows: 7 })],
      [{ name: 'project_statuses', status: 'grandfathered', rows_at_grandfather: 7, reason: 'lookup' }],
    );
    expect(code).toBe(0);
    expect(out).toContain('grandfathered');
  });

  it('TRIPWIRE: fails when a grandfathered relation with identity columns gains rows', () => {
    // pde_certificates is empty today and carries learner_id. A flat allow-list
    // would bless it forever; the first certificate issued must break the build.
    const { code, out } = run(
      [row({ name: 'pde_certificates', rows: 1, identity_cols: 'learner_id' })],
      [{ name: 'pde_certificates', status: 'grandfathered', rows_at_grandfather: 0, reason: 'empty at grandfathering' }],
    );
    expect(code).toBe(1);
    expect(out).toContain('pde_certificates');
    expect(out).toContain('0 → 1 rows');
  });

  it('does NOT trip when a grandfathered relation gains rows but has NO identity column', () => {
    // A lookup table growing is ordinary work, not a leak. Crying wolf here is
    // how a gate gets switched off.
    const { code } = run(
      [row({ name: 'project_labels', rows: 9 })],
      [{ name: 'project_labels', status: 'grandfathered', rows_at_grandfather: 4, reason: 'lookup' }],
    );
    expect(code).toBe(0);
  });

  it('catches an exposed VIEW, not just tables', () => {
    // A view is not covered by the underlying table's RLS: unless it is
    // security_invoker it runs as its owner and republishes protected rows.
    //
    // NOTE: this test passed for two days while the sweep could not see a single
    // view. It proves the CLASSIFIER handles a view row; it cannot prove the
    // QUERY ever produces one, because --fixture replaces the query. The SQL-level
    // suite below is what closes that gap. Left in place deliberately, as the
    // example of a green test that guaranteed less than its name implied.
    const { code, out } = run(
      [row({ name: 'leaky_learner_view', kind: 'v', rls_on: false, rows: 500, identity_cols: 'full_name,email' })],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('leaky_learner_view');
    expect(out).toContain('view');
  });

  it('tells you to REVOKE a view, and does NOT tell you to enable RLS on it', () => {
    // The remediation differs by kind and the wrong one is worse than none:
    // PostgreSQL rejects a row-level policy on a view outright, so somebody who
    // follows table advice writes a migration that errors — or "fixes" it by
    // dropping the statement — and the exposure stays open, now with a ticket
    // closed against it.
    const { code, out } = run(
      [row({ name: 'v_learner_hostelites', kind: 'v', rows: 719, identity_cols: 'full_name,email,father_name' })],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('REVOKE ALL ON public.v_learner_hostelites FROM anon, PUBLIC');
    expect(out).not.toContain('ALTER TABLE public.v_learner_hostelites ENABLE ROW LEVEL SECURITY');
  });

  it('gives table advice for a table and view advice for a view in the same run', () => {
    const { code, out } = run(
      [
        row({ name: 'some_leaky_table', kind: 'r', rows: 21, identity_cols: 'roll_number' }),
        row({ name: 'some_leaky_view', kind: 'v', rows: 7226, identity_cols: 'email' }),
      ],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('ALTER TABLE public.some_leaky_table ENABLE ROW LEVEL SECURITY');
    expect(out).toContain('REVOKE ALL ON public.some_leaky_view FROM anon, PUBLIC');
    expect(out).toContain('1 table(s), 1 view/matview(s)');
  });

  it('counts a MATERIALIZED VIEW as a view, not as a table', () => {
    const { code, out } = run(
      [row({ name: 'mv_learner_attendance_summary', kind: 'm', rows: 4551, identity_cols: 'learner_id' })],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('materialized view');
    expect(out).toContain('0 table(s), 1 view/matview(s)');
  });
  it('catches a Shape-B relation — RLS ON but defeated by a TO public USING(true) policy', () => {
    const { code, out } = run(
      [row({ name: 'event_external_participants', rls_on: true, rows: 9, identity_cols: 'full_name,phone' })],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('event_external_participants');
    expect(out).toContain('RLS on');
  });

  it('reports a stale allow-list entry whose relation is no longer exposed', () => {
    // Left behind, the entry pre-approves the NAME — a future relation created
    // with the same name would be blessed without review.
    const { code, out } = run(
      [],
      [{ name: 'hr_leave_applications_backup_20260728', status: 'grandfathered', rows_at_grandfather: 230, reason: 'locked since' }],
    );
    expect(code).toBe(0);
    expect(out).toContain('no longer exposed');
    expect(out).toContain('hr_leave_applications_backup_20260728');
  });

  it('--report-only prints findings but exits 0', () => {
    const { code, out } = run(
      [row({ name: 'brand_new_leak', rows: 5 })],
      [],
      ['--report-only'],
    );
    expect(code).toBe(0);
    expect(out).toContain('brand_new_leak');
    expect(out).toContain('would have failed');
  });

  it('exits 1 on HALF-configured Management API credentials', () => {
    // A token without a project ref is the easy way to end up with a job that
    // runs, prints nothing alarming, and inspects nothing. Both halves or refuse.
    let code = 0;
    try {
      execFileSync('node', [SCRIPT], {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, SUPABASE_DB_URL: '', SUPABASE_ACCESS_TOKEN: 'tok', SUPABASE_PROJECT_REF: '' },
      });
    } catch (e: unknown) {
      code = (e as { status?: number }).status ?? 1;
    }
    expect(code).toBe(1);
  });

  it('exits 1 — never 0 — when no credentials and no fixture are supplied', () => {
    // A credential-less run that "passes" is the exact failure this gate exists
    // to prevent: silence that looks like safety.
    let code = 0;
    try {
      execFileSync('node', [SCRIPT], {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, SUPABASE_DB_URL: '' },
      });
    } catch (e: unknown) {
      code = (e as { status?: number }).status ?? 1;
    }
    expect(code).toBe(1);
  });

  // --- function half ---------------------------------------------------------

  it('FAILS an anon-executable SECDEF function nobody approved', () => {
    // The real 2026-07-30 shape: caller-supplied scope id, no guard, SECDEF.
    const { code, out } = runFns(
      [fn({ name: 'fn_hostel_unallocated_candidates', args: 'p_institution_id uuid' })],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('fn_hostel_unallocated_candidates');
    expect(out).toContain('no guard');
  });

  it('PASSES an approved public function silently', () => {
    const { code } = runFns(
      [fn({ name: 'fn_get_active_poll', args: 'p_slug text' })],
      [{ name: 'fn_get_active_poll', status: 'approved', reason: 'public poll by slug' }],
    );
    expect(code).toBe(0);
  });

  it('ESCALATES a grandfathered function that WRITES with no permission check', () => {
    const { code, out } = runFns(
      [fn({ name: 'fn_wipe_things', writes_data: true, has_guard: false })],
      [{ name: 'fn_wipe_things', status: 'grandfathered', reason: 'never ruled on' }],
    );
    expect(code).toBe(1);
    expect(out).toContain('fn_wipe_things');
    expect(out).toContain('WRITE');
  });

  it('does NOT escalate a grandfathered writer that HAS a permission check', () => {
    // generate_hr_leave_balances raises on user_has_permission() before touching a
    // row. Failing on it would make the gate permanently red for a safe function,
    // and a permanently red gate gets ignored.
    const { code } = runFns(
      [fn({ name: 'generate_hr_leave_balances', writes_data: true, has_guard: true })],
      [{ name: 'generate_hr_leave_balances', status: 'grandfathered', reason: 'guarded' }],
    );
    expect(code).toBe(0);
  });

  it('reports a stale function entry that is no longer anon-executable', () => {
    const { code, out } = runFns(
      [],
      [{ name: 'fn_hostel_unallocated_candidates', status: 'grandfathered', reason: 'locked 2026-07-30' }],
    );
    expect(code).toBe(0);
    expect(out).toContain('no longer anon-executable');
  });

  it('does NOT query live functions during a relations-only fixture run', () => {
    // A fixture of table rows says nothing about functions; reaching out to live
    // state mid-test would mix production into a unit test.
    const { code, out } = run([row({ name: 'castes', rows: 1069 })],
      [{ name: 'castes', status: 'approved', reason: 'admission intake' }]);
    expect(code).toBe(0);
    expect(out).toContain('0 executable by the anon key');
  });
});


/**
 * SQL-LEVEL REGRESSION SUITE — the tests that would have caught the real bug.
 *
 * Everything above drives the script with --fixture, which substitutes rows for
 * the database. That boundary sits BETWEEN the query and the classifier, so no
 * fixture test can observe the query at all: if EXPOSURE_SQL returned nothing
 * forever, every test above would still be green. That is not hypothetical — it
 * is what happened. Between 2026-07-29 and 2026-07-31 the qualifying clause
 * admitted a relation only when it was a TABLE with RLS off, or when it had an
 * RLS POLICY granted TO public. A view is neither and can never be either:
 * PostgreSQL does not permit an RLS policy on a view or a materialized view. So
 * views were excluded by construction while the suite reported them covered, and
 * the live sweep printed 4 relations and a green tick while 34 views were
 * serving rows to unauthenticated callers — 7,226 learner/staff profiles among
 * them.
 *
 * These assert against the SQL the script ACTUALLY RUNS (via --print-sql) rather
 * than against a copy, so they cannot drift from it.
 */
describe('check-anon-exposure-live EXPOSURE_SQL — the query itself', () => {
  const sql = (): string => {
    const r = spawnSync('node', [SCRIPT, '--print-sql'], { encoding: 'utf8' });
    expect(r.status, `--print-sql failed: ${r.stderr}`).toBe(0);
    return r.stdout;
  };

  /**
   * Pull out the arms of the qualifying CASE, so an assertion can talk about the
   * grant-only branch specifically instead of about the whole query. Matching the
   * whole query would pass on a SQL that mentions views anywhere at all — which
   * the BROKEN query did, in its relkind IN ('r','v','m') filter. That filter is
   * exactly what made the bug look absent: the word "view" was present and the
   * capability was not.
   */
  const caseArms = (text: string): string[] =>
    text
      .slice(text.indexOf('CASE'), text.indexOf('END AS shape'))
      .split(/\bWHEN\b/)
      .slice(1);

  it('has a qualifying arm that admits a view/matview', () => {
    const arms = caseArms(sql());
    expect(arms.length).toBeGreaterThan(0);
    const grantOnly = arms.filter((a) => a.includes('grant-only'));
    expect(grantOnly, 'no CASE arm yields the grant-only shape').toHaveLength(1);
    expect(grantOnly[0]).toMatch(/relkind\s+IN\s*\(\s*'v'\s*,\s*'m'\s*\)/);
  });

  it('REGRESSION: the view arm must not depend on RLS state in any form', () => {
    // This is the whole defect in one assertion. A view carries no RLS and no
    // policy, so any RLS reasoning in this arm silently reduces it to FALSE and
    // the sweep goes blind again — passing, reporting nothing, looking healthy.
    const [grantOnly] = caseArms(sql()).filter((a) => a.includes('grant-only'));
    expect(grantOnly).toBeDefined();
    expect(grantOnly).not.toMatch(/relrowsecurity/);
    expect(grantOnly).not.toMatch(/pg_policies/);
    expect(grantOnly).not.toMatch(/relkind\s*=\s*'r'/);
  });

  it('REGRESSION: the view arm is tested BEFORE the RLS arms', () => {
    // CASE returns the first matching arm. If an RLS arm were ordered first it
    // could never match a view — but the ordering is what makes that reasoning
    // hold, so it is asserted rather than assumed.
    const arms = caseArms(sql());
    const iGrantOnly = arms.findIndex((a) => a.includes('grant-only'));
    const iRlsOff = arms.findIndex((a) => a.includes('rls-off'));
    const iPolicy = arms.findIndex((a) => a.includes('permissive-policy'));
    expect(iGrantOnly).toBeGreaterThanOrEqual(0);
    expect(iGrantOnly).toBeLessThan(iRlsOff);
    expect(iGrantOnly).toBeLessThan(iPolicy);
  });

  it('still selects views and matviews into the candidate set at all', () => {
    // The narrower failure that would defeat every assertion above: drop 'v'/'m'
    // from the relkind filter and the grant-only arm becomes unreachable while
    // still reading perfectly.
    expect(sql()).toMatch(/relkind\s+IN\s*\(\s*'r'\s*,\s*'v'\s*,\s*'m'\s*\)/);
  });

  it('still qualifies tables both ways — the fix must not regress table detection', () => {
    const arms = caseArms(sql());
    const rlsOff = arms.find((a) => a.includes('rls-off'));
    const policy = arms.find((a) => a.includes('permissive-policy'));
    expect(rlsOff).toMatch(/relrowsecurity\s*=\s*false/);
    expect(policy).toMatch(/pg_policies/);
    expect(policy).toMatch(/'public'\s*=\s*ANY\(p\.roles\)/);
  });

  it('requires the anon SELECT grant by OID, not by name', () => {
    // The text form of has_table_privilege resolves through search_path and dies
    // on a same-named relation in another schema (hit live on
    // storage.s3_multipart_uploads).
    expect(sql()).toMatch(/has_table_privilege\(\s*'anon'\s*,\s*c\.oid\s*,\s*'SELECT'\s*\)/);
  });

  it('does not count rows on an unpopulated materialized view', () => {
    // count(*) on one raises "has not been populated", and query_to_xml
    // propagates it — aborting the entire sweep. Matviews only began reaching
    // this count when the grant-only arm was added.
    expect(sql()).toMatch(/relispopulated/);
  });});
