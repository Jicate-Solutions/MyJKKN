// =====================================================================
// Session Feedback (SCF) — Self-improving loop: scheduled suggestion generator
// =====================================================================
// Fixes loop gap #3: the "improve" step previously only fired when a human
// clicked "suggest improvement" in the UI — the loop was NOT autonomous.
// This daily cron scans for courses that had a feedback window in the last 7
// days (>=3 responses) and, per course, generates ONE of:
//   * a teaching-IMPROVEMENT suggestion  (avg understood < 3)            kind='improvement'
//   * a teaching-SUCCESS / what-worked   (avg >= 4.5 with >=1 comment)   kind='success'
//   * a teaching-IMPROVEMENT suggestion  (3 <= avg < 4.5 with >=2 comments
//       AND Claude judges >=2 of them are genuine help-asks)             kind='improvement'
// A good-average window with EXACTLY ONE genuine help-ask instead records a
// LEADERSHIP-ONLY concern (no teacher tip — n=1 would over-react; the struggling-
// note routine already supports that learner). Other middling windows get nothing.
// It then triggers outcome measurement so matured prior suggestions get their lift.
//
// 2026-07-01: widened the improvement gate beyond avg<3 — a good-average class can
// still hide a real pocket of confusion the numeric mean masks (e.g. avg 3.2 with
// 3 of 5 asking "explain slower"). Claude judges help-asks semantically so Tamil/
// Tanglish counts; the lone-voice case is routed to leadership, not the teacher.
// 2026-06-30: added the standout 'success' branch (learn from positive, not
// only from struggle) AND fixed the candidate listing, which read a relation
// 'scf_sessions' that never existed — the generator had been 500-ing on every
// scheduled run and producing zero suggestions. Now reads public.session_feedback.
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
// Sequential AI calls; bound the function so a slow batch can't run unbounded.
// Paired with BATCH_DEADLINE_MS below, which stops taking new targets before this.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

// ── constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6';
const BATCH_CAP = 25; // max courses to process per run; excess is logged
const WINDOW_DAYS = 7; // look back 7 days for fresh windows (low OR standout)
const MIN_RESPONSES = 3; // floor below which we skip AI (same as interactive route)
const LOW_UNDERSTOOD_THRESHOLD = 3; // avg_understood < this → 'improvement' suggestion
// avg_understood >= this AND >=1 written comment → 'success' suggestion. Gated to
// STANDOUT only (not every 4/5) so we don't generate ~125 rows of noise + Claude
// cost — capturing what worked is only worth it when a class clearly excelled.
const STANDOUT_THRESHOLD = 4.5;
// WIDENED gate (2026-07-01): a good/middling class (LOW <= avg < STANDOUT) can still
// hide a real pocket of confusion that the numeric avg masks. When it carries at least
// WIDENED_MIN_COMMENTS free-text comments, Claude judges how many are GENUINE help-asks
// (semantic, so Tamil/Tanglish count). >= WIDENED_MIN_ASKS genuine asks → a teacher
// improvement tip even in a good-average class; EXACTLY ONE ask → a leadership-only
// concern (no teacher tip — n=1 would over-react, and the struggling-note routine
// already supports that learner); zero → skip.
const WIDENED_MIN_COMMENTS = 2;
const WIDENED_MIN_ASKS = 2;
// Stop taking NEW targets once the batch has run this long, so the function
// finishes (incl. the outcome-measurement step) within maxDuration regardless of
// how slow individual Claude calls are. Headroom below the 300s maxDuration.
const BATCH_DEADLINE_MS = 240_000;

// Replicated verbatim from ai-suggest-improvement/route.ts so the model's
// output shape is identical — the record RPC stores the same JSON structure.
const SYSTEM_PROMPT = `You are a teaching-improvement assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback on how well they understood a session. You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Use ONLY the data provided; ground every suggestion in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must reference the next session's understanding score (the loop's verifier).`;

