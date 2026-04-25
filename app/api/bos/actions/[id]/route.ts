import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── PUT /api/bos/actions/[id] ────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('bos_resolution_actions')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Action not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/actions/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update action' }, { status: 500 });
  }
}

// ── DELETE /api/bos/actions/[id] ─────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabase
      .from('bos_resolution_actions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/actions/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete action' }, { status: 500 });
  }
}
