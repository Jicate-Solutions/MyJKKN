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
 * Completion tier derived from how many of the 4 required fields are filled:
 *   - 'critical'      : 0 or 1 of 4 filled
 *   - 'needs_work'    : 2 of 4 filled
 *   - 'almost'        : 3 of 4 filled
 *   - 'all'           : all incomplete (any tier)
 */
export type OnboardingTier = 'all' | 'critical' | 'needs_work' | 'almost';

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
  missing_count: number;          // 1..4 — rows with 0 are auto-corrected and filtered out
  filled_count: number;           // 4 - missing_count
  completion_percent: number;     // (filled_count / 4) * 100, rounded
  tier: Exclude<OnboardingTier, 'all'>;
}

/**
 * Filters accepted by the onboarding listing endpoint.
 * Mirrors LearnerProfileFilters but adds tier + missing_field.
 */
export interface OnboardingFilters
  extends Omit<LearnerProfileFilters, 'is_profile_complete' | 'lifecycle_status'> {
  tier?: OnboardingTier;
  missing_field?: MissingField;
  lifecycle_status?: LearnerProfileFilters['lifecycle_status'];
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
  critical: number;     // 0–1 fields filled
  needs_work: number;   // 2 fields filled
  almost: number;       // 3 fields filled
  completion_rate: number; // % of total learners who are complete (overall, 0-100)
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
 * Map filled-count to a severity tier.
 */
export function tierFromFilledCount(filledCount: number): Exclude<OnboardingTier, 'all'> {
  if (filledCount <= 1) return 'critical';
  if (filledCount === 2) return 'needs_work';
  return 'almost'; // 3 filled
}
