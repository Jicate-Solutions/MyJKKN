// lib/services/onemark/draft-collect.ts
// ============================================================================
// OneMark AI drafts — the COLLECT pass (finished `onemark.item_draft` jobs →
// fp_items draft rows) plus a paid inline runner for one job.
//
// HOW A DRAFT JOB TRAVELS (the house ₹0 Max-lane pattern, lib/services/
// platform/ai-jobs-lane.ts; worked examples: metaloop-charter-collect.ts,
// app/api/cron/rcltp-question-generate):
//   1. POST /api/foundation/onemark/draft (Lane I) → fn_ai_enqueue → an
//      ai_jobs row on lane 'max' with the payload
//      {exam_definition_id, exam_key, topic_id, tag_keys, count, bloom_level}.
//   2. The seat runner drains lane 'max', renders the job type's
//      prompt_template and writes the model text to ai_jobs.result ({answer}).
//   3. THIS module, on the collect clock, claims each finished job exactly
//      once (fn_ai_collect_claim: status='done' AND delivered_at IS NULL, FOR
//      UPDATE SKIP LOCKED), validates every item against the draft contract,
//      inserts the survivors as fp_items rows with is_active=false and
//      source_key='internal', and records {inserted, rejected[]} back on the
//      job's result so the requesting Senior Learner's job status shows what
//      happened.
//
// WHY a collect pass and not the row's output_target='table:fp_items': read
// live 2026-09-04, none of the 67 job types uses a table:% target, so the seat
// runner's support for it is unproven — every table-writing job on main goes
// through a collect pass in app code (rcltp, metaloop, scf). This keeps the
// fp_items write under the same validation whichever path produced the text.
//
// fn_ai_collect_claim is called directly rather than through collectJobsLane
// because that helper returns only payload._ctx, and Lane I's payload carries
// its fields at the top level (the seat runner substitutes them into the
// template); requested_by is needed too, for created_by.
//
// CAPS: daily_cap_per_user is enforced by fn_ai_enqueue at queue time (IST
// day, per requester) — nothing to add here. monthly_spend_cap_inr is enforced
// on the PAID path by resolveChatModel (degrades the model once MTD spend
// crosses the cap; ai_model_config-service.ts); the ₹0 lane spends nothing.
//
// HARD INVARIANT: nothing here ever writes is_active=true. AI drafts, one
// subject Senior Learner approves (decision 7).
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { createServiceRoleClient } from '@/lib/supabase/server';
import { extractJobResultText } from '@/lib/services/platform/ai-jobs-lane';
import { claudeChatForFeature } from '@/lib/services/platform/ai-clients/chat';
import {
  ONEMARK_DRAFT_JOB_TYPE,
  normaliseStem,
  parseDraftOutput,
  parsePayload,
  validateBatch,
  type RejectedItem,
} from './draft-contract';

type Admin = ReturnType<typeof createServiceRoleClient>;

const COLLECT_BATCH = 25;
const BANK_SCAN_LIMIT = 5000;
const INLINE_RUNNER = 'inline:onemark-item-drafts';
const INLINE_MAX_TOKENS = 8000;

interface ClaimedJob {
  id: string;
  job_type: string;
  payload: unknown;
  result: unknown;
  requested_by: string | null;
}

/** What the job's result carries after filing — read by whoever shows the
 *  job's status. Never includes an answer letter. */
export interface FiledRecord {
  inserted: number;
  item_ids: string[];
  rejected: RejectedItem[];
  shortfall_reason: string | null;
  error: string | null;
  filed_at: string;
}

export interface FileOutcome {
  jobId: string;
  inserted: number;
  rejected: number;
  error: string | null;
}

export interface CollectSummary {
  collected: number;
  filed: number;
  items_written: number;
  items_rejected: number;
  errors: number;
  outcomes: FileOutcome[];
}

/** Normalised stems already in the bank for this exam — the duplicate guard.
 *  A read failure returns an empty set: never drop a result over a failed
 *  guard read (the review queue flags stem collisions anyway). */
async function existingStems(admin: Admin, examDefinitionId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('fp_items')
    .select('stem')
    .eq('exam_definition_id', examDefinitionId)
    .limit(BANK_SCAN_LIMIT);
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as Array<{ stem: string | null }>).map((r) => normaliseStem(r.stem ?? '')));
}

/** Merge the filing record into ai_jobs.result (service-role; the row is
 *  already done + delivered, so this is bookkeeping, not a state change). */
