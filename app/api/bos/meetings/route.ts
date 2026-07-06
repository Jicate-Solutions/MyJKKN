import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { BosMeetingStatus, BosMeetingType, CreateBosMeetingDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  compositionScopeFilter,
  guardInstitutionWrite,
  guardCompositionChairman,
  guardAcademicCouncilWrite,
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

    // Service-role client for the meetings SELECT only. The bos_meetings RLS
    // policy gates rows on role_has_institution_access(institutions_id), which
    // does NOT understand the CAS Aided+SF sibling pairing — a SF principal
    // is denied rows whose institutions_id is the Aided UUID even though BoS
    // spec treats the pair as one logical institution. Route-level authz is
    // already enforced via resolveBosBoardScope + the explicit .in() filter
    // built below, so it's the source of truth for what this caller may see.
    // Same precedent as /api/bos/lookup/principals.
    const db = createServiceRoleClient();

    let query = db
      .from('bos_meetings')
      .select(
        `*,
        bos_compositions ( composition_title, academic_year ),
        agenda_count:bos_agenda_items(count),
        attendee_count:bos_meeting_attendees(count)`,
        { count: 'exact' }
      );

    // Institution scope — CAS-aware: include both Aided + Self-Financing UUIDs.
    // Super-admin filters by institution_code (= counselling_code); the
    // resolver returns the full myjkkn_institution_ids set so CAS pairs are
    // queried as one logical unit.
    if (scope.isSuperAdmin) {
      const institutionCode = searchParams.get('institutionCode') ?? undefined;
      if (institutionCode) {
        const { resolveInstitutionContextByCode } = await import(
          '@/lib/utils/institutions/institution-resolver'
        );
        const ctx = await resolveInstitutionContextByCode(institutionCode, supabase);
        const ids = ctx?.myjkkn_institution_ids ?? [];
        if (ids.length === 0) {
          // Unknown code → no matches, short-circuit.
          return NextResponse.json({
            data: [],
            metadata: { total: 0, page, limit, totalPages: 0 },
          });
        }
        query = query.in('institutions_id', ids);
      }
    } else if (scope.institutionsId) {
      // CAS sibling fan-out — principals (and any non-admin) of a CAS college
      // must see meetings created under EITHER sibling UUID (Aided + SF). The
      // COE-driven scope.allInstitutionIds is the authoritative path, but if
      // the COE mapping is fragmented (one entry per sibling rather than a
      // single merged entry) it returns only the caller's own UUID. So we
      // belt-and-suspender by also unioning Supabase counselling_code
      // siblings via the service-role client (the `institutions` table is
      // also RLS-gated by role_has_institution_access, so a user-context
      // query for siblings would return empty).
      const ids = new Set<string>(scope.allInstitutionIds);
      ids.add(scope.institutionsId);

      const { data: inst } = await db
        .from('institutions')
        .select('counselling_code')
        .eq('id', scope.institutionsId)
        .maybeSingle();

      if (inst?.counselling_code) {
        const { data: siblings } = await db
          .from('institutions')
          .select('id')
          .eq('counselling_code', inst.counselling_code)
          .eq('is_active', true);
        for (const s of siblings ?? []) ids.add((s as { id: string }).id);
      }

      query = query.in('institutions_id', Array.from(ids));
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
    // Academic Council meetings have their own list (/bos/academic-council).
    // When a caller asks for a specific meetingType we honour it (that's how the
    // AC list requests meetingType='academic_council'); otherwise we EXCLUDE AC
    // meetings so the Board of Studies meetings list isn't polluted by them.
    if (meetingType) query = query.eq('meeting_type', meetingType);
    else query = query.neq('meeting_type', 'academic_council');
    if (search) query = query.ilike('meeting_title', `%${search}%`);
    if (memberCompositionIds) query = query.in('composition_id', memberCompositionIds);

    query = query
      .order(sortBy, { ascending: sortOrder !== 'desc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // Board enrichment — mirrors /api/bos/compositions. bos_meetings only stores
    // board_id (a COE UUID); the board name/code comes from the COE /api/public/boards
    // endpoint, keyed by institution_code resolved from the meeting's institutions_id.
    const institutionIdsInPage = [...new Set((data ?? []).map((r: any) => r.institutions_id).filter(Boolean))];
    const { fetchCoeBoardMaps } = await import('@/lib/utils/bos/coe-boards');
    const coeBoardMap = await fetchCoeBoardMaps(institutionIdsInPage);
    const boardMap: Record<string, { board_code: string; board_name: string; board_type?: string | null }> = {};
    for (const [id, b] of coeBoardMap) {
      boardMap[id] = { board_code: b.board_code, board_name: b.board_name, board_type: b.board_type };
    }

    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      agenda_count: row.agenda_count?.[0]?.count ?? 0,
      attendee_count: row.attendee_count?.[0]?.count ?? 0,
      board: boardMap[row.board_id] ?? null,
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

    if (!body.institutions_id || !body.composition_id) {
      return NextResponse.json(
        { error: 'institutions_id and composition_id are required' },
        { status: 400 }
      );
    }

    // Fetch the parent composition ONCE — its is_academic_council flag decides
    // both the authorization branch and whether a board is required, and its
    // board_type is denormalized onto the meeting (avoids a second query later).
    const { data: parentComp } = await supabase
      .from('bos_compositions')
      .select('board_type, is_academic_council')
      .eq('id', body.composition_id)
      .maybeSingle();
    const isAcMeeting =
      (parentComp as { is_academic_council?: boolean } | null)?.is_academic_council === true;
    const parentBoardType =
      (parentComp as { board_type?: string | null } | null)?.board_type ?? null;

    // A BoS meeting requires a board; an Academic Council meeting has none.
    if (!isAcMeeting && !body.board_id) {
      return NextResponse.json(
        { error: 'board_id is required for a Board of Studies meeting' },
        { status: 400 }
      );
    }

    // Institution backstop (CAS-aware) + convener gate. For a BoS meeting only
    // the board chairman may schedule (principals are read-only). For an
    // Academic Council meeting the PRINCIPAL is the convener — see
    // guardAcademicCouncilWrite (the deliberate inverse of the chairman gate).
    const denyInst = guardInstitutionWrite(scope, body.institutions_id);
    if (denyInst) return NextResponse.json({ error: denyInst }, { status: 403 });
    if (isAcMeeting) {
      const denyAc = guardAcademicCouncilWrite(scope, body.institutions_id);
      if (denyAc) return NextResponse.json({ error: denyAc }, { status: 403 });
    } else {
      const denyComp = guardCompositionChairman(scope, body.composition_id);
      if (denyComp) return NextResponse.json({ error: denyComp }, { status: 403 });
    }

    // Resolve meeting_number — per-composition sequence.
    //
    // 1. If the client supplied a number (chairman manually entered it because
    //    earlier meetings were conducted outside the system), validate it's a
    //    positive integer and ensure it's not already used in this composition.
    // 2. Otherwise auto-assign as max(meeting_number)+1 for the composition.
    //
    // The DB also has UNIQUE(board_id, academic_year, meeting_number) as a
    // safety net, but we surface a friendly 409 here before the insert fires.
    const clientNumberRaw = (body as any).meeting_number;
    let meetingNumber: number;

    if (clientNumberRaw !== undefined && clientNumberRaw !== null && clientNumberRaw !== '') {
      const parsed = Number(clientNumberRaw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: 'meeting_number must be a positive integer', field: 'meeting_number' },
          { status: 400 }
        );
      }
      meetingNumber = parsed;
    } else {
      const { data: existingRows, error: countErr } = await supabase
        .from('bos_meetings')
        .select('meeting_number')
        .eq('composition_id', body.composition_id);
      if (countErr) throw countErr;
      const highest = (existingRows ?? [])
        .map((r: any) => Number(r.meeting_number))
        .filter((n) => Number.isFinite(n))
        .reduce((max, n) => (n > max ? n : max), 0);
      meetingNumber = highest + 1;
    }

    // Duplicate guard — composition + meeting_number must be unique.
    const { data: dupRow } = await supabase
      .from('bos_meetings')
      .select('id')
      .eq('composition_id', body.composition_id)
      .eq('meeting_number', meetingNumber)
      .maybeSingle();
    if (dupRow) {
      return NextResponse.json(
        {
          error: `Meeting ${meetingNumber} already exists for this composition.`,
          field: 'meeting_number',
        },
        { status: 409 }
      );
    }

    // board_type was resolved from the parent composition above (denormalized at
    // composition-create time, see 20260521 migration) — reused here to avoid a
    // second query. For AC bodies it is 'academic_council'.

    // Normalize empty strings → null for optional date/time fields.
    // For an AC meeting force board_id null and meeting_type 'academic_council'
    // regardless of what the client sent, so the row is unambiguously an AC row.
    const insertData = {
      ...body,
      board_id: isAcMeeting ? null : body.board_id,
      meeting_type: isAcMeeting ? ('academic_council' as BosMeetingType) : body.meeting_type,
      meeting_number: meetingNumber,
      status: 'draft' as BosMeetingStatus,
      board_type: parentBoardType,
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

    if (error) {
      // Race-condition fallback: someone else booked the same number between
      // our pre-check and the insert. The DB's UNIQUE constraint catches it.
      if ((error as any).code === '23505') {
        return NextResponse.json(
          {
            error: `Meeting ${meetingNumber} already exists for this composition.`,
            field: 'meeting_number',
          },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/meetings] POST error:', error);
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 });
  }
}
