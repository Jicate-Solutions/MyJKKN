// ============================================
// LEARNER ONBOARDING TYPES
// ============================================
// Created: 2026-05-13
// Purpose: Types for the Learner Onboarding page that surfaces
//          incomplete-profile learners by severity tier so admins
//          can triage and complete missing fields.
// ============================================

import type { LearnerProfile, LearnerProfileFilters } from './learner-profile';

/**
 * Which lifecycle statuses this workspace triages.
 *
 * 2026-08-10: widened from 'admitted' alone. 'reserved' learners (universal
 * fees paid, balance threshold NOT yet cleared) are 7x the admitted cohort and
 * were invisible here, so their academic fields could not be filled until
 * payment landed — which put data entry on the critical path of enrolment.
 *
 * Widening the QUEUE does not widen the fee gate: see `resolveOnboardingTier`
 * and LearnerProfileService.activateIfReady — only 'admitted' can reach
 * 'active'. A completed 'reserved' learner waits in `awaiting_payment`.
 */
export const ONBOARDING_STATUSES = ['reserved', 'admitted'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export function isOnboardingStatus(v: unknown): v is OnboardingStatus {
  return ONBOARDING_STATUSES.includes(v as OnboardingStatus);
}

/**
 * Bucket for one learner in the onboarding workspace.
 *
 * Incomplete profiles are graded by how many of the 4 required fields are set:
 *   - 'critical'          : 0 or 1 of 4 filled
 *   - 'needs_work'        : 2 of 4 filled
 *   - 'almost'            : 3 of 4 filled
 *
 * Complete profiles land in a terminal bucket decided by lifecycle status:
 *   - 'ready_to_activate' : 4 of 4 + status 'admitted' — actionable NOW
 *   - 'awaiting_payment'  : 4 of 4 + status 'reserved' — blocked on fees
 *
 *   - 'all'               : the three INCOMPLETE tiers (not the terminal two)
 *
 * `ready_to_activate` exists because the last hop is structurally split: the
 * payment RPC (SQL triggers on billing_receipt_items / billing_student_bills)
 * owns everything up to 'admitted', but only the app can create the learner's
 * login (POST /api/learners/complete-onboarding). Nothing bridges the two, so
 * learners who satisfy every activation condition sat at 'admitted' forever —
 * invisible, because this page used to list only INCOMPLETE profiles.
 */
export type OnboardingTier =
  | 'all'
  | 'critical'
  | 'needs_work'
  | 'almost'
  | 'ready_to_activate'
  | 'awaiting_payment';

/** A tier a single row can actually occupy ('all' is a view, not a bucket). */
export type OnboardingRowTier = Exclude<OnboardingTier, 'all'>;

/** The three tiers that mean "a required field is still missing". */
export const INCOMPLETE_TIERS = ['critical', 'needs_work', 'almost'] as const;

export const ONBOARDING_TIER_LABELS: Record<OnboardingRowTier, string> = {
  critical: 'Critical',
  needs_work: 'Needs Work',
  almost: 'Almost Complete',
  ready_to_activate: 'Ready to Activate',
  awaiting_payment: 'Awaiting Payment'
};

/**
 * Which specific required field is missing (UI badges, filter chips).
 * Mirrors the 4 fields enforced in `LearnerProfileService.calculateProfileCompleteness`.
 */
export type MissingField = 'college_email' | 'academic_year_id' | 'semester_id' | 'section_id';

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  college_email: 'College Email',
  academic_year_id: 'Academic Year',
  semester_id: 'Semester',
  section_id: 'Section'
};

/**
 * What `fee_paid_threshold_percent` is measured against.
 * Mirrors admission_statuses.threshold_basis (chk_threshold_basis).
 */
export type ThresholdBasis = 'billed_to_date' | 'due_to_date' | 'due_to_date_current_year';

/**
 * Short labels for the basis, for the column header tooltip and the tier banner.
 * The distinction is load-bearing, not cosmetic: 'due_to_date' judges a learner
 * only on instalments that have actually come due, which is why a family paying
 * on a normal schedule is not counted as behind.
 */
export const THRESHOLD_BASIS_SHORT: Record<ThresholdBasis, string> = {
  billed_to_date: 'of everything billed',
  due_to_date: 'of fees due as on date',
  due_to_date_current_year: "of this year's fees due as on date"
};

/**
 * One learner's position against the fee threshold that gates
 * reserved → admitted. Shape mirrors fn_onboarding_payment_progress 1:1.
 *
 * Every field on the "basis" axis (`achieved_pct`, `basis_*`) is measured on
 * `threshold_basis`; the `total_*` fields are always the whole non-application
 * bill book, so the table can show "due now" and "for the year" side by side
 * without the reader having to know which basis is configured.
 */
