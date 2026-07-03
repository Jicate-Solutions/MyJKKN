// app/api/academic/session-feedback/ai-suggest-improvement/route.ts
// Session-feedback AI assist — the loop's IMPROVE step.
//
// POST { course_code, from?, to? } → for a course whose recent post-class
// feedback scored LOW on student understanding, call Claude to return concrete
// teaching adjustments (likely causes, suggested changes, a quick win, and what
// to watch in the next session's understanding score).
//
// ANONYMITY (load-bearing invariant): the raw anonymized comment text
// (free_texts) is read via the SERVICE-ROLE-ONLY fn_scf_ai_signal and sent ONLY
// to the model. It is NEVER returned in the HTTP response — staff receive only
// the synthesized suggestion plus numeric meta. The scope logic below is the
// authorization boundary (the read bypasses RLS).
//
// Cloned from app/api/cdc/career-guidance/route.ts (auth shape, model call,
// fence-strip + JSON.parse, error handling).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  resolveChatModel,
  recordChatUsage,
} from '@/lib/services/platform/ai-clients/chat';
import { getModel } from '@/lib/services/platform/ai-providers';

// Model resolves at runtime from ai_model_config (feature_key below);
// resolveChatModel never throws — hardcoded fallback on any config failure.
const FEATURE_KEY = 'session_feedback.suggest_improvement';

// Cost in INR from the pricing registry — null when pricing/tokens are missing.
function costInr(
  modelId: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null } | undefined,
): number | null {
  const pricing = getModel('anthropic', modelId);
  const input = usage?.input_tokens;
  const output = usage?.output_tokens;
  if (!pricing || pricing.inputPer1KTokensInr == null || pricing.outputPer1KTokensInr == null) return null;
  if (input == null || output == null) return null;
  return Number(
    ((input / 1000) * pricing.inputPer1KTokensInr + (output / 1000) * pricing.outputPer1KTokensInr).toFixed(6),
  );
}

// Roles that may see institution-wide signals (non-super leadership). A plain
// faculty/staff caller falls through to the self-scoped (own-email) path.
const LEADERSHIP_ROLES = new Set([
  'administrator',
  'institution_admin',
  'dean',
  'hod',
  'principal',
  'coordinator',
]);

const SYSTEM_PROMPT = `You are a teaching-improvement assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback on how well they understood a session. You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Use ONLY the data provided; ground every suggestion in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must reference the next session's understanding score (the loop's verifier).`;

