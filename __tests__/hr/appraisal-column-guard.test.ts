// =====================================================================
// HR appraisals — the column guard, read as text
// =====================================================================
// HONEST LIMIT, READ FIRST. This repo has no pgTAP and no database test
// runner, and this session has no database to run against. These tests
// therefore READ the migration and assert its shape. They do NOT execute
// the trigger, so they prove the rule is WRITTEN, not that it FIRES.
//
// A runnable rehearsal that DOES execute it is committed at
// __tests__/hr/fixtures/appraisal-column-guard.rehearsal.sql, for a human
// to run inside a transaction against a branch database and roll back. It
// is kept out of supabase/migrations/ on purpose: the deploy wave reads a
// migration's version from its filename prefix, so a rehearsal sitting
// there would have claimed the real migration's version.
//
// What this still buys: every column the reviewer named is checked to be
// listed in the right branch, so a later edit that quietly drops one
// fails here. That is the failure mode worth catching in CI.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/20270501090100_hr_appraisal_column_guard.sql'),
  'utf8',
);

/** The text of one guard branch, so a column cannot be checked in the wrong one. */
function branch(name: 'insert' | 'self' | 'hod'): string {
  if (name === 'insert') {
    return SQL.slice(SQL.indexOf("IF TG_OP = 'INSERT'"), SQL.indexOf('-- ── UPDATE'));
  }
  const updates = SQL.slice(SQL.indexOf('-- ── UPDATE'));
  if (name === 'self') {
    return updates.slice(updates.indexOf('IF v_self THEN'), updates.indexOf('IF v_hod THEN'));
  }
  return updates.slice(updates.indexOf('IF v_hod THEN'));
}

describe('the trigger is actually installed', () => {
  it('fires before insert and before update, per row', () => {
    expect(SQL).toContain('BEFORE INSERT OR UPDATE ON public.hr_performance_reviews');
    expect(SQL).toContain('FOR EACH ROW EXECUTE FUNCTION public.fn_hr_performance_review_guard()');
  });

  it('is dropped first, so re-applying it cannot leave two copies', () => {
    expect(SQL).toContain('DROP TRIGGER IF EXISTS trg_hr_performance_review_guard');
  });

  it('is locked away from signed-out callers, per the project rule', () => {
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_hr_performance_review_guard\(\) FROM anon, PUBLIC/);
  });

  it('runs as definer with a pinned search path', () => {
    expect(SQL).toContain('SECURITY DEFINER');
    expect(SQL).toContain('SET search_path = public');
  });
});

describe('a team member cannot write another tier', () => {
  // Exactly the columns the reviewer named, plus the two routing columns.
  const forbidden = [
    'supervisor_review_jsonb',
    'sedc_review_jsonb',
    'final_score',
    'final_remarks',
    'final_approved_at',
    'final_approved_by',
    'supervisor_reviewed_at',
    'sedc_reviewed_at',
  ];

  it.each(forbidden)('refuses a change to %s', (col) => {
    expect(branch('self')).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
  });

  it('still lets them write their own appraisal', () => {
    expect(branch('self')).not.toContain('NEW.self_appraisal_jsonb IS DISTINCT FROM OLD.self_appraisal_jsonb');
  });

  it('refuses a brand-new row that already carries another tier', () => {
    for (const col of forbidden) {
      expect(branch('insert')).toContain(`NEW.${col} IS NOT NULL`);
    }
  });

  it('refuses a row created for somebody else', () => {
    expect(branch('insert')).toContain('IF NOT v_self THEN');
  });
});

describe('a head of department cannot write another tier', () => {
  const forbidden = [
    'self_appraisal_jsonb',
    'sedc_review_jsonb',
    'final_score',
    'final_remarks',
    'final_approved_at',
    'final_approved_by',
    'self_submitted_at',
    'sedc_reviewed_at',
  ];

  it.each(forbidden)('refuses a change to %s', (col) => {
    expect(branch('hod')).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
  });

  it('still lets them write their own review', () => {
    expect(branch('hod')).not.toContain('NEW.supervisor_review_jsonb IS DISTINCT FROM OLD.supervisor_review_jsonb');
  });
});

