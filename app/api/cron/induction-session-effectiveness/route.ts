// =====================================================================
// Fresher Induction — session-effectiveness loop GENERATOR (#1, the "suggest" arm)
// =====================================================================
// The per-session counterpart to /api/cron/induction-generate-playbook (which is
// the ANNUAL cohort loop). This one runs on the batch-rotation FAST PATH: it finds
// weak induction session TOPICS (a topic whose first batch run scored below
// threshold with >= k responses), asks the model for a concrete value-first
// improvement to try on the NEXT batch run, and records it
// (fn_induction_record_session_tip). Then it runs the RTM-corrected verifier
// (fn_induction_measure_session_effectiveness) so any topic whose re-run has
// matured gets its HONEST net_effect (lift above the regression-to-the-mean
// baseline estimated from untreated re-run pairs — never withholds help).
//
// Cadence: every ~4h (vercel.json) so a morning-weak topic can be tipped before
// its afternoon/next-day Batch B run. Cheap no-op when no induction is active
// (candidates returns nothing -> no AI call).
//
// Pattern mirrors /api/cron/induction-generate-playbook (auth, client, AI call,
// graceful no-key). AI logic is replicated, not imported, to keep ownership clean.
//
// Auth: CRON_SECRET via Authorization: Bearer OR ?secret=. Env: CLAUDE_API_KEY or
// ANTHROPIC_API_KEY (absent -> generation skipped, verifier still runs).
// Created: 2026-06-29.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shouldDeferToMaxLane } from '@/lib/services/platform/max-lane-deferral';
import Anthropic from '@anthropic-ai/sdk';
import {
  resolveChatModel,
  recordChatCall,
} from '@/lib/services/platform/ai-clients/chat';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure).
const FEATURE_KEY = 'induction.session_effectiveness';
const THRESHOLD = 3.5; // a topic's first-run avg below this is "weak"
const MIN_RESPONSES = 3; // anonymity + signal floor
const EVENT_CAP = 50; // max induction events to scan per run
const CANDIDATE_CAP = 40; // max weak topics to tip per run (cost bound)

// ₹0 Max-lane migration (§B): the ai_job_types row (seeded 20260713170000) + the
// flip-back switch. This is a SINGLE-SHOT loop restructured into enqueue+collect
// on lane='jobs' (the inline messages.create path stays for 'direct').
const JOB_TYPE = FEATURE_KEY;
const GENERATION_LANE_KEY = 'loops.induction_session_effectiveness.generation_lane';

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

const SYSTEM_PROMPT = `You are an induction-session coach for an Indian higher-education group (JKKN). A fresher induction runs the SAME session topic to multiple batches (Batch A, then Batch B). One topic's FIRST batch run scored low on a 1-5 "was this session valuable to you" rating. Your job: propose a concrete, value-first way to improve that SAME topic for its NEXT batch run.
HARD RULES:
- Improve the GENUINE value freshers experience (clarity, relevance, engagement, pace, examples) — never propose anything that games the rating without improving the session.
- Be specific and actionable for a resource person to apply in the next run (concrete changes, not platitudes).
- India higher-education context aware.
CAUSAL HUMILITY: a low score can be noise; the platform measures your tip's effect against a regression-to-the-mean baseline, so only a REAL improvement counts. Aim for real improvement, not a number.
Return ONLY valid JSON (no markdown, no fences) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "improvements": [{"title":"...","how":"..."}], "watchNext": "..." }
Give 2-3 likelyCauses and 2-4 improvements. watchNext must reference the next batch run's value rating.`;

type Candidate = {
  event_id: string;
  institution_id: string;
  topic_key: string;
  first_session_id: string;
  title: string;
  window_start: string | null;
  input_avg: number;
  input_responses: number;
};

// The per-topic user prompt — shared by the inline (direct) path and the jobs-
// lane enqueue so both feed the model identical instructions (byte-parity).
function buildEffectivenessPrompt(c: Candidate): string {
  return `Session topic: "${c.title}"
First batch run value rating: ${c.input_avg} / 5 (from ${c.input_responses} freshers)
Threshold for "weak": ${THRESHOLD}
Propose the value-first improvement JSON for this topic's NEXT batch run now.`;
}