async function recordOnJob(admin: Admin, job: ClaimedJob, filed: FiledRecord): Promise<void> {
  const base =
    job.result && typeof job.result === 'object' && !Array.isArray(job.result)
      ? (job.result as Record<string, unknown>)
      : { answer: job.result };
  const { error } = await admin
    .from('ai_jobs')
    .update({ result: { ...base, onemark_filed: filed } })
    .eq('id', job.id);
  if (error) console.error(`[onemark-drafts] could not record filing on job ${job.id}:`, error.message);
}

/**
 * File ONE claimed job: parse → validate → insert drafts → record the outcome.
 * Never throws for a handled failure; the reason lands on the job.
 */
export async function fileDraftJob(admin: Admin, job: ClaimedJob): Promise<FileOutcome> {
  const filed: FiledRecord = {
    inserted: 0,
    item_ids: [],
    rejected: [],
    shortfall_reason: null,
    error: null,
    filed_at: new Date().toISOString(),
  };
  const fail = async (why: string): Promise<FileOutcome> => {
    filed.error = why;
    await recordOnJob(admin, job, filed);
    console.warn(`[onemark-drafts] job ${job.id}: ${why}`);
    return { jobId: job.id, inserted: 0, rejected: filed.rejected.length, error: why };
  };

  const payload = parsePayload(job.payload);
  if (!payload) return fail('payload does not match the onemark.item_draft input contract');

  const text = extractJobResultText(job.result);
  if (!text) return fail('the lane produced no usable text');

  const parsed = parseDraftOutput(text);
  if (!parsed.ok) return fail(parsed.why ?? 'unreadable model output');
  filed.shortfall_reason = parsed.shortfall_reason;

  const bank = await existingStems(admin, payload.exam_definition_id);
  const batch = validateBatch(parsed.items, payload, job.requested_by, bank);
  filed.rejected = batch.rejected;

  if (batch.rows.length === 0) {
    return fail(
      parsed.items.length === 0
        ? 'the model returned zero items'
        : 'every item failed the draft contract',
    );
  }

  const { data: inserted, error: insErr } = await admin
    .from('fp_items')
    .insert(batch.rows)
    .select('id');
  if (insErr) return fail(`fp_items insert failed: ${insErr.message}`);

  filed.inserted = Array.isArray(inserted) ? inserted.length : batch.rows.length;
  filed.item_ids = Array.isArray(inserted) ? (inserted as Array<{ id: string }>).map((r) => r.id) : [];
  await recordOnJob(admin, job, filed);
  return { jobId: job.id, inserted: filed.inserted, rejected: filed.rejected.length, error: null };
}

/**
 * Claim every finished-but-unfiled `onemark.item_draft` job (exactly once)
 * and file each one. Safe to run on any clock: a job is claimed by the
 * delivered_at stamp before it is read, so two overlapping runs never file
 * the same job twice.
 */
export async function collectItemDrafts(admin: Admin, limit = COLLECT_BATCH): Promise<CollectSummary> {
  const summary: CollectSummary = {
    collected: 0,
    filed: 0,
    items_written: 0,
    items_rejected: 0,
    errors: 0,
    outcomes: [],
  };
  const { data, error } = await admin.rpc('fn_ai_collect_claim', {
    p_job_types: [ONEMARK_DRAFT_JOB_TYPE],
    p_limit: limit,
  });
  if (error || !Array.isArray(data)) {
    if (error) console.error('[onemark-drafts] collect claim failed:', error.message);
    return summary;
  }
  for (const row of data as ClaimedJob[]) {
    summary.collected++;
    try {
      const outcome = await fileDraftJob(admin, row);
      summary.outcomes.push(outcome);
      summary.items_written += outcome.inserted;
      summary.items_rejected += outcome.rejected;
      if (outcome.error) summary.errors++;
      else summary.filed++;
    } catch (e) {
      summary.errors++;
      const msg = e instanceof Error ? e.message : String(e);
      summary.outcomes.push({ jobId: row.id, inserted: 0, rejected: 0, error: msg });
      console.error(`[onemark-drafts] job ${row.id} threw:`, msg);
    }
  }
  return summary;
}

export interface RunNowResult {
  ok: boolean;
  jobId: string;
  reason?: 'not_found' | 'not_pending' | 'no_template' | 'claim_lost' | 'model_failed' | 'complete_failed';
  error?: string;
  model_id?: string;
  collect?: CollectSummary;
}

