// =====================================================================
// Session Feedback (SCF) — Self-improving loop: scheduled suggestion generator
// =====================================================================
// Fixes loop gap #3: the "improve" step previously only fired when a human
// clicked "suggest improvement" in the UI — the loop was NOT autonomous.
// This daily cron scans for courses that had a low-understanding window in
// the last 7 days (>=3 responses, avg understood < 3) and generates an AI
// teaching-improvement suggestion for each one that doesn't already have
// one for that window. It then triggers outcome measurement so matured
// prior suggestions get their lift attributed.
//
// Pattern mirrors /api/cron/session-feedback-escalation and
// /api/cron/scf-measure-outcomes (auth, client, response shape, logging).
// AI generation logic replicates (not imports) ai-suggest-improvement/route.ts
// to keep ownership boundaries clean — two files, two agents, no shared edits.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query
//   param. Same mechanism as all sibling SCF crons.
// Env dependency: CLAUDE_API_KEY or ANTHROPIC_API_KEY (same var as the
//   interactive ai-suggest-improvement route). No key → numeric-only fallback
//   (suggestion is null), but outcomes measurement still runs.
// Schedule: daily at 05:47 UTC (≈11:17 IST) — gap between ig-accounts-sync
//   (05:11) and instagram-monthly-audit (06:00 on 1st). Nothing else in that
//   window. Runs before the Indian working day so faculty see fresh suggestions.
// Created: 2026-06-28.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

// ── constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6';
const BATCH_CAP = 25; // max courses to process per run; excess is logged
const WINDOW_DAYS = 7; // look back 7 days for fresh low-understanding windows
const MIN_RESPONSES = 3; // floor below which we skip AI (same as interactive route)
const LOW_UNDERSTOOD_THRESHOLD = 3; // avg_understood < this → flagged for suggestion

// Replicated verbatim from ai-suggest-improvement/route.ts so the model's
// output shape is identical — the record RPC stores the same JSON structure.
const SYSTEM_PROMPT = `You are a teaching-improvement assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback on how well they understood a session. You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Use ONLY the data provided; ground every suggestion in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must reference the next session's understanding score (the loop's verifier).`;

// ── types ────────────────────────────────────────────────────────────────────

// Shape returned by fn_scf_ai_signal
type SignalRow = {
  responses: number;
  low_responses: number;
  avg_understood: number | null;
  free_texts: string[] | null;
};

