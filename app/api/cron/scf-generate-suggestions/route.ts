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
// 2026-07-04: ASYNC BATCH v2 — the Anthropic Message Batches are now submitted in
// one run and COLLECTED in a later run (the API is async: "up to 24h, most under
// an hour"). The old version blocked-polled a batch for 240s then cancelled,
// which regressed throughput and — worse — discarded already-completed+billed
// requests (lost work + re-bill). Now:
//   • SUBMIT (default GET, daily): scan candidates, apply the regen + in-flight
//     guards, and submit a judge batch and/or a generation batch. No polling.
//   • COLLECT (?mode=collect, every 30 min, AND collect-first on the daily run):
//     drain ENDED batches, record each request in ai_model_usage at the 50% rate
//     (idempotently), domain-record the results (suggestions / leadership concerns),
//     and — for judge results that elevate to a teacher tip — submit a follow-on
//     generation batch (async chaining). Cross-run state + exactly-once cost live
//     in ai_batch_jobs / ai_batch_job_items (migration 20260704093000).
// Prompts, guards, thresholds, and record semantics are UNCHANGED from the
// synchronous pilot — only the transport is async.
//
// Pattern mirrors /api/cron/session-feedback-escalation and
// /api/cron/scf-measure-outcomes (auth, client, response shape, logging).
// AI generation logic replicates (not imports) ai-suggest-improvement/route.ts
// to keep ownership boundaries clean — two files, two agents, no shared edits.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query.
// Env dependency: CLAUDE_API_KEY or ANTHROPIC_API_KEY. No key → no batches
//   submitted/collected, but outcome measurement still runs.
// Dispatch: SUBMIT is daily via ai-routine-dispatcher (ai_routine_schedules).
//   COLLECT is a */30 vercel.json cron hitting ?mode=collect.
// Created: 2026-06-28.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Async: submit is O(1) and collect only streams ENDED batches, so runs are
// short. Keep headroom for a large candidate scan + the measure RPC.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shouldDeferToMaxLane } from '@/lib/services/platform/max-lane-deferral';
import Anthropic from '@anthropic-ai/sdk';
import { resolveChatModel } from '@/lib/services/platform/ai-clients/chat';
import {
  submitBatch,
  collectEndedBatches,
  markJobCollected,
  partitionInFlight,
  MAX_COLLECT_ATTEMPTS,
  type SubmitBatchRequest,
  type SubmitBatchResult,
} from '@/lib/services/platform/ai-clients/batch';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