/**
 * Run ONE pending `onemark.item_draft` job inline, PAID (the estate's chat
 * client, model from the job type row, spend recorded in ai_model_usage) —
 * for an operator "draft now" and for a deterministic proof when the ₹0 seat
 * is idle. The job still travels the queue: claimed → done via fn_ai_complete,
 * then the SAME collect pass files it, so fp_items has exactly one write path.
 * A green run here does NOT prove the seat runner's template rendering.
 */
export async function runItemDraftNow(admin: Admin, jobId: string): Promise<RunNowResult> {
  const { data: job } = await admin
    .from('ai_jobs')
    .select('id, job_type, status, payload, result, requested_by')
    .eq('id', jobId)
    .eq('job_type', ONEMARK_DRAFT_JOB_TYPE)
    .maybeSingle();
  if (!job) return { ok: false, jobId, reason: 'not_found' };
  if ((job as { status: string }).status !== 'pending') {
    return { ok: false, jobId, reason: 'not_pending', error: `job is ${(job as { status: string }).status}` };
  }

  const { data: type } = await admin
    .from('ai_job_types')
    .select('prompt_template')
    .eq('job_type', ONEMARK_DRAFT_JOB_TYPE)
    .maybeSingle();
  const template = (type as { prompt_template?: string | null } | null)?.prompt_template;
  if (!template || !template.trim()) return { ok: false, jobId, reason: 'no_template' };

  // Claim it. The status filter is also a written column, and PostgREST
  // re-applies request filters to an UPDATE's RETURNING projection — so no
  // .select() here; re-read afterwards to prove the claim took. The claim
  // token is PER INVOCATION: two overlapping generate_now calls both saw
  // `pending`, but only one UPDATE matches `status = 'pending'`; the loser's
  // re-read shows the winner's token and it stops BEFORE paying the model
  // (a shared constant token let both proceed and both pay).
  const claimToken = `${INLINE_RUNNER}:${randomUUID()}`;
  await admin
    .from('ai_jobs')
    .update({ status: 'claimed', claimed_by: claimToken, claimed_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'pending');
  const { data: claimed } = await admin
    .from('ai_jobs')
    .select('id, status, claimed_by')
    .eq('id', jobId)
    .maybeSingle();
  const c = claimed as { status?: string; claimed_by?: string | null } | null;
  if (!c || c.status !== 'claimed' || c.claimed_by !== claimToken) {
    return { ok: false, jobId, reason: 'claim_lost' };
  }

  // Render the template the way the seat runner does: {{payload}} → the job's
  // _ctx as JSON (the lane's convention — see parsePayload; a pre-2026-09-06
  // job carries its fields flat and is rendered whole), {{prompt}} →
  // payload.prompt.
  const payload = (job as { payload: unknown }).payload;
  const payloadObj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const prompt = template
    .replace(
      /\{\{payload\}\}/g,
      JSON.stringify(
        payloadObj._ctx && typeof payloadObj._ctx === 'object' ? payloadObj._ctx : payloadObj,
        null,
        2,
      ),
    )
    .replace(/\{\{prompt\}\}/g, typeof payloadObj.prompt === 'string' ? payloadObj.prompt : '');

  let text: string;
  let modelId: string;
  try {
    const r = await claudeChatForFeature(ONEMARK_DRAFT_JOB_TYPE, {
      max_tokens: INLINE_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });
    text = r.text;
    modelId = r.model_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.rpc('fn_ai_fail', { p_job_id: jobId, p_error: `${INLINE_RUNNER}: ${msg}` });
    return { ok: false, jobId, reason: 'model_failed', error: msg };
  }

  const { data: done, error: doneErr } = await admin.rpc('fn_ai_complete', {
    p_job_id: jobId,
    p_result: { answer: text, via: INLINE_RUNNER, model_id: modelId },
  });
  if (doneErr || !(done as { ok?: boolean } | null)?.ok) {
    return {
      ok: false,
      jobId,
      reason: 'complete_failed',
      error: doneErr?.message ?? (done as { error?: string } | null)?.error,
      model_id: modelId,
    };
  }

  const collect = await collectItemDrafts(admin);
  const mine = collect.outcomes.find((o) => o.jobId === jobId);
  return { ok: !!mine && !mine.error, jobId, model_id: modelId, collect, error: mine?.error ?? undefined };
}
