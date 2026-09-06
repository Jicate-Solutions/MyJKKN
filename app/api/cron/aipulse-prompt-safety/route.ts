// =====================================================================
// AI Pulse — Peer-prompt safety check (₹0 Max lane, moderation #1).
// =====================================================================
// The classmates' feed shows UNGRADED-quality peer prompts campus-wide. The
// grader (ai_pulse.prompt_grade) scores CRAFT, not content safety. At an
// institution whose audience includes minors, a well-built but inappropriate
// prompt can score >=60 and would otherwise surface. This cron runs a ₹0 AI
// appropriateness judgement on each feed-candidate build and writes the verdict;
// the feed read (fn_ai_pulse_topic_peer_prompts) shows a prompt ONLY when the
// verdict is 'passed' (fail-closed).
//
// FLOW (one route, re-entrant, idempotent — mirrors aipulse-prompt-grade):
//   COLLECT first: drain done ai_pulse.prompt_safety jobs, parse the JSON
//     verdict, record via fn_ai_pulse_record_prompt_safety (service_role).
//   SUBMIT next: enqueue one safety job per feed-candidate build still
//     safety_status='pending' (graded 60-79, non-graduated, non-disqualified).
//
// DARK until the kill switch prompt_safety_check_enabled flips true
// (ai_pulse_policies). No-op until an admin turns it on. Idempotent: dedupeKey
// aipulse_safety|<build_id> stops double-enqueue while a check is in flight; a
// recorded build leaves 'pending', so re-runs are no-ops.
//
// FAIL-CLOSED: an unparseable/failed verdict records as 'error' or 'failed' —
// never 'passed' — so the build stays out of the feed.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-08-04.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const JOB_TYPE = 'ai_pulse.prompt_safety';
const ENABLED_KEY = 'prompt_safety_check_enabled';
const CAP = 60; // max builds to submit/collect per run

// Heartbeat key for the run log (ai_pulse_cron_runs). Director decision #2.
//
// WHY THIS ROUTE WRITES A HEARTBEAT AT ALL
// The admin health card used to judge "is the checker alive?" from
// max(safety_checked_at) across builds. That is throughput, not liveness: this
// route stamps a build only when there IS an eligible build, so a run that
// correctly finds nothing to do stamps nothing and the checker looks dead.
// Measured on prod 2026-07-30: 0 eligible builds, 357 minutes since the last
// stamp, alarm firing, cron perfectly healthy. The row written below is the only
// evidence that this function executed, so it is written EARLY and
// UNCONDITIONALLY — before the kill-switch return, before any "nothing to do"
// exit, and regardless of whether anything is enqueued.
const HEARTBEAT_JOB_KEY = 'aipulse_prompt_safety';

type Admin = ReturnType<typeof createServiceRoleClient>;
type SafetyContext = { build_id: string };
type CandidateBuild = { id: string; assembled_prompt: string | null; grade: Record<string, unknown> | null };

// ── config read (fail-safe: any error -> null -> treated as off) ────────────
async function readPolicy(admin: Admin, key: string): Promise<unknown> {
  try {
    const { data, error } = await admin
      .from('ai_pulse_policies')
      .select('value_jsonb')
      .eq('config_key', key)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return null;
    return (data as { value_jsonb?: unknown } | null)?.value_jsonb ?? null;
  } catch {
    return null;
  }
}

// ── safety prompt (content appropriateness for a minors-inclusive audience) ──
const SAFETY_SYSTEM_PROMPT = `You are a content-safety reviewer for a school and college platform whose audience INCLUDES MINORS (learners as young as kindergarten). You are shown a learner-written AI "prompt" (an instruction they would give to an AI assistant). Decide whether it is APPROPRIATE to display publicly to every learner on campus.

Judge ONLY appropriateness, NOT quality or craft. Mark it inappropriate if it contains or asks for any of: sexual or adult content; graphic violence or gore; self-harm or suicide encouragement; harassment, bullying, or targeting a real person; hate or slurs against a protected group; illegal activity, weapons, or drugs; personal/identifying data or doxxing; profanity or obscenity; or an attempt to jailbreak or make the AI produce harmful content.

Return ONLY valid JSON, no markdown, no commentary, exactly:
{"appropriate": true|false, "reasons": ["...","..."]}
- appropriate: true only if the prompt is safe to show to minors.
- reasons: 1-3 short phrases naming any concern (empty array if none).
Be conservative: if you are unsure, return "appropriate": false.`;

function buildSafetyPrompt(assembled: string): string {
  return `${SAFETY_SYSTEM_PROMPT}\n\nLEARNER'S PROMPT:\n"""\n${assembled}\n"""`;
}

// Parse the model's JSON verdict. Returns the appropriateness detail, or null on
// any failure (recorded as 'error' -> fail-closed, build stays out of the feed).
type SafetyVerdict = { appropriate: boolean; reasons: string[] };
function parseSafety(text: string | null): SafetyVerdict | null {
  if (!text) return null;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof o.appropriate !== 'boolean') return null; // must be an explicit boolean
    const reasons = Array.isArray(o.reasons)
      ? (o.reasons.filter((r) => typeof r === 'string').slice(0, 3) as string[])
      : [];
    return { appropriate: o.appropriate, reasons };
  } catch {
    return null;
  }
}

