/**
 * GUARD: the salary suggestion rule never reaches the browser except through
 * its two gated server routes.
 *
 * The rule (`hr.salary_suggestion_rule`) holds rupee amounts per year of
 * experience. platform_policies' SELECT policy on main is `auth.uid() IS NOT
 * NULL`, and anything a 'use client' file imports ships in a public
 * /_next/static chunk. So the Suggest panel reads a worked-out suggestion from
 * GET /api/hr/payroll/salary-suggestions (hr.payroll.salary.view, scoped per
 * college in the database), and the editor reads and saves through
 * /api/hr/payroll/salary-suggestion-rule (super admins only). This fails if:
 *
 *   1. any 'use client' file imports either server-side suggestion service;
 *   2. any 'use client' file names the `hr.salary_suggestion_rule` key in code;
 *   3. the panel's or the editor's own files query platform_policies or build a
 *      browser Supabase client;
 *   4. either service loses its `import 'server-only'`, or a hook stops going
 *      through its route.
 *
 * Comments are stripped before scanning, so explaining the rule in a comment is
 * not a violation.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-server-only-guard.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'providers'];

/** The client files of this feature. They may reach the rule only through a route. */
const FEATURE_CLIENT_FILES = [
  'app/(routes)/hr/payroll/salaries/_components/salary-suggestion-sheet.tsx',
  'app/(routes)/hr/admin/policies/salary-suggestion/_components/salary-suggestion-rule-editor.tsx',
  'hooks/hr/use-salary-suggestion.ts',
  'hooks/hr/use-salary-suggestion-rule.ts',
];

const SERVICE_FILES = [
  'lib/services/hr/pay-bands/salary-suggestion-service.ts',
  'lib/services/hr/pay-bands/salary-suggestion-rule-service.ts',
];

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

const files: Array<{ path: string; code: string; raw: string }> = [];
for (const d of SCAN_DIRS) {
  const found: string[] = [];
  walk(join(ROOT, d), found);
  for (const f of found) {
    const raw = readFileSync(f, 'utf8');
    files.push({ path: relative(ROOT, f).split(sep).join('/'), code: stripComments(raw), raw });
  }
}
const clientFiles = files.filter((f) => isClientFile(f.code));
const byPath = (p: string) => files.find((f) => f.path === p)!;

const SERVICE_IMPORT = /from\s+['"][^'"]*pay-bands\/salary-suggestion(-rule)?-service['"]/;
const RULE_KEY = /['"`]hr\.salary_suggestion_rule['"`]/;

describe('salary suggestion guard: the rule stays on the server', () => {
  it('found the client files it is meant to police', () => {
    expect(clientFiles.length).toBeGreaterThan(100);
    for (const p of FEATURE_CLIENT_FILES) expect(clientFiles.map((f) => f.path)).toContain(p);
  });

  it('no client file imports a server-side suggestion service', () => {
    expect(clientFiles.filter((f) => SERVICE_IMPORT.test(f.code)).map((f) => f.path)).toEqual([]);
  });

  it('no client file names the rule key', () => {
    expect(clientFiles.filter((f) => RULE_KEY.test(f.code)).map((f) => f.path)).toEqual([]);
  });

  it("the panel's and the editor's own files never read the policy table", () => {
    for (const p of FEATURE_CLIENT_FILES) {
      const { code } = byPath(p);
      expect(code, p).not.toMatch(/platform_policies/);
      expect(code, p).not.toMatch(/createClientSupabaseClient/);
    }
  });

  it("both services are server-only", () => {
    for (const p of SERVICE_FILES) {
      expect(byPath(p).raw, p).toMatch(/^import 'server-only';$/m);
    }
  });

  it('the hooks go through their gated routes', () => {
    expect(byPath('hooks/hr/use-salary-suggestion.ts').code).toMatch(
      /fetch\(\s*`\/api\/hr\/payroll\/salary-suggestions\?staffId=/
    );
    expect(byPath('hooks/hr/use-salary-suggestion-rule.ts').code).toMatch(
      /fetch\(\s*['"]\/api\/hr\/payroll\/salary-suggestion-rule['"]/
    );
  });

  it('the suggestion route is gated on the salary key and refuses API keys', () => {
    const route = byPath('app/api/hr/payroll/salary-suggestions/route.ts').code;
    expect(route).toMatch(/requirePermission:\s*'hr\.payroll\.salary\.view'/);
    expect(route).toMatch(/allowApiKey:\s*false/);
    expect(route).not.toMatch(/createServiceRoleClient|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  });
});
