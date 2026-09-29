/**
 * HR appraisal — the blind second rating.
 *
 * HR asks a second head to rate a submitted appraisal from the same evidence
 * the first head sees (the person's own self-appraisal). The point is to find
 * out whether the appraisal measures anything: if two heads reading the same
 * evidence land on different bands, the instrument is broken, not the person.
 *
 * Blindness is the whole design:
 *   - The second rater reads the appraisal ONLY through
 *     fn_hr_second_rating_evidence, which returns the self-appraisal and
 *     withholds the first head's ratings until both are in.
 *   - This service never selects from hr_performance_reviews on the rater's
 *     behalf, and strips the first head's ratings from anything it returns
 *     before both are in, even if the database were ever to send them.
 *   - The first head has no read path to this table at all (RLS).
 *
 * The second rating never changes an appraisal's outcome. Nothing in final
 * approval, the promotion rule or the increment block reads it; it feeds only
 * the agreement report on the cycle page.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AREA_LABELS,
  collegialityExampleMissing,
  missingAreas,
  parseCollegialityExample,
  parseRatings,
  resolveAreas,
  type AppraisalRatingMap,
} from '@/lib/hr/appraisal-ratings';
import {
  assertConditionsAnswered,
  type HRPerformanceReviewPolicy,
} from '@/lib/services/hr/performance-review-service';

export const SECOND_RATINGS_TABLE = 'hr_performance_review_second_ratings';

export interface HRSecondRating {
  id: string;
  review_id: string;
  rater_id: string;
  rating_jsonb: Record<string, unknown> | null;
  submitted_at: string | null;
  institution_id: string | null;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What the second rater is allowed to see. */
export interface SecondRatingEvidence {
  secondRatingId: string;
  reviewId: string;
  personName: string | null;
  designation: string | null;
  /** The person's college — whose settings the rater's form applies. */
  institutionId: string | null;
  /** The same evidence the first head sees. */
  selfAppraisal: Record<string, unknown> | null;
  /** True once the second rating is submitted and the first head has handed on. */
  bothIn: boolean;
  /** The first head's ratings — only ever present when bothIn is true. */
  firstHeadRatings: AppraisalRatingMap | null;
}

/** A person HR can ask to be the second rater. */
export interface RaterCandidate {
  profileId: string;
  name: string;
  designation: string | null;
  /** The candidate's college, shown so HR can see it is the right one. */
  institutionId: string;
  institutionName: string | null;
}

/**
 * Turn the evidence function's reply into what the screen may show.
 * Exported for test: this is where blindness is enforced in code.
 */
export function toEvidence(raw: unknown): SecondRatingEvidence {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bothIn = o.both_in === true;
  const self = o.self_appraisal;
  return {
    secondRatingId: String(o.second_rating_id ?? ''),
    reviewId: String(o.review_id ?? ''),
    personName: typeof o.person_name === 'string' ? o.person_name : null,
    designation: typeof o.designation === 'string' ? o.designation : null,
    institutionId: typeof o.institution_id === 'string' ? o.institution_id : null,
    selfAppraisal:
      self && typeof self === 'object' && !Array.isArray(self)
        ? (self as Record<string, unknown>)
        : null,
    bothIn,
    // Withheld unless both are in, whatever arrived.
    firstHeadRatings: bothIn
      ? parseRatings({ ratings: o.first_head_ratings }, resolveAreas())
      : null,
  };
}

/**
 * Search text reduced to letters and spaces. PostgREST treats `*` in a filter
 * pattern as a wildcard that no backslash escapes, and `,` `(` `)` `.` would
 * break an `or=` filter, so nothing but letters and spaces reaches the query.
 */
