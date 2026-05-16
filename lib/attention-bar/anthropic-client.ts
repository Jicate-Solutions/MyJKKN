/**
 * Attention Bar — Layer 4 Anthropic SDK wrapper.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * Provides a thin, well-typed wrapper around `Anthropic.messages.create()`
 * with three responsibilities:
 *  1. Singleton SDK client (warm HTTPS connections across requests).
 *  2. Prompt-cache configuration (system message + tool spec marked
 *     `cache_control: { type: 'ephemeral' }`) — Anthropic's 5-min cache TTL.
 *  3. Strict tool-use forcing — the LLM MUST call `pick_action` with an
 *     enum-validated `action_id`; free-text replies are not accepted.
 *
 * The wrapper returns a normalised shape: `{ action_id, reason, usage, model }`.
 * Errors (network, rate-limit, malformed tool call) bubble up; Layer 4's
 * evaluator catches and converts them into `{ matched: false }` so the
 * resolver falls through to Layer 1.
 */

import Anthropic from '@anthropic-ai/sdk';

import { LAYER_4_MODEL } from './cost-rates';
import {
  buildSystemPrompt,
  buildToolDefinition,
  buildUserPrompt,
  type AllowlistEntry,
  type UserPromptInput,
} from './llm-prompt';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton client
// ─────────────────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

/** Read API key from env once and reuse. Throws if missing — fail fast. */
function getClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[attention-bar] ANTHROPIC_API_KEY not set — cannot make Layer 4 calls. ' +
        'Add it to .env.local or disable Layer 4 via quick_action_config.',
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

/** Test-only — flush the cached client so a re-read of env happens. */
export function _resetAnthropicClient(): void {
  _client = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface PickActionResult {
  /** The action_id the LLM selected from the allowlist. */
  action_id: string;
  /** Short reason the LLM gave for its selection. */
  reason: string;
  /** Anthropic usage block — used by cost-rates.computeCostUsd. */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number | null;
    cache_creation_input_tokens: number | null;
  };
  /** Echo of the model that was actually used. */
  model: string;
}

export interface PickActionInput extends UserPromptInput {
  /** Override timeout in ms. Default 8000. */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call Claude Haiku 4.5 to pick one action from the allowlist.
 *
 * Throws on:
 *  - Missing ANTHROPIC_API_KEY (caller should have gated on isLayer4Enabled).
 *  - Network / 4xx / 5xx from Anthropic.
 *  - Malformed response (no tool_use block found).
 *
 * Allowlist enum on the tool definition is the first line of defence; the
 * Layer 4 evaluator double-checks the returned id against the allowlist
 * before treating the response as valid.
 */
export async function pickActionViaLLM(
  input: PickActionInput,
): Promise<PickActionResult> {
  if (input.allowlist.length === 0) {
    throw new Error('[attention-bar] pickActionViaLLM called with empty allowlist');
  }

  const client = getClient();
  const system = buildSystemPrompt();
  const userText = buildUserPrompt(input);
  const tool = buildToolDefinition(input.allowlist);

  // ─────────────────────────────────────────────────────────────────────
  // Prompt cache strategy:
  //
  //   System message → cacheable (stable across all calls; high reuse).
  //   Tool spec      → cacheable WITH the system block. Anthropic caches
  //                    everything up to and including the cache-control'd
  //                    block, so by marking the system block we get the
  //                    tools cached too (5-min TTL).
  //   User message   → NOT cached. Per-request.
  //
  // The 5-min ephemeral cache window means consecutive calls within the
  // same hour-bucket usually hit the cache for system+tools, paying only
  // the user-message + output tokens.
  // ─────────────────────────────────────────────────────────────────────

  const message = await client.messages.create({
    model: LAYER_4_MODEL,
    max_tokens: 256,
    // System message: array form (so we can attach cache_control).
    system: [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [tool],
    tool_choice: { type: 'tool', name: 'pick_action' },
    messages: [
      {
        role: 'user',
        content: userText,
      },
    ],
  });

  // ─────────────────────────────────────────────────────────────────────
  // Extract the tool_use block.
  //
  // With `tool_choice: { type: 'tool', name: 'pick_action' }`, the model
  // is forced to emit exactly one tool_use block. If we don't find one,
  // the model misbehaved — surface the error so the evaluator falls open.
  // ─────────────────────────────────────────────────────────────────────

  const toolBlock = message.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use',
  );

  if (!toolBlock || toolBlock.name !== 'pick_action') {
    throw new Error(
      `[attention-bar] LLM did not emit a pick_action tool_use block. ` +
        `Stop reason: ${message.stop_reason}. ` +
        `Block types: ${message.content.map((b) => b.type).join(',')}.`,
    );
  }

  const toolInput = toolBlock.input as Record<string, unknown>;
  const action_id = typeof toolInput.action_id === 'string' ? toolInput.action_id : '';
  const reason = typeof toolInput.reason === 'string' ? toolInput.reason : '';

  if (!action_id) {
    throw new Error(
      '[attention-bar] LLM tool_use missing action_id. ' +
        `Got: ${JSON.stringify(toolInput)}`,
    );
  }

  return {
    action_id,
    reason,
    usage: {
      input_tokens: message.usage.input_tokens ?? 0,
      output_tokens: message.usage.output_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? null,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? null,
    },
    model: message.model,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test seam — exposed for the smoke gate to inject a stubbed LLM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test seam — replace the LLM call with a stub.
 *
 * The smoke gate calls this to verify allowlist enforcement WITHOUT spending
 * real API budget. Production code never invokes this. Pass `null` to clear
 * the stub.
 */
let _stub: ((input: PickActionInput) => Promise<PickActionResult>) | null = null;

export function _setLLMStub(
  stub: ((input: PickActionInput) => Promise<PickActionResult>) | null,
): void {
  _stub = stub;
}

/** Internal: call either the stub (if set) or the real LLM. */
export async function callLLM(input: PickActionInput): Promise<PickActionResult> {
  if (_stub) return _stub(input);
  return pickActionViaLLM(input);
}

/** Re-exports for layer-4.ts. */
export type { AllowlistEntry, UserPromptInput };
