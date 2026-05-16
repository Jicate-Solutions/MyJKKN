import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BosMeetingStatus, BosMeetingType, CreateBosMeetingDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  compositionScopeFilter,
  guardInstitutionWrite,
  guardCompositionChairman,
} from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/meetings ─────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const scopeFilter = compositionScopeFilter(scope);

    // No BoS access at all → return empty list without hitting the DB.
    if (scopeFilter.kind === 'none') {
      return NextResponse.json({
        data: [],
        metadata: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
    }

    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId') ?? undefined;
    const compositionId = searchParams.get('compositionId') ?? undefined;
    const academicYear = searchParams.get('academicYear') ?? undefined;
    const status = searchParams.get('status') as BosMeetingStatus | null ?? undefined;
    const meetingType = searchParams.get('meetingType') as BosMeetingType | null ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const withMembers = searchParams.get('withMembers') === 'true';
    const page = searchParams.has('page') ? parseInt(searchParams.get('page')!) : 1;
    const limit = Math.min(
      searchParams.has('limit') ? parseInt(searchParams.get('limit')!) : 20,
      100
    );
    const offset = (page - 1) * limit;
    const sortBy = searchParams.get('sortBy') ?? 'scheduled_date';
    const sortOrder = searchParams.get('sortOrder') ?? 'desc';

    // withMembers=true: prefer meetings whose composition has active members.
    // Falls back to all meetings if none found (soft filter — doesn't block new setups).
    let memberCompositionIds: string[] | undefined;
    if (withMembers) {
      const { data: memberRows } = await supabase
        .from('bos_members')
        .select('composition_id')
        .eq('is_active', true);
      const ids = [...new Set((memberRows ?? []).map((m: any) => m.composition_id).filter(Boolean))];
      if (ids.length > 0) memberCompositionIds = ids;
      // If ids.length === 0, fall through and show all meetings for the institution.
    }

    let query = supabase
      .from('bos_meetings')
      .select(
        `*,
        bos_compositions ( composition_title, academic_year ),
        agenda_count:bos_agenda_items(count),
        attendee_count:bos_meeting_attendees(count)`,
        { count: 'exact' }
      );

    // Institution scope — CAS-aware: include both Aided + Self-Financing UUIDs.
    if (scope.isSuperAdmin) {
      const institutionsId = searchParams.get('institutionsId') ?? undefined;
      if (institutionsId) query = query.eq('institutions_id', institutionsId);
    } else if (scope.allInstitutionIds.length > 1) {
      query = query.in('institutions_id', scope.allInstitutionIds);
    } else if (scope.institutionsId) {
      query = query.eq('institutions_id', scope.institutionsId);
    }

    // Board-membership scope (layered on the institution scope above).
    //  - 'all'           : super-admin — no filter
    //  - 'byInstitution' : principal — already covered by the institution clause above
    //  - 'byComposition' : member/chairman — restrict by composition_id
    if (scopeFilter.kind === 'byComposition') {
      query = query.in('composition_id', scopeFilter.ids);
    }

    if (boardId) query = query.eq('board_id', boardId);
    if (compositionId) query = query.eq('composition_id', compositionId);
    if (academicYear) query = query.eq('academic_year', academicYear);
    if (status) query = query.eq('status', status);
    if (meetingType) query = query.eq('meeting_type', meetingType);
    if (search) query = query.ilike('meeting_title', `%${search}%`);
    if (memberCompositionIds) query = query.in('composition_id', memberCompositionIds);

    query = query
      .order(sortBy, { ascending: sortOrder !== 'desc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      agenda_count: row.agenda_count?.[0]?.count ?? 0,
      attendee_count: row.attendee_count?.[0]?.count ?? 0,
    }));

    return NextResponse.json({
      data: normalized,
      metadata: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error('[bos/meetings] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 });
  }
}

// ── POST /api/bos/meetings ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const body: CreateBosMeetingDto = await request.json();

    if (!body.institutions_id || !body.board_id || !body.composition_id) {
      return NextResponse.json(
        { error: 'institutions_id, board_id, and composition_id are required' },
        { status: 400 }
      );
    }

    // Institution backstop (CAS-aware) + chairman-only gate.
    // Only the board chairman of the composition can schedule a meeting.
    // Principals are read-only; regular members cannot create meetings.
    const denyInst = guardInstitutionWrite(scope, body.institutions_id);
    if (denyInst) return NextResponse.json({ error: denyInst }, { status: 403 });
    const denyComp = guardCompositionChairman(scope, body.composition_id);
    if (denyComp) return NextResponse.json({ error: denyComp }, { status: 403 });

    // Auto-assign meeting_number: count existing meetings for this board + academic_year + 1
    const { count: existingCount } = await supabase
      .from('bos_meetings')
      .select('id', { count: 'exact', head: true })
      .eq('board_id', body.board_id)
      .eq('academic_year', body.academic_year);

    const meetingNumber = (existingCount ?? 0) + 1;

    // Normalize empty strings → null for optional date/time fields
    const insertData = {
      ...body,
      meeting_number: meetingNumber,
      status: 'draft' as BosMeetingStatus,
      meeting_title:
        body.meeting_title ||
        `Meeting ${meetingNumber} of ${body.academic_year}`,
      scheduled_date: body.scheduled_date || null,
      scheduled_time: body.scheduled_time || null,
      actual_date: body.actual_date || null,
      actual_start_time: body.actual_start_time || null,
      actual_end_time: body.actual_end_time || null,
      ratified_date: body.ratified_date || null,
      venue: body.venue || null,
      notes: body.notes || null,
    };

    const { data, error } = await supabase
      .from('bos_meetings')
      .insert(insertData)
      .select(`*, bos_compositions ( composition_title )`)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/meetings] POST error:', error);
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 });
  }
}
