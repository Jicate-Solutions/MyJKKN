/**
 * Regression tests for scripts/ci/check-ungrantable-permissions.mjs.
 *
 * A gate that is not itself tested is a gate that quietly stops gating — and this
 * one has a specific way of stopping: its SQL scanner. Scan too naively and it
 * reports keys named `<key>` from header comments, and people switch it off. Scan
 * too defensively — skipping dollar-quoted bodies and string literals — and it
 * reports NOTHING, which is indistinguishable from reporting safety.
 *
 * So every test here drives the REAL script as a subprocess against a fixture
 * repo tree (--root) and asserts on the exit code, because the exit code is the
 * only signal CI actually reads.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-ungrantable-permissions.mjs');

let root: string;
const created: string[] = [];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'ungrantable-'));
  created.push(root);
});

afterAll(() => {
  for (const d of created) rmSync(d, { recursive: true, force: true });
});

/**
 * Write a PERMISSION_CATEGORIES file containing these keys plus a sentinel.
 *
 * The sentinel is not decoration. The script refuses to run against a registry
 * that parses to zero keys — otherwise every demand would look ungrantable, and a
 * future refactor of permissions.ts would make every demand look fine. A fixture
 * registering nothing hits that guard and fails for the wrong reason, so all of
 * them register one key that no fixture ever demands.
 */
function registry(keys: string[]) {
  const perms = [...keys, 'fixture.sentinel.view']
    .map((k) => `      { key: '${k}', label: '${k}' },`).join('\n');
  const file = path.join(root, 'lib/constants/permissions.ts');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `export const PERMISSION_CATEGORIES = [\n  {\n    name: 'Fixture',\n    key: 'fixture',\n    permissions: [\n${perms}\n    ],\n  },\n];\n`,
    'utf8',
  );
}

function migration(name: string, sql: string) {
  const file = path.join(root, 'supabase/migrations', name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, sql, 'utf8');
}

function appFile(relPath: string, source: string) {
  const file = path.join(root, 'app', relPath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source, 'utf8');
}

function menu(entries: Record<string, string | null>) {
  const body = Object.entries(entries)
    .map(([route, key]) => `  '${route}': ${key === null ? 'null' : `'${key}'`},`)
    .join('\n');
  const file = path.join(root, 'lib/sidebarMenuLink.ts');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `type MenuPermissions = Record<string, string | null>;\nexport const MENU_PERMISSIONS: MenuPermissions = {\n${body}\n};\n`,
    'utf8',
  );
}

function baseline(keys: string[]) {
  const file = path.join(root, 'baseline.json');
  writeFileSync(file, JSON.stringify({ ungrantable: keys.map((key) => ({ key })) }), 'utf8');
  return file;
}

type Run = { code: number; out: string; json: any };

