// ============================================================================
// AI TASK TYPES — behavioural registry for the "AI Max button" async lane
// ============================================================================
// One entry per user-click AI task. Distinct from lib/ai-routines/registry.ts
// (which is METADATA about scheduled crons); this is BEHAVIOUR (handlers) for
// user-initiated tasks that flow through ai_task_queue → batch.ts (50% lane).
//
// Each task-type splits its work across the three async stages:
//   1. resolveEnqueueContext  — runs AS THE USER (session client) at enqueue.
//        Resolves authz/scope from the caller's profile → returns the context
//        blob + institution + a dedupe key that encodes the scope.
//   2. buildSubmitItem        — runs SERVICE-ROLE at the */15 submit-sweep.
//        Reads the signal, decides skip (small-n) vs submit, and builds the
//        Anthropic params. RAW INPUTS (free-text comments) go ONLY into `params`
//        (sent to Anthropic, never persisted); `itemContext` is NUMBERS+SCOPE.
//   3. recordResult           — runs SERVICE-ROLE at the */15 collect-sweep.
//        Parses the model output, records the product artefact, returns the
//        result blob the button reflects back.
//
// HARD CONSTRAINT: everything here runs on the Anthropic API at the 50% batch
// rate (via batch.ts). NEVER the Max subscription. See
// specs/ai-max-button-async-lane-2026-07-04.md.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { resolveChatModel } from '@/lib/services/platform/ai-clients/chat';

