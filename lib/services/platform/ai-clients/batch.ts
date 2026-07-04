// lib/services/platform/ai-clients/batch.ts
// ============================================================================
// Generic async Anthropic Message Batches lane — 50%-discount for batch-tolerant
// crons, done the way the API is meant to be used: SUBMIT in one run, COLLECT in
// a later run. No blocking poll, no cancel-on-timeout, no lost/re-billed work.
//
// WHY async (vs the old runMessageBatch): a Message Batch has NO latency SLA
// ("up to 24h, most under an hour"). Blocking a serverless function on it and
// cancelling at a wall-clock deadline (a) regressed throughput and (b) discarded
// requests Anthropic had already completed + billed → lost results + re-bill.
// Instead we persist the batch (ai_batch_jobs + ai_batch_job_items) at submit,
// and a later collect run drains ENDED batches, records each request in
// ai_model_usage at 50% (idempotently), and hands results back to the caller.
//
// State + correctness live in SQL (migration 20260704093000_ai_batch_jobs.sql):
//   • fn_ai_batch_record_submission — job + items in one tx.
//   • fn_ai_batch_claim_for_collection — atomic claim + crash-recovery lease.
//   • fn_ai_batch_settle_item — idempotent ledger write + mark (EXACTLY one
//     ai_model_usage row per request across crash/retry).
//   • the item dedupe_key (under a 'submitted'/'collecting' job) = the in-flight
//     guard: a candidate whose batch is outstanding is never re-submitted.
//
// This module is domain-agnostic: it owns Anthropic I/O + the 50% ledger + the
// job lifecycle. Domain recording (writing a suggestion, resolving a concern)
// and any judge→gen chaining stay in the CALLER's collect handler.
//
// SDK: @anthropic-ai/sdk ^0.68 — client.messages.batches.create/retrieve/
// results/cancel. results() are retained ~29 days, so cross-run collection works.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { computeChatCostInr } from './chat';
import { createServiceRoleClient } from '@/lib/supabase/server';

// The Message Batches API bills tokens at 50% of standard automatically. The
// pricing registry stores STANDARD rates, so ledger rows halve the figure.
const BATCH_COST_MULTIPLIER = 0.5;
const DEFAULT_LEASE_SECONDS = 600; // reclaim a job whose collector crashed
const DEFAULT_MAX_JOBS = 50;
const DEFAULT_EXPIRY_GRACE_MS = 60_000;

// ── Submit types ────────────────────────────────────────────────────────────
/** One request queued for a batch. `context` is persisted verbatim and handed
 *  back at collect so the caller can record the result; `dedupeKey` powers the
 *  in-flight guard (skip re-submitting a candidate whose batch is outstanding). */
export interface SubmitBatchRequest {
  customId: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
  context: Record<string, unknown>;
  dedupeKey?: string | null;
}
export interface SubmitBatchResult {
  jobId: string;
  batchId: string;
  requestCount: number;
}

// ── Collect types ───────────────────────────────────────────────────────────
export interface CollectedItem {
  customId: string;
  context: Record<string, unknown>;
  /** The Message when resultType === 'succeeded', else null. */
  message: Anthropic.Message | null;
  resultType: 'succeeded' | 'errored' | 'canceled' | 'expired';
  errorMessage?: string;
}
export interface CollectedJob {
  jobId: string;
  phase: string;
  batchId: string;
  items: CollectedItem[];
}

interface JobRow {
  id: string;
  feature_key: string;
  phase: string;
  anthropic_batch_id: string;
  model_id: string;
  expires_at: string | null;
}
interface ItemRow {
  id: string;
  custom_id: string;
  context: Record<string, unknown> | null;
  result_status: string | null;
}

function anthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey });
}

