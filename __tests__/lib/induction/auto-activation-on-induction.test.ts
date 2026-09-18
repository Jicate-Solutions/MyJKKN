/**
 * Guard tests for migration
 * 20260918170000_learner_auto_activate_on_induction.sql —
 * "a learner is activated automatically when induction completes"
 * (Director ruling 2026-09-18 14:30).
 *
 * ── WHAT THIS TEST IS, AND WHAT IT IS NOT ───────────────────────────────────
 *
 * THIS IS A SOURCE-READING TEST. It reads the migration off disk and asserts
 * properties of its SQL TEXT. It does not connect to a database, does not
 * execute a single statement, and therefore CANNOT prove that the trigger
 * behaves correctly — only that the properties that make it correct have not
 * been quietly edited away.
 *
 * The reason is the same one written into completion-basis.test.ts: the lib
 * unit suite runs with no database, no secret and no network
 * (.github/workflows/lib-unit-suite.yml), and no job in this repo applies
 * migrations to a scratch Postgres before running tests. A test needing a live
 * server would never run at all.
 *
 * THE BEHAVIOUR ITSELF WAS EXECUTED, against a real PostgreSQL 16.14, before
 * this was committed — eight assertions with a positive control. Those results
 * are in the pull-request body. What follows guards the properties that produced
 * them from being undone by a later edit:
 *
 *   - widening the eligibility predicate beyond `admitted`, which would sweep
 *     up the 24 inactive / 12 rejected / 9 reserved / 3 account learners who
 *     have a complete induction on production and must not move
 *   - turning the allowlist into a blocklist (`NOT IN`), which fails OPEN the
 *     day a sixteenth lifecycle label is added
 *   - moving the status predicate out of the UPDATE and into the CTE only,
 *     which loses the post-lock re-check and lets a concurrent activation
 *     write a second history row
 *   - dropping the `OLD.outcome_complete IS TRUE` early return, which makes
 *     every recompute of an already-complete row do the work again
 *   - dropping the master-switch read, or reading it with a default of false,
 *     which would silently disable a feature whose shipped state is ON
 *   - turning the add-only policy INSERT into an upsert that overwrites, which
 *     would switch the feature back on every time the file is re-applied over
 *     a switch somebody deliberately turned off
 *   - losing the EXCEPTION handler, which turns a single learner with
 *     inconsistent academic FKs into an aborted induction recompute for a whole
 *     event (trg_validate_learner_semester_year_scope fires BEFORE UPDATE on
 *     ALL columns of learners_profiles)
 *   - losing the audit INSERT, or its reason_code, which is the only trace an
 *     automatic activation leaves
 *   - granting the trigger function to anon or to authenticated
 *   - adding a DELETE / TRUNCATE / DROP TABLE to an add-only migration
 *   - moving the backfill into supabase/migrations/, where it would be applied
 *     automatically instead of on the Director's number
 *   - the migration and its supabase/setup mirrors drifting apart
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20260918170000_learner_auto_activate_on_induction.sql',
);
const BACKFILL = path.resolve(
  process.cwd(),
  'supabase/manual/2026-09-18_backfill_learner_activation_from_induction.sql',
);
const SETUP_FUNCTIONS = path.resolve(process.cwd(), 'supabase/setup/02_functions.sql');
const SETUP_TRIGGERS = path.resolve(process.cwd(), 'supabase/setup/04_triggers.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const backfill = readFileSync(BACKFILL, 'utf8');

/** The migration with every `-- …` comment line removed, so a property can
 *  never be satisfied by prose in the header that describes it. */
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const backfillCode = backfill
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('the signal it hangs on', () => {
  it('is a row trigger on induction_completion, not an edit inside either writer', () => {
    // Both writers of outcome_complete land on this table. A hook inside one of
    // them would be bypassed by the other, and by any third writer added later.
    expect(code).toMatch(
      /CREATE\s+TRIGGER\s+trg_activate_learner_on_induction_complete/i,
    );
    expect(code).toMatch(/ON\s+public\.induction_completion/i);
    expect(code).toMatch(/FOR\s+EACH\s+ROW/i);
  });

  it('fires AFTER, on outcome_complete, and only when it is true', () => {
    // AFTER: the completion must be durable before a learner is moved on it.
    // UPDATE OF outcome_complete: a recompute that only moves attendance_pct
    // must not wake this at all.
    expect(code).toMatch(
      /AFTER\s+INSERT\s+OR\s+UPDATE\s+OF\s+outcome_complete\s+ON\s+public\.induction_completion/i,
    );
    expect(code).toMatch(/WHEN\s*\(\s*NEW\.outcome_complete\s+IS\s+TRUE\s*\)/i);
  });

  it('does not key off the mentoring track', () => {
    // mentoring_complete is a YEAR-LONG relationship judged on its own bar
    // (20261018000000). A learner is not held out of activation for a year.
    expect(code).not.toMatch(/mentoring_complete/i);
  });
});

