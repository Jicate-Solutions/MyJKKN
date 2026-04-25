import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosMeetingDto } from '@/types/bos';

// ── GET /api/bos/meetings/[id] ────────────────────────────────────────────────
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
      .from('bos_meetings')
      .select(`
        *,
        bos_compositions (
          id,
          composition_title,
          academic_year,
          bos_members (
            id,
            member_type,
            display_name,
            display_designation,
            display_institution,
            email,
            contact_no,
            is_active,
            sort_order,
            expert_id
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/meetings/:id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch meeting' }, { status: 500 });
  }
}

// ── PUT /api/bos/meetings/[id] ────────────────────────────────────────────────
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
    const body: UpdateBosMeetingDto = await request.json();

    const payload = {
      ...body,
      scheduled_date: body.scheduled_date || null,
      scheduled_time: body.scheduled_time || null,
      actual_date: body.actual_date || null,
      actual_start_time: body.actual_start_time || null,
      actual_end_time: body.actual_end_time || null,
      ratified_date: body.ratified_date || null,
      venue: body.venue || null,
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bos_meetings')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/meetings/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
  }
}

// ── DELETE /api/bos/meetings/[id] ─────────────────────────────────────────────
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
    // Only allow deletion of draft meetings
    const { data: meeting } = await supabase
      .from('bos_meetings')
      .select('status')
      .eq('id', id)
      .single();

    if (meeting && meeting.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft meetings can be deleted.' },
        { status: 409 }
      );
    }

    const { error } = await supabase.from('bos_meetings').delete().eq('id', id);
    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/meetings/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 });
  }
}