describe('the routing columns nobody but an admin may touch', () => {
  it('pins cycle_id and staff_id for every non-admin update', () => {
    const updates = SQL.slice(SQL.indexOf('-- ── UPDATE'));
    const shared = updates.slice(0, updates.indexOf('IF v_self THEN'));
    expect(shared).toContain('NEW.cycle_id IS DISTINCT FROM OLD.cycle_id');
    expect(shared).toContain('NEW.staff_id IS DISTINCT FROM OLD.staff_id');
  });
});

describe('the Collegiality example is enforced underneath the screens', () => {
  it('checks each tier as it hands on, not while it is a draft', () => {
    for (const status of ['self_submitted', 'supervisor_reviewed', 'sedc_reviewed']) {
      expect(SQL).toContain(`NEW.status = '${status}'`);
    }
    expect(SQL).toContain("#>> '{ratings,collegiality}' = 'below'");
  });

  it('defaults the safeguard ON when the policy key is absent', () => {
    expect(SQL).toContain("(v_policy ->> 'collegiality_below_requires_example')::boolean, true");
  });

  it('keeps the safeguard on when the policy cannot be read at all', () => {
    expect(SQL).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(SQL).toContain('v_policy := NULL;');
  });

  it('uses the same 20-character floor as the screens', () => {
    expect(SQL.match(/< 20 THEN/g)?.length).toBe(3);
  });
});

