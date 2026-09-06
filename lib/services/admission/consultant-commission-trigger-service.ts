// lib/services/admission/consultant-commission-trigger-service.ts
// ============================================================================
// Consultant Commission Trigger Config Service — config-row substrate reader.
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
// Zero deploys for future tweaks.
//
// This service backs:
//   1. The admin CRUD UI at /admission/consultants/admin/commission-triggers (list/upsert).
//   2. A future engine call site that calls getTriggerForTransition(...) to
//      decide whether a status change on a lead/admission/learner should fire
//      ConsultantService.createCommissionTransaction.
//   3. ConsultantService.createCommissionTransaction itself — it can call
//      getManualTriggerDefaults() to source TDS / auto-approve threshold from
//      config instead of hardcoding.
//
// Day-1 behavior: the seed rows mark every auto-trigger as creates_commission=
// false so the reader fn returns null for every lead/learner transition. Only
// the `manual` row is active, used by the service-layer for its defaults.
//
// Cache: in-memory 60s TTL. Director changes trigger config rarely
// (minutes-to-hours, not sub-second), so eventual consistency on rotation is
// acceptable. Cache is keyed per-process — each Vercel function instance has
// its own. Tests / admin writes invalidate via invalidateTriggerCache().
//
// Companion migration: supabase/migrations/20260513150003_create_consultant_commission_trigger_config.sql
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommissionTriggerSourceEntity =
  | 'admission_lead'
  | 'learners_profile'
  | 'manual';

export interface ConsultantCommissionTriggerRow {
  id: string;
  trigger_key: string;
  display_label: string;
  source_entity: CommissionTriggerSourceEntity;
  source_status_from: string | null;
  source_status_to: string;
  creates_commission: boolean;
  auto_approve_below_amount: number | null;
  tds_rate_percent: number;
  clawback_grace_days: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Resolved trigger row — what the engine code consumes when deciding whether
 * to create a commission row for a given status transition. Shape is a thin
 * projection of the table row, omitting metadata the engine doesn't need.
 */
export interface ResolvedTrigger {
  trigger_key: string;
  creates_commission: boolean;
  auto_approve_below_amount: number | null;
  tds_rate_percent: number;
  clawback_grace_days: number;
}

export interface UpsertCommissionTriggerInput {
  id?: string;
  trigger_key: string;
  display_label: string;
  source_entity: CommissionTriggerSourceEntity;
  source_status_from?: string | null;
  source_status_to: string;
  creates_commission?: boolean;
  auto_approve_below_amount?: number | null;
  tds_rate_percent?: number;
  clawback_grace_days?: number;
  is_active?: boolean;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// In-memory cache (60s TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Keyed by `${source_entity}|${from ?? '*'}|${to}` for getTriggerForTransition,
// plus the literal key 'manual' for getManualTriggerDefaults().
const cache: Map<string, CacheEntry<ResolvedTrigger | null>> = new Map();

function cacheKey(
  sourceEntity: CommissionTriggerSourceEntity | string,
  fromStatus: string | null,
  toStatus: string,
): string {
  return `${sourceEntity}|${fromStatus ?? '*'}|${toStatus}`;
}

function getCached(key: string): ResolvedTrigger | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key: string, value: ResolvedTrigger | null): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Hardcoded fallback for the manual row.
// Used when Supabase is unreachable so the service-layer defaults stay sane.
// Mirrors the seed row exactly.
// ---------------------------------------------------------------------------
const HARDCODED_MANUAL_FALLBACK: ResolvedTrigger = {
  trigger_key: 'manual',
  creates_commission: true,
  auto_approve_below_amount: null,
  tds_rate_percent: 0, // matches today's per-row default in consultant_commission_transactions
  clawback_grace_days: 30,
};

// ---------------------------------------------------------------------------
// Reader API
// ---------------------------------------------------------------------------

/**
 * Resolve the active trigger for a (source_entity, from_status, to_status)
 * transition. Returns null when no row matches OR when the matching row has
 * creates_commission=false. Callers treat null as "do nothing" — preserves
 * today's behavior when every auto-trigger seed row is OFF.
 *
 * Uses the SECURITY DEFINER RPC `fn_get_consultant_commission_trigger` so the
 * engine doesn't need to know the table's RLS shape.
 */
export async function getTriggerForTransition(
  sourceEntity: CommissionTriggerSourceEntity | string,
  fromStatus: string | null,
  toStatus: string,
): Promise<ResolvedTrigger | null> {
  const key = cacheKey(sourceEntity, fromStatus, toStatus);
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  try {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      'fn_get_consultant_commission_trigger',
      {
        p_source_entity: sourceEntity,
        p_from_status: fromStatus,
        p_to_status: toStatus,
      },
    );

    if (error) {
      console.error(
        '[consultant-commission-trigger] getTriggerForTransition rpc error:',
        error,
      );
      setCached(key, null);
      return null;
    }

    // RPC returns SETOF — take first row (LIMIT 1 in SQL already).
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) {
      setCached(key, null);
      return null;
    }

