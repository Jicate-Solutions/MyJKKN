/**
 * The confirmed-with-feedback readers must keep recognising block-course
 * sibling periods — and must keep the two rules the Director set on them.
 *
 * Why a guard and not just a migration: this defect was RE-INTRODUCED once
 * already. 20260718200000 taught fn_scf_pending_for_learner to consolidate
 * sibling periods of a block-scheduled course by course_id, so a learner is
 * offered exactly one feedback per course per day. 20260731 then aligned the
 * confirmation tick to exact (period_id, timetable_id) matching, which put the
 * withheld siblings back in the unconfirmed column. Eight reports followed
 * (BUG-004651/690/707/728/741 and BUG-005120/005178/005491, clusters 0961c22e
 * and 3149b52f), all saying the same sentence: I submitted my feedback and it
 * still says Not Yet Confirmed.
 *
 * So the assertion is on the definition that WINS a full ordered apply — the
 * last migration in version order to define each function, which is the body
 * production ends up with. A future "align the family" migration that reverts
 * the consolidation fails here instead of reaching a learner.
 *
 * It is deliberately a text guard, not a behaviour test: these are SECURITY
 * DEFINER reads over student_attendance's JSONB and auth.uid(), so exercising
 * them needs a seeded database this suite does not have. What the guard can
 * prove — that the shipped SQL still says what it must — it proves exactly.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(process.cwd(), 'supabase/migrations');

/** The migration that introduced the consolidation on these two readers. */
const THIS_FIX_VERSION = '20261226000000';

/** The two learner-facing confirmation readers this guard covers. */
const READERS = ['fn_scf_confirmation_status', 'fn_scf_my_confirmed_attendance'] as const;

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

/** SQL line and block comments removed, so a comment can never satisfy a rule. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function definesFunction(sql: string, fn: string): boolean {
  return new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`,
    'i'
  ).test(stripSqlComments(sql));
}

/** The body of `fn`, from its CREATE to the end of its dollar-quoted block. */
function bodyOf(sql: string, fn: string): string {
  const clean = stripSqlComments(sql);
  const start = clean.search(
    new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`, 'i')
  );
  expect(start, `${fn} not found in this SQL`).toBeGreaterThanOrEqual(0);
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

describe('SCF confirmed-with-feedback — block-course sibling periods', () => {
  it('this fix’s migration is in the tree (guards against a vacuous pass)', () => {
    // Every assertion below reads the migration directory. If the file is gone
    // or renamed, they would all pass against whatever else is there.
    expect(migrations.map((m) => m.version)).toContain(THIS_FIX_VERSION);
    const mine = migrations.find((m) => m.version === THIS_FIX_VERSION)!;
    for (const fn of READERS) expect(definesFunction(mine.sql, fn)).toBe(true);
  });

  it.each(READERS)('the winning definition of %s consolidates by course', (fn) => {
    const body = bodyOf(winningDefinition(fn).sql, fn);
    // The feedback match must offer a course branch beside the period branch.
    // Either spelling of the course key counts: the JSONB reader pulls
    // period.value ->> 'course_id', the set-based reader carries it as a column.
    expect(
      /f\.course_id\s*=/.test(body),
      `${fn} matches feedback without any course_id branch — block-course ` +
        'sibling periods would read as never confirmed'
    ).toBe(true);
    expect(/f\.period_id\s*=/.test(body), `${fn} lost its exact-period branch`).toBe(true);
  });

  it.each(READERS)('%s still requires the same timetable and the feedback window', (fn) => {
    const body = bodyOf(winningDefinition(fn).sql, fn);
    // Aligned tick rule, Director 2026-07-31 20:40: same timetable.
    expect(
      /f\.timetable_id\s*=/.test(body),
      `${fn} dropped the same-timetable requirement (Director 2026-07-31)`
    ).toBe(true);
    // Decision #11: only feedback inside session_feedback.window_hours of the
    // class day, anchored at IST midnight, confirms a mark.
    expect(
      /f\.created_at\s*<=/.test(body) && /Asia\/Kolkata/.test(body),
      `${fn} dropped the in-window requirement (decision #11)`
    ).toBe(true);
    expect(
      /window_hours/.test(body),
      `${fn} no longer reads the session_feedback.window_hours lever`
    ).toBe(true);
  });

  it('the pending list, which decides what a learner is OFFERED, still consolidates', () => {
    // The whole argument for the fix: the two readers must not count as
    // unconfirmed a sibling period that this function deliberately withholds.
    // If this consolidation is ever removed, the readers above are wrong again
    // in the opposite direction, and that is worth failing on.
    const body = bodyOf(winningDefinition('fn_scf_pending_for_learner').sql, 'fn_scf_pending_for_learner');
    expect(/f\.course_id\s*=/.test(body)).toBe(true);
  });
});
