// =====================================================================
// HR appraisal — the blind second rating, and conditions-first, in the
// service layer
// =====================================================================
// 1. Blindness: the second rater's service never hands back the first
//    head's ratings before both are in — even if the database sent them —
//    and never reads the reviews table on the rater's behalf.
// 2. Conditions first: a Below with no answer to "what did the college
//    not provide" is refused BEFORE anything is written, for the head and
//    for the second rater.
// 3. The name search cannot smuggle a pattern into the query.
// =====================================================================

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AppraisalSecondRatingService,
  cleanSearch,
  toEvidence,
} from '@/lib/services/hr/appraisal-second-rating-service';
import { PerformanceReviewService } from '@/lib/services/hr/performance-review-service';

const HEAD_RATINGS = {
  teaching: 'exceeds',
  research: 'meets',
  service: 'below',
  collegiality: 'meets',
};

/** A fake client that records every table touched and every write. */
function fakeClient(opts: { rpcData?: unknown; row?: Record<string, unknown> } = {}) {
  const tables: string[] = [];
  const writes: Array<{ table: string; op: string; payload: unknown }> = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'eq', 'in', 'is', 'or', 'not', 'limit', 'order']) b[m] = vi.fn(chain);
    b.update = vi.fn((payload: unknown) => {
      writes.push({ table, op: 'update', payload });
      return b;
    });
    b.insert = vi.fn((payload: unknown) => {
      writes.push({ table, op: 'insert', payload });
      return b;
    });
    b.delete = vi.fn(() => {
      writes.push({ table, op: 'delete', payload: null });
      return b;
    });
    b.single = vi.fn(async () => ({ data: opts.row ?? { id: 'r1', status: 'self_submitted' }, error: null }));
    b.maybeSingle = b.single;
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return b;
  };
  const client = {
    from: vi.fn((t: string) => {
      tables.push(t);
      return builder(t);
    }),
    rpc: vi.fn(async () => ({ data: opts.rpcData ?? null, error: null })),
  };
  return { client: client as unknown as SupabaseClient, tables, writes, raw: client };
}

// ---------------------------------------------------------------------------
// 1. Blindness
// ---------------------------------------------------------------------------

describe('the second rater never sees the first head before both are in', () => {
  it('strips the first head ratings when both are not in, whatever arrived', () => {
    const ev = toEvidence({
      second_rating_id: 's1',
      review_id: 'r1',
      person_name: 'A Person',
      self_appraisal: { achievements: 'x' },
      both_in: false,
      first_head_ratings: HEAD_RATINGS,
    });
    expect(ev.firstHeadRatings).toBeNull();
    expect(JSON.stringify(ev)).not.toContain('exceeds');
    expect(ev.selfAppraisal).toEqual({ achievements: 'x' });
  });

  it('treats anything but a real true as not both in', () => {
    for (const both of ['true', 1, null, undefined]) {
      expect(toEvidence({ both_in: both, first_head_ratings: HEAD_RATINGS }).firstHeadRatings).toBeNull();
    }
  });

  it('shows the first head ratings once both are in', () => {
    const ev = toEvidence({ both_in: true, first_head_ratings: HEAD_RATINGS });
    expect(ev.firstHeadRatings).toEqual(HEAD_RATINGS);
  });

  it('never passes on the head notes or later tiers, even if sent', () => {
    const ev = toEvidence({
      both_in: true,
      first_head_ratings: HEAD_RATINGS,
      supervisor_review_jsonb: { validation_notes: 'private note' },
      sedc_review_jsonb: { ratings: HEAD_RATINGS },
    });
    expect(JSON.stringify(ev)).not.toContain('private note');
    expect(Object.keys(ev)).not.toContain('supervisor_review_jsonb');
    expect(Object.keys(ev)).not.toContain('sedc_review_jsonb');
  });

  it('reads the evidence through the guarded function, not the reviews table', async () => {
    const { client, tables, raw } = fakeClient({
      rpcData: { both_in: false, first_head_ratings: HEAD_RATINGS, self_appraisal: {} },
    });
    const ev = await AppraisalSecondRatingService.getEvidence(client, 's1');
    expect(raw.rpc).toHaveBeenCalledWith('fn_hr_second_rating_evidence', { p_second_rating_id: 's1' });
    expect(tables).toEqual([]);
    expect(ev.firstHeadRatings).toBeNull();
  });

  it('lists requests from the second-ratings table only', async () => {
    const { client, tables } = fakeClient();
    await AppraisalSecondRatingService.listMine(client, 'me');
    expect(tables).toEqual(['hr_performance_review_second_ratings']);
    expect(tables).not.toContain('hr_performance_reviews');
  });
});