// YYYY-MM-DD validator — reject malformed dates rather than passing junk to the RPC.
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const courseCode =
      typeof body.course_code === 'string' ? body.course_code.trim() : '';
    if (!courseCode) {
      return NextResponse.json(
        { ok: false, error: 'course_code is required' },
        { status: 400 }
      );
    }

    // Date window — default to the last 30 days when not supplied.
    const today = new Date();
    const defaultTo = today.toISOString().slice(0, 10);
    const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const from = isoDate(body.from) ?? defaultFrom;
    const to = isoDate(body.to) ?? defaultTo;

    // 1) Authn — session client.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'not authenticated' },
        { status: 401 }
      );
    }

    // 2) Caller's profile → drives scope. Read with the SESSION client (RLS:
    //    a user can always read their own profile row).
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile?.role as string | null) ?? null;
    const isSuper =
      profile?.is_super_admin === true || role === 'super_admin';
    const isLeadership = isSuper || (role !== null && LEADERSHIP_ROLES.has(role));

    // 3) Decide scope filters for the RPC. Each branch self-limits:
    //    - super        → all institutions, all faculty
    //    - leadership    → own institution, all faculty
    //    - else (staff)  → own taught sessions only (scoped by their email)
    //   The else branch is safe even for a caller with no taught sessions: the
    //   email filter simply returns 0 rows. No hard 403 is needed because every
    //   non-super path is self-limiting; only unauthenticated callers are rejected.
    let pInstitutionId: string | null;
    let pFacultyEmail: string | null;
    if (isSuper) {
      pInstitutionId = null;
      pFacultyEmail = null;
    } else if (isLeadership) {
      pInstitutionId = (profile?.institution_id as string | null) ?? null;
      pFacultyEmail = null;
    } else {
      pInstitutionId = null;
      pFacultyEmail = (profile?.email as string | null)?.toLowerCase() ?? null;
    }

    // Institution the self-improving loop row is recorded/looked-up under. The
    // faculty-self path scopes the AI read by email (pInstitutionId=null), but the
    // stored suggestion MUST carry the resolved institution — otherwise the row is
    // NULL-institution and readable by every authenticated user (the
    // role_has_institution_access(NULL)=true gap). Super-admin course-level rows
    // legitimately stay NULL (super/admin-only read). NOTE: the super/leadership
    // lane records at faculty_email=NULL (course-level) while the faculty-self lane
    // records the real email — two intentionally disjoint loop lanes.
    const loopInstitutionId =
      pInstitutionId ?? ((profile?.institution_id as string | null) ?? null);

    // 4) Read the aggregate + anonymized comments via the SERVICE-ROLE-ONLY RPC.
    const admin = createServiceRoleClient();
    const { data, error: rpcError } = await admin.rpc('fn_scf_ai_signal', {
      p_course_code: courseCode,
      p_from: from,
      p_to: to,
      p_institution_id: pInstitutionId,
      p_faculty_email: pFacultyEmail,
    });

    if (rpcError) {
      console.error('[academic/ai-suggest-improvement] RPC failed:', rpcError);
      return NextResponse.json(
        { ok: false, error: 'Could not load feedback signal.' },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const responses = Number(row?.responses ?? 0);
    const lowResponses = Number(row?.low_responses ?? 0);
    const avgUnderstood =
      row?.avg_understood !== null && row?.avg_understood !== undefined
        ? Number(row.avg_understood)
        : null;
    // free_texts stays server-side ONLY — fed to the model, never returned.
    const freeTexts: string[] = Array.isArray(row?.free_texts) ? row.free_texts : [];

    // 5) Below the small-n floor → skip the LLM (saves cost + avoids noise).
    if (responses < 3) {
      return NextResponse.json({
        ok: true,
        suggestion: null,
        reason: 'not_enough_feedback',
        meta: { responses, avg_understood: avgUnderstood },
      });
    }

    // 5b) SELF-IMPROVING: fetch this class's most recent prior suggestion and
    //     whether it actually moved understanding, so the model proposes a
    //     BETTER adjustment instead of repeating itself. The prior is OUR OWN
    //     past AI output (not user input) — no new injection surface.
    let trackRecordBlock = '';
    try {
      const { data: priorData } = await admin.rpc('fn_scf_prior_suggestion', {
        p_course_code: courseCode,
        p_faculty_email: pFacultyEmail,
        p_institution_id: loopInstitutionId,
      });
      const prior = Array.isArray(priorData) ? priorData[0] : priorData;
      if (prior?.suggestion) {
        const priorSummary =
          prior.suggestion && typeof prior.suggestion === 'object'
            ? String(prior.suggestion.summary ?? JSON.stringify(prior.suggestion)).slice(0, 600)
            : String(prior.suggestion).slice(0, 600);
        const lift = prior.outcome_lift !== null && prior.outcome_lift !== undefined
          ? Number(prior.outcome_lift)
          : null;
        // Sample-size guard: outcome_lift on the follow-up session can be a
        // tiny-sample delta. Only let the model assert "this did/didn't help" when
        // enough learners answered the follow-up; otherwise flag it low-confidence
        // so the model treats the prior outcome as a weak signal, not a verdict.
        const outcomeN =
          prior.outcome_responses !== null && prior.outcome_responses !== undefined
            ? Number(prior.outcome_responses)
            : null;
        let liftLine: string;
        if (!prior.has_outcome || lift === null) {
          liftLine = `The outcome of that advice is not measured yet.`;
        } else if (outcomeN !== null && outcomeN >= 5) {
          // Strong-enough evidence: assert the direction.
          liftLine = `After that advice, the next class's understanding moved ${lift >= 0 ? '+' : ''}${prior.outcome_lift} (from ${prior.input_avg}/5, ${outcomeN} learners). ${lift >= 0.5 ? 'It helped somewhat — build on it.' : 'It did NOT meaningfully help — change the approach; do not repeat the same advice.'}`;
        } else if (outcomeN !== null && outcomeN >= 3) {
          // Weak evidence: report the number but caveat it; do not let the model treat it as proof.
          liftLine = `After that advice, the next class's understanding moved ${lift >= 0 ? '+' : ''}${prior.outcome_lift} (from ${prior.input_avg}/5) — but this is WEAK EVIDENCE: only ${outcomeN} learners answered the next session, so treat it as a hint, not proof. Do not conclude the advice did or didn't work from this alone.`;
        } else {
          // Below the floor (or unknown N): explicitly low-confidence.
          liftLine = `An outcome was recorded for that advice${outcomeN !== null ? ` but only ${outcomeN} learner${outcomeN === 1 ? '' : 's'} answered the next session` : ''}, so it is LOW-CONFIDENCE — do not treat it as evidence the advice worked or failed.`;
        }
        const verdictLine = prior.human_verdict
          ? ` The teacher marked it: ${String(prior.human_verdict)}.`
          : '';
        trackRecordBlock = `\n\nYOUR PREVIOUS ADVICE FOR THIS CLASS (${String(prior.generated_at).slice(0, 10)}): ${priorSummary}\n${liftLine}${verdictLine}\nUse this track record: keep what worked, and propose a DIFFERENT, more specific adjustment for anything that did not move.`;
      }
    } catch (priorErr) {
      console.error('[academic/ai-suggest-improvement] prior fetch failed:', priorErr);
    }

    // 6) Build the prompt + call Claude.
    const commentBlock =
      freeTexts.length > 0
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

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'AI is not configured (missing API key).' },
        { status: 503 }
      );
    }

    // Resolved AFTER the cheap-exit paths (small-n floor, 503-on-missing-key)
    // so config resolution never runs for requests that skip the LLM.
    const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

    const anthropic = new Anthropic({ apiKey });
    const aiStartedAt = Date.now();
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create({
        model: modelId,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } catch (aiErr) {
      // Record the failed invocation (recordChatUsage is internally
      // non-throwing), then rethrow — the outer catch keeps the existing 500.
      await recordChatUsage(FEATURE_KEY, 'anthropic', modelId, {
        duration_ms: Date.now() - aiStartedAt,
        success: false,
        error_message: aiErr instanceof Error ? aiErr.message.slice(0, 500) : String(aiErr),
      });
      throw aiErr;
    }
    await recordChatUsage(FEATURE_KEY, 'anthropic', modelId, {
      input_tokens: resp.usage?.input_tokens ?? undefined,
      output_tokens: resp.usage?.output_tokens ?? undefined,
      cost_inr: costInr(modelId, resp.usage) ?? undefined,
      duration_ms: Date.now() - aiStartedAt,
      success: true,
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    // Strip ```json fences (the model occasionally wraps despite instructions).
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const suggestion = JSON.parse(jsonStr);

    // 7) SELF-IMPROVING: record this suggestion + the input state it was based on,
    //    so the daily outcome job can attribute the next-class lift and the NEXT
    //    suggestion can learn from it. Best-effort — a record failure must never
    //    break the user-facing suggestion. Only the synthesized guidance is
    //    stored; the raw free_texts are NOT.
    // suggestionId is the recorded loop-memory row — returned so the UI can attach
    // the teacher's human verdict (fn_scf_set_verdict) to THIS suggestion. Null if
    // recording failed (the suggestion still renders; only the verdict buttons hide).
    let suggestionId: string | null = null;
    try {
      const { data: recordedId } = await admin.rpc('fn_scf_record_suggestion', {
        p_institution_id: loopInstitutionId,
        p_course_code: courseCode,
        p_faculty_email: pFacultyEmail,
        p_window_from: from,
        p_window_to: to,
        p_input_responses: responses,
        p_input_low: lowResponses,
        p_input_avg: avgUnderstood,
        p_suggestion: suggestion,
        p_model: resp.model,
      });
      // RETURNS uuid → the new scf_ai_suggestions row id.
      suggestionId = typeof recordedId === 'string' ? recordedId : null;
    } catch (recErr) {
      console.error('[academic/ai-suggest-improvement] record failed:', recErr);
    }

    // ANONYMITY: response carries ONLY the synthesized suggestion + numeric meta +
    // the loop-memory row id. freeTexts is deliberately excluded.
    return NextResponse.json({
      ok: true,
      suggestion,
      suggestion_id: suggestionId,
      meta: {
        responses,
        low_responses: lowResponses,
        avg_understood: avgUnderstood,
        model: resp.model,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    console.error('[academic/ai-suggest-improvement] error:', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