function run(extra: string[] = [], env: Record<string, string | undefined> = {}): Run {
  // spawnSync, not execFileSync: findings print to stdout and the script exits 0
  // under --report-only, so execFileSync would hide exactly the output a
  // report-only assertion needs.
  const r = spawnSync('node', [SCRIPT, '--root', root, '--no-baseline', ...extra], {
    encoding: 'utf8',
    // Strip inherited Supabase credentials: a developer running the suite on a
    // machine that happens to hold them must get the same result as CI.
    env: { ...process.env, SUPABASE_DB_URL: '', SUPABASE_ACCESS_TOKEN: '', SUPABASE_PROJECT_REF: '', ...env },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  let json: any = null;
  if (extra.includes('--json')) {
    try { json = JSON.parse(r.stdout ?? ''); } catch { json = null; }
  }
  return { code: r.status ?? 1, out, json };
}

/* ── the failure class this exists for ─────────────────────────────────────── */

describe('detects a key demanded by an RLS policy but registered nowhere', () => {
  it('flags the confirmed accreditation.evidence.* shape', () => {
    registry(['accreditation.naac.narrative.view']);
    migration('20260801000000_qem_policies.sql', `
      CREATE POLICY qem_select ON public.quality_evidence_mappings
        FOR SELECT USING (
          is_super_admin() OR is_admin()
          OR (SELECT user_has_permission('accreditation.evidence.view'::text))
        );
      CREATE POLICY qem_insert ON public.quality_evidence_mappings
        FOR INSERT WITH CHECK (user_has_permission('accreditation.evidence.create'));
    `);

    const r = run(['--json']);
    expect(r.code).toBe(1);
    const flagged = r.json.ungrantable_new.map((u: any) => u.key);
    expect(flagged).toContain('accreditation.evidence.view');
    expect(flagged).toContain('accreditation.evidence.create');
  });

  it('names the file, so the fix is findable without a grep', () => {
    registry([]);
    migration('20260801000000_qem_policies.sql',
      `CREATE POLICY p ON t USING (user_has_permission('accreditation.evidence.view'));`);

    const r = run(['--json']);
    expect(r.json.ungrantable_new[0].sources).toContain(
      'supabase/migrations/20260801000000_qem_policies.sql',
    );
  });

  it('passes once the key is registered', () => {
    registry(['accreditation.evidence.view']);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('accreditation.evidence.view'));`);

    expect(run().code).toBe(0);
  });
});

/* ── the two bugs are not the same bug ─────────────────────────────────────── */

describe('UNGRANTABLE and UNGRANTED are reported separately', () => {
  it('a registered key held by no role is NOT ungrantable and does not fail the run', () => {
    registry(['accreditation.naac.narrative.manage']);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('accreditation.naac.narrative.manage'));`);
    const granted = path.join(root, 'granted.json');
    writeFileSync(granted, JSON.stringify([]), 'utf8'); // no role holds anything

    const r = run(['--json', '--live', '--roles-fixture', granted]);
    expect(r.code).toBe(0);
    expect(r.json.ungrantable_new).toHaveLength(0);
    expect(r.json.ungranted).toContain('accreditation.naac.narrative.manage');
  });

  it('a granted key appears in neither list', () => {
    registry(['billing.receipts.create']);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('billing.receipts.create'));`);
    const granted = path.join(root, 'granted.json');
    writeFileSync(granted, JSON.stringify(['billing.receipts.create']), 'utf8');

    const r = run(['--json', '--live', '--roles-fixture', granted]);
    expect(r.code).toBe(0);
    expect(r.json.ungrantable_new).toHaveLength(0);
    expect(r.json.ungranted).toHaveLength(0);
  });

  it('--live without credentials exits 1 rather than reporting a clean sweep', () => {
    registry(['a.b.view']);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('a.b.view'));`);

    const r = run(['--live']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/no way to reach the database/i);
  });

  it('without --live the report says the ungranted check did not run, not that it passed', () => {
    registry(['a.b.view']);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('a.b.view'));`);

    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/UNGRANTED\s+—/);
    expect(r.out).toMatch(/needs --live/);
  });
});

/* ── parser traps: one fixture each ───────────────────────────────────────── */

describe('parser traps', () => {
  it('TRAP 1a — a line comment is prose, not a demand', () => {
    registry([]);
    migration('m.sql', `
      -- Standard policy template:
      --   is_super_admin() OR is_admin() OR user_has_permission('<key>')
      -- e.g. user_has_permission('ghost.from.comment')
      SELECT 1;
    `);

    const r = run(['--json']);
    expect(r.code).toBe(0);
    expect(r.json.ungrantable_new).toHaveLength(0);
    expect(r.json.malformed).toHaveLength(0);
  });

  it('TRAP 1b — a nested block comment is prose too', () => {
    registry([]);
    migration('m.sql', `
      /* outer
         /* inner: user_has_permission('ghost.nested.view') */
         still commented: user_has_permission('ghost.outer.view')
      */
      SELECT 1;
    `);

    const r = run(['--json']);
    expect(r.code).toBe(0);
    expect(r.json.ungrantable_new).toHaveLength(0);
  });

  it('TRAP 2a — a call inside a dollar-quoted body IS a demand (skipping it would be the bug)', () => {
    registry([]);
    migration('m.sql', `
      CREATE OR REPLACE FUNCTION public.fn_guarded()
      RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
        RETURN user_has_permission('inside.dollar.manage');
      END;
      $$;
    `);

    const r = run(['--json']);
    expect(r.code).toBe(1);
    expect(r.json.ungrantable_new.map((u: any) => u.key)).toContain('inside.dollar.manage');
  });

  it('TRAP 2b — a tagged dollar quote behaves the same', () => {
    registry([]);
    migration('m.sql', `
      DO $body$
      BEGIN
        PERFORM user_has_permission('inside.tagged.view');
      END
      $body$;
    `);

    const r = run(['--json']);
    expect(r.json.ungrantable_new.map((u: any) => u.key)).toContain('inside.tagged.view');
  });

  it('TRAP 2c — a comment INSIDE a dollar-quoted body is still a comment', () => {
    registry([]);
    migration('m.sql', `
      CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        -- user_has_permission('ghost.in.body')
        RETURN;
      END;
      $$;
    `);

    const r = run(['--json']);
    expect(r.code).toBe(0);
    expect(r.json.ungrantable_new).toHaveLength(0);
  });

  it('TRAP 3 — dynamic SQL in a string literal IS a demand', () => {
    // Two migrations in this tree do exactly this today. A scanner that treats a
    // literal body as opaque loses both, and loses them silently.
    registry([]);
    migration('m.sql', `
      EXECUTE format('CREATE POLICY p ON %I USING (user_has_permission(''dynamic.key.manage''))', 'some_table');
    `);

    const r = run(['--json']);
    expect(r.code).toBe(1);
    expect(r.json.ungrantable_new.map((u: any) => u.key)).toContain('dynamic.key.manage');
  });

  it('does not confuse a $1 positional parameter with a dollar quote', () => {
    registry([]);
    migration('m.sql', `
      EXECUTE 'SELECT $1' USING x;
      CREATE POLICY p ON t USING (user_has_permission('after.the.param'));
    `);

    const r = run(['--json']);
    expect(r.json.ungrantable_new.map((u: any) => u.key)).toContain('after.the.param');
  });

  it('tolerates the ::text cast form the policies actually use', () => {
    registry([]);
    migration('m.sql', `CREATE POLICY p ON t USING ((SELECT user_has_permission('cast.form.view'::text)));`);

    expect(run(['--json']).json.ungrantable_new.map((u: any) => u.key)).toContain('cast.form.view');
  });

  it('an argument that is not key-shaped is reported as ignored, never as a failure', () => {
    registry([]);
    appFile('api/scoped/route.ts', `export const GET = handler({ requiredPermission: 'read' });`);

    const r = run(['--json']);
    expect(r.code).toBe(0);
    expect(r.json.ungrantable_new).toHaveLength(0);
    expect(r.json.malformed).toContain('read');
  });

  it('accepts the colon-namespaced convention — 22 registered keys use it', () => {
    // The first draft rejected these as malformed, which was not a false positive
    // but a blind spot: an unregistered aiPulse: key would have passed in silence.
    registry([]);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('aiPulse:quiz.author'));`);

    const r = run(['--json']);
    expect(r.code).toBe(1);
    expect(r.json.ungrantable_new.map((u: any) => u.key)).toContain('aiPulse:quiz.author');
  });
});

