/**
 * Guard tests for migration 20260901160000_induction_early_rating_guard.sql —
 * "a sitting that has not happened yet cannot be rated".
 *
 * WHY A SOURCE-READING TEST AND NOT A DATABASE ONE. The lib unit suite runs with
 * no database, no secret and no network (see .github/workflows/lib-unit-suite.yml),
 * and there is no job anywhere in this repo that applies migrations to a scratch
 * Postgres before running tests. A test that needed a live server would therefore
 * never run at all — the outcome that has already left ~122 of 212 test files
 * dark. Reading the migration off disk is what CAN be enforced on every PR, so
 * that is what these assert, in the same spirit as __tests__/ci/.
 *
 * The assertions are chosen to catch the ways this guard could be *quietly*
 * broken by a later edit while still looking correct:
 *   - dropping the anon revoke (Supabase's default privileges hand anon EXECUTE
 *     on every new function, so silence here means "callable by the public")
 *   - swapping now() for NEW.created_at, which reads as a simplification and
 *     silently refuses corrections made during a live sitting
 *   - flipping the comparison, which turns "not started yet" into "already over"
 *   - losing the induction_programs scoping join, which would apply an
 *     induction's rule to every future event type writing these tables
 *   - the seeded policy default and the in-code fallback drifting apart, so the
 *     guard behaves one way with the row present and another way without it
 *   - the migration and its supabase/setup/ mirror diverging
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20260901160000_induction_early_rating_guard.sql',
);
const SETUP_FUNCTIONS = path.resolve(process.cwd(), 'supabase/setup/02_functions.sql');
const SETUP_TRIGGERS = path.resolve(process.cwd(), 'supabase/setup/04_triggers.sql');

const sql = readFileSync(MIGRATION, 'utf8');

/** The tolerance default, asserted in three places below so they cannot drift. */
const DEFAULT_TOLERANCE_MINUTES = 10080;
const POLICY_KEY = 'induction.feedback.early_capture_minutes';

