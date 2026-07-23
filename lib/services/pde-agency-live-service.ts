/**
 * PDE Agency Live Service
 * ============================================================================
 *
 * Wires the `pde.visibility.agency_index_mode` policy enum (live |
 * semester_end | live_coarse) to actual runtime behaviour. This is a NEW
 * wrapper service — it does NOT modify `lib/services/pde-service.ts`.
 *
 * Mode semantics
 * --------------
 * - 'semester_end' → return the latest snapshot row from `pde_agency_index`
 *   as-is. Cheap; the canonical Phase-1 path that pde-service.ts has always
 *   produced. Source = 'snapshot'.
 *
 * - 'live' → recompute the score on-demand from `pde_demonstrations` rows
 *   in the last 90 days that have a non-null `weighted_score`. Returns the
 *   freshest possible signal at the cost of an extra read on every call.
 *   Source = 'live'.
 *
 * - 'live_coarse' → same recomputation as 'live', but bucketed to the nearest
 *   10. Cheaper for UI cache invalidation (the same coarse number stays
 *   stable across small score deltas → SWR doesn't thrash). Source =
 *   'live_coarse'.
 *
 * Snapshot fallback
 * -----------------
 * If recomputation finds zero scored demonstrations in the 90-day window,
 * we fall back to the latest snapshot row (so the card never goes blank
 * just because the learner is in a quiet patch). The returned source
 * still reflects the requested mode so the UI can decide whether to keep
 * polling — but the score itself is the snapshot value.
 *
 * Phase: PDE Tier 2 — Item 8 (2026-05-19).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getAgencyIndexMode,
  type AgencyIndexMode,
} from '@/lib/services/pde-policy-reader';

// ===========================================================================
// Types
// ===========================================================================

export type AgencyScoreSource = 'snapshot' | 'live' | 'live_coarse';

export interface AgencyRecomputeResult {
  agency_score: number;
  computed_at: string;
  source: AgencyScoreSource;
  /** True when the score came from a snapshot fallback even though mode != 'semester_end'. */
  fell_back_to_snapshot: boolean;
}

export interface AgencyDisplayResult {
  score: number;
  mode: AgencyIndexMode;
  source: AgencyScoreSource;
  stale_seconds?: number;
  /** Hint to the client: should it poll for refreshes? True only in live modes. */
  refresh_recommended: boolean;
}

// ===========================================================================
// Constants — tunable in one place
// ===========================================================================

/** Look-back window for live recomputation. Older demonstrations stop counting. */
const LIVE_LOOKBACK_DAYS = 90;

/** Bucket size for live_coarse mode. */
const COARSE_BUCKET = 10;

/** Normalisation cap — weighted_score sums above this map to 100. */
const NORMALISATION_CAP = 500;

// ===========================================================================
// Service
// ===========================================================================

export class PDEAgencyLiveService {
  /**
   * Compute the Agency Index value for a learner, honouring the active
   * `pde.visibility.agency_index_mode` policy.
   *
   * Never throws — fails soft and returns `{ score: 0, source: 'snapshot' }`
   * if Supabase blows up. The UI must always render something.
   */
  static async recomputeForLearner(
    learnerId: string,
    institutionId?: string | null
  ): Promise<AgencyRecomputeResult> {
    const mode = await getAgencyIndexMode(institutionId);

    if (mode === 'semester_end') {
      const snapshot = await this.readLatestSnapshot(learnerId);
      return {
        agency_score: snapshot.score,
        computed_at: snapshot.computed_at,
        source: 'snapshot',
        fell_back_to_snapshot: false,
      };
    }

    // mode is 'live' or 'live_coarse' — try live recompute first.
    const live = await this.recomputeFromDemonstrations(learnerId);

    if (live === null) {
      // No scored demonstrations in window → fall back to snapshot so
      // the UI never goes blank.
      const snapshot = await this.readLatestSnapshot(learnerId);
      return {
        agency_score: snapshot.score,
        computed_at: snapshot.computed_at,
        source: mode === 'live_coarse' ? 'live_coarse' : 'live',
        fell_back_to_snapshot: true,
      };
    }

    const score = mode === 'live_coarse' ? bucketise(live, COARSE_BUCKET) : live;

    return {
      agency_score: score,
      computed_at: new Date().toISOString(),
      source: mode === 'live_coarse' ? 'live_coarse' : 'live',
      fell_back_to_snapshot: false,
    };
  }

  /**
   * Convenience wrapper for the API route / display layer. Returns the
   * score plus enough metadata for the client to decide whether to poll.
   */
  static async getDisplayFor(
    learnerId: string,
    institutionId?: string | null
  ): Promise<AgencyDisplayResult> {
    const mode = await getAgencyIndexMode(institutionId);
    const recompute = await this.recomputeForLearner(learnerId, institutionId);

    const computedTs = Date.parse(recompute.computed_at);
    const stale_seconds = Number.isFinite(computedTs)
      ? Math.max(0, Math.floor((Date.now() - computedTs) / 1000))
      : undefined;

    return {
      score: recompute.agency_score,
      mode,
      source: recompute.source,
      stale_seconds,
      refresh_recommended: mode !== 'semester_end',
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Latest row from `pde_agency_index` for this learner. Returns
   * `{ score: 0, computed_at: now }` if no snapshot exists yet so the
   * UI has SOMETHING to render rather than a null bomb.
   */
  private static async readLatestSnapshot(
    learnerId: string
  ): Promise<{ score: number; computed_at: string }> {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('pde_agency_index')
        .select('overall, created_at, assessment_date')
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return { score: 0, computed_at: new Date().toISOString() };
      }

      const score = typeof data.overall === 'number' ? data.overall : 0;
      const computed_at =
        data.created_at ?? data.assessment_date ?? new Date().toISOString();

      return { score, computed_at };
    } catch {
      return { score: 0, computed_at: new Date().toISOString() };
    }
  }

  /**
   * Live recompute from `pde_demonstrations`. Sums `weighted_score` for
   * scored rows in the last `LIVE_LOOKBACK_DAYS` days and normalises to a
   * 0–100 scale via `NORMALISATION_CAP`.
   *
   * Returns `null` if no scored rows in the window — caller decides what
   * to do (typically fall back to snapshot).
   */
  private static async recomputeFromDemonstrations(
    learnerId: string
  ): Promise<number | null> {
    try {
      const supabase = await createServerSupabaseClient();
      const cutoff = new Date(
        Date.now() - LIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await (supabase as any)
        .from('pde_demonstrations')
        .select('weighted_score, scored_at')
        .eq('learner_id', learnerId)
        .not('weighted_score', 'is', null)
        .gte('scored_at', cutoff);

      if (error || !data || data.length === 0) {
        return null;
      }

      const sum = data.reduce(
        (acc: number, row: { weighted_score: number | null }) =>
          acc + (typeof row.weighted_score === 'number' ? row.weighted_score : 0),
        0
      );

      // Normalise: sum / NORMALISATION_CAP * 100, clamped to [0, 100].
      const normalised = Math.round((sum / NORMALISATION_CAP) * 100);
      return Math.max(0, Math.min(100, normalised));
    } catch {
      return null;
    }
  }
}

// ===========================================================================
// Pure helpers (exported for unit-testing the bucketing math without DB).
// ===========================================================================

/** Round `value` down to the nearest `bucket`. e.g. bucketise(73, 10) === 70. */
export function bucketise(value: number, bucket: number): number {
  if (bucket <= 0) return value;
  return Math.floor(value / bucket) * bucket;
}
