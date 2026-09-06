import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  guardCompositionChairman,
  guardAcademicCouncilWrite,
  guardGoverningBodyWrite,
} from '@/lib/utils/bos/bos-access';
import { isCouncilMeetingType, bosCallLetterFilename } from '@/types/bos';
import { generateMeetingScheduledEmailHtml } from '@/lib/services/email-service';
import {
  renderBosEmailTemplate,
  resolveMeetingBodyType,
  resolveBosEmailTemplateForBody,
  meetingOrdinalWord,
} from '@/lib/services/bos-email-templates';
import {
  resolveBosSmtpConfig,
  resolveBosBoardSender,
  mergeBoardSmtpConfig,
  sendBosEmail,
  resolveBosSenderDisplayName,
} from '@/lib/services/bos-email-sender';
import { openBosCallLetterRenderer } from '@/lib/pdf/bos-meeting-notice';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import {
  fetchBosLetterheadAssets,
  withLetterheadAssets,
} from '@/lib/utils/bos/letterhead-assets';
import {
  buildBosLetterRef,
  resolveBosCommitteeShortCode,
  resolveBosMemberSerials,
} from '@/lib/utils/bos/call-letter-ref';
import { bosMemberTypeLabel, isBosChairmanRow } from '@/types/bos';

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

// {{chairman_block}} is injected into the email as raw HTML, so member-supplied
// values (names, designations) must be escaped — an "&" in a department name
// would otherwise break the markup.
function escapeEmailHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Drop a leading "Department of " so the renderer's own prefix never doubles up
// ("Department of Department of ECE"). Mirrors the call-letter PDF helper.
function stripDeptPrefix(s: string | null | undefined): string {
  return String(s ?? '').replace(/^\s*department\s+of\s+/i, '').trim();
}

