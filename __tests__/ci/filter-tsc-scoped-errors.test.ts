/**
 * Regression tests for scripts/ci/filter-tsc-scoped-errors.sh — the filter that
 * IS the "TypeCheck (PR-scoped)" gate.
 *
 * This gate fails in one direction only: towards green. Get the filter wrong and
 * the job still succeeds, still prints "none in PR-touched files. Pass.", and
 * still reports conclusion=success. That is not a hypothetical — the original
 * inline filter was incapable of matching anything for its entire lifetime, and
 * the way we found out was PR #2891 merging seven `TS2304: Cannot find name`
 * errors into a file it had itself modified, with this gate green.
 *
 * So the fixtures below are deliberately the REAL byte shapes tsc emits, not a
 * tidied idea of them. `npm run typecheck` is `tsc --noEmit --pretty`, and
 * --pretty is an explicit flag rather than a TTY probe, so the colour codes are
 * present even when the output is redirected into a file:
 *
 *     ESC[96mpath ESC[0m : ESC[93mLINE ESC[0m : ESC[93mCOL ESC[0m - ESC[91merror ...
 *
 * Two things in that line each defeat `grep -E "^path:"` on their own: the `^`
 * anchor lands on ESC, and ESC[0m sits between the filename and its colon.
 *
 * The tests drive the real script as a subprocess and assert on the EXIT CODE —
 * the only signal CI reads — plus the wording a human would act on, because a
 * skip that reads like a pass is how the previous version survived.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/filter-tsc-scoped-errors.sh');

const ESC = '';

/** One tsc diagnostic line, coloured exactly the way `--pretty` colours it. */
function prettyError(file: string, line: number, col: number, code: string, msg: string): string {
  return (
    `${ESC}[96m${file}${ESC}[0m:${ESC}[93m${line}${ESC}[0m:${ESC}[93m${col}${ESC}[0m` +
    ` - ${ESC}[91merror${ESC}[0m${ESC}[90m ${code}: ${ESC}[0m${msg}`
  );
}

/**
 * The same diagnostic with --pretty OFF. Dropping the flag does not just remove
 * colour — tsc switches punctuation entirely, to `path(LINE,COL): error`.
 * Verified against tsc 5.6.3 on 2026-08-16.
 */
function plainError(file: string, line: number, col: number, code: string, msg: string): string {
  return `${file}(${line},${col}): error ${code}: ${msg}`;
}

/**
 * tsc's trailing summary. Every path is REPEATED here, indented and partly
 * coloured — which is why the filter anchors on `^`. Without the anchor each
 * error would be counted twice and the reported number would be a lie.
 */