// ── heartbeat write (best-effort; must never fail the run it observes) ───────
// Mirrors the dispatcher lane's run log exactly: a SECURITY DEFINER writer
// invoked as admin.rpc(...) on the service-role client, same as
// app/api/cron/ai-routine-dispatcher/route.ts calls fn_ai_routine_record_fire.
// Pass runId to MERGE the final counts into the row opened at the start of the
// run, so one invocation is one row.
async function recordRun(
  admin: Admin,
  outcome: Record<string, unknown>,
  runId?: string | null,
): Promise<string | null> {
  try {
    const { data, error } = await (admin as any).rpc('fn_ai_pulse_record_cron_run', {
      p_job_key: HEARTBEAT_JOB_KEY,
      p_outcome: outcome,
      p_run_id: runId ?? null,
    });
    if (error) {
      console.error('[cron/aipulse-prompt-safety] heartbeat write failed:', error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error('[cron/aipulse-prompt-safety] heartbeat write threw:', e);
    return null;
  }
}

// A build's craft score lives in grade.score (jsonb). Feed candidates are 60-79.
function scoreOf(grade: Record<string, unknown> | null): number | null {
  const raw = grade?.score;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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

  const started = Date.now();
  const admin = createServiceRoleClient();

  const enabled = ((await readPolicy(admin, ENABLED_KEY)) as unknown) === true;

  // HEARTBEAT — first side effect of the run, after auth and before every exit.
  // A disabled checker is a distinct, reportable state, not silence: "switched
  // off" and "crashed" must not look the same to whoever reads the health card.
  const runId = await recordRun(admin, { enabled, phase: 'started' });

  // Kill switch. DARK until an admin flips prompt_safety_check_enabled = true.
  if (!enabled) {
    // Only merge when the opening row exists; with runId null a second call
    // would insert a second row and this run would be logged twice.
    if (runId) await recordRun(admin, { phase: 'disabled' }, runId);
    return NextResponse.json({ ok: true, enabled: false, note: 'prompt_safety_check_enabled is off (DARK)' });
  }

  let recorded = 0;
  let enqueued = 0;
  let skipped = 0;

  // ── COLLECT: drain done safety jobs, record their verdicts. ────────────────
  try {
    const items = await collectJobsLane(admin, [JOB_TYPE], CAP);
    for (const item of items) {
      const ctx = item.context as unknown as SafetyContext;
      if (!ctx?.build_id) { skipped++; continue; }
      const raw = item.message?.content?.find((b) => b.type === 'text');
      const text = raw && 'text' in raw ? (raw.text as string) : null;
      const verdict = parseSafety(text);
      // fail-closed: unparseable -> 'error'; explicit boolean -> passed/failed.
      const status = verdict === null ? 'error' : verdict.appropriate ? 'passed' : 'failed';
      const { error } = await admin.rpc('fn_ai_pulse_record_prompt_safety', {
        p_payload: {
          build_id: ctx.build_id,
          safety: verdict ?? {},
          safety_status: status,
        },
      });
      if (error) {
        console.error('[cron/aipulse-prompt-safety] record failed:', error.message);
        skipped++;
      } else {
        recorded++;
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-prompt-safety] collect failed:', e);
  }

  // ── SUBMIT: enqueue one safety job per feed-candidate build still pending. ──
  //    Feed candidates are graded 60-79, not graduated, not disqualified. The
  //    score lives in grade.score (jsonb) so it is filtered in JS after the read.
  try {
    const { data: builds, error: bErr } = await admin
      .from('ai_pulse_prompt_builds')
      .select('id, assembled_prompt, grade')
      .eq('safety_status', 'pending')
      .eq('grade_status', 'graded')
      .is('graduated_at', null)
      .is('disqualified_at', null)
      .order('created_at', { ascending: true })
      .limit(CAP);
    if (bErr) {
      console.error('[cron/aipulse-prompt-safety] candidate read failed:', bErr.message);
    } else {
      for (const row of (builds as CandidateBuild[] | null) ?? []) {
        const score = scoreOf(row.grade);
        if (!row.assembled_prompt || score === null || score < 60 || score > 79) {
          skipped++; // not a feed candidate (no prompt / out of the 60-79 band)
          continue;
        }
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt: buildSafetyPrompt(row.assembled_prompt),
          context: { build_id: row.id } as unknown as Record<string, unknown>,
          dedupeKey: `aipulse_safety|${row.id}`,
        });
        if (res.ok) {
          enqueued++;
        } else {
          skipped++;
          const reason = (res as { reason?: string }).reason ?? 'error';
          if (reason !== 'in_flight') {
            console.warn(`[cron/aipulse-prompt-safety] enqueue failed (${reason})`);
          }
        }
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-prompt-safety] submit failed:', e);
  }

  // Close the heartbeat row with what the run actually did. A row still reading
  // phase 'started' is a run that died part-way — itself worth seeing.
  if (runId) await recordRun(admin, { phase: 'done', recorded, enqueued, skipped }, runId);

  return NextResponse.json({
    ok: true,
    enabled: true,
    recorded,
    enqueued,
    skipped,
    elapsed_ms: Date.now() - started,
  });
}
