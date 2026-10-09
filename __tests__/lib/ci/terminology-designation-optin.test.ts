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
// wording. The gate exempts ONLY the designation words, and ONLY in a file that
// carries the marker line. These tests pin all three halves of that:
//   1. a marked file's designation copy is silent;
//   2. the same copy in an UNMARKED file is still reported;
//   3. a marked file's NON-designation copy is still reported.
//
// Same harness shape as terminology-quote-boundary.test.ts: run the real gate
// against a throwaway git repo in the OS temp dir. Fixtures live in JSON so this
// file does not trip the gate it tests.
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const GATE = join(REPO_ROOT, 'scripts', 'ci', 'check-terminology-delta.py');
const DICT = join('.claude', 'skills', 'jkkn-terminologies', 'scripts', 'validate_terminology.py');
const FIXTURE = join('app', 'demo', 'page.tsx');

type Case = { name: string; line: string; term: string };
const fixtures = JSON.parse(
  readFileSync(join(__dirname, 'terminology-designation-optin.fixtures.json'), 'utf8'),
) as { marker: string; exempt: Case[]; flagged: Case[] };

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

  mkdirSync(dirname(join(sandbox, FIXTURE)), { recursive: true });
  writeFileSync(join(sandbox, FIXTURE), 'export const BASE = 1;\n');
  git('add', FIXTURE);
  git('commit', '-qm', 'base');
  baseSha = git('rev-parse', 'HEAD').trim();
});

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

const ROW = /^\|\s*`[^`]+`\s*\|\s*\*\*(.+?)\*\*/;

/** Commit `line` (optionally under the marker) and return the reported terms. */
function flaggedTerms(line: string, marked: boolean): string[] {
  caseNo += 1;
  git('checkout', '-q', '-B', `case-${caseNo}`, baseSha);
  const header = marked ? `${fixtures.marker}\n` : '';
  writeFileSync(join(sandbox, FIXTURE), `${header}export const BASE = 1;\n${line}\n`);
  git('add', FIXTURE);
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
  it.each(fixtures.exempt)('stays silent on the $name in a marked file', ({ line }) => {
    expect(flaggedTerms(line, true)).toEqual([]);
  });

  it.each(fixtures.exempt)('still reports the $name in an unmarked file', ({ line, term }) => {
    expect(flaggedTerms(line, false)).toContain(term);
  });

  it.each(fixtures.flagged)('still reports the $name', ({ line, term }) => {
    expect(flaggedTerms(line, true)).toContain(term);
  });
});
