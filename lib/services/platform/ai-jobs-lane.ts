// lib/services/platform/ai-jobs-lane.ts
// ============================================================================
// ₹0 loop-generator lane — cron-side enqueue + collect for the #1998 ai_jobs
// registry (the Claude Max lane, drained by the generic Windows seat runner).
//
// A loop cron currently calls Anthropic directly (paid) on its fallback path
// (the path taken when shouldDeferToMaxLane is false). This module lets the
// cron instead ENQUEUE the same generation as an ai_job (₹0) and COLLECT the
// drain's result later, recording the SAME artefact via the SAME domain fn —
// so the effect (rows/columns written) is byte-identical to the paid path.
//
// WHY not fn_ai_enqueue: that RPC hard-requires auth.uid() (a logged-in user);
// a cron has none. fn_ai_enqueue_system (service-role, migration
// 20260713140000) resolves requested_by from the seat-owner allowlist instead.
//
// Contract mirrors the #2016 CDC route: the seeded job type carries a glue
// prompt_template ({{prompt}}); the cron passes the FULL assembled prompt as
// payload.prompt, stashes its record context in payload._ctx, and the drain
// returns the model text in ai_jobs.result ({ answer } / raw text).
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import type Anthropic from '@anthropic-ai/sdk';

type Admin = ReturnType<typeof createServiceRoleClient>;

export type JobsLaneEnqueueResult =
  | { ok: true; jobId: string }
  | { ok: false; reason: 'in_flight' | 'unknown_type' | 'no_seat' | 'error'; error?: string };

/**
 * Enqueue ONE loop-generation job on the ₹0 Max lane from a cron (service-role,
 * no auth.uid). `prompt` is the FULL prompt the direct path would have sent;
 * `context` is stashed in payload._ctx for the collect sweep; `dedupeKey` is the
 * in-flight guard (the SAME key the paid path passes to partitionInFlight), so a
 * candidate already queued/claimed/running is not re-enqueued — that returns
 * { ok:false, reason:'in_flight' }, which the caller treats as "already handled".
 *
 * `payloadExtra` (optional) is merged into the payload top-level for the drain to
 * read directly — e.g. `{ _model_override: { provider, model_id } }` to pin the
 * model a specific run uses (honored by fn_ai_claim). Omitting it leaves the
 * payload byte-identical to before, so existing callers are unchanged.
 */
export async function enqueueJobsLane(
  admin: Admin,
  args: {
    jobType: string;
    prompt: string;
    context: Record<string, unknown>;
    dedupeKey: string;
    payloadExtra?: Record<string, unknown>;
  },
): Promise<JobsLaneEnqueueResult> {
  const { data, error } = await admin.rpc('fn_ai_enqueue_system', {
    p_job_type: args.jobType,
    p_payload: { prompt: args.prompt, _ctx: args.context, ...(args.payloadExtra ?? {}) },
    p_dedupe_key: args.dedupeKey,
  });
  if (error) return { ok: false, reason: 'error', error: error.message };
  const r = data as { ok?: boolean; job_id?: string; error?: string } | null;
  if (r?.ok && typeof r.job_id === 'string') return { ok: true, jobId: r.job_id };
  const e = r?.error ?? 'error';
  if (e === 'in_flight') return { ok: false, reason: 'in_flight' };
  if (e === 'unknown or disabled job_type') return { ok: false, reason: 'unknown_type', error: e };
  if (e === 'no seat owner configured') return { ok: false, reason: 'no_seat', error: e };
  return { ok: false, reason: 'error', error: e };
}

export interface CollectedJobsLaneItem {
  jobId: string;
  context: Record<string, unknown>;
  /**
   * The drain's text wrapped in a minimal Anthropic.Message, so a cron's
   * existing parse fn (which takes Anthropic.Message) works unchanged. null when
   * the drain produced no usable text (parse then skips, candidate re-qualifies).
   */
  message: Anthropic.Message | null;
  /** The ai_jobs.job_type — lets a multi-type collector (e.g. scf judge vs
   *  generate) dispatch each item to the right parse/record path. */
  jobType: string;
}

/**
 * Read the model's answer text out of the drain's result jsonb. Mirrors the
 * #2016 CDC extractor: the generic runner returns { answer }; a few plausible
 * shapes are tolerated so a completed result never falls silently to null.
 */
export function extractJobResultText(result: unknown): string | null {
  if (typeof result === 'string') return result.trim() || null;
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const k of ['answer', 'text', 'result', 'output']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

/** Wrap raw text in the minimal Anthropic.Message shape a parse fn reads
 *  (content[].type==='text' → .text). Cast through unknown: only content is
 *  load-bearing, so we don't fabricate a full usage/id surface. */
function textToMessage(text: string): Anthropic.Message {
  return {
    id: 'maxlane',
    type: 'message',
    role: 'assistant',
    model: 'max-lane',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
  } as unknown as Anthropic.Message;
}

/**
 * Claim done + not-yet-delivered jobs for these types (exactly-once, via
 * fn_ai_collect_claim's FOR UPDATE SKIP LOCKED + delivered_at stamp) and return
 * each with its stashed context + a synthesized message. Reading a completed
 * result and recording it is the caller's job (byte-parity stays in app code).
 */
export async function collectJobsLane(
  admin: Admin,
  jobTypes: string[],
  limit = 50,
): Promise<CollectedJobsLaneItem[]> {
  const { data, error } = await admin.rpc('fn_ai_collect_claim', {
    p_job_types: jobTypes,
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) {
    if (error) console.error('[ai-jobs-lane] collect claim failed:', error.message);
    return [];
  }
  return (data as Array<{ id: string; job_type: string; payload: Record<string, unknown> | null; result: unknown }>).map(
    (row) => {
      const ctx = ((row.payload?._ctx as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const text = extractJobResultText(row.result);
      return { jobId: row.id, jobType: row.job_type, context: ctx, message: text ? textToMessage(text) : null };
    },
  );
}

/**
 * Bounded poll for specific enqueued jobs (by id) — for a SYNCHRONOUS caller that
 * must have the results within one request (e.g. an aggregate-then-apply weekly
 * digest). Returns a Map jobId→text for jobs that completed with usable text;
 * jobs that error, are still pending at the deadline, or produced no text are
 * ABSENT, so the caller falls back (e.g. to a template — graceful degradation).
 * Reads ai_jobs directly (service-role); the requester is the seat owner, not
 * auth.uid, so fn_ai_job_status (auth-scoped) does not apply. Keep deadlineMs
 * comfortably below the route's maxDuration.
 */
export async function awaitJobsLaneResults(
  admin: Admin,
  jobIds: string[],
  opts: { deadlineMs?: number; intervalMs?: number } = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (jobIds.length === 0) return out;
  const interval = opts.intervalMs ?? 2_500;
  const deadline = Date.now() + (opts.deadlineMs ?? 200_000);
  const pending = new Set(jobIds);
  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const { data, error } = await admin
      .from('ai_jobs')
      .select('id, status, result')
      .in('id', [...pending]);
    if (error || !Array.isArray(data)) continue;
    for (const row of data as Array<{ id: string; status: string; result: unknown }>) {
      if (row.status === 'done') {
        const text = extractJobResultText(row.result);
        if (text) out.set(row.id, text);
        pending.delete(row.id);
      } else if (row.status === 'error' || row.status === 'canceled') {
        pending.delete(row.id); // absent from the map → caller falls back
      }
    }
  }
  return out;
}
