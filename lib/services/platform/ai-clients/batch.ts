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
// Per-call timeout for every Anthropic request so a hung call can't consume the
// whole serverless maxDuration (and can't let a reservation age past the sweep).
const ANTHROPIC_TIMEOUT_MS = 30_000;
// Results are a JSONL stream (can be larger than a single request), so a longer bound.
const RESULTS_STREAM_TIMEOUT_MS = 60_000;
/** After this many ENDED-claim collect failures (record error or stream timeout),
 *  a job is marked terminal 'failed' so a persistent failure can't re-drain forever
 *  (which would freeze the course — the in-flight guard blocks on job status). */
export const MAX_COLLECT_ATTEMPTS = 6;
const DEFAULT_MAX_JOBS = 50;
// (Past-expiry termination is a path-independent age-backstop in the claim RPC,
//  fn_ai_batch_claim_for_collection — not a per-call timeout here.)

// ── Submit types ────────────────────────────────────────────────────────────
/** One request queued for a batch. `context` is persisted verbatim and handed
 *  back at collect so the caller can record the result; `dedupeKey` powers the
 *  in-flight guard (skip re-submitting a candidate whose batch is outstanding). */
export interface SubmitBatchRequest {
  customId: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
  context: Record<string, unknown>;
  /** In-flight guard key. The uniqueness index is (feature_key, dedupe_key), so
   *  dedupe_key MUST be globally unique WITHIN a feature — for a multi-tenant
   *  feature, embed the tenant/institution id in the key (as scf does:
   *  `feature|phase|institution_id|course|faculty`) so one tenant's request is
   *  never skipped as an in-flight "duplicate" of another tenant's. */
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
  /** How many times this job has been claimed for collection — lets the caller
   *  cap re-drains and mark a persistently-unrecordable job terminal. */
  collectAttempts: number;
  items: CollectedItem[];
}

interface JobRow {
  id: string;
  feature_key: string;
  phase: string;
  anthropic_batch_id: string;
  model_id: string;
  expires_at: string | null;
  submitted_at: string;
  request_count: number;
  collect_attempts: number;
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

  const admin = createServiceRoleClient();

  // Phase 1: RESERVE — persist a 'pending' job + items, CLAIMING the dedupe keys
  // (via the partial unique index) BEFORE any billable batch exists. Per-item
  // ON CONFLICT skips items already in-flight, so a concurrent duplicate is
  // rejected here — not after a batch has already been created and billed.
  const { data: resData, error: resErr } = await admin.rpc('fn_ai_batch_reserve', {
    p_feature_key: featureKey,
    p_phase: phase,
    p_model_id: modelId,
    p_items: requests.map((r) => ({
      custom_id: r.customId,
      context: r.context ?? {},
      dedupe_key: r.dedupeKey ?? null,
    })),
  });
  if (resErr) throw new Error(`fn_ai_batch_reserve: ${resErr.message}`);
  const reserved = (Array.isArray(resData) ? resData[0] : resData) as
    | { job_id: string; reserved_custom_ids: string[] }
    | null;
  if (!reserved?.job_id) throw new Error('fn_ai_batch_reserve returned no job');
  const jobId = reserved.job_id;
  const reservedSet = new Set(reserved.reserved_custom_ids ?? []);
  const toSubmit = requests.filter((r) => reservedSet.has(r.customId));

  if (toSubmit.length === 0) {
    // Every candidate was already in-flight — release the empty reservation.
    // Nothing was created at Anthropic, so nothing is billed.
    await admin.rpc('fn_ai_batch_abort_reservation', { p_job_id: jobId });
    return null;
  }

  // Phase 2: CREATE the Anthropic batch for the reserved subset only.
  const anthropic = anthropicClient();
  let batchId: string;
  let expiresAt: string | null;
  try {
    const created = await anthropic.messages.batches.create(
      { requests: toSubmit.map((r) => ({ custom_id: r.customId, params: r.params })) },
      { timeout: ANTHROPIC_TIMEOUT_MS },
    );
    batchId = created.id;
    expiresAt = (created as { expires_at?: string }).expires_at ?? null;
  } catch (createErr) {
    // create() failed or TIMED OUT. On a plain failure nothing was billed. On a
    // client-side TIMEOUT the batch may have been created server-side after we gave
    // up — and we have no batchId to cancel, so we can't reclaim it (irreducible
    // without an Anthropic client-side idempotency key). Log it LOUDLY so an
    // orphaned billable batch is visible to ops, then free the reservation keys
    // (course must not freeze) and rethrow. Any orphan auto-expires at Anthropic
    // in 24h. Known residual — see PR description.
    console.error(
      `[ai-batch] batches.create failed/timed-out feature=${featureKey} — POTENTIAL ORPHANED BATCH (no id to cancel; auto-expires 24h):`,
      createErr instanceof Error ? createErr.message : createErr,
    );
    await admin.rpc('fn_ai_batch_abort_reservation', { p_job_id: jobId });
    throw createErr;
  }

