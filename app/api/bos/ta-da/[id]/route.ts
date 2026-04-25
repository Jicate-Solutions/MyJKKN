import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/ta-da/[id] ──────────────────────────────────────────────────
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
      .from('bos_ta_da_claims')
      .select(`
        *,
        member:bos_members ( id, display_name, display_designation, member_type ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/ta-da/:id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch claim' }, { status: 500 });
  }
}

// ── PUT /api/bos/ta-da/[id] ──────────────────────────────────────────────────
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

    // Never allow updating total_amount — it's a GENERATED column
    const { total_amount: _skip, ...updateData } = body;

    const { data, error } = await supabase
      .from('bos_ta_da_claims')
      .update({
        ...updateData,
        payment_date: updateData.payment_date || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        member:bos_members ( id, display_name, display_designation, member_type ),
        expert:bos_external_experts ( id, name, title, designation, institution_name )
      `)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/ta-da/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update claim' }, { status: 500 });
  }
}

// ── DELETE /api/bos/ta-da/[id] ───────────────────────────────────────────────
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
      .from('bos_ta_da_claims')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/ta-da/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete claim' }, { status: 500 });
  }
}
