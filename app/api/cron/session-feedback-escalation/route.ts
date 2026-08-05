// =====================================================================
// Session Feedback (SCF) — Weekly tiered escalation digest cron
// =====================================================================
// Closes class-feedback loop gaps #2 (escalation PUSH to leadership — was
// pull-only) + #3 (AI summary AT escalation). Runs WEEKLY (Mondays 07:30 UTC).
// For every (faculty + course) that escalated last week (>= 3 responses AND
// avg understanding < 3), it:
//   1. fn_scf_compute_weekly_escalations(week_start) → the escalated classes +
//      their anonymized free_texts (SERVICE-ROLE-ONLY read). Classes with no
//      resolvable faculty are excluded here — they have no addressee — and
//      fn_scf_unattributed_escalations reports them so the loss is COUNTED
//      rather than silent (top-level `skipped` in the response).
//   2. For each, Claude writes a 2-3 sentence aggregate summary for leadership
//      (theme-level, never a verbatim quote or individual student — same
//      anonymity invariant as ai-suggest-improvement). Floor/no-key → numeric
//      template, never fails the run.
//   3. fn_scf_apply_weekly_escalation_digest(week_start, summaries) → writes ONE
//      in-app digest per recipient (idempotent per recipient per week), tiered:
//      HOD on the first week a class escalates, +Principal once it repeats.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron sends this)
//   OR `?secret=` query param (manual runs). Mirrors session-feedback-nudge.
// Created: 2026-06-25 (mould of /api/cron/session-feedback-nudge +
//   the Claude call from /api/academic/session-feedback/ai-suggest-improvement).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shouldDeferToMaxLane } from '@/lib/services/platform/max-lane-deferral';
import Anthropic from '@anthropic-ai/sdk';
import {
  resolveChatModel,
  recordChatCall,
} from '@/lib/services/platform/ai-clients/chat';
import { enqueueJobsLane, awaitJobsLaneResults } from '@/lib/services/platform/ai-jobs-lane';

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure).
const FEATURE_KEY = 'session_feedback.escalation';

// ₹0 Max-lane migration (§B): the ai_job_types row (seeded 20260713180000) + the
// flip-back switch. This digest is SYNCHRONOUS (aggregate-then-apply), so lane=
// 'jobs' enqueues each briefing and BOUNDED-POLLS the drain, falling back to the
// per-class template for any not ready by the deadline (byte-parity with a no-AI run).
const JOB_TYPE = FEATURE_KEY;
const GENERATION_LANE_KEY = 'loops.session_feedback_escalation.generation_lane';
// Poll budget for the jobs lane — comfortably below maxDuration (300s).
const JOBS_POLL_DEADLINE_MS = 240_000;

/** Read the generation-lane switch as a cron (fn_get_policy at global scope, no
 *  auth.uid). Fail-safe to 'direct' (the proven inline path) on any read error. */
async function readGenerationLane(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<'jobs' | 'direct'> {
  try {
    const { data, error } = await admin.rpc('fn_get_policy', { p_key: GENERATION_LANE_KEY, p_scope_id: null });
    if (error) return 'direct';
    return data === 'jobs' ? 'jobs' : 'direct';
  } catch {
    return 'direct';
  }
}

const SUMMARY_SYSTEM = `You write a 2-3 sentence briefing for a department head or principal about ONE class whose students gave anonymous post-class feedback indicating low understanding. You receive ONLY aggregate numbers and anonymized comment themes — never any student identity. Speak only in aggregate themes; NEVER quote a comment verbatim and NEVER refer to an individual student. Be concrete, India higher-education context aware, and end with the single most useful next step for the teacher. Return PLAIN TEXT only (2-3 sentences, no markdown, no preamble).`;

// The per-class fallback briefing (used when AI is unavailable, has no comments,
// or — on the jobs lane — has not drained by the deadline). Kept identical to the
// inline path's template so a timeout is byte-parity with a no-AI run.
function escalationTemplate(e: Escalation): string {
  const avg = e.avg_understood ?? 'n/a';
  return `Average understanding ${avg}/5 across ${e.responses} learners — below the escalation threshold. Review recent ${e.course_name || e.course_code} sessions and pace/clarity with the Senior Learner.`;
}

// The per-class user prompt — shared by the inline path and the jobs-lane enqueue.
function escalationUserPrompt(e: Escalation, texts: string[]): string {
  const avg = e.avg_understood ?? 'n/a';
  return `Course: ${e.course_name || e.course_code} (${e.course_code})
Responses: ${e.responses}
Average understanding (1-5): ${avg}

Anonymized student comment themes:
${texts.map((t) => `- ${String(t).trim()}`).join('\n')}

Write the 2-3 sentence leadership briefing now.`;
}

/** A stable per-escalation key (matches the summaries map key the digest expects). */
function escalationKey(e: Escalation): string {
  return `${e.faculty_email}|${e.course_code}`;
}

// Monday of last week (UTC), as YYYY-MM-DD — the window the digest covers.
function lastWeekMondayUTC(now: Date): string {
  const dow = now.getUTCDay(); // 0=Sun..6=Sat
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - ((dow + 6) % 7));
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return lastMonday.toISOString().slice(0, 10);
}