/* ── the other two sources ────────────────────────────────────────────────── */

describe('sources beyond SQL', () => {
  it('reads MENU_PERMISSIONS values from lib/sidebarMenuLink.ts', () => {
    registry(['users.view']);
    menu({ '/users': 'users.view', '/ghost': 'ghost.menu.view', '/open': null });

    const r = run(['--json']);
    expect(r.code).toBe(1);
    const found = r.json.ungrantable_new.find((u: any) => u.key === 'ghost.menu.view');
    expect(found.sources).toContain('lib/sidebarMenuLink.ts');
  });

  it('reads requiredPermission on a page guard', () => {
    registry([]);
    appFile('(routes)/thing/page.tsx',
      `export default function P() { return <RoutePermissionGuard requiredPermission='page.gate.view' />; }`);

    const r = run(['--json']);
    expect(r.json.ungrantable_new.map((u: any) => u.key)).toContain('page.gate.view');
  });

  it('reads requirePermission on an API route — the 94-call-site shape', () => {
    registry([]);
    appFile('api/thing/route.ts',
      `export const POST = withAuth(handler, { requirePermission: 'api.gate.manage' });`);

    const r = run(['--json']);
    expect(r.json.ungrantable_new.map((u: any) => u.key)).toContain('api.gate.manage');
  });

  it('ignores a permission key mentioned only in a TS comment', () => {
    registry([]);
    appFile('(routes)/thing/page.tsx', [
      `// Permission gate: requiredPermission='ghost.ts.comment'`,
      `/* also permission="ghost.block.comment" */`,
      `export default function P() { return null; }`,
    ].join('\n'));

    const r = run(['--json']);
    expect(r.code).toBe(0);
    expect(r.json.ungrantable_new).toHaveLength(0);
  });

  it('does not fail on baseline keys granted to everyone (view_dashboard)', () => {
    registry([]);
    menu({ '/dashboard': 'view_dashboard' });

    expect(run().code).toBe(0);
  });
});

