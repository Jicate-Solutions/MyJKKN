// app/api/cron/ai-tasks-sweep/route.ts
// Single */15 sweep for the AI task-button lane (spec: ai-max-button P1).
// COLLECT ended batches (drain + record) FIRST, then SUBMIT newly-queued clicks
// as ONE Anthropic batch per feature at the 50% rate (via batch.ts). Collect-
// first so a click that just finished is reflected back before we spend on new
// work. NEVER the Max subscription — API only.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron) OR
//   `?secret=` (manual runs). Mirrors the scf-generate cron.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  submitBatch,
  collectEndedBatches,
  type SubmitBatchRequest,
} from '@/lib/services/platform/ai-clients/batch';
import { allTaskFeatureKeys, getTaskType } from '@/lib/ai-tasks/registry';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

const CLAIM_CAP = 50;

// P2: notify the requester on EVERY terminal outcome — not just success — so a
// click never dead-ends silently (Director decision 2026-07-05). Best-effort +
// idempotent per (task, outcome) so a re-collect / re-run never double-pings.
// The deep-link carries ?course= so the notification opens the exact class.
type TaskOutcome = 'done' | 'empty' | 'failed' | 'unconfigured';

async function notifyOutcome(
  admin: ReturnType<typeof createServiceRoleClient>,
  tt: { label: string; resultPath?: string },
  args: { uid: string | null; courseCode: string | null; taskId: string; outcome: TaskOutcome },
) {
  const { uid, courseCode, taskId, outcome } = args;
  if (!uid) return; // no requester on the row → nobody to notify
  const where = courseCode ?? 'a class';
  const url = tt.resultPath
    ? (courseCode ? `${tt.resultPath}?course=${encodeURIComponent(courseCode)}` : tt.resultPath)
    : undefined;
  const spec: Record<TaskOutcome, { title: string; body: string; key: string }> = {
    done:   { title: 'AI result ready',        body: `Your ${tt.label} for ${where} is ready.`, key: `ai_task_done:${taskId}` },
    empty:  { title: 'Not enough feedback yet', body: `There isn't enough feedback yet to summarise ${where} (needs at least 3 responses). Try again once more learners respond.`, key: `ai_task_empty:${taskId}` },
    failed: { title: 'AI summary didn’t finish', body: `We couldn't generate the ${tt.label} for ${where}. Please try again.`, key: `ai_task_failed:${taskId}` },
    // ai_not_configured is a permanent gate until an admin adds the key — never
    // tell the user to "try again" (it would re-hit the same gate). Distinct msg.
    unconfigured: { title: 'AI isn’t set up yet', body: `AI isn't configured yet — an admin needs to enable it before ${where} can be summarised.`, key: `ai_task_unconfigured:${taskId}` },
  };
  const s = spec[outcome];
  try {
    await fanoutNotification(admin, {
      title: s.title,
      body: s.body,
      userIds: [uid],
      createdBy: uid,
      url,
      category: 'ai_task',
      kind: 'work_item',
      idempotencyKey: s.key,
      source: 'ai-tasks-sweep',
    });
  } catch (notifyErr) {
    console.error('[ai-tasks-sweep] notify failed:', notifyErr);
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const started = Date.now();
  const hasKey = Boolean(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
  const features: Record<string, unknown> = {};

  for (const featureKey of allTaskFeatureKeys()) {
    const tt = getTaskType(featureKey);
    if (!tt) continue;
    const stat: Record<string, unknown> = {};

    // ── 1) COLLECT ended batches → record → reflect back ──────────────────────
    let recorded = 0, failedCollect = 0, jobs = 0;
    try {
      const collected = await collectEndedBatches(featureKey);
      jobs = collected.length;
      for (const job of collected) {
        for (const item of job.items) {
          const ctx = item.context ?? {};
          const uid = ctx.requested_by ? String(ctx.requested_by) : null;
          const courseCode = ctx.course_code ? String(ctx.course_code) : null;
          try {
            if (item.resultType === 'succeeded' && item.message) {
              const result = await tt.recordResult(admin, ctx, item.message);
              await admin.rpc('fn_ai_task_mark_done', { p_task_id: item.customId, p_result: result });
              recorded++;
              await notifyOutcome(admin, tt, { uid, courseCode, taskId: item.customId, outcome: 'done' });
            } else {
              await admin.rpc('fn_ai_task_mark_failed', {
                p_task_id: item.customId,
                p_error: item.errorMessage || item.resultType,
              });
              failedCollect++;
              await notifyOutcome(admin, tt, { uid, courseCode, taskId: item.customId, outcome: 'failed' });
            }
          } catch (e) {
            await admin.rpc('fn_ai_task_mark_failed', {
              p_task_id: item.customId,
              p_error: e instanceof Error ? e.message : 'record failed',
            });
            failedCollect++;
            await notifyOutcome(admin, tt, { uid, courseCode, taskId: item.customId, outcome: 'failed' });
          }
        }
      }
      stat.collect = { jobs, recorded, failed: failedCollect };
    } catch (e) {
      stat.collect = { error: e instanceof Error ? e.message : 'collect failed' };
    }

    // ── 2) SUBMIT newly-queued clicks as ONE batch ────────────────────────────
    try {
      const { data: claimed, error: claimErr } = await admin.rpc('fn_ai_task_claim_queued', {
        p_feature_key: featureKey,
        p_max: CLAIM_CAP,
      });
      if (claimErr) throw new Error(claimErr.message);
      const rows = Array.isArray(claimed) ? claimed : [];

      const requests: SubmitBatchRequest[] = [];
      let skipped = 0, erroredBuild = 0;
      for (const row of rows) {
        const uid = row.requested_by ? String(row.requested_by) : null;
        const rowCtx = (row.context ?? {}) as Record<string, unknown>;
        const courseCode = rowCtx.course_code ? String(rowCtx.course_code) : null;
        try {
          const built = await tt.buildSubmitItem(admin, row.context ?? {});
          if ('result' in built) {
            await admin.rpc('fn_ai_task_mark_done', { p_task_id: row.id, p_result: built.result });
            skipped++;
            // A submit-time result = "done, no LLM run" (e.g. the small-n skip).
            // Tell the requester: 'not enough feedback' → empty; anything else → done.
            const reason = (built.result as { reason?: string }).reason;
            await notifyOutcome(admin, tt, {
              uid, courseCode, taskId: row.id,
              outcome: reason === 'not_enough_feedback' ? 'empty' : 'done',
            });
          } else if (!hasKey) {
            await admin.rpc('fn_ai_task_mark_done', {
              p_task_id: row.id,
              p_result: { suggestion: null, reason: 'ai_not_configured' },
            });
            skipped++;
            await notifyOutcome(admin, tt, { uid, courseCode, taskId: row.id, outcome: 'unconfigured' });
          } else {
            requests.push({
              customId: row.id,
              params: built.params,
              // carry requested_by so the collect step can notify the requester (P2)
              context: { ...built.itemContext, requested_by: row.requested_by },
              dedupeKey: row.dedupe_key,
            });
          }
        } catch (e) {
          await admin.rpc('fn_ai_task_mark_failed', {
            p_task_id: row.id,
            p_error: e instanceof Error ? e.message : 'build failed',
          });
          erroredBuild++;
          await notifyOutcome(admin, tt, { uid, courseCode, taskId: row.id, outcome: 'failed' });
        }
      }

      if (requests.length > 0) {
        const modelId = String(requests[0].params.model);
        try {
          const res = await submitBatch({ featureKey, phase: 'user_task', modelId, requests });
          await admin.rpc('fn_ai_task_mark_submitted', { p_task_ids: requests.map((r) => r.customId) });
          stat.submit = { claimed: rows.length, submitted: res?.requestCount ?? requests.length, skipped, erroredBuild, jobId: res?.jobId ?? null };
        } catch (e) {
          // Submit failed → requeue for the next sweep (nothing billed on a reserve/create failure).
          await admin.rpc('fn_ai_task_requeue', { p_task_ids: requests.map((r) => r.customId) });
          stat.submit = { claimed: rows.length, submitted: 0, skipped, erroredBuild, submit_error: e instanceof Error ? e.message : 'submit failed' };
        }
      } else {
        stat.submit = { claimed: rows.length, submitted: 0, skipped, erroredBuild };
      }
    } catch (e) {
      stat.submit = { error: e instanceof Error ? e.message : 'submit phase failed' };
    }

    features[featureKey] = stat;
  }

  return NextResponse.json({ ok: true, features, elapsed_ms: Date.now() - started });
}