export type EnqueueResolution =
  | { ok: true; institutionId: string | null; dedupeKey: string; context: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export type SubmitBuild =
  | { skip: true; result: Record<string, unknown> }
  | { skip: false; params: Anthropic.Messages.MessageCreateParamsNonStreaming; itemContext: Record<string, unknown> };

export interface AiTaskType {
  featureKey: string;
  label: string;
  /** 'entity' = one shared result per entity; 'user' = per requester. The pilot
   *  computes a scope-aware key itself, so this is documentary for the UI. */
  dedupeScope: 'entity' | 'user';
  /** Deep-link surfaced in the "your result is ready" notification (P2). */
  resultPath?: string;
  /** Runs as the user (session client) at enqueue. Resolves scope + dedupe. */
  resolveEnqueueContext(
    session: SupabaseClient,
    userId: string,
    entityId: string
  ): Promise<EnqueueResolution>;
  /** Runs service-role at submit. Reads signal; skip (small-n) or build params. */
  buildSubmitItem(admin: SupabaseClient, context: Record<string, unknown>): Promise<SubmitBuild>;
  /** Runs service-role at collect. Records the artefact; returns the result blob. */
  recordResult(
    admin: SupabaseClient,
    itemContext: Record<string, unknown>,
    message: Anthropic.Message
  ): Promise<Record<string, unknown>>;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

// ============================================================================
// PILOT — "Summarise a class's feedback"
// Reuses the sync route app/api/academic/session-feedback/ai-suggest-improvement
// verbatim (prompt, anonymity, scope, self-improving record), split across the
// async stages. entity_id = course_code.
// ============================================================================
const SF_FEATURE_KEY = 'session_feedback.suggest_improvement';

const SF_LEADERSHIP_ROLES = new Set([
  'administrator', 'institution_admin', 'dean', 'hod', 'principal', 'coordinator',
]);

const SF_SYSTEM_PROMPT = `You are a teaching-improvement assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback on how well they understood a session. You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Use ONLY the data provided; ground every suggestion in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
NEVER state counts, sample sizes, response numbers, averages, percentages, rating scales, or trigger thresholds in your output — describe group size ONLY in the words given (e.g. a few learners, a small group) and understanding ONLY in the qualitative band words given. Printed numbers teach students and staff how to game the loop.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must describe, in words only, whether understanding holds or improves in the next session — never cite a number, score, average, or target.
CRITICAL: Never express understanding as a number, score, average, rating out of 5, or percentage, and never state a numeric target or threshold to reach. Describe understanding and its trend in words only (e.g. "understanding was strong", "a small cluster still struggled"). You may state how many learners responded.`;

// Facilitator-facing understanding must never reach the model as a raw number: a
// printed baseline/target invites gaming ("keep scoring 3.6"). Feed a qualitative
// band instead. Mirrors the sync route (ai-suggest-improvement) + the SCF cron.
// Display band (recalibrated 2026-07-24): LOW < 3, MIXED < 4.0, STRONG >= 4.0 —
// mirrors understandingLevel in components/session-feedback/understanding-band.tsx.
// The cron's STANDOUT_THRESHOLD (4.5) success-note gate is deliberately NOT moved.
// The loop still records the numeric avg to the backend for its own measurement.
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

function understandingBandWord(avg: number | null | undefined): string {
  if (avg === null || avg === undefined || Number.isNaN(Number(avg))) return 'unknown';
  const a = Number(avg);
  if (a < 3) return 'low';
  if (a < 4.0) return 'mixed';
  return 'strong';
}

const sessionFeedbackSummarize: AiTaskType = {
  featureKey: SF_FEATURE_KEY,
  label: 'class-feedback summary',
  dedupeScope: 'entity',
  resultPath: '/academic/session-feedback/faculty',

  async resolveEnqueueContext(session, userId, entityId) {
    const courseCode = (entityId || '').trim();
    if (!courseCode) return { ok: false, status: 400, error: 'course code is required' };

    const { data: profile } = await session
      .from('profiles')
      .select('id, email, role, is_super_admin, institution_id')
      .eq('id', userId)
      .maybeSingle();

    const role = (profile?.role as string | null) ?? null;
    const isSuper = profile?.is_super_admin === true || role === 'super_admin';
    const isLeadership = isSuper || (role !== null && SF_LEADERSHIP_ROLES.has(role));

    // Scope filters for fn_scf_ai_signal (each branch self-limits — same as sync route).
    let pInstitutionId: string | null;
    let pFacultyEmail: string | null;
    if (isSuper) { pInstitutionId = null; pFacultyEmail = null; }
    else if (isLeadership) { pInstitutionId = (profile?.institution_id as string | null) ?? null; pFacultyEmail = null; }
    else { pInstitutionId = null; pFacultyEmail = (profile?.email as string | null)?.toLowerCase() ?? null; }

    // The stored suggestion MUST carry the resolved institution (a NULL-institution
    // row is readable by every authenticated user — role_has_institution_access(NULL)=true).
    const loopInstitutionId = pInstitutionId ?? ((profile?.institution_id as string | null) ?? null);

    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Scope-aware dedupe: two faculty for the same course read DIFFERENT sessions
    // (email-scoped) → must not share one summary. Leadership at the same
    // institution DO share. Encode the scope signature so the in-flight guard is correct.
    const scopeSig = isSuper ? 'super' : (pFacultyEmail ?? `inst:${loopInstitutionId ?? 'none'}`);
    const dedupeKey = `${SF_FEATURE_KEY}:${scopeSig}:${courseCode}`;

    return {
      ok: true,
      institutionId: loopInstitutionId,
      dedupeKey,
      context: {
        course_code: courseCode,
        p_institution_id: pInstitutionId,
        p_faculty_email: pFacultyEmail,
        loop_institution_id: loopInstitutionId,
        from, to,
      },
    };
  },

  async buildSubmitItem(admin, context) {
    const courseCode = String(context.course_code);
    const from = isoDate(context.from)!;
    const to = isoDate(context.to)!;
    const pInstitutionId = (context.p_institution_id as string | null) ?? null;
    const pFacultyEmail = (context.p_faculty_email as string | null) ?? null;
    const loopInstitutionId = (context.loop_institution_id as string | null) ?? null;

    // Aggregate + anonymized comments via SERVICE-ROLE-ONLY RPC.
    const { data, error } = await admin.rpc('fn_scf_ai_signal', {
      p_course_code: courseCode, p_from: from, p_to: to,
      p_institution_id: pInstitutionId, p_faculty_email: pFacultyEmail,
    });
    if (error) throw new Error(`fn_scf_ai_signal: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    const responses = Number(row?.responses ?? 0);
    const lowResponses = Number(row?.low_responses ?? 0);
    const avgUnderstood = row?.avg_understood != null ? Number(row.avg_understood) : null;
    const freeTexts: string[] = Array.isArray(row?.free_texts) ? row.free_texts : []; // server-side ONLY
    // Closed-window session dates (two-sided 48h window) — travel via itemContext
    // so recordResult can stamp suggestion.contributing_dates.
    const sessionDates: string[] = Array.isArray(row?.session_dates)
      ? row.session_dates.map((d: unknown) => String(d))
      : [];

    // Small-n floor → skip the LLM (no batch item created).
    if (responses < 3) {
      return { skip: true, result: { suggestion: null, reason: 'not_enough_feedback', meta: { responses, avg_understood: avgUnderstood } } };
    }

    // Self-improving track-record block (our own prior AI output — not user input).
    let trackRecordBlock = '';
    try {
      const { data: priorData } = await admin.rpc('fn_scf_prior_suggestion', {
        p_course_code: courseCode, p_faculty_email: pFacultyEmail, p_institution_id: loopInstitutionId,
      });
      const prior = Array.isArray(priorData) ? priorData[0] : priorData;
      if (prior?.suggestion) {
        const priorSummary = prior.suggestion && typeof prior.suggestion === 'object'
          ? String(prior.suggestion.summary ?? JSON.stringify(prior.suggestion)).slice(0, 600)
          : String(prior.suggestion).slice(0, 600);
        const lift = prior.outcome_lift != null ? Number(prior.outcome_lift) : null;
        const outcomeN = prior.outcome_responses != null ? Number(prior.outcome_responses) : null;
        let liftLine: string;
        if (!prior.has_outcome || lift === null) {
          liftLine = `The outcome of that advice is not measured yet.`;
        } else if (outcomeN !== null && outcomeN >= 5) {
          liftLine = `After that advice, in the next class ${lift >= 0.5 ? 'understanding improved — it helped somewhat, build on it.' : 'understanding did NOT meaningfully improve — change the approach; do not repeat the same advice.'}`;
        } else if (outcomeN !== null && outcomeN >= 3) {
          liftLine = `After that advice, understanding in the next class ${lift >= 0.5 ? 'appeared to improve' : 'did not clearly improve'} — but this is WEAK EVIDENCE: only ${outcomeN} learners answered the next session, so treat it as a hint, not proof.`;
        } else {
          liftLine = `An outcome was recorded for that advice${outcomeN !== null ? ` but only ${outcomeN} learner${outcomeN === 1 ? '' : 's'} answered the next session` : ''}, so it is LOW-CONFIDENCE — do not treat it as evidence.`;
        }
        const verdictLine = prior.human_verdict ? ` The teacher marked it: ${String(prior.human_verdict)}.` : '';
        trackRecordBlock = `\n\nYOUR PREVIOUS ADVICE FOR THIS CLASS (${String(prior.generated_at).slice(0, 10)}): ${priorSummary}\n${liftLine}${verdictLine}\nUse this track record: keep what worked, and propose a DIFFERENT, more specific adjustment for anything that did not move.`;
      }
    } catch { /* prior is best-effort — never block the submit */ }

    const commentBlock = freeTexts.length > 0
      ? freeTexts.map((t) => `- ${String(t).trim()}`).join('\n')
      : '- (no written comments — use the understanding level and group size above)';  // deep-review 2026-07-09 LOW: the prompt no longer carries response counts — do not invite the model to cite them
    const userPrompt = `Course: ${courseCode}
Window: ${from} to ${to}
Group size (words only — never repeat numbers): ${groupSizeWord(responses)}
Understanding level (qualitative): ${understandingBandWord(avgUnderstood)}

Anonymized student comments:
${commentBlock}${trackRecordBlock}

Generate the teaching-improvement JSON now.`;

    const { model_id: modelId } = await resolveChatModel(SF_FEATURE_KEY);

    return {
      skip: false,
      params: {
        // 2048 (not the sync route's 1024): a comment-rich class produces a
        // summary + 3-5 adjustments that overflow 1024 → truncated JSON →
        // JSON.parse throws at collect → task fails. Verified on MR3691 (16
        // comments → 1232 output tokens). The sync ai-suggest-improvement route
        // has the same latent 1024 cap; left untouched (out of scope) but noted.
        model: modelId,
        max_tokens: 2048,
        system: SF_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      },
      // NUMBERS + SCOPE only — NO free_texts (they went to Anthropic in `params`).
      itemContext: {
        course_code: courseCode, p_faculty_email: pFacultyEmail, loop_institution_id: loopInstitutionId,
        from, to, responses, low_responses: lowResponses, avg_understood: avgUnderstood,
        session_dates: sessionDates,
      },
    };
  },

  async recordResult(admin, itemContext, message) {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();
    const suggestion = JSON.parse(stripFences(text));

    const loopInstitutionId = (itemContext.loop_institution_id as string | null) ?? null;
    const courseCode = String(itemContext.course_code);
    const pFacultyEmail = (itemContext.p_faculty_email as string | null) ?? null;
    // Closed-window session dates from buildSubmitItem — stamped so the recorded
    // note cites its evidence base (two-sided 48h window).
    const sessionDates: string[] = Array.isArray(itemContext.session_dates)
      ? (itemContext.session_dates as unknown[]).map((d) => String(d))
      : [];

    let suggestionId: string | null = null;
    try {
      const { data: recordedId } = await admin.rpc('fn_scf_record_suggestion', {
        p_institution_id: loopInstitutionId,
        p_course_code: courseCode,
        p_faculty_email: pFacultyEmail,
        p_window_from: itemContext.from,
        p_window_to: itemContext.to,
        p_input_responses: itemContext.responses,
        p_input_low: itemContext.low_responses,
        p_input_avg: itemContext.avg_understood,
        p_suggestion:
          sessionDates.length > 0 ? { ...suggestion, contributing_dates: sessionDates } : suggestion,
        p_model: message.model,
      });
      suggestionId = typeof recordedId === 'string' ? recordedId : null;
    } catch { /* record is best-effort — the user still gets the suggestion */ }

    // ANONYMITY: result carries ONLY the synthesized suggestion + numeric meta.
    return {
      suggestion,
      suggestion_id: suggestionId,
      meta: {
        responses: itemContext.responses,
        low_responses: itemContext.low_responses,
        avg_understood: itemContext.avg_understood,
        model: message.model,
      },
    };
  },
};

// ============================================================================
// CURRICULUM — "Regenerate spine" (per-course click on /academic/curriculum-review)
// The interactive sibling of the bulk-mint cron
// (app/api/cron/curriculum-lesson-spine-generate/route.ts). entity_id = course id
// (uuid). Own feature_key ('curriculum.lesson_spine_regen', seeded in the Phase 2
// migration) so the generic ai-tasks-sweep collector and the cron's bespoke
// collect handler NEVER drain each other's batch jobs (see the cron's header).
//
// PROMPT/PARSE LOCKSTEP: the system prompt, briefs addendum, user-prompt builder,
// max_tokens and tolerant JSON extraction below are copied VERBATIM from the bulk
// cron — a regenerated spine must be the same artefact the initial mint produces.
// Next.js route files may only export route handlers (extra exports fail the
// build's route-type check), so the cron cannot export them; any change there
// MUST be mirrored here (and vice versa).
// ============================================================================
const REGEN_FEATURE_KEY = 'curriculum.lesson_spine_regen';
const REGEN_MAX_TOKENS = 8192;
const REGEN_DEFAULT_EMIT_BRIEFS = true; // policy row curriculum_ai.emit_assessment_briefs overrides (currently false in prod)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REGEN_SYSTEM_PROMPT = `You are a curriculum designer for an Indian higher-education institution (JKKN), building a teaching "lesson spine" for one course from its Board-of-Studies (BoS) approved syllabus.

You will receive the syllabus's units/chapters and its Course Learning Outcomes (CLOs, each with a clo_number and k_values — the Bloom cognitive levels K1-K6 the CLO targets: K1=Remember, K2=Understand, K3=Apply, K4=Analyze, K5=Evaluate, K6=Create).

Your job: break each unit into an ordered sequence of teachable LESSONS (typically 3-6 per unit — one per major topic/chapter section, not one per chapter as a whole), each grounded in the syllabus content and mapped to the CLOs it serves.

Use the Fink taxonomy dimension that best fits each lesson's PRIMARY teaching intent:
foundational (facts/concepts), application (skills/practice), integration (connecting ideas), human (self-understanding/confidence), caring (values/motivation), learning_to_learn (how to keep learning this).

For each lesson's learning_outcomes, cite ONE OR MORE Bloom levels (K1-K6) drawn from the CLOs it maps to (co_ref = the clo_number(s) it serves), and a Fink dimension per outcome statement (usually the lesson's own primary_fink_dimension, unless a specific outcome clearly targets a different one).

Ground every lesson title and outcome in the ACTUAL syllabus content provided — do not invent topics absent from it. Be concrete and India-context aware.

Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{
  "lessons": [
    {
      "unit_label": "Unit 1",
      "sequence_no": 1,
      "title": "...",
      "primary_fink_dimension": "foundational",
      "learning_outcomes": [
        {"text": "...", "fink_dimension": "foundational", "bloom_level": "K2", "co_ref": "CO1"}
      ]
    }
  ]
}
CRITICAL: sequence_no must be a single strictly-increasing integer across the WHOLE spine (unit 2's first lesson continues after unit 1's last), so the spine has one unambiguous teaching order.`;

// Bloom-primary variant — used when the course's BoS-fixed taxonomy is 'blooms'. BYTE-
// IDENTICAL to the bulk cron's BLOOM_SYSTEM_PROMPT and the Mac twin's — all three writers
// of curriculum_lesson stay in PROMPT/PARSE LOCKSTEP. Only the primary axis differs from
// REGEN_SYSTEM_PROMPT: a K1-K6 Bloom level, not a Fink dimension. Fink stays a HYBRID.
const REGEN_BLOOM_SYSTEM_PROMPT = `You are a learning-framework designer for an Indian higher-education institution (JKKN), building a teaching "lesson spine" for one course from its Board-of-Studies (BoS) approved learning pathway.

You will receive the syllabus's units/chapters and its Course Learning Outcomes (CLOs, each with a clo_number and k_values — the Bloom cognitive levels K1-K6 the CLO targets: K1=Remember, K2=Understand, K3=Apply, K4=Analyze, K5=Evaluate, K6=Create).

Your job: break each unit into an ordered sequence of teachable LESSONS (typically 3-6 per unit — one per major topic/chapter section, not one per chapter as a whole), each grounded in the syllabus content and mapped to the CLOs it serves.

This course's Board of Studies has FIXED the Bloom taxonomy for it. Tag each lesson with the SINGLE Bloom cognitive level (K1-K6) that best fits its PRIMARY teaching intent — the dominant level the lesson builds toward (K1=Remember, K2=Understand, K3=Apply, K4=Analyze, K5=Evaluate, K6=Create).

For each lesson's learning_outcomes, cite the Bloom level (K1-K6) that outcome targets (drawn from the CLOs it maps to, co_ref = the clo_number(s) it serves), and ALSO note the Fink dimension it touches (foundational, application, integration, human, caring, learning_to_learn) — Bloom is primary here, Fink is the secondary hybrid lens, so keep both on every outcome.

Ground every lesson title and outcome in the ACTUAL syllabus content provided — do not invent topics absent from it. Be concrete and India-context aware.

Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{
  "lessons": [
    {
      "unit_label": "Unit 1",
      "sequence_no": 1,
      "title": "...",
      "primary_bloom_level": "K2",
      "learning_outcomes": [
        {"text": "...", "bloom_level": "K2", "fink_dimension": "foundational", "co_ref": "CO1"}
      ]
    }
  ]
}
CRITICAL: sequence_no must be a single strictly-increasing integer across the WHOLE spine (unit 2's first lesson continues after unit 1's last), so the spine has one unambiguous teaching order.`;

// Course taxonomy branch (mirrors the bulk cron / Mac twin). 'finks'|'blooms'|
// 'jkkn_advanced', or null → the caller skips-and-flags (never defaults to Fink).
// JABT takes the Bloom prompt: its primary tag lives in `primary_bloom_level`.
type RegenTaxonomy = 'finks' | 'blooms' | 'jkkn_advanced';
function regenSystemForTaxonomy(taxonomy: RegenTaxonomy, emitBriefs: boolean): string {
  const base =
    taxonomy === 'blooms' || taxonomy === 'jkkn_advanced'
      ? REGEN_BLOOM_SYSTEM_PROMPT
      : REGEN_SYSTEM_PROMPT;
  return emitBriefs ? `${base}\n${REGEN_BRIEFS_ADDENDUM}` : base;
}

const REGEN_BRIEFS_ADDENDUM = `
You were ALSO given this course's assessment structure, which includes team-capstone options and/or a Concept-Application note. In addition to "lessons", also return:
"concept_briefs": [{"unit_label": "Unit 1", "title": "...", "text": "a short in-class Concept-Application activity brief grounded in the unit's content and the syllabus's Concept-Application note", "co_ref": ["CO1"]}]  (at most one per unit that has enough content to ground one)
"capstone_brief": {"title": "...", "text": "a short team-capstone brief, adapting ONE of the syllabus's own capstone options (pick the single best-grounded one) into a classroom-ready brief", "co_ref": ["CO1","CO2"]}  (omit entirely if the syllabus's capstone options don't give you enough to ground one)
Keep both brief kinds SHORT (2-4 sentences of "text") — they are prompts for the teacher to run in class, not full lesson plans.`;

type RegenLessonOut = {
  unit_label?: string;
  sequence_no?: number;
  title?: string;
  primary_fink_dimension?: string;
  primary_bloom_level?: string;
  learning_outcomes?: unknown[];
};
type RegenBriefOut = { unit_label?: string; title?: string; text?: string; co_ref?: string[] };
type RegenParsedSpine = { lessons?: RegenLessonOut[]; concept_briefs?: RegenBriefOut[]; capstone_brief?: RegenBriefOut | null };

function regenHasCapstoneData(assessmentStructure: unknown): boolean {
  if (!assessmentStructure || typeof assessmentStructure !== 'object') return false;
  const as = assessmentStructure as { capstones?: unknown[]; components?: unknown[]; concept_applications_note?: string };
  const hasCapstones = Array.isArray(as.capstones) && as.capstones.length > 0;
  const hasNote = typeof as.concept_applications_note === 'string' && as.concept_applications_note.trim().length > 0;
  return hasCapstones || hasNote;
}

function regenBuildUserPrompt(
  course: { course_code: string; course_name: string },
  syllabus: { course_content: unknown; course_learning_outcomes: unknown; assessment_structure: unknown },
  emitBriefs: boolean,
): string {
  const content = JSON.stringify(syllabus.course_content ?? {}).slice(0, 12000); // defensive cap
  const clos = JSON.stringify(syllabus.course_learning_outcomes ?? {}).slice(0, 6000);
  let prompt = `Course: ${course.course_code} — ${course.course_name}

Syllabus content (units/chapters):
${content}

Course Learning Outcomes (CLOs):
${clos}

Generate the lesson-spine JSON for this course now.`;
  if (emitBriefs) {
    const assessment = JSON.stringify(syllabus.assessment_structure ?? {}).slice(0, 4000);
    prompt += `\n\nAssessment structure (capstone options / Concept-Application note):\n${assessment}`;
  }
  return prompt;
}

// Tolerant extraction — mirrors the cron's parseSpineMessage: the model sometimes
// wraps the object in prose or trailing text, so slice the outermost {...} instead
// of failing the whole course.
function regenParseSpine(text: string): RegenParsedSpine {
  const jsonStr = stripFences(text);
  try {
    return JSON.parse(jsonStr) as RegenParsedSpine;
  } catch {
    const m = jsonStr.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON object in model output');
    return JSON.parse(m[0]) as RegenParsedSpine;
  }
}

const curriculumLessonSpineRegen: AiTaskType = {
  featureKey: REGEN_FEATURE_KEY,
  label: 'lesson-spine regeneration',
  // 'user': the dedupe key embeds the requester (see the dedupeKey disposition
  // below) — each reviewer gets their own pollable, RLS-visible task row.
  dedupeScope: 'user',
  resultPath: '/academic/curriculum-review',

  async resolveEnqueueContext(session, userId, entityId) {
    const courseId = (entityId || '').trim();
    if (!courseId) return { ok: false, status: 400, error: 'course id is required' };
    if (!UUID_RE.test(courseId)) return { ok: false, status: 400, error: 'course id must be a uuid' };

    // Authz — the EXACT review-page gate, evaluated in SQL as the caller:
    // fn_curriculum_lesson_drafts_for_course RAISES unless the caller is
    // super-admin OR (role_has_institution_access(course's institution) AND role
    // in the curriculum teaching-staff/HOD/admin list). Calling it (and ignoring
    // its data) reuses that rule verbatim instead of re-implementing it here —
    // whoever may review this course's drafts may ask for them to be regenerated.
    const { error: gateErr } = await session.rpc('fn_curriculum_lesson_drafts_for_course', {
      p_course_id: courseId,
    });
    if (gateErr) {
      const notFound = gateErr.message.includes('no such course');
      return { ok: false, status: notFound ? 404 : 403, error: gateErr.message };
    }

    // Course identity for the queue row + notifications (session read — the gate
    // above already proved institution access, so this is expected to succeed).
    const { data: course } = await session
      .from('courses')
      .select('id, institution_id, course_code')
      .eq('id', courseId)
      .maybeSingle();
    if (!course) return { ok: false, status: 404, error: 'no such course' };

    return {
      ok: true,
      institutionId: (course.institution_id as string | null) ?? null,
      // DISPOSITION (advisory review r1, HIGH — FIXED): the key MUST embed the
      // requester. The queue's in-flight guard is a GLOBAL partial unique index
      // on (feature_key, dedupe_key) and fn_ai_task_enqueue's ON CONFLICT DO
      // NOTHING returns the EXISTING task — with an entity-only key, reviewer
      // B's click returned reviewer A's task_id, whose row is RLS-hidden from B
      // (ai_task_queue own-rows SELECT policy) → B's button polled [] forever.
      // The queue migration's own comment mandates the requester in per-user
      // dedupe keys. Trade-off ACCEPTED knowingly: two reviewers CAN now both
      // enqueue the same course — safe, because fn_curriculum_lesson_ai_draft_upsert
      // is slot-idempotent (the later run rewrites the same draft slots) and the
      // stale-slot cleanup in recordResult leaves the end state = the latest
      // run's spine.
      dedupeKey: `${REGEN_FEATURE_KEY}:${userId}:${courseId}`,
      context: { course_id: courseId, course_code: course.course_code as string },
    };
  },

  async buildSubmitItem(admin, context) {
    const courseId = String(context.course_id);

    const { data: course, error: courseErr } = await admin
      .from('courses')
      .select('id, institution_id, course_code, course_name')
      .eq('id', courseId)
      .maybeSingle();
    if (courseErr) throw new Error(`courses read: ${courseErr.message}`);
    if (!course) {
      return { skip: true, result: { suggestion: { summary: 'This course no longer exists — nothing was regenerated.' }, reason: 'no_course' } };
    }

    // Latest live BoS syllabus — the EXACT join contract the bulk cron (and
    // fn_bos_clos_for_course) uses: course_code + institutions_id, is_latest,
    // not archived. Newest-first in case of duplicate is_latest rows.
    const { data: syllabusRows, error: sylErr } = await admin
      .from('bos_course_syllabi')
      .select('id, regulation_id, course_content, course_learning_outcomes, assessment_structure')
      .eq('course_code', course.course_code)
      .eq('institutions_id', course.institution_id)
      .eq('is_latest', true)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(1);
    if (sylErr) throw new Error(`bos_course_syllabi read: ${sylErr.message}`);
    const syllabus = syllabusRows?.[0];
    if (!syllabus) {
      // The ~87% no-syllabus path — same skip the bulk cron applies, reflected
      // back honestly instead of burning an LLM call.
      return {
        skip: true,
        result: {
          suggestion: { summary: `No Board-of-Studies syllabus is on file for ${course.course_code} — there is nothing to regenerate the spine from. Once a syllabus is approved and uploaded, try again.` },
          reason: 'no_syllabus',
        },
      };
    }

    // Read the course's BoS-FIXED taxonomy (bos_regulation_taxonomies via the syllabus's
    // regulation_id). 'finks' → Fink-primary prompt, 'blooms' → Bloom-primary. No taxonomy
    // fixed → skip-and-flag; never silently default to Fink (Director rule).
    // NOTE: a regulation can carry MORE THAN ONE taxonomy row in prod (duplicate
    // saves — e.g. regulation 4dc273c5 has 34 identical 'blooms' rows). .maybeSingle()
    // ERRORS on >1 row → data null → the course was wrongly skipped as 'no_taxonomy'
    // (a false skip that stranded ~38% of the Arts Bloom backfill, 305 courses, and
    // showed faculty a misleading "set the taxonomy" message when it was already set).
    // Use limit(1) + [0] — byte-identical to the Max-box twin's read — so a duplicated
    // (but consistent) taxonomy resolves correctly instead of vanishing.
    let taxonomy: RegenTaxonomy | null = null;
    const regId = syllabus.regulation_id;
    if (regId) {
      const { data: taxRows } = await admin
        .from('bos_regulation_taxonomies')
        .select('taxonomy_type')
        .eq('regulation_id', regId)
        .eq('institutions_id', course.institution_id)
        .limit(1);
      const tt = taxRows?.[0]?.taxonomy_type;
      taxonomy = tt === 'finks' || tt === 'blooms' ? tt : null;
    }
    if (!taxonomy) {
      return {
        skip: true,
        result: {
          suggestion: { summary: `The Board-of-Studies regulation for ${course.course_code} has no taxonomy (Fink or Bloom) fixed yet, so its lesson spine can't be regenerated. Set the regulation's taxonomy in BoS, then try again.` },
          reason: 'no_taxonomy',
        },
      };
    }

    // Config-table pattern — same policy read as the bulk cron (best-effort).
    let emitBriefsPolicy = REGEN_DEFAULT_EMIT_BRIEFS;
    try {
      const { data: briefsData } = await admin.rpc('fn_get_policy_bool', {
        p_key: 'curriculum_ai.emit_assessment_briefs',
        p_default: REGEN_DEFAULT_EMIT_BRIEFS,
        p_scope_id: null,
      });
      if (typeof briefsData === 'boolean') emitBriefsPolicy = briefsData;
    } catch { /* policy read is best-effort — defaults apply */ }
    const emitBriefs = emitBriefsPolicy && regenHasCapstoneData(syllabus.assessment_structure);

    const { model_id: modelId } = await resolveChatModel(REGEN_FEATURE_KEY);

    return {
      skip: false,
      params: {
        model: modelId,
        max_tokens: REGEN_MAX_TOKENS,
        system: regenSystemForTaxonomy(taxonomy, emitBriefs),
        messages: [{
          role: 'user',
          content: regenBuildUserPrompt(
            { course_code: String(course.course_code), course_name: String(course.course_name) },
            syllabus,
            emitBriefs,
          ),
        }],
      },
      // IDs + scope only — syllabus JSON went to Anthropic in `params`, never persisted.
      itemContext: {
        course_id: courseId,
        course_code: course.course_code,
        bos_syllabus_id: syllabus.id,
        taxonomy,   // carried so recordResult stamps the correct primary axis
        // Traceability stamp for curriculum_lesson.ai_batch_key (the generic sweep
        // doesn't expose its ai_batch_jobs id to recordResult).
        ai_batch_key: `regen:${courseId}:${Date.now()}`,
      },
    };
  },

  async recordResult(admin, itemContext, message) {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();
    const spine = regenParseSpine(text);

    const courseId = String(itemContext.course_id);
    const courseCode = String(itemContext.course_code ?? '');
    const bosSyllabusId = String(itemContext.bos_syllabus_id);
    const batchKey = typeof itemContext.ai_batch_key === 'string' ? itemContext.ai_batch_key : null;
    // Which primary axis to stamp. Legacy in-flight items (submitted before taxonomy was
    // carried) default to 'finks' — the behaviour they were generated under.
    const taxonomy: RegenTaxonomy = itemContext.taxonomy === 'blooms' ? 'blooms' : 'finks';
    const isBloom = taxonomy === 'blooms';

    // Record via the service-role-only draft writer — IDENTICAL contract to the
    // bulk cron's recordSpine: status='draft' always, source='bos_ai', idempotent
    // per (course, artifact_kind, slot) so a re-gen REPLACES the prior unapproved
    // draft in each slot and never touches a faculty-approved (published) lesson.
    // .rpc() does not throw on an RPC error — each call's .error is checked.
    let lessonsRecorded = 0;
    let briefsRecorded = 0;
    let failed = 0;

    for (const l of Array.isArray(spine.lessons) ? spine.lessons : []) {
      if (!l.title || typeof l.title !== 'string') continue;
      const { error } = await admin.rpc('fn_curriculum_lesson_ai_draft_upsert', {
        p_course_id: courseId,
        p_artifact_kind: 'lesson',
        p_sequence_no: typeof l.sequence_no === 'number' ? l.sequence_no : null,
        p_unit_label: typeof l.unit_label === 'string' ? l.unit_label : null,
        p_title: l.title,
        p_learning_outcomes: Array.isArray(l.learning_outcomes) ? l.learning_outcomes : [],
        p_primary_fink: isBloom ? null : (typeof l.primary_fink_dimension === 'string' ? l.primary_fink_dimension : null),
        p_primary_taxonomy: taxonomy,
        p_primary_bloom_level: isBloom ? (typeof l.primary_bloom_level === 'string' ? l.primary_bloom_level : null) : null,
        p_co_refs: Array.isArray(l.learning_outcomes)
          ? [...new Set(l.learning_outcomes.map((o) => (o as { co_ref?: string })?.co_ref).filter((x): x is string => typeof x === 'string'))]
          : [],
        p_bos_syllabus_id: bosSyllabusId,
        p_source: 'bos_ai',
        p_gemini_prompt: null,
        p_ai_batch_key: batchKey,
      });
      if (error) {
        console.error(`[ai-tasks/lesson-spine-regen] lesson record failed (course ${courseId}):`, error);
        failed++;
      } else {
        lessonsRecorded++;
      }
    }

    for (const b of Array.isArray(spine.concept_briefs) ? spine.concept_briefs : []) {
      if (!b.title || typeof b.title !== 'string' || !b.unit_label) continue;
      const { error } = await admin.rpc('fn_curriculum_lesson_ai_draft_upsert', {
        p_course_id: courseId,
        p_artifact_kind: 'concept_brief',
        p_sequence_no: null,
        p_unit_label: b.unit_label,
        p_title: b.title,
        p_learning_outcomes: [{ text: b.text ?? '', co_ref: Array.isArray(b.co_ref) ? b.co_ref : [] }],
        p_primary_fink: null,
        p_primary_taxonomy: taxonomy,
        p_primary_bloom_level: null,
        p_co_refs: Array.isArray(b.co_ref) ? b.co_ref : [],
        p_bos_syllabus_id: bosSyllabusId,
        p_source: 'bos_ai',
        p_gemini_prompt: null,
        p_ai_batch_key: batchKey,
      });
      if (error) {
        console.error(`[ai-tasks/lesson-spine-regen] concept_brief record failed (course ${courseId}):`, error);
        failed++;
      } else {
        briefsRecorded++;
      }
    }

    const cap = spine.capstone_brief;
    if (cap && typeof cap.title === 'string') {
      const { error } = await admin.rpc('fn_curriculum_lesson_ai_draft_upsert', {
        p_course_id: courseId,
        p_artifact_kind: 'capstone_brief',
        p_sequence_no: null,
        p_unit_label: null,
        p_title: cap.title,
        p_learning_outcomes: [{ text: cap.text ?? '', co_ref: Array.isArray(cap.co_ref) ? cap.co_ref : [] }],
        p_primary_fink: null,
        p_primary_taxonomy: taxonomy,
        p_primary_bloom_level: null,
        p_co_refs: Array.isArray(cap.co_ref) ? cap.co_ref : [],
        p_bos_syllabus_id: bosSyllabusId,
        p_source: 'bos_ai',
        p_gemini_prompt: null,
        p_ai_batch_key: batchKey,
      });
      if (error) {
        console.error(`[ai-tasks/lesson-spine-regen] capstone_brief record failed (course ${courseId}):`, error);
        failed++;
      } else {
        briefsRecorded++;
      }
    }

    // A partial or empty write must FAIL the task (the sweep marks it failed and
    // tells the requester to try again) — the upsert is idempotent per slot, so a
    // retry click is safe and completes the spine.
    if (failed > 0) {
      throw new Error(`${failed} draft write(s) failed (${lessonsRecorded} lessons + ${briefsRecorded} briefs recorded)`);
    }
    if (lessonsRecorded === 0) {
      throw new Error('model output contained no usable lessons');
    }

    // DISPOSITION (advisory review r1, MEDIUM — FIXED): stale-orphan cleanup.
    // Regen targets courses that ALREADY have a spine; the slot upsert only
    // rewrites slots the NEW spine also produced, so a shorter or renumbered
    // spine would leave the old run's extra slots behind as zombie drafts
    // (e.g. 18 fresh + 4 stale lessons). Every slot THIS run wrote carries
    // ai_batch_key = batchKey (the upsert stamps it on both its INSERT and
    // UPDATE branches), so after a fully-successful write, any remaining
    // draft+AI-source row for this course WITHOUT this run's key is a stale
    // orphan → delete. NEVER touches approved lessons (status='draft' filter —
    // approve flips status to 'published') nor faculty-authored rows (source
    // filter). Runs only after the success gates above, and only with a
    // non-null batchKey (a null key would make the not-this-run predicate match
    // this run's own rows). A cleanup failure throws → task marked failed →
    // the retry click re-upserts idempotently and re-attempts the cleanup.
    if (batchKey) {
      const { error: staleErr } = await admin
        .from('curriculum_lesson')
        .delete()
        .eq('course_id', courseId)
        .eq('status', 'draft')
        .in('source', ['bos_ai', 'title_ai'])
        // NULL-safe "not this run": .neq() alone compiles to SQL <> which drops
        // NULL ai_batch_key rows (pre-tagging drafts) from the match. Value is
        // double-quoted for PostgREST or-parsing (it contains ':').
        .or(`ai_batch_key.is.null,ai_batch_key.neq."${batchKey}"`);
      if (staleErr) {
        throw new Error(`stale-draft cleanup failed after spine write: ${staleErr.message}`);
      }
    }

    return {
      suggestion: {
        summary: `Regenerated the draft lesson spine for ${courseCode || 'this course'}: ${lessonsRecorded} lesson draft${lessonsRecorded === 1 ? '' : 's'}${briefsRecorded > 0 ? ` and ${briefsRecorded} brief${briefsRecorded === 1 ? '' : 's'}` : ''} are waiting in the review inbox. Nothing reaches students until you approve each draft.`,
      },
      meta: {
        lessons_recorded: lessonsRecorded,
        briefs_recorded: briefsRecorded,
        course_code: courseCode || null,
        model: message.model,
      },
    };
  },
};

// ── registry ─────────────────────────────────────────────────────────────────
export const AI_TASK_TYPES: Record<string, AiTaskType> = {
  [SF_FEATURE_KEY]: sessionFeedbackSummarize,
  [REGEN_FEATURE_KEY]: curriculumLessonSpineRegen,
};

export function getTaskType(featureKey: string): AiTaskType | undefined {
  return AI_TASK_TYPES[featureKey];
}

export function allTaskFeatureKeys(): string[] {
  return Object.keys(AI_TASK_TYPES);
}
