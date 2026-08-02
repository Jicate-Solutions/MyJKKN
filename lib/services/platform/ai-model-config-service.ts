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
  /** True when spend-cap enforcement swapped model_id to the degrade model. */
  over_cap?: boolean;
  /** The configured model that was swapped away from (over_cap only). */
  capped_from_model_id?: string;
  /** True when provider-health fallback swapped provider+model to the row's
   *  configured fallback pair because the primary is rate-limited. */
  using_fallback?: boolean;
  /** The primary provider that was swapped away from (using_fallback only). */
  fellback_from_provider?: string;
  /** The primary model that was swapped away from (using_fallback only). */
  fellback_from_model_id?: string;
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

// Cheapest anthropic chat model — what an over-cap anthropic feature degrades
// to. Must exist in the ai-providers pricing registry.
const CAP_DEGRADE_MODEL_ID = 'claude-haiku-4-5';

// ---------------------------------------------------------------------------
// Provider-health fallback (2026-07-30)
// ---------------------------------------------------------------------------
// fallback_provider / fallback_model_id have existed on both config tables
// since the 20260512 substrate and are editable in /admin/ai-models, but until
// now NO runtime consumer honored them for provider health — the pair was
// decorative. This turns it into a real primary→fallback swap on ONE narrow
// condition: the primary provider+model's most recent call for this feature,
// inside the health window, was a rate-limit-class failure.
//
// Receipt (voice_memo.transcribe, measured 2026-07-30): the GROQ org key is
// shared with traffic outside MyJKKN, so its daily audio budget is exhausted by
// others. Over the 14 days to 2026-07-30 the pipeline logged 2,117 transcription
// calls for 157 successes — 205 of the failures in the last 3 days alone were
// literal `429 Rate limit reached for model whisper-large-v3`.
//
// WHY RESOLUTION-TIME, NOT INSIDE THE TRANSCRIPTION CLIENT: consumers record
// usage against the provider/model this function RETURNS. Retrying inside the
// client would bill an OpenAI call to Groq's ₹/min in ai_model_usage and would
// leave the consumer's own rate-limit cooldown gate armed against a provider it
// is no longer calling. Swapping here keeps the ledger, the cost estimate and
// every downstream gate consistent with the provider that actually ran.
//
// SHAPE: window-based with no sticky state. Once the primary's last in-window
// call ages out (or succeeds), resolution returns to the primary and re-probes
// it — so the cheap provider is retried at most once per window and reclaims
// traffic the moment its quota frees, instead of parking on the pricier
// fallback forever. Rate-limited probes are not billed by the provider.
//
// SCOPE: rate-limit class ONLY. Timeouts and 5xx keep the primary — flapping to
// a pricier provider on a transient network blip is worse than waiting.
//
// Mirrors RATELIMIT_COOLDOWN_MS in app/api/cron/analyze-voice-memos/route.ts.
// Keep the two in step: a shorter window here would flip back to the primary
// while that route is still in cooldown, which stalls the sweep for a cycle.
const FALLBACK_HEALTH_WINDOW_MS = 30 * 60 * 1000;

/**
 * Rate-limit-class detector for a recorded ai_model_usage.error_message.
 *
 * Deliberately mirrors classifyFailure() in the voice-memo cron: a bare
 * three-digit match would fire on incidental numbers ("took 429ms"), so a 429
 * only counts inside an explicit provider-error shape. The word test carries
 * most real messages — every one of the 205 rate-limit rows measured on
 * 2026-07-30 reads `Transcription API 429: {"error":{"message":"Rate limit
 * reached for model ...`, while the 184 client timeouts and 32 `400 file is
 * empty` rows in the same window match neither branch.
 */