function summary(totalErrors: number, files: Array<[string, number]>): string {
  const rows = files.map(([f, n]) => `     ${n}  ${f}${ESC}[90m:1${ESC}[0m`).join('\n');
  return `\nFound ${totalErrors} errors in ${files.length} files.\n\nErrors  Files\n${rows}\n`;
}

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'tsc-scope-filter-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Run the real filter against fixture text. */
function run(tscOutput: string, changed: string[], tscExit: number): { code: number; out: string } {
  const stamp = Math.random().toString(36).slice(2);
  const outFile = path.join(dir, `tsc-${stamp}.txt`);
  const changedFile = path.join(dir, `changed-${stamp}.txt`);
  writeFileSync(outFile, tscOutput, 'utf8');
  writeFileSync(changedFile, changed.length ? `${changed.join('\n')}\n` : '', 'utf8');

  // spawnSync, not execFileSync: the script writes its verdict to stdout even on
  // the passing path, and execFileSync surfaces stdout only awkwardly on failure —
  // which would hide exactly the "pass" wording these tests exist to police.
  const r = spawnSync(
    'bash',
    [SCRIPT, '--tsc-output', outFile, '--changed', changedFile, '--tsc-exit', String(tscExit)],
    { encoding: 'utf8', cwd: process.cwd() },
  );
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const TOUCHED = 'app/api/cron/aipulse-domain-starter-notify/route.ts';
const BASELINE = 'lib/services/legacy/old-thing.ts';

describe('the regression that made this gate decorative', () => {
  it('FAILS on an ANSI-coloured error in a file the PR touched', () => {
    // The exact shape that used to score zero. If this test ever goes green-by-
    // passing, the gate is broken again in precisely the original way.
    const out =
      [
        prettyError(TOUCHED, 12, 9, 'TS2304', "Cannot find name 'supabaseAdmin'."),
        '',
        summary(1, [[TOUCHED, 1]]),
      ].join('\n');

    const r = run(out, [TOUCHED], 1);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 type error(s) in files this PR modified');
    expect(r.out).toContain(TOUCHED);
  });

  it('counts every coloured error in a touched file, not just the first', () => {
    const out = [
      prettyError(TOUCHED, 12, 9, 'TS2304', "Cannot find name 'supabaseAdmin'."),
      prettyError(TOUCHED, 41, 3, 'TS2304', "Cannot find name 'notifyBatch'."),
      prettyError(TOUCHED, 77, 15, 'TS2304', "Cannot find name 'domainSlug'."),
      summary(3, [[TOUCHED, 3]]),
    ].join('\n');

    const r = run(out, [TOUCHED], 1);
    expect(r.code).toBe(1);
    expect(r.out).toContain('3 type error(s)');
  });

  it('does not double-count: the indented summary repeats every path', () => {
    // "Errors  Files" rows carry the same filename. They are indented, so the `^`
    // anchor drops them. Losing that anchor would report 2 for a single error.
    const out = [
      prettyError(TOUCHED, 12, 9, 'TS2304', "Cannot find name 'supabaseAdmin'."),
      summary(1, [[TOUCHED, 1]]),
    ].join('\n');

    const r = run(out, [TOUCHED], 1);
    expect(r.out).toContain('1 type error(s)');
    expect(r.out).not.toContain('2 type error(s)');
  });

  it('still fails if --pretty is ever dropped from the typecheck script', () => {
    // The whole point of normalising rather than un-flagging: the gate must not
    // care which formatting tsc happens to be using. Someone removing --pretty
    // from package.json is a plausible tidy-up, and it must not silently switch
    // this gate back off.
    const out = plainError(TOUCHED, 12, 9, 'TS2304', "Cannot find name 'supabaseAdmin'.");
    const r = run(`${out}\n`, [TOUCHED], 1);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 type error(s)');
    // and the annotation still points at a real file and a real line
    expect(r.out).toContain(`::error file=${TOUCHED},line=12::`);
  });

  it('normalises a plain-format path that itself contains parentheses', () => {
    // app/(routes)/… plus the (LINE,COL) suffix means two sets of parentheses on
    // one line. The split has to take the last.
    const grouped = 'app/(routes)/billing/invoices/page.tsx';
    const r = run(`${plainError(grouped, 88, 11, 'TS2551', "Property 'x' does not exist.")}\n`, [grouped], 1);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`::error file=${grouped},line=88::`);
  });
});

describe('the baseline stays ignored', () => {
  it('passes when the only coloured errors are in files the PR did not touch', () => {
    const out = [
      prettyError(BASELINE, 3, 1, 'TS2345', 'Argument of type string is not assignable.'),
      prettyError(BASELINE, 9, 4, 'TS2339', "Property 'x' does not exist."),
      summary(2, [[BASELINE, 2]]),
    ].join('\n');

    const r = run(out, [TOUCHED], 1);
    expect(r.code).toBe(0);
    expect(r.out).toContain('none in PR-touched files');
  });

  it('a non-zero tsc exit is not on its own a failure', () => {
    // ~1,400 baseline errors mean tsc exits non-zero on EVERY run. A guard that
    // failed on the exit code alone would red every pull request and be deleted
    // within a day, taking the real check with it.
    const out = `${prettyError(BASELINE, 3, 1, 'TS2345', 'Bad arg.')}\n`;
    const r = run(out, [TOUCHED], 2);
    expect(r.code).toBe(0);
  });

  it('separates a touched file from a baseline file with a similar path', () => {
    const near = `${TOUCHED.replace(/\.ts$/, '')}-helpers.ts`;
    const out = [
      prettyError(near, 5, 2, 'TS2304', "Cannot find name 'z'."),
      summary(1, [[near, 1]]),
    ].join('\n');

    const r = run(out, [TOUCHED], 1);
    expect(r.code).toBe(0);
  });
});

