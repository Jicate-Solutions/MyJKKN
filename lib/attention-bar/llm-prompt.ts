/**
 * Attention Bar — Layer 4 LLM prompt builder.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * Layer 4 is the AI fallback that only fires when L0/L2/L3/L1 all return
 * nothing actionable. The LLM is asked to RANK an allowlist of pre-approved
 * actions for the current (page, role, recent_actions, time_of_day) context
 * and pick exactly ONE.
 *
 * Hard constraints (every prompt enforces these):
 *  1. The LLM MAY ONLY return an action_id that exists in the allowlist.
 *     Hallucinated routes are rejected server-side; we don't even tell the
 *     model about routes it cannot pick.
 *  2. The output is structured via tool-use forcing — no free-text. This
 *     simplifies parsing and prevents prompt-injection-style escapes.
 *  3. The system message + allowlist are designed to be CACHEABLE. Anthropic's
 *     5-min prompt cache lets us amortise the system message across requests
 *     for the same (page, role) pair. We mark the system block with
 *     `cache_control: { type: 'ephemeral' }` to opt in.
 *
 * This file is PURE — no DB calls, no SDK calls, no env reads. Easy to unit
 * test by inspecting return values.
 */

import type { ActionTemplate } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row of the allowlist passed to the LLM.
 *
 * `id` is what the LLM picks; `label` and `href` are shown so the LLM can
 * make a judgement, but they're never modified by the LLM — we look up the
 * full template on our side after validation.
 */
export interface AllowlistEntry {
  id: string;
  label: string;
  context?: string;
  href: string;
  /** Free-text hint — e.g. 'static default for counselor on /admission/leads'. */
  source: string;
}

export interface UserPromptInput {
  page: string;
  role: string;
  /** Last 5 actions the user tapped, most recent first. May be empty. */
  recentActions: string[];
  /** ISO8601 timestamp; the LLM extracts time-of-day from it. */
  timeOfDay: string;
  allowlist: AllowlistEntry[];
}

/**
 * Anthropic tool-use schema. Constrained `enum` on `action_id` is the
 * defence-in-depth that backs up our server-side allowlist check — even if
 * the model hallucinates, the JSON validator at the SDK layer rejects it.
 */
export interface ToolDefinition {
  name: 'pick_action';
  description: string;
  input_schema: {
    type: 'object';
    properties: {
      action_id: {
        type: 'string';
        enum: string[];
        description: string;
      };
      reason: {
        type: 'string';
        description: string;
      };
    };
    required: ['action_id', 'reason'];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt (cacheable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the system prompt.
 *
 * Pure function — no per-request data. The Anthropic 5-min prompt cache will
 * deduplicate this across all calls within the cache window, so we want it
 * STABLE: same string every time → same cache key.
 *
 * We deliberately keep this short. Anthropic cache-write costs 1.25× input,
 * so a bloated system message paid 1.25× upfront for the first call of every
 * cache window is wasteful.
 */
export function buildSystemPrompt(): string {
  return [
    'You are the AI fallback layer of the MyJKKN Attention Bar — a single-slot',
    "UI surface that shows the user's most relevant next action.",
    '',
    'The Attention Bar resolves through a priority cascade:',
    '  Layer 0 — urgent real-time notifications',
    '  Layer 2 — admin-configured state-aware rules',
    '  Layer 3 — per-user behavioural learning (opt-in)',
    '  Layer 1 — curated static defaults',
    '  Layer 4 — YOU. Last resort.',
    '',
    'You only run when none of the higher layers had anything to say. Your',
    'job is to RANK the allowlisted actions and pick exactly ONE that best',
    "fits the user's current context (page, role, recent actions, time of",
    'day). The selected action will be rendered in the Attention Bar.',
    '',
    'Hard rules:',
    '  - Pick action_id ONLY from the allowlist provided in the user message.',
    '    Inventing a new id, label, or route is forbidden — the system will',
    '    reject any response not in the allowlist.',
    '  - Use the `pick_action` tool. Do not respond in free text.',
    '  - The `reason` field is logged for audit. Keep it under 80 chars and',
    '    explain the choice in plain language a non-technical Director can',
    '    skim. Example: "Counselor on Saturday morning — most likely needs',
    '    to triage weekend leads."',
    '',
    'Tone:',
    '  - Be utilitarian. Pick the highest-utility action, not the most',
    '    interesting one. The user has work to do, not time to explore.',
    '  - When the role suggests routine (faculty during a class period,',
    '    counselor during business hours), prefer the action that resumes',
    '    their workflow.',
    '  - When recent actions suggest a stuck workflow (5 in a row on the',
    '    same page), prefer an action that moves them somewhere new.',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// User prompt (per-request)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the user prompt — the per-request portion. NOT cached.
 *
 * Includes the allowlist as JSON so the LLM can read it. We chose JSON
 * over markdown so the model treats each entry as a distinct atom rather
 * than a paragraph.
 */
export function buildUserPrompt(input: UserPromptInput): string {
  const recentActionsLine =
    input.recentActions.length === 0
      ? '(none recorded)'
      : input.recentActions.slice(0, 5).join(' → ');

  return [
    `Page: ${input.page}`,
    `Role: ${input.role}`,
    `Recent actions: ${recentActionsLine}`,
    `Time of day (ISO): ${input.timeOfDay}`,
    '',
    'Allowlist (pick exactly one action_id):',
    JSON.stringify(input.allowlist, null, 2),
    '',
    'Call the `pick_action` tool with the chosen action_id and a short reason.',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Anthropic tool spec for `pick_action`.
 *
 * The `action_id` enum is built from the allowlist — this is defence in
 * depth. Even if the LLM tries to invent an id, the SDK's JSON-schema
 * validator rejects it before our code sees it.
 *
 * If the allowlist is empty (shouldn't happen — Layer 1 catch-all guarantees
 * at least one entry), we fall back to a single sentinel id so the tool spec
 * is still valid.
 */
export function buildToolDefinition(allowlist: AllowlistEntry[]): ToolDefinition {
  const enumIds =
    allowlist.length > 0 ? allowlist.map((e) => e.id) : ['__no_allowlist__'];

  return {
    name: 'pick_action',
    description:
      'Pick exactly one action_id from the allowlist that best fits the user context. Hallucinated ids are rejected.',
    input_schema: {
      type: 'object',
      properties: {
        action_id: {
          type: 'string',
          enum: enumIds,
          description: 'The chosen action_id. MUST be a value from the allowlist.',
        },
        reason: {
          type: 'string',
          description:
            'Short (≤ 80 chars) explanation of why this action was picked. Logged to audit.',
        },
      },
      required: ['action_id', 'reason'],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist construction helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build allowlist entries from raw `ActionTemplate`s sourced from L1 + L2.
 *
 * Caller is responsible for fetching the templates; this just shapes them
 * for the prompt. We strip irrelevant fields (icon, tone, cta) — the LLM
 * only needs id, label, href, and a hint of why this action is on the list.
 */
export function toAllowlistEntry(
  template: ActionTemplate,
  source: string,
): AllowlistEntry {
  return {
    id: template.id,
    label: template.label,
    context: template.context,
    href: template.href,
    source,
  };
}
