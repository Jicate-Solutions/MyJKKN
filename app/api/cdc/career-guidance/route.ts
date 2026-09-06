// app/api/cdc/career-guidance/route.ts
// AI Career Guidance (BUG-004057) — counsellor tool.
// POST { learnerId } → aggregate the learner's career-relevant data and ask the
// AI (via the #1998 Max lane) to produce career paths / skill gaps / next steps,
// plus a list of missing data to record. Empty CDC sources (OBE marks,
// placements, internships, training) are surfaced as gaps rather than hidden.
//
// Privacy: only career-relevant, non-sensitive fields are sent to the model.
// Identity/financial/contact PII (aadhar, income, parent details, address,
// mobile, email) is deliberately NOT included in the prompt.
//
// ─────────────────────────────────────────────────────────────────────────────
// MAX-LANE CONVERSION (2026-07-13): this route no longer calls Anthropic
// directly. It assembles the SAME learner data block as before and enqueues a
// `cdc.career_guidance` job on the generic AI-jobs registry (fn_ai_enqueue),
// whose prompt_template + tool_set live in ai_job_types (seeded by
// 20260713000300_seed_staff_ai_job_types.sql), then long-polls fn_ai_job_status
// for the drain's result — mirroring the proven reference
// app/api/work-pulse/translate/route.ts. The seeded prompt carries the full
// career-counsellor instructions and a single {{learner_data}} placeholder, so
// the payload is exactly { learner_data: <assembled data block> }. The job runs
// with NO tools (all data is provided) on the Claude Max subscription (₹0 API);
// usage recording happens on the runner side. Auth, institution scoping, the
// cdc.view gate, the response shape (CareerGuidanceResult) and the saved-report
// persist are all preserved so the page keeps working unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Long-poll the ai_jobs Max lane (the generic seat/Windows drain claims ~every
// minute). 300 lets the poll window below finish before a hard-kill.
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';
import type {
  CareerGuidanceResult, CareerGuidanceSignal, CareerGuidance,
} from '@/types/cdc/career-guidance';

// Registry job type — its prompt_template ({{learner_data}}) + tool_set live in
// ai_job_types (seeded row 'cdc.career_guidance'). We send ONLY the payload.
const JOB_TYPE = 'cdc.career_guidance';

// Poll cadence — mirrors app/api/work-pulse/translate/route.ts (proven consumer).
const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000; // give up if never claimed (drain offline)
const TOTAL_DEADLINE_MS = 285_000; // kept < maxDuration (300s) so we respond first

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Read the model's answer text out of the drain's result jsonb. The generic
 *  runner returns { answer } (same contract ai-query/translate read); we also
 *  tolerate a few plausible shapes so a completed result never falls silently
 *  to null. */
function extractAnswer(result: unknown): string | null {
  if (typeof result === 'string') return result.trim() || null;
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const key of ['answer', 'text', 'result', 'output']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
  }
  return null;
}

// Scalar text/numeric → trimmed string, or null when blank.
function scalarText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// JSONB value (object/array/scalar) → a compact meaningful string, or null when
// effectively empty (e.g. {} or all-blank fields). Handles the "JSONB stores
// object or array" gotcha — these columns are jsonb in prod, often empty {}.
function jsonbContent(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const parts = v.map(jsonbContent).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => [k, jsonbContent(val)] as const)
      .filter(([, val]) => val);
    if (!entries.length) return null;
    return entries.map(([k, val]) => `${k}: ${val}`).join('; ');
  }
  return null;
}

// 10th/12th marks JSONB { percentage, obtained_marks, max_marks, ... } → a marks
// string, or null when no percentage/obtained value is recorded.
function marksValue(v: unknown): string | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const pct = scalarText(o.percentage);
    if (pct) return `${pct}%`;
    const obtained = scalarText(o.obtained_marks);
    const max = scalarText(o.max_marks);
    if (obtained) return max ? `${obtained}/${max}` : obtained;
    return null;
  }
  return scalarText(v);
}

