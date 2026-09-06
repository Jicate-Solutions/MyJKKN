// lib/services/platform/ai-clients/chat.ts
// ============================================================================
// Shared Claude chat wrapper — config-driven model selection + usage recording.
//
// WHY: 21 call sites across 15 files each do `new Anthropic({ apiKey })` +
// `messages.create({ model: '<hardcoded>' })`. This wrapper is the ONE place
// that resolves the model from ai_model_config (via getModelForFeature, 60s
// cache, hardcoded-fallback-on-any-failure) and records per-call usage/cost
// into ai_model_usage — so /admin/ai-models actually governs every feature.
//
// Usage (typical call site):
//   const { text, response } = await claudeChatForFeature('scf.generate_suggestions', {
//     max_tokens: 4096,
//     system: SYSTEM_PROMPT,
//     messages: [{ role: 'user', content: prompt }],
//   });
//
// For call sites too weird to wrap (tool-use loops, custom client wrappers),
// use the primitives instead: resolveChatModel() at the top of the flow,
// recordChatCall() right after each messages.create (success and failure).
//
// GUARANTEES:
//   - Config problems NEVER throw and NEVER change caller behavior beyond
//     which model id is used (missing row / unreachable table / non-anthropic
//     provider all degrade to a working Anthropic model).
//   - Anthropic API errors are recorded (success:false) then RETHROWN so
//     callers keep their existing error handling.
//   - recordUsage is AWAITED (it is internally non-throwing). Do NOT convert
//     to fire-and-forget: Vercel serverless freezes the instance at response
//     time and un-awaited promises are silently dropped.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  getModelForFeature,
  recordUsage,
  type ResolvedModel,
} from '@/lib/services/platform/ai-model-config-service';
import { getModel } from '@/lib/services/platform/ai-providers';

// Re-export for primitive adopters — one import path for the whole pattern.
export { recordUsage as recordChatUsage };

/** Caller-supplied Anthropic params — everything except `model`, which is
 *  resolved from ai_model_config. system / max_tokens / temperature / tools
 *  pass through untouched. */
export type ClaudeChatParams = Omit<
  Anthropic.MessageCreateParamsNonStreaming,
  'model'
>;

export interface ClaudeChatResult {
  /** Raw Anthropic response — callers needing tool_use blocks etc. read this. */
  response: Anthropic.Message;
  /** Convenience: all text blocks concatenated. */
  text: string;
  /** Provider actually used (always 'anthropic' after the guard). */
  provider: string;
  /** Model id actually sent to the API. */
  model_id: string;
}

// Last-resort model when config resolution produces a non-Anthropic provider
// and no Anthropic fallback is configured. Matches the platform workhorse.
const HARDCODED_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// The Max-lane Claude CLI accepts the bare family aliases 'sonnet'/'opus' and
// resolves each to Anthropic's current-latest in that tier at ₹0 — so
// ai_model_config stores those aliases for Max-lane jobs. The PAID Anthropic
// SDK does NOT accept a bare alias: `messages.create({ model: 'sonnet' })`
// 404s. Translate alias -> concrete dated id ONLY here, at the paid-SDK
// boundary. Max-lane CLI callers resolve the alias themselves and never pass
// through resolveChatModel, so the ₹0 lane is untouched. Concrete ids (and any
// non-alias value) pass through unchanged.
const PAID_ANTHROPIC_ALIAS_TO_MODEL: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6', // latest Sonnet / platform workhorse
  opus: 'claude-opus-4-8', // latest Opus
};

/** Map a bare family alias ('sonnet'/'opus') to a concrete model id the paid
 *  Anthropic SDK accepts. Anything already concrete passes through unchanged. */
function toPaidAnthropicModelId(modelId: string): string {
  return PAID_ANTHROPIC_ALIAS_TO_MODEL[modelId] ?? modelId;
}

/**
 * Resolve the model for a feature with an anthropic-only guard.
 *
 * getModelForFeature already falls back to a hardcoded default when the row
 * is missing or Supabase is unreachable. This adds one more guard: if the
 * resolved provider is NOT 'anthropic' (e.g. someone points the row at
 * openai), we cannot hand that model id to the Anthropic SDK — so we degrade
 * to the row's Anthropic fallback if one is configured, else the hardcoded
 * Anthropic model. console.warn either way; never throw.
 */
