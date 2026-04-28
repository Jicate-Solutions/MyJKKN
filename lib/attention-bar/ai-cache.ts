/**
 * Attention Bar — Layer 4 AI cache primitives.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * Handles read/write for `quick_action_ai_cache`.
 * All DB access uses the service-role client — cache is system-managed and
 * must bypass user-level RLS policies.
 *
 * Cache key format: `${page}|${role}|${hourBucket}` (e.g. `/dashboard|counselor|2026-04-28T09`)
 *   → predictable, debuggable, idempotent across concurrent calls for the same slot.
 *
 * None of these functions call an LLM. They are the rails the Phase 6 main
 * LLM evaluator will plug into.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface CacheHit {
  cacheKey: string;
  /** Ranked action list returned by the LLM (opaque to this module). */
  response: unknown;
  model: string;
  costUsd: number;
  cachedAt: string;
  expiresAt: string;
}

export interface SetCacheArgs {
  cacheKey: string;
  response: unknown;
  model: string;
  costUsd: number;
  ttlMinutes: number;
}

export interface CacheKeyArgs {
  page: string;
  role: string;
  /** UTC hour bucket, e.g. "2026-04-28T09". If omitted, computed from Date.now(). */
  hourBucket?: string;
}

export interface PruneResult {
  deleted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache key builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a canonical cache key for a (page, role, hour-bucket) triple.
 *
 * Hour bucket is UTC so a server in a different TZ and the browser agree.
 * Format: `YYYY-MM-DDTHH` (ISO-8601 date + hour, no minutes, no colons in time).
 *
 * Example: `/dashboard|counselor|2026-04-28T09`
 */
export function buildCacheKey({ page, role, hourBucket }: CacheKeyArgs): string {
  const bucket = hourBucket ?? computeHourBucket(new Date());
  // Normalise leading slash to guard against accidental double-slash.
  const normPage = page.startsWith('/') ? page : `/${page}`;
  return `${normPage}|${role}|${bucket}`;
}

/** Compute YYYY-MM-DDTHH (UTC, zero-padded) from a Date object. */
export function computeHourBucket(date: Date): string {
  const iso = date.toISOString(); // "2026-04-28T09:34:12.000Z"
  return iso.slice(0, 13);        // "2026-04-28T09"
}

// ─────────────────────────────────────────────────────────────────────────────
// getCachedResponse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a cache hit for the given cache key, or null on miss / expiry.
 *
 * Checks `expires_at > now()` in the query so a stale row in DB is treated as
 * a miss without a round-trip update. Caller should optionally call
 * `pruneExpiredCache()` on a schedule to remove stale rows.
 *
 * Throws on unexpected DB errors (e.g. network failure, auth error).
 */
export async function getCachedResponse(cacheKey: string): Promise<CacheHit | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('quick_action_ai_cache')
    .select('cache_key, response, model, cost_usd, cached_at, expires_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(`[ai-cache] getCachedResponse failed: ${error.message}`);
  }

  if (!data) return null;

  return {
    cacheKey: data.cache_key,
    response: data.response,
    model: data.model,
    costUsd: Number(data.cost_usd),
    cachedAt: data.cached_at,
    expiresAt: data.expires_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// setCachedResponse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a cache entry for the given key.
 *
 * Uses INSERT ... ON CONFLICT (cache_key) DO UPDATE so concurrent cold-start
 * calls on the same key converge without deadlocking. The last writer wins —
 * acceptable because all callers for the same (page, role, hour) produce
 * effectively the same LLM output.
 *
 * Throws on DB error; let the caller decide whether to retry.
 */
export async function setCachedResponse({
  cacheKey,
  response,
  model,
  costUsd,
  ttlMinutes,
}: SetCacheArgs): Promise<void> {
  const supabase = createServiceRoleClient();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('quick_action_ai_cache')
    .upsert(
      {
        cache_key: cacheKey,
        response,
        model,
        cost_usd: costUsd,
        cached_at: now.toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'cache_key' }
    );

  if (error) {
    throw new Error(`[ai-cache] setCachedResponse failed: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// pruneExpiredCache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete all rows where `expires_at < now()`.
 *
 * Called by a nightly cron (wired in Phase 7). Safe to call more frequently;
 * it is idempotent and only touches already-expired rows.
 *
 * Returns the number of rows deleted (approximate — Supabase bulk DELETE does
 * not guarantee exact count, so we return the length of the deleted array).
 */
export async function pruneExpiredCache(): Promise<PruneResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('quick_action_ai_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('cache_key');

  if (error) {
    throw new Error(`[ai-cache] pruneExpiredCache failed: ${error.message}`);
  }

  return { deleted: data?.length ?? 0 };
}
