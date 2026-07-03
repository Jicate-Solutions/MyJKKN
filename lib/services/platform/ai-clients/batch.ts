// lib/services/platform/ai-clients/batch.ts
// ============================================================================
// Shared Anthropic Message Batches helper — 50%-discount lane for nightly crons.
//
// WHY: batch-tolerant crons (nightly generators that loop N sequential
// messages.create calls) pay full per-token price for latency they don't
// need. The Message Batches API processes the same requests asynchronously
// at a 50% token discount (automatic — no special pricing param). This
// helper is the ONE place that submits a batch, polls it to completion,
// collects per-request results by custom_id, and records every request in
// the ai_model_usage ledger (at the discounted cost).
//
// SDK compatibility: written against @anthropic-ai/sdk ^0.68.0 (package.json
// pin; 0.68.0 installed), which ships client.messages.batches.create /
// .retrieve / .cancel / .results — verified against the installed
// resources/messages/batches.d.ts.
//
// Usage (typical nightly cron):
//   const { model_id } = await resolveChatModel(FEATURE_KEY);
//   const batch = await runMessageBatch(FEATURE_KEY, model_id, [
//     { customId: 'course-A', params: { model: model_id, max_tokens: 1024, system, messages } },
//     { customId: 'course-B', params: { ... } },
//   ], { deadlineMs: 200_000 });
//   for (const [customId, item] of batch.results) { ... }
//
// GUARANTEES:
//   - Usage recording is internally non-throwing and AWAITED (Vercel
//     serverless drops un-awaited promises) — same discipline as chat.ts.
//   - Every request that reaches an ended batch gets exactly one ledger row:
//     success:true with cost_inr at the 50% batch rate for succeeded items,
//     success:false for errored / canceled / expired items.
//   - Submission errors THROW (callers keep their own error handling).
//   - A batch that does not end within deadlineMs is cancelled (in-progress
//     requests are non-billable when cancelled before completion); if the
//     cancel settles in time, already-succeeded items are still collected
//     and recorded. `timedOut: true` signals a partial/empty result set —
//     callers must treat missing customIds as "not attempted" (safe to
//     retry next run when their regen guards find nothing recorded).
//
// LIMITS (API): up to 100,000 requests / 256 MB per batch. Most batches
// finish well under an hour; the API allows up to 24h, so serverless
// callers MUST pass a deadlineMs that fits their maxDuration budget.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '@/lib/services/platform/ai-model-config-service';
import { computeChatCostInr } from './chat';

/** One request in the batch. `params` is the exact Messages API body the
 *  call site would have passed to messages.create — model included. */
export interface BatchChatRequest {
  /** Unique within the batch; results are matched back by this id. */
  customId: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
}

export interface BatchChatItemResult {
  customId: string;
  /** The full Message when resultType === 'succeeded', else null. */
  message: Anthropic.Message | null;
  resultType: 'succeeded' | 'errored' | 'canceled' | 'expired';
  /** Error detail for 'errored' items (API error message). */
  errorMessage?: string;
}

export interface RunMessageBatchResult {
  batchId: string;
  /** True when the batch reached processing_status 'ended' and results were collected. */
  ended: boolean;
  /** True when deadlineMs elapsed first — results may be partial or empty. */
  timedOut: boolean;
  /** Per-request outcomes keyed by customId. Missing key = never processed
   *  (timed-out batch) — treat as not-attempted and let the caller retry. */
  results: Map<string, BatchChatItemResult>;
  elapsedMs: number;
}

export interface RunMessageBatchOptions {
  /** Poll interval while waiting for the batch to end. Default 10_000 ms. */
  pollIntervalMs?: number;
  /** Wall-clock budget for the whole submit→ended wait. Default 240_000 ms.
   *  Serverless callers must leave headroom under their maxDuration. */
  deadlineMs?: number;
}

// The Message Batches API bills tokens at 50% of the standard rate —
// automatically, for every request processed via a batch. The pricing
// registry stores STANDARD per-1K rates, so ledger rows halve the computed
// figure to match what Anthropic actually bills.
const BATCH_COST_MULTIPLIER = 0.5;

// After the deadline forces a cancel, wait at most this long for the batch
// to settle to 'ended' so already-succeeded items can still be collected.
const CANCEL_SETTLE_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit one Message Batch, wait for it to end (bounded by deadlineMs),
 * collect per-request results, and record every processed request in
 * ai_model_usage at the 50% batch rate.
 *
 * @param featureKey ai_model_config feature key for the ledger rows
 * @param modelId    resolved model id (used for ledger rows; each request's
 *                   params.model is what the API actually honors)
 * @param requests   the batch — customIds must be unique
 */
