/**
 * Regression tests for the SHAPE of .github/workflows/migration-version-collision.yml.
 *
 * Not the guards' logic — check-migration-version-cross-pr.test.ts covers that.
 * These cover the properties that decide whether the guards can be ENFORCED at
 * all, every one of which is invisible until the moment it is catastrophic:
 *
 *   1. NO `paths:` FILTER. Branch protection blocks a pull request until every
 *      required context REPORTS. A workflow skipped by a path filter reports
 *      nothing — not a pass, not a fail, no check run — so a required context
 *      behind one leaves every pull request that misses the filter stuck on
 *      "Expected — waiting for status to be reported", forever. This is the
 *      exact reason this guard could not be added to the required list when
 *      branch protection was first enabled on main (2026-09-04).
 *
 *      The failure mode of re-adding a filter is total: not one red check, but
 *      every open pull request unmergeable at once. Cheap to prevent here.
 *
 *   2. STABLE JOB NAMES. A required status check is stored as the job's `name:`
 *      STRING. Renaming a job does not move the rule — it silently orphans it,
 *      leaving branch protection waiting on a context nothing publishes any
 *      more, which fails exactly like (1) and looks like nothing at all. The
 *      workflow file says this in its own header; this asserts it.
 *
 *   3. NO TWO JOBS SHARING A NAME. Two jobs publishing one context makes the
 *      merge gate's verdict depend on which finished last.
 *
 *   4. EVERY TEST FILE IN THIS DIRECTORY NAMED BY EXACT PATH. This repository
 *      has no blanket vitest run, so a test file no workflow names is dead code
 *      that still looks alive. That is not hypothetical: the 20 cases in
 *      check-migration-version-cross-pr.test.ts were named by no workflow — and
 *      therefore never once executed — from the day they were written until
 *      2026-09-03. This assertion is self-referential on purpose: it fails if
 *      THIS file ever stops being run.
 *
 * Deliberately parses by targeted line scan rather than importing a YAML
 * library: neither `yaml` nor `js-yaml` is a direct dependency of this project
 * (both resolve only as transitives today), and a guard must not acquire a
 * dependency that a future lockfile change can take away.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WORKFLOW = path.resolve(
  process.cwd(),
  '.github/workflows/migration-version-collision.yml',
);
const CI_TEST_DIR = path.resolve(process.cwd(), '__tests__/ci');

const source = readFileSync(WORKFLOW, 'utf8');
const lines = source.split('\n');

/** A comment line carries no YAML structure — skip it before any match. */
const isComment = (l: string) => /^\s*#/.test(l);

/** Lines of the top-level block introduced by `key:`, up to the next top-level key. */
function topLevelBlock(key: string): string[] {
  const start = lines.findIndex(l => l === `${key}:` || l.startsWith(`${key}:`));
  expect(start, `top-level '${key}:' not found in the workflow`).toBeGreaterThan(-1);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z_-]+:/.test(lines[i])) break;   // next top-level key
    out.push(lines[i]);
  }
  return out;
}

/**
 * Test paths actually handed to a `vitest run` command, following `\` line
 * continuations. Comments are stripped FIRST, which is the whole point: this
 * file names itself in the workflow's prose, and a mention in a comment must
 * never be able to stand in for being executed. (Written after a draft of this
 * test passed while the file was unnamed by any command — the same "looks alive
 * but is dead" shape it exists to catch.)
 */
function vitestNamedFiles(): string[] {
  const code = lines.filter(l => !isComment(l));
  const out: string[] = [];
  for (let i = 0; i < code.length; i++) {
    if (!code[i].includes('vitest run')) continue;
    let j = i;
    for (;;) {
      for (const m of code[j].matchAll(/__tests__\/ci\/[\w.-]+\.test\.ts/g)) out.push(m[0]);
      if (!code[j].trimEnd().endsWith('\\')) break;   // end of continuation
      j++;
      if (j >= code.length) break;
    }
  }
  return out;
}

/** Job `name:` values — 4-space indent, which only job-level names use here. */
function jobNames(): string[] {
  return topLevelBlock('jobs')
    .filter(l => !isComment(l))
    .map(l => /^ {4}name:\s*(.+?)\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => m[1].replace(/^['"]|['"]$/g, ''));
}

describe('the workflow can be a required status check', () => {
  it('declares no paths or paths-ignore filter on its pull_request trigger', () => {
    const offenders = topLevelBlock('on')
      .filter(l => !isComment(l))
      .filter(l => /^\s+paths(-ignore)?\s*:/.test(l));

    // A filter here would make every required context it publishes report
    // NOTHING on any pull request that misses the filter — permanently pending,
    // permanently unmergeable. Read "WHY THERE IS NO `paths:` FILTER" in the
    // workflow header before changing this.
    expect(offenders).toEqual([]);
  });

  it('still triggers on pull requests targeting main', () => {
    const on = topLevelBlock('on').filter(l => !isComment(l)).join('\n');
    expect(on).toMatch(/^\s+pull_request:/m);
    expect(on).toMatch(/branches:\s*\[main\]/);
  });
});

describe('status-check identity', () => {
  // Changing any string here renames a status check. If the name is in branch
  // protection's required list, the rule is orphaned and waits forever on a
  // context nothing publishes. Update the required list FIRST, then this test.
  const EXPECTED = [
    'No new duplicate migration versions',
    'No sibling PR claims the same migration version',
    "Migration version guards' own tests pass",
  ];

  it('publishes exactly the three known context names', () => {
    expect(jobNames()).toEqual(EXPECTED);
  });

  it('has a stable workflow name', () => {
    expect(lines[lines.findIndex(l => l.startsWith('name:'))])
      .toBe('name: Migration version collision');
  });

  it('never lets two jobs publish the same context name', () => {
    const names = jobNames();
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('none of this workflow\'s own test files is left unrun', () => {
  // Scoped to the files THIS workflow owns. __tests__/ci also holds suites
  // belonging to sibling guards, each named by its own workflow, and policing
  // those from here would make this test fail for someone else's omission.
  //
  // Known, and deliberately not asserted here because fixing it belongs to the
  // guards that own them: as of 2026-09-04 check-table-anon-revoke.test.ts and
  // id-card-templates-institution-scope.test.ts are named by NO workflow on
  // main and have therefore never run — the same rot this file exists to stop.
  const OWNED = [
    'check-migration-version-cross-pr.test.ts',
    'check-migration-version-workflow-shape.test.ts',
  ];

  it('hands each of them to a vitest run command, not merely to a comment', () => {
    const executed = vitestNamedFiles();
    const missing = OWNED.filter(f => !executed.includes(`__tests__/ci/${f}`));
    expect(missing).toEqual([]);
  });

  it('names files that actually exist', () => {
    const present = readdirSync(CI_TEST_DIR).filter(f => f.endsWith('.test.ts'));
    expect(OWNED.filter(f => !present.includes(f))).toEqual([]);
  });
});
