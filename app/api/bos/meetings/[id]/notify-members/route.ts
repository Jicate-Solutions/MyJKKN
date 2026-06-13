import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  guardCompositionChairman,
} from '@/lib/utils/bos/bos-access';
import { generateMeetingScheduledEmailHtml } from '@/lib/services/email-service';
import {
  resolveBosEmailTemplate,
  renderBosEmailTemplate,
} from '@/lib/services/bos-email-templates';
import {
  resolveBosSmtpConfig,
  sendBosEmail,
} from '@/lib/services/bos-email-sender';
import { openBosCallLetterRenderer } from '@/lib/pdf/bos-meeting-notice';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { BOS_MEMBER_TYPE_LABELS } from '@/types/bos';

// Vercel runtime config. Puppeteer + @sparticuz/chromium needs the Node
// runtime (Edge can't launch a subprocess) and well over the default 10s
// per-function budget — cold-start + N renders + N SMTP sends. 60s covers
// realistic BoS member counts (≤ 20). Pro plan honours up to 300s.
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// ── Validation ────────────────────────────────────────────────────────────────
// Mirrors the Zod-first pattern from SPEC-PE-EMAIL-CONFIG-001.

const notifyMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(100),
});

// ── POST /api/bos/meetings/[id]/notify-members ────────────────────────────────
// Queues a meeting-invitation email for each selected member via the existing
// /api/notifications/email infrastructure. Gated to:
//   • Chairman of the meeting's composition (or super-admin)
//   • Meeting status === 'expert_invited' (per workflow agreement)
//
// Members with no email address are silently skipped — the response includes
// counts so the UI can surface that.