// GET ?learnerId=<id> → the latest SAVED career report for that learner, or
// { saved: null } when none exists. Same CDC-staff gate + institution scope as
// POST, applied to the stored institution_id so a counsellor can only read a
// saved report for a learner inside their scope.
export async function GET(req: NextRequest) {
  try {
    const learnerId = req.nextUrl.searchParams.get('learnerId');
    if (!learnerId) {
      return NextResponse.json({ error: 'learnerId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: canView } = await supabase.rpc('user_has_permission', {
      permission_name: 'cdc.view',
    });
    if (canView !== true) {
      return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });
    }

    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) {
      return NextResponse.json(
        { error: filter.reason ?? 'Not authorized' },
        { status: filter.reason === 'User not authenticated' ? 401 : 403 }
      );
    }

    const svc = createServiceRoleClient();
    let query: any = svc
      .from('cdc_career_reports')
      .select('result, generated_at, model')
      .eq('learner_id', learnerId);
    // Scope by the stored institution_id (no-op for super_admin / admission).
    query = applyInstitutionFilterToQuery(query, filter, 'institution_id');
    const { data: row, error } = await query.maybeSingle();

    if (error) {
      console.error('[cdc/career-guidance] saved report load failed:', error);
      return NextResponse.json({ saved: null });
    }
    return NextResponse.json({ saved: row?.result ?? null });
  } catch (e) {
    console.error('[cdc/career-guidance] GET unexpected error:', e);
    return NextResponse.json({ saved: null });
  }
}

