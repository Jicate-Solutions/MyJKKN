// lib/services/platform/ai-model-config-service.ts
// ============================================================================
// AI Model Config Service — runtime reader + usage recorder.
//
// Used by every MyJKKN service that calls an AI provider:
//   const { provider, model_id, config_json } = await getModelForFeature('voice_memo.transcribe')
//   ... call provider with that model ...
//   await recordUsage('voice_memo.transcribe', { input_tokens, output_tokens, cost_inr, duration_ms, success })
//
// Cache: in-memory 60s TTL per feature_key. Sufficient because Director changes
// model selection rarely (minutes-to-hours, not sub-second). Cache keyed
// per-process — each Vercel function instance has its own cache; eventual
// consistency on rotation is fine.
//
// Pattern: matches lib/services/admission/lead-stage-policy-service.ts (config-row).
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiModelConfigRow {
  feature_key: string;
  display_name: string;
  description: string | null;
  category: string | null;
  provider: string;
  model_id: string;
  fallback_provider: string | null;
  fallback_model_id: string | null;
  monthly_spend_cap_inr: number | null;
  is_active: boolean;
  config_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  change_reason: string | null;
}

export interface ResolvedModel {
  feature_key: string;
  provider: string;
  model_id: string;
  config_json: Record<string, unknown> | null;
  fallback_provider: string | null;
  fallback_model_id: string | null;
  monthly_spend_cap_inr: number | null;
}

export interface RecordUsageInput {
  input_tokens?: number;
  output_tokens?: number;
  cost_inr?: number;
  duration_ms?: number;
  success?: boolean;
  error_message?: string;
  call_log_id?: string;
}

// ---------------------------------------------------------------------------
// In-memory cache (60s TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: ResolvedModel;
  expiresAt: number;
}

const cache: Map<string, CacheEntry> = new Map();

function getCached(featureKey: string): ResolvedModel | null {
  const entry = cache.get(featureKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(featureKey);
    return null;
  }
  return entry.value;
}

function setCached(featureKey: string, value: ResolvedModel): void {
  cache.set(featureKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the current model selection for a feature. Cached 60s.
 *
 * Falls back to a hardcoded last-known default if the row is missing OR if the
 * Supabase read fails — the caller's flow must NOT break because the config
 * table is unreachable. Caller can detect "cached default in use" by inspecting
 * provider/model_id against the registry.
 */
export async function getModelForFeature(featureKey: string): Promise<ResolvedModel> {
  const cached = getCached(featureKey);
  if (cached) return cached;

  try {
    // Use service-role client so this works from server routes regardless of
    // user session. RLS blocks anonymous reads; service-role bypasses.
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('ai_model_config')
      .select(
        'feature_key, provider, model_id, config_json, fallback_provider, fallback_model_id, monthly_spend_cap_inr, is_active',
      )
      .eq('feature_key', featureKey)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[ai-model-config] getModelForFeature read error:', error);
      return getHardcodedFallback(featureKey);
    }

    if (!data) {
      console.warn(
        `[ai-model-config] No row for feature_key=${featureKey}, using hardcoded fallback`,
      );
      return getHardcodedFallback(featureKey);
    }

    const resolved: ResolvedModel = {
      feature_key: data.feature_key,
      provider: data.provider,
      model_id: data.model_id,
      config_json: (data.config_json as Record<string, unknown> | null) ?? null,
      fallback_provider: data.fallback_provider,
      fallback_model_id: data.fallback_model_id,
      monthly_spend_cap_inr: data.monthly_spend_cap_inr,
    };

    setCached(featureKey, resolved);
    return resolved;
  } catch (err) {
    console.error('[ai-model-config] getModelForFeature unexpected:', err);
    return getHardcodedFallback(featureKey);
  }
}

/**
 * Record one AI invocation. Best-effort — failures are logged but never thrown.
 * Caller must compute cost_inr using provider pricing from ai-providers.ts.
 */
export async function recordUsage(
  featureKey: string,
  provider: string,
  modelId: string,
  input: RecordUsageInput,
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('ai_model_usage').insert({
      feature_key: featureKey,
      provider,
      model_id: modelId,
      input_tokens: input.input_tokens ?? null,
      output_tokens: input.output_tokens ?? null,
      cost_inr: input.cost_inr ?? null,
      duration_ms: input.duration_ms ?? null,
      success: input.success ?? true,
      error_message: input.error_message ?? null,
      call_log_id: input.call_log_id ?? null,
    });

    if (error) {
      console.error('[ai-model-config] recordUsage error:', error);
    }
  } catch (err) {
    console.error('[ai-model-config] recordUsage unexpected:', err);
  }
}

/**
 * Invalidate the in-memory cache for a feature. Called by the PATCH route after
 * a model change so the next consumer call sees the new selection immediately
 * (instead of waiting up to 60s).
 */
export function invalidateModelCache(featureKey?: string): void {
  if (featureKey) {
    cache.delete(featureKey);
  } else {
    cache.clear();
  }
}

/**
 * Admin-side: list all configured features with their current model.
 * Used by /api/admin/ai-models GET.
 */
export async function listAllFeatures(): Promise<AiModelConfigRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ai_model_config')
    .select('*')
    .order('category', { ascending: true })
    .order('feature_key', { ascending: true });

  if (error) throw error;
  return (data ?? []) as AiModelConfigRow[];
}

// ---------------------------------------------------------------------------
// Hardcoded fallbacks — last-known-good defaults that match the seed migration.
// Used only when Supabase is unreachable so AI features keep working in
// degraded mode. Update if seed defaults change.
// ---------------------------------------------------------------------------

function getHardcodedFallback(featureKey: string): ResolvedModel {
  const FALLBACKS: Record<string, ResolvedModel> = {
    'voice_memo.transcribe': fallback(featureKey, 'openai', 'whisper-1'),
    'voice_memo.sentiment': fallback(featureKey, 'openai', 'gpt-4o-mini'),
    'admission.briefing': fallback(featureKey, 'openai', 'gpt-4o-mini'),
    'admission.ai_insights': fallback(featureKey, 'openai', 'gpt-4o-mini'),
    'ai_pulse.anomaly_detection': fallback(featureKey, 'openai', 'gpt-4o-mini'),
  };

  return FALLBACKS[featureKey] ?? fallback(featureKey, 'openai', 'gpt-4o-mini');
}

function fallback(
  featureKey: string,
  provider: string,
  modelId: string,
): ResolvedModel {
  return {
    feature_key: featureKey,
    provider,
    model_id: modelId,
    config_json: null,
    fallback_provider: null,
    fallback_model_id: null,
    monthly_spend_cap_inr: null,
  };
}
