import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock createServerSupabaseClient — every accessor uses this single entry point.
// `rpc` returns the configured payload; tests assert on the arguments passed.
// ---------------------------------------------------------------------------
const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: null as unknown }));
const supabaseMock: any = { rpc: rpcMock };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(supabaseMock),
}));

// Re-import after mocks (vitest hoists `vi.mock`).
import {
  PDE_POLICY_KEYS,
  getDemonstrationWeights,
  getPeerBiasDetectionEnabled,
  getValidatorAuditThreshold,
  getAiDeliverableCreditPolicy,
  getAgencyIndexMode,
  getCohortComparisonScope,
  getCapabilityVersioningPolicy,
  getIndividualMetricDisplay,
  getPaceCapCoordinatorsPer60d,
  getPerCollegeComplianceTargets,
  getHodBlockingEscalation,
  getTierEligibility,
  getQuestsRiskTiers,
  getQuestsSupplySources,
  getQuestsCompensationModel,
  getFailedQuestRecovery,
  getAgencyGamingDefense,
  getFeedbackIdentityPolicy,
  getPlacementSignalResponse,
  getFrameworkBranding,
} from '@/lib/services/pde-policy-reader';

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

// ---------------------------------------------------------------------------
// Shared assertion helper — every accessor calls fn_get_policy_json with the
// correct key + bakes the seeded default into p_default.
// ---------------------------------------------------------------------------
function expectRpcCalledWith(key: string, defaultValue: unknown, scope: string | null = null) {
  expect(rpcMock).toHaveBeenCalledTimes(1);
  expect(rpcMock).toHaveBeenCalledWith('fn_get_policy_json', {
    p_key: key,
    p_default: defaultValue,
    p_scope_id: scope,
  });
}

// ---------------------------------------------------------------------------
// Cluster A — Scoring & Integrity
// ---------------------------------------------------------------------------

describe('Cluster A — scoring', () => {
  it('getDemonstrationWeights uses seeded default and correct key', async () => {
    const result = await getDemonstrationWeights();
    expectRpcCalledWith(PDE_POLICY_KEYS.SCORING_DEMONSTRATION_WEIGHTS, {
      faculty: 50,
      peer: 30,
      ai: 20,
    });
    // RPC returns null → accessor falls back to baked default.
    expect(result).toEqual({ faculty: 50, peer: 30, ai: 20 });
  });

  it('getDemonstrationWeights returns RPC data when present', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { faculty: 60, peer: 25, ai: 15 },
      error: null,
    });
    const result = await getDemonstrationWeights();
    expect(result).toEqual({ faculty: 60, peer: 25, ai: 15 });
  });

  it('getDemonstrationWeights falls back to default on RPC error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const result = await getDemonstrationWeights();
    expect(result).toEqual({ faculty: 50, peer: 30, ai: 20 });
  });

  it('getPeerBiasDetectionEnabled defaults to true', async () => {
    const result = await getPeerBiasDetectionEnabled();
    expectRpcCalledWith(PDE_POLICY_KEYS.SCORING_PEER_BIAS_DETECTION_ENABLED, true);
    expect(result).toBe(true);
  });

  it('getValidatorAuditThreshold defaults to 0.95', async () => {
    const result = await getValidatorAuditThreshold();
    expectRpcCalledWith(PDE_POLICY_KEYS.SCORING_VALIDATOR_AUDIT_THRESHOLD, 0.95);
    expect(result).toBe(0.95);
  });

  it('getAiDeliverableCreditPolicy default mode is full_credit_if_agency_proven', async () => {
    const result = await getAiDeliverableCreditPolicy();
    expectRpcCalledWith(PDE_POLICY_KEYS.SCORING_AI_DELIVERABLE_CREDIT_POLICY, {
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: false,
    });
    expect(result.mode).toBe('full_credit_if_agency_proven');
  });
});