// The POSITIVE flip-side: when a class lands exceptionally well, capture WHAT
// WORKED as a reusable success pattern (replicate it, share with peers) instead
// of only patching failure. Different JSON shape (success-oriented), stored with
// kind='success'. Proven by a controlled demo before shipping (2026-06-30).
const SUCCESS_SYSTEM_PROMPT = `You are a teaching-excellence assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback, and this session landed exceptionally well (high understanding, positive comments). You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Your job: capture WHAT WORKED so the facilitator can deliberately repeat it and peers teaching the same course can learn from it. Use ONLY the data provided; ground every point in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "whatWorked": "...", "whyItLanded": ["..."], "replicateIn": [{"context":"...","how":"..."}], "shareWithPeers": "...", "watchNext": "..." }
Give 2-4 whyItLanded and 2-3 replicateIn. watchNext must reference sustaining this in the next session's understanding score (the loop's verifier).`;

// Judge prompt for the WIDENED gate: count how many anonymous comments are GENUINE
// requests for help / signals of not understanding. Semantic + multilingual so a
// Tamil or Tanglish ask ("puriyala", "slow-a sollunga") is caught where a keyword
// match would miss it. Returns a count + a short AGGREGATE summary (no verbatim
// quote, no student identity) used for the leadership-concern card.
const HELP_ASK_JUDGE_PROMPT = `You classify anonymous post-class student comments for an Indian higher-education institution. Comments may be in English, Tamil, or a Tamil-English mix (Tanglish).
Count how many DISTINCT comments are a GENUINE request for help or a clear signal the student did not understand the session — e.g. "please explain slower", "I couldn't follow the derivation", "need clearer examples", "puriyala", "slow-a sollunga". Do NOT count praise, thanks, logistics (timing/room/audio), or neutral remarks.
Return ONLY valid JSON (no markdown, no code fences, no commentary), exactly:
{ "help_ask_count": <integer>, "summary": "<one short aggregate sentence naming the kind of help asked for; NEVER quote a comment verbatim and NEVER identify a student>" }`;

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

