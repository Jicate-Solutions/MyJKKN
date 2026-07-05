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
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must reference the next session's understanding score (the loop's verifier).`;

const sessionFeedbackSummarize: AiTaskType = {
  featureKey: SF_FEATURE_KEY,
  label: 'Summarise class feedback',
  dedupeScope: 'entity',

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
          liftLine = `After that advice, the next class's understanding moved ${lift >= 0 ? '+' : ''}${prior.outcome_lift} (from ${prior.input_avg}/5, ${outcomeN} learners). ${lift >= 0.5 ? 'It helped somewhat — build on it.' : 'It did NOT meaningfully help — change the approach; do not repeat the same advice.'}`;
        } else if (outcomeN !== null && outcomeN >= 3) {
          liftLine = `After that advice, the next class's understanding moved ${lift >= 0 ? '+' : ''}${prior.outcome_lift} (from ${prior.input_avg}/5) — but this is WEAK EVIDENCE: only ${outcomeN} learners answered the next session, so treat it as a hint, not proof.`;
        } else {
          liftLine = `An outcome was recorded for that advice${outcomeN !== null ? ` but only ${outcomeN} learner${outcomeN === 1 ? '' : 's'} answered the next session` : ''}, so it is LOW-CONFIDENCE — do not treat it as evidence.`;
        }
        const verdictLine = prior.human_verdict ? ` The teacher marked it: ${String(prior.human_verdict)}.` : '';
        trackRecordBlock = `\n\nYOUR PREVIOUS ADVICE FOR THIS CLASS (${String(prior.generated_at).slice(0, 10)}): ${priorSummary}\n${liftLine}${verdictLine}\nUse this track record: keep what worked, and propose a DIFFERENT, more specific adjustment for anything that did not move.`;
      }
    } catch { /* prior is best-effort — never block the submit */ }

    const commentBlock = freeTexts.length > 0
      ? freeTexts.map((t) => `- ${String(t).trim()}`).join('\n')
      : '- (no written comments — use the numeric signals)';
    const userPrompt = `Course: ${courseCode}
Window: ${from} to ${to}
Responses: ${responses}
Low-understanding responses (understood <= 2 of 5): ${lowResponses}
Average understanding (1-5): ${avgUnderstood ?? 'n/a'}

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
        p_suggestion: suggestion,
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

// ── registry ─────────────────────────────────────────────────────────────────
export const AI_TASK_TYPES: Record<string, AiTaskType> = {
  [SF_FEATURE_KEY]: sessionFeedbackSummarize,
};

export function getTaskType(featureKey: string): AiTaskType | undefined {
  return AI_TASK_TYPES[featureKey];
}

export function allTaskFeatureKeys(): string[] {
  return Object.keys(AI_TASK_TYPES);
}