// ── constants ────────────────────────────────────────────────────────────────

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure). One feature key covers BOTH calls in this file (help-ask
// judge + suggestion generator).
const FEATURE_KEY = 'scf.generate_suggestions';

// ₹0 Max-lane migration (work order 2026-07-13 §B). The three ai_job_types this
// loop enqueues on lane='jobs' (seeded 20260713150000), one per pipeline stage,
// and the flip-back switch key. Prompt rides in payload.prompt (glue {{prompt}}).
const JOB_TYPE_JUDGE = 'scf.judge_help_ask';
const JOB_TYPE_IMPROVE = 'scf.suggest_improvement';
const JOB_TYPE_SUCCESS = 'scf.suggest_success';
const SCF_JOB_TYPES = [JOB_TYPE_JUDGE, JOB_TYPE_IMPROVE, JOB_TYPE_SUCCESS];
const GENERATION_LANE_KEY = 'loops.scf_generate_suggestions.generation_lane';

/** Read the generation-lane switch as a cron (fn_get_policy at global scope, no
 *  auth.uid). Fail-safe to 'direct' (the proven paid path) on any read error. */
async function readGenerationLane(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<'jobs' | 'direct'> {
  try {
    const { data, error } = await admin.rpc('fn_get_policy', {
      p_key: GENERATION_LANE_KEY,
      p_scope_id: null,
    });
    if (error) return 'direct';
    return data === 'jobs' ? 'jobs' : 'direct';
  } catch {
    return 'direct';
  }
}

/** The assembled prompt (system + first user turn) the direct path would have
 *  sent — extracted from an Anthropic request so the Max-lane job (glue
 *  {{prompt}}) feeds the model identical instructions. */
function promptFromParams(params: Anthropic.Messages.MessageCreateParamsNonStreaming): string {
  const system = typeof params.system === 'string' ? params.system : '';
  const first = params.messages?.[0]?.content;
  const user = typeof first === 'string' ? first : JSON.stringify(first);
  return `${system}\n\n${user}`;
}
const BATCH_CAP = 25; // max courses to scan+submit per run; excess is logged
// Director 2026-07-10 (decision 2): of the BATCH_CAP, up to this many slots are
// reserved for courses whose prior improvement note is already MEASURED and is
// awaiting its retry. Rotation orders never-suggested candidates first, so
// without a reserve a course with a graded note sorts behind hundreds of
// fresh candidates and the loop never closes on its own — the retry IS the loop.
const RETRY_SLOTS = 5;
const WINDOW_DAYS = 7; // look back 7 days for fresh windows (low OR standout)
const MIN_RESPONSES = 3; // floor below which we skip AI (same as interactive route)
const LOW_UNDERSTOOD_THRESHOLD = 3; // avg_understood < this → 'improvement' suggestion
// avg_understood >= this AND >=1 written comment → 'success' suggestion. Gated to
// STANDOUT only (not every 4/5) so we don't generate ~125 rows of noise + Claude cost.
const STANDOUT_THRESHOLD = 4.5;
// WIDENED gate (2026-07-01): a good/middling class (LOW <= avg < STANDOUT) can still
// hide a real pocket of confusion. When it carries at least WIDENED_MIN_COMMENTS
// free-text comments, Claude judges how many are GENUINE help-asks (semantic, so
// Tamil/Tanglish count). >= WIDENED_MIN_ASKS → a teacher tip; EXACTLY ONE → a
// leadership-only concern; zero → skip.
const WIDENED_MIN_COMMENTS = 2;
const WIDENED_MIN_ASKS = 2;
// MAX_COLLECT_ATTEMPTS (the stuck-job cap) is imported from ai-clients/batch so
// the collect-error path and this domain-record path share one threshold.

// Carry-forward answers ride INTO the free-text body as bracketed markers, prepended
// by learners/class-feedback/_components/feedback-dialog.tsx:
//   "[carry-forward: Yes]"  /  "[freetext-carry \"<summary>\": Partly]"
// A learner who answered the carry-forward question but wrote NO prose stores a
// comment that is only a marker — nothing for the judge to read. Left unstripped
// those markers count toward WIDENED_MIN_COMMENTS, so a class with zero written
// feedback still opens the widened gate and burns a judge run on empty strings.
// Measured on prod 2026-07-30: 2,923 of 5,642 stored free-text rows (51.8%) over
// 21 days are pure marker, and 93 of 284 judge runs were admitted to the gate by
// markers alone. Anchored at the START and non-greedy on "]" so a summary that
// itself contains "]" under-strips (leaves prose) rather than eating real text.
const CARRY_MARKER_RE = /^\s*\[(?:carry-forward|freetext-carry)\b[^\]]*\]\s*/i;

/** Strip leading carry-forward markers; '' when the comment was only markers. */
function stripCarryMarkers(raw: string): string {
  let out = raw.trim();
  let prev = '';
  while (out !== prev) {
    prev = out;
    out = out.replace(CARRY_MARKER_RE, '');
  }
  return out.trim();
}

// Replicated verbatim from ai-suggest-improvement/route.ts so the model's
// output shape is identical — the record RPC stores the same JSON structure.
const SYSTEM_PROMPT = `You are a teaching-improvement assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback on how well they understood a session. You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Use ONLY the data provided; ground every suggestion in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
NEVER state counts, sample sizes, response numbers, averages, percentages, rating scales, or trigger thresholds in your output — describe group size ONLY in the words given (e.g. a few learners, a small group) and understanding ONLY in the qualitative band words given. Printed numbers teach students and staff how to game the loop.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must describe, in words only, whether understanding holds or improves in the next session — never cite a number, score, average, or target.
CRITICAL: Never express understanding as a number, score, average, rating out of 5, or percentage, and never state a numeric target or threshold to reach. Describe understanding and its trend in words only (e.g. "understanding was strong", "a small cluster still struggled"). You may state how many students responded.`;

// The POSITIVE flip-side: when a class lands exceptionally well, capture WHAT WORKED.
const SUCCESS_SYSTEM_PROMPT = `You are a teaching-excellence assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback, and this session landed exceptionally well (high understanding, positive comments). You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Your job: capture WHAT WORKED so the facilitator can deliberately repeat it and peers teaching the same course can learn from it. Use ONLY the data provided; ground every point in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
NEVER state counts, sample sizes, response numbers, averages, percentages, rating scales, or trigger thresholds in your output — describe group size ONLY in the words given (e.g. a few learners, a small group) and understanding ONLY in the qualitative band words given. Printed numbers teach students and staff how to game the loop.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "whatWorked": "...", "whyItLanded": ["..."], "replicateIn": [{"context":"...","how":"..."}], "shareWithPeers": "...", "watchNext": "..." }
Give 2-4 whyItLanded and 2-3 replicateIn. watchNext must describe, in words only, whether this strong understanding is sustained in the next session — never cite a number, score, average, or target.
CRITICAL: Never express understanding as a number, score, average, rating out of 5, or percentage, and never state a numeric target or threshold to reach. Describe understanding and its trend in words only (e.g. "understanding was strong", "a small cluster still struggled"). You may state how many students responded.`;

// Judge prompt for the WIDENED gate: count ONLY (privacy — see the 1-ask branch).
const HELP_ASK_JUDGE_PROMPT = `You classify anonymous post-class student comments for an Indian higher-education institution. Comments may be in English, Tamil, or a Tamil-English mix (Tanglish).
Count how many DISTINCT comments are a GENUINE request for help or a clear signal the student did not understand the session — e.g. "please explain slower", "I couldn't follow the derivation", "need clearer examples", "puriyala", "slow-a sollunga". Do NOT count praise, thanks, logistics (timing/room/audio), or neutral remarks.
Return ONLY valid JSON (no markdown, no code fences, no commentary), exactly:
{ "help_ask_count": <integer> }`;

// ── types ────────────────────────────────────────────────────────────────────

// Shape returned by fn_scf_ai_signal
type SignalRow = {
  responses: number;
  low_responses: number;
  avg_understood: number | null;
  free_texts: string[] | null;
  // Exact contributing session dates (ISO yyyy-mm-dd) from fn_scf_ai_signal —
  // only closed-window sessions since the two-sided 48h window (2026-07-09).
  // The recorded note cites these (suggestion.contributing_dates).
  session_dates: string[] | null;
};

// A course+faculty+institution tuple to process in a run
type CourseTarget = {
  institution_id: string | null;
  course_code: string;
  faculty_email: string | null;
  window_from: string;
  window_to: string;
};

// Persisted per-item context (jsonb) — everything the collect run needs to
// record a result and (for judge items that elevate) build a generation batch.
type JudgeContext = {
  target: CourseTarget;
  responses: number;
  avg: number;
  low_responses: number;
  free_texts: string[];
  normFaculty: string | null;
  recentSince: string;
  session_dates: string[];
};
type GenContext = {
  target: CourseTarget;
  kind: 'improvement' | 'success';
  responses: number;
  low_responses: number;
  avg: number;
  session_dates: string[];
};

// ── helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function judgeDedupeKey(t: CourseTarget): string {
  return `${FEATURE_KEY}|judge|${t.institution_id ?? ''}|${t.course_code}|${t.faculty_email ?? ''}`;
}
function genDedupeKey(t: CourseTarget, kind: 'improvement' | 'success'): string {
  return `${FEATURE_KEY}|generate|${kind}|${t.institution_id ?? ''}|${t.course_code}|${t.faculty_email ?? ''}`;
}
function signalFromCtx(ctx: JudgeContext): SignalRow {
  return {
    responses: ctx.responses,
    low_responses: ctx.low_responses,
    avg_understood: ctx.avg,
    free_texts: ctx.free_texts,
    session_dates: ctx.session_dates ?? [],
  };
}

// Facilitator-facing understanding must never be a raw number: a printed
// baseline/target invites gaming ("ask students to score 3.6 every time"). The
// loop still records the numeric avg to the backend (p_input_avg) for its own
// measurement; only what the AI SEES and SAYS is qualitative. Bands mirror the
// generator's own gate thresholds (LOW_UNDERSTOOD_THRESHOLD / STANDOUT_THRESHOLD).
// Group size in WORDS for the prompt (Director, 2026-07-09: printed counts in
// tiny samples let a student subtract themselves and teach the trigger recipe).
function groupSizeWord(n: number): string {
  // NaN/0-safe (deep-review 2026-07-09 LOW, rounds 1+2): callers guard at
  // declaration (Number(x ?? 0)), but NaN < 6 / NaN < 16 are both false (would
  // print "a larger group"), and 0 is not "a few learners" — an empty or
  // uncountable sample gets the neutral phrase instead of a fabricated size.
  if (!Number.isFinite(n) || n <= 0) return 'the group';
  return n < 6 ? 'a few learners' : n < 16 ? 'a small group' : 'a larger group';
}

