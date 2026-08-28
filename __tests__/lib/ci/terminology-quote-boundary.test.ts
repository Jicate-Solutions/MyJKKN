import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Neighbour-character rules of the BLOCKING terminology gate
// (scripts/ci/check-terminology-delta.py).
//
// WHY THIS FILE EXISTS
//   The gate had no tests at all, and it shipped a false negative that let real
//   bad copy through. Its identifier heuristic skips a match whose neighbouring
//   character is a quote or backtick, so a bare quoted identifier reads as code
//   rather than copy — which is right. But it tested only ONE side, so the
//   first or last word of a longer string was exempted on the same rule. Two
//   such lines (see the `caught` fixtures) passed the blocking gate; one
//   reached a pull request and was caught by hand.
//
//   The fix requires quotes on BOTH sides before exempting. These tests pin
//   both halves of that: the escapes are now reported, and every one-sided
//   path/identifier marker the gate already honoured still exempts.
//
// WHY IT SHELLS OUT INSTEAD OF REIMPLEMENTING THE RULE
//   The gate is Python and the enforced suite is vitest, so the honest options
//   are to re-express its logic in TypeScript (which tests a copy of the rule,
//   not the rule — the exact decoration lib-unit-suite.yml was created to end)
//   or to run the real file. This runs the real file: it builds a throwaway git
//   repo in the OS temp dir, commits one fixture, and invokes the gate exactly
//   as the workflow does — `check-terminology-delta.py <BASE_SHA> <HEAD_SHA>`.
//   The sandbox is disposable and lives outside this repository; nothing here
//   writes to the working tree it runs from.
//
// WHY THE FIXTURES ARE IN JSON
//   Every fixture line is written in the vocabulary the gate rejects, and the
//   gate scans .ts. Inlining them here would make this file fail the check it
//   asserts over. See the header of the .fixtures.json file.
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const GATE = join(REPO_ROOT, 'scripts', 'ci', 'check-terminology-delta.py');
// The gate resolves its dictionary from Path.cwd(), so the sandbox needs a copy
// at the same relative path. It stays the single source of truth for the terms.
const DICT = join('.claude', 'skills', 'jkkn-terminologies', 'scripts', 'validate_terminology.py');
const FIXTURE = join('app', 'demo', 'page.tsx');

type Case = { name: string; line: string; term?: string };
const fixtures = JSON.parse(
  readFileSync(join(__dirname, 'terminology-quote-boundary.fixtures.json'), 'utf8'),
) as { caught: Case[]; skipped: Case[] };

let sandbox = '';
let baseSha = '';
let caseNo = 0;

/** git inside the sandbox only, isolated from the developer's global config. */
function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: sandbox,
    encoding: 'utf8',
    env: { ...process.env, HOME: sandbox, GIT_CONFIG_NOSYSTEM: '1' },
  });
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'jkkn-terminology-gate-'));
  execFileSync('git', ['init', '-q', '-b', 'main', sandbox], {
    env: { ...process.env, HOME: sandbox, GIT_CONFIG_NOSYSTEM: '1' },
  });
  git('config', 'user.email', 'gate-test@example.invalid');
  git('config', 'user.name', 'gate test');
  git('config', 'commit.gpgsign', 'false');

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

/** Report table rows only: `| \`file:line\` | **term** → \`replacement\` | … |`. */
const ROW = /^\|\s*`[^`]+`\s*\|\s*\*\*(.+?)\*\*/;

/** Commit `line` as new copy and return the lower-cased terms the gate reports. */
function flaggedTerms(line: string): string[] {
  caseNo += 1;
  git('checkout', '-q', '-B', `case-${caseNo}`, baseSha);
  writeFileSync(join(sandbox, FIXTURE), `export const BASE = 1;\n${line}\n`);
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

describe('terminology gate: a quote on ONE side is copy, not an identifier', () => {
  it.each(fixtures.caught)('reports the $name', ({ line, term }) => {
    expect(flaggedTerms(line)).toContain(term);
  });
});

describe('terminology gate: quote-wrapped identifiers and exemptions stay silent', () => {
  it.each(fixtures.skipped)('stays silent on the $name', ({ line }) => {
    expect(flaggedTerms(line)).toEqual([]);
  });
});
