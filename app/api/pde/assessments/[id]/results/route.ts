export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// `pde_submissions.answers` is schemaless JSONB and carries FOUR shapes in prod.
//
//   (A) [{ question_id, selected_answer, is_correct, points_earned }, ...]
//       written by lib/services/pde-service.ts::submitAnswers, which is fed by
//       app/(routes)/learn/assess/[id]/page.tsx — the very page whose results
//       view this route backs. This is the dominant shape here.
//   (B) [{ q_number, student_answer }] / [{ question_id, answer_text }]
//       the clinical envelopes app/api/pde/clinical-reasoning/score/route.ts
//       parses. `q_number` is 1-based.
//   (C) { items: [...], osce_score: {...} }
//       written by that same OSCE write-back. It only began reaching the column
//       with PR #2629, which moved the UPDATE onto the service-role client;
//       before that it matched zero rows under RLS and silently did nothing.
//   (D) Record<questionKey, answerText>
//       the ONLY shape this route used to read. Nothing in-repo persists it,
//       but POST /api/pde/assessments/[id]/submit stores its request body
//       verbatim with no validation, so it stays supported.
//
// The pre-fix lookup was `answers[q.id] ?? answers[q.order_index]` — (D) alone.
// Against (A), the shape actually stored, `answers[q.id]` is undefined (an array
// has no UUID key) and `answers[q.order_index]` is either undefined or a WHOLE
// answer object, which `String(...)` renders as "[object Object]". Nothing ever
// equalled `correct_answer`, so every question graded false, every Fink
// dimension reported 0%, and `student_answer` came back as a raw object. There
// was no throw and no log — a silent mis-grade rather than a crash.
//
// FOLLOW-UP: PR #2709 introduces lib/pde/answers-shape.ts as the canonical
// normaliser for (A)/(B)/(C). It is not on main yet, so this file carries its
// own copy rather than importing a module that does not exist. Collapse
// `toAnswersArray` below onto that helper once #2709 merges — (D) has no
// equivalent there and must survive the consolidation.
// ---------------------------------------------------------------------------

/**
 * Unwrap (C) to its inner array; pass (A)/(B) through untouched. Deliberately
 * identical in semantics to the `toAnswersArray` helper PR #2709 adds.
 */
function toAnswersArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const items = (raw as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? items : [];
}

/** Pull the learner's response text out of one envelope, or out of a bare value. */
function answerText(entry: unknown): string | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry);
  if (typeof entry !== 'object') return null;
  const o = entry as Record<string, unknown>;
  // Key order matters: (A) spells it `selected_answer`, (B) spells it
  // `student_answer` or `answer_text`, and `answer` is the loosest legacy form.
  for (const key of ['selected_answer', 'student_answer', 'answer_text', 'answer']) {
    const v = o[key];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  }
  return null;
}

/**
 * Build the question -> answer-text resolver for one submission, tolerating all
 * four shapes above. Exported for the unit test; the route file already follows
 * the precedent set by app/api/pde/cases/import-from-pms/route.ts.
 *
 * Returns `null` for a question the learner left unanswered, which is what the
 * caller's `!== null` guard expects.
 */
export function buildAnswerLookup(
  raw: unknown,
): (questionId: string, orderIndex: unknown) => string | null {
  const byQuestionId = new Map<string, string>();
  const byPosition = new Map<number, string>();

  const entries = toAnswersArray(raw);
  if (entries.length > 0) {
    entries.forEach((entry, idx) => {
      const text = answerText(entry);
      if (text === null) return;
      const o = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      if (typeof o.question_id === 'string' && o.question_id !== '') {
        if (!byQuestionId.has(o.question_id)) byQuestionId.set(o.question_id, text);
      }
      // Positional fallback for envelopes carrying no question_id. `order_index`
      // is written 1-based (app/api/pde/cases/route.ts stamps
      // `q.order_index ?? idx + 1`), the same base as the clinical `q_number`.
      const position = typeof o.q_number === 'number' ? o.q_number : idx + 1;
      if (!byPosition.has(position)) byPosition.set(position, text);
    });
  } else if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    // (D) — a keyed map. `items` / `osce_score` are the (C) envelope's own keys
    // and are never question keys.
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key === 'items' || key === 'osce_score') continue;
      const text = answerText(value);
      if (text === null) continue;
      byQuestionId.set(key, text);
      const asNumber = Number(key);
      if (Number.isInteger(asNumber)) byPosition.set(asNumber, text);
    }
  }

  return (questionId, orderIndex) => {
    const byId = byQuestionId.get(questionId);
    if (byId !== undefined) return byId;
    if (typeof orderIndex === 'number' && Number.isInteger(orderIndex)) {
      const byIdx = byPosition.get(orderIndex);
      if (byIdx !== undefined) return byIdx;
    }
    return null;
  };
}

