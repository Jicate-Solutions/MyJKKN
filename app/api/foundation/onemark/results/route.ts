export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ResultsPaperSummary } from '@/lib/services/onemark/results-service';
import { NO_ACCESS_MESSAGE, hasResultsAccess, resultsGate } from './_shared';

// OneMark — Wave 3 Lane A. The results index.
//
// GET /api/foundation/onemark/results -> { papers, truncated }
//
// A paper is listed when this caller created it, OR when its cohort belongs to
// a school this caller owns (Wave 3 ruling #1 — an active `school_jkkn_owners`
// row alone grants read of every results sheet for that school;
// `specs/onemark-wave3-2026-09-06.md`, "## Rulings of 2026-09-06", row 1). Rows
// are RLS-scoped on top of that; this filter narrows, it never widens.
//
// THE DISJUNCTION IS IN THE QUERY, NOT IN JAVASCRIPT. It used to pull the 200
// most-recently-updated OneMark papers cluster-wide and only then filter to
// mine||owned — and `fp_assessments_read` admits ANY holder of
// foundation.assessments.view/manage to EVERY assessment row platform-wide
// (20260706064000 / rls_initplan_wrap_sweep.sql:2000), so once the estate held
// more than 200 OneMark papers a caller's OWN older papers fell outside the
// window and vanished from their own index with no warning. Now the cap is
// applied to this caller's own set, and the response says when it was hit.
//
// The counts here are read from fp_attempts and fp_enrollments directly rather
// than from Lane S3's RPC — the index needs one number per paper, not a full
// cohort sheet, and it must keep working before that migration is applied.
// Two consequences are handled explicitly rather than papered over:
//   * UNIT. `supabase/SQL_FILE_INDEX.md` states for this exact estate:
//     "fn_fp_record_attempt stores score as a 0..1 ratio; OneMark attempts
//     store the COUNT — readers key on fp_attempts.mode". So this reader keys
//     on mode: a legacy `mode IS NULL` row is a ratio and is excluded, instead
//     of being averaged together with raw counts.
//   * VISIBILITY. `fp_attempts_select` is `USING (fn_fp_can_view_student(...))`
//     (20260706065000:135) which admits super-admin, the learner/guardian, the
//     cohort's resource person and an active school owner — NOT a plain
//     assessments.manage holder. RLS returns zero rows rather than an error, so
//     such a caller used to see "0 of — sat · no average yet" on their own
//     paper. `counts_visible` marks it and the screen says so.

/** The caller's own most-recently-updated OneMark papers. Applied AFTER the
 *  ownership disjunction, so it can only ever truncate this caller's own list —
 *  and `truncated` says when it did. */
const PAPER_LIST_CAP = 200;

/** Enough attempts for a school's whole OneMark history; a bigger estate needs
 *  an aggregate RPC rather than a bigger cap. Deterministically ordered so the
 *  same 5,000 rows come back on every load once the cap is reached. */
const ATTEMPT_ROW_CAP = 5000;
const ENROLMENT_ROW_CAP = 20000;

/** Guards the length of the `.or()` filter. A caller owning more cohorts than
 *  this is beyond what an index screen can serve; `truncated` says so. */
