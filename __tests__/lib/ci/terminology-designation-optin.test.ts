import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// File-level opt-in for official HR designations in the BLOCKING terminology
// gate (scripts/ci/check-terminology-delta.py) — BUG-006259.
//
// The Director ruled (2026-10-09) that official HR job titles keep their exact
// wording. The gate exempts ONLY full designation phrases, ONLY in a file on
// the script's path allowlist, and ONLY when the marker sits on a comment line.
// These tests pin every half of that:
//   1. a marked, allowlisted file's designation copy is silent;
//   2. the same copy in an UNMARKED file is still reported;
//   3. a marked file's NON-designation copy is still reported;
//   4. the marker in a file OUTSIDE the allowlist is ignored;
//   5. the marker inside a string literal is ignored;
//   6. a bare "lab" / "teachers" outside a designation phrase is reported.
//
// Same harness shape as terminology-quote-boundary.test.ts: run the real gate
// against a throwaway git repo in the OS temp dir. Fixtures live in JSON so this
// file does not trip the gate it tests.
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const GATE = join(REPO_ROOT, 'scripts', 'ci', 'check-terminology-delta.py');
const DICT = join('.claude', 'skills', 'jkkn-terminologies', 'scripts', 'validate_terminology.py');

type Case = { name: string; line: string; term: string };
const fixtures = JSON.parse(
  readFileSync(join(__dirname, 'terminology-designation-optin.fixtures.json'), 'utf8'),
) as {
  marker: string;
  markerBlockComment: string;
  markerInString: string;
  allowlistedPath: string;
  outOfScopePath: string;
  exempt: Case[];
  flagged: Case[];
  bare: Case[];
};

const IN_SCOPE = fixtures.allowlistedPath;
const OUT_OF_SCOPE = fixtures.outOfScopePath;

let sandbox = '';
let baseSha = '';
let caseNo = 0;

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: sandbox,
    encoding: 'utf8',
    env: { ...process.env, HOME: sandbox, GIT_CONFIG_NOSYSTEM: '1' },
  });
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'jkkn-terminology-designation-'));
  execFileSync('git', ['init', '-q', '-b', 'main', sandbox], {
    env: { ...process.env, HOME: sandbox, GIT_CONFIG_NOSYSTEM: '1' },
  });
  git('config', 'user.email', 'gate-test@example.invalid');
  git('config', 'user.name', 'gate test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'maintenance.auto', 'false');

  mkdirSync(dirname(join(sandbox, DICT)), { recursive: true });
  copyFileSync(join(REPO_ROOT, DICT), join(sandbox, DICT));

  for (const path of [IN_SCOPE, OUT_OF_SCOPE]) {
    mkdirSync(dirname(join(sandbox, path)), { recursive: true });
    writeFileSync(join(sandbox, path), 'export const BASE = 1;\n');
    git('add', path);
  }
  git('commit', '-qm', 'base');
  baseSha = git('rev-parse', 'HEAD').trim();
});

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

const ROW = /^\|\s*`[^`]+`\s*\|\s*\*\*(.+?)\*\*/;

/** Commit `line` into `path` under `header` (if any) and return the reported terms. */
function flaggedTerms(line: string, header: string | null, path: string = IN_SCOPE): string[] {
  caseNo += 1;
  git('checkout', '-q', '-B', `case-${caseNo}`, baseSha);
  const top = header ? `${header}\n` : '';
  writeFileSync(join(sandbox, path), `${top}export const BASE = 1;\n${line}\n`);
  git('add', path);
  git('commit', '-qm', `case ${caseNo}`);
  const head = git('rev-parse', 'HEAD').trim();
  const out = execFileSync('python3', [GATE, baseSha, head], { cwd: sandbox, encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => ROW.exec(l))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => m[1].toLowerCase());
}

describe('terminology gate: official HR designations, file opt-in', () => {
  it.each(fixtures.exempt)('stays silent on the $name in a marked, allowlisted file', ({ line }) => {
    expect(flaggedTerms(line, fixtures.marker)).toEqual([]);
  });

  it.each(fixtures.exempt)('honours a /* */ marker comment for the $name', ({ line }) => {
    expect(flaggedTerms(line, fixtures.markerBlockComment)).toEqual([]);
  });

  it.each(fixtures.exempt)('still reports the $name in an unmarked file', ({ line, term }) => {
    expect(flaggedTerms(line, null)).toContain(term);
  });

  it.each(fixtures.flagged)('still reports the $name', ({ line, term }) => {
    expect(flaggedTerms(line, fixtures.marker)).toContain(term);
  });

  it.each(fixtures.exempt)(
    'ignores the marker outside the path allowlist: reports the $name',
    ({ line, term }) => {
      expect(flaggedTerms(line, fixtures.marker, OUT_OF_SCOPE)).toContain(term);
    },
  );

  it.each(fixtures.exempt)(
    'ignores a marker inside a string literal: reports the $name',
    ({ line, term }) => {
      expect(flaggedTerms(line, fixtures.markerInString)).toContain(term);
    },
  );

  it.each(fixtures.bare)('still reports a $name in a marked, allowlisted file', ({ line, term }) => {
    expect(flaggedTerms(line, fixtures.marker)).toContain(term);
  });
});
