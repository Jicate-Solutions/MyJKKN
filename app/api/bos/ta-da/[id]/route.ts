import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  guardCompositionWrite,
} from '@/lib/utils/bos/bos-access';

// Resolve composition_id for a claim by joining through bos_meetings.
async function compositionIdForClaim(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claimId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('bos_ta_da_claims')
    .select('bos_meetings ( composition_id )')
    .eq('id', claimId)
    .maybeSingle();
  const meeting = (data as { bos_meetings?: { composition_id?: string | null } | null } | null)?.bos_meetings ?? null;
  return meeting?.composition_id ?? null;
}

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
        member:bos_members (
          id, display_name, display_designation, display_institution, member_type,
          contact_no, email, staff_id,
          staff:staff ( id, phone )
        ),
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

    const compositionId = await compositionIdForClaim(supabase, id);
    if (!compositionId) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }
    const scope = await resolveBosBoardScope(user.id);
    const deny = guardCompositionWrite(scope, compositionId);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

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
        member:bos_members (
          id, display_name, display_designation, display_institution, member_type,
          contact_no, email, staff_id,
          staff:staff ( id, phone )
        ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no )
      `)
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/ta-da/:id] PUT error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update claim';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/bos/ta-da/[id] is intentionally not exported.
// As of 2026-05-21 SOP redesign, claim deletion is auto-managed by the
// attendance route — when an attendee flips out of 'present' status, the
// orphan claim is cleaned up there (with a guardrail that preserves
// 'approved' / 'paid' claims to maintain payment audit trail).