const OWNED_COHORT_CAP = 400;

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const gate = await resultsGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasResultsAccess(gate)) {
      return NextResponse.json({ error: NO_ACCESS_MESSAGE }, { status: 403 });
    }

    // Which cohorts belong to a school this caller owns — the second door of
    // ruling #1, resolved to ids so the filter can live in the query.
    let ownedCohortIds: string[] = [];
    let ownedCohortsTruncated = false;
    if (gate.ownedSchoolIds.length > 0) {
      const { data: ownedCohorts, error: cohortErr } = await (supabase as any)
        .from('fp_cohorts')
        .select('id')
        .in('school_id', gate.ownedSchoolIds)
        .limit(OWNED_COHORT_CAP + 1);
      if (cohortErr) throw cohortErr;
      const rows = ((ownedCohorts ?? []) as Array<{ id: string }>).map((c) => c.id);
      ownedCohortsTruncated = rows.length > OWNED_COHORT_CAP;
      ownedCohortIds = rows.slice(0, OWNED_COHORT_CAP);
    }

    const orParts = [`created_by.eq.${gate.userId}`];
    if (ownedCohortIds.length > 0) orParts.push(`cohort_id.in.(${ownedCohortIds.join(',')})`);

    const { data: rows, error } = await (supabase as any)
      .from('fp_assessments')
      .select(
        'id, title, cohort_id, created_by, config, updated_at, exam:exam_definitions(config_key), cohort:fp_cohorts(id, term, school_id, resource_person_id, school:schools(name))',
      )
      .eq('kind', 'mock')
      .contains('config', { onemark: true })
      .or(orParts.join(','))
      .order('updated_at', { ascending: false })
      .limit(PAPER_LIST_CAP);
    if (error) throw error;

    const owned = new Set(gate.ownedSchoolIds);
    const one = <T,>(value: T | T[] | null | undefined): T | null =>
      Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

    const visible = ((rows ?? []) as any[]).map((row) => {
      const cohort = one<any>(row.cohort);
      const schoolId: string | null = cohort?.school_id ?? null;
      const mine = row.created_by === gate.userId;
      const viaOwner = schoolId !== null && owned.has(schoolId);
      // The two doors of fn_fp_can_view_student this route can see from here.
      // Not exhaustive (a super-admin passes it too) — so a paper that DOES
      // return sitting rows is treated as readable regardless, below.
      const countsDoor = viaOwner || cohort?.resource_person_id === gate.userId;
      return { row, cohort, mine, viaOwner, countsDoor };
    });

    const ids = visible.map((v) => v.row.id as string);
    const cohortIds = Array.from(
      new Set(visible.map((v) => v.cohort?.id as string | undefined).filter((id): id is string => !!id)),
    );

    const [attemptsRes, enrolRes] = await Promise.all([
      ids.length
        ? (supabase as any)
            .from('fp_attempts')
            .select('assessment_id, student_id, score, status, mode, submitted_at')
            .in('assessment_id', ids)
            .eq('status', 'submitted')
            // UNIT GUARD — see the header. A mode-NULL row predates OneMark and
            // stores a 0..1 ratio, which must never be averaged with counts.
            .not('mode', 'is', null)
            .order('assessment_id', { ascending: true })
            .order('submitted_at', { ascending: false, nullsFirst: false })
            .limit(ATTEMPT_ROW_CAP)
        : Promise.resolve({ data: [], error: null }),
      cohortIds.length
        ? (supabase as any)
            .from('fp_enrollments')
            .select('cohort_id, student_id')
            .in('cohort_id', cohortIds)
            .order('cohort_id', { ascending: true })
            .limit(ENROLMENT_ROW_CAP)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (attemptsRes.error) throw attemptsRes.error;
    if (enrolRes.error) throw enrolRes.error;

    const attemptRows = (attemptsRes.data ?? []) as any[];
    const enrolRows = (enrolRes.data ?? []) as any[];

    // RESIT RULE — ONE SITTING PER LEARNER, THE LATEST SUBMITTED. The cohort
    // sheet averages one row per learner (Lane S3's RPC returns one), so an
    // index that averaged every submitted attempt printed a DIFFERENT number
    // for the same paper on the two screens whenever anybody resat. Rows arrive
    // newest-first per paper, so the first row seen for a learner wins.
    const latestPerLearner = new Map<string, Map<string, number | null>>();
    for (const a of attemptRows) {
      const paperId = a.assessment_id as string;
      const perLearner = latestPerLearner.get(paperId) ?? new Map<string, number | null>();
      const learnerId = a.student_id as string;
      if (!perLearner.has(learnerId)) {
        const score = typeof a.score === 'number' ? a.score : Number(a.score);
        perLearner.set(learnerId, Number.isFinite(score) ? score : null);
      }
      latestPerLearner.set(paperId, perLearner);
    }

    const enrolled = new Map<string, number>();
    for (const e of enrolRows) {
      enrolled.set(e.cohort_id as string, (enrolled.get(e.cohort_id as string) ?? 0) + 1);
    }

    const papers: ResultsPaperSummary[] = visible.map(({ row, cohort, mine, viaOwner, countsDoor }) => {
      const cfg = (row.config ?? {}) as Record<string, any>;
      const school = one<any>(cohort?.school);
      const cohortLabel = cohort
        ? [school?.name, cohort.term].filter((part: unknown) => typeof part === 'string' && part).join(' · ') || null
        : null;
      const perLearner = latestPerLearner.get(row.id);
      const scored = Array.from(perLearner?.values() ?? []).filter((s): s is number => s !== null);
      // A paper that returned sitting rows is readable by definition; one that
      // returned none is only known-empty when a visibility door is held.
      const countsVisible = countsDoor || (perLearner?.size ?? 0) > 0;
      const closeAt = typeof cfg.close_at === 'string' ? Date.parse(cfg.close_at) : NaN;
      return {
        id: row.id,
        title: row.title,
        exam_key: one<any>(row.exam)?.config_key ?? null,
        cohort_label: cohortLabel,
        state: typeof cfg.state === 'string' ? cfg.state : 'DRAFT',
        published: typeof cfg?.outputs?.published_at === 'string' && cfg.outputs.published_at.length > 0,
        closed: Number.isNaN(closeAt) ? null : closeAt < Date.now(),
        question_count: typeof cfg?.params?.question_count === 'number' ? cfg.params.question_count : 0,
        sat: countsVisible ? (perLearner?.size ?? 0) : null,
        total: countsVisible ? (cohort ? (enrolled.get(cohort.id as string) ?? 0) : 0) : null,
        average:
          countsVisible && scored.length > 0
            ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10
            : null,
        counts_visible: countsVisible,
        updated_at: row.updated_at ?? null,
        via_school_owner: viaOwner && !mine,
      };
    });

    return NextResponse.json({
      papers,
      // Disclosed, not silent: the screen prints a line when either cap bit.
      truncated: papers.length >= PAPER_LIST_CAP || ownedCohortsTruncated,
      counts_truncated: attemptRows.length >= ATTEMPT_ROW_CAP || enrolRows.length >= ENROLMENT_ROW_CAP,
    });
  } catch (err) {
    // Database strings stay on the server; the browser gets a fixed line.
    console.error('[onemark/results] GET failed', err);
    return NextResponse.json(
      { error: 'Could not load OneMark results. Please try again.' },
      { status: 500 },
    );
  }
}
