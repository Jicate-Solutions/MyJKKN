// app/api/cron/curriculum-lesson-spine-regen/route.ts
// ============================================================================
// ₹0 Max-lane bridge for lesson-spine REGEN — finishes the 2026-07-13 "₹0
// migration" (work order §B) that moved GENERATE onto the #1998 ai_jobs registry
// but left REGEN behind on the paid-only ai_task_queue.
//
// THE GAP THIS CLOSES: a regen request (the ⚡ "Regenerate spine" button in
// lib/ai-tasks, or the Arts Bloom backfill script) lands in `ai_task_queue`.
// The ONLY reader of that queue was ai-tasks-sweep, which dispatches to the PAID
// Anthropic Batch API — and it submits the family alias `sonnet`, which the API
// 404s (`model: sonnet` not_found), so regen work either failed or was skipped.
// The `lane=max` flag on the regen ai_job_type was therefore decorative: true as
// intent, false as description — nothing ever enqueued regen onto the free lane.
//
// WHAT THIS CRON DOES (mirrors the generate cron's jobs-lane, byte-parity draft
// writes): each */10 run it
//   • COLLECT — drains done `ai_jobs` of this type (the generic Windows seat
//     drain ran them on the Claude Max subscription, ₹0) and records each spine
//     via the SAME registry handler the paid path used (tt.recordResult →
//     fn_curriculum_lesson_ai_draft_upsert), then marks the originating
//     ai_task_queue row done. fn_ai_collect_claim stamps delivered_at, so each
//     result is recorded at most once.
//   • SUBMIT — claims `queued` ai_task_queue regen rows (fn_ai_task_claim_queued,
//     queued→submitting, SKIP LOCKED — the SAME RPC ai-tasks-sweep and the Mac
//     twin use, so no double-run), builds the FULL prompt via the registry's
//     buildSubmitItem, and enqueues one ai_job per task (enqueueJobsLane →
//     fn_ai_enqueue_system, service-role, ₹0). A build-time skip (no course /
//     no syllabus / no taxonomy) is recorded on the task row exactly as today.
//
// The paid ai-tasks-sweep now DEFERS regen (shouldDeferToMaxLane via the
// maxlane:curriculum-lesson-spine-regen schedule row, max_only=true) so it stops
// claiming these rows — this cron is the sole claimer, and every regen runs ₹0.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron) OR
//   `?secret=` (manual runs). Mirrors ai-tasks-sweep / the generate cron.
// ============================================================================
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getTaskType } from '@/lib/ai-tasks/registry';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const FEATURE_KEY = 'curriculum.lesson_spine_regen'; // ai_task_queue feature_key
const JOB_TYPE = 'curriculum.lesson_spine_regen'; // ai_jobs job_type (same string; declarative registry row, lane=max)
// Enqueue is cheap (RPC inserts); the Windows seat drain is the real throttle, so
// a generous claim cap just feeds it. Collect writes ~N draft rows per course, so
// keep it smaller to stay comfortably inside maxDuration.
const SUBMIT_CAP = 50;
const COLLECT_CAP = 25;

