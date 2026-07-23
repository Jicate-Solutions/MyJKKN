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
//   4. fn_copo_track_below_target() — consecutive below-target streaks
//      (copo_below_target_state) + in-app alerts to each institution's
//      Principal(s) ONLY when the list changes (Director 2026-07-10:
//      "Principal only"; "Steady alerts" = 2 consecutive weekly runs below
//      target to enter; message only on enter/recover).
//
// PER-COLLEGE THRESHOLD (Director 2026-07-09: 'Let each college choose'):
// the attainment threshold resolves per institution — an institution-scoped
// platform_policies override row wins over the global fallback row (mirrors
// the canonical fn_get_policy precedence; the SQL fns use fn_get_policy
// itself). Each rollup row records the threshold it was computed with
// (threshold_pct_used) plus its source in metadata.
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
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
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

// One change entry from fn_copo_track_below_target's per-institution arrays.
interface BelowTargetChange {
  change: 'entered' | 'recovered';
  course_code: string;
  course_name: string | null;
  program_code: string | null;
  session_code: string;
  attainment_pct: number | null;
  attainment_level: number | null;
  attainment_basis: string | null;
  threshold_pct_used: number | null;
  target_level: number;
  consecutive_below_runs?: number;
}

interface TrackerResult {
  skipped?: boolean;
  reason?: string;
  target_level?: number;
  runs_required?: number;
  evaluated?: number;
  entered?: number;
  recovered?: number;
  changes?: Record<string, { entered?: BelowTargetChange[]; recovered?: BelowTargetChange[] }>;
}

const basisLabel = (basis: string | null): string =>
  basis === 'internal_cia'
    ? 'internal CIA (evolves as marks land)'
    : basis === 'final_total'
      ? 'declared results'
      : 'n/a';

const courseLine = (c: BelowTargetChange): string => {
  const name = c.course_name ? ` — ${c.course_name}` : '';
  const pct = c.attainment_pct != null ? `${c.attainment_pct}%` : 'n/a';
  return `• ${c.course_code}${name}: ${pct} attainment (Level ${c.attainment_level ?? '?'} of target ${c.target_level}); learner-pass threshold ${c.threshold_pct_used ?? '?'}%, basis: ${basisLabel(c.attainment_basis)}`;
};

