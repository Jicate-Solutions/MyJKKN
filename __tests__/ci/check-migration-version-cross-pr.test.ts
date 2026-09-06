/**
 * Regression tests for scripts/ci/check-migration-version-cross-pr.sh.
 *
 * A guard that is not itself tested is a guard that quietly stops guarding —
 * and this one has an extra way to rot, because it fails OPEN. A fail-open
 * guard that starts failing open on every run is indistinguishable, from the
 * outside, from a guard that is working. So the assertions below check the
 * WORDING of the skip path as carefully as they check the exit code: a skip
 * must never be able to read as a pass.
 *
 * These drive the real script as a subprocess against a fixture standing in for
 * the GitHub API and the base branch (--fixture), so every verdict is exercised
 * with no credentials and no network, and assert on the EXIT CODE — the only
 * signal CI reads — plus the substrings a human would act on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-migration-version-cross-pr.sh');

let dir: string;

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'mig-crosspr-guard-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

/** Run the guard against a fixture. `extra` appends raw CLI args. */
function run(fixture: string, extra: string[] = [], cwd?: string): { code: number; out: string } {
  const file = path.join(dir, `fx-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(file, fixture, 'utf8');
  // spawnSync, not execFileSync: the guard writes findings to stdout AND stderr,
  // and execFileSync surfaces stderr only on a non-zero exit — which would hide
  // the skip wording on every passing case, i.e. exactly the case these tests
  // exist to police.
  const r = spawnSync('bash', [SCRIPT, '--fixture', file, ...extra], {
    encoding: 'utf8',
    cwd: cwd ?? process.cwd(),
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const mig = (v: string, name: string) => `supabase/migrations/${v}_${name}.sql`;

describe('a sibling open PR claiming the same version', () => {
  it('fails, and names the colliding PR number', () => {
    const r = run(
      [
        `pr 1`,
        `file added ${mig('20260817000000', 'mine')}`,
        `pr 2`,
        `file added ${mig('20260817000000', 'theirs')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('open pull request #2');
    expect(r.out).toContain('20260817000000');
  });

  it('is symmetric — the other PR sees the collision too', () => {
    const r = run(
      [
        `pr 1`,
        `file added ${mig('20260817000000', 'mine')}`,
        `pr 2`,
        `file added ${mig('20260817000000', 'theirs')}`,
      ].join('\n'),
      ['--as-pr', '2'],
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('open pull request #1');
  });

  it('never flags a PR against itself', () => {
    // The only claimant of this version is the PR under test.
    const r = run([`pr 1`, `file added ${mig('20260817000000', 'mine')}`].join('\n'), ['--as-pr', '1']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('sweep passed');
  });

  it('reports every colliding sibling, not just the first', () => {
    const r = run(
      [
        `pr 1`, `file added ${mig('20260817000000', 'mine')}`,
        `pr 2`, `file added ${mig('20260817000000', 'a')}`,
        `pr 3`, `file added ${mig('20260817000000', 'b')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('open pull request #2');
    expect(r.out).toContain('open pull request #3');
  });
});

describe('a version already held on the base branch', () => {
  it('fails, and names the file that holds it', () => {
    const r = run(
      [
        `pr 1`,
        `file added ${mig('20260810120000', 'mine')}`,
        `base ${mig('20260810120000', 'backfill_leadership_schedules_and_types')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('backfill_leadership_schedules_and_types');
    expect(r.out).toContain('ALREADY held');
  });

  it('does not count a base file this PR DELETES — it will not exist post-merge', () => {
    const r = run(
      [
        `pr 1`,
        `file removed ${mig('20260810120000', 'old')}`,
        `file added ${mig('20260810120000', 'replacement')}`,
        `base ${mig('20260810120000', 'old')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    // add-minus-remove nets the version out entirely: this is a rename.
    expect(r.code).toBe(0);
    expect(r.out).toContain('claims no new migration version');
  });
});

describe('renames', () => {
  it('a rename that KEEPS its version is not a claim (the rename gate owns that case)', () => {
    const r = run(
      [
        `pr 1`,
        `file renamed ${mig('20260816020000', 'better_name')} ${mig('20260816020000', 'old_name')}`,
        `base ${mig('20260816020000', 'old_name')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain('claims no new migration version');
  });

  it('a rename that RENUMBERS onto a contested version is a claim, and fails', () => {
    const r = run(
      [
        `pr 1`,
        `file renamed ${mig('20260817000000', 'renumbered')} ${mig('20260816020000', 'old_name')}`,
        `pr 2`,
        `file added ${mig('20260817000000', 'theirs')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('open pull request #2');
  });

  it('a SIBLING that only renames is not reported as claiming its version', () => {
    const r = run(
      [
        `pr 1`,
        `file added ${mig('20260816020000', 'mine')}`,
        `pr 2`,
        `file renamed ${mig('20260816020000', 'b')} ${mig('20260816020000', 'a')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain('sweep passed');
  });
});

describe('what counts as a migration, and what counts as a version', () => {
  it('ignores nested directories — `supabase db push` never reads them', () => {
    const r = run(
      [
        `pr 1`,
        `file added ${mig('20260817000000', 'mine')}`,
        `pr 2`,
        `file added supabase/migrations/admission/20260817000000_nested.sql`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(0);
  });

  it('ignores files outside supabase/migrations/', () => {
    const r = run(
      [
        `pr 1`, `file added ${mig('20260817000000', 'mine')}`,
        `pr 2`, `file added supabase/setup/20260817000000_not_a_migration.sql`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(0);
  });

  it('does not treat a MODIFIED file as a new claim', () => {
    const r = run(
      [
        `pr 1`, `file added ${mig('20260817000000', 'mine')}`,
        `pr 2`, `file modified ${mig('20260817000000', 'theirs')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(0);
  });

  it('catches the short YYYYMMDD version form — 522 live files use it', () => {
    const r = run(
      [
        `pr 1`, `file added ${mig('20260725', 'mine')}`,
        `pr 2`, `file added ${mig('20260725', 'theirs')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('Version 20260725 is ALSO claimed');
  });

  it('treats a lettered suffix as a DISTINCT version — truncating to 14 digits invents collisions', () => {
    const r = run(
      [
        `pr 1`, `file added ${mig('20260419000008a', 'mine')}`,
        `pr 2`, `file added ${mig('20260419000008', 'theirs')}`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(0);
  });
});

describe('fail-open behaviour — the part that can rot invisibly', () => {
  const outage = [
    `apifail`,
    `pr 1`,
    `file added ${mig('20260817000000', 'mine')}`,
  ].join('\n');

  it('does not fail the build when the GitHub API is unreachable', () => {
    // The PR's own file list also comes from the API, so an outage means the
    // guard cannot even establish what this PR claims.
    expect(run(outage, ['--as-pr', '1']).code).toBe(0);
  });

  it('says the sweep did not run, and never says anything that reads as a pass', () => {
    const r = run(outage, ['--as-pr', '1']);
    expect(r.out).toMatch(/did not run|did NOT run/);
    expect(r.out).not.toContain('sweep passed');
    expect(r.out).not.toMatch(/passed/);
  });

  /**
   * These two exercise the OTHER skip path — the one taken when this PR's own
   * claim is known (read from git, as in CI) but the sibling enumeration comes
   * back unusable. It is a genuinely different branch from the one above, and
   * it is the branch CI actually takes during an outage.
   */
  function withStagedMigration(version: string, fn: (repo: string) => void) {
    const repo = mkdtempSync(path.join(tmpdir(), 'mig-crosspr-repo-'));
    try {
      spawnSync('git', ['init', '-q'], { cwd: repo });
      const rel = mig(version, 'staged_by_this_pr');
      spawnSync('mkdir', ['-p', path.join(repo, 'supabase/migrations')]);
      writeFileSync(path.join(repo, rel), '-- fixture\n', 'utf8');
      spawnSync('git', ['add', rel], { cwd: repo });
      fn(repo);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }

  it('an EMPTY open-PR enumeration is a failed sweep, not a clean repo', () => {
    // The receipt this defends: a sweep that silently collected zero rows and
    // cheerfully reported "no collisions". Here the PR under test genuinely
    // claims a version, but nothing could be enumerated to compare it against.
    withStagedMigration('20260817000000', (repo) => {
      // Fixture carries base files but NOT a single `pr` record.
      const r = run(`base ${mig('20260101000000', 'unrelated')}`, [], repo);
      expect(r.code).toBe(0);
      expect(r.out).toContain('20260817000000');           // it DID read the claim
      expect(r.out).toMatch(/did not run|did NOT run/);    // and still refused to pass
      expect(r.out).not.toContain('sweep passed');
      expect(r.out).toContain('NOT a statement that no collision exists');
    });
  });

  it('an API outage during the sibling sweep does not read as a pass either', () => {
    withStagedMigration('20260817000000', (repo) => {
      const r = run([`apifail`, `pr 2`, `file added ${mig('20260817000000', 'theirs')}`].join('\n'), [], repo);
      expect(r.code).toBe(0);
      expect(r.out).toContain('20260817000000');
      expect(r.out).toMatch(/did not run|did NOT run/);
      expect(r.out).not.toContain('sweep passed');
      expect(r.out).toContain('NOT a statement that no collision exists');
    });
  });

  it('still reports the base-branch half when the sibling sweep is down — git needs no API', () => {
    withStagedMigration('20260817000000', (repo) => {
      const r = run(
        [`apifail`, `base ${mig('20260817000000', 'already_on_main')}`].join('\n'),
        [],
        repo,
      );
      expect(r.code).toBe(1);
      expect(r.out).toContain('already_on_main');
      // …and it still admits the sibling half never ran.
      expect(r.out).toMatch(/did not complete/i);
    });
  });
});

describe('the clean path states its sample size', () => {
  it('reports how many PRs were swept, so a vacuous pass is visible in the log', () => {
    const r = run(
      [
        `pr 1`, `file added ${mig('20260817000000', 'mine')}`,
        `pr 2`, `file added ${mig('20260818000000', 'theirs')}`,
        `pr 3`, `file added app/(routes)/whatever/page.tsx`,
      ].join('\n'),
      ['--as-pr', '1'],
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain('swept 3 open pull request(s), 1 of which carry migrations');
  });
});
