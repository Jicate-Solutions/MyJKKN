/**
 * Attention Bar — Layer 4 action picker (Max-lane / #1998 AI-jobs registry).
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 4
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REFERENCE CONVERSION (2026-07-13): attention_bar.assistant is moved off a
 * direct `anthropic.messages.create()` call and onto the generic AI-jobs
 * registry (#1998). Instead of calling Claude in-process, `pickActionViaLLM`
 * now ENQUEUES an `attention_bar.assistant` job via `fn_ai_enqueue` — whose
 * prompt_template + tool_set live in `ai_job_types` (seeded / aligned by the
 * orchestrator) — then long-polls `fn_ai_job_status` for the drain's result,
 * mirroring the proven route app/api/work-pulse/translate/route.ts and the
 * chat consumer app/api/ai-query/route.ts.
 *
 * This is a PAGE-CONTEXT feature: the model is handed EVERYTHING it needs in
 * the payload (the on-screen `actions` allowlist + the situational `context`),
 * so the job runs with tool_set=none — no tools, no DB fetch, fast + reliable.
 *
 * Payload contract — the seeded prompt uses `{{actions}}` and `{{context}}`,
 * so p_payload MUST carry exactly those two keys:
 *   - actions : JSON of the pickable allowlist (id/label/context/href/source).
 *   - context : the page / role / recent-actions / time-of-day situation.
 *
 * The wrapper still returns the SAME normalised shape the rest of Layer 4
 * expects — `{ action_id, reason, usage, model }` — so layer-4.ts, the
 * resolver, the /api/attention-bar/resolve route, the hook, and the pill all
 * stay byte-for-byte unchanged. Only the AI-invocation middle changed.
 *
 * "If slow" behaviour: this is a PASSIVE, auto-resolving UI pill, not a
 * must-not-lose chat answer. Every failure path here (enqueue rejected, drain
 * offline, job error, deadline, unusable answer) THROWS — and Layer 4's
 * evaluator converts any throw into `{ matched: false }`, so the resolver
 * simply falls through to the curated Layer 1 static default. That built-in
 * fail-open cascade IS the graceful "if the Max lane is slow" path (superior
 * to an inbox for an ephemeral pill); the server long-polls within the
 * route's maxDuration exactly like the translate route.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@/lib/supabase/server';

import {
  type AllowlistEntry,
  type UserPromptInput,
} from './llm-prompt';

/**
 * Registry job_type governing this feature. The prompt_template, tool_set
 * (none) and input_schema for it live in `ai_job_types` — owned by the
 * orchestrator, never written from here.
 */
const JOB_TYPE = 'attention_bar.assistant';

// Poll cadence — mirrors the proven ai_jobs consumers (translate / ai-query).
const POLL_MS = 2_000;
const UNCLAIMED_DEADLINE_MS = 90_000; // give up if never claimed (drain offline)
const TOTAL_DEADLINE_MS = 170_000; // kept < the resolve route's maxDuration (180)

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Public types (unchanged — Layer 4 depends on these shapes)
// ─────────────────────────────────────────────────────────────────────────────

export interface PickActionResult {
  /** The action_id the model selected from the allowlist. */
  action_id: string;
  /** Short reason the model gave for its selection. */
  reason: string;
  /**
   * Usage block — consumed by cost-rates.computeCostUsd in Layer 4. The Max
   * lane runs on the Claude subscription (₹0 API); usage recording happens on
   * the runner side, so every field here is zero and Layer 4 records cost 0.
   */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number | null;
    cache_creation_input_tokens: number | null;
  };
  /** Echo of the model/lane that produced the pick. */
  model: string;
}

export interface PickActionInput extends UserPromptInput {
  /** @deprecated timeout is now governed by the poll deadline below. Unused. */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result extraction — tolerant, must return an allowlist id
// ─────────────────────────────────────────────────────────────────────────────

/** Pull a free-text answer out of the drain's result jsonb (translate-style). */
function rawAnswer(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const key of ['answer', 'text', 'result', 'output']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
  }
  return '';
}

/**
 * Extract `{ action_id, reason }` from a completed job result, tolerating the
 * shapes a tool_set=none answer can take (structured object, JSON-in-text, or
 * a sentence that names the id). The returned action_id is ONLY trusted when
 * it is one of the allowlist ids — Layer 4 double-checks it too
 * (resolveTemplateFromAllowlist), and an empty id fails the caller open.
 */
