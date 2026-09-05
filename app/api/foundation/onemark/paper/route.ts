export const dynamic = 'force-dynamic';

import { NextResponse, connection, type NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { OneMarkExamKeys, OneMarkPolicyDefaults, OneMarkPolicyKeys } from '@/types/onemark';
import type { BankItem, PaperConfig } from '@/lib/services/onemark/paper-service';

// OneMark — the Senior Learner's paper wizard (Wave 2 Lane W).
//
// GET  /api/foundation/onemark/paper?exams=1        -> { exams }
// GET  /api/foundation/onemark/paper?list=1[&exam=] -> { papers }
// GET  /api/foundation/onemark/paper?exam=<id>      -> the bank the wizard draws from
// POST /api/foundation/onemark/paper                -> create a draft (fp_assessments, kind='mock')
//
// GATE: foundation.assessments.manage (or super admin). Denials are 403 with a
// reason; the page renders them as an explicit access card, never a redirect.
//
// TWO CLIENTS, ON PURPOSE (same rule as app/api/foundation/practice/route.ts)
//   identity + permission -> SESSION client (auth.uid(), user_has_permission).
//   fp_items              -> SERVICE-ROLE client, because fp_items_read is
//                            items.view/manage and a paper builder may hold
//                            neither. The ANSWER KEY is stripped here unless the
//                            caller holds foundation.items.manage — that column
//                            never reaches a browser on permission it lacks.
//   fp_assessments writes -> SESSION client, so fp_assessments_write RLS is a
//                            second boundary under the explicit check above.

type PermissionCheck = { allowed: boolean; canSeeAnswers: boolean };

async function checkPermissions(supabase: any): Promise<PermissionCheck> {
  const [{ data: isSuper }, { data: canManage }, { data: canItems }] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('user_has_permission', { permission_name: 'foundation.assessments.manage' }),
    supabase.rpc('user_has_permission', { permission_name: 'foundation.items.manage' }),
  ]);
  const superAdmin = isSuper === true;
  return {
    allowed: superAdmin || canManage === true,
    canSeeAnswers: superAdmin || canItems === true,
  };
}

const ONEMARK_EXAM_KEYS = [OneMarkExamKeys.PHYSICS, OneMarkExamKeys.ENGLISH] as string[];

function forbidden() {
  return NextResponse.json(
    {
      error: 'You do not have access to the paper wizard.',
      requiredPermission: 'foundation.assessments.manage',
    },
    { status: 403 },
  );
}

async function readPolicies(supabase: any) {
  const read = async (key: string, fallback: number) => {
    const { data } = await supabase.rpc('fn_get_policy_int', {
      p_key: key,
      p_default: fallback,
      p_scope_id: null,
    });
    return typeof data === 'number' ? data : fallback;
  };
  const [question_count, max_series, timed_default_minutes] = await Promise.all([
    read(OneMarkPolicyKeys.PAPER_QUESTION_COUNT, OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_QUESTION_COUNT]),
    read(OneMarkPolicyKeys.PAPER_MAX_SERIES, OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_MAX_SERIES]),
    read(OneMarkPolicyKeys.TIMED_DEFAULT_MINUTES, OneMarkPolicyDefaults[OneMarkPolicyKeys.TIMED_DEFAULT_MINUTES]),
  ]);
  return { question_count, max_series, timed_default_minutes };
}

const PAPER_SELECT =
  'id, exam_definition_id, cohort_id, title, kind, config, created_at, updated_at, exam:exam_definitions(id, config_key, display_name)';

