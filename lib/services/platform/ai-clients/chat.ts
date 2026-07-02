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
// recordChatUsage() at the end.
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
    return { provider: 'anthropic', model_id: resolved.model_id, resolved };
  }

  if (resolved.fallback_provider === 'anthropic' && resolved.fallback_model_id) {
    console.warn(
      `[ai-chat] feature_key=${featureKey} resolved to provider=${resolved.provider} ` +
        `(not anthropic) — using configured anthropic fallback ${resolved.fallback_model_id}`,
    );
    return { provider: 'anthropic', model_id: resolved.fallback_model_id, resolved };
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
    // Record the failed invocation (recordUsage is internally non-throwing),
    // then rethrow — callers keep their existing error handling.
    await recordUsage(featureKey, 'anthropic', model_id, {
      duration_ms: Date.now() - startedAt,
      success: false,
      error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    throw err;
  }
  const durationMs = Date.now() - startedAt;

  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;
  const costInr = computeChatCostInr(model_id, inputTokens, outputTokens);

  await recordUsage(featureKey, 'anthropic', model_id, {
    input_tokens: inputTokens ?? undefined,
    output_tokens: outputTokens ?? undefined,
    cost_inr: costInr ?? undefined,
    duration_ms: durationMs,
    success: true,
  });

  const text = response.content
    .filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )
    .map((block) => block.text)
    .join('');

  return { response, text, provider: 'anthropic', model_id };
}

/**
 * Cost in INR from the pricing registry (INR per 1K tokens).
 * Null (and a console.warn) when the model is missing from the registry —
 * the usage row still lands, just without a cost figure.
 */
function computeChatCostInr(
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
