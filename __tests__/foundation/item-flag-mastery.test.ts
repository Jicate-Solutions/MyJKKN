/**
 * Foundation — "report a problem with this question".
 *
 * Two kinds of assertion live here, and they are NOT the same strength:
 *
 *  (a) CONTRACT tests read the migration SQL and assert on its text. They prove
 *      the shipped statement says what this PR claims — including that the
 *      CREATE OR REPLACE of fn_fp_recompute_weakness kept every security
 *      property of the version it replaces. A rewrite that silently drops
 *      SECURITY DEFINER, the search_path pin, the NULL guard or the
 *      fn_fp_can_view_student check is a regression, not a refactor, and these
 *      fail on it.
 *
 *  (b) SEMANTIC tests model the WHERE clause and run the same aggregate the SQL
 *      runs. They prove the arithmetic of the suppression: which rows survive
 *      the predicate and what mastery_score the survivors average to. They
 *      model the SQL rather than execute it — there is no Postgres in CI.
 *
 * The fixtures are not invented. They reproduce a real production learner+topic
 * (fp_responses as of 2026-07-31: 1 correct of 3, mastery 0.3333), and the
 * expected numbers below were measured against production first with the
 * rewritten predicate, read-only:
 *   no flags                          -> 0.3333 over 3 responses
 *   open flag on a wrong-answered Q   -> 0.5000 over 2
 *   open flag on a right-answered Q   -> 0.0000 over 2
 *   that flag dismissed               -> 0.3333 over 3   (restored exactly)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20260731040000_fp_item_flags.sql',
);
const SQL = readFileSync(MIGRATION, 'utf8');

/** SQL with comments stripped — a commented-out clause must never count. */
const LIVE_SQL = SQL.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------------------
// (b) Semantics — the predicate this migration adds to the recompute
// ---------------------------------------------------------------------------

type Response = { item_id: string; is_correct: boolean | null };
type Flag = {
  item_id: string;
  status: 'open' | 'dismissed' | 'fixed';
  flagged_by: string;
};

/**
 * Models the rewritten body of fn_fp_recompute_weakness for a single topic.
 *
 * Suppression is THRESHOLDED (Director, 2026-07-31): a question is removed from
 * mastery only once `threshold` DISTINCT people hold an OPEN report on it. One
 * careless tap must not hide a good question from every learner.
 *
 * The threshold is a platform_policies row
 * (`foundation.item_flag.suppress_threshold`, default 2), read once per call via
 * fn_get_policy_int — not a constant. It is config because the pool of people
 * who can currently report is tiny (one school facilitator), so 2 may prove
 * unreachable until a learner-facing surface exists; that must be a one-row
 * UPDATE to correct, not a migration.
 *
 * `is_correct IS TRUE` is deliberate, not `= true`: a NULL (an item whose answer
 * key was missing at grading time) counts as 0, never as unknown.
 *
 * count(DISTINCT flagged_by) ignores NULLs, so an unattributed report is not a
 * second witness. The DB also carries uq_fp_item_flags_open_per_reporter —
 * UNIQUE (item_id, flagged_by) WHERE status='open' AND flagged_by IS NOT NULL —
 * so one person cannot manufacture a second vote by reporting twice.
 */
function recomputeTopic(
  responses: Response[],
  flags: Flag[],
  threshold = 2,
): { attempts_count: number; mastery_score: number } | null {
  const effective = Math.max(1, threshold);
  const reportersByItem = new Map<string, Set<string>>();
  for (const f of flags) {
    if (f.status !== 'open' || !f.flagged_by) continue;
    if (!reportersByItem.has(f.item_id)) reportersByItem.set(f.item_id, new Set());
    reportersByItem.get(f.item_id)!.add(f.flagged_by);
  }
  const suppressed = new Set(
    [...reportersByItem.entries()]
      .filter(([, people]) => people.size >= effective)
      .map(([item]) => item),
  );

  const kept = responses.filter((r) => !suppressed.has(r.item_id));

  // CRITICAL: the aggregate carries `GROUP BY i.topic_id`, and GROUP BY over an
  // empty set yields ZERO ROWS — not one row holding NULL. (A bare
  // `SELECT avg(x) ... WHERE false` does return one NULL row; adding GROUP BY
  // does not.) So when every response is suppressed the INSERT..SELECT produces
  // nothing, ON CONFLICT never fires, and any cached fp_student_weakness row
  // would survive stale. Returning null models "no row produced", which is what
  // the companion DELETE in the migration then cleans up.
  if (kept.length === 0) return null;

  return {
    attempts_count: kept.length,
    mastery_score:
      kept.reduce((n, r) => n + (r.is_correct === true ? 1 : 0), 0) /
      kept.length,
  };
}