export async function POST(
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
    const body = await request.json();

    const parsed = notifyMembersSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // Fetch meeting — need composition_id (for chairman guard) + status (for
    // workflow gate) + institutions_id (for the email-notifications row).
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

    // Status gate — only allowed once the chairman has moved the meeting to
    // expert_invited. Block early statuses (preparation phase) and late
    // statuses (post-meeting) so notice emails can't fire by accident.
    if (meeting.status !== 'expert_invited') {
      return NextResponse.json(
        {
          error: `Cannot send notices while meeting is in "${meeting.status}" status. Move the meeting to "Experts Invited" first.`,
        },
        { status: 422 }
      );
    }

    // Chairman-only (super-admin bypasses). Mirrors POST /api/bos/meetings.
    const scope = await resolveBosBoardScope(user.id);
    const deny = guardCompositionChairman(scope, meeting.composition_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // Fetch the selected members. Restrict the in-clause to this meeting's
    // composition so a tampered client can't slip in member IDs from a
    // different composition.
    const { data: members, error: membersErr } = await supabase
      .from('bos_members')
      .select('id, display_name, email, member_type, display_designation, display_department, display_institution, address, contact_no')
      .eq('composition_id', meeting.composition_id)
      .in('id', parsed.data.memberIds)
      .eq('is_active', true);

    if (membersErr) throw membersErr;
    if (!members || members.length === 0) {
      return NextResponse.json(
        { error: 'No active members matched the selected IDs' },
        { status: 404 }
      );
    }

    // Build the placeholder map once — same data for every recipient.
    const meetingTitle = meeting.meeting_title ?? 'Board of Studies Meeting';
    const meetingDate = meeting.scheduled_date
      ? format(new Date(meeting.scheduled_date), 'EEEE, dd MMMM yyyy')
      : 'TBA';
    const meetingTimeVenue = [
      meeting.scheduled_time && `at ${meeting.scheduled_time}`,
      meeting.venue && `· ${meeting.venue}`,
    ].filter(Boolean).join(' ');

    const meetingUrl = `${request.nextUrl.origin}/bos/meetings/${meetingId}`;

    // Resolve the active 'meeting_invitation' template — per-institution
    // override falls back to the global default seeded by 20260516.
    const template = await resolveBosEmailTemplate(
      supabase,
      'meeting_invitation',
      meeting.institutions_id,
    );

    // Look up the chairman name + institution name for placeholder values.
    // Also pull the meeting's agenda items so we can include them in both
    // the email template AND the attached PDF.
    const [
      { data: chairmanRow },
      { data: instRow },
      { data: agendaItemsRaw },
    ] = await Promise.all([
      supabase
        .from('bos_members')
        .select('display_name')
        .eq('composition_id', meeting.composition_id)
        .eq('member_type', 'chairman')
        .eq('is_active', true)
        .maybeSingle(),
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

    // Resolve the institution header config once — used by every PDF render
    // below. Pure mapping function (no I/O), safe to call hoisted.
    const instHeader = getInstitutionHeader(instRow?.name ?? null);

    // Fetch board metadata for the call-letter subject + body line
    // ("Meeting of the {board_type} {board_name} Board of Studies"). COE is
    // the authoritative source — bos_boards is only a partial local seed (9
    // UUIDs from the 20260510 migration), so newer boards return null from
    // it. One COE call per batch (not per recipient) gives us both
    // board_name and board_type.
    //
    // Fallbacks (cheapest to most expensive):
    //   1. meeting.board_type column (denormalized at create-time, 20260521 mig)
    //   2. COE /api/public/boards lookup (authoritative, always present)
    //   3. bos_boards local seed (only useful when COE is unreachable)
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

    // Members eligible for direct send vs. those skipped due to missing email.
    const withEmail = members.filter((m) => m.email && m.email.includes('@'));
    const withoutEmail = members.filter((m) => !m.email || !m.email.includes('@'));

    if (withEmail.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        skippedNoEmail: withoutEmail.length,
        message: 'No selected members have an email address on file.',
      });
    }

    // Resolve SMTP config for this meeting's institution. Without it we
    // cannot send — fail fast with a 400 so the admin knows to configure
    // SMTP first instead of seeing per-recipient failures.
    const smtpConfig = await resolveBosSmtpConfig(supabase, meeting.institutions_id);
    if (!smtpConfig) {
      return NextResponse.json(
        {
          error:
            'No active SMTP configuration found for this institution. ' +
            'Configure SMTP at /bos/email-settings → SMTP Server tab before sending invitations.',
        },
        { status: 400 }
      );
    }

    // Open ONE Puppeteer browser for this batch so the per-recipient PDF
    // renders share warm pages instead of cold-starting each time. Falls
    // back to attaching no PDF if the browser fails to launch (HTML body
    // still goes out so the user gets *something*).
    let pdfRenderer: Awaited<ReturnType<typeof openBosCallLetterRenderer>> | null = null;
    try {
      pdfRenderer = await openBosCallLetterRenderer();
    } catch (rendererErr) {
      console.warn('[bos/meetings/notify-members] PDF renderer launch failed:', rendererErr);
    }

    // Render + send per recipient. Synchronous in-process loop so the admin
    // gets a single response with aggregate counts. For typical BoS meeting
    // sizes (<= 20 members) this finishes in 3-8 seconds.
    let sent = 0;
    let failed = 0;
    const failedDetails: Array<{ email: string; error: string }> = [];
    // Rows to append to bos_email_send_log after the loop — one row per
    // attempt, regardless of outcome.
    type SendLogRow = {
      institutions_id: string;
      meeting_id: string;
      member_id: string;
      template_code: string;
      recipient_email: string;
      recipient_name: string;
      subject: string;
      status: 'sent' | 'failed';
      message_id: string | null;
      error_message: string | null;
      sent_by: string;
    };
    const logRows: SendLogRow[] = [];

    // Signoff block — resolved once from instHeader.officials and reused
    // for every recipient (same signing identity per institution). Empty
    // strings rather than nulls so the template renderer's "leave intact
    // when missing" behaviour doesn't surface raw {{tokens}} in the email.
    const officials = instHeader.officials;
    const signoff = {
      signoff_name: officials?.principal_name ?? '',
      signoff_institution: instHeader.institution_name ?? '',
      signoff_address: instHeader.institution_address ?? '',
      signoff_email: officials?.contact_email ?? '',
      signoff_contact: officials?.contact_cell ?? '',
    };

    for (const m of withEmail) {
      const values: Record<string, string> = {
        member_name: m.display_name,
        member_designation: m.display_designation ?? '',
        member_role: BOS_MEMBER_TYPE_LABELS[m.member_type] ?? m.member_type,
        meeting_title: meetingTitle,
        meeting_date: meetingDate,
        meeting_time: meeting.scheduled_time ?? '',
        meeting_venue: meeting.venue ?? '',
        meeting_url: meetingUrl,
        academic_year: meeting.academic_year ?? '',
        chairman_name: chairmanRow?.display_name ?? '',
        institution_name: instRow?.name ?? '',
        agenda_summary: meeting.agenda_text ?? '',
        ...signoff,
      };

      let subject: string;
      let html: string;
      if (template) {
        const rendered = renderBosEmailTemplate(
          { subject: template.subject, body_html: template.body_html },
          values,
        );
        subject = rendered.subject;
        html = rendered.body_html;
      } else {
        // Defensive fallback when the DB template isn't present yet.
        subject = `Invitation: ${meetingTitle} — ${meetingDate}`;
        html = generateMeetingScheduledEmailHtml(
          meetingTitle,
          `${meetingDate} ${meetingTimeVenue}`.trim(),
          0,
          meetingUrl,
        );
      }

      // Per-recipient PDF render. Each member gets their own addressee
      // block, so the buffer differs for every iteration. If the renderer
      // failed to launch above, attachments are skipped and the HTML
      // body alone is sent.
      let perRecipientPdf: Buffer | null = null;
      if (pdfRenderer) {
        try {
          perRecipientPdf = await pdfRenderer.render({
            meeting: meeting as never,
            agendaItems: agendaItems as never,
            recipient: {
              display_name: m.display_name,
              display_designation: m.display_designation ?? null,
              display_department: m.display_department ?? null,
              display_institution: m.display_institution ?? null,
              address: m.address ?? null,
              contact_no: m.contact_no ?? null,
            },
            boardName,
            boardType,
            header: instHeader,
          });
        } catch (pdfErr) {
          // Per-recipient PDF failure is non-fatal — log and continue with
          // HTML body only. Email still goes out so the recipient gets
          // notified that there's a meeting.
          console.warn(
            '[bos/meetings/notify-members] PDF render failed for',
            m.email,
            pdfErr,
          );
        }
      }

      const result = await sendBosEmail(smtpConfig, {
        to: m.email!,
        subject,
        html,
        text: `Dear ${m.display_name},\n\nYou are invited to ${meetingTitle} scheduled on ${meetingDate} ${meetingTimeVenue}.\n\nMeeting details: ${meetingUrl}\n\n—\nBoard of Studies`,
        attachments: perRecipientPdf
          ? [
              {
                filename: `bos-call-letter-${m.display_name.replace(/\s+/g, '-')}.pdf`,
                content: perRecipientPdf,
                contentType: 'application/pdf',
              },
            ]
          : undefined,
      });

      // Capture an audit row regardless of outcome. We flush all rows once
      // after the loop so a single failed insert can't leave us with
      // partially-logged sends.
      logRows.push({
        institutions_id: meeting.institutions_id,
        meeting_id: meetingId,
        member_id: m.id,
        template_code: template?.template_code ?? 'meeting_invitation',
        recipient_email: m.email!,
        recipient_name: m.display_name,
        subject,
        status: result.ok ? 'sent' : 'failed',
        message_id: result.messageId ?? null,
        error_message: result.ok ? null : (result.error ?? 'unknown'),
        sent_by: user.id,
      });

      if (result.ok) {
        sent++;
      } else {
        failed++;
        failedDetails.push({ email: m.email!, error: result.error ?? 'unknown' });
      }
    }

    // Close the shared Puppeteer browser after the loop. Best-effort —
    // a close failure here is logged but doesn't affect what's already sent.
    if (pdfRenderer) {
      try {
        await pdfRenderer.close();
      } catch (closeErr) {
        console.warn('[bos/meetings/notify-members] PDF renderer close failed:', closeErr);
      }
    }

    // Best-effort audit log write. If the table doesn't exist yet (migration
    // not applied), don't fail the user-facing response — the actual emails
    // have already been delivered (or attempted), and the audit is recoverable.
    if (logRows.length > 0) {
      const { error: logErr } = await supabase
        .from('bos_email_send_log')
        .insert(logRows);
      if (logErr) {
        console.warn('[bos/meetings/notify-members] bos_email_send_log insert failed:', logErr);
      }
    }

    return NextResponse.json({
      success: failed === 0,
      sent,
      failed,
      failedDetails: failed > 0 ? failedDetails : undefined,
      skippedNoEmail: withoutEmail.length,
      skippedMembers: withoutEmail.map((m) => m.display_name),
    });
  } catch (error) {
    console.error('[bos/meetings/notify-members] POST error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to send notifications' },
      { status: 500 }
    );
  }
}
