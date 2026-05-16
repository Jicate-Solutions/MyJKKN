/**
 * Attention Bar — Layer 3 confidence engine.
 *
 * Spec §3 Layer 3 — confidence formula:
 *   confidence(action_id) = tap_rate × min(1.0, total_impressions / 30)
 *
 * Where:
 *  - tap_rate = (#taps for action_id) / (total impressions in (user, page, role) bucket)
 *  - total_impressions = sum across all action_ids the user has seen on this page+role
 *  - 30-day hard window — older rows are ignored even if a row leaks past the
 *    nightly pruning cron. We do NOT use a moving average that lets stale data
 *    dominate; absolute window only.
 *
 * Privacy contract:
 *  - Every read is `WHERE user_id = ?`.
 *  - Caller passes a Supabase client whose auth context already enforces RLS
 *    (`user_id = auth.uid()`) — this module trusts the caller for that.
 *
 * Pure function: no UI, no side effects, no DB writes. Returns a numeric
 * confidence + supporting impression count for the threshold check in
 * layer-3.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConfidenceInput {
  /** action_id we are scoring. */
  actionId: string;
  /** Authenticated user — query is scoped to this id. */
  userId: string;
  /** Page path (no query string). */
  page: string;
  /** Role at the time of resolution. */
  role: string;
  /** Supabase client with the user's RLS context (anon key + cookies). */
  supabase: SupabaseClient;
  /**
   * Optional override of the 30-day window for tests / sandbox.
   * Defaults to 30 days back from now().
   */
  windowDays?: number;
}

export interface ConfidenceResult {
  /** confidence score in [0, 1]. */
  confidence: number;
  /** Total impressions for this (user, page, role) bucket inside the window. */
  totalImpressions: number;
  /** Tap count for this specific action_id inside the window. */
  taps: number;
}

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Compute the Layer 3 confidence score for a single (user, page, role, action)
 * tuple over the rolling window.
 *
 * Implementation note: we do TWO scoped reads from quick_action_taps:
 *   1. Total impressions across all action_ids in the bucket.
 *   2. Tap events for the specific action_id.
 * Both are filtered by `user_id` so RLS rejects any attempt to peek at
 * another user's data.
 *
 * Returns 0 confidence with 0 impressions if there is no data; the caller
 * (layer-3.ts) treats < threshold as "skip" without surfacing details.
 */
export async function computeConfidence(
  input: ConfidenceInput,
): Promise<ConfidenceResult> {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Total impressions in this (user, page, role) bucket.
  const impressionsQuery = await input.supabase
    .from('quick_action_taps')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', input.userId)
    .eq('page', input.page)
    .eq('role', input.role)
    .eq('event_type', 'impression')
    .gte('occurred_at', sinceIso);

  if (impressionsQuery.error) {
    // Privacy-safe failure: zero confidence, zero impressions. The caller
    // will surface a 'no-match' reason. We do NOT crash the resolver.
    return { confidence: 0, totalImpressions: 0, taps: 0 };
  }

  const totalImpressions = impressionsQuery.count ?? 0;
  if (totalImpressions === 0) {
    return { confidence: 0, totalImpressions: 0, taps: 0 };
  }

  // Taps for this specific action_id.
  const tapsQuery = await input.supabase
    .from('quick_action_taps')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', input.userId)
    .eq('page', input.page)
    .eq('role', input.role)
    .eq('action_id', input.actionId)
    .eq('event_type', 'tap')
    .gte('occurred_at', sinceIso);

  if (tapsQuery.error) {
    return { confidence: 0, totalImpressions, taps: 0 };
  }

  const taps = tapsQuery.count ?? 0;
  return {
    confidence: confidenceFormula(taps, totalImpressions),
    totalImpressions,
    taps,
  };
}

/**
 * Pure-math version of the confidence formula. Exported for unit tests + the
 * Layer 3 rails smoke gate so we can verify the formula independently of DB.
 *
 *   confidence = tap_rate × min(1.0, impressions / 30)
 *
 * Returns 0 when impressions = 0 (avoid divide-by-zero) and clamps the
 * ramp-up factor to 1.0 once the user has hit 30 impressions.
 */
export function confidenceFormula(
  taps: number,
  impressions: number,
  rampUpAt = 30,
): number {
  if (impressions <= 0) return 0;
  if (taps <= 0) return 0;
  const tapRate = taps / impressions;
  const rampUp = Math.min(1.0, impressions / rampUpAt);
  return tapRate * rampUp;
}

/**
 * List the candidate action_ids the user has tapped at least once in the
 * window. Used by Layer 3 to know which actions to score (we don't want to
 * score every Layer 1 / Layer 2 candidate — only ones the user has actually
 * interacted with).
 *
 * Privacy: scoped by user_id.
 */
export async function listCandidateActionIds(
  supabase: SupabaseClient,
  userId: string,
  page: string,
  role: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<string[]> {
  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from('quick_action_taps')
    .select('action_id')
    .eq('user_id', userId)
    .eq('page', page)
    .eq('role', role)
    .eq('event_type', 'tap')
    .gte('occurred_at', sinceIso);

  if (error || !data) return [];

  // Dedupe.
  const seen = new Set<string>();
  for (const row of data) {
    if (typeof row.action_id === 'string') seen.add(row.action_id);
  }
  return Array.from(seen);
}
