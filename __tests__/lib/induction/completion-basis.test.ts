/**
 * Guard tests for migration
 * 20261018000000_induction_completion_basis_and_mentoring_track.sql —
 * "a learner is judged on sittings that have already happened, and the
 *  year-long mentoring track is judged on its own".
 *
 * WHY A SOURCE-READING TEST AND NOT A DATABASE ONE. The lib unit suite runs
 * with no database, no secret and no network (.github/workflows/lib-unit-suite
 * .yml), and no job in this repo applies migrations to a scratch Postgres
 * before running tests. A test needing a live server would therefore never run
 * at all — the outcome that already leaves ~122 of 212 test files dark. Reading
 * the migration off disk is what CAN be enforced on every pull request.
 *
 * The behaviour itself WAS executed, against a real Postgres, before this
 * migration was committed: production's superseded definitions were installed
 * on a fixture, scored, then replaced by this migration and re-scored. Those
 * results are in the pull-request body. What follows guards the properties that
 * run against them from being quietly undone by a later edit:
 *   - moving the date test from the ON clause into a WHERE, which turns the
 *     LEFT JOIN into an inner join and drops every learner with no qualifying
 *     sitting out of the rollup instead of resetting them to a truthful zero
 *   - dropping `IS NOT NULL`, so an undated sitting flips from excluded to
 *     counted through three-valued logic
 *   - flipping the comparison, which inverts "has happened" into "has not"
 *   - losing the mentor-check-in split, which folds a year-long relationship
 *     back into a week of induction talks
 *   - excluding the registration sittings by accident along with them
 *   - hardcoding the mentoring bar instead of reading its config row
 *   - letting a zero denominator read as complete
 *   - correcting only the recompute path and not the trigger, which carries a
 *     SECOND copy of the same denominator and would then silently fail to
 *     promote the very learners this migration is for
 *   - the migration and its supabase/setup mirror drifting apart
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20261018000000_induction_completion_basis_and_mentoring_track.sql',
);
const SETUP_FUNCTIONS = path.resolve(process.cwd(), 'supabase/setup/02_functions.sql');

const sql = readFileSync(MIGRATION, 'utf8');

/**
 * THE TWO WRITERS. Both reach induction_completion.outcome_complete, and both
 * derive it from their OWN copy of the denominator — this is the whole reason
 * every case below is driven through both.
 *
 *   RECOMPUTE    fn_induction_recompute_completion(uuid)
 *                Called by the admin/coordinator recompute and by the
 *                attendance writers (fn_induction_mark_attendance,
 *                fn_induction_mark_day_attendance). Authoritative: it
 *                OVERWRITES outcome_complete and can move a learner either way.
 *
 *   ON_FEEDBACK  fn_induction_completion_on_feedback()
 *                The AFTER INSERT / AFTER UPDATE statement-level triggers on
 *                event_session_feedback. Does NOT call RECOMPUTE — it carries a
 *                SECOND copy of the same CTE.
 *
 * induction_multipath_completion_option2.sql created both in one commit. Its
 * header at line 16 states that RECOMPUTE "becomes the SINGLE authority for
 * outcome_complete", and line 137 of the same file has ON_FEEDBACK writing
 * outcome_complete itself. The prose describes the intended design; the code
 * below it forked. Line 51 and line 115 are the two copies.
 *
 * WHY THE FORK STAYED INVISIBLE, and why every assertion here is doubled: the
 * merge at line 137 is monotonic —
 *     outcome_complete = induction_completion.outcome_complete
 *                        OR EXCLUDED.outcome_complete
 * — so a stale denominator on that path CANNOT demote anyone. It can only
 * decline to promote the exact learners a denominator fix is for. There is no
 * regression to notice and nothing to report. A test that drove only RECOMPUTE
 * would have passed against precisely that.
 */
const RECOMPUTE = 'fn_induction_recompute_completion';
const ON_FEEDBACK = 'fn_induction_completion_on_feedback';

