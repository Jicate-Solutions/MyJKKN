/**
 * PDE Peer Bias Detection Service (Tier 2 Item 7)
 * ============================================================================
 *
 * Pure detection helpers that flag suspicious peer-validation patterns.
 *
 *   1. `isEnabled()` — wrapper around the
 *      `pde.scoring.peer_bias_detection_enabled` policy. When false, all
 *      flagging short-circuits to a non-flagged result. Lets a Director
 *      disable detection without changing code.
 *
 *   2. `flagPotentialBias(input)` — runs a small bundle of heuristic checks
 *      over a single peer validator's prior validations and returns a list
 *      of human-readable reasons explaining why the current submission looks
 *      suspicious. Empty list = not flagged.
 *
 * Design notes
 * ------------
 *   - Pure, side-effect-free, easy to unit-test. No DB writes.
 *   - Cheap to call inline from the validator submission path; expensive
 *     statistical models are out-of-scope for Tier 2.
 *   - Real cohort-level analytics will land in Tier 3 alongside the
 *     `pde_peer_bias_flags` audit table.
 *   - `validator-service.ts` integration lands in a separate PR (Tier 3).
 *
 * Phase: PDE Tier 2.7 (2026-05-19).
 */

import { getPeerBiasDetectionEnabled } from '@/lib/services/pde-policy-reader';

// ===========================================================================
// Public types
// ===========================================================================

export interface PriorValidation {
  learnerId: string;
  raw_score: number;
}

export interface PeerBiasInput {
  validatorId: string;
  learnerId: string;
  raw_score: number;
  prior_validations: PriorValidation[];
}

export interface PeerBiasResult {
  flagged: boolean;
  reasons: string[];
}

// ===========================================================================
// Heuristic thresholds (kept as module-private consts so they can be tuned
// in one place when Tier 3 data starts flowing).
// ===========================================================================

const STDEV_THRESHOLD = 2; // outlier = > 2σ above the validator's mean for this learner
const ALL_MAX_THRESHOLD = 100;
const ALL_MAX_MIN_SAMPLE = 5; // need at least this many validations before the all-max signal can fire
const COLLUSION_REPEAT_COUNT = 3; // ≥ this many same-learner-same-score priors = collusion signal

// ===========================================================================
// Pure helpers
// ===========================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(variance);
}

// ===========================================================================
// Service class
// ===========================================================================

export class PDEPeerBiasService {
  /**
   * Returns whether peer-bias detection should run for this institution.
   * Thin wrapper kept distinct from `flagPotentialBias` so callers can
   * short-circuit early at the route level.
   */
  static async isEnabled(institutionId?: string | null): Promise<boolean> {
    return getPeerBiasDetectionEnabled(institutionId ?? null);
  }

  /**
   * Apply heuristic bias checks against a validator's prior submissions.
   *
   * Heuristic signals (each can independently add a reason):
   *
   *   1. **Same-validator-same-learner-same-score collusion**
   *      If the validator has previously scored this learner the EXACT same
   *      `raw_score` ≥ `COLLUSION_REPEAT_COUNT` times, that's a collusion
   *      signal. Coordinated scoring patterns rarely happen by chance.
   *
   *   2. **Per-learner outlier vs validator's own baseline**
   *      If the validator has ≥3 prior validations of this same learner,
   *      compute mean + stdev. If the new `raw_score` is more than
   *      `STDEV_THRESHOLD` σ above that mean, flag it as an upward outlier.
   *
   *   3. **All-100s pattern (uniform max-score)**
   *      If the validator has ≥ `ALL_MAX_MIN_SAMPLE` prior validations and
   *      EVERY one of them (plus this one) is 100, flag uniform-max-score
   *      — strong inflation signal.
   *
   * If `isEnabled()` returns false, returns `{flagged:false, reasons:['detection disabled by policy']}`
   * without running any checks.
   */
  static async flagPotentialBias(
    input: PeerBiasInput,
    institutionId?: string | null
  ): Promise<PeerBiasResult> {
    const enabled = await PDEPeerBiasService.isEnabled(institutionId ?? null);
    if (!enabled) {
      return { flagged: false, reasons: ['detection disabled by policy'] };
    }

    const reasons: string[] = [];
    const { learnerId, raw_score, prior_validations } = input;

    // -------------------------------------------------------------------
    // Signal 1 — same-learner-same-score collusion pattern
    // -------------------------------------------------------------------
    const sameLearnerSameScore = prior_validations.filter(
      (v) => v.learnerId === learnerId && v.raw_score === raw_score
    );
    if (sameLearnerSameScore.length >= COLLUSION_REPEAT_COUNT) {
      reasons.push(
        `Validator has scored learner ${learnerId} exactly ${raw_score} on ${sameLearnerSameScore.length} prior occasions — collusion pattern.`
      );
    }

    // -------------------------------------------------------------------
    // Signal 2 — per-learner upward outlier
    // -------------------------------------------------------------------
    const priorForLearner = prior_validations
      .filter((v) => v.learnerId === learnerId)
      .map((v) => v.raw_score);
    if (priorForLearner.length >= 3) {
      const m = mean(priorForLearner);
      const sigma = standardDeviation(priorForLearner);
      if (sigma > 0 && raw_score - m > STDEV_THRESHOLD * sigma) {
        reasons.push(
          `Score ${raw_score} is more than ${STDEV_THRESHOLD}σ above this validator's mean (${m.toFixed(1)}) for learner ${learnerId}.`
        );
      }
    }

    // -------------------------------------------------------------------
    // Signal 3 — all-max-score uniform inflation
    // -------------------------------------------------------------------
    if (prior_validations.length >= ALL_MAX_MIN_SAMPLE) {
      const allPriorsMax = prior_validations.every((v) => v.raw_score === ALL_MAX_THRESHOLD);
      if (allPriorsMax && raw_score === ALL_MAX_THRESHOLD) {
        reasons.push(
          `Validator has issued ${prior_validations.length + 1} consecutive max scores of ${ALL_MAX_THRESHOLD} — uniform inflation pattern.`
        );
      }
    }

    return {
      flagged: reasons.length > 0,
      reasons,
    };
  }
}
