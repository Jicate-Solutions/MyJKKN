/**
 * The Director's ruling of 30 Sep 2026: "Appraisal sign-off: the Director CAN
 * change a rating; recorded next to the committee's." (20271009090000; rebuilt on main
 * without #4109, 9 Oct 2026)
 *
 * The database rule itself is rehearsed on a throwaway PostgreSQL 16 by
 * supabase/tests/hr-appraisal-director-rating/run.sh. These pin the migration
 * text and the sign-off logic without a database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PerformanceReviewService } from '@/lib/services/hr/performance-review-service';
import {
  deriveAppraisalScore,
  directorOverrides,
  parseDirectorRatings,
  resolveAreas,
  resolveRatingPoints,
} from '@/lib/hr/appraisal-ratings';

const ROOT = join(__dirname, '..', '..');
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20271009090000_hr_appraisal_director_rating.sql'), 'utf8');

describe('the migration', () => {
  it('is built on main\'s guard alone, and refuses to run over any other body', () => {
    expect(SQL).not.toContain('fn_hr_appraisal_unanswered_conditions');
    expect(SQL).toContain("v_md5 NOT IN ('5c999093e927c9160bbc38d7a957269b', '051e9404166fa008d1f909f530118f08')");
    expect(SQL).toContain("IS DISTINCT FROM '051e9404166fa008d1f909f530118f08'");
  });

  it('adds the column beside the committee’s, never over it', () => {
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS director_review_jsonb jsonb');
    expect(SQL).not.toMatch(/DROP COLUMN|sedc_review_jsonb\s*=/);
  });

  it('lets only the named Director list sign off or write it, checked BEFORE the admin shortcut', () => {
    const rule = SQL.indexOf('IF public.fn_is_the_director() IS NOT TRUE THEN');
    const own = SQL.indexOf('nobody signs off their own appraisal');
    const shortcut = SQL.indexOf('IF v_admin THEN');
    expect(rule).toBeGreaterThan(0);
    expect(own).toBeGreaterThan(rule);
    expect(shortcut).toBeGreaterThan(own);
    expect(SQL).not.toMatch(/is_super_admin\(\)[^\n]*director_review_jsonb/);
  });

  it('counts a move to or from sign-off and every sign-off column as signing off (review panel, 9 Oct)', () => {
    expect(SQL).toContain("(NEW.status = 'final_approved' OR OLD.status IN ('sedc_reviewed', 'final_approved'))");
    for (const col of ['director_review_jsonb', 'final_score', 'final_remarks', 'final_approved_at', 'final_approved_by']) {
      expect(SQL).toContain(`OR NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
    // Only service_role and a direct database session are not refused.
    expect(SQL).toContain("IF NOT (v_role IS NOT DISTINCT FROM 'service_role'\n          OR (v_role IS NULL AND auth.uid() IS NULL)) THEN");
    expect(SQL).toContain("AND NOT (OLD.status = 'sedc_reviewed' AND NEW.status = 'final_approved')");
  });

  it('needs the ratings and a reason of at least 10 characters', () => {
    expect(SQL).toContain("jsonb_typeof(NEW.director_review_jsonb -> 'ratings') IS DISTINCT FROM 'object'");
    expect(SQL).toContain("length(trim(COALESCE(NEW.director_review_jsonb ->> 'reason', ''))) < 10");
  });

  it('keeps the column out of every other tier’s hands', () => {
    expect(SQL.match(/NEW\.director_review_jsonb IS DISTINCT FROM OLD\.director_review_jsonb/g)?.length).toBeGreaterThanOrEqual(3);
    expect(SQL).toContain('OR NEW.director_review_jsonb IS NOT NULL');
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_hr_performance_review_guard\(\) FROM anon, PUBLIC/);
    expect(SQL).toContain("to_regprocedure('public.fn_is_the_director()') IS NULL");
  });
});

describe('what counts as a change', () => {
  const areas = resolveAreas();
  it('records only the areas where the Director differs from the committee', () => {
    const committee = { teaching: 'meets', research: 'exceeds', service: 'meets', collegiality: 'meets' } as const;
    const director = { teaching: 'meets', research: 'meets', service: 'meets', collegiality: 'meets' } as const;
    expect(directorOverrides(committee, director, areas)).toEqual({ research: 'meets' });
    expect(directorOverrides(committee, committee, areas)).toEqual({});
    expect(directorOverrides(committee, undefined, areas)).toEqual({});
  });
  it('reads the recorded ratings back, and nothing from a malformed payload', () => {
    expect(parseDirectorRatings({ ratings: { research: 'meets' }, reason: 'x' }, areas)).toEqual({ research: 'meets' });
    expect(parseDirectorRatings({ reason: 'x' }, areas)).toEqual({});
    expect(parseDirectorRatings(null, areas)).toEqual({});
  });
});

describe('sign-off', () => {
  const areas = resolveAreas();
  const sedc = { ratings: { teaching: 'meets', research: 'exceeds', service: 'meets', collegiality: 'meets' } };
  function client(review: Record<string, unknown>) {
    const fake: { update: Record<string, unknown> | null } = { update: null };
    const c: any = {
      rpc: async () => ({ data: null, error: null }),
      from: (table: string) => {
        if (table === 'staff') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { institution_id: null }, error: null }) }) }) };
        }
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: review, error: null }) }) }),
          update: (payload: Record<string, unknown>) => {
            fake.update = payload;
            const done = { select: () => ({ single: async () => ({ data: { ...review, ...payload }, error: null }), maybeSingle: async () => ({ data: { ...review, ...payload }, error: null }) }) };
            return { eq: () => ({ ...done, eq: () => done }) };
          },
        };
      },
    };
    return { c, fake };
  }
  const review = { id: 'r1', staff_id: 'staff-9', status: 'sedc_reviewed', sedc_review_jsonb: sedc };

  it('without a change, writes no Director rating and scores the committee’s ratings', async () => {
    const { c, fake } = client(review);
    await PerformanceReviewService.finalApprove(c, 'r1', { final_remarks: 'ok', approver_profile_id: 'dir-1' });
    expect(fake.update).not.toHaveProperty('director_review_jsonb');
    expect(fake.update?.final_score).toBe(deriveAppraisalScore(sedc.ratings as never, areas, resolveRatingPoints(null), null));
  });

  it('with a change, records it beside the committee’s with the reason, and scores the changed ratings', async () => {
    const { c, fake } = client(review);
    await PerformanceReviewService.finalApprove(c, 'r1', {
      final_remarks: 'ok',
      approver_profile_id: 'dir-1',
      director_ratings: { teaching: 'meets', research: 'meets', service: 'meets', collegiality: 'meets' },
      director_reason: 'Two of the three papers were co-authored elsewhere',
    });
    const recorded = fake.update?.director_review_jsonb as { ratings: Record<string, string>; reason: string; set_by: string };
    expect(recorded.ratings).toEqual({ research: 'meets' });
    expect(recorded.reason).toMatch(/co-authored/);
    expect(recorded.set_by).toBe('dir-1');
    expect(fake.update).not.toHaveProperty('sedc_review_jsonb');
    const merged = { ...sedc.ratings, research: 'meets' };
    expect(fake.update?.final_score).toBe(deriveAppraisalScore(merged as never, areas, resolveRatingPoints(null), null));
    expect(fake.update?.final_score).not.toBe(deriveAppraisalScore(sedc.ratings as never, areas, resolveRatingPoints(null), null));
  });

  it('refuses a Below in Collegiality without a written example when the college asks for one, and keeps the example beside the change', async () => {
    const asksForExample = async () => ({ data: { collegiality_below_requires_example: true }, error: null });
    const first = client(review);
    first.c.rpc = asksForExample;
    await expect(
      PerformanceReviewService.finalApprove(first.c, 'r1', {
        final_remarks: 'ok',
        approver_profile_id: 'dir-1',
        director_ratings: { collegiality: 'below' },
        director_reason: 'Two complaints about shared duties this term.',
      }),
    ).rejects.toThrow(/written example/);
    expect(first.fake.update).toBeNull();

    const second = client(review);
    second.c.rpc = asksForExample;
    await PerformanceReviewService.finalApprove(second.c, 'r1', {
      final_remarks: 'ok',
      approver_profile_id: 'dir-1',
      director_ratings: { collegiality: 'below' },
      director_reason: 'Two complaints about shared duties this term.',
      director_collegiality_example: 'Missed three of four departmental duties and left the load to colleagues.',
    });
    expect(second.fake.update?.director_review_jsonb).toMatchObject({
      ratings: { collegiality: 'below' },
      collegiality_example: 'Missed three of four departmental duties and left the load to colleagues.',
    });
  });

  it('refuses a change without a reason of at least 10 characters', async () => {
    const { c, fake } = client(review);
    await expect(
      PerformanceReviewService.finalApprove(c, 'r1', {
        final_remarks: 'ok',
        approver_profile_id: 'dir-1',
        director_ratings: { teaching: 'meets', research: 'meets', service: 'meets', collegiality: 'meets' },
        director_reason: 'no',
      }),
    ).rejects.toThrow(/at least 10 characters/);
    expect(fake.update).toBeNull();
  });
});