describe('eligibility is an allowlist of exactly one status', () => {
  it('activates only `admitted`', () => {
    const admittedTests = code.match(/lifecycle_status::text\s*=\s*'admitted'/gi) ?? [];
    expect(admittedTests.length).toBeGreaterThanOrEqual(1);
  });

  it('never names reserved / account / inactive / rejected as eligible', () => {
    // On production 2026-09-18 these four statuses hold 48 learners with a
    // COMPLETE induction. Naming any of them here moves people who must not move.
    for (const forbidden of ['reserved', 'account', 'inactive', 'rejected']) {
      expect(code).not.toMatch(
        new RegExp(`lifecycle_status[^\\n]*'${forbidden}'`, 'i'),
      );
    }
  });

  it('is not a blocklist', () => {
    // `NOT IN (...)` fails OPEN the day a sixteenth enum label is added.
    expect(code).not.toMatch(/lifecycle_status[^\n]*NOT\s+IN\s*\(/i);
  });

  it('keeps the status predicate INSIDE the UPDATE, not only in a CTE', () => {
    // Under READ COMMITTED the UPDATE re-evaluates its WHERE after taking the
    // row lock, so a concurrent activation loses the race cleanly instead of
    // producing a second history row.
    const update = code.slice(
      code.search(/UPDATE\s+public\.learners_profiles/i),
      code.search(/RETURNING\s+lp\.id\s+AS\s+learner_id/i),
    );
    expect(update).toMatch(/lifecycle_status::text\s*=\s*'admitted'/i);
  });
});

describe('idempotency', () => {
  it('returns early when the row was already complete', () => {
    // fn_induction_recompute_completion runs INSERT … ON CONFLICT DO UPDATE on
    // EVERY recompute. Without this, every recompute redoes the work.
    expect(code).toMatch(
      /TG_OP\s*=\s*'UPDATE'\s+AND\s+OLD\.outcome_complete\s+IS\s+TRUE/i,
    );
  });

  it('never writes activated_at itself', () => {
    // trg_set_learner_activated_at stamps it once and never overwrites. A
    // second writer here would move a re-activated learner's seat-fill date.
    expect(code).not.toMatch(/SET[^\n]*activated_at/i);
  });
});

describe('the master switch', () => {
  it('is read through the existing fn_get_policy_bool accessor', () => {
    expect(code).toMatch(
      /fn_get_policy_bool\(\s*'learners\.auto_activate_on_induction'/i,
    );
  });

  it('defaults to TRUE in both the accessor default and the COALESCE fallback', () => {
    // The ruling is that activation "becomes automatic". A default of false
    // anywhere on this path silently ships the feature off.
    const guard = code.slice(
      code.search(/IF\s+NOT\s+COALESCE\(/i),
      code.search(/RETURN\s+NULL;\s*\n\s*END\s+IF;/i),
    );
    expect(guard).toMatch(
      /fn_get_policy_bool\(\s*'learners\.auto_activate_on_induction'\s*,\s*true\s*,/i,
    );
    expect(guard).toMatch(/,\s*true\s*\)\s*THEN/i);
  });

  it('is read before any other work', () => {
    expect(code.search(/fn_get_policy_bool/i)).toBeLessThan(
      code.search(/UPDATE\s+public\.learners_profiles/i),
    );
  });

  it('is seeded add-only, so a re-apply cannot switch it back on', () => {
    expect(code).toMatch(/INSERT\s+INTO\s+public\.platform_policies/i);
    expect(code).toMatch(/WHERE\s+NOT\s+EXISTS\s*\(/i);
    // An upsert that overwrites `value` would resurrect a deliberately-off switch.
    expect(code).not.toMatch(/DO\s+UPDATE\s+SET[^\n]*value/i);
  });
});

describe('fail-soft', () => {
  it('wraps the activation so a raising validator cannot abort the recompute', () => {
    // trg_validate_learner_semester_year_scope fires BEFORE UPDATE on ALL
    // columns of learners_profiles. Aborting here kills induction completion
    // for an entire event, not just for one learner.
    expect(code).toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN/i);
    expect(code).toMatch(/RAISE\s+WARNING/i);
    // …and does NOT re-raise, which would defeat the whole point.
    expect(code).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]{0,400}?RAISE;/i);
  });
});

describe('audit', () => {
  it('writes learners_profile_status_history with its own reason_code', () => {
    expect(code).toMatch(/INSERT\s+INTO\s+public\.learners_profile_status_history/i);
    expect(code).toMatch(/'induction_completed'/);
  });

  it('records the fee consequence in the row itself, not only in the header', () => {
    // Reaching `active` this way skips the notional 60% step the manual
    // activation stood in for. That must be visible in the audit trail.
    expect(code).toMatch(/'fee_thresholds_bypassed'\s*,\s*true/i);
  });

  it('names the induction event that caused it', () => {
    expect(code).toMatch(/'induction_completion_id'\s*,\s*NEW\.id/i);
    expect(code).toMatch(/'event_id'\s*,\s*NEW\.event_id/i);
  });
});

describe('grants', () => {
  it('revokes the trigger function from anon and PUBLIC', () => {
    expect(code).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_activate_learner_on_induction_complete\(\)\s*\n?\s*FROM\s+anon,\s*PUBLIC/i,
    );
  });

  it('grants it to nobody — a trigger function is never called directly', () => {
    expect(code).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_activate_learner_on_induction_complete/i,
    );
  });

  it('is SECURITY DEFINER with a pinned search_path', () => {
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/SET\s+search_path\s*=\s*public/i);
  });
});

