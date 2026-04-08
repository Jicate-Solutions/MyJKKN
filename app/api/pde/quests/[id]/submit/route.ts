

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/quests/[id]/submit — submit work for a quest
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: questId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, submission_type, description, evidence_urls, reflection } = body;

    if (!title || !submission_type) {
      return NextResponse.json(
        { error: 'title and submission_type are required' },
        { status: 400 }
      );
    }

    // Verify enrollment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enrollment } = await (supabase as any)
      .from('pde_quest_enrollments')
      .select('id, team_id')
      .eq('quest_id', questId)
      .eq('learner_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json(
        { error: 'Not enrolled in this quest or enrollment is not active' },
        { status: 403 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_quest_submissions')
      .insert({
        quest_id: questId,
        learner_id: user.id,
        team_id: enrollment.team_id || null,
        submission_type,
        title,
        description: description || null,
        evidence_urls: evidence_urls || null,
        reflection: reflection || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error submitting quest work:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
