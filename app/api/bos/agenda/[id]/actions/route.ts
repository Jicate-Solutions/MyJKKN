import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/agenda/[id]/actions ─────────────────────────────────────────
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

    const { id: agendaItemId } = await params;

    const { data, error } = await supabase
      .from('bos_resolution_actions')
      .select('*')
      .eq('agenda_item_id', agendaItemId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/agenda/actions] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch actions' }, { status: 500 });
  }
}

// ── POST /api/bos/agenda/[id]/actions ────────────────────────────────────────
interface CreateActionBody {
  institutions_id: string;
  action_description: string;
  action_date?: string;
  action_by?: string;
  remarks?: string;
  status?: 'pending' | 'in_progress' | 'completed';
}

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

    const { id: agendaItemId } = await params;
    const body: CreateActionBody = await request.json();

    if (!body.action_description?.trim()) {
      return NextResponse.json({ error: 'action_description is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bos_resolution_actions')
      .insert({
        ...body,
        agenda_item_id: agendaItemId,
        status: body.status ?? 'pending',
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/agenda/actions] POST error:', error);
    return NextResponse.json({ error: 'Failed to add action' }, { status: 500 });
  }
}