export function isRateLimitMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /quota|rate.?limit/i.test(message) ||
    /(?:API|HTTP|status(?:\s+code)?)[ :]+429\b/i.test(message)
  );
}

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

    // ── CONFIG MERGE (2026-07-14) ──────────────────────────────────────────
    // The ai_job_types registry (#1998) is the SOURCE OF TRUTH for model
    // governance. Resolve from it FIRST, keying on model_id presence — on the
    // registry `enabled` is the generic-drain runnable flag, NOT a model-active
    // flag, so it must NEVER gate model resolution (a config-carrier feature
    // that runs via its own cron/route is enabled=false but still has a live
    // model here). ai_model_config remains the FALLBACK source while the
    // cutover bakes; it is also the only holder of config_json — which no
    // resolution consumer currently reads, so registry rows resolve it null.
    let resolved: ResolvedModel | null = null;

    const { data: reg, error: regError } = await supabase
      .from('ai_job_types')
      .select(
        'job_type, provider, model_id, fallback_provider, fallback_model_id, monthly_spend_cap_inr',
      )
      .eq('job_type', featureKey)
      .not('model_id', 'is', null)
      .maybeSingle();

    if (regError) {
      // Don't hard-fail on a registry read hiccup — fall through to the legacy
      // ai_model_config read below so resolution keeps working.
      console.error(
        `[ai-model-config] ${featureKey}: registry read error (falling back to ai_model_config):`,
        regError.message,
      );
    } else if (reg && reg.provider && reg.model_id) {
      resolved = {
        feature_key: featureKey,
        provider: reg.provider,
        model_id: reg.model_id,
        config_json: null,
        fallback_provider: reg.fallback_provider,
        fallback_model_id: reg.fallback_model_id,
        monthly_spend_cap_inr: reg.monthly_spend_cap_inr,
      };
    }

    // FALLBACK: legacy ai_model_config (pre-merge source; still authoritative
    // for config_json and for any feature not yet carrying a model in the
    // registry).
    if (!resolved) {
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
          `[ai-model-config] No registry or ai_model_config row for feature_key=${featureKey}, using hardcoded fallback`,
        );
        return getHardcodedFallback(featureKey);
      }

      resolved = {
        feature_key: data.feature_key,
        provider: data.provider,
        model_id: data.model_id,
        config_json: (data.config_json as Record<string, unknown> | null) ?? null,
        fallback_provider: data.fallback_provider,
        fallback_model_id: data.fallback_model_id,
        monthly_spend_cap_inr: data.monthly_spend_cap_inr,
      };
    }

    // Spend-cap ENFORCEMENT (Director decision 2026-07-11: the cap box is
    // real, not decorative). When month-to-date spend has crossed the row's
    // cap, an anthropic feature degrades to the cheapest chat model instead
    // of going dark — answers keep flowing, cost stops climbing. Non-anthropic
    // features keep their model (a chat-model swap would break their modality:
    // whisper/gemini/gpt rows), so the cap stays advisory there. Runs only on
    // cache miss → ≤60s enforcement lag per instance; any check failure is
    // fail-open (never block AI because the ledger was unreachable).
    if (
      resolved.monthly_spend_cap_inr !== null &&
      resolved.monthly_spend_cap_inr > 0 &&
      resolved.provider === 'anthropic' &&
      resolved.model_id !== CAP_DEGRADE_MODEL_ID
    ) {
      // `supabase` here IS the service-role client from above — the RPC is
      // service_role-only by grant, so this must never be swapped for a
      // user-session client.
      const { data: spend, error: spendError } = await supabase.rpc(
        'fn_ai_feature_mtd_spend',
        { p_feature_key: featureKey },
      );
      if (spendError) {
        // Fail-open by design (never block AI on a ledger hiccup) but NEVER
        // silently: an always-erroring check would mean caps are quietly
        // unenforced (deep-review finding #2).
        console.error(
          `[ai-model-config] ${featureKey}: spend-cap check errored (cap NOT enforced this cycle):`,
          spendError.message,
        );
      }
      const mtd = typeof spend === 'number' ? spend : Number(spend);
      if (!spendError && Number.isFinite(mtd) && mtd >= resolved.monthly_spend_cap_inr) {
        console.warn(
          `[ai-model-config] ${featureKey}: MTD spend ₹${mtd.toFixed(0)} >= cap ` +
            `₹${resolved.monthly_spend_cap_inr} — degrading ${resolved.model_id} → ${CAP_DEGRADE_MODEL_ID}`,
        );
        resolved.over_cap = true;
        resolved.capped_from_model_id = resolved.model_id;
        resolved.model_id = CAP_DEGRADE_MODEL_ID;
        // Also neutralize the row's fallback pair: a consumer honoring
        // fallback_model_id could otherwise re-escalate an over-cap feature
        // straight back to an expensive model (deep-review finding).
        if (resolved.fallback_provider === 'anthropic') {
          resolved.fallback_model_id = CAP_DEGRADE_MODEL_ID;
        }
      }
    }

    // Provider-health fallback (see FALLBACK_HEALTH_WINDOW_MS above). Runs LAST
    // so it observes the post-cap provider/model, and is skipped entirely when
    // the row is over-cap — re-escalating a capped feature to a different paid
    // provider is exactly what the cap exists to prevent.
    if (
      !resolved.over_cap &&
      resolved.fallback_provider &&
      resolved.fallback_model_id &&
      // A fallback pointing at the primary is a no-op; skip the query.
      !(
        resolved.fallback_provider === resolved.provider &&
        resolved.fallback_model_id === resolved.model_id
      )
    ) {
      try {
        const since = new Date(Date.now() - FALLBACK_HEALTH_WINDOW_MS).toISOString();
        // Most recent call for THIS feature on the PRIMARY pair inside the
        // window. Scoped to provider+model so a fallback call's own failure can
        // never re-trigger the swap decision it caused.
        const { data: last, error: lastError } = await supabase
          .from('ai_model_usage')
          .select('success, error_message')
          .eq('feature_key', featureKey)
          .eq('provider', resolved.provider)
          .eq('model_id', resolved.model_id)
          .gte('invoked_at', since)
          .order('invoked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastError) {
          // Fail-open, but never silently — an always-erroring probe would mean
          // the fallback quietly never engages (mirrors the spend-cap policy).
          console.error(
            `[ai-model-config] ${featureKey}: fallback health probe errored (primary kept):`,
            lastError.message,
          );
        } else if (last && last.success === false && isRateLimitMessage(last.error_message)) {
          console.warn(
            `[ai-model-config] ${featureKey}: primary ${resolved.provider}/${resolved.model_id} ` +
              `rate-limited within ${FALLBACK_HEALTH_WINDOW_MS / 60000}m — using fallback ` +
              `${resolved.fallback_provider}/${resolved.fallback_model_id}`,
          );
          resolved.using_fallback = true;
          resolved.fellback_from_provider = resolved.provider;
          resolved.fellback_from_model_id = resolved.model_id;
          resolved.provider = resolved.fallback_provider;
          resolved.model_id = resolved.fallback_model_id;
        }
      } catch (e) {
        // Fail-open: a health-probe crash must never block AI resolution.
        console.error(`[ai-model-config] ${featureKey}: fallback probe threw (primary kept):`, e);
      }
    }

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
    // Voice memo defaults to cheap stack post 20260513 migration.
    'voice_memo.transcribe': fallback(featureKey, 'groq', 'whisper-large-v3'),
    'voice_memo.sentiment': fallback(featureKey, 'google', 'gemini-2.5-flash-lite'),
    'admission.briefing': fallback(featureKey, 'openai', 'gpt-4o-mini'),
    'admission.ai_insights': fallback(featureKey, 'anthropic', 'claude-sonnet-4-5'),
    'ai_pulse.anomaly_detection': fallback(featureKey, 'openai', 'gpt-4o-mini'),
    // Adoption program 2026-07-02 — each entry mirrors the model the call site
    // hardcoded before adoption (cutover invariant: degraded mode == old behavior).
    'scf.generate_suggestions': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'scf.learner_notes': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'session_feedback.escalation': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'session_feedback.suggest_improvement': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'feedback.classify': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'induction.generate_playbook': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'induction.session_effectiveness': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'cdc.career_guidance': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    // 2026-07-25 — was the dated snapshot 'claude-sonnet-4-20250514', which
    // pins an ageing model the moment Supabase is unreachable. Swapped for
    // the always-latest Sonnet family alias (see ai-providers.ts — 'sonnet'
    // and 'opus' are the ONLY Claude family aliases this codebase resolves).
    'ai_query.natural_language': fallback(featureKey, 'anthropic', 'sonnet'),
    'work_pulse.analyze': fallback(featureKey, 'anthropic', 'sonnet'),
    // 2026-07-25 — de-dated from 'claude-haiku-4-5-20251001'. ai-providers.ts
    // documents that id as "dated alias of claude-haiku-4-5" with identical
    // pricing (₹0.085/₹0.425 per 1K tokens on both) — same tier, no upgrade,
    // just dropping the snapshot date.
    'work_pulse.translate': fallback(featureKey, 'anthropic', 'claude-haiku-4-5'),
    'attention_bar.assistant': fallback(featureKey, 'anthropic', 'claude-haiku-4-5'),
    // rcltp generate route is MyJKKN-gated scaffold (no model in code yet) —
    // forward-default to the platform workhorse.
    'rcltp.question_generation': fallback(featureKey, 'anthropic', 'claude-sonnet-4-6'),
    'admission.ai_service': fallback(featureKey, 'anthropic', 'claude-sonnet-4-5'),
    // Deliberately LEFT dated (not de-dated): 'claude-3-5-haiku-20241022' has
    // no undated sibling id in ai-providers.ts — 3.5 vs 4.5 is a genuine
    // version bump, not a snapshot-of-the-same-model de-dating, so touching
    // this would be an unrequested model upgrade. Out of scope for this fix.
    'admission.agentic_query': fallback(featureKey, 'anthropic', 'claude-3-5-haiku-20241022'),
    'admission.ai_response': fallback(featureKey, 'anthropic', 'claude-3-5-haiku-20241022'),
    // Procurement PDF extraction (2026-07-11) — mirrors the pre-adoption hardcode
    // in lib/procurement/*-pdf-extract.ts (cutover invariant: degraded == old behavior).
    'procurement.quotation_extract': fallback(featureKey, 'anthropic', 'claude-opus-4-8'),
    'procurement.invoice_extract': fallback(featureKey, 'anthropic', 'claude-opus-4-8'),
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
