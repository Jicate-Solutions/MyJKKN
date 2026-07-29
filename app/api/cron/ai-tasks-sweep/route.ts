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
  markJobCollected,
  type SubmitBatchRequest,
} from '@/lib/services/platform/ai-clients/batch';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { allTaskFeatureKeys, getTaskType } from '@/lib/ai-tasks/registry';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { findingsFingerprint } from '@/lib/ai-routines/loop-governance';
import { resend } from '@/lib/resend';

const CLAIM_CAP = 50;

// ─── ₹0 lane switch for on-demand tasks (Director directive 2026-07-26) ──────
// 'jobs'  → enqueue every claimed task on the free #1998 ai_jobs registry (₹0,
//           drained by the Max seat). 'batch' → the legacy PAID Anthropic
//           Message Batches fallback, kept only so an in-flight bundle can still
//           be drained and so the decision is reversible from a config row.
//
// FAIL-SAFE DIRECTION IS DELIBERATELY INVERTED vs the curriculum generate cron.
// That cron falls back to the paid path on a policy read error so work is never
// delayed. Here the Director's instruction is that paid spend stops entirely and
// "everything queues free and slower" — so a policy hiccup must NOT silently
// resume billing. On any read error we stay on the free lane: work waits, money
// does not move. Slower is the accepted cost; unexpected spend is not.
const TASK_LANE_KEY = 'loops.ai_tasks.submit_lane';