const MENTOR_KIND = 'mentor_checkin';
/** The mentoring bar's config column, asserted in both places it appears. */
const MENTORING_PCT_COLUMN = 'completion_mentoring_pct';

/**
 * Strip `--` line comments WITHOUT corrupting string literals — the header
 * prose contains `--` and so do several inline notes, so a naive regex would
 * truncate real SQL and make every comparison below meaningless. Tracks
 * single-quote state, honouring the '' escape.
 */
function stripSqlComments(input: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (input[i + 1] === "'") {
          out += input[++i];
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '-' && input[i + 1] === '-') {
      while (i < input.length && input[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

/** Executable SQL only: comments gone, whitespace flattened. */
function executable(input: string): string {
  return stripSqlComments(input).replace(/\s+/g, ' ').trim();
}

/** The body of one CREATE OR REPLACE FUNCTION block, `$function$` delimited. */
function functionBody(source: string, fnName: string): string {
  const at = source.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
  expect(at, `${fnName} not defined in this source`).toBeGreaterThan(-1);
  const open = source.indexOf('$function$', at);
  const close = source.indexOf('$function$', open + '$function$'.length);
  expect(close, `${fnName} body is not $function$ delimited`).toBeGreaterThan(open);
  return source.slice(open + '$function$'.length, close);
}

const recomputeExec = executable(functionBody(sql, RECOMPUTE));
const feedbackExec = executable(functionBody(sql, ON_FEEDBACK));
/** Every shared case runs against both writers, labelled by which one it drives. */
const BOTH_WRITERS: [string, () => string][] = [
  [`${RECOMPUTE} — the authoritative recompute`, () => recomputeExec],
  [`${ON_FEEDBACK} — the trigger on event_session_feedback`, () => feedbackExec],
];


describe('induction completion basis — only what has already happened counts', () => {
  it.each(BOTH_WRITERS)('%s admits a sitting only once it has begun', (_writer, get) => {
    expect(get()).toContain('s.start_at IS NOT NULL AND s.start_at <= now()');
  });

  it.each(BOTH_WRITERS)('%s keeps the date test in the ON clause, never a WHERE', (_writer, get) => {
    // In a WHERE, the LEFT JOIN collapses to an inner join and a learner with no
    // qualifying sitting vanishes from the result — their rollup row is then
    // left frozen at its old value rather than reset to a truthful zero.
    const body = get();
    const join = body.slice(body.indexOf('LEFT JOIN public.event_sessions s'));
    const nextJoin = join.indexOf('LEFT JOIN public.event_session_attendance');
    expect(nextJoin).toBeGreaterThan(-1);
    expect(join.slice(0, nextJoin)).toContain('s.start_at <= now()');
    expect(body).not.toMatch(/WHERE[^;]{0,120}s\.start_at/);
  });

  it.each(BOTH_WRITERS)('%s measures backwards from now(), not forwards and not a fixed date', (_writer, get) => {
    expect(get()).not.toContain('s.start_at >= now()');
    expect(get()).not.toContain('s.start_at > now()');
    expect(get()).not.toContain('CURRENT_DATE');
  });

  it('states the undated decision rather than inheriting it from NULL logic', () => {
    // event_sessions.start_at is NOT NULL today, so this branch is unreachable
    // on production and the assertion is about the NEXT schema change. Without
    // the explicit IS NOT NULL, a later rewrite to `NOT (start_at > now())`
    // flips an undated sitting from excluded to counted, silently.
    expect(recomputeExec).toContain('s.start_at IS NOT NULL');
    expect(feedbackExec).toContain('s.start_at IS NOT NULL');
  });
});

describe('induction completion basis — the mentoring track is counted apart', () => {
  it('excludes mentor check-ins from the induction denominator in BOTH paths', () => {
    expect(recomputeExec).toContain(`s.kind IS DISTINCT FROM '${MENTOR_KIND}'`);
    expect(feedbackExec).toContain(`s.kind IS DISTINCT FROM '${MENTOR_KIND}'`);
  });

  it('leaves registration sittings counting toward induction', () => {
    // 20260827030000 typed those rows as ordinary induction sittings that have
    // already occurred. Excluding them alongside the check-ins would shrink the
    // denominator further than the ruling asks.
    expect(recomputeExec).not.toContain("'registration'");
    expect(feedbackExec).not.toContain("'registration'");
  });

  it('counts the mentoring basis with its own aggregates, not by reusing total', () => {
    expect(recomputeExec).toContain(`count(DISTINCT s.id) FILTER (WHERE s.kind = '${MENTOR_KIND}')`);
    expect(recomputeExec).toContain(
      `count(DISTINCT s.id) FILTER (WHERE s.kind = '${MENTOR_KIND}' AND a.status IN ('present','od'))`,
    );
  });

  it('reads the mentoring bar from its config row instead of hardcoding it', () => {
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${MENTORING_PCT_COLUMN} INTEGER NOT NULL DEFAULT 75`);
    expect(recomputeExec).toContain(MENTORING_PCT_COLUMN);
    expect(recomputeExec).toContain('v_mnpct');
    // The bar must never appear as a literal in the decision itself.
    expect(recomputeExec).not.toMatch(/>=\s*75\b/);
  });

  it('cannot call the track complete before a single check-in has come due', () => {
    // Every learner sits at m_total = 0 until the first check-in of the year.
    // A zero denominator has to read as "not yet", never as vacuously cleared —
    // the same shape the two induction limbs beside it already use.
    expect(recomputeExec).toContain(
      `(att.m_total > 0 AND (100.0 * att.m_attended / att.m_total) >= v_mnpct)`,
    );
    expect(recomputeExec).toContain('CASE WHEN att.m_total = 0 THEN 0');
  });

  it('keeps the first date the track was cleared instead of re-dating it', () => {
    expect(recomputeExec).toContain(
      'COALESCE(induction_completion.mentoring_completed_at, now())',
    );
  });

  it('does not fold mentoring into the feedback trigger, which cannot observe it', () => {
    // Mentoring is attendance-based; a feedback write cannot change it. The
    // trigger must therefore leave those columns entirely alone rather than
    // writing a stale value over a fresher one.
    expect(feedbackExec).not.toContain('mentoring_');
  });
});

describe('induction completion basis — what must NOT have changed', () => {
  it('deletes nothing', () => {
    // Removing the mentor check-in rows was proposed and retracted; the
    // mentoring programme's own record has to survive.
    const exec = executable(sql);
    expect(exec).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(exec).not.toMatch(/\bTRUNCATE\b/i);
    expect(exec).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('keeps every authorization branch on the recompute gate', () => {
    for (const branch of [
      'is_super_admin()',
      'is_admin()',
      "user_has_permission('induction.manage')",
      'role_has_institution_access(v_inst)',
      'public.fn_induction_is_event_coordinator(p_event_id)',
      'public.fn_induction_is_event_speaker(p_event_id)',
    ]) {
      expect(recomputeExec).toContain(branch);
    }
  });

  it('keeps the referral limb on the conflict arm', () => {
    expect(recomputeExec).toContain(
      'outcome_complete = (EXCLUDED.outcome_complete OR induction_completion.referrals_submitted >= 1)',
    );
  });

  it('keeps the living gate monotonic', () => {
    expect(feedbackExec).toContain(
      'outcome_complete = induction_completion.outcome_complete OR EXCLUDED.outcome_complete',
    );
  });

  it('leaves the two feedback triggers in place rather than recreating them', () => {
    // Dropping a live trigger to recreate it identical opens a window in which
    // feedback writes recompute nothing.
    expect(sql).not.toMatch(/DROP TRIGGER IF EXISTS trg_induction_completion_on_feedback/);
    expect(sql).not.toMatch(/CREATE TRIGGER trg_induction_completion_on_feedback/);
  });

  it('keeps both functions SECURITY DEFINER with a pinned search_path', () => {
    for (const fn of [RECOMPUTE, ON_FEEDBACK]) {
      const header = sql.slice(
        sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`),
        sql.indexOf('$function$', sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`)),
      );
      expect(header, fn).toMatch(/SECURITY DEFINER/);
      expect(header, fn).toMatch(/SET search_path TO 'public'/);
    }
  });
});

describe('induction completion basis — the fork cannot re-open', () => {
  // The defect was never one wrong line; it was two copies of the same line and
  // a header claiming there was one. These assert the shape of the FILE rather
  // than either writer, so correcting one and forgetting the other fails here
  // even if every per-writer case above were somehow satisfied.

  it('leaves exactly two denominator CTEs in the migration, no more', () => {
    // A third copy is the next instance of this bug. If one is ever added
    // deliberately, this test is the place to say so out loud.
    //   RECOMPUTE:   total + attended + rated + m_total + m_attended = 5
    //   ON_FEEDBACK: total + attended + rated                        = 3
    const copies = executable(sql).match(/count\(DISTINCT s\.id\)/g) ?? [];
    expect(copies).toHaveLength(8);
  });

  it('guards EVERY denominator in the file, not just the one being edited', () => {
    // The date guard is counted against the number of joins onto event_sessions.
    // Correcting one writer and not the other makes these two numbers disagree.
    const exec = executable(sql);
    const joins = exec.match(/LEFT JOIN public\.event_sessions s/g) ?? [];
    const guards = exec.match(/s\.start_at IS NOT NULL AND s\.start_at <= now\(\)/g) ?? [];
    expect(joins.length).toBeGreaterThan(1);
    expect(guards).toHaveLength(joins.length);
  });

  it('accounts for mentor check-ins on every one of those joins', () => {
    // Either excluded outright (the trigger) or split out and counted on its own
    // (the recompute). What must not exist is a join that silently folds them
    // back into the induction denominator.
    const exec = executable(sql);
    const joins = (exec.match(/LEFT JOIN public\.event_sessions s/g) ?? []).length;
    const excluded = (exec.match(/s\.kind IS DISTINCT FROM 'mentor_checkin'/g) ?? []).length;
    expect(excluded).toBeGreaterThanOrEqual(joins);
  });
});

describe('induction completion basis — grants', () => {
  it('locks the recompute RPC to signed-in callers', () => {
    // Supabase's default privileges hand anon a DIRECT execute grant on every
    // function, separate from PUBLIC, and this one has carried no explicit
    // grant statement since it was created.
    expect(sql).toMatch(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${RECOMPUTE}\\(uuid\\) FROM anon, PUBLIC;`),
    );
    expect(sql).toMatch(
      new RegExp(`GRANT  EXECUTE ON FUNCTION public\\.${RECOMPUTE}\\(uuid\\) TO authenticated;`),
    );
  });

  it('never makes the trigger function callable as an RPC', () => {
    expect(sql).toMatch(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${ON_FEEDBACK}\\(\\) FROM anon, PUBLIC;`),
    );
    expect(sql).not.toMatch(
      new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${ON_FEEDBACK}\\(\\) TO authenticated`),
    );
  });
});

describe('induction completion basis — supabase/setup mirror', () => {
  // CLAUDE.md keeps function definitions in supabase/setup/02_functions.sql.
  // Neither of these two was mirrored before; both are now, and a mirror that
  // silently drifts is a second source of truth that disagrees.
  const setupFunctions = readFileSync(SETUP_FUNCTIONS, 'utf8');

  it.each([
    [RECOMPUTE, () => recomputeExec],
    [ON_FEEDBACK, () => feedbackExec],
  ])('mirrors %s with byte-identical executable SQL', (fn, get) => {
    expect(executable(functionBody(setupFunctions, fn))).toBe(get());
  });

  it('carries the grants into the mirror too', () => {
    expect(setupFunctions).toMatch(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${RECOMPUTE}\\(uuid\\) FROM anon, PUBLIC;`),
    );
    expect(setupFunctions).toMatch(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${ON_FEEDBACK}\\(\\) FROM anon, PUBLIC;`),
    );
  });
});