  // Phase 3: ACTIVATE — attach the real batch id, flip 'pending' → 'submitted'.
  // activate RETURNS false if it matched 0 rows (the reservation was already swept
  // or aborted between reserve and here). In that case the batch exists + is
  // billable but no longer tracked, so we MUST cancel it and fail — never return
  // success on an orphaned batch.
  const { data: activated, error: actErr } = await admin.rpc('fn_ai_batch_activate', {
    p_job_id: jobId,
    p_anthropic_batch_id: batchId,
    p_expires_at: expiresAt,
    p_request_count: toSubmit.length,
  });
  if (actErr || activated !== true) {
    try {
      await anthropic.messages.batches.cancel(batchId, { timeout: ANTHROPIC_TIMEOUT_MS });
    } catch {
      /* ignore — auto-expires in 24h */
    }
    await admin.rpc('fn_ai_batch_abort_reservation', { p_job_id: jobId });
    throw new Error(
      actErr
        ? `fn_ai_batch_activate: ${actErr.message}`
        : `fn_ai_batch_activate matched 0 rows (reservation gone) — batch ${batchId} cancelled`,
    );
  }

  return { jobId, batchId, requestCount: toSubmit.length };
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
  opts?: { leaseSeconds?: number; maxJobs?: number },
): Promise<CollectedJob[]> {
  const admin = createServiceRoleClient();
  const anthropic = anthropicClient();
  const leaseSeconds = opts?.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const maxJobs = opts?.maxJobs ?? DEFAULT_MAX_JOBS;

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
    // Retrieve status in its OWN try: a transport error here (timeout on a batch
    // that may still be PROCESSING and not yet billed-final) is poll-like — release
    // + decrement and retry next tick, NOT a cap-counting failure. Only failures
    // AFTER we confirm 'ended' count toward MAX_COLLECT_ATTEMPTS.
    let status: Awaited<ReturnType<typeof anthropic.messages.batches.retrieve>>;
    try {
      status = await anthropic.messages.batches.retrieve(job.anthropic_batch_id, {
        timeout: ANTHROPIC_TIMEOUT_MS,
      });
    } catch (retrieveErr) {
      // Transport error (timeout / transient 5xx / gone) — poll-like: release +
      // decrement so a still-PROCESSING batch's transient failures don't inflate
      // collect_attempts toward the ENDED-only cap and trip a later legit collect.
      // RECONCILES deep-review rounds 5 & 6 (which contradict on this exact line):
      //   • r6: must decrement here, else cap-inflation abandons a billed batch → this release.
      //   • r5: if it only ever decrements it never terminates → freeze → handled NOT here
      //     but by the path-independent age-backstop in fn_ai_batch_claim_for_collection,
      //     which marks any job past expiry+2h terminal + frees its keys regardless of
      //     failure mode. So a PERMANENT retrieve failure can't freeze the course, AND
      //     transient ones don't burn the cap. Do not "fix" this by removing the release.
      console.warn(
        `[ai-batch] retrieve failed for job ${job.id} (${job.anthropic_batch_id}) — releasing (backstop bounds permanent failure):`,
        retrieveErr instanceof Error ? retrieveErr.message : retrieveErr,
      );
      try {
        await admin.rpc('fn_ai_batch_release_job', { p_job_id: job.id });
      } catch {
        /* lease will reclaim */
      }
      continue;
    }

    if (status.processing_status !== 'ended') {
      // Still processing — release for a prompt re-check next tick (decrements
      // collect_attempts; this poll wasn't a productive collect). Past-expiry
      // termination is handled uniformly by the claim's age-backstop.
      await admin.rpc('fn_ai_batch_release_job', { p_job_id: job.id });
      continue;
    }

    // ENDED — everything below counts toward the cap on failure.
    try {
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
      const settledIds = new Set<string>();
      for await (const entry of await anthropic.messages.batches.results(job.anthropic_batch_id, {
        timeout: RESULTS_STREAM_TIMEOUT_MS,
      })) {
        const row = byCustomId.get(entry.custom_id);
        if (!row) continue; // unknown custom_id — nothing to record against
        settledIds.add(entry.custom_id);

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

      // Reconcile: any persisted item ABSENT from the results stream (Anthropic
      // guarantees one result per request, so near-unreachable) would otherwise
      // stay result_status=NULL and keep its dedupe_key in-flight forever, silently
      // blocking the course. Settle such items 'errored' (no cost) so the key frees.
      for (const it of (itemData ?? []) as ItemRow[]) {
        if (it.result_status === null && !settledIds.has(it.custom_id)) {
          console.error(
            `[ai-batch] job ${job.id} item ${it.custom_id} absent from results stream — settling 'errored'`,
          );
          await admin.rpc('fn_ai_batch_settle_item', {
            p_item_id: it.id,
            p_result_status: 'errored',
            p_feature_key: featureKey,
            p_provider: 'anthropic',
            p_model_id: job.model_id,
            p_input_tokens: null,
            p_output_tokens: null,
            p_cost_inr: null,
            p_duration_ms: null,
            p_success: false,
            p_error: 'absent from results stream',
          });
        }
      }

      out.push({
        jobId: job.id,
        phase: job.phase,
        batchId: job.anthropic_batch_id,
        collectAttempts: job.collect_attempts,
        items,
      });
    } catch (err) {
      console.error(
        `[ai-batch] collect failed for job ${job.id} (${job.anthropic_batch_id}):`,
        err instanceof Error ? err.message : err,
      );
      // A collect error (retrieve/results timeout, settle error) on an ended-ish
      // batch counts toward the cap — do NOT release+decrement (that nets to zero
      // and a persistent failure would re-drain forever, freezing the course).
      // After the cap, mark terminal 'failed'; otherwise leave it 'collecting' and
      // let the lease re-admit it (no decrement, so the attempt is counted).
      if (job.collect_attempts >= MAX_COLLECT_ATTEMPTS) {
        try {
          await admin.rpc('fn_ai_batch_mark_expired', { p_job_id: job.id, p_status: 'failed' });
        } catch {
          /* ignore — lease will reclaim */
        }
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
