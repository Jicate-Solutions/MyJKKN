export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/assessments/auto-generate
// Auto-generate quiz from lesson content
// Body: { lessonId } or { courseId }
// Reads lesson's self_check and exercises, generates MCQ/TF/short-answer questions
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { lessonId, courseId } = body;

    if (!lessonId && !courseId) {
      return NextResponse.json(
        { error: 'Either lessonId or courseId is required' },
        { status: 400 }
      );
    }

    // Fetch lesson(s)
    let lessonsQuery = (supabase as any)
      .from('pde_lessons')
      .select('id, title, content, course_id, order_index');

    if (lessonId) {
      lessonsQuery = lessonsQuery.eq('id', lessonId);
    } else {
      lessonsQuery = lessonsQuery.eq('course_id', courseId).order('order_index');
    }

    const { data: lessons, error: lErr } = await lessonsQuery;
    if (lErr) throw lErr;

    if (!lessons || lessons.length === 0) {
      return NextResponse.json(
        { error: 'No lessons found' },
        { status: 404 }
      );
    }

    const generatedAssessments: any[] = [];

    for (const lesson of lessons) {
      const content = lesson.content || {};
      const selfCheck = content.self_check || content.selfCheck || [];
      const exercises = content.exercises || [];

      // Skip lessons with no generatable content
      if (selfCheck.length === 0 && exercises.length === 0) continue;

      const questions: any[] = [];
      let orderIndex = 0;

      // self_check items -> true/false questions
      for (const item of selfCheck) {
        const text = typeof item === 'string' ? item : (item.question || item.text || item.prompt || '');
        if (!text) continue;

        questions.push({
          question_text: text,
          question_type: 'true_false',
          correct_answer: 'true',
          options: JSON.stringify(['true', 'false']),
          points: 1,
          order_index: orderIndex++,
          fink_category: 'foundational_knowledge',
          explanation: 'Self-check item from lesson content.',
        });
      }

      // exercise.foundation descriptions -> short_answer questions
      for (const exercise of exercises) {
        const description = exercise.description || exercise.foundation?.description || exercise.prompt || '';
        if (!description) continue;

        questions.push({
          question_text: `Based on the exercise: ${description}\n\nDescribe your approach and expected outcome in 2-3 sentences.`,
          question_type: 'short_answer',
          correct_answer: null, // Manual grading needed for short answer
          points: 2,
          order_index: orderIndex++,
          fink_category: 'application',
          explanation: 'Exercise-based question requiring applied understanding.',
        });
      }

      if (questions.length === 0) continue;

      // Create the assessment
      const { data: assessment, error: aErr } = await (supabase as any)
        .from('pde_assessments')
        .insert({
          course_id: lesson.course_id,
          lesson_id: lesson.id,
          title: `Auto-Quiz: ${lesson.title}`,
          assessment_type: 'quiz',
          max_attempts: 3,
          is_active: true,
          created_by: user.id,
          metadata: { auto_generated: true, source_lesson: lesson.id },
        })
        .select()
        .single();

      if (aErr) throw aErr;

      // Insert all questions
      const questionsWithAssessmentId = questions.map((q) => ({
        ...q,
        assessment_id: assessment.id,
      }));

      const { data: insertedQuestions, error: qErr } = await (supabase as any)
        .from('pde_assessment_questions')
        .insert(questionsWithAssessmentId)
        .select();

      if (qErr) throw qErr;

      generatedAssessments.push({
        assessment,
        questions_count: insertedQuestions?.length || questions.length,
      });
    }

    if (generatedAssessments.length === 0) {
      return NextResponse.json(
        {
          error: 'No assessments could be generated — lessons have no self_check or exercises content',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: generatedAssessments,
        meta: {
          lessons_processed: lessons.length,
          assessments_created: generatedAssessments.length,
          total_questions: generatedAssessments.reduce((s: number, a: any) => s + a.questions_count, 0),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error auto-generating assessments:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