// ---------------------------------------------------------------------------
// 2. Conditions first
// ---------------------------------------------------------------------------

const BELOW_NO_ANSWER = {
  ratings: { teaching: 'below', research: 'meets', service: 'meets', collegiality: 'meets' },
};
const BELOW_ANSWERED = {
  ...BELOW_NO_ANSWER,
  conditions: { teaching: { missing: ['training'], note: 'Promised course never ran' } },
};

describe('the head cannot submit a Below without saying what was missing', () => {
  it('refuses before reading or writing anything', async () => {
    const { client, tables, writes } = fakeClient();
    await expect(
      PerformanceReviewService.submitSupervisorReview(client, 'r1', BELOW_NO_ANSWER, null),
    ).rejects.toThrow(/what the college did not provide.*Teaching/);
    expect(writes).toEqual([]);
    expect(tables).toEqual([]);
  });

  it('goes through once answered', async () => {
    const { client, writes } = fakeClient();
    await PerformanceReviewService.submitSupervisorReview(client, 'r1', BELOW_ANSWERED, null);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe('update');
  });

  it('does not ask when a college has switched the rule off', async () => {
    const { client, writes } = fakeClient();
    await PerformanceReviewService.submitSupervisorReview(client, 'r1', BELOW_NO_ANSWER, {
      conditions_first_on_below: false,
    });
    expect(writes).toHaveLength(1);
  });

  it("reads the policy itself for the appraised person's college when none is passed, and still refuses", async () => {
    // Every single-row read in this fake returns this row: the appraisal
    // (status, staff_id) and then that person's staff row (institution_id).
    const { client, raw, writes } = fakeClient({
      rpcData: {},
      row: { id: 'r1', status: 'self_submitted', staff_id: 's-1', institution_id: 'col-a' },
    });
    await expect(
      PerformanceReviewService.submitSupervisorReview(client, 'r1', BELOW_NO_ANSWER),
    ).rejects.toThrow(/Teaching/);
    expect(raw.rpc).toHaveBeenCalledWith('fn_get_policy_json', {
      p_key: 'hr.performance_review',
      p_scope_id: 'col-a',
    });
    expect(writes).toEqual([]);
  });
});

