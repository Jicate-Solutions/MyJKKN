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
import { resend } from '@/lib/resend';

const CLAIM_CAP = 50;

// ── Runner-down alert (fail-safe, P1) ─────────────────────────────────────────
// The Max-lane AI runner has NO API fallback now (Director-approved). If it dies,
// queued AI work silently stalls. This */15 sweep already runs on the cloud, so
// we piggy-back a health check on its tail (a 67th Vercel cron would risk the
// cron-ceiling that blocks ALL deploys). Copies the drift-check cron's
// resend + DIRECTOR_EMAIL + FROM_EMAIL structure.
const HEARTBEAT_ROW_ID = 'maxlane:poller-heartbeat'; // stamped ~every 2 min by a live runner
const RUNNER_STALE_MS = 10 * 60 * 1000; // matches the /admin/ai-routines liveness strip
const DIRECTOR_EMAIL = 'director@jkkn.ac.in';
const DIRECTOR_UID = 'b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
// Non-terminal statuses: a job in any of these that predates the cutoff is stuck.
// Superset of the ai_jobs status enum ('pending','claimed','running',…) so it
// stays correct if sibling queues add 'cancelled'/'failed'/'delivered'.
const TERMINAL_STATUSES = '(done,error,canceled,cancelled,failed,delivered)';

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