type Escalation = {
  institution_id: string;
  faculty_email: string;
  course_code: string;
  course_name: string | null;
  responses: number;
  avg_understood: number | null;
  free_texts: string[] | null;
};

// A class that DID cross the escalation threshold but carries no faculty
// identity, so there is nobody to address the digest to. These are excluded
// from the digest — an escalation names a teacher to their HOD, and naming the
// wrong teacher is a worse failure than naming none. They are NOT discarded
// quietly: see readUnattributed below.
type Unattributed = {
  institution_id: string;
  course_code: string;
  course_name: string | null;
  responses: number;
  avg_understood: number | null;
};

/**
 * The classes this run could not escalate because no faculty could be resolved.
 *
 * fn_scf_compute_weekly_escalations and fn_scf_apply_weekly_escalation_digest
 * both filter faculty_email IS NULL, so without this read those classes vanish
 * with no count, no log and no trace — which is exactly how the problem stayed
 * invisible for weeks. Reported, never guessed: recovery from the timetable was
 * measured wrong on 31.8% of rows where the truth is known, so it is not used.
 *
 * Never throws — a failure to *report* the excluded classes must not sink the
 * digest that carries the ones we CAN deliver.
 */
async function readUnattributed(
  admin: ReturnType<typeof createServiceRoleClient>,
  weekStart: string,
): Promise<{ rows: Unattributed[]; error: string | null }> {
  try {
    const { data, error } = await admin.rpc('fn_scf_unattributed_escalations', {
      p_week_start: weekStart,
    });
    if (error) {
      console.error('[cron/session-feedback-escalation] unattributed read failed:', error);
      return { rows: [], error: error.message };
    }
    return { rows: (Array.isArray(data) ? data : []) as Unattributed[], error: null };
  } catch (err) {
    console.error('[cron/session-feedback-escalation] unattributed read threw:', err);
    return { rows: [], error: err instanceof Error ? err.message : 'unattributed read failed' };
  }
}

