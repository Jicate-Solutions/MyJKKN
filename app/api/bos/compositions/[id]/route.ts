import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosCompositionDto } from '@/types/bos';

// ── GET /api/bos/compositions/[id] ───────────────────────────────────────────
// Returns a single composition with its board info and full member list.
export async function GET(
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

    const { data, error } = await supabase
      .from('bos_compositions')
      .select(
        `
        *,
        members:bos_members (
          *,
          expert:bos_external_experts ( id, name, title, category, institution_name )
        )
        `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/compositions/[id]] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch composition' }, { status: 500 });
  }
}

// ── PUT /api/bos/compositions/[id] ───────────────────────────────────────────
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
    const body: UpdateBosCompositionDto = await request.json();

    const payload = {
      ...body,
      ratified_date: body.ratified_date || null,
      term_end_date: body.term_end_date || null,
      constituted_by: body.constituted_by || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bos_compositions')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
      }
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A composition for this board already exists for the selected term start date.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/compositions/[id]] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update composition' }, { status: 500 });
  }
}

// ── DELETE /api/bos/compositions/[id] ────────────────────────────────────────
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
    const { error } = await supabase.from('bos_compositions').delete().eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/compositions/[id]] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete composition' }, { status: 500 });
  }
}