// Display band shown to the facilitator/AI. Recalibrated 2026-07-24 (Director
// interview) to Strong >= 4.0, mirroring understandingLevel in
// components/session-feedback/understanding-band.tsx. NOTE the deliberate decouple:
// this DISPLAY band (4.0) is intentionally NOT STANDOUT_THRESHOLD (4.5), which still
// gates success-vs-improvement note generation. So a 4.0-4.5 session reads "strong"
// yet may still receive a gentle improvement note. Do not collapse these two back
// together without Director sign-off (moving STANDOUT to 4.0 ~4x's success-note volume).
const STRONG_BAND_THRESHOLD = 4.0;
function understandingBandWord(avg: number | null | undefined): string {
  if (avg === null || avg === undefined || Number.isNaN(Number(avg))) return 'unknown';
  const a = Number(avg);
  if (a < LOW_UNDERSTOOD_THRESHOLD) return 'low';
  if (a < STRONG_BAND_THRESHOLD) return 'mixed';
  return 'strong';
}

// Cross-peek (Director 2026-07-10, decision 8): the SAME class keeps two loop
// notebooks — the teacher lane (faculty_email set) and the leadership lane
// (faculty_email NULL). They stay separate (privacy design), but new advice
// glances at the OTHER lane's latest note so the two notebooks never
// contradict each other unknowingly. Read-only; best-effort.
async function buildCrossPeekLine(
  admin: ReturnType<typeof createServiceRoleClient>,
  courseCode: string,
  facultyEmail: string | null,
  institutionId: string | null,
  logTag: string
): Promise<string> {
  try {
    let peek = admin
      .from('scf_ai_suggestions')
      .select('suggestion, generated_at')
      .eq('domain', 'session_feedback')
      .eq('course_code', courseCode)
      .order('generated_at', { ascending: false })
      .limit(1);
    peek = facultyEmail ? peek.is('faculty_email', null) : peek.not('faculty_email', 'is', null);
    // STRICT same-tenant scope (skeptic review 2026-07-10): course_code is not
    // globally unique, and NULL-institution (super course-level) rows are not
    // tenant-attributable — this query runs on the service-role client, so an
    // `is.null` disjunct would bypass the RLS that hides those rows and could
    // inject ANOTHER institution's advice into this prompt (and shadow the
    // own-tenant note, being newest). NULL-institution callers peek only NULL
    // rows: conservative, no cross-tenant flow.
    peek = institutionId
      ? peek.eq('institution_id', institutionId)
      : peek.is('institution_id', null);
    const { data, error } = await peek;
    if (error || !data?.length) return '';
    const other = data[0] as { suggestion: unknown; generated_at: string };
    const summary =
      other.suggestion && typeof other.suggestion === 'object'
        ? String((other.suggestion as Record<string, unknown>).summary ?? '').slice(0, 300)
        : String(other.suggestion ?? '').slice(0, 300);
    if (!summary) return '';
    return `\nFYI — the ${facultyEmail ? 'leadership' : 'facilitator'}-side notebook's latest advice for this class (${String(other.generated_at).slice(0, 10)}): ${summary}\nDo not contradict that advice; complement it or build on it.`;
  } catch (err) {
    console.error(`${logTag} cross-peek fetch failed:`, err);
    return '';
  }
}

// Replicates the self-improving track-record block from ai-suggest-improvement
// so the autonomous suggestions also improve over time (same loop feed).
// LOCKSTEP: the three-zone bands + sample-size tiers below must match the
// interactive route (ai-suggest-improvement) and the verdict-integrity fns —
// one definition of "helped" everywhere (Director 2026-07-10, decision 1).
async function buildTrackRecordBlock(
  admin: ReturnType<typeof createServiceRoleClient>,
  courseCode: string,
  facultyEmail: string | null,
  institutionId: string | null
): Promise<string> {
  let ownLane = '';
  try {
    const { data: priorData } = await admin.rpc('fn_scf_prior_suggestion', {
      p_course_code: courseCode,
      p_faculty_email: facultyEmail,
      p_institution_id: institutionId,
    });
    const prior = Array.isArray(priorData) ? priorData[0] : priorData;
    if (prior?.suggestion) {
      const priorSummary =
        prior.suggestion && typeof prior.suggestion === 'object'
          ? String(prior.suggestion.summary ?? JSON.stringify(prior.suggestion)).slice(0, 600)
          : String(prior.suggestion).slice(0, 600);
      const lift =
        prior.outcome_lift !== null && prior.outcome_lift !== undefined
          ? Number(prior.outcome_lift)
          : null;
      const outcomeN =
        prior.outcome_responses !== null && prior.outcome_responses !== undefined
          ? Number(prior.outcome_responses)
          : null;
      // Three-zone rule (decision 1): lift < 0 dropped · 0–0.5 about the same
      // · >= 0.5 helped. Sample-size tiers (decision 4): >=5 assert, 3-4 weak
      // evidence, below-floor low-confidence.
      let liftLine: string;
      if (!prior.has_outcome || lift === null) {
        liftLine = `The outcome of that advice is not measured yet.`;
      } else {
        const zone = lift < 0 ? 'dropped' : lift >= 0.5 ? 'improved' : 'flat';
        if (outcomeN !== null && outcomeN >= 5) {
          liftLine =
            zone === 'improved'
              ? `After that advice, in the next class understanding improved — it helped, build on it.`
              : zone === 'dropped'
                ? `After that advice, in the next class understanding DROPPED — change the approach; do not repeat the same advice.`
                : `After that advice, understanding stayed about the same — no clear gain; propose a sharper, DIFFERENT adjustment.`;
        } else if (outcomeN !== null && outcomeN >= 3) {
          liftLine = `After that advice, understanding in the next class ${zone === 'improved' ? 'appeared to improve' : zone === 'dropped' ? 'appeared to drop' : 'stayed about the same'} — but this is WEAK EVIDENCE: only ${outcomeN} learners answered the next session, so treat it as a hint, not proof. Do not conclude the advice did or didn't work from this alone.`;
        } else {
          liftLine = `An outcome was recorded for that advice${outcomeN !== null ? ` but only ${outcomeN} learner${outcomeN === 1 ? '' : 's'} answered the next session` : ''}, so it is LOW-CONFIDENCE — do not treat it as evidence the advice worked or failed.`;
        }
      }
      const verdictLine = prior.human_verdict
        ? ` The facilitator marked it: ${String(prior.human_verdict)}.`
        : '';
      ownLane = `\n\nYOUR PREVIOUS ADVICE FOR THIS CLASS (${String(prior.generated_at).slice(0, 10)}): ${priorSummary}\n${liftLine}${verdictLine}\nUse this track record: keep what worked, and propose a DIFFERENT, more specific adjustment for anything that did not move.`;
    }
  } catch (err) {
    console.error('[cron/scf-generate-suggestions] prior fetch failed:', err);
  }
  const crossPeek = await buildCrossPeekLine(
    admin,
    courseCode,
    facultyEmail,
    institutionId,
    '[cron/scf-generate-suggestions]'
  );
  return `${ownLane}${crossPeek}`;
}