/**
 * Strip `--` line comments WITHOUT corrupting string literals. The guard's own
 * error messages contain `--` ("It cannot be rated yet -- %."), so a naive
 * regex stripper would truncate them mid-string and make every comparison below
 * meaningless. Tracks single-quote state, honouring the '' escape.
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

const guardBody = functionBody(sql, 'fn_induction_assert_session_started');
const guardExec = executable(guardBody);

describe('induction early-rating guard — the predicate', () => {
  it('is SECURITY DEFINER with a pinned search_path', () => {
    // SECURITY DEFINER is load-bearing: the guard runs inside a learner's INSERT
    // and a learner cannot necessarily SELECT event_sessions. As INVOKER the
    // lookup returns NOT FOUND on a row that exists.
    const header = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_induction_assert_session_started'),
      sql.indexOf('$function$'),
    );
    expect(header).toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/SET search_path TO 'public'/);
  });

  it('revokes EXECUTE from anon, authenticated AND PUBLIC — all three named', () => {
    // Supabase ships ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon
    // and to authenticated, as DIRECT grants separate from PUBLIC. Revoking
    // PUBLIC alone leaves the function callable by anyone holding the anon key —
    // and that key ships in every JS bundle.
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_induction_assert_session_started\(uuid\) FROM anon, authenticated, PUBLIC;/,
    );
  });

  it('never grants itself back to authenticated — that is the PR #3130 shape', () => {
    // scripts/ci/check-secdef-anon-revoke.mjs refuses a SECURITY DEFINER function
    // every signed-in user can call with no authorization check in its body, and
    // a guard whose whole job is to RAISE has none to show. The only caller is
    // the SECURITY DEFINER trigger adapter, which executes as its OWNER — so the
    // grant would add reachability and buy nothing.
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_induction_assert_session_started\([^)]*\) TO authenticated/,
    );
  });

  it('scopes itself to inductions via induction_programs', () => {
    // These event_* tables carry induction rows only today. A marathon or a
    // tournament writing them later must not inherit an induction's rule.
    expect(guardExec).toContain('public.induction_programs ip');
    expect(guardExec).toContain('ip.event_id = s.event_id');
  });

  it('no-ops for a non-induction session rather than refusing it', () => {
    expect(guardExec).toMatch(/IF NOT v_is_induction THEN RETURN; END IF;/);
  });

  it('fails CLOSED when the session cannot be found', () => {
    // The opposite of the non-induction case, and the distinction is the point:
    // "not an induction" is none of the guard's business, but "no such sitting"
    // is the least verifiable row the table can hold.
    const notFound = guardExec.slice(guardExec.indexOf('IF NOT FOUND THEN'));
    expect(notFound.slice(0, 200)).toContain('RAISE EXCEPTION');
    expect(notFound.slice(0, 200)).not.toContain('RETURN;');
  });

  it('fails CLOSED on a NULL start_at instead of taking the ELSE branch', () => {
    const nullBranch = guardExec.slice(guardExec.indexOf('IF v_start_at IS NULL THEN'));
    expect(nullBranch.slice(0, 200)).toContain('RAISE EXCEPTION');
  });

  it('reads its tolerance from platform_policies, clamped at zero', () => {
    // The row is Director-editable with no review and no deploy. A stray minus
    // sign on a large number would refuse ALL induction feedback platform-wide;
    // GREATEST caps that blast radius at "as if the tolerance were zero".
    expect(guardExec).toContain(
      `GREATEST( fn_get_policy_int('${POLICY_KEY}', ${DEFAULT_TOLERANCE_MINUTES}, NULL), 0 )`,
    );
  });

  it('compares against now(), never NEW.created_at', () => {
    // All three writers upsert via ON CONFLICT ... DO UPDATE, and that arm does
    // not touch created_at — a re-rating keeps the FIRST capture's timestamp.
    // Testing NEW.created_at would refuse a coordinator correcting one of the
    // 4,080 already-early rows WHILE the sitting is in progress.
    expect(guardExec).toContain('IF now() < v_earliest THEN');
    expect(guardExec).not.toContain('NEW.created_at');
  });

  it('measures the window backwards from start_at, not forwards', () => {
    // A flipped sign here still compiles, still refuses some writes, and inverts
    // the rule into "cannot be rated until long after it ended".
    expect(guardExec).toContain('v_earliest := v_start_at - make_interval(mins => v_tolerance)');
    expect(guardExec).not.toContain('v_start_at + make_interval');
  });
});

describe('induction early-rating guard — the trigger', () => {
  it('fires BEFORE INSERT OR UPDATE on event_session_feedback', () => {
    // INSERT alone would leave the re-rating path (ON CONFLICT DO UPDATE)
    // ungated, and that arm is just as much a rating of a sitting that has not
    // happened as the first write was.
    expect(executable(sql)).toContain(
      'CREATE TRIGGER trg_b_induction_require_session_started BEFORE INSERT OR UPDATE ON public.event_session_feedback FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_session_started();',
    );
  });

  it('sorts AFTER the live gate, which is what puts the better message first', () => {
    // Postgres fires row triggers in alphabetical name order. Asserting the
    // ORDERING rather than the spelling means a rename that preserves the
    // property still passes, and one that breaks it fails.
    const live = 'trg_a_induction_require_live';
    const mine = 'trg_b_induction_require_session_started';
    expect(mine > live).toBe(true);
    // ...and still ahead of the completion/touch triggers already on the table.
    expect(mine < 'trg_induction_completion').toBe(true);
    expect(mine < 'trg_touch_updated_at').toBe(true);
  });

  it('leaves the existing live gate untouched', () => {
    // This guard is added ALONGSIDE fn_induction_assert_live, never in place of
    // it. A migration that dropped or redefined the live gate while adding this
    // one would silently trade one protection for another.
    expect(sql).not.toMatch(/DROP TRIGGER IF EXISTS trg_a_induction_require_live/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.fn_induction_assert_live/);
    expect(sql).not.toMatch(/DROP FUNCTION[^;]*fn_induction_assert_live/);
  });
});

describe('induction early-rating guard — the config row', () => {
  it('seeds the policy idempotently', () => {
    const exec = executable(sql);
    expect(exec).toContain('INSERT INTO public.platform_policies');
    expect(exec).toContain(`'${POLICY_KEY}'`);
    expect(exec).toContain('WHERE NOT EXISTS');
  });

  it('seeds the SAME default the function falls back to', () => {
    // If these drift, the guard behaves one way with the row present and another
    // way without it — and the difference only shows up in an environment where
    // the seed did not run.
    expect(executable(sql)).toContain(`'${DEFAULT_TOLERANCE_MINUTES}'::jsonb`);
    expect(guardExec).toContain(`, ${DEFAULT_TOLERANCE_MINUTES}, NULL)`);
  });

  it('is registered as a global number policy', () => {
    const exec = executable(sql);
    expect(exec).toContain("'global', NULL,");
    expect(exec).toContain("'number',");
  });
});

describe('induction early-rating guard — supabase/setup mirror', () => {
  // CLAUDE.md: functions live in supabase/setup/02_functions.sql, triggers in
  // 04_triggers.sql. The live gate (20260821120000) mirrored both. A mirror that
  // silently drifts from its migration is worse than no mirror — it is a second
  // source of truth that disagrees.
  const setupFunctions = readFileSync(SETUP_FUNCTIONS, 'utf8');
  const setupTriggers = readFileSync(SETUP_TRIGGERS, 'utf8');

  it('mirrors the predicate with byte-identical executable SQL', () => {
    const mirrored = executable(functionBody(setupFunctions, 'fn_induction_assert_session_started'));
    // Comments may differ (the migration carries the full reasoning); the SQL
    // that actually runs may not.
    expect(mirrored).toBe(guardExec);
  });

  it('mirrors the trigger adapter', () => {
    const migrationAdapter = executable(functionBody(sql, 'trg_induction_require_session_started'));
    const setupAdapter = executable(
      functionBody(setupFunctions, 'trg_induction_require_session_started'),
    );
    expect(setupAdapter).toBe(migrationAdapter);
    expect(migrationAdapter).toContain(
      'PERFORM public.fn_induction_assert_session_started(NEW.session_id);',
    );
  });

  it('mirrors the trigger itself', () => {
    expect(executable(setupTriggers)).toContain(
      'CREATE TRIGGER trg_b_induction_require_session_started BEFORE INSERT OR UPDATE ON public.event_session_feedback FOR EACH ROW EXECUTE FUNCTION public.trg_induction_require_session_started();',
    );
  });

  it('carries the narrowed revoke into the mirror too', () => {
    expect(setupFunctions).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_induction_assert_session_started\(uuid\) FROM anon, authenticated, PUBLIC;/,
    );
  });
});