    const resolved: ResolvedTrigger = {
      trigger_key: String(row.trigger_key),
      creates_commission: Boolean(row.creates_commission),
      auto_approve_below_amount:
        row.auto_approve_below_amount === null
          ? null
          : Number(row.auto_approve_below_amount),
      tds_rate_percent: Number(row.tds_rate_percent ?? 0),
      clawback_grace_days: Number(row.clawback_grace_days ?? 30),
    };

    setCached(key, resolved);
    return resolved;
  } catch (err) {
    console.error(
      '[consultant-commission-trigger] getTriggerForTransition unexpected:',
      err,
    );
    return null;
  }
}

/**
 * Returns the defaults from the `manual` row — the source of TDS rate and
 * auto-approve threshold for service-layer-invoked commission creation.
 * Falls back to a hardcoded last-known-good when the row is missing OR the
 * Supabase read fails, so ConsultantService.createCommissionTransaction
 * never breaks because the config table is unreachable.
 */
export async function getManualTriggerDefaults(): Promise<ResolvedTrigger> {
  const key = cacheKey('manual', null, 'manual');
  const cached = getCached(key);
  if (cached !== undefined && cached !== null) return cached;

  try {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('consultant_commission_trigger_config')
      .select(
        'trigger_key, creates_commission, auto_approve_below_amount, tds_rate_percent, clawback_grace_days, is_active',
      )
      .eq('trigger_key', 'manual')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error(
        '[consultant-commission-trigger] getManualTriggerDefaults read error:',
        error,
      );
      return HARDCODED_MANUAL_FALLBACK;
    }

    if (!data) {
      console.warn(
        '[consultant-commission-trigger] No active manual row, using hardcoded fallback',
      );
      return HARDCODED_MANUAL_FALLBACK;
    }

    const resolved: ResolvedTrigger = {
      trigger_key: 'manual',
      creates_commission: Boolean(data.creates_commission),
      auto_approve_below_amount:
        data.auto_approve_below_amount === null
          ? null
          : Number(data.auto_approve_below_amount),
      tds_rate_percent: Number(data.tds_rate_percent ?? 0),
      clawback_grace_days: Number(data.clawback_grace_days ?? 30),
    };

    setCached(key, resolved);
    return resolved;
  } catch (err) {
    console.error(
      '[consultant-commission-trigger] getManualTriggerDefaults unexpected:',
      err,
    );
    return HARDCODED_MANUAL_FALLBACK;
  }
}

/**
 * Admin-side: list every trigger config row for the management UI.
 * Sorted by source_entity then trigger_key for stable display order.
 */
export async function listTriggerConfigs(): Promise<
  ConsultantCommissionTriggerRow[]
