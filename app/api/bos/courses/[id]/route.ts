import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── DELETE /api/bos/courses/[id] ─────────────────────────────────────────────
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
      .from('bos_course_reviews')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/courses/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete course review' }, { status: 500 });
  }
}

// ── PUT /api/bos/courses/[id] ────────────────────────────────────────────────
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
      .from('bos_course_reviews')
      .update(body)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/courses/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update course review' }, { status: 500 });
  }
}
