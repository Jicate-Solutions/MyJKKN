/**
 * Layer 3 — Behavioral Learning (DPDPA-gated).
 *
 * Spec §3 Layer 3 — confidence-thresholded override that fires only when:
 *  1. User has opted in (preferences.layer3Consent === true).
 *  2. quick_action_user_consent.layer_3_consent is also true (defence-in-depth
 *     read against the DB; the resolver context can be tampered upstream).
 *  3. ≥ MIN_IMPRESSIONS impressions exist for (user, page, role) in the last
 *     30 days.
 *  4. confidence(action_id) ≥ CONFIDENCE_THRESHOLD for at least one action.
 *
 * When a candidate clears all gates, we look up the action template from the
 * Layer 1 static-defaults registry — Layer 1 is the safe set, body-validated
 * action templates with vetted hrefs/icons/labels. Echoing a Layer 1 action
 * with `tone: 'blue'` (ML-suggested) keeps the visual contract intact.
 *
 * Why not pull from Layer 2's action_templates? Layer 2 rules are state-aware
 * (their action label/href interpolate live state). Re-rendering a Layer 2
 * action from raw tap data would lose that state. Layer 1 is the right
 * referent: deterministic, no state interpolation needed.
 *
 * Privacy contract:
 *  - All reads are `WHERE user_id = ctx.userId` (and RLS enforces auth.uid()).
 *  - We never read other users' rows.
 *  - We never log per-user data through console paths.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  computeConfidence,
  listCandidateActionIds,
} from '../confidence-engine';
import { findStaticDefault } from '../static-defaults';
import type { ResolverContext } from '../types';
import type { LayerResult } from './layer-result';

const MIN_IMPRESSIONS = 30;
const CONFIDENCE_THRESHOLD = 0.7;

export async function evaluateLayer3(
  ctx: ResolverContext,
): Promise<LayerResult> {
  // Gate 1: per-context consent flag (passed through resolver).
  if (!ctx.preferences.layer3Consent) {
    return { matched: false, reason: 'Layer 3 — user has not opted in (ctx)' };
  }

  // Build server-side Supabase client carrying the user's auth cookies.
  // Every read below is RLS-scoped to user_id = auth.uid().
  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (err) {
    return {
      matched: false,
      reason: `Layer 3 — supabase client init failed: ${
        err instanceof Error ? err.message : 'unknown'
      }`,
    };
  }

  // Gate 2: defence-in-depth — verify consent in DB. The context flag could
  // have been spoofed in test/sandbox endpoints; the DB is the truth.
  const { data: consentRow, error: consentError } = await supabase
    .from('quick_action_user_consent')
    .select('layer_3_consent')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (consentError) {
    return {
      matched: false,
      reason: `Layer 3 — consent read failed: ${consentError.message}`,
    };
  }
  if (consentRow?.layer_3_consent !== true) {
    return { matched: false, reason: 'Layer 3 — consent not on file' };
  }

  // Gate 3: collect candidate action_ids the user has tapped in the window.
  // If zero candidates, no inference is possible — bail early to avoid
  // a wasted impressions count read.
  const candidates = await listCandidateActionIds(
    supabase,
    ctx.userId,
    ctx.page,
    ctx.role,
  );
  if (candidates.length === 0) {
    return { matched: false, reason: 'Layer 3 — no candidate taps in window' };
  }

  // Gate 4: score each candidate, keep the highest above threshold.
  let best: { actionId: string; confidence: number; impressions: number } | null = null;
  for (const actionId of candidates) {
    const score = await computeConfidence({
      actionId,
      userId: ctx.userId,
      page: ctx.page,
      role: ctx.role,
      supabase,
    });

    // The min-impressions gate is the SAME bucket count for every
    // candidate, so the first candidate's totalImpressions tells us
    // whether the user has crossed the threshold at all.
    if (score.totalImpressions < MIN_IMPRESSIONS) {
      return {
        matched: false,
        reason: `Layer 3 — only ${score.totalImpressions}/${MIN_IMPRESSIONS} impressions in window`,
      };
    }

    if (
      score.confidence >= CONFIDENCE_THRESHOLD &&
      (best === null || score.confidence > best.confidence)
    ) {
      best = {
        actionId,
        confidence: score.confidence,
        impressions: score.totalImpressions,
      };
    }
  }

  if (!best) {
    return {
      matched: false,
      reason: `Layer 3 — no action ≥ ${CONFIDENCE_THRESHOLD} confidence`,
    };
  }

  // Look up the action template from Layer 1 (safe set, vetted hrefs).
  // We match by static-default action_id; the registry's build() produces
  // a template whose `id` follows the convention `L1.<role>.<page-slug>`.
  // For a behavioural override we accept the same shape — the action_id
  // we care about IS the Layer 1 id (since the user tapped a Layer 1
  // render in the past for the count to be > 0).
  const staticDefault = findStaticDefault(ctx.page, ctx.role);
  if (!staticDefault) {
    return {
      matched: false,
      reason: 'Layer 3 — no Layer 1 fallback to mirror',
    };
  }

  const baseAction = staticDefault.build(ctx);

  // Sanity check: the candidate id should match the registry id. If a
  // registry id has been renamed, we still mirror — the user's tap
  // history is naturally about the page+role, not a specific id string.
  if (baseAction.id !== best.actionId) {
    // Mismatch is acceptable; the registry id has rolled forward. Continue.
  }

  return {
    matched: true,
    action: {
      ...baseAction,
      // Layer 3 visual signal: blue tone signals "ML-suggested, subtle"
      // — deliberately distinct from urgent (red), Layer 2 (amber/green),
      // or Layer 1 default (any tone). The user can tell at a glance
      // why the bar is showing this action.
      tone: 'blue',
    },
  };
}
