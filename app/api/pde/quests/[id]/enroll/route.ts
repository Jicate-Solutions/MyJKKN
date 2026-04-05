export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/quests/[id]/enroll — enroll current user in a quest
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

    const body = await request.json().catch(() => ({}));
    const teamId = body.team_id || null;

    // Check if already enrolled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('pde_quest_enrollments')
      .select('id')
      .eq('quest_id', questId)
      .eq('learner_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Already enrolled in this quest' },
        { status: 409 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_quest_enrollments')
      .insert({
        quest_id: questId,
        learner_id: user.id,
        team_id: teamId,
        role: teamId ? 'member' : 'lead',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error enrolling in quest:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