// ---------------------------------------------------------------------------
// Cluster B — Visibility & Transparency
// ---------------------------------------------------------------------------

describe('Cluster B — visibility', () => {
  it('getAgencyIndexMode defaults to "live"', async () => {
    const result = await getAgencyIndexMode();
    expectRpcCalledWith(PDE_POLICY_KEYS.VISIBILITY_AGENCY_INDEX_MODE, 'live');
    expect(result).toBe('live');
  });

  it('getCohortComparisonScope defaults to "institution_wide"', async () => {
    const result = await getCohortComparisonScope();
    expectRpcCalledWith(PDE_POLICY_KEYS.VISIBILITY_COHORT_COMPARISON_SCOPE, 'institution_wide');
    expect(result).toBe('institution_wide');
  });

  it('getCapabilityVersioningPolicy default mode is grandfather_with_upgrade', async () => {
    const result = await getCapabilityVersioningPolicy();
    expectRpcCalledWith(PDE_POLICY_KEYS.VISIBILITY_CAPABILITY_VERSIONING_POLICY, {
      mode: 'grandfather_with_upgrade',
      show_version_tag: true,
      expire_after_years: null,
    });
    expect(result.mode).toBe('grandfather_with_upgrade');
  });

  it('getIndividualMetricDisplay defaults to all-visible', async () => {
    const result = await getIndividualMetricDisplay();
    expectRpcCalledWith(PDE_POLICY_KEYS.VISIBILITY_INDIVIDUAL_METRIC_DISPLAY, {
      show_numeric_score: true,
      show_percentile: true,
      show_audit_trail: true,
    });
    expect(result.show_audit_trail).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cluster C — Rollout & Compliance
// ---------------------------------------------------------------------------

describe('Cluster C — rollout', () => {
  it('getPaceCapCoordinatorsPer60d defaults to 30', async () => {
    const result = await getPaceCapCoordinatorsPer60d();
    expectRpcCalledWith(PDE_POLICY_KEYS.ROLLOUT_PACE_CAP_COORDINATORS_PER_60D, 30);
    expect(result).toBe(30);
  });

  it('getPerCollegeComplianceTargets has a default key + 7-college map', async () => {
    const result = await getPerCollegeComplianceTargets();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const arg = rpcMock.mock.calls[0][1];
    expect(arg.p_key).toBe(PDE_POLICY_KEYS.ROLLOUT_PER_COLLEGE_COMPLIANCE_TARGETS);
    expect(Object.keys(arg.p_default)).toContain('default');
    expect(Object.keys(arg.p_default)).toContain('engineering');
    expect(result.default).toContain('judgment');
  });

  it('getHodBlockingEscalation defaults to "dean_kpi"', async () => {
    const result = await getHodBlockingEscalation();
    expectRpcCalledWith(PDE_POLICY_KEYS.ROLLOUT_HOD_BLOCKING_ESCALATION, 'dean_kpi');
    expect(result).toBe('dean_kpi');
  });

  it('getTierEligibility default tier_3 is not_eligible', async () => {
    const result = await getTierEligibility();
    expectRpcCalledWith(PDE_POLICY_KEYS.ROLLOUT_TIER_ELIGIBILITY, {
      tier_1: 'natural_fit_only',
      tier_2: 'after_tier_1_success',
      tier_3: 'not_eligible',
    });
    expect(result.tier_3).toBe('not_eligible');
  });
});

// ---------------------------------------------------------------------------
// Cluster D — Quests & Supply
// ---------------------------------------------------------------------------

describe('Cluster D — quests', () => {
  it('getQuestsRiskTiers default tiers include experimental + production', async () => {
    const result = await getQuestsRiskTiers();
    expectRpcCalledWith(PDE_POLICY_KEYS.QUESTS_RISK_TIERS, {
      enabled: true,
      tiers: ['experimental', 'production'],
      default_tier: 'experimental',
      production_eligibility: 'after_2_experimental_passes',
    });
    expect(result.tiers).toEqual(['experimental', 'production']);
  });

  it('getQuestsSupplySources defaults to all 4 sources', async () => {
    const result = await getQuestsSupplySources();
    expectRpcCalledWith(PDE_POLICY_KEYS.QUESTS_SUPPLY_SOURCES, [
      'internal_departments',
      'industry_partners',
      'alumni_led',
      'student_proposed',
    ]);
    expect(result).toHaveLength(4);
  });

  it('getQuestsCompensationModel defaults to "reciprocal_credit"', async () => {
    const result = await getQuestsCompensationModel();
    expectRpcCalledWith(PDE_POLICY_KEYS.QUESTS_COMPENSATION_MODEL, 'reciprocal_credit');
    expect(result).toBe('reciprocal_credit');
  });

  it('getFailedQuestRecovery default mode is department_set_risk_tiers', async () => {
    const result = await getFailedQuestRecovery();
    expectRpcCalledWith(PDE_POLICY_KEYS.QUESTS_FAILED_QUEST_RECOVERY, {
      mode: 'department_set_risk_tiers',
      faculty_recovery_enabled: false,
    });
    expect(result.mode).toBe('department_set_risk_tiers');
  });
});

// ---------------------------------------------------------------------------
// Cluster E — Governance & Defense
// ---------------------------------------------------------------------------

describe('Cluster E — governance', () => {
  it('getAgencyGamingDefense default mode is judgment_of_judgment_audit', async () => {
    const result = await getAgencyGamingDefense();
    expectRpcCalledWith(PDE_POLICY_KEYS.GOVERNANCE_AGENCY_GAMING_DEFENSE, {
      mode: 'judgment_of_judgment_audit',
      audit_sample_rate: 0.1,
    });
    expect(result.mode).toBe('judgment_of_judgment_audit');
  });

  it('getFeedbackIdentityPolicy default mode is attributed_moderated', async () => {
    const result = await getFeedbackIdentityPolicy();
    expectRpcCalledWith(PDE_POLICY_KEYS.GOVERNANCE_FEEDBACK_IDENTITY_POLICY, {
      mode: 'attributed_moderated',
      moderator_role: 'faculty',
    });
    expect(result.mode).toBe('attributed_moderated');
  });

  it('getPlacementSignalResponse defaults to "active_briefing"', async () => {
    const result = await getPlacementSignalResponse();
    expectRpcCalledWith(PDE_POLICY_KEYS.GOVERNANCE_PLACEMENT_SIGNAL_RESPONSE, 'active_briefing');
    expect(result).toBe('active_briefing');
  });

  it('getFrameworkBranding defaults to "attribution_and_claim"', async () => {
    const result = await getFrameworkBranding();
    expectRpcCalledWith(PDE_POLICY_KEYS.GOVERNANCE_FRAMEWORK_BRANDING, 'attribution_and_claim');
    expect(result).toBe('attribution_and_claim');
  });
});

// ---------------------------------------------------------------------------
// Scope propagation — institutionId flows into p_scope_id.
// ---------------------------------------------------------------------------

describe('institutionId scope propagation', () => {
  it('passes institutionId as p_scope_id', async () => {
    await getDemonstrationWeights('inst-123');
    expect(rpcMock).toHaveBeenCalledWith('fn_get_policy_json', expect.objectContaining({
      p_scope_id: 'inst-123',
    }));
  });

  it('passes null when institutionId omitted', async () => {
    await getDemonstrationWeights();
    expect(rpcMock).toHaveBeenCalledWith('fn_get_policy_json', expect.objectContaining({
      p_scope_id: null,
    }));
  });

  it('treats undefined institutionId as null', async () => {
    await getDemonstrationWeights(undefined);
    expect(rpcMock).toHaveBeenCalledWith('fn_get_policy_json', expect.objectContaining({
      p_scope_id: null,
    }));
  });
});