function extractPick(
  result: unknown,
  allowlistIds: string[],
): { action_id: string; reason: string } {
  // 1. Directly-structured result { action_id, reason }.
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    if (typeof o.action_id === 'string' && o.action_id.trim().length > 0) {
      return {
        action_id: o.action_id.trim(),
        reason: typeof o.reason === 'string' ? o.reason : '',
      };
    }
  }

  const text = rawAnswer(result);
  if (text) {
    // 2. JSON embedded in the answer text.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        if (typeof parsed.action_id === 'string' && parsed.action_id.trim().length > 0) {
          return {
            action_id: parsed.action_id.trim(),
            reason: typeof parsed.reason === 'string' ? parsed.reason : '',
          };
        }
      } catch {
        // fall through to substring scan
      }
    }
    // 3. Substring scan — first allowlist id that appears in the answer wins.
    for (const id of allowlistIds) {
      if (id && text.includes(id)) {
        return { action_id: id, reason: text.trim().slice(0, 80) };
      }
    }
  }

  return { action_id: '', reason: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick one action from the allowlist via the attention_bar.assistant Max-lane
 * job. Builds the `{ actions, context }` payload from the on-screen data,
 * enqueues it (auth.uid()-gated + allow_rule enforced inside fn_ai_enqueue),
 * and long-polls for the answer.
 *
 * Throws on: empty allowlist, enqueue rejection (unknown/disabled job_type,
 * not-allowed, too-many-in-flight), drain offline, job error, deadline, or an
 * answer with no usable allowlist id. Every throw is caught by Layer 4 and
 * converted to matched:false → resolver falls through to Layer 1.
 */
export async function pickActionViaLLM(
  input: PickActionInput,
): Promise<PickActionResult> {
  if (input.allowlist.length === 0) {
    throw new Error('[attention-bar] pickActionViaLLM called with empty allowlist');
  }

  // Session client — fn_ai_enqueue is auth.uid()-gated (runs inside the
  // /api/attention-bar/resolve request, which carries the user's session).
  const supabase = await createClient();

  // ── Build the two placeholder variables the seeded prompt expects ────────
  // actions {{actions}} — the pickable allowlist the model must choose from.
  const actions = JSON.stringify(
    input.allowlist.map((e) => ({
      id: e.id,
      label: e.label,
      context: e.context,
      href: e.href,
      source: e.source,
    })),
    null,
    2,
  );
  // context {{context}} — the on-screen situation (page, role, recents, time).
  const recentActionsLine =
    input.recentActions.length === 0
      ? '(none recorded)'
      : input.recentActions.slice(0, 5).join(' → ');
  const context = [
    `Page: ${input.page}`,
    `Role: ${input.role}`,
    `Recent actions: ${recentActionsLine}`,
    `Time of day (ISO): ${input.timeOfDay}`,
  ].join('\n');

  // ── Enqueue on the registry Max lane ─────────────────────────────────────
  const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
    p_job_type: JOB_TYPE,
    p_payload: { actions, context },
  });
  if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
    const errText =
      typeof enq?.error === 'string'
        ? enq.error
        : enqError?.message ?? 'enqueue failed';
    throw new Error(`[attention-bar] fn_ai_enqueue failed: ${errText}`);
  }

  const jobId = enq.job_id as string;
  const allowlistIds = input.allowlist.map((e) => e.id);

  // ── Long-poll for the drain's result ─────────────────────────────────────
  const startedAt = Date.now();
  let picked: { action_id: string; reason: string } | null = null;
  while (Date.now() - startedAt < TOTAL_DEADLINE_MS) {
    await sleep(POLL_MS);
    const { data: st, error: stError } = await supabase.rpc('fn_ai_job_status', {
      p_job_id: jobId,
    });
    if (stError || !st || typeof st.status !== 'string') continue;
    if (st.status === 'done') {
      picked = extractPick((st as { result?: unknown }).result, allowlistIds);
      break;
    }
    if (st.status === 'error' || st.status === 'canceled' || st.status === 'not_found') {
      throw new Error(`[attention-bar] Max-lane job ${st.status}`);
    }
    // Never claimed within the unclaimed window → the drain is offline.
    if (st.status === 'pending' && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
      throw new Error('[attention-bar] Max-lane drain offline (job never claimed)');
    }
  }

  if (!picked || !picked.action_id) {
    throw new Error('[attention-bar] Max-lane job did not return a usable action_id');
  }

  return {
    action_id: picked.action_id,
    reason: picked.reason,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    },
    model: typeof enq?.job_type === 'string' ? enq.job_type : JOB_TYPE,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test seams — exposed for the smoke gate to inject a stubbed picker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test-only no-op — retained for API compatibility with earlier callers of
 * the singleton-SDK seam. There is no in-process client to reset now that the
 * pick runs on the Max lane.
 */
export function _resetAnthropicClient(): void {
  /* no-op — kept for backward-compatible test seams */
}

/**
 * Test seam — replace the pick call with a stub.
 *
 * The smoke gate calls this to verify allowlist enforcement WITHOUT enqueuing
 * a real job. Production code never invokes this. Pass `null` to clear.
 */
let _stub: ((input: PickActionInput) => Promise<PickActionResult>) | null = null;

export function _setLLMStub(
  stub: ((input: PickActionInput) => Promise<PickActionResult>) | null,
): void {
  _stub = stub;
}

/** Internal: call either the stub (if set) or the real Max-lane pick. */
export async function callLLM(input: PickActionInput): Promise<PickActionResult> {
  if (_stub) return _stub(input);
  return pickActionViaLLM(input);
}

/** Re-exports for layer-4.ts. */
export type { AllowlistEntry, UserPromptInput };
