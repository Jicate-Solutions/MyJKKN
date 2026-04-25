import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosMemberDto } from '@/types/bos';

// ── PUT /api/bos/members/[id] ─────────────────────────────────────────────────
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
    const body: UpdateBosMemberDto = await request.json();

    const { data, error } = await supabase
      .from('bos_members')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`*, expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no, category )`)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/members/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

// ── DELETE /api/bos/members/[id] ──────────────────────────────────────────────
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
    const { error } = await supabase.from('bos_members').delete().eq('id', id);
    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/members/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