// GET /api/pde/assessments/[id]/results?submissionId=xxx
// Returns graded answers + Fink's taxonomy breakdown
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: assessmentId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const submissionId = searchParams.get('submissionId');

    if (!submissionId) {
      return NextResponse.json(
        { error: 'submissionId query param is required' },
        { status: 400 }
      );
    }

    // Fetch submission
    const { data: submission, error: sErr } = await (supabase as any)
      .from('pde_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('assessment_id', assessmentId)
      .single();

    if (sErr || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Fetch questions for this assessment. Learners no longer hold SELECT on
    // pde_assessment_questions (pde_questions_read RLS tighten), and grading +
    // the results view require the answer key. Submission ownership is already
    // enforced above (the session-client read is RLS-scoped to the caller's own
    // submission), so reading the key with the service-role client is safe.
    const svc = createServiceRoleClient();
    const { data: questions, error: qErr } = await (svc as any)
      .from('pde_assessment_questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('order_index');

    if (qErr) throw qErr;

    // Build graded answers: match submission answers with questions. See the
    // shape notes at the top of this file — the raw column is not a keyed map.
    const findAnswer = buildAnswerLookup(submission.answers);
    const gradedAnswers = (questions || []).map((q: any) => {
      const learnerAnswer = findAnswer(q.id, q.order_index);
      const isCorrect = learnerAnswer !== null &&
        String(learnerAnswer).toLowerCase().trim() === String(q.correct_answer).toLowerCase().trim();

      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        // Output key kept as `student_answer` for API-contract stability, same
        // reasoning as `fink_category` below.
        student_answer: learnerAnswer,
        correct_answer: q.correct_answer,
        is_correct: isCorrect,
        points: isCorrect ? (q.points || 1) : 0,
        max_points: q.points || 1,
        // Real column is `finks_dimension` (Fink's Taxonomy dimension). The
        // legacy `fink_category` column never existed → breakdown silently
        // collapsed to "uncategorized". Output key kept as `fink_category`
        // for API-contract stability.
        fink_category: q.finks_dimension || null,
        explanation: q.explanation || null,
      };
    });

    // Calculate Fink's taxonomy breakdown
    const finkBreakdown: Record<string, { correct: number; total: number; pct: number }> = {};
    gradedAnswers.forEach((a: any) => {
      const category = a.fink_category || 'uncategorized';
      if (!finkBreakdown[category]) {
        finkBreakdown[category] = { correct: 0, total: 0, pct: 0 };
      }
      finkBreakdown[category].total++;
      if (a.is_correct) finkBreakdown[category].correct++;
    });

    // Calculate percentages
    Object.keys(finkBreakdown).forEach((cat) => {
      const entry = finkBreakdown[cat];
      entry.pct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
    });

    const totalPoints = gradedAnswers.reduce((s: number, a: any) => s + a.points, 0);
    const maxPoints = gradedAnswers.reduce((s: number, a: any) => s + a.max_points, 0);

    return NextResponse.json({
      data: {
        submission_id: submission.id,
        assessment_id: assessmentId,
        learner_id: submission.learner_id,
        attempt_number: submission.attempt_number,
        // Real score column is `final_score` (numeric 0-100). The legacy
        // `score_pct` column never existed → this branch was always undefined
        // and silently fell through to the recomputed value.
        score_pct: submission.final_score ?? (maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0),
        total_points: totalPoints,
        max_points: maxPoints,
        time_spent_seconds: submission.time_spent_seconds,
        started_at: submission.started_at,
        completed_at: submission.completed_at,
        graded_answers: gradedAnswers,
        fink_breakdown: finkBreakdown,
      },
    });
  } catch (error: any) {
    console.error('Error fetching assessment results:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