/** Real production shape: 3 responses across 3 items, 1 correct. */
const RESPONSES: Response[] = [
  { item_id: 'q-right', is_correct: true },
  { item_id: 'q-wrong-a', is_correct: false },
  { item_id: 'q-wrong-b', is_correct: false },
];

const ANN = 'user-ann';
const BOB = 'user-bob';
const round4 = (n: number | null) => (n === null ? null : Number(n.toFixed(4)));

describe('one report is not enough — suppression needs N distinct people', () => {
  it('with no reports, every response counts (production baseline 0.3333 over 3)', () => {
    const r = recomputeTopic(RESPONSES, []);
    expect(r!.attempts_count).toBe(3);
    expect(round4(r!.mastery_score)).toBe(0.3333);
  });

  it('ONE open report does NOT suppress the question', () => {
    // The Director's decision, and the whole point of the threshold: a single
    // careless or mistaken tap must not remove a good question from every
    // learner in every institution.
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
    ]);
    expect(r!.attempts_count).toBe(3);
    expect(round4(r!.mastery_score)).toBe(0.3333);
  });

  it('TWO DIFFERENT people suppress it — mastery rises when a wrong one goes', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
      { item_id: 'q-wrong-a', status: 'open', flagged_by: BOB },
    ]);
    expect(r!.attempts_count).toBe(2);
    expect(round4(r!.mastery_score)).toBe(0.5);
  });

  it('TWO DIFFERENT people suppress it — mastery falls when a right one goes', () => {
    // Suppression must not be a way to inflate a score. It removes the question,
    // whichever direction that moves the number.
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-right', status: 'open', flagged_by: ANN },
      { item_id: 'q-right', status: 'open', flagged_by: BOB },
    ]);
    expect(r!.attempts_count).toBe(2);
    expect(round4(r!.mastery_score)).toBe(0);
  });

  it('the SAME person reporting twice is still one witness, not two', () => {
    // Defence in depth: the DB's partial unique index already prevents these two
    // rows existing. If it ever did, DISTINCT must still refuse to count them.
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
    ]);
    expect(r!.attempts_count).toBe(3);
  });

  it('two people reporting DIFFERENT questions suppress neither', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
      { item_id: 'q-wrong-b', status: 'open', flagged_by: BOB },
    ]);
    expect(r!.attempts_count).toBe(3);
  });

  it('an unattributed report is not a witness', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
      { item_id: 'q-wrong-a', status: 'open', flagged_by: '' },
    ]);
    expect(r!.attempts_count).toBe(3);
  });

  it('threshold is CONFIG — at 1, a single report suppresses again', () => {
    // Proves the knob is real. If one school facilitator turns out to be too
    // thin a pool to ever reach 2, this is a one-row UPDATE, not a deploy.
    const r = recomputeTopic(
      RESPONSES,
      [{ item_id: 'q-wrong-a', status: 'open', flagged_by: ANN }],
      1,
    );
    expect(r!.attempts_count).toBe(2);
    expect(round4(r!.mastery_score)).toBe(0.5);
  });

  it('a threshold of 0 is floored to 1 — it must never suppress everything', () => {
    const r = recomputeTopic(RESPONSES, [], 0);
    expect(r!.attempts_count).toBe(3);
  });
});

