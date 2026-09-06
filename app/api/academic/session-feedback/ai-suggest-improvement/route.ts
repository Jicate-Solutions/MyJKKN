// app/api/academic/session-feedback/ai-suggest-improvement/route.ts
// Session-feedback AI assist — the loop's IMPROVE step.
//
// POST { course_code, from?, to? } → for a course whose recent post-class
// feedback scored LOW on student understanding, get concrete teaching
// adjustments (likely causes, suggested changes, a quick win, and what to watch
// in the next session's understanding score).
//
// REGISTRY CONVERSION (2026-07-13): this route no longer calls Anthropic
// directly. It enqueues a `session_feedback.suggest_improvement` job on the
// #1998 generic AI-jobs registry (fn_ai_enqueue) whose prompt_template +
// tool_set live in ai_job_types (seeded by 20260713000300_seed_staff_ai_job_types.sql),
// then long-polls fn_ai_job_status for the drain's result — mirroring the
// proven real-feature conversion app/api/work-pulse/translate/route.ts. The
// route STILL assembles exactly the data the prompt needs; only WHERE it goes
// changed: instead of a direct model call, it ships the placeholder variables
// as the job payload. The seed template runs with NO tools (tool_set set to
// none by the orchestrator at merge), so the answer is fast + deterministic and
// never fetches anything. Usage recording happens runner-side (Claude Max, ₹0).
//
// ANONYMITY (load-bearing invariant): the raw anonymized comment text
// (free_texts) is read via the SERVICE-ROLE-ONLY fn_scf_ai_signal and sent ONLY
// into the job payload. It is NEVER returned in the HTTP response — staff
// receive only the synthesized suggestion plus numeric meta. The scope logic
// below is the authorization boundary (the read bypasses RLS).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Long-poll the ai_jobs Max lane (the generic seat/Windows drain claims ~every
// minute). Kept < maxDuration so the poll window finishes before a hard-kill.
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// The registry job_type — its prompt_template + input_schema + tool_set live in
// ai_job_types. We send ONLY the placeholder variables it expects (below).
const JOB_TYPE = 'session_feedback.suggest_improvement';

// Poll cadence — mirrors app/api/work-pulse/translate/route.ts (the proven
// ai_jobs consumer).
const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000; // give up if never claimed (drain offline)
const TOTAL_DEADLINE_MS = 285_000; // kept < maxDuration (300s) so we respond first

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Read the model's answer text out of the drain's result jsonb. The generic
// runner returns { answer } (same contract ai-query / translate read); we also
// tolerate a few plausible shapes — and an already-structured suggestion object
// — so a completed result never falls silently to null.
function extractAnswerText(result: unknown): string | null {
  if (typeof result === 'string') return result.trim() || null;
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const key of ['answer', 'text', 'result', 'output']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
    // Already a parsed suggestion object → re-serialize so the shared JSON.parse
    // path below handles it uniformly.
    if (typeof o.summary === 'string' && Array.isArray(o.suggestedAdjustments)) {
      return JSON.stringify(o);
    }
  }
  return null;
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

// YYYY-MM-DD validator — reject malformed dates rather than passing junk to the RPC.
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// Facilitator-facing understanding must never be a raw number: a printed
// baseline/target invites gaming ("ask students to score 3.6 every time"). The
// numeric avg is still recorded to the backend (p_input_avg) for the loop's own
// measurement; only what the AI SEES and SAYS is qualitative. Display band
// (recalibrated 2026-07-24): LOW < 3, MIXED < 4.0, STRONG >= 4.0 — mirrors
// understandingLevel. The cron's STANDOUT_THRESHOLD (4.5) note gate is NOT moved.
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