export async function POST(req: NextRequest) {
  await connection();
  try {
    const { learnerId } = await req.json().catch(() => ({ learnerId: undefined }));
    if (!learnerId || typeof learnerId !== 'string') {
      return NextResponse.json({ error: 'learnerId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // CDC-staff gate — the SAME predicate the page's <PermissionGuard module="cdc">
    // uses (super-admin/admin bypass is built into user_has_permission). This is
    // load-bearing: the reads below use the service-role client (RLS bypassed), so
    // without this gate any authenticated user could pull an AI career report on
    // any in-institution learner.
    const { data: canView } = await supabase.rpc('user_has_permission', {
      permission_name: 'cdc.view',
    });
    if (canView !== true) {
      return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });
    }

    // Caller's institution scope (all-access for super_admin / admission).
    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) {
      return NextResponse.json(
        { error: filter.reason ?? 'Not authorized' },
        { status: filter.reason === 'User not authenticated' ? 401 : 403 }
      );
    }

    // Read learner data with the SERVICE-ROLE client. WHY (BUG-004044 class): a
    // cdc_coordinator holds cdc.* but NOT learners.*, so the RLS-bound client
    // returned 0 rows → 404 for the very role this tool serves. The picker
    // (/api/cdc/pickers/learners) already reads via service-role, so an RLS read
    // here also mismatched what the counsellor could pick. Institution scoping
    // below preserves the no-cross-institution-leak guarantee.
    const svc = createServiceRoleClient();

    // Profile — career-relevant, non-PII fields only.
    let profileQuery: any = svc
      .from('learners_profiles')
      .select(`
        id, first_name, last_name, gender, institution_id,
        tenth_marks, twelfth_marks, neet_score, medical_cutoff_marks, engineering_cutoff_marks,
        career_aspirations, capabilities, industry_readiness_score, portfolio_url,
        board_of_study, medium_of_instruction, first_graduate, learner_type,
        program:programs(program_name),
        department:departments(department_name),
        academic_year:academic_years(academic_year_name),
        degree:degrees(degree_name)
      `)
      .eq('id', learnerId);
    // Scope to the caller's accessible institutions (no-op for super_admin /
    // admission). A learner outside scope yields null → 404 below.
    profileQuery = applyInstitutionFilterToQuery(profileQuery, filter, 'institution_id');
    const { data: profile, error: profErr } = await profileQuery.maybeSingle();

    if (profErr) {
      console.error('[cdc/career-guidance] profile load failed:', profErr);
      return NextResponse.json({ error: 'Could not load learner (you may not have access).' }, { status: 403 });
    }
    if (!profile) {
      return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    }

    const p = profile as Record<string, unknown> & {
      program?: { program_name?: string } | null;
      department?: { department_name?: string } | null;
      academic_year?: { academic_year_name?: string } | null;
      degree?: { degree_name?: string } | null;
    };
    const programName: string | null = p.program?.program_name ?? null;
    const departmentName: string | null = p.department?.department_name ?? null;
    const yearName: string | null = p.academic_year?.academic_year_name ?? null;
    const degreeName: string | null = p.degree?.degree_name ?? null;
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'the student';

    // Outcome-source counts (all keyed on learner_id). Service-role so the
    // counts reflect reality regardless of the counsellor's per-table RLS.
    const counts: Record<string, number> = {};
    for (const tbl of ['obe_learner_co_marks', 'cdc_placements', 'internship_assignments', 'cdc_training_enrollments']) {
      const { count } = await svc
        .from(tbl)
        .select('*', { count: 'exact', head: true })
        .eq('learner_id', learnerId);
      counts[tbl] = count ?? 0;
    }

    // Government-exam coaching signal (2026-07-04 govt-job-readiness). Which of
    // this learner's ACTIVE training enrolments are government-exam coaching —
    // i.e. the enrolled programme's training-type carries an exam_family tag.
    //
    // Status filter (deep-review #1): only in-progress enrolments count. A
    // 'dropped' enrolment (never finished) or a long-'completed' one must NOT
    // permanently reframe the learner as government-aspiring. The active set is
    // 'enrolled' + 'awaiting_certificate' — the two non-terminal states of
    // cdc_training_enrollments.status ('enrolled'|'completed'|'dropped'|
    // 'awaiting_certificate'; see 20260518_cdc_substrate_02).
    //
    // Error handling (deep-review #8): supabase-js returns { data:null, error }
    // on a missing exam_family column (pre-migration window) — it does NOT
    // throw — so we inspect `error` and degrade to "no govt signal". The
    // try/catch remains only for a genuinely unexpected throw (client init /
    // network), which the old data-only destructure could never have caught.
    const ACTIVE_ENROLMENT_STATES = ['enrolled', 'awaiting_certificate'];
    const govtExamProgrammes: string[] = [];
    try {
      const { data: govtEnroll, error: govtErr } = await svc
        .from('cdc_training_enrollments')
        .select('programme:cdc_training_programmes(name, training_type:cdc_training_types(display_name, exam_family))')
        .eq('learner_id', learnerId)
        .in('status', ACTIVE_ENROLMENT_STATES);
      if (govtErr) {
        // Missing column (pre-migration) or any read failure → no govt signal;
        // the report continues normally rather than 500-ing.
        console.warn('[cdc/career-guidance] govt-exam coaching read degraded:', govtErr.message);
      } else {
        for (const row of (govtEnroll ?? []) as any[]) {
          const tt = row?.programme?.training_type;
          if (tt?.exam_family) {
            govtExamProgrammes.push(row.programme?.name || tt.display_name);
          }
        }
      }
    } catch (e) {
      console.warn('[cdc/career-guidance] govt-exam coaching read threw:', e);
    }
    // Dedupe — the same programme name can recur across multiple enrolment rows.
    const govtExamProgrammesUnique = Array.from(new Set(govtExamProgrammes));

    // These profile fields are JSONB in prod (often empty {}) or text — extract
    // meaningful values, treating empty structures as "not recorded".
    const aspirations = jsonbContent(p.career_aspirations);
    const capabilities = jsonbContent(p.capabilities);
    const twelfth = marksValue(p.twelfth_marks);
    const tenth = marksValue(p.tenth_marks);
    const neet = scalarText(p.neet_score);
    const priorMarks = [twelfth && `12th ${twelfth}`, tenth && `10th ${tenth}`, neet && `NEET ${neet}`]
      .filter(Boolean).join(', ');
    const readinessRaw = scalarText(p.industry_readiness_score);
    const readiness = readinessRaw && Number(readinessRaw) > 0 ? readinessRaw : null;

    const signals: CareerGuidanceSignal[] = [
      { key: 'profile', label: 'Student profile', present: true,
        detail: [degreeName, programName, yearName].filter(Boolean).join(' · ') || 'Basic profile', fillHint: null },
      { key: 'aspirations', label: 'Career aspirations', present: !!aspirations,
        detail: aspirations ? aspirations.slice(0, 80) : 'Not recorded',
        fillHint: aspirations ? null : 'Capture in the learner profile' },
      { key: 'capabilities', label: 'Capabilities / strengths', present: !!capabilities,
        detail: capabilities ? capabilities.slice(0, 80) : 'Not recorded',
        fillHint: capabilities ? null : 'Capture in the learner profile' },
      { key: 'prior_marks', label: 'Prior academics (10th/12th/entrance)', present: !!priorMarks,
        detail: priorMarks || 'Not recorded', fillHint: priorMarks ? null : 'Capture in the learner profile' },
      { key: 'readiness', label: 'Industry readiness score', present: !!readiness,
        detail: readiness ?? 'Not scored',
        fillHint: readiness ? null : 'Set during CDC assessment' },
      { key: 'obe_marks', label: 'Course/outcome marks (OBE)', present: counts.obe_learner_co_marks > 0,
        detail: `${counts.obe_learner_co_marks} records`, fillHint: counts.obe_learner_co_marks > 0 ? null : 'Populate via Academic → OBE' },
      { key: 'placements', label: 'Placement record', present: counts.cdc_placements > 0,
        detail: `${counts.cdc_placements} records`, fillHint: counts.cdc_placements > 0 ? null : 'Record under CDC → Placements' },
      { key: 'internships', label: 'Internship history', present: counts.internship_assignments > 0,
        detail: `${counts.internship_assignments} records`, fillHint: counts.internship_assignments > 0 ? null : 'Record under CDC → Internships' },
      { key: 'training', label: 'Training enrolments', present: counts.cdc_training_enrollments > 0,
        detail: `${counts.cdc_training_enrollments} records`, fillHint: counts.cdc_training_enrollments > 0 ? null : 'Enrol under CDC → Training' },
    ];
    const completenessPct = Math.round((signals.filter((s) => s.present).length / signals.length) * 100);

    // Government-job aspiration (2026-07-04 govt-job-readiness): detected from the
    // learner's free-text aspirations OR active government-exam coaching. Used to
    // steer the model toward exam-readiness next-steps + scholarship framing.
    //
    // Keyword set (deep-review #4): restricted to CLEARLY-government tokens — the
    // specific exam families (TNPSC, RRB, IBPS, SBI, SSC, TNUSRB) and explicit
    // government/public-service phrases. Bare private-overlapping words —
    // "banking" (private banks), "railway" (private/metro), "police" (private
    // security) — are deliberately NOT matched, so a private-sector aspiration is
    // not misread as government-aspiring. "TN Police" (govt) is kept as a phrase.
    const govtKeywords = /\b(gov(ernmen)?t|tnpsc|rrb|ibps|sbi|ssc|tnusrb|public\s*service|civil\s*service|group\s*[24]|tn\s*police)\b/i;
    const govtAspiring = govtExamProgrammesUnique.length > 0 || (!!aspirations && govtKeywords.test(aspirations));
    const govtBlock = govtAspiring
      ? `\n\nGovernment-job focus DETECTED for this learner:\n` +
        (govtExamProgrammesUnique.length > 0
          ? `- Enrolled in government-exam coaching: ${govtExamProgrammesUnique.join(', ')}\n`
          : `- Aspiration text indicates a government-job goal\n`) +
        `Give concrete government-exam readiness next-steps (name the fitting exam family) and relevant government-scholarship framing per the system instructions; do not invent specific deadlines/cut-offs.`
      : '';

    // Build the data block for the model (only present signals carry detail).
    const present = signals.filter((s) => s.present).map((s) => `- ${s.label}: ${s.detail}`).join('\n') || '- (only basic profile available)';
    const missing = signals.filter((s) => !s.present).map((s) => `- ${s.label}`).join('\n') || '- (none)';
    const userPrompt = `Student context:
- Degree/Programme: ${[degreeName, programName].filter(Boolean).join(' — ') || 'Unknown'}
- Department: ${departmentName ?? 'Unknown'}
- Year/Batch: ${yearName ?? 'Unknown'}
- First-generation learner: ${p.first_graduate ? 'Yes' : 'No/Unknown'}
- Medium of instruction: ${p.medium_of_instruction ?? 'Unknown'}

Data available:
${present}

Data NOT yet recorded (reflect these in dataToImprove):
${missing}${govtBlock}

Generate the career guidance JSON now.`;

    // ── AI invocation via the Max lane ──────────────────────────────────────
    // The assembled `userPrompt` IS the learner data block; the seeded
    // prompt_template supplies the system instructions and a {{learner_data}}
    // placeholder. Enqueue with ONLY the payload — fn_ai_enqueue resolves the
    // job spec (prompt_template + tool_set) from ai_job_types and gates on
    // allow_rule (permission:cdc.view). The session client is used so the
    // enqueue is auth.uid()-scoped.
    const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
      p_job_type: JOB_TYPE,
      p_payload: { learner_data: userPrompt },
    });
    if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
      const errText = typeof enq?.error === 'string' ? enq.error : '';
      // Seed not applied / feature disabled → treat as "unavailable, try later".
      if (errText === 'unknown or disabled job_type') {
        return NextResponse.json(
          { error: 'AI guidance is not available right now. Please try again later.' },
          { status: 503 }
        );
      }
      if (errText === 'too many in-flight jobs of this type') {
        return NextResponse.json(
          { error: 'A guidance request is already in progress. Please wait for it to finish.' },
          { status: 429 }
        );
      }
      console.error('[cdc/career-guidance] enqueue failed:', enqError ?? enq);
      return NextResponse.json(
        { error: 'Could not start AI guidance. Please try again.' },
        { status: 502 }
      );
    }

    const jobId = enq.job_id;
    const startedAt = Date.now();
    let text: string | null = null;
    let modelUsed: string | null = null;
    let jobFailed = false;
    while (Date.now() - startedAt < TOTAL_DEADLINE_MS) {
      await sleep(POLL_MS);
      const { data: st, error: stError } = await supabase.rpc('fn_ai_job_status', {
        p_job_id: jobId,
      });
      if (stError || !st || typeof st.status !== 'string') continue;
      if (st.status === 'done') {
        const res = (st as { result?: unknown }).result;
        text = extractAnswer(res);
        if (res && typeof res === 'object') {
          const m = (res as Record<string, unknown>).model;
          if (typeof m === 'string' && m.trim()) modelUsed = m.trim();
        }
        break;
      }
      if (st.status === 'error' || st.status === 'canceled' || st.status === 'not_found') {
        jobFailed = true;
        break;
      }
      // Never claimed within the unclaimed window → the drain is offline.
      if (st.status === 'pending' && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
        break;
      }
    }

    if (jobFailed) {
      return NextResponse.json({ error: 'AI request failed. Please try again.' }, { status: 502 });
    }
    if (text === null) {
      // Timed out / drain offline. The job may still finish on the runner; the
      // counsellor can retry (a saved report from a prior run still shows).
      return NextResponse.json(
        { error: 'AI guidance did not finish in time. Please try again in a moment.' },
        { status: 503 }
      );
    }

    // Model actually used, when the runner reports it; else a Max-lane label so
    // saved reports stay truthful.
    const reportModel = modelUsed ?? 'max-lane';

    let guidance: CareerGuidance;
    try {
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      guidance = JSON.parse(jsonStr);
    } catch {
      // Fallback: surface the raw text so nothing is silently lost.
      guidance = { summary: text || 'No guidance returned.', careerPaths: [], skillGaps: [], nextSteps: [], dataToImprove: [] };
    }

    const result: CareerGuidanceResult = {
      learner: { id: p.id, name: fullName, program: programName, department: departmentName, year: yearName },
      signals,
      completenessPct,
      guidance,
      generatedAt: new Date().toISOString(),
      // Model reported by the runner (when available), else a Max-lane label —
      // keeps saved reports truthful without a direct-API round-trip.
      model: reportModel,
    };

    // Persist the LATEST report (overwrite previous — one row per learner, per the
    // Director's "keep latest, not history" decision). Service-role write; the
    // cdc.view gate above is the authorization. Non-fatal: a save failure must not
    // block returning the freshly generated guidance to the counsellor.
    try {
      await svc.from('cdc_career_reports').upsert(
        {
          learner_id: p.id as string,
          institution_id: (p.institution_id as string | null) ?? null,
          result,
          completeness_pct: completenessPct,
          model: reportModel,
          generated_at: result.generatedAt,
          generated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'learner_id' }
      );
    } catch (e) {
      console.error('[cdc/career-guidance] save report failed (non-fatal):', e);
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('[cdc/career-guidance] unexpected error:', e);
    return NextResponse.json({ error: 'Unexpected error generating guidance.' }, { status: 500 });
  }
}