// ============================================================================
// submitBatch — create ONE Anthropic batch, persist job+items, return handles.
// Returns null for an empty request list. THROWS on Anthropic submit failure
// (nothing persisted, nothing billed). If create succeeds but persist fails,
// the just-created batch is cancelled (best-effort) so no untracked billable
// batch is left running, then the error rethrows.
// ============================================================================
export async function submitBatch(args: {
  featureKey: string;
  phase: string;
  modelId: string;
  requests: SubmitBatchRequest[];
}): Promise<SubmitBatchResult | null> {
  const { featureKey, phase, modelId, requests } = args;
  if (!requests || requests.length === 0) return null;

  const anthropic = anthropicClient();

  // 1) Submit — throws on failure (nothing billed).
  const created = await anthropic.messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.customId, params: r.params })),
  });
  const batchId = created.id;
  const expiresAt = (created as { expires_at?: string }).expires_at ?? null;

  // 2) Persist job + items in one tx.
  try {
    const admin = createServiceRoleClient();
    const items = requests.map((r) => ({
      custom_id: r.customId,
      context: r.context ?? {},
      dedupe_key: r.dedupeKey ?? null,
    }));
    const { data, error } = await admin.rpc('fn_ai_batch_record_submission', {
      p_feature_key: featureKey,
      p_phase: phase,
      p_anthropic_batch_id: batchId,
      p_model_id: modelId,
      p_expires_at: expiresAt,
      p_items: items,
    });
    if (error) throw new Error(`fn_ai_batch_record_submission: ${error.message}`);
    return { jobId: data as unknown as string, batchId, requestCount: requests.length };
  } catch (persistErr) {
    // Best-effort cancel so we don't leave a billable batch untracked.
    try {
      await anthropic.messages.batches.cancel(batchId);
    } catch {
      /* ignore — the batch will auto-expire in 24h; nothing tracked to re-bill */
    }
    console.error(
      `[ai-batch] submit persist failed for feature=${featureKey} batch=${batchId} — cancelled:`,
      persistErr instanceof Error ? persistErr.message : persistErr,
    );
    throw persistErr;
  }
}