// WIDENED gate — judge how many free-text comments are genuine help-asks. Returns a
// count + an aggregate summary. Fails SAFE to { helpAskCount: 0 } so a judge error
// never fabricates a teacher tip or a leadership concern out of thin air.
async function judgeHelpAsks(
  anthropic: Anthropic,
  freeTexts: string[],
  courseCode: string
): Promise<{ helpAskCount: number; summary: string; modelUsed: string }> {
  const numbered = freeTexts.map((t, i) => `${i + 1}. ${String(t).trim()}`).join('\n');
  try {
    const resp = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 400,
        system: HELP_ASK_JUDGE_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Course: ${courseCode}\nAnonymous comments:\n${numbered}\n\nReturn the JSON now.`,
          },
        ],
      },
      { timeout: 20_000 }
    );
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(jsonStr) as { help_ask_count?: unknown; summary?: unknown };
    const n = Number(parsed.help_ask_count);
    const helpAskCount = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 400) : '';
    return { helpAskCount, summary, modelUsed: resp.model };
  } catch (err) {
    console.error('[cron/scf-generate-suggestions] help-ask judge failed:', err);
    return { helpAskCount: 0, summary: '', modelUsed: 'error' };
  }
}

// WIDENED gate spend guard — has this (course, faculty, institution) window ALREADY
// produced an improvement tip OR a leadership concern in the lookback? The cron
// re-scans a rolling window daily, so without this a persistently-middling course
// would be re-judged (paid) every run. Returns true=handled (skip judge),
// false=fresh (judge it), null=query error (caller fails closed → skip).
async function widenedWindowAlreadyHandled(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: CourseTarget,
  normFaculty: string | null,
  since: string
): Promise<boolean | null> {
  // 1) an improvement suggestion for this course+window?
  let sugQ = admin
    .from('scf_ai_suggestions')
    .select('id')
    .eq('course_code', target.course_code)
    .eq('kind', 'improvement')
    .eq('domain', 'session_feedback')
    .gte('generated_at', since)
    .limit(1);
  sugQ = target.institution_id
    ? sugQ.eq('institution_id', target.institution_id)
    : sugQ.is('institution_id', null);
  sugQ = normFaculty ? sugQ.eq('faculty_email', normFaculty) : sugQ.is('faculty_email', null);
  const { data: sug, error: sugErr } = await sugQ;
  if (sugErr) {
    console.error('[cron/scf-generate-suggestions] widened guard (suggestions) failed:', sugErr);
    return null;
  }
  if (sug && sug.length > 0) return true;

  // 2) a leadership concern for this course+window?
  let conQ = admin
    .from('scf_leadership_concerns')
    .select('id')
    .eq('course_code', target.course_code)
    .gte('created_at', since)
    .limit(1);
  conQ = target.institution_id
    ? conQ.eq('institution_id', target.institution_id)
    : conQ.is('institution_id', null);
  conQ = normFaculty ? conQ.eq('faculty_email', normFaculty) : conQ.is('faculty_email', null);
  const { data: con, error: conErr } = await conQ;
  if (conErr) {
    console.error('[cron/scf-generate-suggestions] widened guard (concerns) failed:', conErr);
    return null;
  }
  return !!(con && con.length > 0);
}

// Generate a suggestion JSON via Claude. Returns null on any failure (including
// missing API key) so the cron can still record outcomes and continue the batch.
async function generateSuggestion(
  anthropic: Anthropic | null,
  kind: 'improvement' | 'success',
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

  // Branch on kind: the low path patches what failed; the success path captures
  // what worked. Same aggregate signal, different system prompt + closing line +
  // JSON shape. trackRecord (prior-advice feedback) only applies to improvement.
  const systemPrompt = kind === 'success' ? SUCCESS_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const closingLine =
    kind === 'success'
      ? 'Capture what worked as reusable success-pattern JSON now.'
      : 'Generate the teaching-improvement JSON now.';

  const userPrompt = `Course: ${courseCode}
Window: ${windowFrom} to ${windowTo}
Responses: ${signal.responses}
Low-understanding responses (understood <= 2 of 5): ${signal.low_responses}
Average understanding (1-5): ${signal.avg_understood ?? 'n/a'}

Anonymized student comments:
${commentBlock}${trackRecord}

${closingLine}`;

  try {
    const resp = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      // Bound each call so one hung request can't eat the whole batch's wall-clock
      // (sequential calls, capped at BATCH_CAP, under the Vercel function limit).
      { timeout: 25_000 }
    );

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

  // 2) Find courses with a fresh feedback window via fn_scf_candidate_windows,
  //    which returns DISTINCT (institution_id, course_code, faculty_email) tuples
  //    that have >=3 responses in the window. Aggregating in the DB (instead of
  //    reading every session_feedback response row and de-duping in JS) avoids
  //    PostgREST's default ~1000-row cap, which would otherwise SILENTLY drop
  //    courses — and whole tenants — once a window exceeds 1000 responses. The
  //    >=3 floor mirrors fn_scf_ai_signal's HAVING, so we only list tuples the
  //    signal function would actually score.
  //    NOTE: an earlier version read a relation 'scf_sessions' that does not
  //    exist — the listing 500'd on every run, so the generator never produced a
  //    suggestion. Fixed 2026-06-30.
  const { data: candidates, error: listErr } = await admin.rpc('fn_scf_candidate_windows', {
    p_from: windowFrom,
    p_to: windowTo,
  });

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

  // 5) For each target: read signal, classify the window (low / standout / skip),
  //    generate the matching suggestion, record it with its kind.
  let generated = 0;
  let generatedImprovement = 0;
  let generatedSuccess = 0;
  let skipped = 0;
  let guardErrors = 0; // regen-guard query failures — surfaced so a fail-closed stall is visible
  let leadershipFlagged = 0; // lone-voice concerns routed to leadership (no teacher tip)

  for (const target of targets) {
    // Stop taking new targets near the function time limit (the measure-outcomes
    // step below still runs, so the loop closes cleanly). Leftover candidates are
    // picked up next run — the fair-rotation order means they sort first.
    if (Date.now() - started > BATCH_DEADLINE_MS) {
      console.warn(
        `[cron/scf-generate-suggestions] batch deadline reached (${generated} generated) — stopping early, remainder deferred to next run`
      );
      break;
    }

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

    // Count only non-blank comments. fn_scf_ai_signal already filters blank
    // free_text, but trim defensively so a whitespace-only comment can't trip the
    // success gate into a paid generation on a window with no real feedback.
    const freeTexts: string[] = (signal?.free_texts ?? [])
      .map((t) => String(t ?? '').trim())
      .filter((t) => t.length > 0);
    const freeTextCount = freeTexts.length;

    // Classify the window:
    //   below the response floor / no avg          → skip (not enough signal)
    //   avg < LOW_UNDERSTOOD_THRESHOLD              → 'improvement' (patch what failed)
    //   avg >= STANDOUT_THRESHOLD + comment         → 'success'     (capture what worked)
    //   LOW <= avg < STANDOUT AND >= WIDENED_MIN_COMMENTS comments → AI-judge help-asks:
    //       >= WIDENED_MIN_ASKS genuine asks → 'improvement' (a real recurring ask despite a good avg)
    //       exactly 1 genuine ask            → leadership-only concern (no teacher tip; the
    //                                          struggling-note routine already supports that learner)
    //       0 genuine asks                   → skip (comments were praise/neutral)
    //   otherwise (middling window, < 2 comments)   → skip (nothing actionable)
    if (responses < MIN_RESPONSES || avgUnderstood === null) {
      skipped++;
      continue;
    }

    // Lookback + normalised faculty, used by BOTH the widened-gate spend guard and the
    // regen guard below. faculty_email is normalised to match how the record fn stores it.
    const recentSince = isoDate(new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000));
    const normFaculty = target.faculty_email
      ? target.faculty_email.trim().toLowerCase() || null
      : null;

    let kind: 'improvement' | 'success' | null = null;
    if (avgUnderstood < LOW_UNDERSTOOD_THRESHOLD) {
      kind = 'improvement';
    } else if (avgUnderstood >= STANDOUT_THRESHOLD && freeTextCount >= 1) {
      kind = 'success';
    } else if (freeTextCount >= WIDENED_MIN_COMMENTS && anthropic) {
      // WIDENED path — a good/middling class with enough comments. Spend guard FIRST:
      // if this window already produced an improvement tip OR a leadership concern,
      // don't re-pay Claude to re-judge it (the cron re-scans a rolling window daily).
      const handled = await widenedWindowAlreadyHandled(admin, target, normFaculty, recentSince);
      if (handled === null) {
        // guard query failed → fail closed (skip, don't risk re-spend). Surfaced via guardErrors.
        guardErrors++;
        skipped++;
        continue;
      }
      if (handled) {
        skipped++;
        continue;
      }
      const judged = await judgeHelpAsks(anthropic, freeTexts, target.course_code);

      // Record via the leadership-concern upsert. A non-null summary is a real lone-voice
      // concern (surfaces on the card); a NULL summary is a "judged, no concern" spend-guard
      // marker (the reader RPC filters NULL summaries, so it never surfaces — it only stops
      // the daily rolling rescan from re-billing Claude to re-judge the same window).
      // fn_scf_record_leadership_concern returns {data,error} and does NOT throw on a
      // Postgres error, so check .error explicitly — a swallowed error would over-count
      // leadershipFlagged and silently drop the write. Best-effort: never aborts the batch.
      const recordConcern = async (summary: string | null): Promise<boolean> => {
        try {
          const { error: recErr } = await admin.rpc('fn_scf_record_leadership_concern', {
            p_institution_id: target.institution_id,
            p_course_code: target.course_code,
            p_faculty_email: target.faculty_email,
            p_window_from: target.window_from,
            p_window_to: target.window_to,
            p_responses: responses,
            p_avg: avgUnderstood,
            p_summary: summary,
            p_model: judged.modelUsed,
          });
          if (recErr) {
            console.error(
              `[cron/scf-generate-suggestions] leadership-concern record failed for ${target.course_code}:`,
              recErr
            );
            return false;
          }
          return true;
        } catch (leadErr) {
          console.error(
            `[cron/scf-generate-suggestions] leadership-concern record threw for ${target.course_code}:`,
            leadErr
          );
          return false;
        }
      };

      if (judged.helpAskCount >= WIDENED_MIN_ASKS) {
        kind = 'improvement';
      } else if (judged.helpAskCount === 1) {
        // Lone voice → leadership-only concern (real summary), NOT a teacher tip. Only
        // count it when the write actually succeeded.
        if (await recordConcern(judged.summary)) leadershipFlagged++;
        skipped++;
        continue;
      } else {
        // 0 genuine asks → praise/neutral comments. Record a NULL-summary marker so the
        // spend guard suppresses re-judging (and re-billing) this window on the next run.
        await recordConcern(null);
        skipped++;
        continue;
      }
    }
    if (kind === null) {
      skipped++;
      continue;
    }

    // Regen guard: skip if a same-kind suggestion for this course was already
    // generated within the lookback window. The cron runs daily over a rolling
    // 7-day window, so without this a persistently-low or persistently-standout
    // course would be re-sent to Claude on every run (the upsert only dedupes
    // identical window dates, which shift daily). Caps spend to ~once per window per kind.
    let recentQuery = admin
      .from('scf_ai_suggestions')
      .select('id')
      .eq('course_code', target.course_code)
      .eq('kind', kind)
      .eq('domain', 'session_feedback')
      .gte('generated_at', recentSince)
      .limit(1);
    recentQuery = target.institution_id
      ? recentQuery.eq('institution_id', target.institution_id)
      : recentQuery.is('institution_id', null);
    recentQuery = normFaculty
      ? recentQuery.eq('faculty_email', normFaculty)
      : recentQuery.is('faculty_email', null);
    const { data: recentRows, error: recentErr } = await recentQuery;
    if (recentErr) {
      // Fail CLOSED: this guard caps paid Claude spend, so on a query error we
      // SKIP generation rather than risk re-billing every candidate on every run
      // (a transient PostgREST error would otherwise defeat the once-per-window
      // cap). The error is logged for ops; the next run recovers. A persistent
      // error stalls generation — preferable to unbounded spend in a broken state.
      console.error(
        `[cron/scf-generate-suggestions] regen-guard check failed for ${target.course_code} — skipping to avoid re-spend:`,
        recentErr
      );
      guardErrors++;
      skipped++;
      continue;
    }
    if (recentRows && recentRows.length > 0) {
      skipped++;
      continue;
    }

    // The 'improvement' path feeds the prior-advice track record back into the
    // prompt (self-improving). The 'success' path has no prior-advice loop — it
    // captures a fresh standout — so it skips the track-record fetch.
    const trackRecord =
      kind === 'improvement'
        ? await buildTrackRecordBlock(
            admin,
            target.course_code,
            target.faculty_email,
            target.institution_id
          )
        : '';

    const { suggestion, modelUsed } = await generateSuggestion(
      anthropic,
      kind,
      target.course_code,
      signal as SignalRow,
      target.window_from,
      target.window_to,
      trackRecord
    );

    // Record the suggestion. fn_scf_record_suggestion upserts on
    // (institution, course, faculty, window, domain) — a duplicate call is safe.
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
          p_kind: kind,
        });
        generated++;
        if (kind === 'success') generatedSuccess++;
        else generatedImprovement++;
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
    generated_improvement: generatedImprovement,
    generated_success: generatedSuccess,
    skipped,
    guard_errors: guardErrors, // >0 with generated=0 signals a fail-closed regen-guard stall
    leadership_flagged: leadershipFlagged, // lone-voice concerns routed to leadership (no teacher tip)
    measured,
    ai_available: Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
