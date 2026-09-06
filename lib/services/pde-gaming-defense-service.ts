/**
 * PDE Gaming-Defense Audit Service — Tier 3, T3.4
 * ============================================================================
 *
 * Nightly "judgment-of-judgment" audit. Samples a configurable percentage of
 * recently-validated `pde_demonstrations` and re-evaluates the validator's
 * scoring against the demonstration weights policy. Rows whose consistency
 * score falls below the suspect threshold are flagged into `sh_audit_logs`
 * for human review.
 *
 * Policy substrate:
 *   - `pde.governance.agency_gaming_defense` → `{ mode, audit_sample_rate }`
 *     (read via `getAgencyGamingDefense()` — DO NOT modify the reader).
 *   - `pde.scoring.demonstration_weights` → `{ faculty, peer, ai }` (summing
 *     to 100). Used to normalize the validator's `weighted_score` against the
 *     `raw_score` for divergence detection.
 *
 * Suspect-threshold default: 0.7. Divergence above the threshold means the
 * validator's weighted score is too far from what the policy weights predict
 * given the raw score. (Heuristic — humans confirm. Cron does NOT mutate the
 * demonstration row; flag is informational only.)
 *
 * Storage:
 *   `pde_demonstrations` has no `flagged_for_review` column today (schema
 *   probe 2026-05-19). Flags land in `sh_audit_logs` with:
 *     action='pde.gaming_defense.flagged'
 *     entity_type='pde_demonstration'
 *     entity_id=<demonstration.id>
 *     details={ raw_score, weighted_score, divergence, suspect_threshold,
 *               validator_ids, category_key, scored_at }
 *
 * If/when a `flagged_for_review` boolean is added to `pde_demonstrations`,
 * swap the audit-log write for an UPDATE — this service exposes a single
 * `persistFlag()` seam so the policy never needs to change.
 *
 * Phase: PDE Tier 3 (T3.4 — 2026-05-19).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAgencyGamingDefense,
  getDemonstrationWeights,
} from '@/lib/services/pde-policy-reader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DemonstrationRow {
  id: string;
  learner_id: string;
  institution_id: string | null;
  category_key: string | null;
  rubric_policy_key: string | null;
  validator_ids: unknown;
  raw_score: number | null;
  weighted_score: number | null;
  passed: boolean | null;
  scored_at: string | null;
}

export interface ConsistencyResult {
  /** 0..1 where 1.0 = perfect consistency between weighted_score and policy-predicted */
  score: number;
  /** Absolute divergence (0..1) — equals 1 - score */
  divergence: number;
  /** True when divergence ≥ suspect_threshold (caller must pass the threshold) */
  suspect: boolean;
}

export interface SweepMetrics {
  policy_mode: string;
  sample_rate: number;
  suspect_threshold: number;
  total_candidates: number;
  sampled: number;
  evaluated: number;
  flagged: number;
  errors: number;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default suspect threshold when not overridden by policy. */
export const DEFAULT_SUSPECT_THRESHOLD = 0.7;

/** Audit log action key for flagged rows. */
export const AUDIT_ACTION_FLAGGED = 'pde.gaming_defense.flagged';

/** How far back to look for candidate demonstrations. */
export const LOOKBACK_HOURS = 24;

// ---------------------------------------------------------------------------
// Pure helpers (no IO) — exported for testing
// ---------------------------------------------------------------------------

/**
 * Resolve sample rate from policy, clamped to [0, 1].
 */
export function clampRate(rate: number | undefined | null): number {
  if (rate == null || Number.isNaN(rate)) return 0;
  if (rate < 0) return 0;
  if (rate > 1) return 1;
  return rate;
}

/**
 * Pick the random N% subset. Deterministic per call (Math.random()).
 * Exported for testing; pass a custom rng for repeatability if needed.
 */
export function sampleRows<T>(
  rows: T[],
  rate: number,
  rng: () => number = Math.random
): T[] {
  const clamped = clampRate(rate);
  if (clamped <= 0 || rows.length === 0) return [];
  if (clamped >= 1) return [...rows];
  return rows.filter(() => rng() < clamped);
}

/**
 * Consistency heuristic.
 *
 * Given a validator's `weighted_score` and `raw_score`, infer the implicit
 * weight ratio and compare to the policy weights. Large divergence between
 * the implied weight and the policy weight = suspect.
 *
 * Rules:
 *   - If raw_score is null/0 → cannot infer; returns score=1.0 (not suspect).
 *   - implied = weighted_score / raw_score (clamped to [0, 1.5]).
 *   - expected = (faculty + peer + ai) / 100 (typically 1.0 if weights sum
 *     correctly). When weights are sane, the divergence is |implied - 1.0|.
 *   - For pathological weights or negative scores, returns score=0 + suspect.
 */
export function evaluateConsistency(
  row: Pick<DemonstrationRow, 'raw_score' | 'weighted_score'>,
  weights: { faculty: number; peer: number; ai: number },
  suspectThreshold: number
): ConsistencyResult {
  const raw = row.raw_score;
  const weighted = row.weighted_score;

  if (raw == null || raw === 0) {
    // Can't compute a ratio; treat as consistent (informational-only flag).
    return { score: 1, divergence: 0, suspect: false };
  }
  if (weighted == null) {
    return { score: 0, divergence: 1, suspect: 1 >= suspectThreshold };
  }

  const weightSum = (weights.faculty + weights.peer + weights.ai) / 100;
  if (weightSum <= 0) {
    return { score: 0, divergence: 1, suspect: 1 >= suspectThreshold };
  }

  // Implied weight = how much of the raw_score made it through.
  const implied = weighted / raw;
  if (!Number.isFinite(implied) || implied < 0) {
    return { score: 0, divergence: 1, suspect: 1 >= suspectThreshold };
  }

  // Divergence: |implied - weightSum|, normalized to a 0..1 band where
  // 0 = exact match and 1 = >=100% away from expected. We clamp to 1.
  const rawDivergence = Math.abs(implied - weightSum);
  const divergence = Math.min(1, rawDivergence);
  const score = 1 - divergence;

  return {
    score,
    divergence,
    suspect: divergence >= suspectThreshold,
  };
}

// ---------------------------------------------------------------------------
// Database IO
// ---------------------------------------------------------------------------

/**
 * Pull recent validated demonstrations (last LOOKBACK_HOURS).
 */
export async function fetchRecentValidated(
  supabase: SupabaseClient
): Promise<DemonstrationRow[]> {
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabase as any)
    .from('pde_demonstrations')
    .select(
      'id, learner_id, institution_id, category_key, rubric_policy_key, validator_ids, raw_score, weighted_score, passed, scored_at'
    )
    .in('status', ['validated', 'scored'])
    .gte('scored_at', cutoff);