describe('a fully suppressed topic loses its cached row', () => {
  it('every question suppressed produces NO ROW — the stale score must be deleted', () => {
    // Without the companion DELETE, ON CONFLICT never fires and the PREVIOUS
    // mastery_score survives forever. Measured on production before the fix: 9
    // cached rows, 0 rows produced, all 9 surviving with a stale 0.5000 average.
    const r = recomputeTopic(
      RESPONSES,
      RESPONSES.flatMap((x) => [
        { item_id: x.item_id, status: 'open' as const, flagged_by: ANN },
        { item_id: x.item_id, status: 'open' as const, flagged_by: BOB },
      ]),
    );
    expect(r).toBeNull();
  });

  it('a topic with any surviving response keeps its row', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
      { item_id: 'q-wrong-a', status: 'open', flagged_by: BOB },
    ]);
    expect(r).not.toBeNull();
    expect(r!.attempts_count).toBe(2);
  });
});

describe('resolving a report restores the question', () => {
  it('dropping below the threshold restores it exactly', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open', flagged_by: ANN },
      { item_id: 'q-wrong-a', status: 'dismissed', flagged_by: BOB },
    ]);
    expect(r!.attempts_count).toBe(3);
    expect(round4(r!.mastery_score)).toBe(0.3333);
  });

  it('FIXED counts the same as dismissed — only OPEN suppresses', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'fixed', flagged_by: ANN },
      { item_id: 'q-wrong-a', status: 'fixed', flagged_by: BOB },
    ]);
    expect(r!.attempts_count).toBe(3);
    expect(round4(r!.mastery_score)).toBe(0.3333);
  });
});

// ---------------------------------------------------------------------------
// (a) Contract — what the migration actually ships
// ---------------------------------------------------------------------------

describe('migration contract — the suppression predicate', () => {
  it('adds the NOT EXISTS clause to the recompute, uncommented', () => {
    const normalised = LIVE_SQL.replace(/\s+/g, ' ');
    expect(normalised).toContain(
      "NOT EXISTS ( SELECT 1 FROM fp_item_flags f WHERE f.item_id = i.id AND f.status = 'open' )",
    );
  });

  it("suppresses on 'open' only — no other status appears in the predicate", () => {
    // Anchor on the subquery itself. `IF NOT EXISTS` appears earlier in the file
    // (CREATE TABLE / CREATE INDEX), so a bare indexOf('NOT EXISTS') lands on the
    // table definition and its status CHECK, which does mention every status.
    const m = LIVE_SQL.match(
      /NOT EXISTS\s*\(\s*SELECT 1 FROM fp_item_flags f[\s\S]*?\)/,
    );
    expect(m).not.toBeNull();
    const clause = m![0];
    expect(clause).toContain("f.status  = 'open'");
    expect(clause).not.toContain('dismissed');
    expect(clause).not.toContain('fixed');
  });
});

describe('migration contract — the replaced RPC keeps every security property', () => {
  const fnBody = LIVE_SQL.slice(
    LIVE_SQL.indexOf('CREATE OR REPLACE FUNCTION public.fn_fp_recompute_weakness'),
  );

  it('keeps the same signature', () => {
    expect(fnBody).toContain('p_student_id        uuid');
    expect(fnBody).toContain('p_exam_definition_id uuid');
    expect(fnBody).toContain('RETURNS void');
  });

  it('keeps SECURITY DEFINER and the search_path pin', () => {
    expect(fnBody).toContain('SECURITY DEFINER');
    expect(fnBody).toContain('SET search_path = public');
  });

  it('keeps the NULL guard', () => {
    expect(fnBody).toContain('IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN');
    expect(fnBody).toContain('RAISE EXCEPTION');
  });

  it('keeps the fn_fp_can_view_student authorization check with its 42501', () => {
    expect(fnBody).toContain('IF NOT fn_fp_can_view_student(p_student_id) THEN');
    expect(fnBody).toContain("USING ERRCODE = '42501'");
  });

  it('re-locks the replaced function from anon', () => {
    expect(fnBody).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) FROM anon, PUBLIC;',
    );
    expect(fnBody).toContain(
      'GRANT  EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) TO authenticated;',
    );
  });
});