export async function resolveChatModel(
  featureKey: string,
): Promise<{ provider: string; model_id: string; resolved: ResolvedModel }> {
  const resolved = await getModelForFeature(featureKey);

  if (resolved.provider === 'anthropic') {
    return { provider: 'anthropic', model_id: toPaidAnthropicModelId(resolved.model_id), resolved };
  }

  if (resolved.fallback_provider === 'anthropic' && resolved.fallback_model_id) {
    console.warn(
      `[ai-chat] feature_key=${featureKey} resolved to provider=${resolved.provider} ` +
        `(not anthropic) — using configured anthropic fallback ${resolved.fallback_model_id}`,
    );
    return { provider: 'anthropic', model_id: toPaidAnthropicModelId(resolved.fallback_model_id), resolved };
  }

  console.warn(
    `[ai-chat] feature_key=${featureKey} resolved to provider=${resolved.provider} ` +
      `(not anthropic) with no anthropic fallback — using hardcoded ${HARDCODED_ANTHROPIC_MODEL}`,
  );
  return { provider: 'anthropic', model_id: HARDCODED_ANTHROPIC_MODEL, resolved };
}

/**
 * One config-governed Claude chat call for a feature.
 *
 * Resolves the model from ai_model_config, runs messages.create with the
 * caller's params untouched, computes cost_inr from the pricing registry,
 * and records the invocation in ai_model_usage (success and failure alike).
 * API errors are rethrown after recording so callers keep their own handling.
 */
export async function claudeChatForFeature(
  featureKey: string,
  params: ClaudeChatParams,
  options?: Anthropic.RequestOptions,
): Promise<ClaudeChatResult> {
  const { model_id } = await resolveChatModel(featureKey);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const anthropic = new Anthropic({ apiKey });

  const startedAt = Date.now();
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      { ...params, model: model_id },
      options,
    );
  } catch (err) {
    // Record the failed invocation (recordChatCall is internally non-throwing),
    // then rethrow — callers keep their existing error handling.
    await recordChatCall(featureKey, 'anthropic', model_id, startedAt, null, err);
    throw err;
  }

  await recordChatCall(featureKey, 'anthropic', model_id, startedAt, response);

  const text = response.content
    .filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )
    .map((block) => block.text)
    .join('');

  return { response, text, provider: 'anthropic', model_id };
}

/**
 * Record ONE Claude invocation (success OR failure) into ai_model_usage.
 *
 * This is THE shared helper for primitive adopters (call sites that run
 * `anthropic.messages.create` themselves instead of using
 * claudeChatForFeature): pass the raw response for a success row, or
 * `resp = null` plus the caught error for a failure row. Cost comes from
 * computeChatCostInr (pricing registry). Internally non-throwing
 * (recordUsage never throws) and MUST be awaited — Vercel serverless
 * freezes the instance at response time and drops un-awaited promises.
 *
 * @param featureKey ai_model_config feature key (e.g. 'scf.generate_suggestions')
 * @param provider   provider label for the ledger row (currently 'anthropic')
 * @param modelId    model id actually sent to the API
 * @param startedAt  Date.now() captured just before messages.create
 * @param resp       the Anthropic response (success) or null (failure)
 * @param err        the caught error — only read when resp is null
 */
export async function recordChatCall(
  featureKey: string,
  provider: string,
  modelId: string,
  startedAt: number,
  resp: Anthropic.Message | null,
  err?: unknown,
): Promise<void> {
  if (resp) {
    const inputTokens = resp.usage?.input_tokens;
    const outputTokens = resp.usage?.output_tokens;
    await recordUsage(featureKey, provider, modelId, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr:
        computeChatCostInr(modelId, inputTokens ?? null, outputTokens ?? null) ??
        undefined,
      duration_ms: Date.now() - startedAt,
      success: true,
    });
  } else {
    await recordUsage(featureKey, provider, modelId, {
      duration_ms: Date.now() - startedAt,
      success: false,
      error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
  }
}

/**
 * Cost in INR from the pricing registry (INR per 1K tokens).
 * Null (and a console.warn) when the model is missing from the registry —
 * the usage row still lands, just without a cost figure.
 *
 * Exported for call sites whose token counts don't come from a single
 * response (e.g. ai-query aggregates usage across a tool-use loop) —
 * everyone else should go through recordChatCall.
 */
export function computeChatCostInr(
  modelId: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const pricing = getModel('anthropic', modelId);
  if (
    !pricing ||
    pricing.inputPer1KTokensInr == null ||
    pricing.outputPer1KTokensInr == null
  ) {
    console.warn(
      `[ai-chat] model_id=${modelId} missing from AI_PROVIDER_REGISTRY pricing — cost_inr recorded as null`,
    );
    return null;
  }
  if (inputTokens == null || outputTokens == null) return null;
  const cost =
    (inputTokens / 1000) * pricing.inputPer1KTokensInr +
    (outputTokens / 1000) * pricing.outputPer1KTokensInr;
  return Number(cost.toFixed(6));
}
