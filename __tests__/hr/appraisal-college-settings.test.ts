// =====================================================================
// HR appraisals — each college's own settings are the ones applied
// =====================================================================
// Round-4 review. The settings page saves hr.performance_review per
// college, but every reader asked for it with no college, so the policy
// resolver only ever returned the group row. A college that switched the
// Collegiality example off (allowed by the Director's 29 Sep ruling) was
// ignored everywhere: on screen, in the database guard, and in the score
// stored at sign-off.
//
// The rule these tests pin: a setting applied TO an appraisal is read for
// the college of the PERSON being appraised, never the viewer's.
// The database side is proven by running it; see the PR comment.
// =====================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PerformanceReviewService } from '@/lib/services/hr/performance-review-service';
import {
  deriveAppraisalScore,
  resolveAreas,
  resolveRatingPoints,
} from '@/lib/hr/appraisal-ratings';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

interface Fake {
  rpcArgs: Array<Record<string, unknown>>;
  staffLookups: unknown[];
  update: Record<string, unknown> | null;
}

/**
 * Stand-in client. `personRow` answers the person's record read, `review` the
 * appraisal read, `policy` every policy read.
 */
function fakeClient(opts: {
  personRow?: { institution_id: string | null } | null;
  review?: Record<string, unknown>;
  policy?: Record<string, unknown> | null;
}) {
  const fake: Fake = { rpcArgs: [], staffLookups: [], update: null };
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      fake.rpcArgs.push(args);
      return { data: opts.policy ?? null, error: null };
    },
    from: (table: string) => {
      if (table === 'staff') {
        return {
          select: () => ({
            eq: (_k: string, v: unknown) => {
              fake.staffLookups.push(v);
              return { maybeSingle: async () => ({ data: opts.personRow ?? null, error: null }) };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: opts.review, error: null }) }),
        }),
        update: (payload: Record<string, unknown>) => {
          fake.update = payload;
          const done = {
            select: () => ({
              single: async () => ({ data: { ...opts.review, ...payload }, error: null }),
              maybeSingle: async () => ({ data: { ...opts.review, ...payload }, error: null }),
            }),
          };
          return { eq: () => ({ ...done, eq: () => done }) };
        },
      };
    },
  };
  return { client: client as never, fake };
}

describe('reading the settings', () => {
  it('asks for the college it is given', async () => {
    const { client, fake } = fakeClient({ policy: {} });
    await PerformanceReviewService.getPolicy(client, 'college-a');
    expect(fake.rpcArgs).toEqual([{ p_key: 'hr.performance_review', p_scope_id: 'college-a' }]);
  });

  it('asks for the group value only when no college is given', async () => {
    const { client, fake } = fakeClient({ policy: {} });
    await PerformanceReviewService.getPolicy(client);
    expect(fake.rpcArgs).toEqual([{ p_key: 'hr.performance_review', p_scope_id: null }]);
  });

  it('for a person, uses the college on that person’s own record', async () => {
    const { client, fake } = fakeClient({ personRow: { institution_id: 'college-b' }, policy: {} });
    await PerformanceReviewService.getPolicyForStaff(client, 'staff-9');
    expect(fake.staffLookups).toEqual(['staff-9']);
    expect(fake.rpcArgs[0]?.p_scope_id).toBe('college-b');
  });

  it('for a person with no college, falls back to the group value', async () => {
    const { client, fake } = fakeClient({ personRow: { institution_id: null }, policy: {} });
    await PerformanceReviewService.getPolicyForStaff(client, 'staff-9');
    expect(fake.rpcArgs[0]?.p_scope_id).toBeNull();
  });
});

describe('the score stored at sign-off follows the person’s own college rule', () => {
  const sedc = {
    ratings: { teaching: 'exceeds', research: 'meets', service: 'meets', collegiality: 'below' },
  };
  const review = { id: 'r1', staff_id: 'staff-9', status: 'sedc_reviewed', sedc_review_jsonb: sedc };

  it('reads the rule for the person’s college, and scores with it', async () => {
    const collegeRule = { rating_points: { exceeds: 4, meets: 1, below: 0 } };
    const { client, fake } = fakeClient({
      personRow: { institution_id: 'college-b' },
      review,
      policy: collegeRule,
    });
    await PerformanceReviewService.finalApprove(client, 'r1', {
      final_remarks: 'ok',
      approver_profile_id: 'dir-1',
    });
    expect(fake.staffLookups).toEqual(['staff-9']);
    expect(fake.rpcArgs).toEqual([{ p_key: 'hr.performance_review', p_scope_id: 'college-b' }]);
    const areas = resolveAreas();
    const expected = deriveAppraisalScore(
      sedc.ratings as never,
      areas,
      resolveRatingPoints(collegeRule),
      collegeRule,
    );
    // Only meaningful if the college rule gives a different score from the
    // default one; otherwise this could pass while reading the group value.
    const byDefault = deriveAppraisalScore(sedc.ratings as never, areas, resolveRatingPoints(null), null);
    expect(expected).not.toBeNull();
    expect(expected).not.toBe(byDefault);
    expect(fake.update?.final_score).toBe(expected);
  });
});

describe('the database guard reads the person’s college', () => {
  const guard = read('supabase/migrations/20270501090100_hr_appraisal_column_guard.sql');

  it('passes the appraised person’s college to the policy reader', () => {
    expect(guard).toMatch(
      /fn_get_policy_json\(\s*'hr\.performance_review',\s*NULL,\s*\(SELECT s\.institution_id FROM public\.staff s WHERE s\.id = NEW\.staff_id\)\s*\)/,
    );
  });

  it('never reads it group-wide only', () => {
    expect(guard).not.toContain("fn_get_policy_json('hr.performance_review')");
  });
});

describe('every screen that applies a rule to an appraisal reads the person’s college', () => {
  const mine = read('app/(routes)/hr/performance-reviews/page.tsx');
  const team = read('app/(routes)/hr/performance-reviews/team/page.tsx');
  const cycle = read('app/(routes)/hr/admin/performance-reviews/cycles/[id]/page.tsx');
  const panel = read('features/hr/appraisal/review-decision-panel.tsx');

  it('the person’s own page passes their college', () => {
    expect(mine).toMatch(/getPolicy\(\s*supabase,\s*\(staff\.institution_id as string \| null\) \?\? null,?\s*\)/);
  });

  it('the head’s page reads it for the person being reviewed, not the head', () => {
    expect(team).toContain('getPolicyForStaff(supabase, r.staff_id)');
    expect(team).not.toMatch(/getPolicy\(supabase\)/);
  });

  it('the committee and Director page reads it for the open appraisal’s person', () => {
    expect(cycle).toContain('getPolicyForStaff(supabase, selectedStaffId)');
    expect(cycle).not.toMatch(/getPolicy\(supabase\)/);
  });

  it('sign-off does not take the screen’s copy of the rule', () => {
    const call = panel.slice(panel.indexOf('finalApprove('), panel.indexOf('});', panel.indexOf('finalApprove(')));
    expect(call).not.toContain('policy');
  });
});