export function cleanSearch(q: string): string {
  return q.replace(/[^\p{L} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Throw the first reason a second rating cannot be submitted yet. */
export function assertSecondRatingReady(
  payload: Record<string, unknown>,
  policy: HRPerformanceReviewPolicy | null | undefined,
): void {
  const areas = resolveAreas();
  const ratings = parseRatings(payload, areas);
  const unrated = missingAreas(ratings, areas);
  if (unrated.length > 0) {
    throw new Error(
      `Rate every area. Still to rate: ${unrated.map((a) => AREA_LABELS[a]).join(', ')}.`,
    );
  }
  if (collegialityExampleMissing(ratings, parseCollegialityExample(payload), policy)) {
    throw new Error('A Below in Collegiality needs a written example.');
  }
  assertConditionsAnswered(payload, policy);
}

export class AppraisalSecondRatingService {
  // -----------------------------------------------------------------------
  // HR side
  // -----------------------------------------------------------------------

  /** Every second rating on these appraisals. RLS limits this to HR. */
  static async listForReviews(
    supabase: SupabaseClient,
    reviewIds: readonly string[],
  ): Promise<HRSecondRating[]> {
    if (reviewIds.length === 0) return [];
    const { data, error } = await supabase
      .from(SECOND_RATINGS_TABLE)
      .select('*')
      .in('review_id', reviewIds as string[]);
    if (error) throw error;
    return (data ?? []) as HRSecondRating[];
  }

  /**
   * Ask someone for a second rating. The database refuses the person
   * appraised, their own head, and a draft appraisal.
   */
  static async assign(
    supabase: SupabaseClient,
    reviewId: string,
    raterProfileId: string,
  ): Promise<HRSecondRating> {
    const { data, error } = await supabase
      .from(SECOND_RATINGS_TABLE)
      .insert({ review_id: reviewId, rater_id: raterProfileId })
      .select('*')
      .single();
    if (error) throw error;
    return data as HRSecondRating;
  }

  /** Withdraw an unsubmitted request. A submitted one cannot be withdrawn. */
  static async withdraw(supabase: SupabaseClient, secondRatingId: string): Promise<void> {
    const { error } = await supabase
      .from(SECOND_RATINGS_TABLE)
      .delete()
      .eq('id', secondRatingId)
      .is('submitted_at', null);
    if (error) throw error;
  }

  /**
   * People HR can ask for THIS appraisal: team members of the same college as
   * the person appraised, matched on first or last name. The database refuses
   * anyone from another college regardless; filtering here keeps a namesake
   * from another college off the list in the first place. Results are
   * re-checked in code so neither a pattern nor a stray row widens them.
   */
  static async searchRaters(
    supabase: SupabaseClient,
    query: string,
    subjectStaffId: string,
  ): Promise<RaterCandidate[]> {
    const q = cleanSearch(query);
    if (q.length < 2) return [];

    const { data: subject, error: subjectError } = await supabase
      .from('staff')
      .select('institution_id')
      .eq('id', subjectStaffId)
      .maybeSingle();
    if (subjectError) throw subjectError;
    const college = (subject?.institution_id as string | null | undefined) ?? null;
    if (!college) {
      throw new Error(
        'This person has no college on record, so no second rater can be matched to them.',
      );
    }

    const { data, error } = await supabase
      .from('staff')
      .select('profile_id, first_name, last_name, designation, institution_id')
      .eq('institution_id', college)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .not('profile_id', 'is', null)
      .limit(10);
    if (error) throw error;

    const { data: inst } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('id', college)
      .maybeSingle();
    const collegeName = typeof inst?.name === 'string' ? inst.name : null;

    const needle = q.toLowerCase();
    return ((data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.institution_id === college)
      .map((r) => ({
        profileId: String(r.profile_id),
        name: [r.first_name, r.last_name].filter((x) => typeof x === 'string' && x).join(' '),
        designation: typeof r.designation === 'string' ? r.designation : null,
        institutionId: college,
        institutionName: collegeName,
      }))
      .filter((c) => c.name.toLowerCase().includes(needle));
  }

  // -----------------------------------------------------------------------
  // Second rater side
  // -----------------------------------------------------------------------

  /**
   * The second ratings the signed-in person has been asked for. Reads only
   * this table — never hr_performance_reviews — so nothing about the first
   * head's review can come back from here.
   */
  static async listMine(
    supabase: SupabaseClient,
    raterProfileId: string,
  ): Promise<HRSecondRating[]> {
    const { data, error } = await supabase
      .from(SECOND_RATINGS_TABLE)
      .select('*')
      .eq('rater_id', raterProfileId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as HRSecondRating[];
  }

  /** The evidence for one request: the self-appraisal, and nothing more until both are in. */
  static async getEvidence(
    supabase: SupabaseClient,
    secondRatingId: string,
  ): Promise<SecondRatingEvidence> {
    const { data, error } = await supabase.rpc('fn_hr_second_rating_evidence', {
      p_second_rating_id: secondRatingId,
    });
    if (error) throw error;
    return toEvidence(data);
  }

  /**
   * Save the second rating, or submit it. Submitting checks every area is
   * rated, the Collegiality example, and conditions-first before anything is
   * written; the database checks all three again.
   */
  static async save(
    supabase: SupabaseClient,
    args: {
      secondRatingId: string;
      payload: Record<string, unknown>;
      submit: boolean;
      policy: HRPerformanceReviewPolicy | null | undefined;
    },
  ): Promise<HRSecondRating> {
    if (args.submit) assertSecondRatingReady(args.payload, args.policy);
    const { data, error } = await supabase
      .from(SECOND_RATINGS_TABLE)
      .update({
        rating_jsonb: args.payload,
        ...(args.submit ? { submitted_at: new Date().toISOString() } : {}),
      })
      .eq('id', args.secondRatingId)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRSecondRating;
  }
}