async function readTaskLane(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<'jobs' | 'batch'> {
  try {
    const { data, error } = await admin.rpc('fn_get_policy', {
      p_key: TASK_LANE_KEY,
      p_scope_id: null,
    });
    if (error) return 'jobs';
    return data === 'batch' ? 'batch' : 'jobs';
  } catch {
    return 'jobs';
  }
}
// Loop-lane outage pager threshold (Director-ratified 2026-07-13 §B.5, "page
// immediately", 30 min "filters Windows-update reboots"). Distinct from the
// 10-min RUNNER_STALE_MS runner-down check below (Director-only, business-hours):
// this pages ALL super-admins, 24/7, when LOOP-generation jobs (schedulable job
// types migrated onto the #1998 ai_jobs registry) stall with no drain activity.
const LOOP_OUTAGE_STALE_MS = 30 * 60 * 1000;

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

// ── Stale-job reclaim (auto-recover orphaned claims) ──────────────────────────
// fn_ai_requeue_stale resets jobs stuck in claimed/running past the timeout back
// to pending (attempts++), and marks them 'error' once attempts are exhausted —
// so a job orphaned by a crashed/wedged runner self-recovers instead of stranding
// forever in 'claimed'. Interactive (chat) job types are excluded inside the RPC.
// This sweep is the sanctioned host: it already runs */15 on the cloud with a
// service-role client, so we piggy-back the reclaim (a 67th Vercel cron would risk
// the deploy-blocking cron ceiling). 10-min timeout = the same window
// RUNNER_STALE_MS uses to call the runner "down" (Director decision 2026-07-24).
const RECLAIM_TIMEOUT_SECONDS = 10 * 60; // 600s — matches RUNNER_STALE_MS
const RECLAIM_MAX_ATTEMPTS = 3;

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

  // 2) A job genuinely STUCK IN PROCESSING — one a worker CLAIMED but never
  //    finished. A merely-old PENDING (unclaimed) job is a healthy queue backlog
  //    being drained, NOT a stuck runner. Keying this on requested_at (queue time)
  //    meant a large legitimate backlog — e.g. ~500 pending curriculum jobs —
  //    fired an hourly FALSE "AI runner appears down" for its whole duration while
  //    the runner was alive and steadily draining. Key on claimed_at (processing
  //    time), with a generous window since real AI jobs can run several minutes.
  const STUCK_CLAIMED_MS = 30 * 60 * 1000;
  const stuckCutoffIso = new Date(now - STUCK_CLAIMED_MS).toISOString();
  const { data: stuckRows } = await admin
    .from('ai_jobs')
    .select('id, job_type, status, requested_at, claimed_at')
    .not('status', 'in', TERMINAL_STATUSES)
    .not('claimed_at', 'is', null)
    .lt('claimed_at', stuckCutoffIso)
    .order('claimed_at', { ascending: true })
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
  // UTC hour-stamp — this outage's dedup granularity (one alert per hour). Reused
  // verbatim as the rollup's `alert_hour` entity so the inbox can fold hourly
  // repeats into one line and count them ("alerted N times") from the SAME value
  // that dedupes them. Extracted to a var so the two can never drift.
  const alertHour = `${nowDate.toISOString().slice(0, 10)}:${nowDate.getUTCHours()}`;
  const idempotencyKey = `maxlane-runner-down:${alertHour}`;

  const heartbeatAgeLabel = Number.isFinite(heartbeatAgeMs)
    ? `${Math.round(heartbeatAgeMs / 60000)} min`
    : 'never fired / no heartbeat row';
  const stuckLabel = stuckJob
    ? `job ${stuckJob.id} (${stuckJob.job_type}, status=${stuckJob.status}, claimed ${new Date(stuckJob.claimed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST, not completed)`
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
    // Roll hourly repeats of ONE outage into a single inbox line. The inbox
    // groups by metadata.event; `alert_hour` is the distinct entity it counts,
    // so "alerted N times" == N distinct alert hours. Registered in
    // notification-service.ts EVENT_ENTITY_KEYS['ai_runner_down'] = 'alert_hour'.
    metadata: {
      event: 'ai_runner_down',
      alert_hour: alertHour,
    },
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

// ── Loop-lane outage pager (fail-safe, Director-ratified §B.5) ───────────────
// Pages ALL super-admins (in-app, high priority), 24/7, when LOOP-generation
// jobs on the #1998 ai_jobs registry (schedulable job types — the loops this
// migration moves onto the Max lane) sit non-terminal past 30 min AND the drain
// shows no recent claim activity (ai_jobs.claimed_at — the #1998 schema's own
// last-claim signal). Idempotent per finding-set per hour so a persistent outage
// pages once, but a NEW stalled loop still pages. Runs LAST in its own try/catch
// so it can never break the host sweep. Distinct from runnerDownHealthCheck
// (10 min, Director-only email, business-hours) — overlap noted in the PR.
async function loopLaneOutagePager(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<Record<string, unknown>> {
  const now = Date.now();
  const cutoffIso = new Date(now - LOOP_OUTAGE_STALE_MS).toISOString();

  // Scope: only schedulable (loop-generator) job types. Interactive chat/cdc/
  // translate are covered by the requester's own long-poll + the runner-down
  // check. Self-maintaining: each migrated loop seeds schedulable=true.
  const { data: loopTypes } = await admin
    .from('ai_job_types')
    .select('job_type')
    .eq('schedulable', true);
  const loopJobTypes = (loopTypes ?? []).map((t: { job_type: string }) => t.job_type);
  if (loopJobTypes.length === 0) return { checked: true, loop_types: 0, stuck: 0, alerted: false };

  // Loop jobs stuck: non-terminal, requested before the 30-min cutoff.
  const { data: stuckRows } = await admin
    .from('ai_jobs')
    .select('id, job_type, requested_at')
    .in('job_type', loopJobTypes)
    .not('status', 'in', TERMINAL_STATUSES)
    .lt('requested_at', cutoffIso)
    .order('requested_at', { ascending: true })
    .limit(200);
  const stuck = (stuckRows ?? []) as { id: string; job_type: string; requested_at: string }[];
  if (stuck.length === 0) return { checked: true, loop_types: loopJobTypes.length, stuck: 0, alerted: false };

  // "No drain activity" — the drain has not CLAIMED any job in the last 30 min.
  // A live drain claims within seconds. NaN/absent age → no activity (fail-safe).
  const { data: lastClaim } = await admin
    .from('ai_jobs')
    .select('claimed_at')
    .not('claimed_at', 'is', null)
    .order('claimed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastClaimMs = lastClaim?.claimed_at ? new Date(lastClaim.claimed_at).getTime() : NaN;
  const drainActive = now - lastClaimMs < LOOP_OUTAGE_STALE_MS;
  if (drainActive) {
    // Old jobs but the drain IS claiming — a large/slow backlog, not an outage.
    return { checked: true, loop_types: loopJobTypes.length, stuck: stuck.length, drain_active: true, alerted: false };
  }

  // OUTAGE: loop jobs stuck > 30 min AND no drain claim in 30 min → page supers.
  const { data: supers, error: supersErr } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true);
  if (supersErr || !supers?.length) {
    return {
      checked: true, stuck: stuck.length, alerted: false,
      error: `super-admin lookup failed: ${supersErr?.message ?? 'no recipients'}`,
    };
  }
  const userIds = supers.map((s: { id: string }) => s.id);

  const byType = new Map<string, number>();
  for (const j of stuck) byType.set(j.job_type, (byType.get(j.job_type) ?? 0) + 1);
  const findings = [...byType.entries()].map(([t, n]) => `${t} (${n} stuck)`);
  const oldestMin = Math.round((now - new Date(stuck[0].requested_at).getTime()) / 60000);

  // Hour + finding-set fingerprint: a persistent outage pages once/hour; a NEW
  // stalled loop the same hour still pages (mirrors loop-watchdog's key shape).
  const nowDate = new Date(now);
  const idempotencyKey = `loop-lane-outage:${nowDate.toISOString().slice(0, 10)}:${nowDate.getUTCHours()}:${findingsFingerprint(findings)}`;
  const outcome = await fanoutNotification(admin, {
    title: `🔴 Loop lane outage: ${stuck.length} job${stuck.length === 1 ? '' : 's'} stalled >30 min, no drain activity`,
    body:
      `The ₹0 Max-lane drain has not claimed a job in over 30 min while loop generation is queued: ` +
      findings.join(' · ') +
      `. Oldest queued ${oldestMin} min ago. Loop generation is stalled until the Windows seat drain is back — flip a loop's generation_lane to 'direct' to fall back to the paid lane if urgent.`,
    userIds,
    priority: 'high',
    category: 'loops',
    url: '/admin/ai-models',
    idempotencyKey,
    source: 'ai-tasks-sweep:loop-lane-outage',
  });

  return {
    checked: true,
    loop_types: loopJobTypes.length,
    stuck: stuck.length,
    oldest_min: oldestMin,
    drain_active: false,
    alerted: outcome.skipped !== 'idempotent',
    notified: outcome.notified,
    idempotencyKey,
  };
}

// ── Learner-note drafts reminder (Director-approved 2026-07-16) ──────────────
// scf_learner_notes is a HUMAN gate: the ₹0 loop writes status='draft' rows
// that no learner sees until a super-admin approves them on /admin/learner-notes.
// A gate nobody is reminded about starves silently — 934 drafts (oldest 7 days)
// had accumulated by 16 Jul with zero notifications. Once per IST day, while any
// drafts wait, nudge every super-admin (in-app, normal priority — a standing
// backlog, not an outage). Piggybacked on this sweep like the pager above; the
// GET tail wraps it in its own try/catch so it can never break the host sweep.
async function learnerNoteDraftsReminder(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<Record<string, unknown>> {
  const { count, error: countErr } = await admin
    .from('scf_learner_notes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft');
  if (countErr) return { checked: false, error: countErr.message };
  const waiting = count ?? 0;
  if (waiting === 0) return { checked: true, waiting: 0, alerted: false };

  const { data: oldestRow } = await admin
    .from('scf_learner_notes')
    .select('created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const oldestDays = oldestRow?.created_at
    ? Math.floor((Date.now() - new Date(oldestRow.created_at).getTime()) / 86_400_000)
    : null;

  const { data: supers, error: supersErr } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true);
  if (supersErr || !supers?.length) {
    return {
      checked: true, waiting, alerted: false,
      error: `super-admin lookup failed: ${supersErr?.message ?? 'no recipients'}`,
    };
  }

  // One nudge per IST day while drafts wait (IST = UTC+5:30).
  const istDay = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
  const idempotencyKey = `learner-note-drafts:${istDay}`;
  const outcome = await fanoutNotification(admin, {
    title: `Learner support-note drafts awaiting review: ${waiting}`,
    body:
      `${waiting} AI-drafted support note${waiting === 1 ? '' : 's'} for learners ` +
      `are waiting for review — no learner sees a note until a super-admin approves it. ` +
      (oldestDays !== null && oldestDays > 0
        ? `The oldest has waited ${oldestDays} day${oldestDays === 1 ? '' : 's'}. `
        : '') +
      `Open the approval queue to review them.`,
    userIds: supers.map((s: { id: string }) => s.id),
    priority: 'normal',
    category: 'loops',
    url: '/admin/learner-notes',
    idempotencyKey,
    source: 'ai-tasks-sweep:learner-note-drafts',
  });
  return {
    checked: true,
    waiting,
    oldest_days: oldestDays,
    alerted: outcome.skipped !== 'idempotent',
    notified: outcome.notified,
    idempotencyKey,
  };
}

// ── Stale-job reclaim (Director decision 2026-07-24) ────────────────────────
// Recover-before-report: auto-requeue jobs orphaned by a crashed/wedged runner
// (claimed/running past RECLAIM_TIMEOUT_SECONDS) so a live drain re-claims them;
// after RECLAIM_MAX_ATTEMPTS the RPC marks them 'error' (no infinite retry).
// Interactive chat jobs are excluded inside the RPC. Same fail-safe discipline as
// the detectors below: own try/catch in the caller so it can NEVER break the host
// sweep. This closes the gap where the runner-down / loop-outage checks DETECT a
// stall and alert, but nothing ever RECOVERS the stranded jobs.
async function reclaimStaleJobs(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc('fn_ai_requeue_stale', {
    p_timeout_seconds: RECLAIM_TIMEOUT_SECONDS,
    p_max_attempts: RECLAIM_MAX_ATTEMPTS,
  });
  if (error) return { checked: false, error: error.message };
  // RPC returns jsonb { requeued, failed }.
  const row = (data ?? {}) as { requeued?: number; failed?: number };
  return { checked: true, requeued: row.requeued ?? 0, failed: row.failed ?? 0 };
}

// ── Max-lane RESTART alerts (fail-safe, visibility for self-heals) ────────────
// The Max-lane drains now auto-restart on crash (~1 min) and survive reboots via
// auto-login — so a flaky box self-heals silently and runnerDownHealthCheck (10-min
// stale window) never fires for a ~1–2 min blip. This surfaces EVERY restart so a
// box rebooting nightly (failing hardware / bad update loop) can't hide.
//
// Mechanism: each drain stamps a per-process launch id (process-start epoch secs)
// onto its heartbeat row via fn_ai_routine_record_fire's 3rd arg. A CHANGE in that
// id = the process restarted. We alert once per (runner, launch id); dedup is the
// notifications.idempotency_key UNIQUE index (no ack table). A steady box keeps the
// same launch id every heartbeat → the key never changes → silent. launch ids are
// monotonic process-start epochs, never reused, so a restart alerts exactly once
// even if an old idempotency row is later pruned. NULL launch ids (cloud routines,
// or before the box drain ships the stamp) are skipped, so nothing alerts during
// the pre-box-update window. Distinct from runnerDownHealthCheck (sustained-outage
// signal) — both are kept: down-alert on the way down, restart-alert on the way up.
const RESTART_RUNNERS = ['maxlane:poller-heartbeat', 'maxlane:chat-drain'];

async function maxlaneRestartAlerts(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('ai_routine_schedules')
    .select('routine_id, launch_id, last_fired_at')
    .in('routine_id', RESTART_RUNNERS);
  if (error) return { checked: false, error: error.message };

  const results: Array<Record<string, unknown>> = [];
  for (const rawRow of data ?? []) {
    const row = rawRow as { routine_id: string; launch_id: string | null };
    const runner = row.routine_id;
    const launchId = row.launch_id;
    // Skip until a box drain stamps a launch id (pre-box-update window / cloud rows).
    if (!launchId) {
      results.push({ runner, skipped: 'no_launch_id' });
      continue;
    }

    // Dedup key: one alert per (runner, launch id).
    const idempotencyKey = `maxlane-restart:${runner}:${launchId}`;

    // Human label: launch id is epoch SECONDS. Show "restarted at HH:MM IST" when it
    // parses to a plausible recent epoch; else fall back to the raw id (drift-safe).
    const epochSec = Number(launchId);
    const launchedLabel =
      Number.isFinite(epochSec) && epochSec > 1_700_000_000 && epochSec < 4_000_000_000
        ? `${new Date(epochSec * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
        : `launch id ${launchId}`;
    const shortRunner = runner.replace(/^maxlane:/, '');

    // In-app notification. Its idempotency_key UNIQUE index is the single source of
    // truth for "already alerted this launch" — gate the email on its result so the
    // two channels can't diverge (one fires without the other).
    const fanout = await fanoutNotification(admin, {
      title: 'Max-lane worker restarted',
      body:
        `The Max-lane ${shortRunner} restarted (started ${launchedLabel}). It self-healed ` +
        `automatically — no action needed for a one-off, but frequent restarts can signal a ` +
        `flaky box (reboot loop or failing hardware).`,
      userIds: [DIRECTOR_UID],
      createdBy: DIRECTOR_UID,
      category: 'general', // free-text; 'general' guarantees the bell renders it
      kind: 'work_item',
      priority: 'normal', // informational (already recovered), not a page
      idempotencyKey,
      url: '/admin/ai-routines',
      source: 'ai-tasks-sweep:maxlane-restart',
      metadata: { event: 'maxlane_restart', runner, launch_id: launchId },
    });

    if (fanout.skipped === 'idempotent') {
      // A prior sweep already alerted this launch → do not re-send the email.
      results.push({ runner, launch_id: launchId, alerted: false, idempotent: true });
      continue;
    }

    // Email the Director. Best-effort — the resend Idempotency-Key header is a
    // provider-side backstop (24h) on top of the notification-row gate.
    let emailed = false;
    if (process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send(
          {
            from: FROM_EMAIL,
            to: DIRECTOR_EMAIL,
            subject: '🔄 MyJKKN Max-lane worker restarted',
            html: `<h2 style="color:#0b6d41">Max-lane worker restarted</h2>
<p>The MyJKKN Max-lane <strong>${shortRunner}</strong> restarted and self-healed automatically. No action is needed for a one-off — but frequent restarts can signal a flaky box (reboot loop or failing hardware), so this is surfaced for visibility.</p>
<table style="border-collapse:collapse;margin-top:8px">
  <tr><td style="padding:6px 12px;border:1px solid #e5e7eb"><strong>Worker</strong></td><td style="padding:6px 12px;border:1px solid #e5e7eb">${shortRunner}</td></tr>
  <tr><td style="padding:6px 12px;border:1px solid #e5e7eb"><strong>Restarted</strong></td><td style="padding:6px 12px;border:1px solid #e5e7eb">${launchedLabel}</td></tr>
</table>
<p style="margin-top:16px">See the <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/ai-routines">AI routines liveness strip</a> for restart history.</p>
<p style="color:#6b7280;font-size:12px;margin-top:24px">Automated alert from /api/cron/ai-tasks-sweep max-lane restart check. Fires once per worker restart (deduped by launch id).</p>`,
          },
          { headers: { 'Idempotency-Key': idempotencyKey } },
        );
        emailed = true;
      } catch (emailErr) {
        console.error('[ai-tasks-sweep] maxlane-restart email failed:', emailErr);
      }
    }
    results.push({ runner, launch_id: launchId, alerted: true, notified: fanout.notified, emailed });
  }
  return { checked: true, runners: results };
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
  // Read once per run so every feature in this sweep uses one consistent lane.
  const lane = await readTaskLane(admin);
  const features: Record<string, unknown> = { _lane: lane };

  for (const featureKey of allTaskFeatureKeys()) {
    const tt = getTaskType(featureKey);
    if (!tt) continue;
    const stat: Record<string, unknown> = {};

    // ── 1) COLLECT ended batches → record → reflect back ──────────────────────
    let recorded = 0, failedCollect = 0, jobs = 0, collectedJobs = 0;
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

        // Updated: 2026-07-26 — FINALIZE the job. collectEndedBatches()
        // deliberately leaves the job in 'collecting' so the caller can
        // domain-record first (see batch.ts header); the three other collect
        // callers each call markJobCollected, this one never did. Every item
        // above reaches a terminal task state (mark_done or mark_failed, both
        // branches and the catch), so the job is fully drained here and must
        // be closed. Without this the job is re-claimed on every tick, re-drains
        // the same results, and burns its retry budget until the PAID batch
        // expires — observed in production as three expired batches at 103/104
        // collect_attempts and a fourth wedged at 19, all phase='user_task'
        // (the only phase this route submits). Finalize failure is logged, not
        // thrown, so one bad job cannot strand the remaining jobs' finalize.
        try {
          await markJobCollected(job.jobId);
          collectedJobs++;
        } catch (finErr) {
          console.error(
            `[cron/ai-tasks-sweep] ${featureKey}: job ${job.jobId} drained but finalize failed —`,
            finErr instanceof Error ? finErr.message : finErr,
          );
        }
      }
      stat.collect = { jobs, collected: collectedJobs, recorded, failed: failedCollect };
    } catch (e) {
      stat.collect = { error: e instanceof Error ? e.message : 'collect failed' };
    }

    // ── 1b) JOBS-LANE COLLECT — drain done ai_jobs (₹0 Max lane) ──────────────
    // Records the SAME way as the paid path above (tt.recordResult →
    // fn_ai_task_mark_done), so a task's stored result is identical whichever
    // lane produced it. Runs ALWAYS, independent of the lane switch and of
    // hasKey: the Max seat needs no Anthropic key, and draining unconditionally
    // means a flip back to 'batch' never orphans work already queued on the free
    // lane. fn_ai_collect_claim stamps delivered_at, so each result is recorded
    // at most once.
    let laneRecorded = 0, laneFailed = 0;
    try {
      const laneItems = await collectJobsLane(admin, [featureKey], CLAIM_CAP);
      for (const item of laneItems) {
        const ctx = item.context ?? {};
        const uid = ctx.requested_by ? String(ctx.requested_by) : null;
        const courseCode = ctx.course_code ? String(ctx.course_code) : null;
        // Close the ORIGINATING ai_task_queue row, whose id is stashed in _ctx at
        // enqueue (see SUBMIT below). item.jobId is the ai_jobs id — it never
        // matches an ai_task_queue row, so marking by it silently no-ops, stranding
        // the task in 'submitting' forever (and hanging the requester's button).
        // Legacy jobs enqueued before task_id was stashed have none: still record
        // the artifact (recordResult), just skip the row-close we cannot target.
        const taskId = typeof ctx.task_id === 'string' ? ctx.task_id : null;
        try {
          if (item.message) {
            const result = await tt.recordResult(admin, ctx, item.message);
            if (taskId) await admin.rpc('fn_ai_task_mark_done', { p_task_id: taskId, p_result: result });
            laneRecorded++;
            if (taskId) await notifyOutcome(admin, tt, { uid, courseCode, taskId, outcome: 'done' });
          } else {
            // Drain completed but produced no usable text — fail the task so the
            // requester is told, rather than leaving it silently in-flight.
            if (taskId) {
              await admin.rpc('fn_ai_task_mark_failed', {
                p_task_id: taskId,
                p_error: 'max lane returned no usable text',
              });
              await notifyOutcome(admin, tt, { uid, courseCode, taskId, outcome: 'failed' });
            }
            laneFailed++;
          }
        } catch (e) {
          if (taskId) {
            await admin.rpc('fn_ai_task_mark_failed', {
              p_task_id: taskId,
              p_error: e instanceof Error ? e.message : 'record failed',
            });
            await notifyOutcome(admin, tt, { uid, courseCode, taskId, outcome: 'failed' });
          }
          laneFailed++;
        }
      }
      stat.collect_jobs_lane = { claimed: laneItems.length, recorded: laneRecorded, failed: laneFailed };
    } catch (e) {
      stat.collect_jobs_lane = { error: e instanceof Error ? e.message : 'jobs-lane collect failed' };
    }

    // ── 2) SUBMIT newly-queued clicks ─────────────────────────────────────────
    // On lane='jobs' (the ₹0 default) each claimed task is enqueued on the free
    // #1998 ai_jobs registry; on 'batch' it goes to the paid Anthropic Message
    // Batches API. Lesson-spine regen used to have a per-feature Max-lane defer +
    // its own sibling cron here; both were retired once this sweep itself gained
    // the ₹0 jobs lane — regen now flows through the SAME path as every other
    // on-demand task, so there is no second mechanism to strand its rows.
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
          } else if (lane === 'batch' && !hasKey) {
            // Only the PAID batch lane needs an Anthropic key. On the ₹0 lane the
            // Max seat runs the job, so a missing key must NOT resolve the task as
            // 'ai_not_configured' — that would silently discard every request the
            // moment the key is removed, which is exactly what switching the paid
            // lane off does.
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
              // and task_id so it can close THIS ai_task_queue row (item.jobId is the
              // ai_jobs id and never matches a task row — see the jobs-lane collect).
              context: { ...built.itemContext, requested_by: row.requested_by, task_id: row.id },
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

      if (requests.length > 0 && lane === 'jobs') {
        // ₹0 MAX LANE — enqueue each claimed task as an ai_job instead of buying a
        // paid batch. The seeded job type's glue prompt_template is {{prompt}}, so
        // we pass the SAME assembled prompt buildSubmitItem produced (system +
        // user), extracted from the request, and the model sees identical
        // instructions. No Anthropic key is used on this path.
        //
        // NOTE the model is deliberately NOT forwarded. The registry stores family
        // aliases ('sonnet'/'opus') which the Max CLI resolves to current-latest;
        // the paid HTTP API rejects them outright (not_found_error: model: sonnet —
        // observed on all 34 requests of the 2026-07-25 bundle). Letting the seat
        // resolve its own model is both correct and always-latest.
        let enqueued = 0, inFlight = 0, enqueueFailed = 0;
        const submittedIds: string[] = [];
        for (const req of requests) {
          const system = typeof req.params.system === 'string' ? req.params.system : '';
          const userContent = req.params.messages?.[0]?.content;
          const user = typeof userContent === 'string' ? userContent : JSON.stringify(userContent);
          const r = await enqueueJobsLane(admin, {
            jobType: featureKey,
            prompt: `${system}\n\n${user}`,
            context: req.context ?? {},
            dedupeKey: req.dedupeKey ?? req.customId,
          });
          if (r.ok) {
            enqueued++;
            submittedIds.push(req.customId);
          } else if (r.reason === 'in_flight') {
            // Already queued/claimed on the free lane — treat as handled so the
            // task is not requeued into a duplicate.
            inFlight++;
            submittedIds.push(req.customId);
          } else {
            // Could not enqueue (unknown/disabled job type, no seat owner, error).
            // Requeue below so the next sweep retries rather than losing the click.
            enqueueFailed++;
            console.warn(
              `[cron/ai-tasks-sweep] ${featureKey}: jobs-lane enqueue failed (${r.reason}): ${r.error ?? ''}`,
            );
          }
        }
        if (submittedIds.length > 0) {
          await admin.rpc('fn_ai_task_mark_submitted', { p_task_ids: submittedIds });
        }
        const requeueIds = requests.map((r) => r.customId).filter((id) => !submittedIds.includes(id));
        if (requeueIds.length > 0) {
          await admin.rpc('fn_ai_task_requeue', { p_task_ids: requeueIds });
        }
        stat.submit = {
          lane: 'jobs', claimed: rows.length, submitted: enqueued, in_flight: inFlight,
          requeued: requeueIds.length, skipped, erroredBuild,
        };
      } else if (requests.length > 0) {
        const modelId = String(requests[0].params.model);
        try {
          const res = await submitBatch({ featureKey, phase: 'user_task', modelId, requests });
          await admin.rpc('fn_ai_task_mark_submitted', { p_task_ids: requests.map((r) => r.customId) });
          stat.submit = { lane: 'batch', claimed: rows.length, submitted: res?.requestCount ?? requests.length, skipped, erroredBuild, jobId: res?.jobId ?? null };
        } catch (e) {
          // Submit failed → requeue for the next sweep (nothing billed on a reserve/create failure).
          await admin.rpc('fn_ai_task_requeue', { p_task_ids: requests.map((r) => r.customId) });
          stat.submit = { lane: 'batch', claimed: rows.length, submitted: 0, skipped, erroredBuild, submit_error: e instanceof Error ? e.message : 'submit failed' };
        }
      } else {
        stat.submit = { claimed: rows.length, submitted: 0, skipped, erroredBuild };
      }
    } catch (e) {
      stat.submit = { error: e instanceof Error ? e.message : 'submit phase failed' };
    }

    features[featureKey] = stat;
  }

  // ── 2.5) RECLAIM stale/orphaned jobs FIRST (recover-before-report) ────────
  // Auto-requeue jobs stranded by a crashed/wedged runner so a live drain picks
  // them up, and so the detectors below alert on the post-reclaim picture. Own
  // try/catch — can never break the host sweep. Additive `reclaim` field.
  let reclaim: Record<string, unknown> = { checked: false };
  try {
    reclaim = await reclaimStaleJobs(admin);
  } catch (reclaimErr) {
    console.error('[ai-tasks-sweep] stale-job reclaim failed:', reclaimErr);
    reclaim = { checked: false, error: reclaimErr instanceof Error ? reclaimErr.message : 'reclaim failed' };
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

  // ── 4) LOOP-LANE OUTAGE PAGER (Director-ratified §B.5) ────────────────────
  // Same fail-safe discipline: own try/catch, additive `loop_lane` field.
  let loopLane: Record<string, unknown> = { checked: false };
  try {
    loopLane = await loopLaneOutagePager(admin);
  } catch (pagerErr) {
    console.error('[ai-tasks-sweep] loop-lane outage pager failed:', pagerErr);
    loopLane = { checked: false, error: pagerErr instanceof Error ? pagerErr.message : 'pager failed' };
  }

  // ── 5) LEARNER-NOTE DRAFTS REMINDER (Director-approved 2026-07-16) ────────
  // Same fail-safe discipline: own try/catch, additive `learner_note_drafts`.
  let learnerNoteDrafts: Record<string, unknown> = { checked: false };
  try {
    learnerNoteDrafts = await learnerNoteDraftsReminder(admin);
  } catch (draftsErr) {
    console.error('[ai-tasks-sweep] learner-note drafts reminder failed:', draftsErr);
    learnerNoteDrafts = { checked: false, error: draftsErr instanceof Error ? draftsErr.message : 'reminder failed' };
  }

  // ── 6) MAX-LANE RESTART ALERTS (visibility for self-heals) ────────────────
  // Same fail-safe discipline: own try/catch, additive `maxlane_restarts` field.
  let maxlaneRestarts: Record<string, unknown> = { checked: false };
  try {
    maxlaneRestarts = await maxlaneRestartAlerts(admin);
  } catch (restartErr) {
    console.error('[ai-tasks-sweep] maxlane restart alerts failed:', restartErr);
    maxlaneRestarts = { checked: false, error: restartErr instanceof Error ? restartErr.message : 'restart alerts failed' };
  }

  return NextResponse.json({ ok: true, features, reclaim, health, loop_lane: loopLane, learner_note_drafts: learnerNoteDrafts, maxlane_restarts: maxlaneRestarts, elapsed_ms: Date.now() - started });
}
