

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/capabilities/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_capabilities')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Capability not found' }, { status: 404 });

    // Also fetch learner's status if they have one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: learnerStatus } = await (supabase as any)
      .from('pde_learner_capabilities')
      .select('status, demonstrated_at, demonstration_score')
      .eq('capability_id', id)
      .eq('learner_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      data: {
        ...data,
        learner_status: learnerStatus?.status || 'locked',
        demonstrated_at: learnerStatus?.demonstrated_at || null,
        demonstration_score: learnerStatus?.demonstration_score || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching capability:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/pde/capabilities/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_capabilities')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error updating capability:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
