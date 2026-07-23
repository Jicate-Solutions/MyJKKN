// =====================================================================
// PDE Tier 3 — T3.2: Quest risk-tier promotion service
// =====================================================================
// Iterates every quest still at `experimental` tier, counts how many of
// its submissions have `passed = true`, and promotes those at or above
// the policy threshold to `production`.
//
// Policy consumed: `pde.quests.risk_tiers` (via getQuestsRiskTiers()).
//   - tiers: ['experimental', 'production', ...]
//   - default_tier: 'experimental'
//   - production_eligibility: 'after_2_experimental_passes' (threshold = 2)
//
// The `production_eligibility` string encodes the threshold in the
// "after_N_experimental_passes" suffix; parsePromotionThreshold() pulls
// the integer N. Defaults to 2 when the string is malformed.
//
// Audit: writes the promotion timestamp to pde_quests.risk_tier_promoted_at
// (the audit_logs table CHECK constraint does not accept module='pde',
// so the column on the row is the audit record).
//
// Companion cron: app/api/cron/pde-quest-risk-tier/route.ts (nightly).
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getQuestsRiskTiers } from '@/lib/services/pde-policy-reader';

const DEFAULT_THRESHOLD = 2;
const FROM_TIER = 'experimental';
const TO_TIER = 'production';

export interface PromotionError {
  quest_id: string;
  message: string;
}

export interface EvaluationResult {
  evaluated: number;
  promoted: number;
  threshold: number;
  errors: PromotionError[];
}

/**
 * Parse the threshold integer from `production_eligibility` strings such
 * as `after_2_experimental_passes`. Falls back to DEFAULT_THRESHOLD when
 * the string does not match the expected shape.
 */
export function parsePromotionThreshold(eligibility: string): number {
  const match = /after_(\d+)_experimental_passes/.exec(eligibility);
  if (!match) return DEFAULT_THRESHOLD;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD;
}

/**
 * Promote a single quest from `experimental` to `production`. UPDATE is
 * guarded with a `risk_tier = fromTier` WHERE so a concurrent run cannot
 * double-promote.
 */
export async function promoteQuest(
  questId: string,
  fromTier: string,
  toTier: string,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('pde_quests')
    .update({
      risk_tier: toTier,
      risk_tier_promoted_at: new Date().toISOString(),
    })
    .eq('id', questId)
    .eq('risk_tier', fromTier);

  if (error) {
    throw new Error(`promote ${questId}: ${error.message}`);
  }
}

/**
 * Evaluate every `experimental` quest and promote those that have
 * accumulated >= threshold passed submissions. Returns counts + per-quest
 * error details (one failure does not abort the rest).
 */
export async function evaluateRiskTierPromotions(
  supabase: SupabaseClient,
  institutionId?: string | null
): Promise<EvaluationResult> {
  const policy = await getQuestsRiskTiers(institutionId ?? null);
  const threshold = parsePromotionThreshold(policy.production_eligibility);

  // Step 1: pull all experimental quests.
  const { data: quests, error: questsError } = await supabase
    .from('pde_quests')
    .select('id')
    .eq('risk_tier', FROM_TIER);

  if (questsError) {
    throw new Error(`pull experimental quests: ${questsError.message}`);
  }

  const candidateQuests = (quests ?? []) as Array<{ id: string }>;
  const errors: PromotionError[] = [];
  let promoted = 0;

  // Step 2: for each, count passed submissions and promote if eligible.
  for (const quest of candidateQuests) {
    try {
      const { count, error: countError } = await supabase
        .from('pde_quest_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('quest_id', quest.id)
        .eq('passed', true);

      if (countError) {
        errors.push({ quest_id: quest.id, message: countError.message });
        continue;
      }

      if ((count ?? 0) >= threshold) {
        await promoteQuest(quest.id, FROM_TIER, TO_TIER, supabase);
        promoted += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ quest_id: quest.id, message });
    }
  }

  return {
    evaluated: candidateQuests.length,
    promoted,
    threshold,
    errors,
  };
}