/* ── the debt ledger ──────────────────────────────────────────────────────── */

describe('baseline', () => {
  it('a baselined key warns but does not fail', () => {
    registry([]);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('old.debt.view'));`);
    const file = baseline(['old.debt.view']);

    const r = spawnSync('node', [SCRIPT, '--root', root, '--baseline', file, '--json'], { encoding: 'utf8' });
    const j = JSON.parse(r.stdout);
    expect(r.status).toBe(0);
    expect(j.ungrantable_new).toHaveLength(0);
    expect(j.ungrantable_baselined).toContain('old.debt.view');
  });

  it('a NEW key still fails even when old debt is baselined', () => {
    registry([]);
    migration('m.sql', `
      CREATE POLICY a ON t USING (user_has_permission('old.debt.view'));
      CREATE POLICY b ON t USING (user_has_permission('brand.new.view'));
    `);
    const file = baseline(['old.debt.view']);

    const r = spawnSync('node', [SCRIPT, '--root', root, '--baseline', file, '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).ungrantable_new.map((u: any) => u.key)).toEqual(['brand.new.view']);
  });

  it('reports a baseline entry that is no longer ungrantable, so the ledger shrinks', () => {
    registry(['now.registered.view']);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('now.registered.view'));`);
    const file = baseline(['now.registered.view']);

    const r = spawnSync('node', [SCRIPT, '--root', root, '--baseline', file, '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).baseline_stale).toContain('now.registered.view');
  });
});

/* ── refusing to report success on nonsense ───────────────────────────────── */

describe('cannot-compare is not a pass', () => {
  it('exits 1 when lib/constants/permissions.ts is missing', () => {
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('a.b.view'));`);

    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/permissions\.ts not found/);
  });

  it('exits 1 when PERMISSION_CATEGORIES parses to zero keys', () => {
    const file = path.join(root, 'lib/constants/permissions.ts');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'export const SOMETHING_ELSE = [];\n', 'utf8');

    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/zero keys/);
  });

  it('--report-only prints the finding and still exits 0', () => {
    registry([]);
    migration('m.sql', `CREATE POLICY p ON t USING (user_has_permission('reported.not.blocked'));`);

    const r = run(['--report-only']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('reported.not.blocked');
  });
});
