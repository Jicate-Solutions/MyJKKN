// =====================================================================
// HR appraisal checks — the migration, read as text
// =====================================================================
// These read 20270505090000 and assert its shape. They prove the rules are
// WRITTEN. That they FIRE is proved by the rehearsal in
// __tests__/hr/fixtures/appraisal-harness.rehearsal.sql, run against a
// throwaway PostgreSQL 16 (see the PR for the result).
//
// The most important check here: the CREATE OR REPLACE of #4081's guard
// keeps every line of the old body, in order. A replace that quietly
// dropped one of the column rules would reopen the hole #4081 closed.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8');
const NEW = read('20270505090000_hr_appraisal_checks_on_the_appraisal.sql');
const OLD = read('20270501090100_hr_appraisal_column_guard.sql');

/** The body of one function, from its CREATE to the closing $$;. */
function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} not found`).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('AS $$', start);
  const close = sql.indexOf('$$;', open + 5);
  return sql.slice(start, close + 3);
}

/** Meaningful lines: trimmed, no blanks, no pure comments. */
function lines(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('--'));
}

describe('the replaced guard keeps every existing rule', () => {
  const oldLines = lines(fnBody(OLD, 'fn_hr_performance_review_guard'));
  const newLines = lines(fnBody(NEW, 'fn_hr_performance_review_guard'));

  it('contains every line of the #4081 body, in the same order', () => {
    let at = 0;
    const lost: string[] = [];
    for (const l of oldLines) {
      const found = newLines.indexOf(l, at);
      if (found === -1) lost.push(l);
      else at = found + 1;
    }
    expect(lost).toEqual([]);
  });

  it('adds only the conditions-first lines', () => {
    const added = newLines.filter((l) => !oldLines.includes(l));
    const body = added.join('\n');
    expect(body).toContain('v_need_conditions');
    expect(body).toContain('fn_hr_appraisal_unanswered_conditions(NEW.supervisor_review_jsonb)');
    // Nothing else of substance was slipped in.
    expect(added.length).toBeLessThanOrEqual(14);
  });

  it('checks conditions before the admin early return, like the Collegiality rule', () => {
    const body = fnBody(NEW, 'fn_hr_performance_review_guard');
    expect(body.indexOf('IF v_need_conditions')).toBeGreaterThan(0);
    expect(body.indexOf('IF v_need_conditions')).toBeLessThan(body.indexOf('IF v_admin THEN'));
  });

  it("keeps #4081's per-college policy read (the appraised person's college, not group-wide)", () => {
    const body = fnBody(NEW, 'fn_hr_performance_review_guard').replace(/\s+/g, ' ');
    expect(body).toContain(
      "fn_get_policy_json( 'hr.performance_review', NULL, (SELECT s.institution_id FROM public.staff s WHERE s.id = NEW.staff_id) )",
    );
    expect(body).not.toContain("fn_get_policy_json('hr.performance_review')");
  });

  it('the second-rating guard reads the same college-scoped policy', () => {
    const g = fnBody(NEW, 'fn_hr_second_rating_guard');
    expect(g).toContain("fn_get_policy_json('hr.performance_review', NULL, v_inst)");
    expect(g).not.toContain("fn_get_policy_json('hr.performance_review')");
  });

  it('only a JSON false switches conditions-first off', () => {
    expect(NEW).toContain("(v_policy -> 'conditions_first_on_below') IS DISTINCT FROM 'false'::jsonb");
  });

  it('re-creates the same trigger, dropped first', () => {
    expect(NEW).toContain('DROP TRIGGER IF EXISTS trg_hr_performance_review_guard ON public.hr_performance_reviews;');
    expect(NEW).toContain('FOR EACH ROW EXECUTE FUNCTION public.fn_hr_performance_review_guard()');
  });
});

describe('the conditions helper matches the app', () => {
  const helper = fnBody(NEW, 'fn_hr_appraisal_unanswered_conditions');

  it('allows exactly the six reasons the screen offers', () => {
    expect(helper).toContain(
      "('time', 'training', 'equipment', 'role_clarity', 'workload', 'other')",
    );
  });

  it('needs a note of ten characters, like CONDITIONS_NOTE_MIN', () => {
    expect(helper).toMatch(/'note'\], ''\)\)\) >= 10/);
  });
});

describe('the second-rating table is locked down', () => {
  it('has RLS on, and anon has nothing', () => {
    expect(NEW).toContain('ALTER TABLE public.hr_performance_review_second_ratings ENABLE ROW LEVEL SECURITY;');
    expect(NEW).toContain('REVOKE ALL ON TABLE public.hr_performance_review_second_ratings FROM anon, PUBLIC;');
  });

  it('uses permission and college-scope checks, never a role name', () => {
    const policies = NEW.slice(NEW.indexOf('-- ── Row-level security'), NEW.indexOf('-- ── Column guard for the second rating'));
    expect(policies).toContain("user_has_permission('hr.performance_reviews.manage')");
    expect(policies).toContain('role_has_institution_access(institution_id)');
    expect(policies).not.toMatch(/role\s*=\s*'/);
    expect(policies).not.toMatch(/head_of_department_id/);
  });

  it('keeps a submitted rating out of reach of edits and deletes', () => {
    const upd = NEW.slice(NEW.indexOf('"hr_perf_second_ratings_update"'), NEW.indexOf('"hr_perf_second_ratings_delete"'));
    expect(upd).toContain('submitted_at IS NULL');
    const del = NEW.slice(NEW.indexOf('CREATE POLICY "hr_perf_second_ratings_delete"'));
    expect(del.slice(0, 400)).toContain('submitted_at IS NULL');
  });

  it('allows one second rater per appraisal', () => {
    expect(NEW).toContain('UNIQUE (review_id)');
  });
});

describe('the second-rating guard', () => {
  const g = fnBody(NEW, 'fn_hr_second_rating_guard');

  it('refuses the person appraised and their own head as second rater', () => {
    expect(g).toContain('IF NEW.rater_id = v_subject THEN');
    expect(g).toContain('IF NEW.rater_id = v_head THEN');
  });

  it('refuses a draft appraisal and a request that arrives already rated', () => {
    expect(g).toContain("IF v_status = 'draft' THEN");
    expect(g).toContain('IF NEW.rating_jsonb IS NOT NULL OR NEW.submitted_at IS NOT NULL THEN');
  });

  it('freezes a submitted rating for everyone', () => {
    expect(g).toContain('IF OLD.submitted_at IS NOT NULL THEN');
  });

  it('stops HR writing the rating itself', () => {
    expect(g).toContain('only the second rater writes the second rating');
    expect(g).toContain('only the second rater submits the second rating');
  });

  it('enforces completeness, the Collegiality example and conditions-first on submit', () => {
    expect(g).toContain('rate every area before submitting');
    expect(g).toContain('a Below in Collegiality needs a written example');
    expect(g).toContain('fn_hr_appraisal_unanswered_conditions(NEW.rating_jsonb)');
  });
});

describe('the evidence function is blind until both are in', () => {
  const e = fnBody(NEW, 'fn_hr_second_rating_evidence');

  it('answers only the assigned rater', () => {
    expect(e).toContain('v_row.rater_id IS DISTINCT FROM auth.uid()');
  });

  it('withholds the first head ratings until both are in', () => {
    expect(e).toContain("CASE WHEN v_both THEN v_review.supervisor_review_jsonb -> 'ratings' ELSE NULL END");
    expect(e).toContain('v_row.submitted_at IS NOT NULL');
  });

  it('never returns the head notes or the committee tier', () => {
    expect(e).not.toContain("'supervisor_review_jsonb'");
    expect(e).not.toContain('sedc_review_jsonb');
    expect(e).not.toContain('final_score');
  });
});

describe('every new function follows the project rules', () => {
  it.each([
    'fn_hr_appraisal_unanswered_conditions(jsonb)',
    'fn_hr_second_rating_evidence(uuid)',
  ])('%s is revoked from anon and PUBLIC, granted to signed-in users', (sig) => {
    expect(NEW).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM anon, PUBLIC;`);
    expect(NEW).toContain(`GRANT  EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
  });

  it.each(['fn_hr_performance_review_guard()', 'fn_hr_second_rating_guard()'])(
    'trigger function %s is revoked from anon and PUBLIC',
    (sig) => {
      expect(NEW).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM anon, PUBLIC;`);
    },
  );

  it('pins the search path on every SECURITY DEFINER function', () => {
    const defs = NEW.split('SECURITY DEFINER').length - 1;
    const pinned = NEW.split('SECURITY DEFINER\nSET search_path = public').length - 1;
    expect(defs).toBe(3);
    expect(pinned).toBe(defs);
  });

  it('calls no outside service and touches nothing to do with pay', () => {
    const code = NEW.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/net\.http|http_post|pg_net|openai|anthropic/i);
    expect(code).not.toMatch(/salary|payroll|hr_pay|monthly_gross|final_score\s*(:=|=)/i);
  });

  it('carries no transaction wrapper, so a rehearsal can roll it back', () => {
    expect(NEW).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(NEW).not.toMatch(/^\s*COMMIT;\s*$/m);
  });
});

