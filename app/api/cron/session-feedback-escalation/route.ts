// =====================================================================
// Session Feedback (SCF) — Weekly tiered escalation digest cron
// =====================================================================
// Closes class-feedback loop gaps #2 (escalation PUSH to leadership — was
// pull-only) + #3 (AI summary AT escalation). Runs WEEKLY (Mondays 07:30 UTC).
// For every (faculty + course) that escalated last week (>= 3 responses AND
// avg understanding < 3), it:
//   1. fn_scf_compute_weekly_escalations(week_start) → the escalated classes +
//      their anonymized free_texts (SERVICE-ROLE-ONLY read).
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
import Anthropic from '@anthropic-ai/sdk';
import {
  resolveChatModel,
  recordChatUsage,
} from '@/lib/services/platform/ai-clients/chat';
import { getModel } from '@/lib/services/platform/ai-providers';

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure).
const FEATURE_KEY = 'session_feedback.escalation';

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

const SUMMARY_SYSTEM = `You write a 2-3 sentence briefing for a department head or principal about ONE class whose students gave anonymous post-class feedback indicating low understanding. You receive ONLY aggregate numbers and anonymized comment themes — never any student identity. Speak only in aggregate themes; NEVER quote a comment verbatim and NEVER refer to an individual student. Be concrete, India higher-education context aware, and end with the single most useful next step for the teacher. Return PLAIN TEXT only (2-3 sentences, no markdown, no preamble).`;

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

async function summarize(
  anthropic: Anthropic | null,
  modelId: string,
  e: Escalation
): Promise<string> {
  const avg = e.avg_understood ?? 'n/a';
  const template = `Average understanding ${avg}/5 across ${e.responses} learners — below the escalation threshold. Review recent ${e.course_name || e.course_code} sessions and pace/clarity with the teacher.`;
  const texts = Array.isArray(e.free_texts) ? e.free_texts.filter(Boolean) : [];
  if (!anthropic || texts.length === 0) return template;
  try {
    const userPrompt = `Course: ${e.course_name || e.course_code} (${e.course_code})
Responses: ${e.responses}
Average understanding (1-5): ${avg}

Anonymized student comment themes:
${texts.map((t) => `- ${String(t).trim()}`).join('\n')}

Write the 2-3 sentence leadership briefing now.`;
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
      await recordCall(modelId, t0, null, apiErr);
      throw apiErr; // outer catch keeps the template fallback — summarize NEVER throws outward
    }
    await recordCall(modelId, t0, resp);
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

  const started = Date.now();
  const supabase = createServiceRoleClient();

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
  if (escalations.length === 0) {
    return NextResponse.json({
      ok: true,
      week_start: weekStart,
      classes_flagged: 0,
      recipients_notified: 0,
      elapsed_ms: Date.now() - started,
    });
  }

  // 2) Generate a per-class AI summary (graceful template fallback).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  // Resolve the model from ai_model_config ONCE per run (never throws — hardcoded
  // fallback on any config failure), before the parallel summarize fan-out.
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);
  const summaries: Record<string, string> = {};
  await Promise.all(
    escalations.map(async (e) => {
      const key = `${e.faculty_email}|${e.course_code}`;
      summaries[key] = await summarize(anthropic, modelId, e);
    })
  );

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
    week_start: weekStart,
    classes_flagged: summary?.classes_flagged ?? escalations.length,
    recipients_notified: summary?.recipients_notified ?? 0,
    ai_used: Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