> {
  const supabase = createClientSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('consultant_commission_trigger_config')
    .select('*')
    .order('source_entity', { ascending: true })
    .order('trigger_key', { ascending: true });

  if (error) {
    console.error(
      '[consultant-commission-trigger] listTriggerConfigs error:',
      error,
    );
    throw new Error(
      error.message || 'Failed to fetch consultant commission trigger configs',
    );
  }

  return (data ?? []) as ConsultantCommissionTriggerRow[];
}

/**
 * Admin-side: upsert by trigger_key.
 *   - When `id` is provided, updates that row by primary key.
 *   - Otherwise, ON CONFLICT (trigger_key) DO UPDATE — lets the UI either
 *     add a brand-new trigger key OR re-save an existing one without
 *     manually checking which path applies.
 *
 * RLS enforces super_admin-only writes; non-super_admin callers get a
 * 42501 error surfaced as-is to the caller.
 */
export async function upsertTriggerConfig(
  input: UpsertCommissionTriggerInput,
): Promise<ConsultantCommissionTriggerRow> {
  const supabase = createClientSupabaseClient();

  const payload: Record<string, unknown> = {
    trigger_key: input.trigger_key,
    display_label: input.display_label,
    source_entity: input.source_entity,
    source_status_from: input.source_status_from ?? null,
    source_status_to: input.source_status_to,
    creates_commission: input.creates_commission ?? false,
    auto_approve_below_amount:
      input.auto_approve_below_amount === undefined
        ? null
        : input.auto_approve_below_amount,
    tds_rate_percent: input.tds_rate_percent ?? 0,
    clawback_grace_days: input.clawback_grace_days ?? 30,
    is_active: input.is_active ?? true,
    notes: input.notes ?? null,
  };

  if (input.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('consultant_commission_trigger_config')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single();

    if (error) {
      console.error(
        '[consultant-commission-trigger] upsertTriggerConfig update error:',
        error,
      );
      throw new Error(
        error.message || 'Failed to update consultant commission trigger config',
      );
    }
    invalidateTriggerCache();
    return data as ConsultantCommissionTriggerRow;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('consultant_commission_trigger_config')
    .upsert(payload, { onConflict: 'trigger_key' })
    .select()
    .single();

  if (error) {
    console.error(
      '[consultant-commission-trigger] upsertTriggerConfig insert error:',
      error,
    );
    throw new Error(
      error.message || 'Failed to upsert consultant commission trigger config',
    );
  }
  invalidateTriggerCache();
  return data as ConsultantCommissionTriggerRow;
}

/**
 * Admin-side: toggle creates_commission (the master switch) on a row.
 * Convenience for the data-table's primary toggle.
 */
export async function setCreatesCommission(
  id: string,
  next: boolean,
): Promise<ConsultantCommissionTriggerRow> {
  const supabase = createClientSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('consultant_commission_trigger_config')
    .update({ creates_commission: next })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(
      '[consultant-commission-trigger] setCreatesCommission error:',
      error,
    );
    throw new Error(
      error.message || 'Failed to toggle creates_commission',
    );
  }
  invalidateTriggerCache();
  return data as ConsultantCommissionTriggerRow;
}

/**
 * Admin-side: toggle is_active on a row.
 */
export async function setActive(
  id: string,
  next: boolean,
): Promise<ConsultantCommissionTriggerRow> {
  const supabase = createClientSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('consultant_commission_trigger_config')
    .update({ is_active: next })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[consultant-commission-trigger] setActive error:', error);
    throw new Error(error.message || 'Failed to toggle is_active');
  }
  invalidateTriggerCache();
  return data as ConsultantCommissionTriggerRow;
}

/**
 * Invalidate the entire in-memory cache. Called after every admin write so the
 * next consumer call sees the new selection immediately instead of waiting up
 * to 60s. Cheap because the cache is small (one entry per distinct transition
 * key the engine has seen).
 */
export function invalidateTriggerCache(): void {
  cache.clear();
}