describe('the second rater cannot submit a Below without saying what was missing', () => {
  it('refuses the submit before writing', async () => {
    const { client, writes } = fakeClient();
    await expect(
      AppraisalSecondRatingService.save(client, {
        secondRatingId: 's1',
        payload: BELOW_NO_ANSWER,
        submit: true,
        policy: null,
      }),
    ).rejects.toThrow(/Teaching/);
    expect(writes).toEqual([]);
  });

  it('refuses an incomplete submit, naming what is unrated', async () => {
    const { client, writes } = fakeClient();
    await expect(
      AppraisalSecondRatingService.save(client, {
        secondRatingId: 's1',
        payload: { ratings: { teaching: 'meets' } },
        submit: true,
        policy: null,
      }),
    ).rejects.toThrow(/Research, Service, Collegiality/);
    expect(writes).toEqual([]);
  });

  it('lets an unfinished draft be saved', async () => {
    const { client, writes } = fakeClient();
    await AppraisalSecondRatingService.save(client, {
      secondRatingId: 's1',
      payload: BELOW_NO_ANSWER,
      submit: false,
      policy: null,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).not.toHaveProperty('submitted_at');
  });

  it('stamps submitted_at once everything is answered', async () => {
    const { client, writes } = fakeClient();
    await AppraisalSecondRatingService.save(client, {
      secondRatingId: 's1',
      payload: BELOW_ANSWERED,
      submit: true,
      policy: null,
    });
    expect(writes[0].payload).toHaveProperty('submitted_at');
  });
});

// ---------------------------------------------------------------------------
// 3. Name search
// ---------------------------------------------------------------------------

describe('the name search', () => {
  it('keeps letters and spaces only', () => {
    expect(cleanSearch('  Anu*%,().  Priya ')).toBe('Anu Priya');
    expect(cleanSearch('*')).toBe('');
    expect(cleanSearch('Kavitha')).toBe('Kavitha');
  });

  it('does not query at all for under two letters', async () => {
    const { client, tables } = fakeClient();
    expect(await AppraisalSecondRatingService.searchRaters(client, '*a', 'subject')).toEqual({
      candidates: [],
      hidden: 0,
    });
    expect(tables).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Same college only (review round 1, blocking point 1)
// ---------------------------------------------------------------------------

/** A client whose staff table holds people from two colleges. */
function collegeClient(opts: { subjectCollege: string | null; canReadAppraisals?: string[] }) {
  const COLLEGE_A = 'col-a';
  const rows = [
    { profile_id: 'p-a', first_name: 'Anu', last_name: 'Priya', designation: 'Professor', institution_id: COLLEGE_A },
    // A namesake from another college, as if a filter were ever dropped.
    { profile_id: 'p-b', first_name: 'Anu', last_name: 'Kumar', designation: 'Professor', institution_id: 'col-b' },
    // Same college, but HR with the appraisal key: can read every appraisal.
    { profile_id: 'p-hr', first_name: 'Anu', last_name: 'Devi', designation: 'HR Officer', institution_id: COLLEGE_A },
  ];
  const filters: Array<[string, string, unknown]> = [];
  const rpc = vi.fn(async (_fn: string, args: { p_profile_ids: string[] }) => ({
    data: args.p_profile_ids.filter((id) => (opts.canReadAppraisals ?? ['p-hr']).includes(id)),
    error: null,
  }));
  const client = {
    rpc,
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.select = vi.fn(chain);
      b.or = vi.fn(chain);
      b.not = vi.fn(chain);
      b.limit = vi.fn(chain);
      b.eq = vi.fn((col: string, val: unknown) => {
        filters.push([table, col, val]);
        return b;
      });
      b.maybeSingle = vi.fn(async () =>
        table === 'staff'
          ? { data: { institution_id: opts.subjectCollege }, error: null }
          : { data: { id: COLLEGE_A, name: 'College A' }, error: null },
      );
      // The list query: deliberately returns BOTH colleges, so the in-code
      // re-check is what is under test, not only the filter.
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return b;
    }),
  };
  return { client: client as unknown as SupabaseClient, filters, rpc };
}

describe('only a team member of the same college can be offered as second rater', () => {
  it('filters the search by the college of the person appraised', async () => {
    const { client, filters } = collegeClient({ subjectCollege: 'col-a' });
    await AppraisalSecondRatingService.searchRaters(client, 'Anu', 'subject-staff-id');
    expect(filters).toContainEqual(['staff', 'id', 'subject-staff-id']);
    expect(filters).toContainEqual(['staff', 'institution_id', 'col-a']);
  });

  it('never returns someone from another college, even if the query did', async () => {
    const { client } = collegeClient({ subjectCollege: 'col-a' });
    const found = await AppraisalSecondRatingService.searchRaters(client, 'Anu', 'subject-staff-id');
    expect(found.candidates.map((c) => c.profileId)).toEqual(['p-a']);
  });

  it('shows the college on each result', async () => {
    const { client } = collegeClient({ subjectCollege: 'col-a' });
    const {
      candidates: [c],
    } = await AppraisalSecondRatingService.searchRaters(client, 'Anu', 'subject-staff-id');
    expect(c).toMatchObject({ institutionId: 'col-a', institutionName: 'College A' });
  });

  it('refuses to search when the person has no college on record', async () => {
    const { client } = collegeClient({ subjectCollege: null });
    await expect(
      AppraisalSecondRatingService.searchRaters(client, 'Anu', 'subject-staff-id'),
    ).rejects.toThrow(/no college on record/);
  });
});

// ---------------------------------------------------------------------------
// 5. Nobody who can read appraisals is offered (review round 2)
// ---------------------------------------------------------------------------

describe('someone who can read every appraisal is never offered as second rater', () => {
  it('leaves them off the list and counts them, so the screen can say why', async () => {
    const { client, rpc } = collegeClient({ subjectCollege: 'col-a' });
    const found = await AppraisalSecondRatingService.searchRaters(client, 'Anu', 'subject-staff-id');
    expect(rpc).toHaveBeenCalledWith('fn_hr_second_rater_ineligible', {
      p_profile_ids: ['p-a', 'p-hr'],
    });
    expect(found.candidates.map((c) => c.profileId)).toEqual(['p-a']);
    expect(found.hidden).toBe(1);
  });

  it('hides nobody when nobody matching can read appraisals', async () => {
    const { client } = collegeClient({ subjectCollege: 'col-a', canReadAppraisals: [] });
    const found = await AppraisalSecondRatingService.searchRaters(client, 'Anu', 'subject-staff-id');
    expect(found.hidden).toBe(0);
    expect(found.candidates).toHaveLength(2);
  });
});
