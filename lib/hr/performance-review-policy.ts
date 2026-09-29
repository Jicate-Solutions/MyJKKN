/**
 * hr.performance_review — the policy value, and what an ABSENT key means.
 *
 * Pure: no React, no Supabase, so the defaults can be tested directly. Which
 * way a missing key falls is the safety property that matters here — no
 * existing policy row carries the promotion-rule keys, so every college is
 * reading the absent case today, and a missing value must never switch a rule
 * on.
 */

import type { AppraisalArea, AppraisalRating } from '@/lib/hr/appraisal-ratings';

export interface PerfReviewValue {
  appraisal_form_distribution_month: string;
  distribution_on_term_completion: boolean;
  min_service_months_for_review: number;
  period_start: string;
  period_end: string;
  self_appraisal_required: boolean;
  review_committee: string;
  final_approver: string;
  facilitator_grading_doc_ref: string | null;
  /** Written example required when Collegiality is rated Below. */
  collegiality_below_requires_example: boolean;
  /** How each rating converts to points for promotion ordering. */
  rating_points: { exceeds: number; meets: number; below: number };
  /** Relative weight per area. 1 means it counts the same as the others. */
  area_weights: { teaching: number; research: number; service: number; collegiality: number };
  /** Collegiality is still rated, but stops moving the promotion score. */
  exclude_collegiality_from_score: boolean;
  /** A Below in any counted area stops the increment, whatever the score. */
  below_blocks_increment: boolean;
  /**
   * Checks on the appraisal itself (2026-09-29). None of these rates a person
   * or touches pay; they tell HR whether the appraisal is measuring anything.
   */
  /** Per area, per band: short statements a second person could check. */
  band_statements: Record<AppraisalArea, Record<AppraisalRating, string[]>>;
  /** A Below must first say what the college did not provide. */
  conditions_first_on_below: boolean;
  /** Below this share of agreement, ratings should not be used for promotion. */
  rater_agreement_min_pct: number;
  /** Fewer pairs than this and no agreement verdict is given. */
  rater_agreement_min_pairs: number;
  /** One band holding this share of an area raises the "stopped telling apart" warning. */
  saturation_warn_pct: number;
  /** ...once at least this many people are rated in that area. */
  saturation_min_count: number;
}

const AREAS: readonly AppraisalArea[] = ['teaching', 'research', 'service', 'collegiality'];
const BANDS: readonly AppraisalRating[] = ['exceeds', 'meets', 'below'];

function emptyStatements(): Record<AppraisalArea, Record<AppraisalRating, string[]>> {
  const out = {} as Record<AppraisalArea, Record<AppraisalRating, string[]>>;
  for (const a of AREAS) out[a] = { exceeds: [], meets: [], below: [] };
  return out;
}

/** Keep only real, non-blank strings; anything else in a stored row is dropped. */
function parseStatements(raw: unknown): Record<AppraisalArea, Record<AppraisalRating, string[]>> {
  const out = emptyStatements();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const a of AREAS) {
    const perBand = src[a];
    if (!perBand || typeof perBand !== 'object' || Array.isArray(perBand)) continue;
    for (const b of BANDS) {
      const list = (perBand as Record<string, unknown>)[b];
      if (!Array.isArray(list)) continue;
      out[a][b] = list
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s !== '');
    }
  }
  return out;
}

/** A share: a finite number from 0 to 100, else the fallback. */
function share(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : fallback;
}

/** A count: a finite number of at least 1, else the fallback. */
function atLeastOne(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}

export const DEFAULT_VALUE: PerfReviewValue = {
  appraisal_form_distribution_month: 'June',
  distribution_on_term_completion: true,
  min_service_months_for_review: 6,
  period_start: '07-01',
  period_end: '06-30',
  self_appraisal_required: true,
  review_committee: 'SEDC',
  final_approver: 'Director',
  facilitator_grading_doc_ref: null,
  collegiality_below_requires_example: true,
  rating_points: { exceeds: 2, meets: 1, below: 0 },
  area_weights: { teaching: 1, research: 1, service: 1, collegiality: 1 },
  exclude_collegiality_from_score: false,
  below_blocks_increment: false,
  band_statements: emptyStatements(),
  conditions_first_on_below: true,
  rater_agreement_min_pct: 70,
  rater_agreement_min_pairs: 5,
  saturation_warn_pct: 80,
  saturation_min_count: 10,
};

/** A stored value that is missing or not a finite number falls back. */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * Exported for test. Which way an ABSENT key falls is the whole safety
 * property here: a missing value must never switch a rule on.
 */
export function parseValue(raw: unknown): PerfReviewValue {
  const obj = (raw || {}) as Partial<PerfReviewValue>;
  return {
    appraisal_form_distribution_month: String(
      obj.appraisal_form_distribution_month ?? DEFAULT_VALUE.appraisal_form_distribution_month,
    ),
    distribution_on_term_completion: Boolean(
      obj.distribution_on_term_completion ?? DEFAULT_VALUE.distribution_on_term_completion,
    ),
    min_service_months_for_review: Number(
      obj.min_service_months_for_review ?? DEFAULT_VALUE.min_service_months_for_review,
    ),
    period_start: String(obj.period_start ?? DEFAULT_VALUE.period_start),
    period_end: String(obj.period_end ?? DEFAULT_VALUE.period_end),
    self_appraisal_required: Boolean(
      obj.self_appraisal_required ?? DEFAULT_VALUE.self_appraisal_required,
    ),
    review_committee: String(obj.review_committee ?? DEFAULT_VALUE.review_committee),
    final_approver: String(obj.final_approver ?? DEFAULT_VALUE.final_approver),
    facilitator_grading_doc_ref:
      obj.facilitator_grading_doc_ref != null
        ? String(obj.facilitator_grading_doc_ref)
        : null,
    // Absent means ON — the safeguard applies until a college turns it off,
    // so no existing policy row has to be edited.
    collegiality_below_requires_example:
      obj.collegiality_below_requires_example !== false,
    rating_points: {
      exceeds: num(obj.rating_points?.exceeds, 2),
      meets: num(obj.rating_points?.meets, 1),
      below: num(obj.rating_points?.below, 0),
    },
    area_weights: {
      teaching: num(obj.area_weights?.teaching, 1),
      research: num(obj.area_weights?.research, 1),
      service: num(obj.area_weights?.service, 1),
      collegiality: num(obj.area_weights?.collegiality, 1),
    },
    // Both default OFF — an absent key must never turn a rule on by itself.
    exclude_collegiality_from_score: obj.exclude_collegiality_from_score === true,
    below_blocks_increment: obj.below_blocks_increment === true,
    // No statements unless a college writes some — the form is unchanged.
    band_statements: parseStatements(obj.band_statements),
    // Absent means ON, the same direction as the Collegiality safeguard: the
    // question about the college is asked unless a college turns it off.
    conditions_first_on_below: obj.conditions_first_on_below !== false,
    rater_agreement_min_pct: share(obj.rater_agreement_min_pct, 70),
    rater_agreement_min_pairs: atLeastOne(obj.rater_agreement_min_pairs, 5),
    saturation_warn_pct: share(obj.saturation_warn_pct, 80),
    saturation_min_count: atLeastOne(obj.saturation_min_count, 10),
  };
}

