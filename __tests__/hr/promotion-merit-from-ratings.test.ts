// =====================================================================
// HR Promotion — merit score now comes from appraisal ratings
// =====================================================================
// The read this exercises was broken in production: it asked for
// `appraisal_score` and `review_period_end`, neither of which exists on
// hr_performance_reviews, so it errored on every call and returned 0 for
// everyone while blaming a missing table. Nothing caught it, because no
// test ever ran the query. These do, against a stub client that records
// exactly which columns and filters were asked for.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { calculateMeritScore, type PromotionPolicy } from '@/lib/services/hr/promotion-service';
import type { SupabaseClient } from '@supabase/supabase-js';

const POLICY: PromotionPolicy = {
  max_merit_points: 50,
  merit_score_formula: 'appraisal_score / 10',
  sedc_score_normalization_allowed: true,
  delay_lookback_years: 5,
  api_score_required: true,
  seniority_tiebreaker: true,
  is_reward_incentive_growth: true,
  qualification_points_max: 10,
  qualification_point_scale: {
    masters_completed: 4,
    graduation_pg_diploma_min_1yr: 3,
    diploma_iti_min_1yr: 2,
    training_per_5_days: 1,
    book_publication: 2,
    article_publication: 1,
  },
};

interface Capture {
  columns?: string;
  eq: Array<[string, unknown]>;
  not: Array<[string, string, unknown]>;
  gte: Array<[string, unknown]>;
}

/** Minimal stub: records the query it was asked to build, returns fixed rows. */
function stubClient(result: { data?: unknown[]; error?: unknown }) {
  const cap: Capture = { eq: [], not: [], gte: [] };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: (c: string) => { cap.columns = c; return chain(); },
    eq: (k: string, v: unknown) => { cap.eq.push([k, v]); return chain(); },
    not: (k: string, op: string, v: unknown) => { cap.not.push([k, op, v]); return chain(); },
    gte: (k: string, v: unknown) => { cap.gte.push([k, v]); return chain(); },
    limit: () => Promise.resolve(result),
  });
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, cap };
}

describe('calculateMeritScore', () => {
  it('reads columns that actually exist on the table', async () => {
    const { client, cap } = stubClient({ data: [] });
    await calculateMeritScore(client, 'staff-1', POLICY);
    expect(cap.columns).toBe('final_score, final_approved_at');
    // The two columns that never existed must not come back.
    expect(cap.columns).not.toContain('appraisal_score');
    expect(cap.columns).not.toContain('review_period_end');
  });

  it('counts only approved appraisals with a score', async () => {
    const { client, cap } = stubClient({ data: [] });
    await calculateMeritScore(client, 'staff-1', POLICY);
    expect(cap.eq).toContainEqual(['staff_id', 'staff-1']);
    expect(cap.eq).toContainEqual(['status', 'final_approved']);
    expect(cap.not).toContainEqual(['final_score', 'is', null]);
    expect(cap.gte.map(([k]) => k)).toContain('final_approved_at');
  });

  it('turns a straight Meets record (50) into 5 merit points', async () => {
    const { client } = stubClient({ data: [{ final_score: 50 }] });
    const r = await calculateMeritScore(client, 'staff-1', POLICY);
    expect(r.score).toBe(5);
    expect(r.review_count).toBe(1);
  });

  it('turns a straight Exceeds record (100) into 10 merit points', async () => {
    const { client } = stubClient({ data: [{ final_score: 100 }] });
    expect((await calculateMeritScore(client, 'staff-1', POLICY)).score).toBe(10);
  });

  it('turns a straight Below record (0) into 0 merit points', async () => {
    const { client } = stubClient({ data: [{ final_score: 0 }] });
    expect((await calculateMeritScore(client, 'staff-1', POLICY)).score).toBe(0);
  });

  it('averages across the appraisals in the window', async () => {
    const { client } = stubClient({ data: [{ final_score: 100 }, { final_score: 50 }] });
    const r = await calculateMeritScore(client, 'staff-1', POLICY);
    expect(r.score).toBe(7.5);
    expect(r.review_count).toBe(2);
  });

  it('caps at the policy ceiling', async () => {
    const { client } = stubClient({ data: [{ final_score: 100 }] });
    const tight = { ...POLICY, max_merit_points: 4 };
    expect((await calculateMeritScore(client, 'staff-1', tight)).score).toBe(4);
  });

  it('returns 0 when nobody has been appraised', async () => {
    const { client } = stubClient({ data: [] });
    const r = await calculateMeritScore(client, 'staff-1', POLICY);
    expect(r).toEqual({ score: 0, review_count: 0, lookback_years: 5 });
  });

  it('returns 0 when the table is absent, without inventing a score', async () => {
    const { client } = stubClient({ error: { message: 'relation does not exist' } });
    expect((await calculateMeritScore(client, 'staff-1', POLICY)).score).toBe(0);
  });

  it('treats a null score as zero rather than NaN', async () => {
    const { client } = stubClient({ data: [{ final_score: null }, { final_score: 100 }] });
    expect((await calculateMeritScore(client, 'staff-1', POLICY)).score).toBe(5);
  });
});
