/**
 * Every reader that answers "did this learner's feedback confirm this mark?"
 * must go through ONE predicate, and that predicate must recognise the sibling
 * periods of a block-scheduled course.
 *
 * Why a guard at all: this defect was RE-INTRODUCED once. 20260718200000 taught
 * fn_scf_pending_for_learner to consolidate sibling periods of a block course by
 * course_id, so a learner is offered exactly one feedback per course per day.
 * 20260731 then aligned the confirmation tick to exact (period_id, timetable_id)
 * matching, which put the withheld siblings back in the unconfirmed column. Five
 * readers each carried their own copy of the match, so there was no single place
 * the first fix could have landed. Eight reports followed (BUG-004651/690/707/
 * 728/741 and BUG-005120/005178/005491, clusters 0961c22e and 3149b52f).
 *
 * Two layers, because neither alone is enough:
 *
 *  - The structural assertions below read the definition that WINS a full
 *    ordered apply — the last migration in version order to define each
 *    function, which is the body production ends up with. A future migration
 *    that reverts the sharing fails here rather than reaching a learner.
 *  - The BEHAVIOUR is proved by supabase/tests/scf-block-course/run.sh, which
 *    builds a throwaway database, applies this migration for real, seeds a block
 *    course, a cross-timetable case, a late feedback, a course-less period and a
 *    malformed course_id, and asserts the answers. That runner is executed here
 *    when a local Postgres is reachable, and skipped (loudly, not silently) when
 *    it is not.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = path.resolve(ROOT, 'supabase/migrations');
const HARNESS = path.resolve(ROOT, 'supabase/tests/scf-block-course/run.sh');

/** The migration that introduced the shared predicate. */
const THIS_FIX_VERSION = '20261226000000';

/** The one predicate, and the guard every course_id cast must go through. */
const PREDICATE = 'fn_scf_feedback_matches_mark';
const UUID_GUARD = 'fn_scf_uuid_or_null';

/**
 * Readers that call the predicate directly. fn_scf_confirmation_rollup is NOT
 * here on purpose: it carries the same rule as two hash joins because the
 * predicate's OR of two equalities cannot be hashed, and that function was
 * rewritten specifically to replace ~99k per-row EXISTS probes under a 20s
 * statement_timeout. Its equivalence to the predicate is asserted by the SQL
 * harness on real rows, which is a stronger check than a shared call site.
 */
const PREDICATE_CALLERS = [
  'fn_scf_confirmation_status',
  'fn_scf_my_confirmed_attendance',
  'fn_scf_effective_attendance',
  'fn_scf_faculty_completion',
] as const;

type Migration = { name: string; version: string; sql: string };

function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS)
    .filter((n) => /^\d{14}_.*\.sql$/.test(n))
    .map((name) => ({
      name,
      version: name.slice(0, 14),
      sql: readFileSync(path.join(MIGRATIONS, name), 'utf8'),
    }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** Comments stripped, so a comment can never satisfy an assertion. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function definesFunction(sql: string, fn: string): boolean {
  return new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`,
    'i'
  ).test(stripSqlComments(sql));
}

/** The body of `fn`, from its CREATE to the close of its dollar-quoted block. */
function bodyOf(sql: string, fn: string): string {
  const clean = stripSqlComments(sql);
  const start = clean.search(
    new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`, 'i')
  );
  expect(start, `${fn} not found`).toBeGreaterThanOrEqual(0);
  const rest = clean.slice(start);
  const tag = rest.match(/AS\s+(\$[A-Za-z_]*\$)/i);
  if (!tag) return rest;
  const open = rest.indexOf(tag[1], rest.indexOf(tag[0]));
  const close = rest.indexOf(tag[1], open + tag[1].length);
  return close < 0 ? rest.slice(open) : rest.slice(open, close + tag[1].length);
}

const migrations = loadMigrations();

/** Last file in version order to define `fn` — what an ordered apply leaves. */
function winningDefinition(fn: string): Migration {
  const owners = migrations.filter((m) => definesFunction(m.sql, fn));
  expect(owners.length, `no migration defines ${fn}`).toBeGreaterThan(0);
  return owners[owners.length - 1];
}

