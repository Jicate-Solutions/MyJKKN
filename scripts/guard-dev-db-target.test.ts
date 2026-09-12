/**
 * Contract tests for scripts/guard-dev-db-target.mjs.
 *
 * The guard's whole job is its EXIT CODE — npm aborts `dev` when the `predev`
 * hook exits non-zero — so these tests run it as a real subprocess and assert
 * the code, not internals.
 *
 * The child env is sanitised down to PATH plus the variables under test. A
 * developer who exports NEXT_PUBLIC_SUPABASE_URL in their shell would otherwise
 * make the "allow" cases fail spuriously, since the guard (correctly) treats a
 * shell export as the highest-precedence source.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GUARD = join(__dirname, 'guard-dev-db-target.mjs');

/** The production project ref the guard refuses. Public — it is the host in NEXT_PUBLIC_SUPABASE_URL. */
const PROD_REF = 'kvizhngldtiuufknvehv';
/** Any non-production ref; this one is the dev project used before the 2026-05-07 repoint. */
const DEV_REF = 'hhprjbgknupaplivtoib';

const url = (ref: string) => `https://${ref}.supabase.co`;

/** Run the guard in a throwaway dir seeded with `files`, and return its exit code. */
function runGuard(
  files: Record<string, string>,
  extraEnv: Record<string, string> = {}
): number {
  const dir = mkdtempSync(join(tmpdir(), 'guard-dev-db-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  const result = spawnSync(process.execPath, [GUARD], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...extraEnv },
  });
  return result.status ?? -1;
}

const BLOCKED = 1;
const ALLOWED = 0;

describe('guard-dev-db-target', () => {
  it('blocks a dev server pointed at the production project', () => {
    const code = runGuard({ '.env.local': `NEXT_PUBLIC_SUPABASE_URL=${url(PROD_REF)}\n` });
    assert.equal(code, BLOCKED);
  });

  it('allows a dev server pointed at a non-production project', () => {
    const code = runGuard({ '.env.local': `NEXT_PUBLIC_SUPABASE_URL=${url(DEV_REF)}\n` });
    assert.equal(code, ALLOWED);
  });

  it('allows production only behind the explicit ALLOW_PROD_DB_IN_DEV opt-in', () => {
    const files = { '.env.local': `NEXT_PUBLIC_SUPABASE_URL=${url(PROD_REF)}\n` };
    assert.equal(runGuard(files), BLOCKED);
    assert.equal(runGuard(files, { ALLOW_PROD_DB_IN_DEV: '1' }), ALLOWED);
  });

  it('blocks when the public URL is safe but another variable reaches production', () => {
    // The realistic near-miss: someone repoints the public URL at staging and
    // forgets the service-role connection string.
    const code = runGuard({
      '.env.local':
        `NEXT_PUBLIC_SUPABASE_URL=${url(DEV_REF)}\n` +
        `DATABASE_URL=postgres://u:p@db.${PROD_REF}.supabase.co:5432/postgres\n`,
    });
    assert.equal(code, BLOCKED);
  });

  it('honours Next.js env precedence: .env.local overrides .env', () => {
    const code = runGuard({
      '.env': `NEXT_PUBLIC_SUPABASE_URL=${url(PROD_REF)}\n`,
      '.env.local': `NEXT_PUBLIC_SUPABASE_URL=${url(DEV_REF)}\n`,
    });
    assert.equal(code, ALLOWED);
  });

  it('honours Next.js env precedence: a shell export outranks every file', () => {
    const code = runGuard(
      { '.env.local': `NEXT_PUBLIC_SUPABASE_URL=${url(DEV_REF)}\n` },
      { NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF) }
    );
    assert.equal(code, BLOCKED);
  });

  it('ignores the production ref inside a comment', () => {
    const code = runGuard({ '.env.local': `# NEXT_PUBLIC_SUPABASE_URL=${url(PROD_REF)}\n` });
    assert.equal(code, ALLOWED);
  });

  it('blocks a quoted production value', () => {
    const code = runGuard({ '.env.local': `NEXT_PUBLIC_SUPABASE_URL="${url(PROD_REF)}"\n` });
    assert.equal(code, BLOCKED);
  });

  it('allows a checkout with no env files at all', () => {
    assert.equal(runGuard({}), ALLOWED);
  });
});
