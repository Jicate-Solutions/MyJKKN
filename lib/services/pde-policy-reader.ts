/**
 * PDE Policy Reader Service
 * ============================================================================
 *
 * Typed server-side accessors for the 20 `pde.*` rows in `platform_policies`.
 *
 * Seeded by migrations:
 *   - 20260518_pde_cluster_a_scoring_integrity_policies.sql      (4 keys)
 *   - 20260518_pde_cluster_b_visibility_transparency_policies.sql (4 keys)
 *   - 20260518_pde_cluster_c_rollout_compliance_policies.sql     (4 keys)
 *   - 20260518_pde_cluster_d_quests_supply_policies.sql          (4 keys)
 *   - 20260518112603_pde_cluster_e_governance_defense_policies.sql (4 keys)
 *
 * Read substrate:
 *   `fn_get_policy_json(p_key TEXT, p_default JSONB, p_scope_id UUID) → JSONB`
 *   (see supabase/migrations/20260515000001_fn_get_policy_json.sql)
 *
 * Every accessor:
 *   - Calls the RPC with the seeded default baked in as `p_default`
 *   - Accepts an optional `institutionId` for future per-institution overrides
 *     (substrate already supports scope_type='institution' rows; today all 20
 *     rows are scope_type='global'). Resolution priority enforced by the
 *     `fn_get_policy` resolver: user > institution > role > global.
 *   - Returns the typed shape on success; falls back to the baked default on
 *     RPC error so PDE features never break because of a missing row.
 *
 * Pattern alignment: this matches `lib/services/hr/wave3-policy-editor-service.ts`
 * `getPolicyValue`, but pre-types each key + bakes the default rather than
 * making every caller pass one.
 *
 * Phase: PDE Substrate (2026-05-18).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  PDE_POLICY_KEYS,
  type PdePolicyKey,
  type DemonstrationWeights,
  type AiDeliverableCreditPolicy,
  type AgencyIndexMode,
  type CohortComparisonScope,
  type CapabilityVersioningPolicy,
  type IndividualMetricDisplay,
  type HodBlockingEscalation,
  type PerCollegeComplianceTargets,
  type TierEligibility,
  type QuestsRiskTiers,
  type QuestSupplySource,
  type QuestsCompensationModel,
  type FailedQuestRecovery,
  type AgencyGamingDefense,
  type FeedbackIdentityPolicy,
  type PlacementSignalResponse,
  type FrameworkBranding,
} from './pde-policy-reader-types';

// Re-export pure types/constants for backward compatibility with existing
// server-side callers that still import them from this module. Client
// components must import from './pde-policy-reader-types' directly to avoid
// dragging in the server Supabase client (next/headers).
export {
  PDE_POLICY_KEYS,
  type PdePolicyKey,
  type DemonstrationWeights,
  type AiDeliverableCreditMode,
  type AiDeliverableCreditPolicy,
  type AgencyIndexMode,
  type CohortComparisonScope,
  type CapabilityVersioningMode,
  type CapabilityVersioningPolicy,
  type IndividualMetricDisplay,
  type HodBlockingEscalation,
  type PerCollegeComplianceTargets,
  type TierEligibility,
  type QuestRiskTier,
  type QuestsRiskTiers,
  type QuestSupplySource,
  type QuestsCompensationModel,
  type FailedQuestRecoveryMode,
  type FailedQuestRecovery,
  type AgencyGamingDefenseMode,
  type AgencyGamingDefense,
  type FeedbackIdentityMode,
  type FeedbackIdentityPolicy,
  type PlacementSignalResponse,
  type FrameworkBranding,
} from './pde-policy-reader-types';

// ===========================================================================
// Internal RPC helper — keeps all 20 accessors tiny + uniform.
// ===========================================================================

async function readPdePolicy<T>(
  key: PdePolicyKey,
  defaultValue: T,
  institutionId?: string | null
): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('fn_get_policy_json', {
    p_key: key,
    p_default: defaultValue as unknown as object,
    p_scope_id: institutionId ?? null,
  });
  if (error) {
    // Fail-soft: every PDE consumer must keep rendering even if policy lookup fails.
    // Matches the convention in lib/policies/get-policy.ts.
    // eslint-disable-next-line no-console
    console.warn(`[pde-policy-reader] RPC failed for ${key}, using default`, error.message);
    return defaultValue;
  }
  // RPC returns null when neither a row exists nor the default propagates; guard anyway.
  return (data ?? defaultValue) as T;
}

// ===========================================================================
// Cluster A — Scoring & Integrity accessors
// ===========================================================================

/** Demonstration gate scoring weights — three components must sum to 100. */
export async function getDemonstrationWeights(
  institutionId?: string | null
): Promise<DemonstrationWeights> {
  return readPdePolicy<DemonstrationWeights>(
    PDE_POLICY_KEYS.SCORING_DEMONSTRATION_WEIGHTS,
    { faculty: 50, peer: 30, ai: 20 },
    institutionId
  );
}