describe('SCF confirmed-with-feedback — one predicate, block-course siblings', () => {
  it('this fix’s migration is in the tree (guards against a vacuous pass)', () => {
    expect(migrations.map((m) => m.version)).toContain(THIS_FIX_VERSION);
    const mine = migrations.find((m) => m.version === THIS_FIX_VERSION)!;
    expect(definesFunction(mine.sql, PREDICATE)).toBe(true);
    expect(definesFunction(mine.sql, UUID_GUARD)).toBe(true);
  });

  it('the predicate consolidates by course and keeps the exact-period branch', () => {
    const body = bodyOf(winningDefinition(PREDICATE).sql, PREDICATE);
    expect(
      /p_feedback_course_id\s*=\s*p_mark_course_id/.test(body),
      'the predicate lost its course branch — block-course sibling periods would ' +
        'read as never confirmed, which is the reported defect'
    ).toBe(true);
    expect(
      /p_feedback_period_id\s*=\s*p_mark_period_id/.test(body),
      'the predicate lost its exact-period branch'
    ).toBe(true);
    // A mark with no course must fall back to exact-period, never match every
    // feedback row whose course is also NULL.
    expect(
      /p_mark_course_id\s+IS\s+NOT\s+NULL/i.test(body),
      'the course branch must be guarded on the mark having a course at all'
    ).toBe(true);
    // The timetable dimension stays a parameter, not a hardcoded rule.
    expect(/p_require_same_timetable/.test(body)).toBe(true);
  });

  it.each(PREDICATE_CALLERS)('%s calls the shared predicate and nothing of its own', (fn) => {
    const body = bodyOf(winningDefinition(fn).sql, fn);
    expect(
      body.includes(PREDICATE),
      `${fn} does not call ${PREDICATE} — a private copy of the match is how the ` +
        'numerators drifted apart in the first place'
    ).toBe(true);
    // The old private match, spelled out inline, must be gone: no reader may
    // pair a period equality with a timetable equality on its own again.
    expect(
      /f\.period_id\s*=\s*[^\s]+\s+AND\s+f\.timetable_id\s*=/i.test(body),
      `${fn} still carries an inline period+timetable match`
    ).toBe(false);
  });

  it('every reader still requires feedback inside the window it required before', () => {
    // Decision #11 is not what this change is about, and must survive it.
    for (const fn of ['fn_scf_confirmation_status', 'fn_scf_my_confirmed_attendance', 'fn_scf_effective_attendance']) {
      const body = bodyOf(winningDefinition(fn).sql, fn);
      expect(/f\.created_at\s*<=/.test(body), `${fn} dropped the in-window rule`).toBe(true);
      expect(/Asia\/Kolkata/.test(body), `${fn} lost its IST anchor`).toBe(true);
    }
  });

  it('the rollup carries the same rule as its second join', () => {
    const body = bodyOf(winningDefinition('fn_scf_confirmation_rollup').sql, 'fn_scf_confirmation_rollup');
    expect(/fbc\.course_id\s*=/.test(body), 'the rollup lost its block-course join').toBe(true);
    // The DISTINCT is load-bearing: a learner can have several feedback rows for
    // one course in a day, which is the whole point of a block course.
    expect(/SELECT\s+DISTINCT\s+f\.student_id,\s*f\.attendance_date,\s*f\.course_id/i.test(body)).toBe(true);
  });

  it('every course_id cast goes through the uuid guard', () => {
    const fix = migrations.find((m) => m.version === THIS_FIX_VERSION)!;
    const clean = stripSqlComments(fix.sql);
    // The unguarded form is what raises 22P02 on a malformed value and aborts
    // the whole read for everyone in the document.
    expect(
      /NULLIF\(\s*[a-z.]*(period\.value|pv)\s*->>\s*'course_id'\s*,\s*''\s*\)\s*::\s*uuid/i.test(clean),
      'a course_id is still cast with NULLIF(...)::uuid, which only covers the empty string'
    ).toBe(false);
    expect(clean.includes(`${UUID_GUARD}(`)).toBe(true);
  });

  it('the pending list, which decides what a learner is OFFERED, still consolidates', () => {
    const body = bodyOf(
      winningDefinition('fn_scf_pending_for_learner').sql,
      'fn_scf_pending_for_learner'
    );
    expect(/f\.course_id\s*=/.test(body)).toBe(true);
  });

  it('the behaviour harness exists and is wired to this migration', () => {
    expect(existsSync(HARNESS), 'supabase/tests/scf-block-course/run.sh is missing').toBe(true);
    expect(readFileSync(HARNESS, 'utf8')).toContain(THIS_FIX_VERSION);
  });

  it('behaviour: the SQL harness passes against a real database', () => {
    // Runs the real functions against seeded rows. Skipped, loudly, when no
    // local Postgres is reachable — a skip must never read as a pass.
    const probe = spawnSync('psql', ['-d', 'postgres', '-tAc', 'select 1'], {
      encoding: 'utf8',
      env: { ...process.env, PGHOST: process.env.PGHOST ?? '127.0.0.1', PGPORT: process.env.PGPORT ?? '5432' },
    });
    if (probe.status !== 0) {
      console.warn(
        '[scf-block-course] SKIPPED the behaviour harness: no local Postgres on ' +
          `${process.env.PGHOST ?? '127.0.0.1'}:${process.env.PGPORT ?? '5432'}. ` +
          'Run `bash supabase/tests/scf-block-course/run.sh` where one is available.'
      );
      return;
    }
    const run = spawnSync('bash', [HARNESS], { encoding: 'utf8', cwd: ROOT, timeout: 120_000 });
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    expect(out, out.slice(-2000)).toContain('ALL SCENARIOS PASSED');
    expect(run.status, out.slice(-2000)).toBe(0);
  }, 130_000);
});
