import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';
import { generateBosCallLetterPdf } from '@/lib/pdf/bos-meeting-notice';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { bosCallLetterFilename, bosMemberTypeLabel } from '@/types/bos';
import {
  resolveMeetingBodyType,
  resolveBosEmailTemplateForBody,
  meetingOrdinalWord,
} from '@/lib/services/bos-email-templates';
import {
  fetchBosLetterheadAssets,
  withLetterheadAssets,
} from '@/lib/utils/bos/letterhead-assets';
import {
  buildBosLetterRef,
  resolveBosCommitteeShortCode,
  resolveBosMemberSerials,
} from '@/lib/utils/bos/call-letter-ref';

// "1" → "1st" — matches the notify-members {{meeting_ordinal}} placeholder.
function ordinalSuffix(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 1) return '';
  const r100 = n % 100, r10 = n % 10;
  const s = r100 >= 11 && r100 <= 13 ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return `${n}${s}`;
}

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
        'id, composition_id, institutions_id, status, meeting_type, meeting_title, meeting_number, academic_year, scheduled_date, scheduled_time, venue, agenda_text, board_id, board_type, committee_id'
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
      .select('id, display_name, email, display_designation, display_department, display_institution, address, contact_no, member_type, expert_id, member_type_rec:bos_member_types ( name )')
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
    // Static per-institution branding, overlaid with the seal + signature the
    // institution uploaded at /bos/email-settings (bos_letterhead_assets).
    const instHeader = withLetterheadAssets(
      getInstitutionHeader(instRow?.name ?? null),
      await fetchBosLetterheadAssets(meeting.institutions_id),
    );

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
    // Multi-board: a composition may govern several boards. The call letter
    // mentions the PRIMARY board — resolve it from the junction (is_primary),
    // falling back to the meeting's denormalized board_id.
    let primaryBoardId = (meeting.board_id as string | null) ?? null;
    if (meeting.composition_id) {
      const { data: pb } = await supabase
        .from('bos_composition_boards')
        .select('board_id')
        .eq('composition_id', meeting.composition_id)
        .eq('is_primary', true)
        .maybeSingle();
      const pbId = (pb as { board_id?: string } | null)?.board_id;
      if (pbId) primaryBoardId = pbId;
    }

    const { fetchCoeBoardMap } = await import('@/lib/utils/bos/coe-boards');
    const coeBoardMap = meeting.institutions_id
      ? await fetchCoeBoardMap(meeting.institutions_id)
      : new Map<string, { board_name: string; board_type?: string | null }>();
    const coeBoard = primaryBoardId ? coeBoardMap.get(primaryBoardId) : undefined;

    let rawBoardName = coeBoard?.board_name ?? '';
    if (!rawBoardName && primaryBoardId) {
      const { data: boardRow } = await supabase
        .from('bos_boards')
        .select('board_name')
        .eq('id', primaryBoardId)
        .maybeSingle();
      rawBoardName = (boardRow as { board_name?: string } | null)?.board_name ?? '';
    }
    const boardName = rawBoardName.replace(/^\s*Board of Studies\s*-\s*/i, '').trim();

    const boardType =
      (meeting as { board_type?: string | null }).board_type ??
      coeBoard?.board_type ??
      null;

    // Resolve the per-committee format (body-type → dated template), same as
    // notify-members, so the preview matches exactly what will be sent —
    // including the CET call-letter overrides.
    const memberRole =
      (member.member_type_rec as { name?: string } | null)?.name ??
      bosMemberTypeLabel(member.member_type);
    const boardCode =
      (coeBoard as { board_code?: string | null } | undefined)?.board_code ?? null;

    const bodyTypeCode = await resolveMeetingBodyType(supabase, meeting);

    // ── Reference number ────────────────────────────────────────────────────
    // JKKNCET/BoS/ECE/2026-2027/01 — the trailing serial is THIS recipient's
    // rank in the meeting's roster (chairman 01, then members in member-type
    // catalog order), so every letter of a meeting carries a distinct ref.
    const [committeeShortCode, memberSerials] = await Promise.all([
      resolveBosCommitteeShortCode(supabase, {
        committeeId: (meeting as { committee_id?: string | null }).committee_id ?? null,
        bodyTypeCode,
      }),
      resolveBosMemberSerials(supabase, {
        compositionId: meeting.composition_id,
        committeeId: (meeting as { committee_id?: string | null }).committee_id ?? null,
      }),
    ]);
    const refNo = buildBosLetterRef({
      prefix: instHeader.ref_prefix ?? 'JKKNCET',
      committeeCode: committeeShortCode,
      boardCode: boardCode || boardName,
      academicYear: meeting.academic_year,
      serial: memberSerials.get(member.id) ?? null,
    });

    const template = await resolveBosEmailTemplateForBody(supabase, {
      templateCode: 'meeting_invitation',
      institutionsId: meeting.institutions_id,
      bodyTypeCode,
      onDate: meeting.scheduled_date ?? null,
    });

    const values: Record<string, string> = {
      member_name: member.display_name,
      member_designation: member.display_designation ?? '',
      member_role: memberRole,
      meeting_title: meeting.meeting_title ?? 'Board of Studies Meeting',
      meeting_date: meeting.scheduled_date
        ? format(new Date(meeting.scheduled_date), 'EEEE, dd MMMM yyyy')
        : 'TBA',
      meeting_time: meeting.scheduled_time ?? '',
      meeting_venue: meeting.venue ?? '',
      venue: meeting.venue?.trim() || 'department',
      academic_year: meeting.academic_year ?? '',
      institution_name: instRow?.name ?? '',
      board_name: boardName,
      board_type: boardType ?? '',
      meeting_number:
        (meeting as { meeting_number?: number | null }).meeting_number != null
          ? String((meeting as { meeting_number?: number | null }).meeting_number)
          : '',
      meeting_ordinal: ordinalSuffix(
        (meeting as { meeting_number?: number | null }).meeting_number,
      ),
      // Spelled-out form ("First") — matches the call letter's "Sub:" line and
      // the invitation email. Must stay in sync with notify-members.
      meeting_ordinal_word: meetingOrdinalWord(
        (meeting as { meeting_number?: number | null }).meeting_number,
      ),
    };
    const fillTokens = (s: string | null | undefined): string =>
      (s ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => {
        const v = values[k];
        return v == null || v === '' ? `{{${k}}}` : String(v);
      });
    const pdfBodyFormat = template
      ? {
          pdf_heading: fillTokens(template.pdf_heading),
          pdf_intro_html: fillTokens(template.pdf_intro_html),
          pdf_closing_html: fillTokens(template.pdf_closing_html),
          signoff_html: fillTokens(template.signoff_html),
        }
      : null;

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
        email: (member as { email?: string | null }).email ?? null,
        is_external: !!(member as { expert_id?: string | null }).expert_id,
      },
      boardName,
      boardType,
      boardCode,
      memberRole,
      refNo,
      header: instHeader,
      bodyFormat: pdfBodyFormat,
    });

    const filename = bosCallLetterFilename(
      (meeting as { meeting_type?: string | null }).meeting_type,
      member.display_name,
    );

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