const capped = (lines: string[], cap = 15): string[] =>
  lines.length <= cap
    ? lines
    : [...lines.slice(0, cap), `…and ${lines.length - cap} more`];

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

  // Global FALLBACK threshold; per-institution override rows win (below).
  const thresholdRaw = await readPolicy(supabase, 'copo_attainment.threshold_pct');
  const globalThreshold = typeof thresholdRaw === 'number' ? thresholdRaw : 60;

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

    // PER-COLLEGE threshold: institution-scoped override rows for the mapped
    // institutions (fn_get_policy precedence: institution > global > 60).
    const { data: overrideRows, error: overrideError } = await supabase
      .from('platform_policies')
      .select('scope_id, value')
      .eq('policy_key', 'copo_attainment.threshold_pct')
      .eq('scope_type', 'institution')
      .eq('is_active', true)
      .in('scope_id', mappedIds);
    if (overrideError) {
      return NextResponse.json(
        { ok: false, step: 'threshold_resolve', error: overrideError.message },
        { status: 500 },
      );
    }
    const thresholdByInstitution = new Map<string, number>();
    for (const o of overrideRows ?? []) {
      if (o.scope_id && typeof o.value === 'number') {
        thresholdByInstitution.set(o.scope_id as string, o.value);
      }
    }
    const institutionForCode = (code: string): { id: string; matchKind: string } => {
      const matched = codeToInstitutions.get(code);
      if (matched && matched.size === 1) return { id: [...matched][0], matchKind: 'unique_course_match' };
      if (matched && matched.size > 1) return { id: mappedIds[0], matchKind: 'ambiguous_first_mapped' };
      return { id: mappedIds[0], matchKind: 'unmatched_first_mapped' };
    };
    const thresholdForCode = (code: string): number =>
      thresholdByInstitution.get(institutionForCode(code).id) ?? globalThreshold;

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
      if (r.internal_percentage >= thresholdForCode(r.course_code)) a.internal_meeting_threshold += 1;
      a.internal_pct_sum += r.internal_percentage;
      a.internal_pct_n += 1;
    }

    for (const r of finalRows) {
      if (!r.course_code || r.percentage == null) continue;
      const a = getAgg(r.course_code, r.course_name, r.program_code);
      a.final_learner_count += 1;
      if (r.percentage >= thresholdForCode(r.course_code)) a.final_meeting_threshold += 1;
      if (r.is_pass === true) a.final_pass_count += 1;
      a.total_pct_sum += r.percentage;
      a.total_pct_n += 1;
      if (r.external_marks_obtained != null && r.external_marks_maximum != null && r.external_marks_maximum > 0) {
        a.external_pct_sum += (100 * r.external_marks_obtained) / r.external_marks_maximum;
        a.external_pct_n += 1;
      }
    }

    const rows = [...aggs.values()].map((a) => {
      const { id: institutionId, matchKind } = institutionForCode(a.course_code);
      const courseThreshold = thresholdForCode(a.course_code);
      return {
        institution_id: institutionId,
        course_code: a.course_code,
        course_name: a.course_name,
        program_code: a.program_code,
        session_code: term.session_code,
        session_end_date: term.exam_end_date,
        threshold_pct_used: courseThreshold,
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
          threshold_source: thresholdByInstitution.has(institutionId)
            ? 'institution_override'
            : 'global_fallback',
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

  // 4. Below-target alert tracking + Principal notification (Director
  //    2026-07-10: "Principal only"; "Steady alerts" — a course enters the
  //    list after 2 consecutive weekly runs below target, and leadership is
  //    messaged ONLY when the list CHANGES: entered or recovered. The fn is
  //    idempotent within a run (keyed on session_code@computed_at) and only
  //    considers rollups with a CONFIDENT institution stamp.
  const { data: tracked, error: trackError } = await supabase.rpc(
    'fn_copo_track_below_target',
  );
  if (trackError) {
    return NextResponse.json(
      { ok: false, step: 'track_below_target', error: trackError.message },
      { status: 500 },
    );
  }
  const tracker = (tracked ?? {}) as TrackerResult;
  const changes = tracker.changes ?? {};
  const changedInstitutionIds = Object.keys(changes).filter(
    (id) =>
      (changes[id].entered?.length ?? 0) > 0 ||
      (changes[id].recovered?.length ?? 0) > 0,
  );

  let alertsSent = 0;
  const institutionsNotified: string[] = [];
  const alertSkips: Array<Record<string, unknown>> = [];

  if (changedInstitutionIds.length > 0) {
    // Recipient substrate, fetched once: Role-Management principals
    // (user_roles JOIN custom_roles role_key='principal') — multi-role users
    // exist — plus the legacy profiles.role='principal' fallback per
    // institution below. This is a recipient LOOKUP by role, not an
    // authorization gate.
    const { data: principalRole } = await supabase
      .from('custom_roles')
      .select('id')
      .eq('role_key', 'principal')
      .eq('is_active', true)
      .maybeSingle();
    let roleUserIds: string[] = [];
    if (principalRole?.id) {
      const { data: ur } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role_id', principalRole.id);
      roleUserIds = (ur ?? [])
        .map((x) => x.user_id as string)
        .filter(Boolean);
    }

    // notifications.created_by is NOT NULL — cron alerts use the first
    // super-admin (same convention as lib/instagram/sync-accounts.ts).
    const { data: superAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .limit(1);
    const createdBy = superAdmins?.[0]?.id as string | undefined;

    for (const institutionId of changedInstitutionIds) {
      const entered = changes[institutionId].entered ?? [];
      const recovered = changes[institutionId].recovered ?? [];

      // Active Principals of THIS institution (deduped across both sources).
      const recipients = new Set<string>();
      if (roleUserIds.length > 0) {
        const { data: viaRoles } = await supabase
          .from('profiles')
          .select('id')
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .in('id', roleUserIds);
        for (const p of viaRoles ?? []) recipients.add(p.id as string);
      }
      const { data: viaLegacy } = await supabase
        .from('profiles')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .eq('role', 'principal');
      for (const p of viaLegacy ?? []) recipients.add(p.id as string);

      if (recipients.size === 0) {
        alertSkips.push({
          institution_id: institutionId,
          skipped: 'no_principal_found',
          entered: entered.length,
          recovered: recovered.length,
        });
        continue;
      }

      const bodyParts: string[] = [
        'The below-target course list for your institution changed in this week’s CO/PO attainment check.',
      ];
      if (entered.length > 0) {
        const runsRequired = tracker.runs_required ?? 2;
        bodyParts.push(
          `ENTERED — below target for ${runsRequired} consecutive weekly checks (${entered.length}):`,
          ...capped(entered.map(courseLine)),
        );
      }
      if (recovered.length > 0) {
        bodyParts.push(
          `RECOVERED — back at/above target (${recovered.length}):`,
          ...capped(recovered.map(courseLine)),
        );
      }
      bodyParts.push(
        'Note: all figures are course-level proxies (no assessment→CO tagging yet), and internal CIA numbers evolve as marks land during the term — treat this as an early signal, not a verdict.',
      );

      try {
        const result = await fanoutNotification(supabase, {
          title: `CO/PO attainment: ${entered.length} course${entered.length === 1 ? '' : 's'} entered the below-target list, ${recovered.length} recovered`,
          body: bodyParts.join('\n'),
          userIds: [...recipients],
          createdBy,
          category: 'accreditation',
          kind: 'work_item',
          priority: entered.length > 0 ? 'high' : 'normal',
          idempotencyKey: `copo_below_target:${institutionId}:${today}`,
          source: 'copo-attainment-cron',
          metadata: {
            institution_id: institutionId,
            entered: entered.map((c) => c.course_code),
            recovered: recovered.map((c) => c.course_code),
            target_level: tracker.target_level ?? null,
          },
        });
        if (result.skipped) {
          alertSkips.push({ institution_id: institutionId, skipped: result.skipped });
        } else {
          alertsSent += 1;
          institutionsNotified.push(institutionId);
        }
      } catch (notifyErr) {
        console.error('[copo-attainment] principal notify failed:', notifyErr);
        alertSkips.push({
          institution_id: institutionId,
          skipped: 'notify_error',
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
    }
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
    below_target: {
      tracker_skipped: tracker.skipped ?? false,
      entered: tracker.entered ?? 0,
      recovered: tracker.recovered ?? 0,
      alerts_sent: alertsSent,
      institutions_notified: institutionsNotified,
      alert_skips: alertSkips,
    },
    alerts_sent: alertsSent,
    institutions_notified: institutionsNotified.length,
    entered: tracker.entered ?? 0,
    recovered: tracker.recovered ?? 0,
    count: (evidenceSummary.count as number | undefined) ?? 0,
  });
}
