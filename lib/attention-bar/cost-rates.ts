/**
 * Attention Bar — Layer 4 LLM token pricing.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * These rates are used by `anthropic-client.ts` to convert Anthropic API token
 * usage into a USD cost figure that the cost-tracker writes to
 * `quick_action_ai_cache.cost_usd` and `quick_action_audit.trace.cost_usd`.
 *
 * Pricing model — Claude Haiku 4.5 (effective late 2025 / 2026):
 *   - Input tokens             $1.00 / MTok
 *   - Output tokens            $5.00 / MTok
 *   - Cache reads (5-min TTL)  $0.10 / MTok   (10% of input)
 *   - Cache writes (5-min TTL) $1.25 / MTok   (1.25× input)
 *
 * Sources:
 *   - https://www.anthropic.com/pricing
 *   - https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#pricing
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW TO UPDATE
 * ─────────────────────────────────────────────────────────────────────────
 * If Anthropic changes Haiku 4.5 pricing or we switch model:
 *   1. Update the numeric constants below.
 *   2. Update the comment block above with the new effective date.
 *   3. Update the model id constant if the model changes.
 *   4. Run `npm run check:attention-bar-layer4-llm` to confirm the smoke gate
 *      still passes (the budget math test is rate-independent).
 *   5. Note the change in the PR body — the Director cares about cost trends.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Anthropic model ID used by Layer 4. Keep in sync with anthropic-client.ts. */
export const LAYER_4_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Token rates expressed in USD per million tokens (USD / MTok).
 *
 * The Anthropic API returns usage counts in raw tokens, so we divide by 1e6
 * before multiplying. Keeping the rates in MTok matches the public pricing
 * page and avoids decimal-precision errors in the constants.
 */
export const HAIKU_4_5_RATES_USD_PER_MTOK = Object.freeze({
  /** Standard prompt input tokens (no cache hit). */
  input: 1.0,
  /** Output / completion tokens. */
  output: 5.0,
  /** Cache-read tokens (5-min TTL). 10% of input rate. */
  cacheRead: 0.1,
  /** Cache-write tokens (5-min TTL). 125% of input rate (one-time premium). */
  cacheWrite: 1.25,
});

/** Convert MTok rate to per-token rate (USD / token). */
function perToken(ratePerMTok: number): number {
  return ratePerMTok / 1_000_000;
}

/**
 * Per-token rates in USD/token.
 *
 * Derived from `HAIKU_4_5_RATES_USD_PER_MTOK`; do not edit directly.
 */
export const HAIKU_4_5_RATES_USD_PER_TOKEN = Object.freeze({
  input: perToken(HAIKU_4_5_RATES_USD_PER_MTOK.input),
  output: perToken(HAIKU_4_5_RATES_USD_PER_MTOK.output),
  cacheRead: perToken(HAIKU_4_5_RATES_USD_PER_MTOK.cacheRead),
  cacheWrite: perToken(HAIKU_4_5_RATES_USD_PER_MTOK.cacheWrite),
});

/**
 * Anthropic usage shape — subset we care about.
 *
 * `cache_creation_input_tokens` and `cache_read_input_tokens` are emitted
 * when prompt caching is in use. They REPLACE the corresponding tokens in
 * `input_tokens`, so the formula is:
 *
 *   total_input_cost = (input_tokens × input)
 *                    + (cache_read_input_tokens × cacheRead)
 *                    + (cache_creation_input_tokens × cacheWrite)
 *
 * ref: https://docs.anthropic.com/en/api/messages#response-usage
 */
export interface UsageShape {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Convert Anthropic usage to a USD cost figure.
 *
 * Pure function — no external state. Safe to call from anywhere.
 */
export function computeCostUsd(usage: UsageShape): number {
  const inputCost =
    (usage.input_tokens || 0) * HAIKU_4_5_RATES_USD_PER_TOKEN.input;
  const outputCost =
    (usage.output_tokens || 0) * HAIKU_4_5_RATES_USD_PER_TOKEN.output;
  const cacheReadCost =
    (usage.cache_read_input_tokens || 0) *
    HAIKU_4_5_RATES_USD_PER_TOKEN.cacheRead;
  const cacheWriteCost =
    (usage.cache_creation_input_tokens || 0) *
    HAIKU_4_5_RATES_USD_PER_TOKEN.cacheWrite;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

/**
 * Conservative pre-call cost projection.
 *
 * Used by the budget gate before the call goes out. We don't know the actual
 * usage yet, so we pick a worst-case upper bound:
 *  - System message: ~600 tokens (cached after first call → near-zero)
 *  - Allowlist: ~400 tokens (cached)
 *  - User message: ~200 tokens (uncached, varies per request)
 *  - Output: ~150 tokens (the tool call response is small)
 *
 * Worst case (cold cache, first request of the hour for this allowlist):
 *   1200 input × $1/MTok = $0.0012
 *    150 output × $5/MTok = $0.00075
 *   ≈ $0.002 per cold call
 *
 * Steady state (cache warm):
 *    600 cache_read × $0.10/MTok = $0.00006
 *    600 input × $1/MTok          = $0.00060
 *    150 output × $5/MTok         = $0.00075
 *   ≈ $0.0014 per warm call
 *
 * We project $0.002 to be safe — this is the value passed to the budget gate.
 */
export const PROJECTED_COST_USD = 0.002;
