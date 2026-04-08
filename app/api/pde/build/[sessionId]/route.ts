

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/build/[sessionId] — get session detail
export async function GET(
  _request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ sessionId: string }> }
) {
  await connection();
  try {
    const { sessionId } = await paramsPromise;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await (supabase as any)
      .from('pde_build_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('[PDE Build] Get session error:', error);
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[PDE Build] GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/pde/build/[sessionId] — update session artifacts/notes mid-session
export async function PATCH(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ sessionId: string }> }
) {
  await connection();
  try {
    const { sessionId } = await paramsPromise;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.artifacts !== undefined) updateData.artifacts = body.artifacts;
    if (body.ai_interactions !== undefined) updateData.ai_interactions = body.ai_interactions;
    if (body.ai_prompts_count !== undefined) updateData.ai_prompts_count = body.ai_prompts_count;
    if (body.ai_outputs_modified !== undefined) updateData.ai_outputs_modified = body.ai_outputs_modified;
    if (body.ai_outputs_blind !== undefined) updateData.ai_outputs_blind = body.ai_outputs_blind;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No update fields provided' },
        { status: 400 }
      );
    }

    const { data, error } = await (supabase as any)
      .from('pde_build_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('learner_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[PDE Build] Update session error:', error);
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
