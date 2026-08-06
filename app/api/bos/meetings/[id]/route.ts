import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { UpdateBosMeetingDto, isCouncilMeetingType } from '@/types/bos';
import {
  resolveBosBoardScope,
  guardCompositionWrite,
  guardAcademicCouncilWrite,
  guardGoverningBodyWrite,
} from '@/lib/utils/bos/bos-access';

// Service-role helper: expand the caller's primary institution to the full CAS
// sibling set via Supabase counselling_code self-join. Mirrors the pattern in
// /api/bos/meetings list route — the BoS spec treats CAS Aided+SF as one
// logical institution, but `role_has_institution_access()` (used by RLS and
// some guards) doesn't know that. We materialise the sibling closure here
// so route-level authz can do the right thing.
async function casExpandedIds(
  db: ReturnType<typeof createServiceRoleClient>,
  primaryInstitutionId: string | null | undefined,
  seedIds: readonly string[]
): Promise<string[]> {
  const out = new Set<string>(seedIds);
  if (primaryInstitutionId) out.add(primaryInstitutionId);
  if (!primaryInstitutionId) return Array.from(out);

  const { data: inst } = await db
    .from('institutions')
    .select('counselling_code')
    .eq('id', primaryInstitutionId)
    .maybeSingle();

  if (inst?.counselling_code) {
    const { data: siblings } = await db
      .from('institutions')
      .select('id')
      .eq('counselling_code', inst.counselling_code)
      .eq('is_active', true);
    for (const s of siblings ?? []) out.add((s as { id: string }).id);
  }
  return Array.from(out);
}