describe('paths with regex metacharacters', () => {
  it('matches a Next.js route-group path containing parentheses', () => {
    // app/(routes)/... is the dominant shape in this repository. Unescaped, the
    // parentheses would turn the filter into a capture group and match nothing
    // that a human would recognise.
    const grouped = 'app/(routes)/billing/invoices/page.tsx';
    const out = [
      prettyError(grouped, 88, 11, 'TS2551', "Property 'learnerId' does not exist."),
      summary(1, [[grouped, 1]]),
    ].join('\n');

    const r = run(out, [grouped], 1);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 type error(s)');
  });

  it('a dot in the pattern is a literal dot, not any-character', () => {
    const out = [
      prettyError('lib/utils/dateXhelpers.ts', 4, 4, 'TS2304', "Cannot find name 'q'."),
      summary(1, [['lib/utils/dateXhelpers.ts', 1]]),
    ].join('\n');

    const r = run(out, ['lib/utils/date.helpers.ts'], 1);
    expect(r.code).toBe(0);
  });
});

describe('a typecheck that never ran must not read as a typecheck that found nothing', () => {
  it('fails loudly when tsc dies with no diagnostics at all', () => {
    // The project OOMs at the default heap. A crashed run leaves a stack trace
    // and zero error lines — which scored exactly the same as a clean file.
    const crash = [
      '',
      '<--- Last few GCs --->',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      ' 1: 0x104f8c2d4 node::Abort() [/usr/local/bin/node]',
      'Abort trap: 6',
    ].join('\n');

    const r = run(crash, [TOUCHED], 134);
    expect(r.code).toBe(1);
    expect(r.out).toContain('typecheck itself failed to run');
    expect(r.out).not.toContain('none in PR-touched files');
  });

  it('quotes the tail of the output so the cause is visible without a rerun', () => {
    const r = run('Abort trap: 6\n', [TOUCHED], 134);
    expect(r.out).toContain('Abort trap: 6');
  });

  it('does NOT cry crash when tsc exits zero with an empty report', () => {
    // Exit 0 and no output is the genuinely clean case. It has to stay a pass.
    const r = run('', [TOUCHED], 0);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('typecheck itself failed to run');
  });

  it('treats a missing output file as a crash rather than a pass', () => {
    const r = spawnSync(
      'bash',
      [
        SCRIPT,
        '--tsc-output',
        path.join(dir, 'does-not-exist.txt'),
        '--changed',
        path.join(dir, 'does-not-exist-either.txt'),
        '--tsc-exit',
        '1',
      ],
      { encoding: 'utf8', cwd: process.cwd() },
    );
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain('no output file');
  });
});

describe('argument handling', () => {
  it('refuses to run — rather than passing — when an argument is missing', () => {
    const r = spawnSync('bash', [SCRIPT, '--tsc-exit', '1'], { encoding: 'utf8', cwd: process.cwd() });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain('is required');
  });

  it('passes when the changed-file list is empty', () => {
    const r = run(`${prettyError(BASELINE, 1, 1, 'TS2304', 'x')}\n`, [], 1);
    expect(r.code).toBe(0);
    expect(r.out).toContain('No changed files to filter against');
  });
});