/** When true, detect peer reviewers whose scores systematically diverge from cohort averages. */
export async function getPeerBiasDetectionEnabled(
  institutionId?: string | null
): Promise<boolean> {
  return readPdePolicy<boolean>(
    PDE_POLICY_KEYS.SCORING_PEER_BIAS_DETECTION_ENABLED,
    true,
    institutionId
  );
}

/** Faculty approval-rate (0..1) above which calibration audit is triggered. */
export async function getValidatorAuditThreshold(
  institutionId?: string | null
): Promise<number> {
  return readPdePolicy<number>(
    PDE_POLICY_KEYS.SCORING_VALIDATOR_AUDIT_THRESHOLD,
    0.95,
    institutionId
  );
}

/** Policy for crediting student deliverables built with heavy AI use. */
export async function getAiDeliverableCreditPolicy(
  institutionId?: string | null
): Promise<AiDeliverableCreditPolicy> {
  return readPdePolicy<AiDeliverableCreditPolicy>(
    PDE_POLICY_KEYS.SCORING_AI_DELIVERABLE_CREDIT_POLICY,
    {
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: false,
    },
    institutionId
  );
}

// ===========================================================================
// Cluster B — Visibility & Transparency accessors
// ===========================================================================

/** Controls when learners see their Agency Index score. */
export async function getAgencyIndexMode(
  institutionId?: string | null
): Promise<AgencyIndexMode> {
  return readPdePolicy<AgencyIndexMode>(
    PDE_POLICY_KEYS.VISIBILITY_AGENCY_INDEX_MODE,
    'live',
    institutionId
  );
}

/** Who sees inter-college Agency Index comparisons. */
export async function getCohortComparisonScope(
  institutionId?: string | null
): Promise<CohortComparisonScope> {
  return readPdePolicy<CohortComparisonScope>(
    PDE_POLICY_KEYS.VISIBILITY_COHORT_COMPARISON_SCOPE,
    'institution_wide',
    institutionId
  );
}

/** How to treat old capability certifications when definitions evolve. */
export async function getCapabilityVersioningPolicy(
  institutionId?: string | null
): Promise<CapabilityVersioningPolicy> {
  return readPdePolicy<CapabilityVersioningPolicy>(
    PDE_POLICY_KEYS.VISIBILITY_CAPABILITY_VERSIONING_POLICY,
    {
      mode: 'grandfather_with_upgrade',
      show_version_tag: true,
      expire_after_years: null,
    },
    institutionId
  );
}

/** What learners see about their own metrics. */
export async function getIndividualMetricDisplay(
  institutionId?: string | null
): Promise<IndividualMetricDisplay> {
  return readPdePolicy<IndividualMetricDisplay>(
    PDE_POLICY_KEYS.VISIBILITY_INDIVIDUAL_METRIC_DISPLAY,
    {
      show_numeric_score: true,
      show_percentile: true,
      show_audit_trail: true,
    },
    institutionId
  );
}

// ===========================================================================
// Cluster C — Rollout & Compliance accessors
// ===========================================================================

/** Maximum number of new course coordinators onboarded into PDE per 60-day window. */
export async function getPaceCapCoordinatorsPer60d(
  institutionId?: string | null
): Promise<number> {
  return readPdePolicy<number>(
    PDE_POLICY_KEYS.ROLLOUT_PACE_CAP_COORDINATORS_PER_60D,
    30,
    institutionId
  );
}

/** Which of the 7 durable-value categories each college targets for PDE compliance. */
export async function getPerCollegeComplianceTargets(
  institutionId?: string | null
): Promise<PerCollegeComplianceTargets> {
  return readPdePolicy<PerCollegeComplianceTargets>(
    PDE_POLICY_KEYS.ROLLOUT_PER_COLLEGE_COMPLIANCE_TARGETS,
    {
      medical: ['judgment', 'embodied', 'accountability', 'credential'],
      pharmacy: ['judgment', 'embodied', 'accountability', 'credential'],
      nursing: ['judgment', 'embodied', 'social_leadership', 'credential'],
      dental: ['judgment', 'embodied', 'accountability', 'credential'],
      engineering: [
        'judgment',
        'problem_finding',
        'accountability',
        'social_leadership',
        'credential',
      ],
      education: ['judgment', 'social_leadership', 'cultural_civic', 'credential'],
      arts_science: ['judgment', 'problem_finding', 'cultural_civic', 'credential'],
      default: ['judgment', 'problem_finding', 'accountability', 'credential'],
    },
    institutionId
  );
}

