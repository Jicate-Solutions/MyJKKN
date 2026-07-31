export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// Foundation Programme — start one practice run.
//
// GET /api/foundation/practice/<examDefinitionId>
//   -> { assessmentId, questions: [{ id, stem, options, difficulty }] }
//
// THE ANSWER KEY NEVER LEAVES THIS FUNCTION.
// fp_items.answer and fp_items.explanation are read here (service-role, because
// fp_items is operator-gated under RLS) and are dropped before the response is
// built. The projection below is an allow-list, not a delete: adding a column to
// fp_items can never accidentally start shipping it to a learner. Grading happens
// server-side in fn_fp_record_attempt, so the browser never needs the answer.
//
// Questions are drawn at random from the exam's ACTIVE items. Inactive items are
// invisible here, which is the mechanism that keeps an authored-but-unreviewed
// batch dark: loading questions and publishing them are separate acts.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_QUESTION_COUNT = 10;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examDefinitionId: string }> },
) {
  await connection();
  try {
    const { examDefinitionId } = await params;
    if (!UUID_RE.test(examDefinitionId)) {
      return NextResponse.json(
        { error: 'examDefinitionId must be a uuid' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Identity through RLS: fp_students only yields the caller's own row.
    const { data: learner } = await (supabase as any)
      .from('fp_students')
      .select('id, status')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!learner || learner.status !== 'active') {
      return NextResponse.json(
        { error: 'You are not enrolled on the Foundation programme.' },
        { status: 403 },
      );
    }

    const admin = createServiceRoleClient();

    const { data: pool } = await (admin as any)
      .from('fp_assessments')
      .select('id')
      .eq('exam_definition_id', examDefinitionId)
      .eq('kind', 'practice')
      .is('cohort_id', null)
      .eq('is_active', true)
      .maybeSingle();

    if (!pool) {
      return NextResponse.json(
        { error: 'Practice is not set up for this subject yet.' },
        { status: 404 },
      );
    }

    // How many to serve — a config row, so the number can be tuned by an
    // UPDATE rather than a deploy. A broken/missing row falls back to the
    // constant rather than serving zero questions.
    let questionCount = DEFAULT_QUESTION_COUNT;
    const { data: configured } = await (admin as any).rpc('fn_get_policy_int', {
      p_key: 'foundation.practice.question_count',
      p_default: DEFAULT_QUESTION_COUNT,
    });
    if (typeof configured === 'number' && configured > 0) {
      questionCount = configured;
    }

    // Allow-list projection. `answer` and `explanation` are deliberately absent.
    const { data: items, error: itemsError } = await (admin as any)
      .from('fp_items')
      .select('id, stem, options, difficulty, q_type')
      .eq('exam_definition_id', examDefinitionId)
      .eq('is_active', true)
      .limit(500);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'There are no questions ready for this subject yet.' },
        { status: 404 },
      );
    }

    // Fisher-Yates over the candidate set, then take the first N. Shuffling in
    // the app rather than ORDER BY random() keeps this to one query, and the
    // candidate set is small by construction (one exam's active bank).
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return NextResponse.json({
      assessmentId: pool.id,
      learnerId: learner.id,
      questions: shuffled.slice(0, questionCount).map((it: any) => ({
        id: it.id,
        stem: it.stem,
        options: it.options,
        difficulty: it.difficulty,
        q_type: it.q_type,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not start practice' },
      { status: 500 },
    );
  }
}
