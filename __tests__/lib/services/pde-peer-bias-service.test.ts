import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the policy reader so each test can flip detection on/off without
// touching the database.
// ---------------------------------------------------------------------------

const getPeerBiasDetectionEnabledMock = vi.fn();

vi.mock('@/lib/services/pde-policy-reader', () => ({
  getPeerBiasDetectionEnabled: (instId?: string | null) =>
    getPeerBiasDetectionEnabledMock(instId),
}));

import { PDEPeerBiasService, type PriorValidation } from '@/lib/services/pde-peer-bias-service';

beforeEach(() => {
  getPeerBiasDetectionEnabledMock.mockReset();
  // Default to enabled for the majority of tests; individual tests can
  // mockResolvedValueOnce(false) when they need the disabled path.
  getPeerBiasDetectionEnabledMock.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// isEnabled — wrapper sanity
// ---------------------------------------------------------------------------

describe('isEnabled', () => {
  it('returns true when policy is enabled', async () => {
    getPeerBiasDetectionEnabledMock.mockReset();
    getPeerBiasDetectionEnabledMock.mockResolvedValue(true);
    await expect(PDEPeerBiasService.isEnabled()).resolves.toBe(true);
  });

  it('returns false when policy is disabled', async () => {
    getPeerBiasDetectionEnabledMock.mockReset();
    getPeerBiasDetectionEnabledMock.mockResolvedValue(false);
    await expect(PDEPeerBiasService.isEnabled()).resolves.toBe(false);
  });

  it('forwards institutionId to the policy reader', async () => {
    getPeerBiasDetectionEnabledMock.mockReset();
    getPeerBiasDetectionEnabledMock.mockResolvedValue(true);
    await PDEPeerBiasService.isEnabled('inst-123');
    expect(getPeerBiasDetectionEnabledMock).toHaveBeenCalledWith('inst-123');
  });
});

// ---------------------------------------------------------------------------
// flagPotentialBias — disabled-by-policy short-circuit
// ---------------------------------------------------------------------------

describe('flagPotentialBias — disabled by policy', () => {
  it('short-circuits with reason="detection disabled by policy"', async () => {
    getPeerBiasDetectionEnabledMock.mockReset();
    getPeerBiasDetectionEnabledMock.mockResolvedValue(false);
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 100,
      prior_validations: Array.from({ length: 10 }, () => ({
        learnerId: 'L1',
        raw_score: 100,
      })),
    });
    expect(res.flagged).toBe(false);
    expect(res.reasons).toEqual(['detection disabled by policy']);
  });
});

// ---------------------------------------------------------------------------
// flagPotentialBias — no-flag case
// ---------------------------------------------------------------------------

