import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/ta-da?meetingId= ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const institutionsId = scope.isSuperAdmin
      ? searchParams.get('institutionsId')
      : scope.institutionsId;
    const claimStatus = searchParams.get('claimStatus');

    let query = supabase
      .from('bos_ta_da_claims')
      .select(`
        *,
        member:bos_members ( id, display_name, display_designation, member_type ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email )
      `)
      .order('created_at', { ascending: false });

    if (meetingId) query = query.eq('meeting_id', meetingId);
    if (institutionsId) query = query.eq('institutions_id', institutionsId);
    if (claimStatus) query = query.eq('claim_status', claimStatus);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/ta-da] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch TA/DA claims' }, { status: 500 });
  }
}

// ── POST /api/bos/ta-da ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body = await request.json();

    if (!body.meeting_id || !body.member_id || !body.expert_id || !body.institutions_id) {
      return NextResponse.json(
        { error: 'meeting_id, member_id, expert_id, and institutions_id are required' },
        { status: 400 }
      );
    }

    const deny = guardInstitutionWrite(scope, body.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const { data, error } = await supabase
      .from('bos_ta_da_claims')
      .insert({
        ...body,
        claim_status: body.claim_status ?? 'draft',
        travel_amount: body.travel_amount ?? 0,
        da_days: body.da_days ?? 1,
        da_rate: body.da_rate ?? 0,
        da_amount: body.da_amount ?? 0,
        other_amount: body.other_amount ?? 0,
        payment_date: body.payment_date || null,
      })
      .select(`
        *,
        member:bos_members ( id, display_name, display_designation, member_type ),
        expert:bos_external_experts ( id, name, title, designation, institution_name )
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/ta-da] POST error:', error);
    return NextResponse.json({ error: 'Failed to create TA/DA claim' }, { status: 500 });
  }
}