export async function runMessageBatch(
  featureKey: string,
  modelId: string,
  requests: BatchChatRequest[],
  opts?: RunMessageBatchOptions,
): Promise<RunMessageBatchResult> {
  const pollIntervalMs = opts?.pollIntervalMs ?? 10_000;
  const deadlineMs = opts?.deadlineMs ?? 240_000;

  if (requests.length === 0) {
    return { batchId: '', ended: true, timedOut: false, results: new Map(), elapsedMs: 0 };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const anthropic = new Anthropic({ apiKey });

  const startedAt = Date.now();

  // 1) Submit. Throws to the caller on failure (nothing was billed).
  const created = await anthropic.messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.customId, params: r.params })),
  });
  const batchId = created.id;

  // 2) Poll until ended or deadline. Transient retrieve errors are tolerated —
  //    the next tick retries; only the deadline stops the loop.
  let ended = created.processing_status === 'ended';
  let timedOut = false;
  while (!ended) {
    if (Date.now() - startedAt > deadlineMs) {
      timedOut = true;
      break;
    }
    await sleep(pollIntervalMs);
    try {
      const status = await anthropic.messages.batches.retrieve(batchId);
      ended = status.processing_status === 'ended';
    } catch (pollErr) {
      console.warn(
        `[ai-batch] feature_key=${featureKey} batch=${batchId} poll failed (will retry):`,
        pollErr instanceof Error ? pollErr.message : pollErr,
      );
    }
  }

  // 3) Deadline hit → cancel (in-progress requests are non-billable when
  //    cancelled before completion), then briefly wait for the terminal
  //    'ended' state so already-succeeded items can still be collected.
  if (timedOut) {
    console.error(
      `[ai-batch] feature_key=${featureKey} batch=${batchId} did not end within ${deadlineMs}ms — cancelling`,
    );
    try {
      await anthropic.messages.batches.cancel(batchId);
      const settleStart = Date.now();
      while (!ended && Date.now() - settleStart < CANCEL_SETTLE_MS) {
        await sleep(2_000);
        const status = await anthropic.messages.batches.retrieve(batchId);
        ended = status.processing_status === 'ended';
      }
    } catch (cancelErr) {
      console.error(
        `[ai-batch] feature_key=${featureKey} batch=${batchId} cancel/settle failed:`,
        cancelErr instanceof Error ? cancelErr.message : cancelErr,
      );
    }
  }

  const results = new Map<string, BatchChatItemResult>();

  if (!ended) {
    // Nothing collectable. Callers see timedOut=true and an empty map; their
    // own guards make the next run retry (nothing was recorded as done).
    return { batchId, ended: false, timedOut, results, elapsedMs: Date.now() - startedAt };
  }

  // 4) Collect + record. Results stream as JSONL, matched by custom_id.
  //    duration_ms per row is the whole batch's wall-clock (per-item timing
  //    is not exposed by the API) — fine for a nightly ledger.
  const elapsedAtCollect = Date.now() - startedAt;
  for await (const entry of await anthropic.messages.batches.results(batchId)) {
    if (entry.result.type === 'succeeded') {
      const message = entry.result.message;
      const inputTokens = message.usage?.input_tokens;
      const outputTokens = message.usage?.output_tokens;
      const standardCost = computeChatCostInr(
        modelId,
        inputTokens ?? null,
        outputTokens ?? null,
      );
      // recordUsage is internally non-throwing; awaited by the same rule as chat.ts.
      await recordUsage(featureKey, 'anthropic', modelId, {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_inr:
          standardCost != null
            ? Number((standardCost * BATCH_COST_MULTIPLIER).toFixed(6))
            : undefined,
        duration_ms: elapsedAtCollect,
        success: true,
      });
      results.set(entry.custom_id, {
        customId: entry.custom_id,
        message,
        resultType: 'succeeded',
      });
    } else {
      const errorMessage =
        entry.result.type === 'errored'
          ? JSON.stringify(entry.result.error).slice(0, 500)
          : `batch request ${entry.result.type}`;
      await recordUsage(featureKey, 'anthropic', modelId, {
        duration_ms: elapsedAtCollect,
        success: false,
        error_message: errorMessage,
      });
      results.set(entry.custom_id, {
        customId: entry.custom_id,
        message: null,
        resultType: entry.result.type,
        errorMessage,
      });
    }
  }

  return { batchId, ended: true, timedOut, results, elapsedMs: Date.now() - startedAt };
}