  if (error) {
    throw new Error(`fetchRecentValidated: ${error.message}`);
  }
  return (data || []) as DemonstrationRow[];
}

/**
 * Persist a flag for a suspect row.
 *
 * Today: INSERT into sh_audit_logs (informational). Tomorrow (if a
 * `flagged_for_review` column is added): swap this for an UPDATE.
 */
export async function persistFlag(
  supabase: SupabaseClient,
  row: DemonstrationRow,
  result: ConsistencyResult,
  suspectThreshold: number
): Promise<void> {
  const payload = {
    action: AUDIT_ACTION_FLAGGED,
    entity_type: 'pde_demonstration',
    entity_id: row.id,
    user_email: 'cron@system',
    user_role: 'system',
    details: {
      raw_score: row.raw_score,
      weighted_score: row.weighted_score,
      divergence: result.divergence,
      consistency_score: result.score,
      suspect_threshold: suspectThreshold,
      validator_ids: row.validator_ids,
      category_key: row.category_key,
      rubric_policy_key: row.rubric_policy_key,
      institution_id: row.institution_id,
      scored_at: row.scored_at,
    },
  };
  const { error } = await (supabase as any).from('sh_audit_logs').insert(payload);
  if (error) {
    throw new Error(`persistFlag(${row.id}): ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface SweepOptions {
  /** Override the policy-derived suspect threshold. Used by tests. */
  suspectThresholdOverride?: number;
  /** Override the RNG used by the sampler. Used by tests for determinism. */
  rng?: () => number;
}

/**
 * Top-level sweep: read policy → fetch candidates → sample → evaluate → flag.
 *
 * Returns metrics. Never throws on individual-row errors; aggregates them
 * into `errors` so a single bad row doesn't blow up the cron tick.
 */
export async function runGamingDefenseSweep(
  supabase: SupabaseClient,
  opts: SweepOptions = {}
): Promise<SweepMetrics> {
  const startedAt = Date.now();

  const policy = await getAgencyGamingDefense();
  const weights = await getDemonstrationWeights();
  const suspectThreshold =
    opts.suspectThresholdOverride ?? DEFAULT_SUSPECT_THRESHOLD;

  const candidates = await fetchRecentValidated(supabase);
  const sampled = sampleRows(candidates, policy.audit_sample_rate, opts.rng);

  let evaluated = 0;
  let flagged = 0;
  let errors = 0;

  for (const row of sampled) {
    try {
      const result = evaluateConsistency(row, weights, suspectThreshold);
      evaluated += 1;
      if (result.suspect) {
        await persistFlag(supabase, row, result, suspectThreshold);
        flagged += 1;
      }
    } catch (err) {
      errors += 1;
      // Continue; one bad row must not abort the sweep.
      // eslint-disable-next-line no-console
      console.error('[pde-gaming-defense] row error:', row.id, err);
    }
  }

  return {
    policy_mode: policy.mode,
    sample_rate: policy.audit_sample_rate,
    suspect_threshold: suspectThreshold,
    total_candidates: candidates.length,
    sampled: sampled.length,
    evaluated,
    flagged,
    errors,
    duration_ms: Date.now() - startedAt,
  };
}
