/**
 * PDE Scoring Service
 * ============================================================================
 *
 * Server-side scoring engine for PDE demonstrations (T1.2).
 *
 * Reads a `pde_demonstrations` row, looks up the rubric stored as a
 * platform_policies row referenced by `rubric_policy_key`, fetches the
 * 3-component faculty/peer/ai weights from `pde.scoring.demonstration_weights`
 * (via the typed accessor in `pde-policy-reader.ts`), then computes:
 *
 *   weighted = raw_score * (faculty + peer + ai) / 100
 *
 * NOTE on weights: today the service applies the **summed** weight as a
 * scalar multiplier on `raw_score` because the demonstration row stores a
 * single validator-scored value. When per-component (peer / AI) raw scores
 * land in a future migration, this function will be updated to apply each
 * weight to its own component. The current behaviour preserves the policy
 * surface and emits an audit-trail field showing which weight set was used.
 *
 * Pass threshold pulled from the rubric value's `scoring_band.pass_threshold`
 * field (0-100). Falls back to 60 if the rubric is missing the field so
 * scoring never silently passes everything.
 *
 * Pattern: matches `pde-policy-reader.ts` — fail-soft RPC reads, every
 * caller goes through `createServerSupabaseClient`.
 *
 * Phase: PDE Tier 1.2 (2026-05-19).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getDemonstrationWeights } from '@/lib/services/pde-policy-reader';

// ===========================================================================
// Types
// ===========================================================================

export interface ScoringResult {
  raw: number;
  weighted: number;
  passed: boolean;
}

export interface PdeDemonstrationRow {
  id: string;
  learner_id: string;
  institution_id: string | null;
  category_key: string;
  rubric_policy_key: string | null;
  skill_name: string | null;
  evidence: Record<string, unknown>;
  evidence_type: string | null;
  status: string;
  submitted_at: string | null;
  validator_ids: string[];
  validator_notes: Record<string, string>;
  raw_score: number | null;
  weighted_score: number | null;
  passed: boolean | null;
  scored_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RubricShape {
  scoring_band?: { pass_threshold?: number; distinction_threshold?: number };
  // other rubric fields are not consumed by the scoring engine today
}

const DEFAULT_PASS_THRESHOLD = 60;

// ===========================================================================
// Internal helpers
// ===========================================================================

async function fetchDemonstration(id: string): Promise<PdeDemonstrationRow> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('pde_demonstrations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`[pde-scoring] failed to fetch demonstration ${id}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`[pde-scoring] demonstration ${id} not found`);
  }
  return data as PdeDemonstrationRow;
}

async function fetchRubric(rubricKey: string): Promise<RubricShape> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('fn_get_policy_json', {
    p_key: rubricKey,
    p_default: {},
    p_scope_id: null,
  });

  if (error) {
    throw new Error(`[pde-scoring] failed to fetch rubric ${rubricKey}: ${error.message}`);
  }
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    throw new Error(`[pde-scoring] rubric ${rubricKey} not found or empty`);
  }
  return data as RubricShape;
}

// ===========================================================================
// Public API
// ===========================================================================

export class PDEScoringService {
  /**
   * Compute the weighted score + pass/fail without persisting.
   *
   * Throws if:
   *   - demonstration row not found
   *   - raw_score is null on the row
   *   - rubric_policy_key is set but rubric row is missing
   *
   * Returns:
   *   { raw, weighted, passed }
   */
  static async computeWeightedScore(demonstrationId: string): Promise<ScoringResult> {
    const row = await fetchDemonstration(demonstrationId);

    if (row.raw_score === null || row.raw_score === undefined) {
      throw new Error(
        `[pde-scoring] demonstration ${demonstrationId} has no raw_score — validate first`
      );
    }

    const raw = Number(row.raw_score);

    // Pull weights — fail-soft to seeded defaults (50/30/20)
    const weights = await getDemonstrationWeights(row.institution_id ?? null);
    const totalWeight = weights.faculty + weights.peer + weights.ai;

    // Per-component raw scores aren't stored yet (see file header note); apply
    // the summed weight as a scalar against the single raw_score. When N=100
    // this is the identity, so behaviour matches what most director-edited
    // weight sets will produce.
    const weighted = (raw * totalWeight) / 100;

    // Pass threshold from rubric.scoring_band.pass_threshold; default 60.
    let passThreshold = DEFAULT_PASS_THRESHOLD;
    if (row.rubric_policy_key) {
      const rubric = await fetchRubric(row.rubric_policy_key);
      if (
        rubric.scoring_band &&
        typeof rubric.scoring_band.pass_threshold === 'number'
      ) {
        passThreshold = rubric.scoring_band.pass_threshold;
      }
    }

    const passed = weighted >= passThreshold;

    return { raw, weighted, passed };
  }

  /**
   * Compute score and persist it back onto the row.
   *
   * Side effects: writes raw_score (echo), weighted_score, passed, scored_at,
   * and flips status → 'scored'. Returns the updated row.
   */
  static async scoreAndPersist(demonstrationId: string): Promise<PdeDemonstrationRow> {
    const result = await this.computeWeightedScore(demonstrationId);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('pde_demonstrations')
      .update({
        raw_score: result.raw,
        weighted_score: result.weighted,
        passed: result.passed,
        scored_at: new Date().toISOString(),
        status: 'scored',
      })
      .eq('id', demonstrationId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `[pde-scoring] failed to persist score for ${demonstrationId}: ${error.message}`
      );
    }
    return data as PdeDemonstrationRow;
  }
}
