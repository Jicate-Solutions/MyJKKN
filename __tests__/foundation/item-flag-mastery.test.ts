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
 * (fp_responses as of 2026-08-08: 1 correct of 3, mastery 0.3333), and the
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
  'supabase/migrations/20260808110000_fp_item_flags.sql',
);
const SQL = readFileSync(MIGRATION, 'utf8');

/** SQL with comments stripped — a commented-out clause must never count. */
const LIVE_SQL = SQL.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------------------
// (b) Semantics — the predicate this migration adds to the recompute
// ---------------------------------------------------------------------------

type Response = { item_id: string; is_correct: boolean | null };
type Flag = { item_id: string; status: 'open' | 'dismissed' | 'fixed' };

/**
 * Models the rewritten body of fn_fp_recompute_weakness for a single topic:
 *
 *   avg((r.is_correct IS TRUE)::int)  over  fp_responses r JOIN fp_items i
 *   WHERE ... AND NOT EXISTS (SELECT 1 FROM fp_item_flags f
 *                              WHERE f.item_id = i.id AND f.status = 'open')
 *
 * `is_correct IS TRUE` is deliberate, not `= true`: a NULL (an item whose
 * answer key was missing at grading time) counts as 0, never as unknown.
 */
function recomputeTopic(responses: Response[], flags: Flag[]) {
  const suppressed = new Set(
    flags.filter((f) => f.status === 'open').map((f) => f.item_id),
  );
  const kept = responses.filter((r) => !suppressed.has(r.item_id));
  return {
    attempts_count: kept.length,
    mastery_score:
      kept.length === 0
        ? null
        : kept.reduce((n, r) => n + (r.is_correct === true ? 1 : 0), 0) /
          kept.length,
  };
}

/** Real production shape: 3 responses across 3 items, 1 correct. */
const RESPONSES: Response[] = [
  { item_id: 'q-right', is_correct: true },
  { item_id: 'q-wrong-a', is_correct: false },
  { item_id: 'q-wrong-b', is_correct: false },
];

const round4 = (n: number | null) => (n === null ? null : Number(n.toFixed(4)));

describe('flagging a question removes it from mastery_score', () => {
  it('with no flags, every response counts (production baseline 0.3333 over 3)', () => {
    const r = recomputeTopic(RESPONSES, []);
    expect(r.attempts_count).toBe(3);
    expect(round4(r.mastery_score)).toBe(0.3333);
  });

  it('an OPEN flag drops that question — mastery rises when a wrong one goes', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'open' },
    ]);
    expect(r.attempts_count).toBe(2);
    expect(round4(r.mastery_score)).toBe(0.5);
  });

  it('an OPEN flag drops that question — mastery falls when a right one goes', () => {
    // The control must not be a way to inflate a score. Suppression is neutral:
    // it removes the question, whichever direction that moves the number.
    const r = recomputeTopic(RESPONSES, [{ item_id: 'q-right', status: 'open' }]);
    expect(r.attempts_count).toBe(2);
    expect(round4(r.mastery_score)).toBe(0);
  });

  it('flagging every question in a topic leaves no score rather than a zero', () => {
    // A learner whose whole topic is under review has not scored 0; they have
    // no measurement. avg() over an empty set is NULL in SQL, not 0.
    const r = recomputeTopic(
      RESPONSES,
      RESPONSES.map((x) => ({ item_id: x.item_id, status: 'open' as const })),
    );
    expect(r.attempts_count).toBe(0);
    expect(r.mastery_score).toBeNull();
  });
});

describe('resolving a flag restores the question', () => {
  it('DISMISSED restores it exactly — back to the 0.3333 baseline', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-wrong-a', status: 'dismissed' },
    ]);
    expect(r.attempts_count).toBe(3);
    expect(round4(r.mastery_score)).toBe(0.3333);
  });

  it('FIXED restores it too', () => {
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-right', status: 'fixed' },
    ]);
    expect(r.attempts_count).toBe(3);
    expect(round4(r.mastery_score)).toBe(0.3333);
  });

  it('one open flag still suppresses even when another on the same question is closed', () => {
    // Two people report the same question; a reviewer closes one. The question
    // is still under review, so it must still be out.
    const r = recomputeTopic(RESPONSES, [
      { item_id: 'q-right', status: 'dismissed' },
      { item_id: 'q-right', status: 'open' },
    ]);
    expect(r.attempts_count).toBe(2);
    expect(round4(r.mastery_score)).toBe(0);
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