// ---------------------------------------------------------------------------
// anon reachability
// ---------------------------------------------------------------------------

describe('anon cannot reach the flags table', () => {
  it('revokes the Supabase default grant and enables RLS', () => {
    expect(LIVE_SQL).toContain(
      'REVOKE ALL ON TABLE public.fp_item_flags FROM anon, PUBLIC;',
    );
    expect(LIVE_SQL).toContain(
      'ALTER TABLE public.fp_item_flags ENABLE ROW LEVEL SECURITY;',
    );
  });

  it('grants nothing to anon anywhere in the migration', () => {
    const grantsToAnon = LIVE_SQL.split(';')
      .filter((s) => /\bGRANT\b/i.test(s))
      .filter((s) => /\banon\b/i.test(s));
    expect(grantsToAnon).toEqual([]);
  });

  it('scopes every policy TO authenticated — never TO public', () => {
    const policies = LIVE_SQL.match(/CREATE POLICY[\s\S]*?(?=CREATE POLICY|COMMIT|$)/gi) ?? [];
    expect(policies.length).toBe(4);
    for (const p of policies) {
      expect(p).toMatch(/\bTO authenticated\b/);
      expect(p).not.toMatch(/\bTO (public|anon)\b/i);
    }
  });

  it('passes the real CI anon/RLS gate as a subprocess (the signal CI reads)', () => {
    const script = path.resolve(
      process.cwd(),
      'scripts/ci/check-table-anon-revoke.mjs',
    );
    let code = 0;
    let out = '';
    try {
      out = execFileSync('node', [script, '--verbose', '--files', MIGRATION], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e: unknown) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    expect(out).toContain('fp_item_flags');
    expect(code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// who may do what
// ---------------------------------------------------------------------------

describe('permission model in the policies', () => {
  const policy = (name: string) => {
    const start = LIVE_SQL.indexOf(`CREATE POLICY ${name}`);
    expect(start).toBeGreaterThan(-1);
    const rest = LIVE_SQL.slice(start);
    return rest.slice(0, rest.indexOf(';') + 1);
  };

  it('raising binds the report to the person raising it, and to open', () => {
    const p = policy('fp_item_flags_raise');
    expect(p).toContain('FOR INSERT');
    expect(p).toContain('flagged_by = auth.uid()');
    expect(p).toContain("status = 'open'");
  });

  it('closing a report needs foundation.items.manage — never a role name', () => {
    const p = policy('fp_item_flags_resolve');
    expect(p).toContain('FOR UPDATE');
    expect(p).toContain("public.user_has_permission('foundation.items.manage')");
    // The person who raised it is NOT a party to the resolve policy: a report
    // its author can close is not a review.
    expect(p).not.toContain('flagged_by');
    expect(p).not.toMatch(/profiles\.role|role\s*=\s*'/);
  });

  it('the reader of a report is a reviewer, or its author, and nobody else', () => {
    const p = policy('fp_item_flags_read');
    expect(p).toContain("public.user_has_permission('foundation.items.view')");
    expect(p).toContain("public.user_has_permission('foundation.items.manage')");
    expect(p).toContain('flagged_by = auth.uid()');
  });

  it('nothing may be deleted except by a super admin — flags are an audit trail', () => {
    const p = policy('fp_item_flags_delete');
    expect(p).toContain('FOR DELETE');
    expect(p).toContain('public.is_super_admin()');
  });

  it('the delete policy can actually fire — the table grant carries DELETE', () => {
    // A policy without the matching table grant is unreachable, and "super
    // admin only" then silently means "nobody, ever".
    expect(LIVE_SQL).toContain(
      'GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.fp_item_flags TO authenticated;',
    );
  });

  it('reuses permission keys that already exist in the catalogue', () => {
    // A page or policy that requires a key absent from permissions.ts is a key
    // nobody can ever grant through Role Management.
    const catalogue = readFileSync(
      path.resolve(process.cwd(), 'lib/constants/permissions.ts'),
      'utf8',
    );
    for (const key of ['foundation.items.view', 'foundation.items.manage']) {
      expect(catalogue).toContain(`'${key}'`);
    }
  });
});

describe('table shape', () => {
  it('constrains status to the three states and defaults to open', () => {
    expect(LIVE_SQL).toMatch(/status\s+text NOT NULL DEFAULT 'open'/);
    expect(LIVE_SQL).toContain("CHECK (status IN ('open', 'dismissed', 'fixed'))");
  });

  it('indexes the two columns every read filters on', () => {
    expect(LIVE_SQL).toContain('ON public.fp_item_flags (item_id)');
    expect(LIVE_SQL).toContain('ON public.fp_item_flags (status)');
  });

  it('allows only one open report per person per question', () => {
    expect(LIVE_SQL).toContain('uq_fp_item_flags_open_per_reporter');
    expect(LIVE_SQL).toMatch(/WHERE status = 'open' AND flagged_by IS NOT NULL/);
  });
});

// ---------------------------------------------------------------------------
// Contract — the THRESHOLD migration (20260731050000)
// ---------------------------------------------------------------------------

const THRESHOLD_MIGRATION = path.resolve(
  process.cwd(),
  'supabase/migrations/20260731050000_fp_item_flag_threshold.sql',
);
const THRESHOLD_SQL = readFileSync(THRESHOLD_MIGRATION, 'utf8');
/** Comments stripped — a commented-out clause must never satisfy a check. */
const THRESHOLD_LIVE = THRESHOLD_SQL.replace(/--[^\n]*/g, '').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('migration contract — suppression is thresholded and config-driven', () => {
  it('seeds the policy row with the Director-decided default of 2', () => {
    expect(THRESHOLD_LIVE).toMatch(/foundation\.item_flag\.suppress_threshold/);
    expect(THRESHOLD_LIVE).toMatch(/INSERT\s+INTO\s+platform_policies/i);
    expect(THRESHOLD_LIVE).toMatch(/'2'::jsonb/);
    // idempotent — re-running must not duplicate the policy row
    expect(THRESHOLD_LIVE).toMatch(/WHERE\s+NOT\s+EXISTS/i);
  });

  it('reads the threshold from config, never a hard-coded literal', () => {
    expect(THRESHOLD_LIVE).toMatch(
      /fn_get_policy_int\(\s*'foundation\.item_flag\.suppress_threshold'/,
    );
  });

  it('floors the threshold at 1 so a 0 can never suppress everything', () => {
    expect(THRESHOLD_LIVE).toMatch(/greatest\(\s*\n?\s*1\s*,/);
  });

  it('counts DISTINCT reporters, so one person cannot suppress alone', () => {
    const distinctChecks = THRESHOLD_LIVE.match(
      /count\(DISTINCT\s+f\.flagged_by\)\s*>=\s*v_threshold/gi,
    );
    // once in the INSERT predicate, once in the DELETE companion — both must
    // use the SAME rule or a topic could be emptied on one basis and cleaned on
    // another.
    expect(distinctChecks?.length).toBe(2);
  });

  it('keeps the DELETE companion that clears an emptied topic', () => {
    expect(THRESHOLD_LIVE).toMatch(/DELETE\s+FROM\s+fp_student_weakness/i);
  });

  it('preserves every security property of the function it replaces', () => {
    expect(THRESHOLD_LIVE).toMatch(/SECURITY\s+DEFINER/i);
    expect(THRESHOLD_LIVE).toMatch(/SET\s+search_path\s*=\s*public/i);
    expect(THRESHOLD_LIVE).toMatch(/fn_fp_can_view_student/);
    expect(THRESHOLD_LIVE).toMatch(/42501/);
    expect(THRESHOLD_LIVE).toMatch(/are required/);
    expect(THRESHOLD_LIVE).toMatch(/ON\s+CONFLICT/i);
    expect(THRESHOLD_LIVE).toMatch(
      /REVOKE\s+EXECUTE[\s\S]{0,120}?FROM\s+anon,\s*PUBLIC/i,
    );
  });
});
