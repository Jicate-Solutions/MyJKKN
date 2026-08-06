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

/** Mirrors fn_fp_recompute_weakness's own fallback for the same policy key. */
const DEFAULT_FLAG_THRESHOLD = 2;

/** Fisher-Yates, returning a new array. */
function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function GET(
  request: NextRequest,
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

    // ---- Whose run is this? -------------------------------------------------
    // Without ?forLearner, the caller is answering as themself and identity comes
    // from RLS: fp_students only ever yields the row whose profile_id is the
    // caller. That policy, not this code, is the boundary.
    //
    // With ?forLearner, somebody is running a session for a child who holds no
    // account. The id in the query string is a CLAIM and is treated as one: it
    // is checked against the database before it is used, using the same two
    // predicates fn_fp_record_attempt itself will apply at submit time. Checking
    // the identical pair matters — a looser check here would draw questions for
    // a learner whose answers the RPC would then refuse to save, stranding the
    // session at the last click.
    // `new URL(request.url)` rather than `request.nextUrl`, matching the sibling
    // results route: the query string is all that is needed and this works on a
    // plain Request, which is what the tests construct.
    const forLearner = new URL(request.url).searchParams.get('forLearner');
    let learner: { id: string; status: string } | null = null;

    if (forLearner) {
      if (!UUID_RE.test(forLearner)) {
        return NextResponse.json(
          { error: 'forLearner must be a uuid' },
          { status: 400 },
        );
      }

      // Both RPCs resolve against auth.uid() internally, so a forged id cannot
      // widen anything: fn_fp_teaches_student is
      // fp_cohorts.resource_person_id = auth.uid() for a cohort THIS learner is
      // enrolled in, and fn_fp_can_manage_student covers the school's owner.
      const [{ data: teaches }, { data: manages }] = await Promise.all([
        (supabase as any).rpc('fn_fp_teaches_student', { p_student_id: forLearner }),
        (supabase as any).rpc('fn_fp_can_manage_student', { p_student_id: forLearner }),
      ]);

      if (teaches !== true && manages !== true) {
        return NextResponse.json(
          { error: 'You do not run a session for this learner.' },
          { status: 403 },
        );
      }

      // Read through the SESSION client even though authorisation has already
      // passed, so RLS stays the last word rather than being bypassed here.
      const { data: row } = await (supabase as any)
        .from('fp_students')
        .select('id, status')
        .eq('id', forLearner)
        .maybeSingle();
      learner = row ?? null;
    } else {
      const { data: row } = await (supabase as any)
        .from('fp_students')
        .select('id, status')
        .eq('profile_id', user.id)
        .maybeSingle();
      learner = row ?? null;
    }

    if (!learner || learner.status !== 'active') {
      return NextResponse.json(
        {
          error: forLearner
            ? 'That learner is not active on the Foundation programme.'
            : 'You are not enrolled on the Foundation programme.',
        },
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

    const itemIds = items.map((it: any) => it.id);

    // ---- Drop questions enough different people have reported --------------
    // Same rule mastery scoring already applies (fn_fp_recompute_weakness reads
    // the identical policy key and the identical count(DISTINCT flagged_by)
    // predicate). Until now a reported question stopped counting toward mastery
    // but kept being SERVED, so learners went on meeting a question already
    // flagged as wrong. One threshold, one meaning, both places.
    let threshold = DEFAULT_FLAG_THRESHOLD;
    const { data: configuredThreshold } = await (admin as any).rpc(
      'fn_get_policy_int',
      {
        p_key: 'foundation.item_flag.suppress_threshold',
        p_default: DEFAULT_FLAG_THRESHOLD,
      },
    );
    if (typeof configuredThreshold === 'number' && configuredThreshold > 0) {
      threshold = configuredThreshold;
    }

    const { data: openFlags } = await (admin as any)
      .from('fp_item_flags')
      .select('item_id, flagged_by')
      .eq('status', 'open')
      .in('item_id', itemIds);

    const reportersByItem = new Map<string, Set<string>>();
    for (const f of openFlags ?? []) {
      if (!reportersByItem.has(f.item_id)) {
        reportersByItem.set(f.item_id, new Set());
      }
      // DISTINCT people, not distinct reports — one person cannot suppress a
      // question by reporting it repeatedly.
      reportersByItem.get(f.item_id)!.add(f.flagged_by);
    }

    const usable = items.filter(
      (it: any) => (reportersByItem.get(it.id)?.size ?? 0) < threshold,
    );

    if (usable.length === 0) {
      return NextResponse.json(
        {
          error:
            'Every question in this subject is waiting to be checked. Please try again later.',
        },
        { status: 404 },
      );
    }

    // ---- Prefer questions this learner has not met before ------------------
    // Drawing 10 at random from 116 with no memory repeats questions often
    // enough to feel broken, and leaves parts of the syllabus unpractised.
    // Unseen questions go first; within each group the order is still random,
    // so nothing becomes predictable.
    const { data: myAttempts } = await (admin as any)
      .from('fp_attempts')
      .select('id')
      .eq('student_id', learner.id);

    const attemptIds = (myAttempts ?? []).map((a: any) => a.id);
    const { data: alreadyAnswered } = attemptIds.length
      ? await (admin as any)
          .from('fp_responses')
          .select('item_id')
          .in('attempt_id', attemptIds)
      : { data: [] };

    const seen = new Set((alreadyAnswered ?? []).map((r: any) => r.item_id));

    const fresh = shuffle(usable.filter((it: any) => !seen.has(it.id)));
    const repeats = shuffle(usable.filter((it: any) => seen.has(it.id)));

    return NextResponse.json({
      assessmentId: pool.id,
      learnerId: learner.id,
      questions: [...fresh, ...repeats]
        .slice(0, questionCount)
        .map((it: any) => ({
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
