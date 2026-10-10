/**
 * GUARD: the band and the Director's amounts never reach the browser through
 * the candidate's suggested salary.
 *
 * Anything a 'use client' file imports ships in a public /_next/static chunk,
 * and platform_policies' rows are rupee figures. So the Propose Package box
 * reads a worked-out suggestion from
 * GET /api/hr/recruitment/candidates/<id>/salary-suggestion only. This fails if:
 *   1. any 'use client' file imports the candidate suggestion service;
 *   2. the box, the details editor or their hook read platform_policies, name a
 *      pay key, call the RPC, or build a browser Supabase client;
 *   3. the service loses its `import 'server-only'`;
 *   4. the hook stops going through the gated route, or the route stops
 *      checking hr.payroll.salary.view or starts using a service-role client.
 *
 * Comments are stripped before scanning.
 *
 * Run: npx vitest run __tests__/hr/candidate-salary-suggestion-server-only-guard.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'providers'];

const FEATURE_CLIENT_FILES = [
  'app/(routes)/hr/recruitment/candidates/[id]/_components/candidate-salary-suggestion-box.tsx',
  'app/(routes)/hr/recruitment/candidates/[id]/_components/candidate-salary-details.tsx',
  'app/(routes)/hr/recruitment/candidates/[id]/page.tsx',
  'hooks/hr/use-candidate-salary-suggestion.ts',
];
const SERVICE_FILE = 'lib/services/hr/pay-bands/candidate-salary-suggestion-service.ts';
const ROUTE_FILE = 'lib/api/hr/recruitment/candidates/handlers/salary-suggestion.ts';

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
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/\s.*$/gm, '');
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
const clientFiles = files.filter((f) => /^\s*['"]use client['"]/.test(f.code));
const byPath = (p: string) => {
  const f = files.find((x) => x.path === p);
  if (!f) throw new Error(`missing ${p}`);
  return f;
};

describe('candidate salary suggestion guard: band and rule stay on the server', () => {
  it('found the client files it is meant to police', () => {
    for (const p of FEATURE_CLIENT_FILES) expect(clientFiles.map((f) => f.path)).toContain(p);
  });

  it('no client file imports the candidate suggestion service', () => {
    const IMPORT = /from\s+['"][^'"]*pay-bands\/candidate-salary-suggestion-service['"]/;
    expect(clientFiles.filter((f) => IMPORT.test(f.code)).map((f) => f.path)).toEqual([]);
  });

  it("the feature's client files never read pay data directly", () => {
    for (const p of FEATURE_CLIENT_FILES) {
      const { code } = byPath(p);
      expect(code, p).not.toMatch(/platform_policies/);
      expect(code, p).not.toMatch(/['"`]hr\.(pay_scales|salary_suggestion_rule)['"`]/);
      expect(code, p).not.toMatch(/hr_candidate_salary_suggestion_inputs|hr_pay_band_policies/);
    }
    for (const p of FEATURE_CLIENT_FILES.filter((x) => !x.endsWith('page.tsx'))) {
      expect(byPath(p).code, p).not.toMatch(/createClientSupabaseClient/);
    }
  });

  it('the service is server-only', () => {
    expect(byPath(SERVICE_FILE).raw).toMatch(/^import 'server-only';$/m);
  });

  it('the hook goes through the gated route', () => {
    const hook = byPath('hooks/hr/use-candidate-salary-suggestion.ts').code;
    expect(hook).toMatch(/\/salary-suggestion`/);
    expect(hook).toMatch(/\/api\/hr\/recruitment\/candidates\//);
  });

  it('the route checks hr.payroll.salary.view and never uses a service-role client', () => {
    const route = byPath(ROUTE_FILE).code;
    expect(route).toMatch(/REQUIRED_KEY = 'hr\.payroll\.salary\.view'/);
    expect(route).toMatch(/holds\(supabase, REQUIRED_KEY\)/);
    expect(route).not.toMatch(/createServiceRoleClient|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  });
});