/** How to handle an HOD who refuses PDE in their department. */
export async function getHodBlockingEscalation(
  institutionId?: string | null
): Promise<HodBlockingEscalation> {
  return readPdePolicy<HodBlockingEscalation>(
    PDE_POLICY_KEYS.ROLLOUT_HOD_BLOCKING_ESCALATION,
    'dean_kpi',
    institutionId
  );
}

/** Which course tiers are eligible for PDE wrapping. */
export async function getTierEligibility(
  institutionId?: string | null
): Promise<TierEligibility> {
  return readPdePolicy<TierEligibility>(
    PDE_POLICY_KEYS.ROLLOUT_TIER_ELIGIBILITY,
    {
      tier_1: 'natural_fit_only',
      tier_2: 'after_tier_1_success',
      tier_3: 'not_eligible',
    },
    institutionId
  );
}

// ===========================================================================
// Cluster D — Quests & Supply accessors
// ===========================================================================

/** Risk tier system for quest sourcing. */
export async function getQuestsRiskTiers(
  institutionId?: string | null
): Promise<QuestsRiskTiers> {
  return readPdePolicy<QuestsRiskTiers>(
    PDE_POLICY_KEYS.QUESTS_RISK_TIERS,
    {
      enabled: true,
      tiers: ['experimental', 'production'],
      default_tier: 'experimental',
      production_eligibility: 'after_2_experimental_passes',
    },
    institutionId
  );
}

/** Active quest supply sources. */
export async function getQuestsSupplySources(
  institutionId?: string | null
): Promise<QuestSupplySource[]> {
  return readPdePolicy<QuestSupplySource[]>(
    PDE_POLICY_KEYS.QUESTS_SUPPLY_SOURCES,
    ['internal_departments', 'industry_partners', 'alumni_led', 'student_proposed'],
    institutionId
  );
}

/** How quest contributors are compensated. */
export async function getQuestsCompensationModel(
  institutionId?: string | null
): Promise<QuestsCompensationModel> {
  return readPdePolicy<QuestsCompensationModel>(
    PDE_POLICY_KEYS.QUESTS_COMPENSATION_MODEL,
    'reciprocal_credit',
    institutionId
  );
}

/** What happens when a learner fails a real-world quest. */
export async function getFailedQuestRecovery(
  institutionId?: string | null
): Promise<FailedQuestRecovery> {
  return readPdePolicy<FailedQuestRecovery>(
    PDE_POLICY_KEYS.QUESTS_FAILED_QUEST_RECOVERY,
    {
      mode: 'department_set_risk_tiers',
      faculty_recovery_enabled: false,
    },
    institutionId
  );
}

// ===========================================================================
// Cluster E — Governance & Defense accessors
// ===========================================================================

/** Defense against gaming the Agency Index. */
export async function getAgencyGamingDefense(
  institutionId?: string | null
): Promise<AgencyGamingDefense> {
  return readPdePolicy<AgencyGamingDefense>(
    PDE_POLICY_KEYS.GOVERNANCE_AGENCY_GAMING_DEFENSE,
    {
      mode: 'judgment_of_judgment_audit',
      audit_sample_rate: 0.1,
    },
    institutionId
  );
}

/** How 360-degree leadership feedback identity is handled (Phase 8). */
export async function getFeedbackIdentityPolicy(
  institutionId?: string | null
): Promise<FeedbackIdentityPolicy> {
  return readPdePolicy<FeedbackIdentityPolicy>(
    PDE_POLICY_KEYS.GOVERNANCE_FEEDBACK_IDENTITY_POLICY,
    {
      mode: 'attributed_moderated',
      moderator_role: 'faculty',
    },
    institutionId
  );
}

/** How to respond to year-1 PDE-graduate placement signal. */
export async function getPlacementSignalResponse(
  institutionId?: string | null
): Promise<PlacementSignalResponse> {
  return readPdePolicy<PlacementSignalResponse>(
    PDE_POLICY_KEYS.GOVERNANCE_PLACEMENT_SIGNAL_RESPONSE,
    'active_briefing',
    institutionId
  );
}

/** How to publicly attribute the 7-category framework. */
export async function getFrameworkBranding(
  institutionId?: string | null
): Promise<FrameworkBranding> {
  return readPdePolicy<FrameworkBranding>(
    PDE_POLICY_KEYS.GOVERNANCE_FRAMEWORK_BRANDING,
    'attribution_and_claim',
    institutionId
  );
}
