// =============================================================================
// lib/services/pde-policy-reader-types.ts
// Pure types & constants extracted from pde-policy-reader.ts so client
// components can import them without dragging in `@/lib/supabase/server`
// (which uses next/headers and is server-only).
//
// Anything in this file MUST stay free of server-only imports.
// =============================================================================

// ===========================================================================
// Policy key constants — keep grep-able & SSOT for the 20 keys.
// ===========================================================================

export const PDE_POLICY_KEYS = {
  // Cluster A — scoring & integrity
  SCORING_DEMONSTRATION_WEIGHTS: 'pde.scoring.demonstration_weights',
  SCORING_PEER_BIAS_DETECTION_ENABLED: 'pde.scoring.peer_bias_detection_enabled',
  SCORING_VALIDATOR_AUDIT_THRESHOLD: 'pde.scoring.validator_audit_threshold',
  SCORING_AI_DELIVERABLE_CREDIT_POLICY: 'pde.scoring.ai_deliverable_credit_policy',

  // Cluster B — visibility & transparency
  VISIBILITY_AGENCY_INDEX_MODE: 'pde.visibility.agency_index_mode',
  VISIBILITY_COHORT_COMPARISON_SCOPE: 'pde.visibility.cohort_comparison_scope',
  VISIBILITY_CAPABILITY_VERSIONING_POLICY: 'pde.visibility.capability_versioning_policy',
  VISIBILITY_INDIVIDUAL_METRIC_DISPLAY: 'pde.visibility.individual_metric_display',

  // Cluster C — rollout & compliance
  ROLLOUT_PACE_CAP_COORDINATORS_PER_60D: 'pde.rollout.pace_cap_coordinators_per_60d',
  ROLLOUT_PER_COLLEGE_COMPLIANCE_TARGETS: 'pde.rollout.per_college_compliance_targets',
  ROLLOUT_HOD_BLOCKING_ESCALATION: 'pde.rollout.hod_blocking_escalation',
  ROLLOUT_TIER_ELIGIBILITY: 'pde.rollout.tier_eligibility',

  // Cluster D — quests & supply
  QUESTS_RISK_TIERS: 'pde.quests.risk_tiers',
  QUESTS_SUPPLY_SOURCES: 'pde.quests.supply_sources',
  QUESTS_COMPENSATION_MODEL: 'pde.quests.compensation_model',
  QUESTS_FAILED_QUEST_RECOVERY: 'pde.quests.failed_quest_recovery',

  // Cluster E — governance & defense
  GOVERNANCE_AGENCY_GAMING_DEFENSE: 'pde.governance.agency_gaming_defense',
  GOVERNANCE_FEEDBACK_IDENTITY_POLICY: 'pde.governance.feedback_identity_policy',
  GOVERNANCE_PLACEMENT_SIGNAL_RESPONSE: 'pde.governance.placement_signal_response',
  GOVERNANCE_FRAMEWORK_BRANDING: 'pde.governance.framework_branding',
} as const;

export type PdePolicyKey = (typeof PDE_POLICY_KEYS)[keyof typeof PDE_POLICY_KEYS];

// ===========================================================================
// Cluster A — Scoring & Integrity types
// ===========================================================================

export interface DemonstrationWeights {
  faculty: number;
  peer: number;
  ai: number;
}

export type AiDeliverableCreditMode =
  | 'full_credit_if_agency_proven'
  | 'reduced_credit_proportional'
  | 'disclosure_required_full_credit';

export interface AiDeliverableCreditPolicy {
  mode: AiDeliverableCreditMode;
  min_agency_score: number;
  require_disclosure: boolean;
}

// ===========================================================================
// Cluster B — Visibility & Transparency types
// ===========================================================================

export type AgencyIndexMode = 'live' | 'semester_end' | 'live_coarse';
export type CohortComparisonScope = 'institution_wide' | 'deans_only' | 'aggregated_only';

export type CapabilityVersioningMode =
  | 'grandfather_with_upgrade'
  | 'auto_expire'
  | 'version_tag_only';

export interface CapabilityVersioningPolicy {
  mode: CapabilityVersioningMode;
  show_version_tag: boolean;
  expire_after_years: number | null;
}

export interface IndividualMetricDisplay {
  show_numeric_score: boolean;
  show_percentile: boolean;
  show_audit_trail: boolean;
}

// ===========================================================================
// Cluster C — Rollout & Compliance types
// ===========================================================================

export type HodBlockingEscalation = 'respect_no' | 'bypass_hod_to_coordinator' | 'dean_kpi';

/**
 * Map keyed by college slug (e.g. 'medical', 'engineering') with the value
 * being the list of 7-category durable-value codes that college targets.
 * `default` key applies when no college-specific row is present.
 */
export type PerCollegeComplianceTargets = Record<string, string[]>;

export interface TierEligibility {
  tier_1: string;
  tier_2: string;
  tier_3: string;
}

// ===========================================================================
// Cluster D — Quests & Supply types
// ===========================================================================

export type QuestRiskTier = string;

export interface QuestsRiskTiers {
  enabled: boolean;
  tiers: QuestRiskTier[];
  default_tier: QuestRiskTier;
  production_eligibility: string;
}

export type QuestSupplySource =
  | 'internal_departments'
  | 'industry_partners'
  | 'alumni_led'
  | 'student_proposed';

export type QuestsCompensationModel =
  | 'voluntary_recognition'
  | 'reciprocal_credit'
  | 'honorarium_per_quest';

export type FailedQuestRecoveryMode = 'department_set_risk_tiers';

export interface FailedQuestRecovery {
  mode: FailedQuestRecoveryMode;
  faculty_recovery_enabled: boolean;
}

// ===========================================================================
// Cluster E — Governance & Defense types
// ===========================================================================

export type AgencyGamingDefenseMode =
  | 'judgment_of_judgment_audit'
  | 'relative_percentile'
  | 'rotating_metrics';

export interface AgencyGamingDefense {
  mode: AgencyGamingDefenseMode;
  audit_sample_rate: number;
}

export type FeedbackIdentityMode =
  | 'attributed_moderated'
  | 'fully_anonymous'
  | 'fully_attributed';

export interface FeedbackIdentityPolicy {
  mode: FeedbackIdentityMode;
  moderator_role: string;
}

export type PlacementSignalResponse = 'active_briefing' | 'wait_2_cycles' | 'scope_reduction';
export type FrameworkBranding = 'attribution_and_claim' | 'cite_only' | 'original_synthesis';