// "1" → "1st", "2" → "2nd", "3" → "3rd", "11" → "11th". Used for the
// {{meeting_ordinal}} placeholder (e.g. "1st Board of Studies meeting").
function ordinalSuffix(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 1) return '';
  const rem100 = n % 100;
  const rem10 = n % 10;
  const suffix =
    rem100 >= 11 && rem100 <= 13
      ? 'th'
      : rem10 === 1
        ? 'st'
        : rem10 === 2
          ? 'nd'
          : rem10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

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
        'id, composition_id, institutions_id, status, meeting_type, meeting_title, meeting_number, academic_year, scheduled_date, scheduled_time, venue, agenda_text, board_id, board_type, committee_id'
      )
      .eq('id', meetingId)
      .single();

    if (meetingErr || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Status gate + convener authorization differ by meeting type:
    //   • BoS meeting → chairman sends at 'expert_invited'
    //   • Council meeting (Academic Council / Governing Body) → principal sends
    //     the call letters at 'noticed' (councils have no 'expert_invited' step
    //     in their shorter state machine)
    const isCouncilMeeting = isCouncilMeetingType(meeting.meeting_type);
    // AC-ONLY From: identity (ac_sender_email). Governing Body keeps the default
    // sender, but both council types swap the cover-email "Board of Studies
    // meeting notice" phrase to the correct council label.
    const isAcMeeting = meeting.meeting_type === 'academic_council';
    const isGbMeeting = meeting.meeting_type === 'governing_body';
    const requiredStatus = isCouncilMeeting ? 'noticed' : 'expert_invited';
    if (meeting.status !== requiredStatus) {
      const stepLabel = isCouncilMeeting ? '"Notice Issued"' : '"Experts Invited"';
      return NextResponse.json(
        {
          error: `Cannot send notices while meeting is in "${meeting.status}" status. Move the meeting to ${stepLabel} first.`,
        },
        { status: 422 }
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    const deny = isCouncilMeeting
      ? (meeting.meeting_type === 'governing_body'
          ? guardGoverningBodyWrite(scope, meeting.institutions_id)
          : guardAcademicCouncilWrite(scope, meeting.institutions_id))
      : guardCompositionChairman(scope, meeting.composition_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // Fetch the selected members. Restrict the in-clause to this meeting's
    // composition so a tampered client can't slip in member IDs from a
    // different composition.
    const { data: members, error: membersErr } = await supabase
      .from('bos_members')
      .select('id, display_name, email, member_type, expert_id, staff_id, display_designation, display_department, display_institution, address, contact_no, member_type_rec:bos_member_types ( name )')
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

    // Resolve which governing body this meeting belongs to (BOS, DFPC, AC, …)
    // then pick the format that was in effect on the meeting's scheduled date.
    // Resolution falls back institution→global and body→BOS so a send is never
    // blocked by a missing per-body format (20260724140000).
    const bodyTypeCode = await resolveMeetingBodyType(supabase, meeting);
    const template = await resolveBosEmailTemplateForBody(supabase, {
      templateCode: 'meeting_invitation',
      institutionsId: meeting.institutions_id,
      bodyTypeCode,
      onDate: meeting.scheduled_date ?? null,
    });

    // Look up the chairman name + institution name for placeholder values.
    // Also pull the meeting's agenda items so we can include them in both
    // the email template AND the attached PDF.
    const [
      { data: memberCandidates },
      { data: instRow },
      { data: agendaItemsRaw },
    ] = await Promise.all([
      // member_type stores the catalog type NAME since 20260710150000 —
      // chairman is derived from the catalog base_type in JS below.
      // The contact columns feed the {{chairman_*}} email placeholders, which
      // sign the invitation as the convening board's chairman.
      supabase
        .from('bos_members')
        .select(
          'display_name, member_type, committee_id, display_designation, display_department, display_institution, contact_no, email, member_type_rec:bos_member_types(base_type)',
        )
        .eq('composition_id', meeting.composition_id)
        .eq('is_active', true),
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
    // Chairman of the CONVENING body. A composition can govern several boards
    // and committees, each with its own chairman, so prefer the one sitting on
    // this meeting's committee before falling back to the composition-wide
    // chairman (legacy rows have no committee assignment).
    const chairmanCandidates = (memberCandidates ?? []).filter((m) =>
      isBosChairmanRow(m as never),
    );
    const meetingCommitteeId =
      (meeting as { committee_id?: string | null }).committee_id ?? null;
    const chairmanRow =
      (meetingCommitteeId
        ? chairmanCandidates.find(
            (m) => (m as { committee_id?: string | null }).committee_id === meetingCommitteeId,
          )
        : null) ??
      chairmanCandidates[0] ??
      null;

    // Resolve the institution header config once — used by every PDF render
    // below. The static half is a pure mapping; the seal + signature come from
    // bos_letterhead_assets (uploaded at /bos/email-settings), so this is one
    // extra query per batch rather than per recipient.
    const instHeader = withLetterheadAssets(
      getInstitutionHeader(instRow?.name ?? null),
      await fetchBosLetterheadAssets(meeting.institutions_id),
    );

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

    // ── Reference numbers ────────────────────────────────────────────────────
    // JKKNCET/BoS/ECE/2026-2027/01. Resolved ONCE per batch: the committee
    // short code is meeting-wide, and the serial map covers every member, so
    // the loop below just looks up each recipient's rank. Must match what
    // preview-pdf computes — both call the same helpers with the same inputs.
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
    const boardCodeForRef =
      (coeBoard as { board_code?: string | null } | undefined)?.board_code || boardName;

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

    // Resolve a per-board From override (e.g. ECE board → ece.bos@…). Wins over
    // the institution default and the AC override when present, since it's the
    // most specific sender identity. NULL → fall back to existing behaviour.
    const boardSender = await resolveBosBoardSender(
      supabase,
      meeting.institutions_id,
      meeting.board_id,
    );
    // Model 3: if the board carries its own SMTP username + password, send
    // through a merged config that authenticates AS the board mailbox.
    // Otherwise this is the institution account unchanged (From-only override).
    const { cfg: effectiveSmtpConfig } = mergeBoardSmtpConfig(smtpConfig, boardSender);

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

    // ── Chairman signature block ─────────────────────────────────────────────
    // Institutions that sign the invitation as the board chairman (rather than
    // the principal) use these. {{chairman_block}} is the safe one to drop into
    // a template: it is pre-rendered HTML that OMITS whatever the chairman row
    // doesn't have, whereas an individual {{chairman_contact}} on a member with
    // no phone number would render the raw token — fillTokens deliberately
    // leaves unknown/empty tokens intact.
    const chairmanDept = stripDeptPrefix(
      (chairmanRow as { display_department?: string | null } | null)?.display_department,
    );
    const chairman = {
      chairman_name: chairmanRow?.display_name ?? '',
      chairman_designation:
        (chairmanRow as { display_designation?: string | null } | null)?.display_designation ?? '',
      chairman_department: chairmanDept ? `Department of ${chairmanDept}` : '',
      chairman_institution:
        (chairmanRow as { display_institution?: string | null } | null)?.display_institution ??
        instRow?.name ??
        '',
      chairman_contact: (chairmanRow as { contact_no?: string | null } | null)?.contact_no ?? '',
      chairman_email: (chairmanRow as { email?: string | null } | null)?.email ?? '',
    };
    const chairmanBlockHtml = [
      chairman.chairman_name ? `${escapeEmailHtml(chairman.chairman_name)},` : '',
      chairman.chairman_designation ? `${escapeEmailHtml(chairman.chairman_designation)},` : '',
      chairman.chairman_department ? `${escapeEmailHtml(chairman.chairman_department)},` : '',
      chairman.chairman_institution ? `${escapeEmailHtml(chairman.chairman_institution)},` : '',
      chairman.chairman_contact ? `Mobile: ${escapeEmailHtml(chairman.chairman_contact)}` : '',
    ]
      .filter(Boolean)
      .join('<br/>');

    for (const m of withEmail) {
      const values: Record<string, string> = {
        member_name: m.display_name,
        member_designation: m.display_designation ?? '',
        // Selected catalog type (bos_member_types) first; category label only
        // for legacy rows with no member_type_id link.
        member_role:
          (m.member_type_rec as { name?: string } | null)?.name ??
          bosMemberTypeLabel(m.member_type),
        meeting_title: meetingTitle,
        meeting_date: meetingDate,
        meeting_time: meeting.scheduled_time ?? '',
        meeting_venue: meeting.venue ?? '',
        // {{venue}} — like meeting_venue but with a graceful fallback so the
        // token never renders empty in "…in the {{venue}}." phrasing.
        venue: meeting.venue?.trim() || 'department',
        meeting_url: meetingUrl,
        academic_year: meeting.academic_year ?? '',
        ...chairman,
        chairman_block: chairmanBlockHtml,
        institution_name: instRow?.name ?? '',
        agenda_summary: meeting.agenda_text ?? '',
        // Board / department context (e.g. "Electronics and Communication
        // Engineering") — lets one per-institution BOS format name the correct
        // board per meeting. Sourced from the COE board lookup above.
        board_name: boardName ?? '',
        board_type: boardType ?? '',
        // Meeting sequence — raw number ("1") and ordinal ("1st") for headings
        // like "1st Board of Studies meeting".
        meeting_number: meeting.meeting_number != null ? String(meeting.meeting_number) : '',
        meeting_ordinal: ordinalSuffix(meeting.meeting_number),
        // Spelled-out form ("First") — what the invitation subject/body use, so
        // the email matches the call letter's "Sub:" line.
        meeting_ordinal_word: meetingOrdinalWord(meeting.meeting_number),
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
        // The stored template body says "Board of Studies meeting notice". For
        // council meetings that phrasing is wrong — swap it. Done as a
        // post-render replace (not a template placeholder) so it also fixes
        // any per-institution template overrides that hardcode the phrase.
        if (isAcMeeting || isGbMeeting) {
          const noticeLabel = isGbMeeting
            ? 'Governing Body meeting notice'
            : 'Academic Council meeting notice';
          const swap = (s: string) =>
            s.replace(/Board of Studies meeting notice/gi, noticeLabel);
          html = swap(html);
          subject = swap(subject);
        }
        if (isAcMeeting) {
          // The template hardcodes the shared BoS mailbox in the "inform us
          // through mail at ..." reply line. Academic Council notices should
          // direct replies to the AC sender identity instead (falls back to
          // the default sender when no AC override is configured). Rewrite the
          // whole <a> — both the mailto href and the visible text — so a
          // mismatched href/label in the stored template can't leak through.
          const acReplyEmail = smtpConfig.ac_sender_email?.trim() || smtpConfig.sender_email;
          if (acReplyEmail) {
            html = html.replace(
              /(inform us through mail at\s*<a[^>]*href="mailto:)[^"]*("[^>]*>)[^<]*(<\/a>)/i,
              `$1${acReplyEmail}$2${acReplyEmail}$3`,
            );
          }
        }
        // Per-body reply-to override (bos_email_templates.reply_to_email). When
        // set for this body it wins over the AC swap above — the admin has
        // explicitly chosen where replies for this committee should go.
        const replyTo = template.reply_to_email?.trim();
        if (replyTo) {
          html = html.replace(
            /(inform us through mail at\s*<a[^>]*href="mailto:)[^"]*("[^>]*>)[^<]*(<\/a>)/i,
            `$1${replyTo}$2${replyTo}$3`,
          );
        }
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

      // Per-body PDF text overrides (pdf_heading / intro / closing / signoff),
      // placeholder-substituted with THIS recipient's values so tokens like
      // {{member_name}} / {{meeting_date}} resolve inside the call letter too.
      const fillTokens = (s: string | null | undefined): string =>
        (s ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
          const v = values[key];
          return v == null || v === '' ? `{{${key}}}` : String(v);
        });
      const pdfBodyFormat = template
        ? {
            pdf_heading: fillTokens(template.pdf_heading),
            pdf_intro_html: fillTokens(template.pdf_intro_html),
            pdf_closing_html: fillTokens(template.pdf_closing_html),
            signoff_html: fillTokens(template.signoff_html),
          }
        : null;

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
              email: m.email ?? null,
              // External = sourced from the BoS expert directory (expert_id).
              // Drives the AC/GB rule: only external members get the TA/DA closing.
              is_external: !!(m as { expert_id?: string | null }).expert_id,
            },
            boardName,
            boardType,
            boardCode: (coeBoard as { board_code?: string | null } | undefined)?.board_code ?? null,
            memberRole: values.member_role,
            refNo: buildBosLetterRef({
              prefix: instHeader.ref_prefix ?? 'JKKNCET',
              committeeCode: committeeShortCode,
              boardCode: boardCodeForRef,
              academicYear: meeting.academic_year,
              serial: memberSerials.get(m.id) ?? null,
            }),
            header: instHeader,
            bodyFormat: pdfBodyFormat,
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

      const result = await sendBosEmail(effectiveSmtpConfig, {
        to: m.email!,
        subject,
        html,
        // From: identity precedence — most specific wins:
        //   1. per-board override (bos_board_senders) — ECE/EEE split
        //   2. Academic Council dedicated address (ac_sender_email)
        //   3. institution default (sender_email, inside sendBosEmail)
        // Display name follows the same precedence; board name falls back to
        // the meeting_type-derived label (Governing Body / Academic Council).
        fromEmail:
          boardSender?.sender_email ??
          (isAcMeeting ? smtpConfig.ac_sender_email : undefined),
        fromName:
          boardSender?.sender_name?.trim() ||
          resolveBosSenderDisplayName(meeting.meeting_type, smtpConfig),
        text: `Dear ${m.display_name},\n\nYou are invited to ${meetingTitle} scheduled on ${meetingDate} ${meetingTimeVenue}.\n\nMeeting details: ${meetingUrl}\n\n—\n${
          isGbMeeting
            ? 'Governing Body'
            : isAcMeeting
              ? 'Academic Council'
              : 'Board of Studies'
        }`,
        attachments: perRecipientPdf
          ? [
              {
                filename: bosCallLetterFilename(meeting.meeting_type, m.display_name),
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