export interface OnboardingPaymentProgress {
  learner_id: string;
  /** Status this learner is waiting to reach, e.g. 'admitted'. */
  target_code: string | null;
  target_label: string | null;
  /** The percentage configured in Stages & Statuses. Null = no gate configured. */
  threshold_pct: number | null;
  threshold_basis: ThresholdBasis;
  /** How much of the threshold basis is paid, 0–100. */
  achieved_pct: number;
  basis_billed: number;
  basis_paid: number;
  basis_balance: number;
  total_billed: number;
  total_paid: number;
  total_balance: number;
  /**
   * Rupees still needed to cross the threshold.
   * NULL — never 0 — when nothing is due yet: "pay ₹0 and they are in" would be
   * a lie about a learner who is simply waiting on a due date.
   */
  amount_to_threshold: number | null;
  meets_threshold: boolean;
  /** False when no bill has come due on the configured basis yet. */
  has_basis_due: boolean;
  /**
   * The earliest instalment this learner still owes, and what falls due on
   * that date. NULL for a learner with no payment schedule — which is every
   * learner billed before per-fee schedules existed, so the UI must render an
   * em-dash rather than invent a date.
   *
   * `next_due_amount` SUMS every unsettled tranche sharing that date: two
   * tranches can fall due together, and the caller is owed both.
   */
  next_due_date: string | null;
  next_due_amount: number | null;
  /** 0 when the learner has no schedule at all. */
  instalments_total: number;
  instalments_settled: number;
}

/**
 * Percentage points still to cover before promotion. Clamped at 0.
 * Distinct from "unpaid percentage" (100 − achieved), which is the share of the
 * fee still owed; this is the share still owed *before the gate opens*.
 */
export function pointsToThreshold(p: OnboardingPaymentProgress): number {
  if (p.threshold_pct == null) return 0;
  return Math.max(0, Math.round((p.threshold_pct - p.achieved_pct) * 100) / 100);
}

/**
 * A learner row enriched with missing-field metadata for the onboarding table.
 */
export interface OnboardingProfileRow extends LearnerProfile {
  missing_fields: MissingField[];
  missing_field_labels: string[];
  missing_count: number;          // 0..4 — 0 means a terminal tier, not a filtered-out row
  filled_count: number;           // 4 - missing_count
  completion_percent: number;     // (filled_count / 4) * 100, rounded
  tier: OnboardingRowTier;
  /**
   * Whether this row can be activated right now. False for every reserved
   * learner (fee gate) and for admitted learners whose college_email is not on
   * the @jkkn.ac.in domain — activation would silently no-op for those, since
   * LearnerProfileService requires a valid college email to create the login.
   */
  can_activate: boolean;
  /** Human-readable reason `can_activate` is false. Undefined when it is true. */
  activation_blocked_reason?: string;
  /**
   * Fee position against the promotion threshold.
   *
   * Only populated for the `awaiting_payment` tier, where money is the SOLE
   * remaining blocker — every other tier is blocked on missing fields, and
   * fetching it there would spend a round trip on a number nothing renders.
   * Undefined therefore means "not fetched", not "no bills".
   */
  payment?: OnboardingPaymentProgress;
}

/**
 * Filters accepted by the onboarding listing endpoint.
 * Mirrors LearnerProfileFilters but adds tier + missing_field.
 */
export interface OnboardingFilters
  extends Omit<LearnerProfileFilters, 'is_profile_complete' | 'lifecycle_status'> {
  tier?: OnboardingTier;
  missing_field?: MissingField;
  /** Narrow to one of the two onboarding statuses; omit for both. */
  lifecycle_status?: OnboardingStatus;
}

/**
 * Paginated listing response.
 */
