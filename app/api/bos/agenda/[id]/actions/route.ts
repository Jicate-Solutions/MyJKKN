import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  guardCompositionWrite,
  guardPrincipalApprovalOnly,
} from '@/lib/utils/bos/bos-access';

// Resolve the parent meeting's institution + composition for a given agenda item.
// Agenda items don't carry these columns directly; we go through the meeting.
async function resolveAgendaParent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agendaItemId: string,
): Promise<{ institutions_id: string | null; composition_id: string | null } | null> {
  const { data } = await supabase
    .from('bos_agenda_items')
    .select('bos_meetings ( institutions_id, composition_id )')
    .eq('id', agendaItemId)
    .maybeSingle();
  const meeting = (data as { bos_meetings?: { institutions_id?: string | null; composition_id?: string | null } | null } | null)?.bos_meetings ?? null;
  if (!meeting) return null;
  return {
    institutions_id: meeting.institutions_id ?? null,
    composition_id: meeting.composition_id ?? null,
  };
}

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

    // Resolve the parent meeting to drive the gate. Adding resolution actions
    // is part of the meeting workflow — principals get a carve-out (per spec
    // they can approve workflow actions in their institution).
    const parent = await resolveAgendaParent(supabase, agendaItemId);
    if (!parent) {
      return NextResponse.json({ error: 'Agenda item not found' }, { status: 404 });
    }
    const scope = await resolveBosBoardScope(user.id);
    if (scope.isPrincipal) {
      const denyPrincipal = guardPrincipalApprovalOnly(scope, 'approve', parent.institutions_id);
      if (denyPrincipal) return NextResponse.json({ error: denyPrincipal }, { status: 403 });
    } else {
      const denyMember = guardCompositionWrite(scope, parent.composition_id);
      if (denyMember) return NextResponse.json({ error: denyMember }, { status: 403 });
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
