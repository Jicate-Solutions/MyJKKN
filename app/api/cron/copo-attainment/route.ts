// =====================================================================
// CO/PO Attainment Loop — weekly COE→OBE direct-attainment rollup (NBA loop)
// =====================================================================
// Accreditation-loop PR-4. NBA audits whether each program's outcome-
// attainment loop closes (attainment per term → trend vs prior term →
// action). This cron is the loop's measurement leg, at the HONEST grain the
// data allows (recon 2026-07-09): COE stores per-student per-course marks
// with NO assessment→CO tagging, so everything computed here is a
// COURSE-LEVEL PROXY (grain='course_proxy', co_tagged=false — machine-
// readable on every row and every evidence emission). True CO-tagged
// attainment is blocked until the Academic Office authors assessment→CO maps.
//
// Pipeline (all steps skipped while copo_attainment.master_enabled=false):
//   1. fn_copo_backfill_course_outcomes() — BoS CLOs → obe_course_outcomes
//      (idempotent substrate for the future CO-tagged computation).
//   2. For each COE institution's current exam term: read per-student CIA +
//      declared-result rows DIRECTLY from the COE DB (read-only; the
//      PR-#1784 coe-db-client pattern), aggregate per course in TS
//      (% of learners >= copo_attainment.threshold_pct), and upsert
//      course-grain rollup rows via fn_copo_record_course_attainment().
//   3. fn_copo_emit_attainment_evidence() — rollups → quality_evidence_mappings
//      (NAAC 7.3.d + NBA T1_CO, loop_key 'copo_attainment').
//
// Split-college note: one COE institution can map to two MyJKKN institutions
// (CAS Self/Aided). Each course is stamped to the single mapped institution
// that actually teaches that course_code; when ambiguous (or unmatched) the
// first mapped id is used and metadata.institution_match records it.
//
// Fired weekly (Sun 03:41 IST → 03:30 dispatcher slot) by the AI-routine
// dispatcher (ai_routine_schedules row 'copo-attainment' — editable in
// /admin/ai-routines), NOT a raw vercel.json cron.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query
// param. Does not call Claude. COE access is READ-ONLY — this route never
// writes to the COE project. Created 2026-07-09 (accreditation-loop PR-4, DARK).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  isCoeDbConfigured,
  getAllCoeInstitutions,
  getCoeCurrentTerm,
  getCoeCiaStudentDetail,
  getCoeFinalStudentDetail,
} from '@/lib/services/coe/coe-db-client';