// ============================================================================
// collectEndedBatches — claim outstanding jobs for this feature, and for every
// batch that has ENDED: stream results, settle each item idempotently at the 50%
// rate, and return the results (with their stored context) for the caller to
// domain-record. Does NOT mark jobs collected — the caller calls markJobCollected
// AFTER it has recorded every item (and submitted any follow-on batch), so a
// crash before that leaves the job re-drainable (all writes idempotent).
//   • not-yet-ended job → released back to 'submitted' (retry next tick).
//   • job stuck past expires_at+grace and not ended → marked 'expired'.
// ============================================================================
export async function collectEndedBatches(
  featureKey: string,
  opts?: { leaseSeconds?: number; maxJobs?: number; graceMs?: number },
): Promise<CollectedJob[]> {
  const admin = createServiceRoleClient();
  const anthropic = anthropicClient();
  const leaseSeconds = opts?.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const maxJobs = opts?.maxJobs ?? DEFAULT_MAX_JOBS;
  const graceMs = opts?.graceMs ?? DEFAULT_EXPIRY_GRACE_MS;

  const { data: claimed, error: claimErr } = await admin.rpc('fn_ai_batch_claim_for_collection', {
    p_feature_key: featureKey,
    p_lease_seconds: leaseSeconds,
    p_max_jobs: maxJobs,
  });
  if (claimErr) throw new Error(`fn_ai_batch_claim_for_collection: ${claimErr.message}`);
  const jobs = (claimed ?? []) as JobRow[];
  if (jobs.length === 0) return [];

  const out: CollectedJob[] = [];

  for (const job of jobs) {
    try {
      const status = await anthropic.messages.batches.retrieve(job.anthropic_batch_id);

      if (status.processing_status !== 'ended') {
        const expiredPast =
          job.expires_at != null && Date.parse(job.expires_at) + graceMs < Date.now();
        if (expiredPast) {
          await admin.rpc('fn_ai_batch_mark_expired', { p_job_id: job.id, p_status: 'expired' });
        } else {
          await admin.rpc('fn_ai_batch_release_job', { p_job_id: job.id });
        }
        continue;
      }

      // Ended → load item rows (ids + context) to match results and settle.
      const { data: itemData, error: itemErr } = await admin
        .from('ai_batch_job_items')
        .select('id, custom_id, context, result_status')
        .eq('job_id', job.id);
      if (itemErr) throw new Error(`load items: ${itemErr.message}`);
      const byCustomId = new Map<string, ItemRow>();
      for (const it of (itemData ?? []) as ItemRow[]) byCustomId.set(it.custom_id, it);

      // Ledger duration = whole-batch wall-clock (per-item timing isn't exposed).
      const durationMs =
        status.ended_at && status.created_at
          ? Math.max(0, Date.parse(status.ended_at) - Date.parse(status.created_at))
          : null;

      const items: CollectedItem[] = [];
      for await (const entry of await anthropic.messages.batches.results(job.anthropic_batch_id)) {
        const row = byCustomId.get(entry.custom_id);
        if (!row) continue; // unknown custom_id — nothing to record against

        if (entry.result.type === 'succeeded') {
          const message = entry.result.message;
          const inTok = message.usage?.input_tokens ?? null;
          const outTok = message.usage?.output_tokens ?? null;
          const standardCost = computeChatCostInr(job.model_id, inTok, outTok);
          const costInr =
            standardCost != null ? Number((standardCost * BATCH_COST_MULTIPLIER).toFixed(6)) : null;
          await admin.rpc('fn_ai_batch_settle_item', {
            p_item_id: row.id,
            p_result_status: 'succeeded',
            p_feature_key: featureKey,
            p_provider: 'anthropic',
            p_model_id: job.model_id,
            p_input_tokens: inTok,
            p_output_tokens: outTok,
            p_cost_inr: costInr,
            p_duration_ms: durationMs,
            p_success: true,
            p_error: null,
          });
          items.push({
            customId: entry.custom_id,
            context: row.context ?? {},
            message,
            resultType: 'succeeded',
          });
        } else {
          const rt = entry.result.type as 'errored' | 'canceled' | 'expired';
          const errorMessage =
            rt === 'errored'
              ? JSON.stringify((entry.result as { error?: unknown }).error).slice(0, 500)
              : `batch request ${rt}`;
          await admin.rpc('fn_ai_batch_settle_item', {
            p_item_id: row.id,
            p_result_status: rt,
            p_feature_key: featureKey,
            p_provider: 'anthropic',
            p_model_id: job.model_id,
            p_input_tokens: null,
            p_output_tokens: null,
            p_cost_inr: null,
            p_duration_ms: durationMs,
            p_success: false,
            p_error: errorMessage,
          });
          items.push({
            customId: entry.custom_id,
            context: row.context ?? {},
            message: null,
            resultType: rt,
            errorMessage,
          });
        }
      }

      out.push({
        jobId: job.id,
        phase: job.phase,
        batchId: job.anthropic_batch_id,
        items,
      });
    } catch (err) {
      // Leave the job for the lease to re-admit; release it so it retries
      // promptly rather than waiting the whole lease. Cost + domain writes are
      // idempotent, so re-collection is safe.
      console.error(
        `[ai-batch] collect failed for job ${job.id} (${job.anthropic_batch_id}):`,
        err instanceof Error ? err.message : err,
      );
      try {
        await admin.rpc('fn_ai_batch_release_job', { p_job_id: job.id });
      } catch {
        /* ignore — lease will reclaim it */
      }
    }
  }

  return out;
}

// ============================================================================
// markJobCollected — caller invokes AFTER it has domain-recorded every item of a
// job and submitted any follow-on (chained) batch. Terminal transition.
// ============================================================================
export async function markJobCollected(jobId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc('fn_ai_batch_mark_collected', { p_job_id: jobId });
  if (error) throw new Error(`fn_ai_batch_mark_collected: ${error.message}`);
}

// ============================================================================
// partitionInFlight — of the given candidate dedupeKeys, which are already
// attached to an outstanding ('submitted'/'collecting') job for this feature?
// Callers skip those candidates so a batch is never re-submitted (no re-bill).
// ============================================================================
export async function partitionInFlight(
  featureKey: string,
  dedupeKeys: string[],
): Promise<Set<string>> {
  const keys = dedupeKeys.filter((k): k is string => !!k);
  if (keys.length === 0) return new Set();
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc('fn_ai_batch_inflight_keys', {
    p_feature_key: featureKey,
    p_dedupe_keys: keys,
  });
  if (error) throw new Error(`fn_ai_batch_inflight_keys: ${error.message}`);
  const set = new Set<string>();
  for (const row of (data ?? []) as unknown[]) {
    if (typeof row === 'string') set.add(row);
    else if (row && typeof row === 'object') {
      const v = (row as Record<string, unknown>).fn_ai_batch_inflight_keys;
      if (typeof v === 'string') set.add(v);
    }
  }
  return set;
}
