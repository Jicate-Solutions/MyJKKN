import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';
import { generateBosCallLetterPdf } from '@/lib/pdf/bos-meeting-notice';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';

// Vercel runtime config — same reasoning as notify-members/route.ts. Puppeteer
// needs the Node runtime and well beyond the default 10s budget for cold-start
// + render. Single-PDF render usually finishes in 2-4s, so 30s is comfortable.
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// ── GET /api/bos/meetings/[id]/preview-pdf?memberId=<uuid> ──────────────────
// Returns the per-recipient BoS call-letter PDF for the given member. Same
// data + render path as notify-members, minus the SMTP send loop. Used by the
// Members tab's "Preview" column so the chairman can download what each member
// will receive before clicking "Send Invitation Email".
//
// Access:
//   • Super-admin: full
//   • Anyone in the meeting's composition: allowed (read-only download)
//   • Everyone else: 403
//
// We deliberately do NOT gate this on meeting status — the chairman should be
// able to preview the call letter at any time, including during preparation,
// to catch layout issues before the formal send.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;
    const memberId = request.nextUrl.searchParams.get('memberId');
    if (!memberId) {
      return NextResponse.json(
        { error: 'memberId query parameter is required' },
        { status: 400 }
      );
    }

    // Meeting + composition for the access guard. We pull the same columns
    // notify-members uses so the PDF render input matches exactly.
    const { data: meeting, error: meetingErr } = await supabase
      .from('bos_meetings')
      .select(
        'id, composition_id, institutions_id, status, meeting_title, meeting_number, academic_year, scheduled_date, scheduled_time, venue, agenda_text, board_id, board_type'
      )
      .eq('id', meetingId)
      .single();

    if (meetingErr || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Read-only access: super-admin OR a member of this composition can
    // preview. Chairman-only would be too strict — other board members may
    // want to verify their own copy.
    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin && !scope.memberOf.has(meeting.composition_id)) {
      return NextResponse.json(
        { error: 'You are not a member of this BoS composition' },
        { status: 403 }
      );
    }

    // Member row — restrict the lookup to this meeting's composition so a
    // tampered memberId from another composition can't be previewed.
    const { data: member, error: memberErr } = await supabase
      .from('bos_members')
      .select('id, display_name, display_designation, display_department, display_institution, address, contact_no, member_type')
      .eq('composition_id', meeting.composition_id)
      .eq('id', memberId)
      .eq('is_active', true)
      .single();

    // Distinguish "DB error" (e.g. missing column, RLS denial) from "no
    // matching row". A blanket 404 here was hiding schema-migration drift
    // — "column display_department does not exist" surfaced to clients as
    // "Member not found in this composition", which is misleading.
    if (memberErr) {
      console.error('[bos/meetings/preview-pdf] member lookup failed:', memberErr);
      return NextResponse.json(
        { error: 'Member lookup failed', details: memberErr.message ?? String(memberErr) },
        { status: 500 }
      );
    }
    if (!member) {
      return NextResponse.json({ error: 'Member not found in this composition' }, { status: 404 });
    }

    // Auxiliary data — same lookups notify-members performs.
    const [
      { data: instRow },
      { data: agendaItemsRaw },
    ] = await Promise.all([
      supabase
        .from('institutions')
        .select('name')
        .eq('id', meeting.institutions_id)
        .maybeSingle(),
      supabase
        .from('bos_agenda_items')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('sort_order', { ascending: true }),
    ]);

    const agendaItems = agendaItemsRaw ?? [];
    const instHeader = getInstitutionHeader(instRow?.name ?? null);

    // Resolve board metadata. COE is the authoritative source — bos_boards is
    // only a partial local seed (9 UUIDs from the 20260510 migration), so any
    // board added in COE after that will silently return null from bos_boards.
    // One COE round-trip here gives us both board_name and board_type.
    //
    // Fallbacks (cheapest to most expensive):
    //   1. meeting.board_type column (denormalized at create-time, 20260521 mig)
    //   2. COE /api/public/boards lookup (authoritative, always present)
    //   3. bos_boards local seed (only useful when COE is unreachable)
    //
    // The "Board of Studies - " prefix is stripped from whatever name source
    // wins, so the rendered subject doesn't duplicate the phrase.
    const { fetchCoeBoardMap } = await import('@/lib/utils/bos/coe-boards');
    const coeBoardMap = meeting.institutions_id
      ? await fetchCoeBoardMap(meeting.institutions_id)
      : new Map<string, { board_name: string; board_type?: string | null }>();
    const coeBoard = meeting.board_id ? coeBoardMap.get(meeting.board_id) : undefined;

    let rawBoardName = coeBoard?.board_name ?? '';
    if (!rawBoardName && meeting.board_id) {
      const { data: boardRow } = await supabase
        .from('bos_boards')
        .select('board_name')
        .eq('id', meeting.board_id)
        .maybeSingle();
      rawBoardName = (boardRow as { board_name?: string } | null)?.board_name ?? '';
    }
    const boardName = rawBoardName.replace(/^\s*Board of Studies\s*-\s*/i, '').trim();

    const boardType =
      (meeting as { board_type?: string | null }).board_type ??
      coeBoard?.board_type ??
      null;

    // Single render — no batch, so we go through generateBosCallLetterPdf
    // which opens + closes its own browser. For one PDF this is fine; the
    // overhead is just one cold-start versus the persistent renderer.
    const pdfBuffer = await generateBosCallLetterPdf({
      meeting: meeting as never,
      agendaItems: agendaItems as never,
      recipient: {
        display_name: member.display_name,
        display_designation: member.display_designation ?? null,
        display_department: member.display_department ?? null,
        display_institution: member.display_institution ?? null,
        address: member.address ?? null,
        contact_no: member.contact_no ?? null,
      },
      boardName,
      boardType,
      header: instHeader,
    });

    const safeName = member.display_name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const filename = `bos-call-letter-${safeName || 'member'}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[bos/meetings/preview-pdf] GET error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to render PDF' },
      { status: 500 }
    );
  }
}