describe('flagPotentialBias — clean record', () => {
  it('returns flagged=false with empty reasons when no signals fire', async () => {
    const priors: PriorValidation[] = [
      { learnerId: 'L1', raw_score: 70 },
      { learnerId: 'L2', raw_score: 65 },
      { learnerId: 'L3', raw_score: 80 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 75,
      prior_validations: priors,
    });
    expect(res.flagged).toBe(false);
    expect(res.reasons).toEqual([]);
  });

  it('empty prior_validations array → not flagged', async () => {
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 85,
      prior_validations: [],
    });
    expect(res.flagged).toBe(false);
    expect(res.reasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Signal 1 — collusion pattern
// ---------------------------------------------------------------------------

describe('flagPotentialBias — collusion (same-learner-same-score)', () => {
  it('3+ prior identical scores for same learner → flagged with collusion reason', async () => {
    const priors: PriorValidation[] = [
      { learnerId: 'L1', raw_score: 85 },
      { learnerId: 'L1', raw_score: 85 },
      { learnerId: 'L1', raw_score: 85 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 85,
      prior_validations: priors,
    });
    expect(res.flagged).toBe(true);
    expect(res.reasons.some((r) => /collusion/i.test(r))).toBe(true);
  });

  it('2 prior identical scores for same learner → not flagged (below threshold)', async () => {
    const priors: PriorValidation[] = [
      { learnerId: 'L1', raw_score: 85 },
      { learnerId: 'L1', raw_score: 85 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 85,
      prior_validations: priors,
    });
    expect(res.reasons.some((r) => /collusion/i.test(r))).toBe(false);
  });

  it('3 prior identical scores but for a DIFFERENT learner → not flagged on collusion', async () => {
    const priors: PriorValidation[] = [
      { learnerId: 'L2', raw_score: 85 },
      { learnerId: 'L2', raw_score: 85 },
      { learnerId: 'L2', raw_score: 85 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 85,
      prior_validations: priors,
    });
    expect(res.reasons.some((r) => /collusion/i.test(r))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Signal 2 — per-learner upward outlier
// ---------------------------------------------------------------------------

describe('flagPotentialBias — per-learner outlier', () => {
  it('score >2σ above validator-for-learner mean → flagged as outlier', async () => {
    // Validator's history for learner L1: 50, 52, 48 → mean ~50, stdev ~1.6
    // New raw_score of 95 is way more than 2σ above.
    const priors: PriorValidation[] = [
      { learnerId: 'L1', raw_score: 50 },
      { learnerId: 'L1', raw_score: 52 },
      { learnerId: 'L1', raw_score: 48 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 95,
      prior_validations: priors,
    });
    expect(res.flagged).toBe(true);
    expect(res.reasons.some((r) => /above this validator's mean/i.test(r))).toBe(true);
  });

  it('score within 2σ of validator-for-learner mean → not flagged on outlier', async () => {
    // priors mean = 70, stdev ≈ 8.16; 2σ ≈ 16.33. Score 75 is well within.
    const priors: PriorValidation[] = [
      { learnerId: 'L1', raw_score: 60 },
      { learnerId: 'L1', raw_score: 70 },
      { learnerId: 'L1', raw_score: 80 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 75,
      prior_validations: priors,
    });
    expect(res.reasons.some((r) => /above this validator's mean/i.test(r))).toBe(false);
  });

  it('fewer than 3 priors for learner → outlier check is skipped', async () => {
    const priors: PriorValidation[] = [
      { learnerId: 'L1', raw_score: 50 },
      { learnerId: 'L1', raw_score: 52 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 99,
      prior_validations: priors,
    });
    expect(res.reasons.some((r) => /above this validator's mean/i.test(r))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Signal 3 — all-100s uniform max pattern
// ---------------------------------------------------------------------------

describe('flagPotentialBias — all-max-score (uniform inflation)', () => {
  it('5+ priors all 100 + current 100 → flagged as uniform inflation', async () => {
    const priors: PriorValidation[] = Array.from({ length: 6 }, (_, i) => ({
      learnerId: `L${i}`,
      raw_score: 100,
    }));
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L99',
      raw_score: 100,
      prior_validations: priors,
    });
    expect(res.flagged).toBe(true);
    expect(res.reasons.some((r) => /uniform inflation/i.test(r))).toBe(true);
  });

  it('5+ priors all 100 but current score ≠ 100 → not flagged on uniform inflation', async () => {
    const priors: PriorValidation[] = Array.from({ length: 6 }, (_, i) => ({
      learnerId: `L${i}`,
      raw_score: 100,
    }));
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L99',
      raw_score: 80,
      prior_validations: priors,
    });
    expect(res.reasons.some((r) => /uniform inflation/i.test(r))).toBe(false);
  });

  it('4 priors all 100 → below sample threshold, not flagged', async () => {
    const priors: PriorValidation[] = Array.from({ length: 4 }, (_, i) => ({
      learnerId: `L${i}`,
      raw_score: 100,
    }));
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L99',
      raw_score: 100,
      prior_validations: priors,
    });
    expect(res.reasons.some((r) => /uniform inflation/i.test(r))).toBe(false);
  });

  it('mostly 100s but one outlier prior → not flagged on uniform inflation', async () => {
    const priors: PriorValidation[] = [
      { learnerId: 'L1', raw_score: 100 },
      { learnerId: 'L2', raw_score: 100 },
      { learnerId: 'L3', raw_score: 100 },
      { learnerId: 'L4', raw_score: 100 },
      { learnerId: 'L5', raw_score: 90 },
      { learnerId: 'L6', raw_score: 100 },
    ];
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L99',
      raw_score: 100,
      prior_validations: priors,
    });
    expect(res.reasons.some((r) => /uniform inflation/i.test(r))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-signal interaction
// ---------------------------------------------------------------------------

describe('flagPotentialBias — multiple signals', () => {
  it('can fire multiple reasons simultaneously', async () => {
    // 5 priors for L1 all at 100 (triggers collusion + uniform inflation when current is 100)
    const priors: PriorValidation[] = Array.from({ length: 5 }, () => ({
      learnerId: 'L1',
      raw_score: 100,
    }));
    const res = await PDEPeerBiasService.flagPotentialBias({
      validatorId: 'v1',
      learnerId: 'L1',
      raw_score: 100,
      prior_validations: priors,
    });
    expect(res.flagged).toBe(true);
    expect(res.reasons.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// institutionId forwarding
// ---------------------------------------------------------------------------

describe('flagPotentialBias — institutionId', () => {
  it('forwards institutionId to the policy reader on isEnabled lookup', async () => {
    await PDEPeerBiasService.flagPotentialBias(
      {
        validatorId: 'v1',
        learnerId: 'L1',
        raw_score: 80,
        prior_validations: [],
      },
      'inst-42'
    );
    expect(getPeerBiasDetectionEnabledMock).toHaveBeenCalledWith('inst-42');
  });
});