export async function POST(req: NextRequest) {
  try {
    await connection();

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

    // 1) Authn — session client. fn_ai_enqueue / fn_ai_job_status are
    //    auth.uid()-gated, so the same session client drives enqueue + poll.
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
    // free_texts stays server-side ONLY — fed into the job payload, never returned.
    const freeTexts: string[] = Array.isArray(row?.free_texts) ? row.free_texts : [];
    // Contributing session dates (closed-window only — two-sided 48h window):
    // stamped onto the recorded suggestion so every note cites its evidence base.
    const sessionDates: string[] = Array.isArray(row?.session_dates)
      ? row.session_dates.map((d: unknown) => String(d))
      : [];

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
          // Strong-enough evidence: assert the direction (qualitative — no score).
          // Three-zone rule (Director 2026-07-10, decision 1): < 0 dropped ·
          // 0–0.5 about the same · >= 0.5 helped. LOCKSTEP with the cron
          // route's buildTrackRecordBlock and the verdict-integrity fns.
          liftLine =
            lift >= 0.5
              ? `After that advice, in the next class understanding improved — it helped, build on it.`
              : lift < 0
                ? `After that advice, in the next class understanding DROPPED — change the approach; do not repeat the same advice.`
                : `After that advice, understanding stayed about the same — no clear gain; propose a sharper, DIFFERENT adjustment.`;
        } else if (outcomeN !== null && outcomeN >= 3) {
          // Weak evidence: give direction but caveat it; do not let the model treat it as proof.
          liftLine = `After that advice, understanding in the next class ${lift >= 0.5 ? 'appeared to improve' : lift < 0 ? 'appeared to drop' : 'stayed about the same'} — but this is WEAK EVIDENCE: only ${outcomeN} learners answered the next session, so treat it as a hint, not proof. Do not conclude the advice did or didn't work from this alone.`;
        } else {
          // Below the floor (or unknown N): explicitly low-confidence.
          liftLine = `An outcome was recorded for that advice${outcomeN !== null ? ` but only ${outcomeN} learner${outcomeN === 1 ? '' : 's'} answered the next session` : ''}, so it is LOW-CONFIDENCE — do not treat it as evidence the advice worked or failed.`;
        }
        const verdictLine = prior.human_verdict
          ? ` The facilitator marked it: ${String(prior.human_verdict)}.`
          : '';
        trackRecordBlock = `\n\nYOUR PREVIOUS ADVICE FOR THIS CLASS (${String(prior.generated_at).slice(0, 10)}): ${priorSummary}\n${liftLine}${verdictLine}\nUse this track record: keep what worked, and propose a DIFFERENT, more specific adjustment for anything that did not move.`;
      }
    } catch (priorErr) {
      console.error('[academic/ai-suggest-improvement] prior fetch failed:', priorErr);
    }

    // 5c) Cross-peek (Director 2026-07-10, decision 8): the same class keeps
    //     two loop notebooks — teacher lane (faculty_email set) and leadership
    //     lane (faculty_email NULL). They stay separate (privacy design), but
    //     new advice glances at the OTHER lane's latest note so the two never
    //     contradict each other unknowingly. Read-only; best-effort.
    try {
      let peek = admin
        .from('scf_ai_suggestions')
        .select('suggestion, generated_at')
        .eq('domain', 'session_feedback')
        .eq('course_code', courseCode)
        .order('generated_at', { ascending: false })
        .limit(1);
      peek = pFacultyEmail
        ? peek.is('faculty_email', null)
        : peek.not('faculty_email', 'is', null);
      // STRICT same-tenant scope (skeptic review 2026-07-10): course_code is
      // not globally unique, and NULL-institution (super course-level) rows are
      // not tenant-attributable — this query runs on the service-role client,
      // so an `is.null` disjunct would bypass the RLS that hides those rows and
      // could inject ANOTHER institution's advice into this prompt (and shadow
      // the own-tenant note, being newest). NULL-institution callers (super
      // course-level) peek only NULL rows: conservative, no cross-tenant flow.
      peek = loopInstitutionId
        ? peek.eq('institution_id', loopInstitutionId)
        : peek.is('institution_id', null);
      const { data: peekData, error: peekErr } = await peek;
      if (!peekErr && peekData?.length) {
        const other = peekData[0] as { suggestion: unknown; generated_at: string };
        const otherSummary =
          other.suggestion && typeof other.suggestion === 'object'
            ? String((other.suggestion as Record<string, unknown>).summary ?? '').slice(0, 300)
            : String(other.suggestion ?? '').slice(0, 300);
        if (otherSummary) {
          trackRecordBlock += `\nFYI — the ${pFacultyEmail ? 'leadership' : 'facilitator'}-side notebook's latest advice for this class (${String(other.generated_at).slice(0, 10)}): ${otherSummary}\nDo not contradict that advice; complement it or build on it.`;
        }
      }
    } catch (peekErr) {
      console.error('[academic/ai-suggest-improvement] cross-peek fetch failed:', peekErr);
    }

    // 6) Assemble the anonymized comment block (feeds the {{comments}}
    //    placeholder) and enqueue the registry job. We send ONLY the seven
    //    placeholder variables the seeded prompt_template expects — the prompt
    //    itself lives in ai_job_types, so no prompt text leaves this route.
    const commentBlock =
      freeTexts.length > 0
        ? freeTexts.map((t) => `- ${String(t).trim()}`).join('\n')
        : '- (no written comments — use the aggregate signals)';

    // EXACT placeholder keys the seeded prompt_template uses:
    // comments, course_code, from, group_size_word, to, track_record, understanding_band
    const payload = {
      course_code: courseCode,
      from,
      to,
      group_size_word: groupSizeWord(responses),
      understanding_band: understandingBandWord(avgUnderstood),
      comments: commentBlock,
      track_record: trackRecordBlock,
    };

    const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
      p_job_type: JOB_TYPE,
      p_payload: payload,
    });
    if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
      const errText = typeof enq?.error === 'string' ? enq.error : '';
      // Seed not applied / feature disabled by the orchestrator → "unavailable".
      if (errText === 'unknown or disabled job_type') {
        return NextResponse.json(
          { ok: false, error: 'AI suggestions are not available right now. Please try again later.' },
          { status: 503 }
        );
      }
      if (errText === 'too many in-flight jobs of this type') {
        return NextResponse.json(
          { ok: false, error: 'A suggestion is already being generated. Please wait for it to finish.' },
          { status: 429 }
        );
      }
      if (errText === 'not allowed for this job_type') {
        return NextResponse.json(
          { ok: false, error: 'You do not have access to this feature.' },
          { status: 403 }
        );
      }
      console.error('[academic/ai-suggest-improvement] enqueue failed:', enqError ?? enq);
      return NextResponse.json(
        { ok: false, error: 'Could not start the suggestion. Please try again.' },
        { status: 500 }
      );
    }

    // Long-poll the Max lane for the answer (mirrors the translate reference).
    const jobId = enq.job_id;
    const startedAt = Date.now();
    let answerText: string | null = null;
    let modelUsed = 'max-lane';
    while (Date.now() - startedAt < TOTAL_DEADLINE_MS) {
      await sleep(POLL_MS);
      const { data: st, error: stError } = await supabase.rpc('fn_ai_job_status', {
        p_job_id: jobId,
      });
      if (stError || !st || typeof st.status !== 'string') continue;
      if (st.status === 'done') {
        const r = (st as { result?: unknown }).result;
        answerText = extractAnswerText(r);
        const m =
          r && typeof r === 'object' ? (r as Record<string, unknown>).model : null;
        if (typeof m === 'string' && m.trim()) modelUsed = m.trim();
        break;
      }
      if (st.status === 'error' || st.status === 'canceled' || st.status === 'not_found') {
        break;
      }
      // Never claimed within the unclaimed window → the drain is offline.
      if (st.status === 'pending' && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
        break;
      }
    }

    if (answerText === null) {
      return NextResponse.json(
        { ok: false, error: 'The suggestion did not finish in time. Please try again in a moment.' },
        { status: 503 }
      );
    }

    // Strip ```json fences (the model occasionally wraps despite instructions).
    const jsonStr = answerText
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
        p_suggestion:
          sessionDates.length > 0 ? { ...suggestion, contributing_dates: sessionDates } : suggestion,
        p_model: modelUsed,
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
        model: modelUsed,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    console.error('[academic/ai-suggest-improvement] error:', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