async function summarize(
  anthropic: Anthropic | null,
  modelId: string,
  e: Escalation
): Promise<string> {
  const template = escalationTemplate(e);
  const texts = Array.isArray(e.free_texts) ? e.free_texts.filter(Boolean) : [];
  if (!anthropic || texts.length === 0) return template;
  try {
    const userPrompt = escalationUserPrompt(e, texts);
    const t0 = Date.now();
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create({
        model: modelId,
        max_tokens: 220,
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } catch (apiErr) {
      await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, null, apiErr);
      throw apiErr; // outer catch keeps the template fallback — summarize NEVER throws outward
    }
    await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, resp);
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text || template;
  } catch (err) {
    console.error('[cron/session-feedback-escalation] summarize failed:', err);
    return template; // never let one summary failure sink the digest
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

  // Runner-aware Max-lane deferral: when the maxlane:session-feedback-escalation
  // schedule row owns this routine (max_only pin, or enabled + fresh heartbeat),
  // the Max twin runs this weekly digest on the runner box — stand down this run.
  // Fail-open: any schedules-read problem and the cloud digest runs normally.
  // Harmless either way (the digest is idempotent per recipient per week), but
  // deferring keeps the twin the primary lane.
  const started = Date.now();
  const supabase = createServiceRoleClient();

  // ₹0 Max-lane migration (§B): 'jobs' (default after PR) = enqueue each briefing
  // onto the #1998 ai_jobs registry (₹0) and bounded-poll; 'direct' = the legacy
  // inline Anthropic fan-out. Flip-back switch.
  const lane = await readGenerationLane(supabase);

  // Manifest-twin deferral applies ONLY on 'direct'. On 'jobs' the cron feeds
  // ai_jobs itself. Overlap-safe: the digest is idempotent per recipient per week.
  if (lane === 'direct' && (await shouldDeferToMaxLane('session-feedback-escalation'))) {
    console.log('[cron/session-feedback-escalation] deferred to Max manifest twin (direct lane)');
    return NextResponse.json({
      ok: true,
      generation_lane: lane,
      classes_flagged: 0,
      recipients_notified: 0,
      deferred_to_max_lane: true,
    });
  }

  // Allow an explicit ?week_start=YYYY-MM-DD for manual/backfill runs.
  const wkParam = request.nextUrl.searchParams.get('week_start');
  const weekStart =
    wkParam && /^\d{4}-\d{2}-\d{2}$/.test(wkParam)
      ? wkParam
      : lastWeekMondayUTC(new Date());

  // 1) Compute the escalated classes for the week (service-role read).
  const { data: escData, error: computeErr } = await supabase.rpc(
    'fn_scf_compute_weekly_escalations',
    { p_week_start: weekStart }
  );
  if (computeErr) {
    console.error('[cron/session-feedback-escalation] compute failed:', computeErr);
    return NextResponse.json(
      { ok: false, error: computeErr.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  const escalations = (Array.isArray(escData) ? escData : []) as Escalation[];

  // 1b) The counterpart to the compute: the classes that crossed the threshold
  // but have no faculty to send to. They are excluded from the digest, so they
  // are surfaced here instead of disappearing.
  const unattributed = await readUnattributed(supabase, weekStart);
  if (unattributed.rows.length > 0) {
    console.warn(
      `[cron/session-feedback-escalation] ${unattributed.rows.length} escalation(s) ` +
        'could not be attributed to a team member and were excluded: ' +
        unattributed.rows
          .map((u) => `${u.course_code} (${u.responses} responses, avg ${u.avg_understood}/5)`)
          .join('; '),
    );
  }
  // 'skipped' and 'flagged' are on the ai-routine-dispatcher's summarize()
  // allowlist, so these numbers reach ai_routine_schedules.last_status and the
  // /admin/loops page. Neither `classes_flagged` nor `recipients_notified` is on
  // that allowlist, which is why every successful run of this routine has only
  // ever shown a bare "HTTP 200".
  //
  // `skipped` is emitted ONLY when the count is actually known. If the read
  // failed — including the window after this code deploys but before the
  // migration that creates the RPC is applied — reporting `skipped: 0` would
  // put a false zero in last_status, i.e. rebuild the exact silent-drop this
  // change exists to remove. An unknown count says so with `unattributed_error`.
  const unattributedReport = unattributed.error
    ? { unattributed_error: unattributed.error }
    : {
        skipped: unattributed.rows.length,
        unattributed_classes: unattributed.rows.map((u) => ({
          course_code: u.course_code,
          course_name: u.course_name,
          responses: u.responses,
          avg_understood: u.avg_understood,
        })),
      };

  if (escalations.length === 0) {
    return NextResponse.json({
      ok: true,
      week_start: weekStart,
      classes_flagged: 0,
      flagged: 0,
      recipients_notified: 0,
      ...unattributedReport,
      elapsed_ms: Date.now() - started,
    });
  }

  // 2) Generate a per-class AI briefing (graceful template fallback).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  // Resolve the model from ai_model_config ONCE per run (never throws — hardcoded
  // fallback on any config failure), before the fan-out.
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);
  const summaries: Record<string, string> = {};
  let enqueued = 0;
  let aiFilled = 0;

  if (lane === 'jobs') {
    // ₹0 Max lane: enqueue a briefing per class that HAS comments (classes with
    // none use the template directly, exactly as the inline path). Then bounded-
    // poll the drain and fill the AI briefing where ready, template otherwise —
    // so a slow/absent drain degrades to a template-only digest (no worse than a
    // no-AI run), and the digest still applies synchronously this run.
    const jobKeyById = new Map<string, string>(); // jobId → escalation key
    for (const e of escalations) {
      const key = escalationKey(e);
      const texts = Array.isArray(e.free_texts) ? e.free_texts.filter(Boolean) : [];
      if (texts.length === 0) {
        summaries[key] = escalationTemplate(e);
        continue;
      }
      const res = await enqueueJobsLane(supabase, {
        jobType: JOB_TYPE,
        prompt: `${SUMMARY_SYSTEM}\n\n${escalationUserPrompt(e, texts)}`,
        context: { key },
        dedupeKey: `${FEATURE_KEY}|${weekStart}|${key}`,
      });
      if (res.ok) {
        jobKeyById.set(res.jobId, key);
        enqueued++;
      } else {
        summaries[key] = escalationTemplate(e); // in_flight / error → template
      }
    }
    const results = await awaitJobsLaneResults(supabase, [...jobKeyById.keys()], {
      deadlineMs: JOBS_POLL_DEADLINE_MS,
    });
    for (const [jobId, key] of jobKeyById) {
      const text = results.get(jobId);
      const e = escalations.find((x) => escalationKey(x) === key)!;
      summaries[key] = text ?? escalationTemplate(e);
      if (text) aiFilled++;
    }
  } else {
    await Promise.all(
      escalations.map(async (e) => {
        summaries[escalationKey(e)] = await summarize(anthropic, modelId, e);
      })
    );
  }

  // 3) Apply the digest (idempotent per recipient per week).
  const { data: applyData, error: applyErr } = await supabase.rpc(
    'fn_scf_apply_weekly_escalation_digest',
    { p_week_start: weekStart, p_summaries: summaries }
  );
  if (applyErr) {
    console.error('[cron/session-feedback-escalation] apply failed:', applyErr);
    return NextResponse.json(
      { ok: false, error: applyErr.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  const summary = Array.isArray(applyData) ? applyData[0] : applyData;
  return NextResponse.json({
    ok: true,
    generation_lane: lane,
    week_start: weekStart,
    classes_flagged: summary?.classes_flagged ?? escalations.length,
    flagged: summary?.classes_flagged ?? escalations.length,
    recipients_notified: summary?.recipients_notified ?? 0,
    ...unattributedReport,
    enqueued,
    ai_used: lane === 'jobs' ? aiFilled > 0 : Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
