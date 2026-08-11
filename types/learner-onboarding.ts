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
