/**
 * GUARD: the pay matrix never reaches the browser except through the gated route.
 *
 * platform_policies' SELECT policy is `auth.uid() IS NOT NULL`, so a browser
 * query for `hr.pay_scales` hands every college's pay matrix to any signed-in
 * account — a learner included. And anything a 'use client' file imports ships
 * in a public /_next/static chunk, whatever guard the page shows on screen. So
 * the only safe path is GET /api/hr/payroll/pay-bands, which checks
 * `hr.payroll.salary.view` on the server. This test fails if:
 *
 *   1. any 'use client' file imports the server-side band service, or a test
 *      fixture of band figures;
 *   2. the Pay Band Check screen's own files query platform_policies, name the
 *      `hr.pay_scales` key, or build a browser Supabase client;
 *   3. any NEW 'use client' file names the `hr.pay_scales` key in code. The one
 *      client reader that predates this guard (the Pay Scales editor's hook) is
 *      listed by name, so the list can only shrink.
 *
 * Comments are stripped before scanning, so explaining the rule in a comment is
 * not a violation.
 *
 * Run: npx vitest run __tests__/hr/pay-band-server-only-guard.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'providers'];

/** The screen's own client files. They may reach the bands only through the route. */
const SCREEN_FILES = [
  'app/(routes)/hr/payroll/pay-band-check/page.tsx',
  'hooks/hr/use-pay-band-policies.ts',
];

/**
 * Client files that named `hr.pay_scales` before this guard existed. Out of this
 * PR's scope (the Pay Scales editor is a separate screen) — listed so that a new
 * one fails, not so that this one is endorsed.
 */
const PRE_EXISTING_CLIENT_READERS = new Set(['hooks/admin/use-hr-compensation-policies.ts']);

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/\s.*$/gm, '');
}

function isClientFile(code: string): boolean {
  return /^\s*['"]use client['"]/.test(code);
}

const files: Array<{ path: string; code: string }> = [];
for (const d of SCAN_DIRS) {
  const found: string[] = [];
  walk(join(ROOT, d), found);
  for (const f of found) {
    files.push({
      path: relative(ROOT, f).split(sep).join('/'),
      code: stripComments(readFileSync(f, 'utf8')),
    });
  }
}
const clientFiles = files.filter((f) => isClientFile(f.code));

const SERVICE_IMPORT = /from\s+['"][^'"]*pay-bands\/pay-band-policy-service['"]/;
const FIXTURE_IMPORT = /from\s+['"][^'"]*pay-band-check\.bands\.json['"]/;
const PAY_SCALES_KEY = /['"`]hr\.pay_scales['"`]/;

describe('pay band guard: the matrix stays on the server', () => {
  it('found the client files it is meant to police', () => {
    // A scanner that finds nothing passes everything.
    expect(clientFiles.length).toBeGreaterThan(100);
    for (const p of SCREEN_FILES) {
      expect(clientFiles.map((f) => f.path)).toContain(p);
    }
  });

  it('no client file imports the server-side band service', () => {
    const offenders = clientFiles.filter((f) => SERVICE_IMPORT.test(f.code)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('no client file imports a fixture of band figures', () => {
    const offenders = clientFiles.filter((f) => FIXTURE_IMPORT.test(f.code)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('the Pay Band Check screen never reads the bands from the browser', () => {
    for (const p of SCREEN_FILES) {
      const { code } = files.find((f) => f.path === p)!;
      expect(code, p).not.toMatch(/platform_policies/);
      expect(code, p).not.toMatch(PAY_SCALES_KEY);
      expect(code, p).not.toMatch(/createClientSupabaseClient/);
      expect(code, p).not.toMatch(SERVICE_IMPORT);
    }
  });

  it('the screen fetches the gated route, and only when the caller may view', () => {
    const hook = files.find((f) => f.path === 'hooks/hr/use-pay-band-policies.ts')!.code;
    expect(hook).toMatch(/fetch\(\s*['"]\/api\/hr\/payroll\/pay-bands['"]/);
    expect(hook).toMatch(/enabled:\s*options\.enabled/);

    const page = files.find((f) => f.path === SCREEN_FILES[0])!.code;
    expect(page).toMatch(/usePayBandPolicies\(\{\s*enabled:\s*canView\s*\}\)/);
  });

  it('no new client file names the hr.pay_scales key in code', () => {
    const offenders = clientFiles
      .filter((f) => PAY_SCALES_KEY.test(f.code))
      .map((f) => f.path)
      .filter((p) => !PRE_EXISTING_CLIENT_READERS.has(p));
    expect(offenders).toEqual([]);
  });

  it('the band service is server-only and reads through the scoped database function', () => {
    const service = files.find(
      (f) => f.path === 'lib/services/hr/pay-bands/pay-band-policy-service.ts'
    )!.code;
    // A client bundle that reaches this file then fails to build, barrel or not.
    expect(service).toMatch(/^\s*import\s+['"]server-only['"];/);
    // The table's SELECT policy admits anyone signed in, so a direct read
    // would return every college; the function scopes by college.
    expect(service).not.toMatch(/\.from\(\s*['"]platform_policies['"]/);
    expect(service).toMatch(/PAY_BAND_RPC\s*=\s*['"]hr_pay_band_policies['"]/);
  });

  it('the database function checks the key, scopes by college as the caller, and is closed to anon', () => {
    const sql = readFileSync(
      join(ROOT, 'supabase/migrations/20270416120000_hr_pay_band_policies_rpc.sql'),
      'utf8'
    )
      .replace(/--.*$/gm, '')
      .replace(/\s+/g, ' ');
    expect(sql).toMatch(/user_has_permission\('hr\.payroll\.salary\.view'\)/);
    expect(sql).toMatch(/AND public\.role_has_institution_access\(pp\.scope_id\)/);
    expect(sql).toMatch(/pp\.scope_id IS NOT NULL/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.hr_pay_band_policies\(\) FROM anon, PUBLIC;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.hr_pay_band_policies\(\) TO authenticated;/);
  });

  it('the route that serves the bands checks the salary key and refuses API keys', () => {
    const route = files.find((f) => f.path === 'app/api/hr/payroll/pay-bands/route.ts')!.code;
    expect(isClientFile(route)).toBe(false);
    expect(route).toMatch(/requirePermission:\s*['"]hr\.payroll\.salary\.view['"]/);
    expect(route).toMatch(/allowApiKey:\s*false/);
  });
});
