/**
 * hr.performance_review — the policy value, and what an ABSENT key means.
 *
 * Pure: no React, no Supabase, so the defaults can be tested directly. Which
 * way a missing key falls is the safety property that matters here — no
 * existing policy row carries the promotion-rule keys, so every college is
 * reading the absent case today, and a missing value must never switch a rule
 * on.
 */

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
  };
}