type AiTaskRow = {
  id: string;
  entity_id: string | null;
  requested_by: string | null;
  context: Record<string, unknown> | null;
};

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
  const tt = getTaskType(FEATURE_KEY);
  if (!tt) {
    return NextResponse.json({ ok: false, error: `no task type for ${FEATURE_KEY}` }, { status: 500 });
  }

  // Best-effort status stamp: admin.rpc() returns a PostgrestFilterBuilder (a
  // thenable, NOT a Promise — it has no .catch), and it does not throw on an RPC
  // error (the error surfaces on the awaited result). This wrapper awaits it and
  // swallows a genuine transport throw so a failed status stamp can never break
  // the sweep loop — a stranded row is idempotently re-handled on a later run.
  const stampTask = async (fn: 'fn_ai_task_mark_failed' | 'fn_ai_task_mark_done', args: Record<string, unknown>) => {
    try {
      await admin.rpc(fn, args);
    } catch {
      /* best-effort */
    }
  };

  // ── 1) COLLECT — drain done ai_jobs (₹0 Max lane) → record drafts → mark task done ──
  // recordResult IS the paid path's recorder (fn_curriculum_lesson_ai_draft_upsert +
  // stale-slot cleanup), so the drafts written are byte-identical to a paid regen.
  let collected = 0, recorded = 0, collectFailed = 0;
  try {
    const items = await collectJobsLane(admin, [JOB_TYPE], COLLECT_CAP);
    for (const item of items) {
      collected++;
      const ctx = (item.context ?? {}) as Record<string, unknown>;
      const taskId = typeof ctx.task_id === 'string' ? ctx.task_id : null;

      // The drain produced no usable text → fail the task honestly (never strand
      // it in 'submitting'); the idempotent backfill/button can re-request.
      if (!item.message) {
        if (taskId) {
          await stampTask('fn_ai_task_mark_failed', { p_task_id: taskId, p_error: 'max-lane produced no usable output' });
        }
        collectFailed++;
        continue;
      }

      try {
        const result = await tt.recordResult(admin, ctx, item.message);
        if (taskId) {
          await stampTask('fn_ai_task_mark_done', { p_task_id: taskId, p_result: result });
        }
        recorded++;
      } catch (e) {
        if (taskId) {
          await stampTask('fn_ai_task_mark_failed', {
            p_task_id: taskId,
            p_error: (e instanceof Error ? e.message : 'record failed').slice(0, 300),
          });
        }
        collectFailed++;
        console.error('[cron/curriculum-lesson-spine-regen] record failed:', e);
      }
    }
  } catch (e) {
    console.error('[cron/curriculum-lesson-spine-regen] collect phase failed:', e);
  }

  // ── 2) SUBMIT — claim queued regen tasks → build prompt → enqueue on ai_jobs ──
  let claimed = 0, enqueued = 0, skippedDone = 0, skippedInflight = 0, failedBuild = 0;
  try {
    const { data: claimedRows, error: claimErr } = await admin.rpc('fn_ai_task_claim_queued', {
      p_feature_key: FEATURE_KEY,
      p_max: SUBMIT_CAP,
    });
    if (claimErr) throw new Error(claimErr.message);
    const rows = (Array.isArray(claimedRows) ? claimedRows : []) as AiTaskRow[];

    for (const row of rows) {
      claimed++;
      try {
        const built = await tt.buildSubmitItem(admin, row.context ?? {});

        // Build-time skip (no course / no syllabus / no taxonomy) — record the
        // same honest result on the task row the paid sweep would have, no LLM run.
        // ('result' in built) is the exact discriminant the ai-tasks-sweep uses on
        // this same SubmitBuild union — narrows the fall-through to the params arm.
        if ('result' in built) {
          await stampTask('fn_ai_task_mark_done', { p_task_id: row.id, p_result: built.result });
          skippedDone++;
          continue;
        }

        // Assemble the FULL prompt (system + user) the model must see — identical
        // shape to the generate cron's jobs-lane enqueue (the seeded job type's
        // glue prompt_template is {{prompt}}, so the box sends this verbatim).
        const system = typeof built.params.system === 'string' ? built.params.system : '';
        const userContent = built.params.messages?.[0]?.content;
        const user = typeof userContent === 'string' ? userContent : JSON.stringify(userContent);
        const prompt = `${system}\n\n${user}`;

        const r = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt,
          // itemContext carries course_id/course_code/bos_syllabus_id/taxonomy/
          // ai_batch_key for recordResult; task_id lets COLLECT mark THIS row done.
          context: { ...built.itemContext, task_id: row.id, requested_by: row.requested_by },
          // One ai_job per task row (task id is unique + already single-claimed),
          // so COLLECT can mark each task independently — never collapse two tasks
          // for the same course into one job (which would strand the other's row).
          dedupeKey: row.id,
        });

        if (r.ok) {
          enqueued++;
        } else if (r.reason === 'in_flight') {
          // A job for this exact task id is already non-terminal (a prior run
          // enqueued it) — leave the row 'submitting'; COLLECT will complete it.
          skippedInflight++;
        } else {
          await stampTask('fn_ai_task_mark_failed', {
            p_task_id: row.id,
            p_error: `jobs-lane enqueue ${r.reason}: ${(r.error ?? '').slice(0, 200)}`,
          });
          failedBuild++;
        }
      } catch (e) {
        await stampTask('fn_ai_task_mark_failed', {
          p_task_id: row.id,
          p_error: (e instanceof Error ? e.message : 'build failed').slice(0, 300),
        });
        failedBuild++;
        console.error('[cron/curriculum-lesson-spine-regen] build/enqueue failed:', e);
      }
    }
  } catch (e) {
    console.error('[cron/curriculum-lesson-spine-regen] submit phase failed:', e);
  }

  return NextResponse.json({
    ok: true,
    collect: { collected, recorded, failed: collectFailed },
    submit: { claimed, enqueued, skipped_done: skippedDone, skipped_inflight: skippedInflight, failed: failedBuild },
    elapsed_ms: Date.now() - started,
  });
}
