import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CreateBosMemberDto } from '@/types/bos';

// ── GET /api/bos/members?compositionId= ──────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const compositionId = searchParams.get('compositionId');

    if (!compositionId) {
      return NextResponse.json({ error: 'compositionId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bos_members')
      .select(`*, expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no, category )`)
      .eq('composition_id', compositionId)
      .order('sort_order', { ascending: true })
      .order('member_type', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/members] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}

// ── POST /api/bos/members ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateBosMemberDto = await request.json();

    if (!body.composition_id || !body.member_type || !body.display_name) {
      return NextResponse.json(
        { error: 'composition_id, member_type, and display_name are required' },
        { status: 400 }
      );
    }

    // Enforce the source check: exactly one of staff_id or expert_id must be set
    if (body.staff_id && body.expert_id) {
      return NextResponse.json(
        { error: 'A member cannot have both staff_id and expert_id. Set only one.' },
        { status: 400 }
      );
    }

    // Auto-assign sort_order: count existing members + 1
    const { count } = await supabase
      .from('bos_members')
      .select('id', { count: 'exact', head: true })
      .eq('composition_id', body.composition_id);

    const insertData = {
      ...body,
      sort_order: body.sort_order ?? (count ?? 0) + 1,
      is_active: body.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('bos_members')
      .insert(insertData)
      .select(`*, expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no, category )`)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/members] POST error:', error);
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}
