import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CreateBosAgendaItemDto } from '@/types/bos';

// ── GET /api/bos/meetings/[id]/agenda ────────────────────────────────────────
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

    const { id: meetingId } = await params;

    const { data, error } = await supabase
      .from('bos_agenda_items')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/agenda] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch agenda items' }, { status: 500 });
  }
}

// ── POST /api/bos/meetings/[id]/agenda ───────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;
    const body: Omit<CreateBosAgendaItemDto, 'meeting_id' | 'item_number' | 'sort_order'> =
      await request.json();

    if (!body.item_title?.trim()) {
      return NextResponse.json({ error: 'item_title is required' }, { status: 400 });
    }

    // Auto-assign item_number (count of existing items + 1) and sort_order
    const { count } = await supabase
      .from('bos_agenda_items')
      .select('id', { count: 'exact', head: true })
      .eq('meeting_id', meetingId);

    const nextNumber = (count ?? 0) + 1;

    const { data, error } = await supabase
      .from('bos_agenda_items')
      .insert({
        ...body,
        meeting_id: meetingId,
        item_number: nextNumber,
        sort_order: nextNumber,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/agenda] POST error:', error);
    return NextResponse.json({ error: 'Failed to create agenda item' }, { status: 500 });
  }
}