function shapePaper(row: any, itemCount: number) {
  return {
    id: row.id,
    exam_definition_id: row.exam_definition_id,
    cohort_id: row.cohort_id,
    title: row.title,
    kind: row.kind,
    config: row.config,
    created_at: row.created_at,
    updated_at: row.updated_at,
    item_count: itemCount,
    exam: row.exam ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  await connection();
  try {
    const supabase: any = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms = await checkPermissions(supabase);
    if (!perms.allowed) return forbidden();

    const url = new URL(req.url);
    const examId = url.searchParams.get('exam');

    // ---- exams --------------------------------------------------------------
    if (url.searchParams.get('exams') === '1') {
      const { data, error } = await supabase
        .from('exam_definitions')
        .select('id, config_key, display_name')
        .in('config_key', ONEMARK_EXAM_KEYS)
        .eq('is_active', true)
        .order('sort_order');
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ exams: data ?? [] });
    }

    // ---- list of this wizard's papers --------------------------------------
    if (url.searchParams.get('list') === '1') {
      let q = supabase
        .from('fp_assessments')
        .select(PAPER_SELECT)
        .eq('kind', 'mock')
        .eq('config->>onemark', 'true')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (examId) q = q.eq('exam_definition_id', examId);
      const { data, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const papers = (data ?? []).map((row: any) =>
        shapePaper(row, Array.isArray(row.config?.selected_ids) ? row.config.selected_ids.length : 0),
      );
      return NextResponse.json({ papers });
    }

    // ---- the bank -----------------------------------------------------------
    if (!examId) return NextResponse.json({ error: 'exam is required' }, { status: 400 });

    const { data: exam, error: examError } = await supabase
      .from('exam_definitions')
      .select('id, config_key, display_name')
      .eq('id', examId)
      .in('config_key', ONEMARK_EXAM_KEYS)
      .maybeSingle();
    if (examError) return NextResponse.json({ error: examError.message }, { status: 400 });
    if (!exam) return NextResponse.json({ error: 'Not a OneMark subject.' }, { status: 404 });

    const admin: any = createServiceRoleClient();

    const [topicsRes, tagsRes, sourcesRes, weightsRes, itemsRes, cohortsRes, policies] = await Promise.all([
      supabase
        .from('exam_topic_map')
        .select('sort_order, topic:cdc_exam_syllabus_topics(id, config_key, display_name, description, is_active)')
        .eq('exam_definition_id', examId)
        .order('sort_order'),
      supabase
        .from('onemark_item_tags')
        .select('key, label, subject_exam_definition_id')
        .eq('is_active', true)
        .or(`subject_exam_definition_id.eq.${examId},subject_exam_definition_id.is.null`)
        .order('sort_order'),
      supabase.from('onemark_item_sources').select('key, label').eq('is_active', true).order('sort_order'),
      supabase
        .from('onemark_category_weights')
        .select('tag_key, weight')
        .eq('exam_definition_id', examId)
        .eq('is_active', true),
      // Only approved items (decision 11: never pad with unapproved drafts).
      admin
        .from('fp_items')
        .select(
          'id, topic_id, stem, stem_ta, options, options_ta, bloom_level, tags, source_key, source_year, times_served, option_layout, explanation, explanation_ta, answer',
        )
        .eq('exam_definition_id', examId)
        .eq('is_active', true)
        .order('created_at'),
      supabase
        .from('fp_cohorts')
        .select('id, term, is_active, school:schools(name)')
        .eq('exam_definition_id', examId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      readPolicies(supabase),
    ]);

    for (const r of [topicsRes, tagsRes, sourcesRes, weightsRes, itemsRes, cohortsRes]) {
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
    }

    const items: BankItem[] = (itemsRes.data ?? []).map((row: any) => {
      const shaped: BankItem = {
        id: row.id,
        topic_id: row.topic_id ?? null,
        stem: row.stem,
        stem_ta: row.stem_ta ?? null,
        options: Array.isArray(row.options) ? row.options.map((o: unknown) => String(o)) : [],
        options_ta: Array.isArray(row.options_ta) ? row.options_ta.map((o: unknown) => String(o)) : null,
        bloom_level: row.bloom_level ?? null,
        tags: Array.isArray(row.tags) ? row.tags : [],
        source_key: row.source_key ?? null,
        source_year: row.source_year ?? null,
        times_served: row.times_served ?? 0,
        option_layout: row.option_layout ?? 'auto',
        explanation: row.explanation ?? null,
        explanation_ta: row.explanation_ta ?? null,
      };
      // The answer key crosses to the browser only for an items.manage holder.
      if (perms.canSeeAnswers) shaped.answer = row.answer;
      return shaped;
    });

    // Recently finalized papers of this subject (exclude-recent-tests).
    const { data: recentRows } = await admin
      .from('fp_assessments')
      .select('id, title, config, items:fp_assessment_items(item_id)')
      .eq('exam_definition_id', examId)
      .eq('kind', 'mock')
      .eq('config->>onemark', 'true')
      .eq('config->>state', 'FINALIZED')
      .order('updated_at', { ascending: false })
      .limit(10);
    const recent_papers = (recentRows ?? [])
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        finalized_at: r.config?.finalized_at ?? null,
        item_ids: (r.items ?? []).map((x: any) => x.item_id),
      }))
      .sort((a: any, b: any) => String(b.finalized_at ?? '').localeCompare(String(a.finalized_at ?? '')));

    return NextResponse.json({
      exam,
      topics: (topicsRes.data ?? [])
        .filter((r: any) => r.topic && r.topic.is_active !== false)
        .map((r: any) => ({
          id: r.topic.id,
          config_key: r.topic.config_key,
          display_name: r.topic.display_name,
          description: r.topic.description ?? null,
          sort_order: r.sort_order,
        })),
      tags: tagsRes.data ?? [],
      sources: sourcesRes.data ?? [],
      weights: (weightsRes.data ?? []).map((w: any) => ({ tag_key: w.tag_key, weight: Number(w.weight) })),
      items,
      recent_papers,
      cohorts: (cohortsRes.data ?? []).map((c: any) => ({
        id: c.id,
        term: c.term ?? null,
        school_name: c.school?.name ?? null,
      })),
      policies,
      can_see_answers: perms.canSeeAnswers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Could not load the paper wizard' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await connection();
  try {
    const supabase: any = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const perms = await checkPermissions(supabase);
    if (!perms.allowed) return forbidden();

    const body = await req.json().catch(() => null);
    const examId = typeof body?.exam_definition_id === 'string' ? body.exam_definition_id : null;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const config = body?.config as PaperConfig | undefined;
    if (!examId || !title || !config || config.onemark !== true) {
      return NextResponse.json({ error: 'exam_definition_id, title and a wizard config are required' }, { status: 400 });
    }

    const { data: exam } = await supabase
      .from('exam_definitions')
      .select('id')
      .eq('id', examId)
      .in('config_key', ONEMARK_EXAM_KEYS)
      .maybeSingle();
    if (!exam) return NextResponse.json({ error: 'Not a OneMark subject.' }, { status: 404 });

    const { data, error } = await supabase
      .from('fp_assessments')
      .insert({
        exam_definition_id: examId,
        cohort_id: null,
        title,
        kind: 'mock',
        config: { ...config, state: 'DRAFT', step: 1, selected_ids: [], finalized_at: null },
        is_active: true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select(PAPER_SELECT)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ paper: shapePaper(data, 0) }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Could not create the paper' }, { status: 500 });
  }
}
