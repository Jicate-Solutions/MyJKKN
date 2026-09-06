/**
 * PDE Course Tier Eligibility Service
 * ============================================================================
 *
 * Wires the `pde.rollout.tier_eligibility` policy to a per-learner eligibility
 * check. When a learner is about to enrol in (or be auto-wrapped into) a
 * PDE-eligible course at tier 1/2/3, this service reads the policy mode for
 * the tier and returns whether the learner qualifies.
 *
 * Policy per tier (see lib/services/pde-policy-reader.ts → TierEligibility):
 *   - `natural_fit_only`        → Eligible only if the learner's discipline
 *                                 has the tier-implied target categories in
 *                                 per-college compliance targets (i.e. the
 *                                 college "naturally fits" PDE for this tier).
 *   - `after_tier_1_success`    → Eligible only if the learner has previously
 *                                 passed at least one tier-1 PDE course.
 *   - `not_eligible`            → Never eligible (tier blocked institution-wide).
 *   - `open`                    → Always eligible (no gate).
 *
 * Pattern alignment:
 *   - Consumer-only service, no migration/table of its own.
 *   - Fail-soft on lookups; default to NOT eligible if we cannot resolve the
 *     learner's discipline OR the per-college targets (the conservative bias
 *     here is to under-enrol rather than over-enrol; rollouts are reversible
 *     but pulling a learner mid-course is disruptive).
 *
 * Tier 2 Item 3 of PDE consumer wiring (spec: pde-roadmap-tier-1-6-2026-05-19.md).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getTierEligibility,
  getPerCollegeComplianceTargets,
  type TierEligibility,
} from '@/lib/services/pde-policy-reader';

// ===========================================================================
// Types
// ===========================================================================

export type CourseTier = 1 | 2 | 3;

export type TierEligibilityMode =
  | 'natural_fit_only'
  | 'after_tier_1_success'
  | 'not_eligible'
  | 'open';

export interface LearnerProfile {
  /** Number of tier-1 PDE courses the learner has previously passed. */
  prior_tier_1_passes?: number;
  /**
   * The college slug used to look up per-college compliance targets.
   * Examples: 'medical', 'engineering', 'nursing', 'pharmacy', etc.
   */
  college_slug?: string;
}

export interface TierEligibilityInput {
  tier: CourseTier;
  learnerId: string;
  learnerProfile?: LearnerProfile;
  institutionId?: string | null;
}

export interface TierEligibilityDecision {
  eligible: boolean;
  /** The policy mode that drove the decision (echoed for caller audit). */
  mode: TierEligibilityMode | string;
  /** Human-readable explanation when eligible=false; optional when true. */
  reason?: string;
}

// ===========================================================================
// Service
// ===========================================================================

export class PDETierEligibilityService {
  /**
   * Check whether a learner is eligible to enrol in a PDE-wrapped course
   * at the given tier, based on the active `pde.rollout.tier_eligibility`
   * policy.
   */
  static async checkCourseEligibility(
    input: TierEligibilityInput
  ): Promise<TierEligibilityDecision> {
    const policy = await getTierEligibility(input.institutionId ?? null);
    const mode = PDETierEligibilityService.modeForTier(policy, input.tier);

    switch (mode) {
      case 'open':
        return { eligible: true, mode };

      case 'not_eligible':
        return {
          eligible: false,
          mode,
          reason: `Tier ${input.tier} is policy-blocked institution-wide.`,
        };

      case 'after_tier_1_success': {
        const passes = input.learnerProfile?.prior_tier_1_passes ?? 0;
        if (passes >= 1) return { eligible: true, mode };
        return {
          eligible: false,
          mode,
          reason: `Tier ${input.tier} requires at least 1 prior tier-1 pass; learner has ${passes}.`,
        };
      }

      case 'natural_fit_only': {
        return PDETierEligibilityService.checkNaturalFit(input, mode);
      }

      default:
        return {
          eligible: false,
          mode,
          reason: `Unknown tier eligibility mode '${mode}'; defaulting to not eligible.`,
        };
    }
  }

  /**
   * Look up the per-college compliance targets and return eligibility when the
   * learner's college has any targets for the tier. We treat presence of ANY
   * target categories for the learner's college as a "natural fit" signal.
   */
  static async checkNaturalFit(
    input: TierEligibilityInput,
    mode: TierEligibilityMode
  ): Promise<TierEligibilityDecision> {
    const collegeSlug = input.learnerProfile?.college_slug;
    if (!collegeSlug) {
      return {
        eligible: false,
        mode,
        reason: `Tier ${input.tier} requires natural fit; learner college unknown.`,
      };
    }

    const targets = await getPerCollegeComplianceTargets(input.institutionId ?? null);
    const collegeTargets = targets?.[collegeSlug] ?? targets?.default ?? [];

    if (!Array.isArray(collegeTargets) || collegeTargets.length === 0) {
      return {
        eligible: false,
        mode,
        reason: `Tier ${input.tier} requires natural fit; college '${collegeSlug}' has no compliance targets.`,
      };
    }

    return { eligible: true, mode };
  }

  /**
   * Extract the policy mode for a specific tier from the TierEligibility row.
   * Falls back to 'not_eligible' when the tier key is absent (conservative).
   */
  static modeForTier(policy: TierEligibility, tier: CourseTier): TierEligibilityMode {
    const raw =
      tier === 1
        ? policy?.tier_1
        : tier === 2
          ? policy?.tier_2
          : policy?.tier_3;
    if (!raw) return 'not_eligible';
    if (
      raw === 'natural_fit_only' ||
      raw === 'after_tier_1_success' ||
      raw === 'not_eligible' ||
      raw === 'open'
    ) {
      return raw;
    }
    return 'not_eligible';
  }

  /**
   * Convenience helper to fetch the learner's profile fields used by this
   * service. Returns an empty object when supabase lookup fails so callers
   * can still pass it through to `checkCourseEligibility` without branching.
   *
   * The profile shape is intentionally narrow — callers who already have
   * richer profile data should construct the input object directly.
   */
  static async loadLearnerProfile(learnerId: string): Promise<LearnerProfile> {
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await (supabase as any)
        .from('profiles')
        .select('college_slug')
        .eq('id', learnerId)
        .single();
      return {
        college_slug: data?.college_slug ?? undefined,
      };
    } catch {
      return {};
    }
  }
}
