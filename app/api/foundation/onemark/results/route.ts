export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ResultsPaperSummary } from '@/lib/services/onemark/results-service';
import { NO_ACCESS_MESSAGE, hasResultsAccess, resultsGate } from './_shared';

// OneMark — Wave 3 Lane A. The results index.
//
// GET /api/foundation/onemark/results -> { papers }
//
// A paper is listed when this caller created it, OR when its cohort belongs to
// a school this caller owns (ruling #1 — a principal with only a
// school_jkkn_owners row is a first-class reader of cohort results). Rows are
// RLS-scoped on top of that; this filter narrows, it never widens.
//
// The counts here are read from fp_attempts and fp_enrollments directly rather
// than from Lane S3's RPC — the index needs one number per paper, not a full
// cohort sheet, and it must keep working before that migration is applied.

/** Enough attempts for a school's whole OneMark history; a bigger estate needs
 *  an aggregate RPC rather than a bigger cap. */
const ATTEMPT_ROW_CAP = 5000;

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const gate = await resultsGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasResultsAccess(gate)) {
      return NextResponse.json({ error: NO_ACCESS_MESSAGE }, { status: 403 });
    }

    const { data: rows, error } = await (supabase as any)
      .from('fp_assessments')
      .select(
        'id, title, cohort_id, created_by, config, updated_at, exam:exam_definitions(config_key), cohort:fp_cohorts(id, term, school_id, school:schools(name))',
      )
      .eq('kind', 'mock')
      .contains('config', { onemark: true })
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const owned = new Set(gate.ownedSchoolIds);
    const one = <T,>(value: T | T[] | null | undefined): T | null =>
      Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

    const visible = ((rows ?? []) as any[])
      .map((row) => {
        const cohort = one<any>(row.cohort);
        const schoolId: string | null = cohort?.school_id ?? null;
        const mine = row.created_by === gate.userId;
        const viaOwner = schoolId !== null && owned.has(schoolId);
        return { row, cohort, mine, viaOwner };
      })
      .filter((entry) => entry.mine || entry.viaOwner);

    const ids = visible.map((v) => v.row.id as string);
    const cohortIds = Array.from(
      new Set(visible.map((v) => v.cohort?.id as string | undefined).filter((id): id is string => !!id)),
    );

    const [attemptsRes, enrolRes] = await Promise.all([
      ids.length
        ? (supabase as any)
            .from('fp_attempts')
            .select('assessment_id, student_id, score, status')
            .in('assessment_id', ids)
            .eq('status', 'submitted')
            .limit(ATTEMPT_ROW_CAP)
        : Promise.resolve({ data: [], error: null }),
      cohortIds.length
        ? (supabase as any).from('fp_enrollments').select('cohort_id, student_id').in('cohort_id', cohortIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (attemptsRes.error) throw attemptsRes.error;
    if (enrolRes.error) throw enrolRes.error;

    const sat = new Map<string, Set<string>>();
    const scoreSum = new Map<string, { sum: number; n: number }>();
    for (const a of (attemptsRes.data ?? []) as any[]) {
      const key = a.assessment_id as string;
      const learners = sat.get(key) ?? new Set<string>();
      learners.add(a.student_id as string);
      sat.set(key, learners);
      const score = typeof a.score === 'number' ? a.score : Number(a.score);
      if (Number.isFinite(score)) {
        const acc = scoreSum.get(key) ?? { sum: 0, n: 0 };
        acc.sum += score;
        acc.n += 1;
        scoreSum.set(key, acc);
      }
    }
    const enrolled = new Map<string, number>();
    for (const e of (enrolRes.data ?? []) as any[]) {
      enrolled.set(e.cohort_id as string, (enrolled.get(e.cohort_id as string) ?? 0) + 1);
    }

    const papers: ResultsPaperSummary[] = visible.map(({ row, cohort, mine, viaOwner }) => {
      const cfg = (row.config ?? {}) as Record<string, any>;
      const acc = scoreSum.get(row.id);
      const school = one<any>(cohort?.school);
      const cohortLabel = cohort
        ? [school?.name, cohort.term].filter((part: unknown) => typeof part === 'string' && part).join(' · ') || null
        : null;
      return {
        id: row.id,
        title: row.title,
        exam_key: one<any>(row.exam)?.config_key ?? null,
        cohort_label: cohortLabel,
        state: typeof cfg.state === 'string' ? cfg.state : 'DRAFT',
        question_count: typeof cfg?.params?.question_count === 'number' ? cfg.params.question_count : 0,
        sat: sat.get(row.id)?.size ?? 0,
        total: cohort ? (enrolled.get(cohort.id as string) ?? 0) : 0,
        average: acc && acc.n > 0 ? Math.round((acc.sum / acc.n) * 10) / 10 : null,
        updated_at: row.updated_at ?? null,
        via_school_owner: viaOwner && !mine,
      };
    });

    return NextResponse.json({ papers });
  } catch (err) {
    // Database strings stay on the server; the browser gets a fixed line.
    console.error('[onemark/results] GET failed', err);
    return NextResponse.json(
      { error: 'Could not load OneMark results. Please try again.' },
      { status: 500 },
    );
  }
}