export interface OnboardingListResponse {
  data: OnboardingProfileRow[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/**
 * KPI stats for the top-of-page cards.
 */
export interface OnboardingStats {
  total_incomplete: number;
  critical: number;            // 0–1 fields filled
  needs_work: number;          // 2 fields filled
  almost: number;              // 3 fields filled
  ready_to_activate: number;   // 4 of 4 + admitted — actionable now
  awaiting_payment: number;    // 4 of 4 + reserved — blocked on fees
  completion_rate: number;     // % of the reserved+admitted cohort that is complete (0-100)
  /** Per-status totals so the header can show the split at a glance. */
  reserved_total: number;
  admitted_total: number;
}

/**
 * Cohort-level fee position for the Awaiting Payment tier banner — computed
 * from the same rows the table shows, so the banner can never disagree with
 * the column totals under it.
 */
export interface OnboardingPaymentSummary {
  learners: number;
  threshold_pct: number | null;
  threshold_basis: ThresholdBasis;
  target_label: string | null;
  billed: number;
  paid: number;
  balance: number;
  /** Rupees that would move the whole cohort past the gate. */
  amount_to_threshold: number;
  /** Already at/over the threshold — a non-zero count means the engine is stuck. */
  meets_threshold: number;
  /** No bill has come due yet; these are waiting on a date, not on money. */
  nothing_due: number;
}

/**
 * Roll a page/tier's payment rows into one summary.
 * Shared by the banner and any caller that needs the same arithmetic.
 */
export function summarisePaymentProgress(
  rows: OnboardingPaymentProgress[]
): OnboardingPaymentSummary {
  const summary: OnboardingPaymentSummary = {
    learners: rows.length,
    threshold_pct: rows[0]?.threshold_pct ?? null,
    threshold_basis: rows[0]?.threshold_basis ?? 'due_to_date',
    target_label: rows[0]?.target_label ?? null,
    billed: 0,
    paid: 0,
    balance: 0,
    amount_to_threshold: 0,
    meets_threshold: 0,
    nothing_due: 0
  };

  for (const r of rows) {
    summary.billed += r.basis_billed;
    summary.paid += r.basis_paid;
    summary.balance += r.basis_balance;
    summary.amount_to_threshold += r.amount_to_threshold ?? 0;
    if (r.meets_threshold) summary.meets_threshold++;
    if (!r.has_basis_due) summary.nothing_due++;
  }

  return summary;
}

/**
 * Payload for the inline Quick Complete drawer.
 * Only the 4 onboarding fields are accepted — never the full profile.
 */
export interface QuickCompletePayload {
  college_email?: string;
  academic_year_id?: string;
  semester_id?: string;
  section_id?: string;
}

/**
 * Helper to compute missing fields from a profile row.
 * Pure function — safe to use on both server and client.
 */
export function computeMissingFields(profile: Partial<LearnerProfile>): MissingField[] {
  const missing: MissingField[] = [];
  if (!profile.college_email) missing.push('college_email');
  if (!profile.academic_year_id) missing.push('academic_year_id');
  if (!profile.semester_id) missing.push('semester_id');
  if (!profile.section_id) missing.push('section_id');
  return missing;
}

/**
 * The college-email domain that gates learner login creation.
 * Mirrors LearnerProfileService.isValidCollegeEmail (private there) and the
 * Zod refinement on learnerProfileSchema.
 */
export const COLLEGE_EMAIL_DOMAIN = '@jkkn.ac.in';

export function hasValidCollegeEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase().endsWith(COLLEGE_EMAIL_DOMAIN);
}

/**
 * Place a learner in a tier from their filled-field count AND lifecycle status.
 *
 * Status matters only once the profile is COMPLETE: an incomplete learner is
 * graded purely on missing fields regardless of whether they are reserved or
 * admitted, because filling those fields is the same job either way.
 */
export function resolveOnboardingTier(
  filledCount: number,
  lifecycleStatus: string | null | undefined
): OnboardingRowTier {
  if (filledCount <= 1) return 'critical';
  if (filledCount === 2) return 'needs_work';
  if (filledCount === 3) return 'almost';
  // 4 of 4 — terminal bucket decided by the payment gate, not by field data.
  return lifecycleStatus === 'admitted' ? 'ready_to_activate' : 'awaiting_payment';
}

/**
 * Why a complete learner cannot be activated yet, or undefined if they can.
 *
 * Returning a REASON rather than a bare boolean is deliberate: activation
 * silently no-ops inside LearnerProfileService when the college email is off
 * domain (it logs and returns), so an unexplained disabled button would look
 * identical to a broken one.
 */
export function activationBlockedReason(
  profile: Pick<LearnerProfile, 'lifecycle_status' | 'college_email'>,
  missingCount: number
): string | undefined {
  if (missingCount > 0) return 'Required onboarding fields are still missing.';
  if (profile.lifecycle_status === 'reserved') {
    return 'Balance fees have not cleared the threshold yet — activation is gated on payment.';
  }
  if (profile.lifecycle_status !== 'admitted') {
    return `Only admitted learners can be activated (this learner is ${profile.lifecycle_status}).`;
  }
  if (!hasValidCollegeEmail(profile.college_email)) {
    return `College Email must end with ${COLLEGE_EMAIL_DOMAIN} before a login can be created.`;
  }
  return undefined;
}
