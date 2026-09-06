export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  UUID_RE,
  buildDetail,
  engineContext,
  gate,
  generalTopicIds,
  levelCounts,
  loadCategoryWeights,
  loadChapters,
  loadExam,
  loadExams,
  loadPool,
  normalizeConfig,
  paramsFor,
  readPolicies,
  type AssessmentRow,
} from './_shared';
import {
  newPaperConfig,
  type ChapterRef,
  type CohortRef,
  type ExamReference,
  type PaperConfig,
  type PaperSummary,
  type TagRef,
  type WizardReference,
} from '@/lib/services/onemark/paper-service';

// OneMark — the Senior Learner's paper wizard (PRD §3).
//
// GET  /api/foundation/onemark/paper            -> reference data + this caller's papers
// GET  /api/foundation/onemark/paper?exam=<id>  -> ... plus the exam's chapters, tags,
//                                                  JABT level counts, year range, cohorts
// POST /api/foundation/onemark/paper            -> { exam_definition_id, title } creates a DRAFT
//
// Gate: foundation.assessments.manage, checked here as well as on the page.
// Reads are RLS-scoped through the session client; the response carries
// COUNTS of the pool, never an item — items arrive through [id]/route.ts,
// where the answer key is stripped for anyone without foundation.items.manage.

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const g = await gate(supabase);
    if (!g) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!g.canManage) {
      return NextResponse.json(
        { error: 'You do not have access to build OneMark papers.' },
        { status: 403 },
      );
    }

    const examId = request.nextUrl.searchParams.get('exam');
    if (examId && !UUID_RE.test(examId)) {
      return NextResponse.json({ error: 'exam must be a uuid' }, { status: 400 });
    }

    const [exams, policies, sourcesRes, papersRes] = await Promise.all([
      loadExams(supabase),
      readPolicies(supabase),
      (supabase as any)
        .from('onemark_item_sources')
        .select('key, label')
        .eq('is_active', true)
        .order('sort_order'),
      (supabase as any)
        .from('fp_assessments')
        .select('id, title, exam_definition_id, config, updated_at, exam:exam_definitions(config_key)')
        .eq('kind', 'mock')
        .eq('created_by', g.userId)
        .contains('config', { onemark: true })
        .order('updated_at', { ascending: false })
        .limit(50),
    ]);
    if (sourcesRes.error) throw sourcesRes.error;
    if (papersRes.error) throw papersRes.error;

    const papers: PaperSummary[] = (papersRes.data ?? []).map((row: any) => {
      const cfg = (row.config ?? {}) as Partial<PaperConfig>;
      return {
        id: row.id,
        title: row.title,
        exam_definition_id: row.exam_definition_id,
        exam_key: row.exam?.config_key ?? '',
        state: cfg.state ?? 'DRAFT',
        step: cfg.step ?? 1,
        question_count: cfg.params?.question_count ?? 0,
        selected: Array.isArray(cfg.resolved_item_ids) ? cfg.resolved_item_ids.length : 0,
        updated_at: row.updated_at,
      };
    });

    let exam_reference: ExamReference | null = null;
    if (examId) {
      const exam = await loadExam(supabase, examId);
      if (!exam) {
        return NextResponse.json({ error: 'Not a OneMark exam.' }, { status: 404 });
      }
      const [chaptersBase, pool, tagsRes, cohortsRes] = await Promise.all([
        loadChapters(supabase, examId),
        loadPool(supabase, examId),
        (supabase as any)
          .from('onemark_item_tags')
          .select('key, label, subject_exam_definition_id')
          .eq('is_active', true)
          .or(`subject_exam_definition_id.eq.${examId},subject_exam_definition_id.is.null`)
          .order('sort_order'),
        (supabase as any)
          .from('fp_cohorts')
          .select('id, term, school:schools(name)')
          .eq('exam_definition_id', examId)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
      ]);
      if (tagsRes.error) throw tagsRes.error;
      if (cohortsRes.error) throw cohortsRes.error;

      const perChapter = new Map<string, number>();
      const perTag = new Map<string, number>();
      // PRD English §4.4: "anchored to no lesson" has two spellings in the
      // data — topic_id NULL and the seeded grammar-general topic. Both count
      // as the chapter-agnostic pool; the general topic is not listed as a
      // tickable chapter.
      const general = generalTopicIds(chaptersBase);
      let agnostic = 0;
      let minYear: number | null = null;
      let maxYear: number | null = null;
      for (const it of pool) {
        if (it.topic_id === null || general.has(it.topic_id)) agnostic += 1;
        else perChapter.set(it.topic_id, (perChapter.get(it.topic_id) ?? 0) + 1);
        for (const t of it.tags) perTag.set(t, (perTag.get(t) ?? 0) + 1);
        if (it.source_year !== null) {
          minYear = minYear === null ? it.source_year : Math.min(minYear, it.source_year);
          maxYear = maxYear === null ? it.source_year : Math.max(maxYear, it.source_year);
        }
      }
      const chapters: ChapterRef[] = chaptersBase
        .filter((c) => !c.is_general)
        .map(({ is_general: _general, ...c }) => ({
          ...c,
          pool_count: perChapter.get(c.id) ?? 0,
        }));
      const tags: TagRef[] = (tagsRes.data ?? []).map((t: any) => ({
        key: t.key,
        label: t.label,
        pool_count: perTag.get(t.key) ?? 0,
      }));
      const cohorts: CohortRef[] = (cohortsRes.data ?? []).map((c: any) => ({
        id: c.id,
        term: c.term ?? null,
        school_name: (Array.isArray(c.school) ? c.school[0] : c.school)?.name ?? null,
      }));

      exam_reference = {
        exam,
        chapters,
        chapter_agnostic_count: agnostic,
        tags,
        levels: levelCounts(pool),
        years: { min: minYear, max: maxYear },
        pool_total: pool.length,
        cohorts,
      };
    }

    const body: WizardReference = {
      can_see_answers: g.canSeeAnswers,
      exams,
      sources: (sourcesRes.data ?? []).map((s: any) => ({ key: s.key, label: s.label })),
      policies,
      papers,
      exam_reference,
    };
    return NextResponse.json(body);
  } catch (err) {
    // Database / RPC strings stay on the server; the browser gets a fixed line.
    console.error('[onemark/paper] GET failed', err);
    return NextResponse.json({ error: 'Could not load the paper wizard. Please try again.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const g = await gate(supabase);
    if (!g) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!g.canManage) {
      return NextResponse.json(
        { error: 'You do not have access to build OneMark papers.' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const examId = typeof body?.exam_definition_id === 'string' ? body.exam_definition_id : '';
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!UUID_RE.test(examId)) {
      return NextResponse.json({ error: 'exam_definition_id must be a uuid' }, { status: 400 });
    }
    if (title.length === 0 || title.length > 200) {
      return NextResponse.json({ error: 'title is required (max 200 characters)' }, { status: 400 });
    }

    const exam = await loadExam(supabase, examId);
    if (!exam) return NextResponse.json({ error: 'Not a OneMark exam.' }, { status: 404 });

    const policies = await readPolicies(supabase);
    const config = newPaperConfig(paramsFor(exam.config_key, policies));

    // kind='mock' + config.onemark=true is how a wizard paper is told apart
    // from the standing practice pools and the console's hand-built sets.
    const { data: row, error } = await (supabase as any)
      .from('fp_assessments')
      .insert({
        exam_definition_id: examId,
        cohort_id: null,
        title,
        kind: 'mock',
        config,
        is_active: true,
        created_by: g.userId,
      })
      .select('id, title, exam_definition_id, cohort_id, kind, config, created_by, updated_at')
      .single();
    if (error) throw error;

    const [chapters, weights] = await Promise.all([
      loadChapters(supabase, examId),
      loadCategoryWeights(supabase, examId),
    ]);
    const ctx = engineContext({
      examKey: exam.config_key,
      params: config.params,
      recentlyUsedIds: new Set(),
      chapters,
      categoryWeights: weights,
    });
    const paper = buildDetail({
      row: row as AssessmentRow,
      exam,
      config: normalizeConfig(row.config, config.params),
      pool: [],
      extraItems: [],
      chapters,
      ctx,
      canSeeAnswers: g.canSeeAnswers,
    });
    return NextResponse.json({ paper }, { status: 201 });
  } catch (err) {
    console.error('[onemark/paper] POST failed', err);
    return NextResponse.json({ error: 'Could not create the paper. Please try again.' }, { status: 500 });
  }
}
