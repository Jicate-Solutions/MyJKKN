import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  compositionScopeFilter,
  guardInstitutionWrite,
  guardCompositionWrite,
} from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/ta-da?meetingId= ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const scopeFilter = compositionScopeFilter(scope);

    // No BoS access at all → empty list (no DB hit).
    if (scopeFilter.kind === 'none') {
      return NextResponse.json([]);
    }

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const institutionsId = scope.isSuperAdmin
      ? searchParams.get('institutionsId')
      : scope.institutionsId;
    const claimStatus = searchParams.get('claimStatus');

    // For board-member scope we need an inner join against bos_meetings to
    // filter by the claim's parent composition_id. For all other scopes the
    // select keeps the existing flat shape — bos_meetings stays as embed
    // metadata that is omitted from the API response below.
    const selectClause = scopeFilter.kind === 'byComposition'
      ? `
        *,
        bos_meetings!inner ( composition_id ),
        member:bos_members (
          id, display_name, display_designation, member_type,
          contact_no, email, staff_id,
          staff:staff ( id, phone )
        ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no )
      `
      : `
        *,
        member:bos_members (
          id, display_name, display_designation, member_type,
          contact_no, email, staff_id,
          staff:staff ( id, phone )
        ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no )
      `;

    let query = supabase
      .from('bos_ta_da_claims')
      .select(selectClause)
      .order('created_at', { ascending: false });

    if (meetingId) query = query.eq('meeting_id', meetingId);
    if (institutionsId) query = query.eq('institutions_id', institutionsId);
    if (claimStatus) query = query.eq('claim_status', claimStatus);

    // Board-membership scope.
    //  - 'all'           : super-admin — no filter
    //  - 'byInstitution' : principal — already covered by institutionsId clause
    //  - 'byComposition' : member/chairman — join filter on parent meeting
    if (scopeFilter.kind === 'byComposition') {
      query = query.in('bos_meetings.composition_id', scopeFilter.ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Strip the bos_meetings embed used purely as a join-filter — the client
    // contract didn't include it before, and shape parity matters here.
    const normalized = (data ?? []).map((row: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { bos_meetings: _join, ...rest } = row;
      return rest;
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('[bos/ta-da] GET error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch TA/DA claims';
    return NextResponse.json({ error: msg }, { status: 500 });
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

    const scope = await resolveBosBoardScope(user.id);
    const body = await request.json();

    if (!body.meeting_id || !body.member_id || !body.institutions_id) {
      return NextResponse.json(
        { error: 'meeting_id, member_id, and institutions_id are required' },
        { status: 400 }
      );
    }

    const denyInst = guardInstitutionWrite(scope, body.institutions_id);
    if (denyInst) return NextResponse.json({ error: denyInst }, { status: 403 });

    // Composition gate: claim is bound to a meeting; user must be a member of
    // the meeting's composition. Resolve composition_id from meeting_id.
    const { data: parentMeeting } = await supabase
      .from('bos_meetings')
      .select('composition_id')
      .eq('id', body.meeting_id)
      .maybeSingle();
    const parentCompositionId = (parentMeeting as { composition_id?: string | null } | null)?.composition_id ?? null;
    if (!parentCompositionId) {
      return NextResponse.json({ error: 'Parent meeting not found' }, { status: 404 });
    }
    const denyComp = guardCompositionWrite(scope, parentCompositionId);
    if (denyComp) return NextResponse.json({ error: denyComp }, { status: 403 });

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
        member:bos_members (
          id, display_name, display_designation, member_type,
          contact_no, email, staff_id,
          staff:staff ( id, phone )
        ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no )
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/ta-da] POST error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create TA/DA claim';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
