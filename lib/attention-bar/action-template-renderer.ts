/**
 * Layer 2 — pure action-template renderer.
 *
 * Spec §3 Layer 2: every Layer 2 rule has an `action_template` JSONB shape that
 * matches ActionTemplate plus `{state.<path>}` placeholders. Examples:
 *
 *   {
 *     "id": "L2.counselor.resume_pending_lead",
 *     "label": "Resume Lead #{state.counselor.pending_leads.oldest_lead_id}",
 *     "context": "Last touched {state.counselor.pending_leads.oldest_lead_days} days ago",
 *     "tone": "amber",
 *     "cta": "Open",
 *     "icon": "PhoneCall",
 *     "href": "/admission/leads/{state.counselor.pending_leads.oldest_lead_id}"
 *   }
 *
 * Rules:
 *  - Only `{state.<dot.path>}` placeholders are interpolated.
 *  - Path resolution mirrors rule-evaluator.resolveStateValue: exact key first,
 *    then dot-path traversal so authors can write either flat or nested forms.
 *  - Missing values render as empty string (with one console.warn per render).
 *  - Renderer NEVER builds raw HTML or executes anything. The output ActionTemplate
 *    is exactly the same shape (pure substitution, no HTML escaping needed since
 *    React renders strings as text).
 *  - href is validated to be a relative path or http(s) URL. javascript: URLs
 *    or interpolated input that produces them is rejected (returns '#').
 */

import type { ActionTemplate, Tone } from './types';

const PLACEHOLDER_RE = /\{state\.([a-zA-Z0-9_.\-]+)\}/g;

/** Allowed href schemes for safety. */
const ALLOWED_SCHEMES = /^(?:https?:\/\/|\/)/i;
/** Disallowed scheme prefixes that we want to reject defensively. */
const FORBIDDEN_SCHEMES = /^(?:javascript|data|vbscript|file):/i;

interface RenderInput {
  /** Raw action_template JSONB from quick_action_rules. */
  template: unknown;
  /** State-query results keyed by query_key. */
  state: Record<string, unknown>;
  /** Stable rule id, used for the action's id when template lacks one. */
  ruleId: string;
  /** Set true to suppress missing-key warnings during smoke tests. */
  silent?: boolean;
}

/**
 * Render an action_template into a fully-resolved ActionTemplate.
 * Returns null if the template is structurally invalid (missing required
 * fields). Layer 2 must skip a malformed rule rather than crashing the bar.
 */
export function renderActionTemplate(input: RenderInput): ActionTemplate | null {
  const t = input.template;
  if (t == null || typeof t !== 'object') return null;
  const tpl = t as Record<string, unknown>;

  const label = renderString(tpl.label, input);
  const cta = renderString(tpl.cta, input);
  const icon = typeof tpl.icon === 'string' && tpl.icon.length > 0 ? tpl.icon : 'AlertCircle';
  const tone = normaliseTone(tpl.tone);
  const hrefRaw = renderString(tpl.href, input);
  const href = sanitiseHref(hrefRaw);
  const context = tpl.context != null ? renderString(tpl.context, input) || undefined : undefined;
  const id =
    typeof tpl.id === 'string' && tpl.id.length > 0
      ? tpl.id
      : `L2.${input.ruleId}`;

  // Required fields must be non-empty.
  if (!label || !cta) {
    if (!input.silent) {
      console.warn('[attention-bar/layer-2] action_template missing label or cta', {
        ruleId: input.ruleId,
      });
    }
    return null;
  }

  return { id, label, context, tone, cta, icon, href };
}

/* ─────────────────────────────────────────────────────────────────
 * Internals
 * ─────────────────────────────────────────────────────────────── */

function renderString(raw: unknown, input: RenderInput): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(PLACEHOLDER_RE, (_match, path: string) => {
    const value = resolvePath(path, input.state);
    if (value == null) {
      if (!input.silent) {
        console.warn(
          `[attention-bar/layer-2] missing state value for {state.${path}}`,
          { ruleId: input.ruleId },
        );
      }
      return '';
    }
    return String(value);
  });
}

/**
 * Resolve a dotted path inside the state blob.
 * Same semantics as rule-evaluator.resolveStateValue:
 *   1. Exact key (e.g., 'counselor.pending_leads').
 *   2. Longest-prefix match, then drill into remainder.
 *   3. Top-level drill as a last resort.
 */
function resolvePath(path: string, state: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(state, path)) {
    return state[path];
  }
  const parts = path.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const head = parts.slice(0, i).join('.');
    if (Object.prototype.hasOwnProperty.call(state, head)) {
      return drill(state[head], parts.slice(i));
    }
  }
  return drill(state as unknown, parts);
}

function drill(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function normaliseTone(raw: unknown): Tone {
  const t = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (t === 'urgent' || t === 'amber' || t === 'green' || t === 'blue' || t === 'neutral') {
    return t;
  }
  return 'neutral';
}

/**
 * Defensive href sanitisation. The Attention Bar renders HREFs only — never
 * arbitrary HTML — so we just need to reject script-bearing schemes.
 */
function sanitiseHref(raw: string): string {
  if (!raw) return '#';
  if (FORBIDDEN_SCHEMES.test(raw)) return '#';
  if (!ALLOWED_SCHEMES.test(raw)) return '#';
  return raw;
}
