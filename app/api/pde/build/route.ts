

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/build — start a new build session
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { quest_id } = body;

    if (!quest_id) {
      return NextResponse.json(
        { error: 'quest_id is required' },
        { status: 400 }
      );
    }

    // Insert a new build session
    const { data, error } = await (supabase as any)
      .from('pde_build_sessions')
      .insert({
        learner_id: user.id,
        quest_id,
        started_at: new Date().toISOString(),
        ai_prompts_count: 0,
        ai_outputs_modified: 0,
        ai_outputs_blind: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[PDE Build] Start session error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[PDE Build] POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/pde/build — end an active build session (by session ID in body)
export async function PATCH(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { session_id, notes, artifacts } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    // Calculate duration
    const { data: session } = await (supabase as any)
      .from('pde_build_sessions')
      .select('started_at')
      .eq('id', session_id)
      .eq('learner_id', user.id)
      .single();

    const durationMinutes = session?.started_at
      ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000)
      : null;

    const { data, error } = await (supabase as any)
      .from('pde_build_sessions')
      .update({
        ended_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        notes: notes || null,
        artifacts: artifacts || null,
      })
      .eq('id', session_id)
      .eq('learner_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[PDE Build] End session error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[PDE Build] PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