// WIDENED gate — build the judge request for ONE course. Count-only output.
function buildJudgeParams(
  modelId: string,
  freeTexts: string[],
  courseCode: string
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const numbered = freeTexts.map((t, i) => `${i + 1}. ${String(t).trim()}`).join('\n');
  return {
    model: modelId,
    max_tokens: 400,
    system: HELP_ASK_JUDGE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Course: ${courseCode}\nAnonymous comments:\n${numbered}\n\nReturn the JSON now.`,
      },
    ],
  };
}

// Parse one judge result. Fails SAFE to { helpAskCount: 0, modelUsed: 'error' } so
// an errored / missing / unparseable batch item never fabricates a teacher tip or
// a leadership concern (and, via the 'error' sentinel, never RESOLVES a concern).
function parseJudgeMessage(
  message: Anthropic.Message | null
): { helpAskCount: number; modelUsed: string } {
  if (!message) return { helpAskCount: 0, modelUsed: 'error' };
  try {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(jsonStr) as { help_ask_count?: unknown };
    const n = Number(parsed.help_ask_count);
    const helpAskCount = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    return { helpAskCount, modelUsed: message.model };
  } catch (err) {
    console.error('[cron/scf-generate-suggestions] help-ask judge parse failed:', err);
    return { helpAskCount: 0, modelUsed: 'error' };
  }
}

// WIDENED gate spend guard — has this window ALREADY produced an improvement TIP
// in the lookback? A prior lone-voice CONCERN does NOT suppress re-judging (a class
// can worsen from 1 ask to >=2 and must stay re-judgeable). Returns true=already
// tipped (skip judge), false=re-judge, null=query error (fail closed).
async function widenedWindowAlreadyHandled(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: CourseTarget,
  normFaculty: string | null,
  since: string
): Promise<boolean | null> {
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
    console.error('[cron/scf-generate-suggestions] widened guard failed:', sugErr);
    return null;
  }
  return !!(sug && sug.length > 0);
}

// Build the generation request for ONE course. Prompt construction verbatim from
// the former inline generateSuggestion.
function buildGenerationParams(
  modelId: string,
  kind: 'improvement' | 'success',
  courseCode: string,
  signal: SignalRow,
  windowFrom: string,
  windowTo: string,
  trackRecord: string
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const freeTexts: string[] = Array.isArray(signal.free_texts) ? signal.free_texts : [];
  const commentBlock =
    freeTexts.length > 0
      ? freeTexts.map((t) => `- ${String(t).trim()}`).join('\n')
      : '- (no written comments — use the aggregate signals)';

  const systemPrompt = kind === 'success' ? SUCCESS_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const closingLine =
    kind === 'success'
      ? 'Capture what worked as reusable success-pattern JSON now.'
      : 'Generate the teaching-improvement JSON now.';

  // Cite the exact contributing sessions (closed-window only, per the two-sided
  // 48h window) — falls back to the candidate range if dates are missing.
  const sessionDates: string[] = Array.isArray(signal.session_dates) ? signal.session_dates : [];
  const sessionsLine =
    sessionDates.length > 0 ? sessionDates.join(', ') : `${windowFrom} to ${windowTo}`;

  const userPrompt = `Course: ${courseCode}
Window: ${windowFrom} to ${windowTo}
Sessions covered (feedback window closed — the sample is final): ${sessionsLine}
Group size (words only — never repeat numbers): ${groupSizeWord(Number(signal.responses ?? 0))}
Understanding level (qualitative): ${understandingBandWord(signal.avg_understood)}

Anonymized student comments:
${commentBlock}${trackRecord}

${closingLine}`;

  return {
    model: modelId,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
}

// Parse one generation result. Returns suggestion=null on any failure.
function parseSuggestionMessage(
  message: Anthropic.Message | null
): { suggestion: Record<string, unknown> | null; modelUsed: string } {
  if (!message) return { suggestion: null, modelUsed: 'error' };
  try {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    // Tolerant extraction (2026-07-09): slice the outermost {...} when the
    // model wraps the object in prose/trailing text (maiden Max-chain receipt).
    let suggestion: Record<string, unknown>;
    try {
      suggestion = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      const m = jsonStr.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no JSON object in model output');
      suggestion = JSON.parse(m[0]) as Record<string, unknown>;
    }
    return { suggestion, modelUsed: message.model };
  } catch (err) {
    console.error('[cron/scf-generate-suggestions] AI generation failed:', err);
    return { suggestion: null, modelUsed: 'error' };
  }
}

// Regen guard — has a same-kind suggestion for this course already been generated
// within the lookback? Fail CLOSED on query error (skip to avoid re-spend).
async function regenGuardHit(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: CourseTarget,
  kind: 'improvement' | 'success',
  normFaculty: string | null,
  recentSince: string
): Promise<boolean | null> {
  let recentQuery = admin
    .from('scf_ai_suggestions')
    .select('id')
    .eq('course_code', target.course_code)
    .eq('kind', kind)
    .eq('domain', 'session_feedback')
    .gte('generated_at', recentSince)
    // Director 2026-07-10 (decision 5): only an UNMEASURED recent note blocks —
    // "wait for the result or 7 days, whichever comes first". Once the prior
    // note has its outcome_lift, the retry may fire before the window lapses.
    // Success notes are never lift-graded, so their flat 7-day cooldown is
    // unchanged. (30-day unmeasurable stamps can't overlap this 7-day window.)
    .is('outcome_lift', null)
    .limit(1);
  recentQuery = target.institution_id
    ? recentQuery.eq('institution_id', target.institution_id)
    : recentQuery.is('institution_id', null);
  recentQuery = normFaculty
    ? recentQuery.eq('faculty_email', normFaculty)
    : recentQuery.is('faculty_email', null);
  const { data: recentRows, error: recentErr } = await recentQuery;
  if (recentErr) {
    console.error(
      `[cron/scf-generate-suggestions] regen-guard check failed for ${target.course_code} — skipping to avoid re-spend:`,
      recentErr
    );
    return null;
  }
  return !!(recentRows && recentRows.length > 0);
}

// Record a leadership concern (best-effort; never throws to the caller).
async function recordLeadershipConcern(
  admin: ReturnType<typeof createServiceRoleClient>,
  ctx: JudgeContext,
  modelUsed: string
): Promise<boolean> {
  const summary =
    'One learner in this class asked for clearer explanation or more support this period. ' +
    'Follow up with the facilitator for specifics.';
  try {
    const { error } = await admin.rpc('fn_scf_record_leadership_concern', {
      p_institution_id: ctx.target.institution_id,
      p_course_code: ctx.target.course_code,
      p_faculty_email: ctx.target.faculty_email,
      p_window_from: ctx.target.window_from,
      p_window_to: ctx.target.window_to,
      p_responses: ctx.responses,
      p_avg: ctx.avg,
      p_summary: summary,
      p_model: modelUsed,
    });
    if (error) {
      console.error(
        `[cron/scf-generate-suggestions] leadership-concern record failed for ${ctx.target.course_code}:`,
        error
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[cron/scf-generate-suggestions] leadership-concern record threw for ${ctx.target.course_code}:`,
      err
    );
    return false;
  }
}