interface CourseAgg {
  course_code: string;
  course_name: string | null;
  program_code: string | null;
  internal_learner_count: number;
  internal_meeting_threshold: number;
  internal_pct_sum: number;
  internal_pct_n: number;
  final_learner_count: number;
  final_meeting_threshold: number;
  final_pass_count: number;
  external_pct_sum: number;
  external_pct_n: number;
  total_pct_sum: number;
  total_pct_n: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Read one global platform_policies value (jsonb) via the service client. */
async function readPolicy(
  supabase: ReturnType<typeof createServiceRoleClient>,
  key: string,
): Promise<unknown> {
  const { data, error } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`policy read failed (${key}): ${error.message}`);
  return data?.value ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (
    !cronSecret ||
    (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // DARK gate — the whole loop no-ops until the Director ratifies the
  // methodology config rows and flips copo_attainment.master_enabled.
  const enabled = (await readPolicy(supabase, 'copo_attainment.master_enabled')) === true;
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: 'master_disabled', count: 0 });
  }

  if (!isCoeDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'COE DB credentials not configured (COE_SUPABASE_URL / COE_SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 },
    );
  }

  const thresholdRaw = await readPolicy(supabase, 'copo_attainment.threshold_pct');
  const threshold = typeof thresholdRaw === 'number' ? thresholdRaw : 60;

  // 1. CO substrate: BoS CLOs → obe_course_outcomes (idempotent).
  const { data: backfill, error: backfillError } = await supabase.rpc(
    'fn_copo_backfill_course_outcomes',
  );
  if (backfillError) {
    return NextResponse.json(
      { ok: false, step: 'backfill_course_outcomes', error: backfillError.message },
      { status: 500 },
    );
  }

  // 2. COE reads (read-only) → per-course aggregates → rollup upserts.
  const today = new Date().toISOString().slice(0, 10);
  const sessions: Array<Record<string, unknown>> = [];
  let rollupsUpserted = 0;

  const coeInstitutions = await getAllCoeInstitutions();
  for (const coeInst of coeInstitutions) {
    const mappedIds = coeInst.myjkkn_institution_ids.filter(Boolean);
    if (mappedIds.length === 0) continue;

    const term = await getCoeCurrentTerm(coeInst.id, today);
    if (!term) {
      sessions.push({ coe_institution: coeInst.institution_code, skipped: 'no_exam_term' });
      continue;
    }

    const [ciaRows, finalRows] = await Promise.all([
      getCoeCiaStudentDetail(term.session_code, coeInst.institution_code),
      getCoeFinalStudentDetail(term.session_code, coeInst.id),
    ]);

    // course_code → single teaching MyJKKN institution (split-college resolve).
    const { data: courseRows, error: coursesError } = await supabase
      .from('courses')
      .select('course_code, institution_id')
      .in('institution_id', mappedIds);
    if (coursesError) {
      return NextResponse.json(
        { ok: false, step: 'course_resolve', error: coursesError.message },
        { status: 500 },
      );
    }
    const codeToInstitutions = new Map<string, Set<string>>();
    for (const c of courseRows ?? []) {
      if (!c.course_code) continue;
      const set = codeToInstitutions.get(c.course_code) ?? new Set<string>();
      set.add(c.institution_id as string);
      codeToInstitutions.set(c.course_code, set);
    }

    const aggs = new Map<string, CourseAgg>();
    const getAgg = (code: string, name: string | null, program: string | null): CourseAgg => {
      let a = aggs.get(code);
      if (!a) {
        a = {
          course_code: code, course_name: name, program_code: program,
          internal_learner_count: 0, internal_meeting_threshold: 0,
          internal_pct_sum: 0, internal_pct_n: 0,
          final_learner_count: 0, final_meeting_threshold: 0, final_pass_count: 0,
          external_pct_sum: 0, external_pct_n: 0,
          total_pct_sum: 0, total_pct_n: 0,
        };
        aggs.set(code, a);
      }
      if (!a.course_name && name) a.course_name = name;
      if (!a.program_code && program) a.program_code = program;
      return a;
    };

    for (const r of ciaRows) {
      if (!r.course_code || r.internal_percentage == null) continue;
      const a = getAgg(r.course_code, r.course_name, r.program_code);
      a.internal_learner_count += 1;
      if (r.internal_percentage >= threshold) a.internal_meeting_threshold += 1;
      a.internal_pct_sum += r.internal_percentage;
      a.internal_pct_n += 1;
    }

    for (const r of finalRows) {
      if (!r.course_code || r.percentage == null) continue;
      const a = getAgg(r.course_code, r.course_name, r.program_code);
      a.final_learner_count += 1;
      if (r.percentage >= threshold) a.final_meeting_threshold += 1;
      if (r.is_pass === true) a.final_pass_count += 1;
      a.total_pct_sum += r.percentage;
      a.total_pct_n += 1;
      if (r.external_marks_obtained != null && r.external_marks_maximum != null && r.external_marks_maximum > 0) {
        a.external_pct_sum += (100 * r.external_marks_obtained) / r.external_marks_maximum;
        a.external_pct_n += 1;
      }
    }

    const rows = [...aggs.values()].map((a) => {
      const matched = codeToInstitutions.get(a.course_code);
      const institutionId =
        matched && matched.size === 1 ? [...matched][0] : mappedIds[0];
      const matchKind =
        matched && matched.size === 1 ? 'unique_course_match'
        : matched && matched.size > 1 ? 'ambiguous_first_mapped'
        : 'unmatched_first_mapped';
      return {
        institution_id: institutionId,
        course_code: a.course_code,
        course_name: a.course_name,
        program_code: a.program_code,
        session_code: term.session_code,
        session_end_date: term.exam_end_date,
        threshold_pct_used: threshold,
        internal_learner_count: a.internal_learner_count,
        internal_meeting_threshold: a.internal_meeting_threshold,
        internal_attainment_pct:
          a.internal_learner_count > 0
            ? round2((100 * a.internal_meeting_threshold) / a.internal_learner_count)
            : null,
        avg_internal_pct:
          a.internal_pct_n > 0 ? round2(a.internal_pct_sum / a.internal_pct_n) : null,
        final_learner_count: a.final_learner_count,
        final_meeting_threshold: a.final_meeting_threshold,
        final_attainment_pct:
          a.final_learner_count > 0
            ? round2((100 * a.final_meeting_threshold) / a.final_learner_count)
            : null,
        avg_external_pct:
          a.external_pct_n > 0 ? round2(a.external_pct_sum / a.external_pct_n) : null,
        avg_total_pct: a.total_pct_n > 0 ? round2(a.total_pct_sum / a.total_pct_n) : null,
        pass_pct:
          a.final_learner_count > 0
            ? round2((100 * a.final_pass_count) / a.final_learner_count)
            : null,
        metadata: {
          coe_institution_code: coeInst.institution_code,
          myjkkn_institution_ids: mappedIds,
          institution_match: matchKind,
          term_pick_reason: term.reason,
        },
      };
    });

    // Chunked upserts (a session can hold hundreds of courses).
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { data: rec, error: recError } = await supabase.rpc(
        'fn_copo_record_course_attainment',
        { p_rows: chunk },
      );
      if (recError) {
        return NextResponse.json(
          { ok: false, step: 'record_attainment', session: term.session_code, error: recError.message },
          { status: 500 },
        );
      }
      rollupsUpserted += ((rec ?? {}) as { upserted?: number }).upserted ?? 0;
    }

    sessions.push({
      coe_institution: coeInst.institution_code,
      session_code: term.session_code,
      cia_rows: ciaRows.length,
      final_rows: finalRows.length,
      courses: rows.length,
    });
  }

  // 3. Evidence emission (fn re-checks master_enabled itself).
  const { data: evidence, error: emitError } = await supabase.rpc(
    'fn_copo_emit_attainment_evidence',
  );
  if (emitError) {
    return NextResponse.json(
      { ok: false, step: 'emit_evidence', error: emitError.message },
      { status: 500 },
    );
  }

  // 'count' is on the dispatcher's summarize() allowlist — surface the total
  // evidence upserts as the run's headline number.
  const evidenceSummary = (evidence ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    backfill,
    sessions,
    rollups_upserted: rollupsUpserted,
    evidence: evidenceSummary,
    count: (evidenceSummary.count as number | undefined) ?? 0,
  });
}