// Parse the model's tip JSON (strip fences; null on failure) — shared by both
// lanes so the recorded suggestion shape is identical.
function parseTipText(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (err) {
    console.error('[cron/induction-session-effectiveness] AI output parse failed:', err);
    return null;
  }
}

async function generateTip(
  anthropic: Anthropic | null,
  modelId: string,
  c: Candidate
): Promise<{ tip: Record<string, unknown> | null; modelUsed: string }> {
  if (!anthropic) return { tip: null, modelUsed: 'none' };
  const userPrompt = buildEffectivenessPrompt(c);
  try {
    const t0 = Date.now();
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create(
        { model: modelId, max_tokens: 900, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] },
        { timeout: 60000 }
      );
    } catch (apiErr) {
      await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, null, apiErr);
      throw apiErr; // outer catch keeps the { tip: null, modelUsed: 'error' } sentinel
    }
    await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, resp);
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return { tip: parseTipText(text), modelUsed: resp.model };
  } catch (err) {
    console.error('[cron/induction-session-effectiveness] AI generation failed:', err);
    return { tip: null, modelUsed: 'error' };
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

  // Runner-aware Max-lane deferral: when the maxlane:induction-session-effectiveness
  // schedule row owns this routine (max_only pin, or enabled + fresh heartbeat),
  // the Max twin runs this tip generator on the runner box — stand down this run.
  // Fail-open: any schedules-read problem and the cloud generator runs normally.
  // Harmless either way (record is idempotent), but deferring keeps the twin the
  // primary lane.
  const started = Date.now();
  const admin = createServiceRoleClient();

  // ₹0 Max-lane migration (§B): 'jobs' (default after PR) = enqueue each tip onto
  // the #1998 ai_jobs registry (generic Windows seat drain, ₹0) + a jobs-lane
  // collect records it; 'direct' = the legacy inline Anthropic path. Flip-back.
  const lane = await readGenerationLane(admin);

  // Manifest-twin deferral applies ONLY on 'direct'. On 'jobs' the cron feeds
  // ai_jobs itself. Overlap is idempotency-safe (fn_induction_record_session_tip
  // upserts on the per-topic identity).
  if (lane === 'direct' && (await shouldDeferToMaxLane('induction-session-effectiveness'))) {
    console.log('[cron/induction-session-effectiveness] deferred to Max manifest twin (direct lane)');
    return NextResponse.json({
      ok: true,
      generation_lane: lane,
      generated: 0,
      skipped: 0,
      measured: null,
      deferred_to_max_lane: true,
    });
  }

  // 1) Discover induction events (every event with an induction program).
  const { data: programs, error: progErr } = await admin
    .from('induction_programs')
    .select('event_id')
    .not('event_id', 'is', null)
    .limit(5000);
  if (progErr) {
    return NextResponse.json({ ok: false, error: progErr.message, elapsed_ms: Date.now() - started }, { status: 500 });
  }
  const eventIds = [...new Set((programs ?? []).map((p) => p.event_id).filter(Boolean))].slice(0, EVENT_CAP) as string[];

  // 2) Collect weak-topic candidates across events.
  const candidates: Candidate[] = [];
  for (const eventId of eventIds) {
    const { data, error } = await admin.rpc('fn_induction_session_loop_candidates', {
      p_event_id: eventId,
      p_threshold: THRESHOLD,
      p_min_responses: MIN_RESPONSES,
    });
    if (error) {
      console.error('[cron/induction-session-effectiveness] candidates failed for', eventId, error);
      continue;
    }
    for (const c of (data ?? []) as Candidate[]) candidates.push(c);
  }

  let cappedCandidates = 0;
  let toTip = candidates;
  if (candidates.length > CANDIDATE_CAP) {
    cappedCandidates = candidates.length - CANDIDATE_CAP;
    toTip = candidates.slice(0, CANDIDATE_CAP);
    console.warn(`[cron/induction-session-effectiveness] candidate cap hit: ${candidates.length}, tipping ${CANDIDATE_CAP}, skipping ${cappedCandidates}`);
  }

  // 3) Initialise Anthropic (absent -> generation skipped, verifier still runs).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  if (!anthropic) {
    console.warn('[cron/induction-session-effectiveness] no API key — skipping generation, still running verifier');
  }
  // Resolve the model from ai_model_config ONCE per run (never throws — hardcoded
  // fallback on any config failure).
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

  // 4) Generate + record a tip per weak topic.
  let generated = 0;
  let skipped = 0;
  let enqueued = 0;

  // Shared record — identical rows on both lanes (byte-parity of effects). .rpc()
  // returns { error } (never throws), so inspect it explicitly.
  const recordTip = async (c: Candidate, tip: Record<string, unknown>, model: string): Promise<boolean> => {
    const { error: recErr } = await admin.rpc('fn_induction_record_session_tip', {
      p_event_id: c.event_id,
      p_institution_id: c.institution_id,
      p_topic_key: c.topic_key,
      p_first_session_id: c.first_session_id,
      p_window_start: c.window_start,
      p_input_avg: c.input_avg,
      p_input_responses: c.input_responses,
      p_suggestion: tip,
      p_model: model,
    });
    if (recErr) {
      console.error('[cron/induction-session-effectiveness] record failed:', recErr);
      return false;
    }
    return true;
  };

  if (lane === 'jobs') {
    // ₹0 Max lane: collect prior runs' done tips and record them, then enqueue
    // this run's candidates (no Anthropic key needed). fn_ai_collect_claim stamps
    // delivered_at → each tip records at most once; the drain runs the prompt on
    // the Max subscription and returns the tip JSON in ai_jobs.result.
    try {
      const items = await collectJobsLane(admin, [JOB_TYPE], CANDIDATE_CAP);
      for (const item of items) {
        const c = item.context as unknown as Candidate;
        const text = item.message
          ? item.message.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map((b) => b.text)
              .join('')
              .trim()
          : null;
        const tip = parseTipText(text);
        if (tip === null || !c?.event_id) {
          skipped++;
          continue;
        }
        if (await recordTip(c, tip, 'max-lane')) generated++;
        else skipped++;
      }
    } catch (e) {
      console.error('[cron/induction-session-effectiveness] jobs-lane collect failed:', e);
    }
    for (const c of toTip) {
      const res = await enqueueJobsLane(admin, {
        jobType: JOB_TYPE,
        prompt: `${SYSTEM_PROMPT}\n\n${buildEffectivenessPrompt(c)}`,
        context: c as unknown as Record<string, unknown>,
        dedupeKey: `${FEATURE_KEY}|${c.event_id}|${c.topic_key}|${c.first_session_id}`,
      });
      if (res.ok) enqueued++;
      else if (res.reason === 'in_flight') skipped++;
      else { console.warn(`[cron/induction-session-effectiveness] jobs-lane enqueue failed (${res.reason})`); skipped++; }
    }
  } else {
    for (const c of toTip) {
      const { tip, modelUsed } = await generateTip(anthropic, modelId, c);
      if (tip === null) {
        skipped++;
        continue;
      }
      if (await recordTip(c, tip, modelUsed)) generated++;
      else skipped++;
    }
  }

  // 5) Run the RTM-corrected verifier so matured re-runs get their honest net_effect.
  let measured: number | null = null;
  const { data: measureData, error: measureErr } = await admin.rpc(
    'fn_induction_measure_session_effectiveness',
    {}
  );
  if (measureErr) {
    console.error('[cron/induction-session-effectiveness] verifier failed:', measureErr);
  } else {
    measured = Array.isArray(measureData) ? (measureData[0] ?? 0) : (measureData as number | null);
  }

  return NextResponse.json({
    ok: true,
    generation_lane: lane,
    events: eventIds.length,
    candidates: candidates.length,
    capped: cappedCandidates,
    generated,
    enqueued,
    skipped,
    measured,
    ai_available: Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