describe('it fails closed', () => {
  it('refuses a caller who is party to nothing', () => {
    expect(SQL).toContain('you are not a party to this appraisal');
  });

  it('raises check_violation so the refusal is legible, not a 500', () => {
    expect(SQL.match(/ERRCODE = 'check_violation'/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('treats the subject as the subject even when they are also the head', () => {
    // v_self is tested BEFORE v_hod, so nobody writes their own supervisor review.
    const updates = SQL.slice(SQL.indexOf('-- ── UPDATE'));
    expect(updates.indexOf('IF v_self THEN')).toBeLessThan(updates.indexOf('IF v_hod THEN'));
  });
});

// ---------------------------------------------------------------------------
// The rehearsal exists, covers each hole, and cannot be mistaken for a migration
// ---------------------------------------------------------------------------

describe('the runnable rehearsal', () => {
  const REHEARSAL = readFileSync(
    join(process.cwd(), '__tests__/hr/fixtures/appraisal-column-guard.rehearsal.sql'),
    'utf8',
  );

  it('is not in the migrations folder, where it would claim a real version', () => {
    // The applier greps '^supabase/migrations/[0-9]+_' and keeps the 14-digit
    // stem, so a rehearsal there collides with the migration it rehearses.
    expect(() =>
      readFileSync(
        join(process.cwd(), 'supabase/migrations/20270501090100_hr_appraisal_column_guard.rehearsal.sql'),
        'utf8',
      ),
    ).toThrow();
  });

  it('rolls back whatever happens', () => {
    expect(REHEARSAL).toContain('BEGIN;');
    expect(REHEARSAL.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  });

  it('exercises the write that mattered most', () => {
    // Final approval derives the score from sedc_review_jsonb, so a staff
    // member writing that column is the worst case, not final_score.
    expect(REHEARSAL).toContain('SET sedc_review_jsonb');
  });

  it('fails loudly if any forbidden write succeeds', () => {
    expect(REHEARSAL).toContain('RAISE WARNING');
    expect(REHEARSAL).toContain('HOLE:');
    expect(REHEARSAL).toContain('RAISE EXCEPTION');
  });

  it('counts its refusals rather than eyeballing the log', () => {
    expect(REHEARSAL).toContain('IF v_failed = v_expected THEN');
  });
});

// ---------------------------------------------------------------------------
// Review round 2 — three things the blind reviewer caught that I had missed
// ---------------------------------------------------------------------------

describe('the old group-wide year constraint is removed', () => {
  const CYCLE_SQL = readFileSync(
    join(process.cwd(), 'supabase/migrations/20270501090000_hr_appraisal_cycle_institution_and_writer_policies.sql'),
    'utf8',
  );

  it('drops it by name, or per-college rounds never engage at all', () => {
    // 20260617 shipped UNIQUE (cycle_year) across the whole group. With it in
    // place the SECOND college to open a 2027 round gets a duplicate-key error
    // before any partial index is consulted.
    expect(CYCLE_SQL).toContain(
      'DROP CONSTRAINT IF EXISTS hr_performance_review_cycles_year_unique',
    );
  });

  it('drops it IF EXISTS, because production may already differ from the repo', () => {
    // Target the DROP statement, not the comment above it that names the
    // constraint — the first mention in the file is prose.
    const dropLine = CYCLE_SQL.split('\n').find(
      (l) => l.includes('DROP CONSTRAINT') && l.includes('hr_performance_review_cycles_year_unique'),
    );
    expect(dropLine).toBeDefined();
    expect(dropLine).toContain('IF EXISTS');
  });

  it('replaces it with one round per college per year', () => {
    expect(CYCLE_SQL).toMatch(
      /uniq_hr_perf_cycle_year_per_institution[\s\S]*?cycle_year, institution_id[\s\S]*?WHERE institution_id IS NOT NULL/,
    );
  });

  it('and one group-wide round per year — NULLs do not compare, so it needs its own index', () => {
    expect(CYCLE_SQL).toMatch(
      /uniq_hr_perf_cycle_year_group_wide[\s\S]*?\(cycle_year\)[\s\S]*?WHERE institution_id IS NULL/,
    );
  });

  it('still allows only one OPEN round per college at a time', () => {
    expect(CYCLE_SQL).toContain('uniq_hr_perf_cycle_open_per_institution');
    expect(CYCLE_SQL).toContain('uniq_hr_perf_cycle_open_group_wide');
  });
});

describe('the rehearsal can actually reach its checks', () => {
  const REHEARSAL = readFileSync(
    join(process.cwd(), '__tests__/hr/fixtures/appraisal-column-guard.rehearsal.sql'),
    'utf8',
  );

  it('takes an admin identity BEFORE the setup insert', () => {
    // The guard fires on the setup insert too. With no claim it sees neither
    // an admin nor the subject and refuses at line 1, so checks 1-7 never ran.
    const adminClaim = REHEARSAL.indexOf("set_config('request.jwt.claim.sub', v_admin");
    const firstInsert = REHEARSAL.indexOf('INSERT INTO public.hr_performance_reviews');
    expect(adminClaim).toBeGreaterThan(-1);
    expect(adminClaim).toBeLessThan(firstInsert);
  });

  it('creates BOTH rounds under the admin claim, before handing over', () => {
    const staffClaim = REHEARSAL.indexOf("set_config('request.jwt.claim.sub', v_profile");
    const lastCycleInsert = REHEARSAL.lastIndexOf('INSERT INTO public.hr_performance_review_cycles');
    expect(lastCycleInsert).toBeLessThan(staffClaim);
  });

  it('stops with a clear reason when no super admin exists to set up with', () => {
    expect(REHEARSAL).toContain('No super admin profile found');
  });
});

describe('sending back stamps the SENDER, never the tier it returns to', () => {
  const SERVICE = readFileSync(
    join(process.cwd(), 'lib/services/hr/performance-review-service.ts'),
    'utf8',
  );

  it('never writes self_appraisal_jsonb on a send-back', () => {
    // A head returning an appraisal from self_submitted wrote into the team
    // member's own tier, which the guard correctly refuses for a head — so the
    // send-back failed outright.
    const fn = SERVICE.slice(SERVICE.indexOf('static async sendBack'));
    const stamp = fn.slice(fn.indexOf('const stampColumn'), fn.indexOf('const existingPayload'));
    expect(stamp).not.toContain('self_appraisal_jsonb');
  });

  it('falls to the supervisor tier, which is who is sending at that point', () => {
    const fn = SERVICE.slice(SERVICE.indexOf('static async sendBack'));
    const stamp = fn.slice(fn.indexOf('const stampColumn'), fn.indexOf('const existingPayload'));
    expect(stamp).toContain("'supervisor_review_jsonb'");
    expect(stamp).toContain("'sedc_review_jsonb'");
  });
});
