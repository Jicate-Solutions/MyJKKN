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
import Anthropic from '@anthropic-ai/sdk';
import {
  resolveChatModel,
  recordChatUsage,
} from '@/lib/services/platform/ai-clients/chat';
import { getModel } from '@/lib/services/platform/ai-providers';

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure).
const FEATURE_KEY = 'induction.session_effectiveness';
const THRESHOLD = 3.5; // a topic's first-run avg below this is "weak"
const MIN_RESPONSES = 3; // anonymity + signal floor
const EVENT_CAP = 50; // max induction events to scan per run
const CANDIDATE_CAP = 40; // max weak topics to tip per run (cost bound)

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

// Cost in INR from the pricing registry — null when pricing or token counts are missing.
function costInr(
  modelId: string,
  inputTokens?: number,
  outputTokens?: number
): number | null {
  const pricing = getModel('anthropic', modelId);
  if (
    !pricing ||
    pricing.inputPer1KTokensInr == null ||
    pricing.outputPer1KTokensInr == null
  ) {
    return null;
  }
  if (inputTokens == null || outputTokens == null) return null;
  return Number(
    (
      (inputTokens / 1000) * pricing.inputPer1KTokensInr +
      (outputTokens / 1000) * pricing.outputPer1KTokensInr
    ).toFixed(6)
  );
}

// Record one Claude invocation into ai_model_usage. recordChatUsage is internally
// non-throwing and MUST be awaited (Vercel serverless drops un-awaited promises).
async function recordCall(
  modelId: string,
  startedAt: number,
  resp: Anthropic.Message | null,
  err?: unknown
): Promise<void> {
  if (resp) {
    const inputTokens = resp.usage?.input_tokens;
    const outputTokens = resp.usage?.output_tokens;
    await recordChatUsage(FEATURE_KEY, 'anthropic', modelId, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr: costInr(modelId, inputTokens, outputTokens) ?? undefined,
      duration_ms: Date.now() - startedAt,
      success: true,
    });
  } else {
    await recordChatUsage(FEATURE_KEY, 'anthropic', modelId, {
      duration_ms: Date.now() - startedAt,
      success: false,
      error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
  }
}

async function generateTip(
  anthropic: Anthropic | null,
  modelId: string,
  c: Candidate
): Promise<{ tip: Record<string, unknown> | null; modelUsed: string }> {
  if (!anthropic) return { tip: null, modelUsed: 'none' };
  const userPrompt = `Session topic: "${c.title}"
First batch run value rating: ${c.input_avg} / 5 (from ${c.input_responses} freshers)
Threshold for "weak": ${THRESHOLD}
Propose the value-first improvement JSON for this topic's NEXT batch run now.`;
  try {
    const t0 = Date.now();
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create(
        { model: modelId, max_tokens: 900, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] },
        { timeout: 60000 }
      );
    } catch (apiErr) {
      await recordCall(modelId, t0, null, apiErr);
      throw apiErr; // outer catch keeps the { tip: null, modelUsed: 'error' } sentinel
    }
    await recordCall(modelId, t0, resp);
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return { tip: JSON.parse(jsonStr) as Record<string, unknown>, modelUsed: resp.model };
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

  const started = Date.now();
  const admin = createServiceRoleClient();

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
  for (const c of toTip) {
    const { tip, modelUsed } = await generateTip(anthropic, modelId, c);
    if (tip === null) {
      skipped++;
      continue;
    }
    try {
      await admin.rpc('fn_induction_record_session_tip', {
        p_event_id: c.event_id,
        p_institution_id: c.institution_id,
        p_topic_key: c.topic_key,
        p_first_session_id: c.first_session_id,
        p_window_start: c.window_start,
        p_input_avg: c.input_avg,
        p_input_responses: c.input_responses,
        p_suggestion: tip,
        p_model: modelUsed,
      });
      generated++;
    } catch (recErr) {
      console.error('[cron/induction-session-effectiveness] record failed:', recErr);
      skipped++;
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
    events: eventIds.length,
    candidates: candidates.length,
    capped: cappedCandidates,
    generated,
    skipped,
    measured,
    ai_available: Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