describe('same college only (review round 1)', () => {
  const g = fnBody(NEW, 'fn_hr_second_rating_guard');
  const e = fnBody(NEW, 'fn_hr_second_rating_evidence');

  it('the guard checks the rater college on asking AND on reassigning', () => {
    const check = 'WHERE rs.profile_id = NEW.rater_id AND rs.institution_id = v_inst';
    expect(g.split(check).length - 1).toBe(2);
    expect(g.indexOf(check)).toBeLessThan(g.indexOf("-- ── UPDATE"));
    expect(g.lastIndexOf(check)).toBeGreaterThan(g.indexOf("-- ── UPDATE"));
  });

  it('refuses a person with no college, rather than letting anyone rate them', () => {
    expect(g).toContain('IF v_inst IS NULL');
  });

  it('the evidence function refuses on its own when colleges differ', () => {
    expect(e).toContain('WHERE rs.profile_id = auth.uid() AND rs.institution_id = v_inst');
    expect(e.indexOf('rs.institution_id = v_inst')).toBeLessThan(e.indexOf('RETURN jsonb_build_object'));
  });

  it('a plain admin is scoped to their own college everywhere on the new table', () => {
    const policies = NEW.slice(NEW.indexOf('-- ── Row-level security'), NEW.indexOf('-- ── Column guard for the second rating'));
    // is_admin() never stands alone: it is always ANDed with the college check.
    expect(policies).not.toMatch(/OR \(SELECT is_admin\(\)\)\s*\n\s*OR/);
    expect(policies.split("OR (((SELECT is_admin()) OR user_has_permission('hr.performance_reviews.manage'))").length - 1).toBe(5);
    expect(g).toContain('AND COALESCE(role_has_institution_access(v_inst), false)');
  });

  it('HR with the key can read appraisals of its own college only, and cannot write them', () => {
    const pol = NEW.slice(NEW.indexOf('CREATE POLICY "hr_performance_reviews_select_appraisal_hr"'));
    expect(pol).toContain('FOR SELECT');
    expect(pol).toContain('role_has_institution_access(s.institution_id)');
    expect(NEW).not.toMatch(/ON public\.hr_performance_reviews FOR (UPDATE|INSERT|DELETE|ALL)/);
  });
});