async function clearLeadershipConcern(
  admin: ReturnType<typeof createServiceRoleClient>,
  target: CourseTarget,
  reason: string
): Promise<void> {
  try {
    const { error } = await admin.rpc('fn_scf_clear_leadership_concern', {
      p_institution_id: target.institution_id,
      p_course_code: target.course_code,
      p_faculty_email: target.faculty_email,
    });
    if (error) {
      console.error(
        `[cron/scf-generate-suggestions] clear-concern (${reason}) failed for ${target.course_code}:`,
        error
      );
    }
  } catch (err) {
    console.error(
      `[cron/scf-generate-suggestions] clear-concern (${reason}) threw for ${target.course_code}:`,
      err
    );
  }
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1) Authorize — same pattern as all CRON_SECRET sibling routes.
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
  const mode = request.nextUrl.searchParams.get('mode');
  const isCollectOnly = mode === 'collect';

  // ₹0 Max-lane migration (§B): 'jobs' (default after this PR) = the cron enqueues
  // each pipeline stage (judge / improve / success) onto the #1998 ai_jobs registry
  // (generic Windows seat drain runs it, ₹0); 'direct' = the legacy Anthropic-batch
  // path (defer to the manifest twin + paid sub-fallback). Flip-back switch.
  const lane = await readGenerationLane(admin);

  // Manifest-twin deferral applies ONLY on 'direct'. On 'jobs' the cron feeds
  // ai_jobs itself and must NOT stand down for the twin (that would leave the
  // queue unfed). Overlap with a still-running twin is idempotency-safe:
  // fn_scf_record_suggestion / leadership concerns upsert, and the regen +
  // in-flight guards dedupe — whichever lane records a window first wins.
  if (lane === 'direct' && (await shouldDeferToMaxLane('scf-generate-suggestions'))) {
    console.log('[cron/scf-generate-suggestions] deferred to Max manifest twin (direct lane)');
    return NextResponse.json({
      ok: true,
      generation_lane: lane,
      generated: 0,
      skipped: 0,
      measured: null,
      deferred_to_max_lane: true,
    });
  }

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const aiAvailable = Boolean(apiKey);
  // AI work is possible if either the paid key exists (direct lane) OR we're on
  // the jobs lane (no key needed — the Max seat runs it). Gates the AI-decision
  // branches below so lane='jobs' still judges/generates without an Anthropic key.
  const aiPossible = aiAvailable || lane === 'jobs';
  // Resolve the model ONCE per run (never throws). Used for submit params and for
  // building any chained generation batch during collect.
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

  // Result counters (the numeric keys the dispatcher's summarize() reads).
  let generated = 0;
  let generatedImprovement = 0;
  let generatedSuccess = 0;
  let skipped = 0;
  let guardErrors = 0;
  let leadershipFlagged = 0;
  // Async telemetry.
  let collectedJobs = 0;
  let suggestionsWritten = 0;
  let concerns = 0;
  let resolved = 0;
  let genChained = 0;
  let enqueued = 0; // jobs-lane: judge+gen jobs enqueued on the ₹0 Max lane

  // =====================================================================
  // COLLECT PHASE — always runs first (daily run collects yesterday's batches
  // before submitting today's; the */30 collect-only run just does this).
  // Drains ENDED batches, records their results, and chains judge→gen.
  // =====================================================================
  if (aiAvailable) {
    let jobs;
    try {
      jobs = await collectEndedBatches(FEATURE_KEY);
    } catch (collectErr) {
      console.error('[cron/scf-generate-suggestions] collect failed:', collectErr);
      jobs = [];
    }

    for (const job of jobs) {
      try {
        const chainedGen: SubmitBatchRequest[] = [];
        // If any item was settled+billed but its outcome could NOT be fully
        // recorded (domain-record failure, or a transient guard-query error on an
        // elevation), do NOT finalize the job: leave it 'collecting' so the lease
        // re-drains it. settle_item is idempotent (no re-bill) and every domain
        // write is an upsert, so re-collection safely completes the record. Without
        // this, a completed+billed item's suggestion is lost and re-billed next run.
        let deferFinalize = false;

        for (const item of job.items) {
          if (job.phase === 'judge') {
            const ctx = item.context as unknown as JudgeContext;
            const judged = parseJudgeMessage(item.message);

            if (judged.helpAskCount >= WIDENED_MIN_ASKS) {
              // Elevate to a teacher tip: regen guard, then in-flight guard on
              // the gen key (so a crashed-then-retried collect can't double-submit
              // the generation batch), then queue a generation request.
              const guardHit = await regenGuardHit(
                admin,
                ctx.target,
                'improvement',
                ctx.normFaculty,
                ctx.recentSince
              );
              if (guardHit === null) {
                // Transient guard error on a settled+billed elevation — don't lose
                // it: defer finalize so the lease re-drains and re-attempts.
                guardErrors++;
                deferFinalize = true;
                continue;
              }
              if (guardHit) {
                skipped++;
                continue;
              }
              const genKey = genDedupeKey(ctx.target, 'improvement');
              const inflight = await partitionInFlight(FEATURE_KEY, [genKey]);
              if (inflight.has(genKey)) {
                skipped++;
                continue;
              }
              const trackRecord = await buildTrackRecordBlock(
                admin,
                ctx.target.course_code,
                ctx.target.faculty_email,
                ctx.target.institution_id
              );
              const genCtx: GenContext = {
                target: ctx.target,
                kind: 'improvement',
                responses: ctx.responses,
                low_responses: ctx.low_responses,
                avg: ctx.avg,
                session_dates: ctx.session_dates ?? [],
              };
              chainedGen.push({
                customId: `gen-${chainedGen.length}`,
                params: buildGenerationParams(
                  modelId,
                  'improvement',
                  ctx.target.course_code,
                  signalFromCtx(ctx),
                  ctx.target.window_from,
                  ctx.target.window_to,
                  trackRecord
                ),
                context: genCtx as unknown as Record<string, unknown>,
                dedupeKey: genKey,
              });
            } else if (judged.helpAskCount === 1) {
              // Lone voice → leadership-only concern (fixed generic copy; never AI-
              // derived from the single comment — re-identification risk).
              const ok = await recordLeadershipConcern(admin, ctx, judged.modelUsed);
              if (ok) {
                leadershipFlagged++;
                concerns++;
              } else {
                // Settled+billed but concern not recorded — defer finalize to re-drain.
                deferFinalize = true;
              }
            } else {
              // 0 genuine asks. A GENUINE 0 resolves a prior lone-voice concern; a
              // judge ERROR must NOT resolve (a transient blip shouldn't clear a real
              // concern) — retry next run.
              if (judged.modelUsed !== 'error') {
                await clearLeadershipConcern(admin, ctx.target, 'resolve');
                resolved++;
              }
              skipped++;
            }
          } else if (job.phase === 'generate') {
            const ctx = item.context as unknown as GenContext;
            const { suggestion, modelUsed } = parseSuggestionMessage(item.message);
            if (suggestion !== null) {
              try {
                // Deterministic citation: the exact closed-window session dates ride
                // in the payload so the note's UI can always show its evidence base
                // (never depends on the model choosing to mention them).
                const suggestionWithDates =
                  (ctx.session_dates ?? []).length > 0
                    ? { ...suggestion, contributing_dates: ctx.session_dates }
                    : suggestion;
                await admin.rpc('fn_scf_record_suggestion', {
                  p_institution_id: ctx.target.institution_id,
                  p_course_code: ctx.target.course_code,
                  p_faculty_email: ctx.target.faculty_email,
                  p_window_from: ctx.target.window_from,
                  p_window_to: ctx.target.window_to,
                  p_input_responses: ctx.responses,
                  p_input_low: Number(ctx.low_responses ?? 0),
                  p_input_avg: ctx.avg,
                  p_suggestion: suggestionWithDates,
                  p_model: modelUsed,
                  p_kind: ctx.kind,
                });
                generated++;
                suggestionsWritten++;
                if (ctx.kind === 'success') generatedSuccess++;
                else generatedImprovement++;
                // Supersede any lone-voice concern for this class.
                if (ctx.kind === 'improvement') {
                  await clearLeadershipConcern(admin, ctx.target, 'supersede');
                }
              } catch (recErr) {
                // Settled+billed but suggestion not recorded — defer finalize so the
                // lease re-drains; fn_scf_record_suggestion is an upsert (no dup).
                console.error(
                  `[cron/scf-generate-suggestions] record failed for ${ctx.target.course_code} — deferring finalize:`,
                  recErr
                );
                deferFinalize = true;
              }
            } else {
              skipped++;
            }
          }
        }

        // Chain: submit the generation batch for elevated judge items. If this
        // throws, DO NOT mark the job collected — the lease re-admits it; the
        // concerns recorded above re-upsert idempotently and the in-flight guard
        // stops a duplicate gen batch on retry.
        if (chainedGen.length > 0) {
          const sub = await submitBatch({
            featureKey: FEATURE_KEY,
            phase: 'generate',
            modelId,
            requests: chainedGen,
          });
          if (sub) genChained += sub.requestCount;
        }

        if (deferFinalize) {
          if (job.collectAttempts >= MAX_COLLECT_ATTEMPTS) {
            // Record has failed on every re-drain up to the cap — a persistent
            // failure would re-drain forever, freezing the course. Give up: mark
            // 'failed' (terminal) so the in-flight guard releases it. Items were
            // already settled (idempotent ledger), so nothing is re-billed.
            console.error(
              `[cron/scf-generate-suggestions] job ${job.jobId}: record failed on ${job.collectAttempts} attempts — marking failed (terminal)`
            );
            await admin.rpc('fn_ai_batch_mark_expired', {
              p_job_id: job.jobId,
              p_status: 'failed',
            });
          } else {
            // A billed item couldn't be fully recorded — leave the job 'collecting'
            // so the lease re-admits and re-drains it (idempotent). Do NOT finalize.
            console.warn(
              `[cron/scf-generate-suggestions] job ${job.jobId}: a record step failed (attempt ${job.collectAttempts}) — deferring finalize for lease re-drain`
            );
          }
        } else {
          await markJobCollected(job.jobId);
          collectedJobs++;
        }
      } catch (jobErr) {
        // Leave the job in 'collecting' — the lease re-admits it. All prior writes
        // were idempotent, so re-collection is safe.
        console.error(
          `[cron/scf-generate-suggestions] job ${job.jobId} collect handling failed (will retry):`,
          jobErr
        );
      }
    }
  }

  // =====================================================================
  // JOBS-LANE COLLECT (₹0 Max lane) — drain done scf ai_jobs and record via the
  // IDENTICAL fns as the batch path (byte-parity of effects). Runs whenever jobs
  // may exist (no Anthropic key needed). Dispatch by job_type: a judge result
  // elevates (enqueue a gen job) / flags a lone-voice concern / resolves; a gen
  // result is recorded as a suggestion. delivered_at → each result records once.
  // =====================================================================
  if (lane === 'jobs') {
    try {
      const items = await collectJobsLane(admin, SCF_JOB_TYPES, BATCH_CAP);
      for (const item of items) {
        if (item.jobType === JOB_TYPE_JUDGE) {
          const ctx = item.context as unknown as JudgeContext;
          const judged = parseJudgeMessage(item.message);
          if (judged.helpAskCount >= WIDENED_MIN_ASKS) {
            // Elevate → enqueue a generation job (regen + in-flight guards first,
            // exactly as the batch chain does).
            const guardHit = await regenGuardHit(admin, ctx.target, 'improvement', ctx.normFaculty, ctx.recentSince);
            if (guardHit === null) { guardErrors++; continue; }
            if (guardHit) { skipped++; continue; }
            const trackRecord = await buildTrackRecordBlock(
              admin, ctx.target.course_code, ctx.target.faculty_email, ctx.target.institution_id,
            );
            const genCtx: GenContext = {
              target: ctx.target, kind: 'improvement', responses: ctx.responses,
              low_responses: ctx.low_responses, avg: ctx.avg, session_dates: ctx.session_dates ?? [],
            };
            const params = buildGenerationParams(
              modelId, 'improvement', ctx.target.course_code, signalFromCtx(ctx),
              ctx.target.window_from, ctx.target.window_to, trackRecord,
            );
            const r = await enqueueJobsLane(admin, {
              jobType: JOB_TYPE_IMPROVE,
              prompt: promptFromParams(params),
              context: genCtx as unknown as Record<string, unknown>,
              dedupeKey: genDedupeKey(ctx.target, 'improvement'),
            });
            if (r.ok) genChained++;
            else if (r.reason !== 'in_flight') {
              console.warn(`[cron/scf-generate-suggestions] jobs-lane gen enqueue failed (${r.reason})`);
            }
          } else if (judged.helpAskCount === 1) {
            const ok = await recordLeadershipConcern(admin, ctx, judged.modelUsed);
            if (ok) { leadershipFlagged++; concerns++; }
          } else {
            if (judged.modelUsed !== 'error') {
              await clearLeadershipConcern(admin, ctx.target, 'resolve');
              resolved++;
            }
            skipped++;
          }
        } else {
          // generate stage (improvement | success)
          const ctx = item.context as unknown as GenContext;
          const { suggestion, modelUsed } = parseSuggestionMessage(item.message);
          if (suggestion !== null) {
            const suggestionWithDates =
              (ctx.session_dates ?? []).length > 0
                ? { ...suggestion, contributing_dates: ctx.session_dates }
                : suggestion;
            const { error: recErr } = await admin.rpc('fn_scf_record_suggestion', {
              p_institution_id: ctx.target.institution_id,
              p_course_code: ctx.target.course_code,
              p_faculty_email: ctx.target.faculty_email,
              p_window_from: ctx.target.window_from,
              p_window_to: ctx.target.window_to,
              p_input_responses: ctx.responses,
              p_input_low: Number(ctx.low_responses ?? 0),
              p_input_avg: ctx.avg,
              p_suggestion: suggestionWithDates,
              p_model: modelUsed,
              p_kind: ctx.kind,
            });
            if (recErr) {
              console.error(
                `[cron/scf-generate-suggestions] jobs-lane record failed for ${ctx.target.course_code}:`, recErr,
              );
            } else {
              generated++;
              suggestionsWritten++;
              if (ctx.kind === 'success') generatedSuccess++;
              else generatedImprovement++;
              if (ctx.kind === 'improvement') await clearLeadershipConcern(admin, ctx.target, 'supersede');
            }
          } else {
            skipped++;
          }
        }
      }
    } catch (e) {
      console.error('[cron/scf-generate-suggestions] jobs-lane collect failed:', e);
    }
  }

  // =====================================================================
  // SUBMIT PHASE — only on the default (daily) run, not ?mode=collect.
  // Scan candidates, classify, apply the regen + in-flight guards, and submit a
  // judge batch and/or a generation batch. No polling.
  // =====================================================================
  let candidatesCount = 0;
  let cappedCount = 0;
  let submittedJudge: SubmitBatchResult | null = null;
  let submittedGen: SubmitBatchResult | null = null;

  if (!isCollectOnly) {
    const windowParam = request.nextUrl.searchParams.get('window_days');
    const windowDays =
      windowParam && /^\d+$/.test(windowParam) ? parseInt(windowParam, 10) : WINDOW_DAYS;
    const today = new Date();
    const windowTo = isoDate(today);
    const windowFrom = isoDate(new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000));

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
    candidatesCount = uniqueTargets.length;

    let targets = uniqueTargets;
    if (uniqueTargets.length > BATCH_CAP) {
      // Retry reserve (Director 2026-07-10, decision 2): pull courses whose
      // prior improvement note is already MEASURED to the front (up to
      // RETRY_SLOTS), then fill the rest of the cap with the fair rotation.
      // The measured set is small (a handful of graded notes), so one query
      // covers it; keys mirror the seen-set format above. Best-effort — on a
      // query error the reserve is empty and the original rotation applies.
      let retryKeys = new Set<string>();
      try {
        const { data: measuredPriors } = await admin
          .from('scf_ai_suggestions')
          .select('course_code, institution_id, faculty_email')
          .eq('domain', 'session_feedback')
          .eq('kind', 'improvement')
          .not('outcome_lift', 'is', null);
        retryKeys = new Set(
          (measuredPriors ?? []).map(
            (r) => `${r.institution_id}|${r.course_code}|${r.faculty_email}`
          )
        );
      } catch (e) {
        console.error('[cron/scf-generate-suggestions] retry-reserve query failed:', e);
      }
      const targetKey = (t: CourseTarget) =>
        `${t.institution_id}|${t.course_code}|${t.faculty_email}`;
      const retry = uniqueTargets.filter((t) => retryKeys.has(targetKey(t)));
      const fresh = uniqueTargets.filter((t) => !retryKeys.has(targetKey(t)));
      targets = [...retry.slice(0, RETRY_SLOTS), ...fresh].slice(0, BATCH_CAP);
      cappedCount = uniqueTargets.length - targets.length;
      console.warn(
        `[cron/scf-generate-suggestions] batch cap hit: ${uniqueTargets.length} candidates, processing ${targets.length} (${Math.min(retry.length, RETRY_SLOTS)} retry-reserved), skipping ${cappedCount}`
      );
    }

    // Build judge + generation request queues (with per-item context + dedupe key).
    const judgeReqs: SubmitBatchRequest[] = [];
    const genReqs: SubmitBatchRequest[] = [];
    const recentSince = isoDate(
      new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000)
    );

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
      const freeTexts: string[] = (signal?.free_texts ?? [])
        .map((t) => stripCarryMarkers(String(t ?? '')))
        .filter((t) => t.length > 0);
      const freeTextCount = freeTexts.length;
      const lowResponses = Number(signal?.low_responses ?? 0);
      const sessionDates: string[] = (signal?.session_dates ?? []).map((d) => String(d));

      if (responses < MIN_RESPONSES || avgUnderstood === null) {
        skipped++;
        continue;
      }

      const normFaculty = target.faculty_email
        ? target.faculty_email.trim().toLowerCase() || null
        : null;

      let kind: 'improvement' | 'success' | null = null;
      if (avgUnderstood < LOW_UNDERSTOOD_THRESHOLD) {
        kind = 'improvement';
      } else if (avgUnderstood >= STANDOUT_THRESHOLD && freeTextCount >= 1) {
        kind = 'success';
      } else if (freeTextCount >= WIDENED_MIN_COMMENTS && aiPossible) {
        // WIDENED path — spend guard first (already-tipped windows skip re-judge).
        const handled = await widenedWindowAlreadyHandled(admin, target, normFaculty, recentSince);
        if (handled === null) {
          guardErrors++;
          skipped++;
          continue;
        }
        if (handled) {
          skipped++;
          continue;
        }
        const jctx: JudgeContext = {
          target,
          responses,
          avg: avgUnderstood,
          low_responses: lowResponses,
          free_texts: freeTexts,
          normFaculty,
          recentSince,
          session_dates: sessionDates,
        };
        judgeReqs.push({
          customId: `judge-${judgeReqs.length}`,
          params: buildJudgeParams(modelId, freeTexts, target.course_code),
          context: jctx as unknown as Record<string, unknown>,
          dedupeKey: judgeDedupeKey(target),
        });
        continue;
      }
      if (kind === null) {
        skipped++;
        continue;
      }

      // Direct low/standout path → regen guard, then queue a generation request.
      const guardHit = await regenGuardHit(admin, target, kind, normFaculty, recentSince);
      if (guardHit === null) {
        guardErrors++;
        skipped++;
        continue;
      }
      if (guardHit) {
        skipped++;
        continue;
      }
      const trackRecord =
        kind === 'improvement'
          ? await buildTrackRecordBlock(
              admin,
              target.course_code,
              target.faculty_email,
              target.institution_id
            )
          : '';
      const gctx: GenContext = {
        target,
        kind,
        responses,
        low_responses: lowResponses,
        avg: avgUnderstood,
        session_dates: sessionDates,
      };
      genReqs.push({
        customId: `gen-${genReqs.length}`,
        params: buildGenerationParams(
          modelId,
          kind,
          target.course_code,
          signal as SignalRow,
          target.window_from,
          target.window_to,
          trackRecord
        ),
        context: gctx as unknown as Record<string, unknown>,
        dedupeKey: genDedupeKey(target, kind),
      });
    }

    // ₹0 Max lane: enqueue each judge/gen candidate as its own ai_job. The
    // in-flight guard is fn_ai_enqueue_system's dedupe (a candidate already
    // queued → 'in_flight' → skipped), so partitionInFlight isn't needed. The
    // prompt is the SAME assembled prompt buildJudge/GenerationParams produced.
    if (lane === 'jobs' && (judgeReqs.length > 0 || genReqs.length > 0)) {
      for (const r of judgeReqs) {
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE_JUDGE,
          prompt: promptFromParams(r.params),
          context: r.context,
          dedupeKey: r.dedupeKey ?? judgeDedupeKey((r.context as unknown as JudgeContext).target),
        });
        if (res.ok) enqueued++;
        else if (res.reason === 'in_flight') skipped++;
        else { console.warn(`[cron/scf-generate-suggestions] jobs-lane judge enqueue failed (${res.reason})`); skipped++; }
      }
      for (const r of genReqs) {
        const gctx = r.context as unknown as GenContext;
        const res = await enqueueJobsLane(admin, {
          jobType: gctx.kind === 'success' ? JOB_TYPE_SUCCESS : JOB_TYPE_IMPROVE,
          prompt: promptFromParams(r.params),
          context: r.context,
          dedupeKey: r.dedupeKey ?? genDedupeKey(gctx.target, gctx.kind),
        });
        if (res.ok) enqueued++;
        else if (res.reason === 'in_flight') skipped++;
        else { console.warn(`[cron/scf-generate-suggestions] jobs-lane gen enqueue failed (${res.reason})`); skipped++; }
      }
    }
    // In-flight guard: drop any candidate whose batch is already outstanding
    // (submitted-not-yet-collected) — prevents re-submit + re-bill.
    else if (aiAvailable && (judgeReqs.length > 0 || genReqs.length > 0)) {
      // For each JUDGE request also check its course's gen-IMPROVEMENT key: once a
      // judge batch elevates and chains a gen batch, the judge job is 'collected'
      // (judge key no longer in-flight) but the tip isn't recorded until the gen
      // is collected. Without this, the next daily run re-judges the same course
      // (extra judge spend). An outstanding gen-improvement batch = already handled.
      const judgeGenKeys = judgeReqs.map((r) =>
        genDedupeKey((r.context as unknown as JudgeContext).target, 'improvement')
      );
      const allKeys = [
        ...judgeReqs.map((r) => r.dedupeKey),
        ...genReqs.map((r) => r.dedupeKey),
        ...judgeGenKeys,
      ].filter((k): k is string => !!k);
      const inflight = await partitionInFlight(FEATURE_KEY, allKeys);
      const freshJudge = judgeReqs.filter(
        (r, i) => !(r.dedupeKey && inflight.has(r.dedupeKey)) && !inflight.has(judgeGenKeys[i])
      );
      const freshGen = genReqs.filter((r) => !(r.dedupeKey && inflight.has(r.dedupeKey)));
      skipped += judgeReqs.length - freshJudge.length + (genReqs.length - freshGen.length);

      try {
        if (freshJudge.length > 0) {
          submittedJudge = await submitBatch({
            featureKey: FEATURE_KEY,
            phase: 'judge',
            modelId,
            requests: freshJudge,
          });
        }
      } catch (e) {
        console.error('[cron/scf-generate-suggestions] judge submit failed:', e);
        skipped += freshJudge.length;
      }
      try {
        if (freshGen.length > 0) {
          submittedGen = await submitBatch({
            featureKey: FEATURE_KEY,
            phase: 'generate',
            modelId,
            requests: freshGen,
          });
        }
      } catch (e) {
        console.error('[cron/scf-generate-suggestions] generation submit failed:', e);
        skipped += freshGen.length;
      }
    } else if (!aiPossible) {
      skipped += judgeReqs.length + genReqs.length;
    }
  }

  // =====================================================================
  // MEASURE — loop verifier. Once per daily run (not on the */30 collect ticks)
  // so the measurement cadence matches the original once-a-day attribution.
  // =====================================================================
  let measured: number | null = null;
  if (!isCollectOnly) {
    const { data: measureData, error: measureErr } = await admin.rpc(
      'fn_scf_measure_suggestion_outcomes',
      { p_min_age_days: 1 }
    );
    if (measureErr) {
      console.error('[cron/scf-generate-suggestions] measure outcomes failed:', measureErr);
    } else {
      measured = Array.isArray(measureData)
        ? (measureData[0] ?? 0)
        : (measureData as number | null);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: isCollectOnly ? 'collect' : 'submit',
    generation_lane: lane,
    candidates: candidatesCount,
    capped: cappedCount,
    // Numeric keys read by ai-routine-dispatcher.summarize() — reflect what was
    // RECORDED this run (during collect). On the daily run these count what the
    // collect-first phase drained from previously-submitted batches.
    generated,
    generated_improvement: generatedImprovement,
    generated_success: generatedSuccess,
    enqueued,
    skipped,
    guard_errors: guardErrors,
    leadership_flagged: leadershipFlagged,
    measured,
    ai_available: aiAvailable,
    // Async telemetry.
    submitted: { judge: submittedJudge, generate: submittedGen },
    collected: {
      jobs: collectedJobs,
      suggestions_written: suggestionsWritten,
      concerns,
      resolved,
      gen_chained: genChained,
    },
    elapsed_ms: Date.now() - started,
  });
}