// Fail-safe runner-down check. Alerts the Director (in-app + email) at most once
// per UTC hour, ONLY during 08:00–20:00 IST, when EITHER the runner heartbeat is
// stale (>10 min) OR a non-terminal ai_job has been queued >10 min. Returns a
// small summary; the caller wraps it in its own try/catch so it can NEVER throw
// into the host cron.
async function runnerDownHealthCheck(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<Record<string, unknown>> {
  const now = Date.now();

  // 1) Heartbeat freshness. The table is RPC-only for anon/authenticated (RLS
  // deny-all), so this read MUST use the service-role client.
  const { data: hb } = await admin
    .from('ai_routine_schedules')
    .select('last_fired_at')
    .eq('routine_id', HEARTBEAT_ROW_ID)
    .maybeSingle();
  const lastFiredMs = hb?.last_fired_at ? new Date(hb.last_fired_at).getTime() : NaN;
  const heartbeatAgeMs = now - lastFiredMs; // NaN when the row is missing/null/unparseable
  // Fail-safe: a NaN/absent age is NOT < threshold → treated as STALE → we alert.
  // A live runner stamps this every ~2 min, so a missing pulse means it is down.
  const heartbeatStale = !(heartbeatAgeMs < RUNNER_STALE_MS);

  // 2) Oldest non-terminal ai_job stuck past the cutoff.
  const staleCutoffIso = new Date(now - RUNNER_STALE_MS).toISOString();
  const { data: stuckRows } = await admin
    .from('ai_jobs')
    .select('id, job_type, status, requested_at')
    .not('status', 'in', TERMINAL_STATUSES)
    .lt('requested_at', staleCutoffIso)
    .order('requested_at', { ascending: true })
    .limit(1);
  const stuckJob = Array.isArray(stuckRows) && stuckRows.length > 0 ? stuckRows[0] : null;

  const runnerDown = heartbeatStale || stuckJob !== null;

  // 3) Business-hours gate: 08:00–20:00 IST (UTC+5:30). Shift the epoch by the
  // offset, then read UTC fields to get the IST wall-clock hour.
  const istHour = new Date(now + (5 * 60 + 30) * 60 * 1000).getUTCHours();
  const withinBusinessHours = istHour >= 8 && istHour < 20;

  const summary = {
    checked: true,
    runnerDown,
    heartbeatStale,
    heartbeatAgeMin: Number.isFinite(heartbeatAgeMs) ? Math.round(heartbeatAgeMs / 60000) : null,
    stuckJob: Boolean(stuckJob),
    withinBusinessHours,
  };

  if (!runnerDown || !withinBusinessHours) {
    return { ...summary, alerted: false };
  }

  // 4) Alert — deduped to at most once per UTC hour per outage.
  const nowDate = new Date(now);
  const idempotencyKey = `maxlane-runner-down:${nowDate.toISOString().slice(0, 10)}:${nowDate.getUTCHours()}`;

  const heartbeatAgeLabel = Number.isFinite(heartbeatAgeMs)
    ? `${Math.round(heartbeatAgeMs / 60000)} min`
    : 'never fired / no heartbeat row';
  const stuckLabel = stuckJob
    ? `job ${stuckJob.id} (${stuckJob.job_type}, status=${stuckJob.status}, queued ${new Date(stuckJob.requested_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`
    : 'none';
  const nowIst = nowDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // 4a) In-app notification. Its idempotency_key UNIQUE index is the single
  // source of truth for "already alerted this hour" — we gate the email on its
  // result so the two channels can't diverge (one fires without the other).
  const fanout = await fanoutNotification(admin, {
    title: 'AI runner appears down',
    body:
      `The MyJKKN Max-lane AI runner looks down — it has no API fallback, so queued AI work will stall until it is back. ` +
      `Heartbeat age: ${heartbeatAgeLabel}. Oldest stuck job: ${stuckLabel}.`,
    userIds: [DIRECTOR_UID],
    createdBy: DIRECTOR_UID,
    category: 'general', // free-text; 'general' guarantees the bell renders it
    kind: 'work_item',
    priority: 'urgent',
    idempotencyKey,
    url: '/admin/ai-routines',
    source: 'ai-tasks-sweep:runner-down',
  });

  if (fanout.skipped === 'idempotent') {
    // A prior sweep this hour already alerted → do not re-send the email.
    return { ...summary, alerted: false, idempotent: true, idempotencyKey };
  }

  // 4b) Email the Director. Best-effort — the resend Idempotency-Key header is a
  // provider-side backstop (24h window) on top of the notification-row gate.
  let emailed = false;
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send(
        {
          from: FROM_EMAIL,
          to: DIRECTOR_EMAIL,
          subject: '⚠️ MyJKKN AI runner appears down',
          html: `<h2 style="color:#b91c1c">AI runner appears down</h2>
<p>The MyJKKN Max-lane AI runner has stopped responding. <strong>The Max lane has no API fallback</strong> — queued AI work will not complete until the runner is back online.</p>
<table style="border-collapse:collapse;margin-top:8px">
  <tr><td style="padding:6px 12px;border:1px solid #e5e7eb"><strong>Detected</strong></td><td style="padding:6px 12px;border:1px solid #e5e7eb">${nowIst} IST</td></tr>
  <tr><td style="padding:6px 12px;border:1px solid #e5e7eb"><strong>Heartbeat age</strong></td><td style="padding:6px 12px;border:1px solid #e5e7eb">${heartbeatAgeLabel}${heartbeatStale ? ' — STALE (&gt;10 min)' : ''}</td></tr>
  <tr><td style="padding:6px 12px;border:1px solid #e5e7eb"><strong>Oldest stuck job</strong></td><td style="padding:6px 12px;border:1px solid #e5e7eb">${stuckLabel}</td></tr>
</table>
<p style="margin-top:16px">Check the runner box (Windows poller) and the <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/ai-routines">AI routines liveness strip</a>.</p>
<p style="color:#6b7280;font-size:12px;margin-top:24px">Automated alert from /api/cron/ai-tasks-sweep runner-down health check. Fires at most once per hour, only 08:00–20:00 IST.</p>`,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      emailed = true;
    } catch (emailErr) {
      console.error('[ai-tasks-sweep] runner-down email failed:', emailErr);
    }
  }

  return { ...summary, alerted: true, notified: fanout.notified, emailed, idempotencyKey };
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

  // ── 3) FAIL-SAFE runner-down health check ─────────────────────────────────
  // Runs LAST, in its own try/catch, so a failure here can NEVER break the host
  // sweep above. Additive `health` field in the response — existing callers are
  // unaffected.
  let health: Record<string, unknown> = { checked: false };
  try {
    health = await runnerDownHealthCheck(admin);
  } catch (healthErr) {
    console.error('[ai-tasks-sweep] runner-down health check failed:', healthErr);
    health = { checked: false, error: healthErr instanceof Error ? healthErr.message : 'health check failed' };
  }

  return NextResponse.json({ ok: true, features, health, elapsed_ms: Date.now() - started });
}
