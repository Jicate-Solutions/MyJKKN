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
    const { code, out } = run(
      [row({ name: 'leaky_learner_view', kind: 'v', rls_on: false, rows: 500, identity_cols: 'full_name,email' })],
      [],
    );
    expect(code).toBe(1);
    expect(out).toContain('leaky_learner_view');
    expect(out).toContain('view');
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
});