// ── GET /api/bos/meetings/[id] ────────────────────────────────────────────────
// Today's GET relies on RLS for authorization. Once we use service-role to
// bypass the non-CAS-aware RLS, we MUST add explicit route-level authz:
//   - super-admin → allow
//   - principal of (CAS-expanded) institution → allow
//   - board member of the composition → allow
//   - else → 404 (same shape RLS returned, don't leak existence)
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
    const db = createServiceRoleClient();

    const { data, error } = await db
      .from('bos_meetings')
      .select(`
        *,
        bos_compositions (
          id,
          composition_title,
          academic_year,
          bos_members (
            id,
            member_type,
            display_name,
            display_designation,
            display_institution,
            email,
            contact_no,
            is_active,
            sort_order,
            expert_id
          )
        ),
        committee:bos_committees ( id, name ),
        principal_approved_by_staff:staff!bos_meetings_principal_approved_by_fkey (
          id,
          profile_id,
          first_name,
          last_name,
          designation
        ),
        agenda_items_agg:bos_agenda_items(count),
        attendees_agg:bos_meeting_attendees(count)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
      }
      throw error;
    }

    // PostgREST returns embedded counts as `[{ count: N }]`. Flatten into the
    // `agenda_item_count` / `attendee_count` scalar fields that the UI and
    // workflow gates read. Without this the detail page's agenda tab badge AND
    // the "≥1 agenda item before Principal Approval" client guard both see
    // undefined and silently miscount.
    type CountRow = { count: number };
    const meetingWithAgg = data as typeof data & {
      agenda_items_agg?: CountRow[] | null;
      attendees_agg?: CountRow[] | null;
    };
    // Board enrichment — mirrors what /api/bos/meetings (list) already does.
    // bos_meetings only stores board_id (a COE UUID); board_name/board_code/
    // board_type live in the COE DB, reached via the cross-DB resolver keyed
    // by the meeting's institutions_id (counselling_code = institution_code
    // bridge). Without this, the detail page sees `meeting.board = undefined`,
    // breaks the documents-tab board-name lookup, and the Minutes/Attendance
    // PDF heading degrades to just "<BOARD_TYPE> ATTENDANCE SHEET" with no
    // board name.
    const meetingRowForBoard = data as { board_id: string | null; institutions_id: string | null };
    let board: { board_code: string; board_name: string; board_type?: string | null } | null = null;
    if (meetingRowForBoard.board_id && meetingRowForBoard.institutions_id) {
      const { fetchCoeBoardMaps } = await import('@/lib/utils/bos/coe-boards');
      const boardMap = await fetchCoeBoardMaps([meetingRowForBoard.institutions_id]);
      const b = boardMap.get(meetingRowForBoard.board_id);
      if (b) board = { board_code: b.board_code, board_name: b.board_name, board_type: b.board_type };
    }

    // Roster order: PostgREST returns an embedded to-many in no guaranteed
    // order, so the meeting's Members / Attendance tabs listed people
    // arbitrarily while the notice PDF (which orders by sort_order) listed them
    // by roster rank. Sorted here so both agree. Ties fall back to name.
    const compForOrder = (data as unknown as {
      bos_compositions?: {
        bos_members?: { sort_order?: number | null; display_name?: string | null }[];
      } | null;
    }).bos_compositions;
    if (compForOrder?.bos_members) {
      compForOrder.bos_members.sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          (a.display_name ?? '').localeCompare(b.display_name ?? '')
      );
    }

    const flattened = {
      ...data,
      agenda_item_count: meetingWithAgg.agenda_items_agg?.[0]?.count ?? 0,
      attendee_count: meetingWithAgg.attendees_agg?.[0]?.count ?? 0,
      board,
    };
    delete (flattened as Record<string, unknown>).agenda_items_agg;
    delete (flattened as Record<string, unknown>).attendees_agg;

    // Authz — replicates what RLS would have done, but with CAS sibling
    // awareness so a SF principal can view Aided meetings (and vice versa).
    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      const meetingRow = data as { institutions_id: string | null; composition_id: string | null };
      const allowedInstitutions = await casExpandedIds(
        db,
        scope.institutionsId,
        scope.allInstitutionIds
      );

      const institutionOk =
        !meetingRow.institutions_id ||
        allowedInstitutions.includes(meetingRow.institutions_id);
      const compositionOk =
        scope.isPrincipal ||
        (meetingRow.composition_id ? scope.memberOf.has(meetingRow.composition_id) : false);

      if (!institutionOk || !compositionOk) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
      }
    }

    return NextResponse.json(flattened);
  } catch (error) {
    console.error('[bos/meetings/:id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch meeting' }, { status: 500 });
  }
}

// ── PUT /api/bos/meetings/[id] ────────────────────────────────────────────────
// Field-edit on a meeting. Principals remain read-only on board data
// (guardCompositionWrite denies them). The CAS issue here is that RLS UPDATE
// was the only authz path, and it's not CAS-aware — so a CAS-sibling board
// member couldn't edit their own meeting. We move authz into the route and
// use service-role for the update itself.
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
    const body: UpdateBosMeetingDto = await request.json();
    const db = createServiceRoleClient();

    // Look up the meeting (service-role) so RLS doesn't 404 a legit CAS row.
    const { data: meeting, error: fetchError } = await db
      .from('bos_meetings')
      .select('institutions_id, composition_id, status, meeting_type')
      .eq('id', id)
      .single();

    if (fetchError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }
    const meetingRow = meeting as {
      institutions_id: string | null
      composition_id: string | null
      status: string
      meeting_type: string | null
    };

    const scope = await resolveBosBoardScope(user.id);

    // Authz. For a BoS meeting the editor must be a board member of the
    // composition (guardCompositionWrite denies principals/non-members). For a
    // council meeting (Academic Council / Governing Body) the principal is the
    // convener and owns the record, so authorize via the council write-gate.
    if (isCouncilMeetingType(meetingRow.meeting_type)) {
      const denyCouncil = meetingRow.meeting_type === 'governing_body'
        ? guardGoverningBodyWrite(scope, meetingRow.institutions_id)
        : guardAcademicCouncilWrite(scope, meetingRow.institutions_id);
      if (denyCouncil) return NextResponse.json({ error: denyCouncil }, { status: 403 });
    } else {
      const denyComp = guardCompositionWrite(scope, meetingRow.composition_id);
      if (denyComp) return NextResponse.json({ error: denyComp }, { status: 403 });
    }

    // Institution sanity check — defence-in-depth; should always pass for a
    // legitimate member (composition.institutions_id is in their CAS-expanded
    // scope), but reject anything that smells off.
    if (!scope.isSuperAdmin && meetingRow.institutions_id) {
      const allowedInstitutions = await casExpandedIds(
        db,
        scope.institutionsId,
        scope.allInstitutionIds
      );
      if (!allowedInstitutions.includes(meetingRow.institutions_id)) {
        return NextResponse.json(
          { error: 'Forbidden: meeting institution is outside your scope' },
          { status: 403 }
        );
      }
    }

    // Only allow date/venue/time updates on draft meetings. Once scheduled or
    // later, these are immutable (set manually by admin). Minutes and other
    // content can still be updated.
    const isDraft = meetingRow.status === 'draft';
    const payload = {
      ...body,
      // Only update these fields if meeting is draft, otherwise preserve existing values
      scheduled_date: isDraft ? (body.scheduled_date || null) : undefined,
      scheduled_time: isDraft ? (body.scheduled_time || null) : undefined,
      actual_date: isDraft ? (body.actual_date || null) : undefined,
      actual_start_time: isDraft ? (body.actual_start_time || null) : undefined,
      actual_end_time: isDraft ? (body.actual_end_time || null) : undefined,
      ratified_date: isDraft ? (body.ratified_date || null) : undefined,
      venue: isDraft ? (body.venue || null) : undefined,
      // Convening council/committee — '' (cleared form field) → null; left
      // undefined (and stripped below) when the client didn't send the field,
      // so partial updates never wipe an existing attribution.
      committee_id:
        body.committee_id === undefined ? undefined : body.committee_id || null,
      notes: body.notes ? body.notes : null,
      updated_at: new Date().toISOString(),
    };

    // Remove undefined keys so they don't overwrite existing values
    Object.keys(payload).forEach((key) => {
      if (payload[key as keyof typeof payload] === undefined) {
        delete payload[key as keyof typeof payload];
      }
    });

    const { data, error } = await db
      .from('bos_meetings')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/meetings/:id] PUT error:', error);
    // Surface the real Postgres/Supabase error message to the client. The old
    // opaque "Failed to update meeting" string hid problems like missing
    // columns, schema drift, RLS denies, etc. — turning every backend failure
    // into a generic 500 that the UI couldn't help the user act on. Now the
    // client sees the actual cause (e.g. "column minutes_content does not
    // exist" → run the migration). Stack traces and structured details stay
    // server-side; only the human-readable message is forwarded.
    const message =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: string })?.message === 'string'
          ? (error as { message: string }).message
          : 'Failed to update meeting';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE /api/bos/meetings/[id] ─────────────────────────────────────────────
// Only the chairman can delete, and only draft meetings. Same CAS treatment.
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
    const db = createServiceRoleClient();

    const { data: meeting } = await db
      .from('bos_meetings')
      .select('status, institutions_id, composition_id')
      .eq('id', id)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    if (meeting.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft meetings can be deleted.' },
        { status: 409 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      const meetingRow = meeting as { institutions_id: string | null; composition_id: string | null };
      const allowedInstitutions = await casExpandedIds(
        db,
        scope.institutionsId,
        scope.allInstitutionIds
      );
      const institutionOk =
        !meetingRow.institutions_id ||
        allowedInstitutions.includes(meetingRow.institutions_id);
      const isChairman =
        meetingRow.composition_id != null &&
        scope.isChairmanIn.has(meetingRow.composition_id);

      if (!institutionOk || !isChairman) {
        return NextResponse.json(
          { error: 'Forbidden: only the board chairman can delete a meeting' },
          { status: 403 }
        );
      }
    }

    const { error } = await db.from('bos_meetings').delete().eq('id', id);
    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/meetings/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 });
  }
}
