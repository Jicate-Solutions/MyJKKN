

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/assessments/[id]/submit
// Body: { action: 'start', learner_id } — start attempt
// Body: { action: 'submit', submission_id, answers, time_spent_seconds } — submit + auto-grade
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
    const { action } = body;

    if (action === 'start') {
      const { learner_id } = body;
      if (!learner_id) {
        return NextResponse.json(
          { error: 'learner_id is required for start action' },
          { status: 400 }
        );
      }

      // Count existing attempts
      const { count } = await (supabase as any)
        .from('pde_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('assessment_id', assessmentId)
        .eq('learner_id', learner_id);

      const { data, error } = await (supabase as any)
        .from('pde_submissions')
        .insert({
          assessment_id: assessmentId,
          learner_id,
          attempt_number: (count || 0) + 1,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ data }, { status: 201 });
    }

    if (action === 'submit') {
      const { submission_id, answers, time_spent_seconds } = body;
      if (!submission_id || !answers || time_spent_seconds === undefined) {
        return NextResponse.json(
          { error: 'submission_id, answers, and time_spent_seconds are required for submit action' },
          { status: 400 }
        );
      }

      // Update submission with answers and completion time
      const { data, error } = await (supabase as any)
        .from('pde_submissions')
        .update({
          answers,
          time_spent_seconds,
          completed_at: new Date().toISOString(),
        })
        .eq('id', submission_id)
        .select()
        .single();

      if (error) throw error;

      // Trigger auto-grade via RPC
      let graded = data;
      try {
        await (supabase as any).rpc('pde_auto_grade_submission', {
          p_submission_id: submission_id,
        });
        // Re-fetch to get updated score
        const { data: updated } = await (supabase as any)
          .from('pde_submissions')
          .select('*')
          .eq('id', submission_id)
          .single();
        if (updated) graded = updated;
      } catch {
        // RPC might not exist yet — return data as-is
      }

      return NextResponse.json({ data: graded });
    }

    return NextResponse.json(
      { error: 'Invalid action. Must be "start" or "submit"' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in assessment submission:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