// A course+faculty+institution tuple to process in a batch run
type CourseTarget = {
  institution_id: string | null;
  course_code: string;
  faculty_email: string | null;
  window_from: string;
  window_to: string;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Replicates the self-improving track-record block from ai-suggest-improvement
// so the autonomous suggestions also improve over time (same loop feed).
async function buildTrackRecordBlock(
  admin: ReturnType<typeof createServiceRoleClient>,
  courseCode: string,
  facultyEmail: string | null,
  institutionId: string | null
): Promise<string> {
  try {
    const { data: priorData } = await admin.rpc('fn_scf_prior_suggestion', {
      p_course_code: courseCode,
      p_faculty_email: facultyEmail,
      p_institution_id: institutionId,
    });
    const prior = Array.isArray(priorData) ? priorData[0] : priorData;
    if (!prior?.suggestion) return '';

    const priorSummary =
      prior.suggestion && typeof prior.suggestion === 'object'
        ? String(prior.suggestion.summary ?? JSON.stringify(prior.suggestion)).slice(0, 600)
        : String(prior.suggestion).slice(0, 600);
    const lift =
      prior.outcome_lift !== null && prior.outcome_lift !== undefined
        ? Number(prior.outcome_lift)
        : null;
    const liftLine = prior.has_outcome
      ? `After that advice, the next class's understanding moved ${lift !== null && lift >= 0 ? '+' : ''}${prior.outcome_lift} (from ${prior.input_avg}/5). ${lift !== null && lift >= 0.5 ? 'It helped somewhat — build on it.' : 'It did NOT meaningfully help — change the approach; do not repeat the same advice.'}`
      : `The outcome of that advice is not measured yet.`;
    const verdictLine = prior.human_verdict
      ? ` The teacher marked it: ${String(prior.human_verdict)}.`
      : '';
    return `\n\nYOUR PREVIOUS ADVICE FOR THIS CLASS (${String(prior.generated_at).slice(0, 10)}): ${priorSummary}\n${liftLine}${verdictLine}\nUse this track record: keep what worked, and propose a DIFFERENT, more specific adjustment for anything that did not move.`;
  } catch (err) {
    console.error('[cron/scf-generate-suggestions] prior fetch failed:', err);
    return '';
  }
}

// Generate a suggestion JSON via Claude. Returns null on any failure (including
// missing API key) so the cron can still record outcomes and continue the batch.
async function generateSuggestion(
  anthropic: Anthropic | null,
  courseCode: string,
  signal: SignalRow,
  windowFrom: string,
  windowTo: string,
  trackRecord: string
): Promise<{ suggestion: Record<string, unknown> | null; modelUsed: string }> {
  if (!anthropic) return { suggestion: null, modelUsed: 'none' };

  const freeTexts: string[] = Array.isArray(signal.free_texts) ? signal.free_texts : [];
  const commentBlock =
    freeTexts.length > 0
      ? freeTexts.map((t) => `- ${String(t).trim()}`).join('\n')
      : '- (no written comments — use the numeric signals)';

  const userPrompt = `Course: ${courseCode}
Window: ${windowFrom} to ${windowTo}
Responses: ${signal.responses}
Low-understanding responses (understood <= 2 of 5): ${signal.low_responses}
Average understanding (1-5): ${signal.avg_understood ?? 'n/a'}

Anonymized student comments:
${commentBlock}${trackRecord}

Generate the teaching-improvement JSON now.`;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const suggestion = JSON.parse(jsonStr) as Record<string, unknown>;
    return { suggestion, modelUsed: resp.model };
  } catch (err) {
    console.error('[cron/scf-generate-suggestions] AI generation failed:', err);
    return { suggestion: null, modelUsed: 'error' };
  }
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1) Authorize — same pattern as all CRON_SECRET sibling routes.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();

  // Allow explicit ?window_days= for manual/backfill runs.
  const windowParam = request.nextUrl.searchParams.get('window_days');
  const windowDays =
    windowParam && /^\d+$/.test(windowParam) ? parseInt(windowParam, 10) : WINDOW_DAYS;

  const today = new Date();
  const windowTo = isoDate(today);
  const windowFrom = isoDate(new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000));

  // 2) Find courses with a fresh low-understanding window.
  //    We query the underlying session feedback data to find (institution_id,
  //    course_code, faculty_email) tuples that have low avg understanding in
  //    the window. fn_scf_ai_signal is the canonical signal reader, but it
  //    operates per-course — we need a listing first.
  //    Direct table read is safe here: service-role bypasses RLS, and we only
  //    read aggregate-level data (no free_texts exposed in this listing).
  const { data: candidates, error: listErr } = await admin
    .from('scf_sessions')
    .select('institution_id, course_code, faculty_email')
    .gte('session_date', windowFrom)
    .lte('session_date', windowTo)
    .not('understood', 'is', null);

  if (listErr) {
    console.error('[cron/scf-generate-suggestions] listing failed:', listErr);
    return NextResponse.json(
      { ok: false, error: listErr.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  // Deduplicate to unique (institution_id, course_code, faculty_email) tuples.
  const seen = new Set<string>();
  const uniqueTargets: CourseTarget[] = [];
  for (const row of candidates ?? []) {
    const key = `${row.institution_id}|${row.course_code}|${row.faculty_email}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTargets.push({
        institution_id: row.institution_id as string | null,
        course_code: String(row.course_code),
        faculty_email: row.faculty_email as string | null,
        window_from: windowFrom,
        window_to: windowTo,
      });
    }
  }

  // 3) Cap the batch; log any truncation so ops can detect pressure.
  let cappedCount = 0;
  let targets = uniqueTargets;
  if (uniqueTargets.length > BATCH_CAP) {
    cappedCount = uniqueTargets.length - BATCH_CAP;
    targets = uniqueTargets.slice(0, BATCH_CAP);
    console.warn(
      `[cron/scf-generate-suggestions] batch cap hit: ${uniqueTargets.length} candidates found, processing only ${BATCH_CAP}, skipping ${cappedCount}`
    );
  }

  // 4) Initialise Anthropic client (gracefully absent → null, suggestion=null).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  if (!anthropic) {
    console.warn('[cron/scf-generate-suggestions] no API key — will skip generation but measure outcomes');
  }

  // 5) For each target: read signal, check threshold + existing suggestion, generate.
  let generated = 0;
  let skipped = 0;

  for (const target of targets) {
    const { data: signalData, error: signalErr } = await admin.rpc('fn_scf_ai_signal', {
      p_course_code: target.course_code,
      p_from: target.window_from,
      p_to: target.window_to,
      p_institution_id: target.institution_id,
      p_faculty_email: target.faculty_email,
    });

    if (signalErr) {
      console.error(
        `[cron/scf-generate-suggestions] signal failed for ${target.course_code}:`,
        signalErr
      );
      skipped++;
      continue;
    }

    const signal = (Array.isArray(signalData) ? signalData[0] : signalData) as SignalRow | null;
    const responses = Number(signal?.responses ?? 0);
    const avgUnderstood =
      signal?.avg_understood !== null && signal?.avg_understood !== undefined
        ? Number(signal.avg_understood)
        : null;

    // Below floor or above threshold → skip.
    if (
      responses < MIN_RESPONSES ||
      avgUnderstood === null ||
      avgUnderstood >= LOW_UNDERSTOOD_THRESHOLD
    ) {
      skipped++;
      continue;
    }

    // fn_scf_record_suggestion is idempotent on (course_code, faculty_email,
    // window_from, window_to) — a duplicate call is safe. We still prefer to
    // call AI + record only when there's new work, but a repeat is not harmful.
    const trackRecord = await buildTrackRecordBlock(
      admin,
      target.course_code,
      target.faculty_email,
      target.institution_id
    );

    const { suggestion, modelUsed } = await generateSuggestion(
      anthropic,
      target.course_code,
      signal as SignalRow,
      target.window_from,
      target.window_to,
      trackRecord
    );

    // Record the suggestion (or a null placeholder if AI was unavailable).
    // Best-effort — a record failure must not abort the batch.
    if (suggestion !== null) {
      try {
        await admin.rpc('fn_scf_record_suggestion', {
          p_institution_id: target.institution_id,
          p_course_code: target.course_code,
          p_faculty_email: target.faculty_email,
          p_window_from: target.window_from,
          p_window_to: target.window_to,
          p_input_responses: responses,
          p_input_low: Number(signal?.low_responses ?? 0),
          p_input_avg: avgUnderstood,
          p_suggestion: suggestion,
          p_model: modelUsed,
        });
        generated++;
      } catch (recErr) {
        console.error(
          `[cron/scf-generate-suggestions] record failed for ${target.course_code}:`,
          recErr
        );
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  // 6) Measure matured prior suggestions so their outcome_lift is attributed.
  //    Runs unconditionally after generation so the loop closes even on dry runs.
  let measured: number | null = null;
  const { data: measureData, error: measureErr } = await admin.rpc(
    'fn_scf_measure_suggestion_outcomes',
    { p_min_age_days: 1 }
  );
  if (measureErr) {
    console.error('[cron/scf-generate-suggestions] measure outcomes failed:', measureErr);
  } else {
    measured = Array.isArray(measureData) ? (measureData[0] ?? 0) : (measureData as number | null);
  }

  return NextResponse.json({
    ok: true,
    window: { from: windowFrom, to: windowTo, days: windowDays },
    candidates: uniqueTargets.length,
    capped: cappedCount,
    generated,
    skipped,
    measured,
    ai_available: Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
