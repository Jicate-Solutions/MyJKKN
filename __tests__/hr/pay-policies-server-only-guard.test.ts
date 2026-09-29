/**
 * GUARD: the pay policy rows never reach the browser except through a gated route.
 *
 * `hr.pay_scales` and `hr.allowances_and_increments` are every college's pay
 * matrix and allowance amounts. Migration 20270506090000 restricts them at the
 * database to admins and holders of `hr.payroll.salary.view`, and the screens
 * that show them read through GET /api/hr/compensation-policies (or, for the
 * Pay Band Check and Annual Increments screens, their own gated routes).
 *
 * A browser read of those rows would either leak again (if the database rule is
 * ever loosened) or show an empty screen to a person the route would have
 * refused out loud. So this test fails if any 'use client' file that names one
 * of the two keys also:
 *   1. starts a READ of platform_policies or hr_policy_audit_log
 *      (`.from(<table>).select(`) — saving through `.from(<table>).update(` is
 *      the editors' existing write path and stays allowed;
 *   2. calls an fn_get_policy* RPC;
 *   3. imports the server-side reader.
 * And it checks that the editors' hook fetches the gated route.
 *
 * Comments are stripped before scanning, so explaining the rule in a comment is
 * not a violation.
 *
 * Run: npx vitest run __tests__/hr/pay-policies-server-only-guard.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'providers'];
const HOOK = 'hooks/admin/use-hr-compensation-policies.ts';
const ROUTE = 'app/api/hr/compensation-policies/route.ts';

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

const PAY_KEY = /['"`]hr\.(pay_scales|allowances_and_increments)['"`]/;
/** A read chain on either table, by literal name or by a *_TABLE constant. */
const TABLE_READ =
  /\.from\(\s*(['"`](platform_policies|hr_policy_audit_log)['"`]|[A-Z_]*POLICIES_TABLE|[A-Z_]*AUDIT_LOG_TABLE)\s*\)\s*\.select\(/;
const POLICY_RPC = /\.rpc\(\s*['"`]fn_get_policy[a-z_]*['"`]/;
const SERVER_READER_IMPORT = /from\s+['"][^'"]*compensation-policies\/compensation-policy-read-service['"]/;

describe('pay policy guard: the pay rows stay on the server', () => {
  it('found the client files it is meant to police', () => {
    // A scanner that finds nothing passes everything.
    expect(clientFiles.length).toBeGreaterThan(100);
    expect(clientFiles.map((f) => f.path)).toContain(HOOK);
  });

  it('no client file that names a pay key reads the policy tables from the browser', () => {
    const offenders = clientFiles
      .filter((f) => PAY_KEY.test(f.code) && TABLE_READ.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('no client file that names a pay key calls an fn_get_policy RPC', () => {
    const offenders = clientFiles
      .filter((f) => PAY_KEY.test(f.code) && POLICY_RPC.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('no client file imports the server-side reader', () => {
    const offenders = clientFiles.filter((f) => SERVER_READER_IMPORT.test(f.code)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the editors' hook reads through the gated route", () => {
    const hook = files.find((f) => f.path === HOOK)!.code;
    expect(hook).toMatch(/fetch\(\s*`\/api\/hr\/compensation-policies\?/);
    expect(hook).not.toMatch(TABLE_READ);
  });

  it('the server reader goes through the college-scoped database function, not the table', () => {
    const service = files.find(
      (f) => f.path === 'lib/services/hr/compensation-policies/compensation-policy-read-service.ts',
    )!.code;
    expect(service).toMatch(/\.rpc\(\s*COMPENSATION_POLICY_RPC/);
    expect(service).toMatch(/COMPENSATION_POLICY_RPC = 'hr_compensation_policies'/);
    expect(service).not.toMatch(TABLE_READ);
  });

  it('the route checks the salary key and refuses API keys', () => {
    const route = files.find((f) => f.path === ROUTE)!.code;
    expect(isClientFile(route)).toBe(false);
    expect(route).toMatch(/requirePermission:\s*['"]hr\.payroll\.salary\.view['"]/);
    expect(route).toMatch(/allowApiKey:\s*false/);
  });
});