describe('the migration is add-only', () => {
  it('carries no DELETE, TRUNCATE or DROP TABLE', () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('carries no BEGIN/COMMIT, so a reviewer rehearsal actually rolls back', () => {
    expect(code).not.toMatch(/^\s*BEGIN\s*;/im);
    expect(code).not.toMatch(/^\s*COMMIT\s*;/im);
  });

  it('does not backfill — a forward-only trigger never sees history', () => {
    // The 155-learner backlog is a held manual file, not this migration.
    expect(code).not.toMatch(/UPDATE\s+public\.learners_profiles[\s\S]{0,200}?EXISTS/i);
  });
});

describe('the backfill is held, not shipped', () => {
  it('lives outside supabase/migrations/, where nothing can auto-apply it', () => {
    expect(existsSync(BACKFILL)).toBe(true);
    expect(BACKFILL).toContain(`supabase${path.sep}manual${path.sep}`);
    expect(BACKFILL).not.toContain(`supabase${path.sep}migrations${path.sep}`);
  });

  it("says so in its own header, with the Director's gate", () => {
    expect(backfill).toMatch(/APPLY ONLY ON THE DIRECTOR'S NUMBER/i);
    expect(backfill).toMatch(/NOT A MIGRATION AND IS NOT AUTO-APPLIED/i);
  });

  it('states the count it will touch', () => {
    expect(backfill).toMatch(/155/);
  });

  it('leaves its write commented out, behind a BEGIN', () => {
    // Uncommented, `psql -f` would run it the moment somebody opened the file
    // against the wrong database.
    expect(backfillCode.trim()).not.toMatch(/UPDATE\s+public\.learners_profiles/i);
    expect(backfill).toMatch(/--\s*BEGIN;/);
    expect(backfill).toMatch(/--\s*ROLLBACK;/);
  });

  it('uses a distinguishable reason_code, and the same allowlist of one', () => {
    expect(backfill).toMatch(/'induction_completed_backfill'/);
    expect(backfill).toMatch(/lifecycle_status::text\s*=\s*'admitted'/i);
  });

  it('carries no DELETE, TRUNCATE or DROP — comments stripped, so the header\'s own "no TRUNCATE" line is not what passes this', () => {
    expect(backfillCode).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(backfillCode).not.toMatch(/\bTRUNCATE\b/i);
    expect(backfillCode).not.toMatch(/\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i);
    // Non-vacuity: stripping comments must not have emptied the file — the
    // STEP 1 read is live SQL and has to survive.
    expect(backfillCode).toMatch(/SELECT[\s\S]+FROM\s+public\.learners_profiles/i);
  });
});

describe('the supabase/setup mirrors do not drift', () => {
  const setupFns = readFileSync(SETUP_FUNCTIONS, 'utf8');
  const setupTrg = readFileSync(SETUP_TRIGGERS, 'utf8');

  it('02_functions.sql carries the function', () => {
    expect(setupFns).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_activate_learner_on_induction_complete\(\)/i,
    );
  });

  it('04_triggers.sql carries the trigger', () => {
    expect(setupTrg).toMatch(
      /CREATE\s+TRIGGER\s+trg_activate_learner_on_induction_complete/i,
    );
    expect(setupTrg).toMatch(
      /AFTER\s+INSERT\s+OR\s+UPDATE\s+OF\s+outcome_complete\s+ON\s+public\.induction_completion/i,
    );
  });

  it('the mirror carries the same allowlist and the same switch', () => {
    const mirror = setupFns.slice(
      setupFns.search(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_activate_learner_on_induction_complete/i,
      ),
    );
    expect(mirror).toMatch(/lifecycle_status::text\s*=\s*'admitted'/i);
    expect(mirror).toMatch(
      /fn_get_policy_bool\(\s*'learners\.auto_activate_on_induction'\s*,\s*true\s*,/i,
    );
    expect(mirror).toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN/i);
    expect(mirror).toMatch(/'induction_completed'/);
  });

  it('the mirror revokes anon and grants nobody', () => {
    const mirror = setupFns.slice(
      setupFns.search(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_activate_learner_on_induction_complete/i,
      ),
    );
    expect(mirror).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION[\s\S]{0,140}FROM\s+anon,\s*PUBLIC/i);
    expect(mirror).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_activate_learner_on_induction_complete/i,
    );
  });
});

describe('the spec exists and states the decisions', () => {
  const SPEC = path.resolve(
    process.cwd(),
    'docs/features/2026-09-18-FEATURE-learner-auto-activation-on-induction.md',
  );

  it('is on disk', () => {
    expect(existsSync(SPEC)).toBe(true);
  });

  it('names the signal, the counts and the notification decision', () => {
    const spec = readFileSync(SPEC, 'utf8');
    expect(spec).toMatch(/induction_completion\.outcome_complete/);
    expect(spec).toMatch(/155/);
    expect(spec).toMatch(/Nobody, by default/i);
  });
});
