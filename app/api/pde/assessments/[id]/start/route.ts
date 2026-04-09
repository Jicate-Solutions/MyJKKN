export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/assessments/[id]/start — start a new attempt
// Body: { learner_id }
export async function POST(
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
    const body = await request.json();
    const { learner_id } = body;

    if (!learner_id) {
      return NextResponse.json(
        { error: 'learner_id is required' },
        { status: 400 }
      );
    }

    // Fetch assessment to check max_attempts
    const { data: assessment, error: aErr } = await (supabase as any)
      .from('pde_assessments')
      .select('id, max_attempts, is_active')
      .eq('id', assessmentId)
      .single();

    if (aErr || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    if (!assessment.is_active) {
      return NextResponse.json(
        { error: 'Assessment is no longer active' },
        { status: 400 }
      );
    }

    // Count existing attempts
    const { count, error: cErr } = await (supabase as any)
      .from('pde_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId)
      .eq('learner_id', learner_id);

    if (cErr) throw cErr;

    const attemptCount = count || 0;

    // Check max attempts (if set)
    if (assessment.max_attempts && attemptCount >= assessment.max_attempts) {
      return NextResponse.json(
        {
          error: `Maximum attempts reached (${assessment.max_attempts})`,
          attempts_used: attemptCount,
          max_attempts: assessment.max_attempts,
        },
        { status: 400 }
      );
    }

    // Create new submission row
    const { data: submission, error: sErr } = await (supabase as any)
      .from('pde_submissions')
      .insert({
        assessment_id: assessmentId,
        learner_id,
        attempt_number: attemptCount + 1,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sErr) throw sErr;

    return NextResponse.json(
      {
        data: submission,
        meta: {
          attempt_number: attemptCount + 1,
          max_attempts: assessment.max_attempts || null,
          remaining_attempts: assessment.max_attempts
            ? assessment.max_attempts - (attemptCount + 1)
            : null,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error starting assessment attempt:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
