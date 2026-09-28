/**
 * The JKKN reference pay band must never ship to the browser.
 *
 * Any 'use client' file that imports the band module (or its data file) puts
 * the salary figures inside a public /_next/static file that anyone, signed in
 * or not, can download. The Pay Scales page fetches the band through a
 * super-admin-gated server action instead. This test fails the moment a client
 * file imports it.
 */
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BAND_IMPORT = /from\s+['"][^'"]*(jkkn-reference-ladders(\.data\.json)?)['"]/;

describe('reference pay band stays on the server', () => {
  it('no client component imports the band', () => {
    const files = execSync(
      "git ls-files 'app/**/*.ts' 'app/**/*.tsx' 'components/**/*.ts' 'components/**/*.tsx' 'hooks/**/*.ts' 'hooks/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx'",
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean);
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      const isClient = /^\s*['"]use client['"]/m.test(src.slice(0, 400));
      return isClient && BAND_IMPORT.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('the only app importer is the server action', () => {
    const out = execSync(
      "git grep -l -E \"jkkn-reference-ladders\" -- 'app/**' 'components/**' 'hooks/**' || true",
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean);
    expect(out).toEqual(['app/(routes)/hr/admin/policies/pay-scales/actions.ts']);
    const action = readFileSync(out[0], 'utf8');
    expect(action.trimStart().startsWith("'use server'")).toBe(true);
  });
});
