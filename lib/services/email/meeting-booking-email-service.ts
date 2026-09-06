// lib/services/email/meeting-booking-email-service.ts
//
// Resend-powered email notifications for native meeting bookings (Phase N3a).
// Pattern mirrors ReservationEmailService — non-throwing, returns result
// objects, skips gracefully when RESEND_API_KEY is not configured so a
// missing provider never breaks the booking flow itself.
// Must only be called from server-side code (API routes / server actions)
// because RESEND_API_KEY is a server-only secret.

import { resend } from '@/lib/resend';
import { logger } from '@/lib/utils/enhanced-logger';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export interface MeetingEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface MeetingEmailPair {
  attendee: MeetingEmailResult;
  host: MeetingEmailResult;
}

export interface BookingEmailParams {
  uid: string;
  meetingTitle: string;
  durationMin: number;
  /** IANA timezone the times should be displayed in (host schedule timezone). */
  timezone: string;
  startTime: string; // ISO instant
  hostName: string;
  hostEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string | null;
  /** U2 (D4): where the meeting happens. Omitted = legacy copy without a location row. */
  locationMode?: 'in_person' | 'phone' | 'online' | null;
  locationText?: string | null;
  /** U2 (D12): Google Meet link when the host's calendar created one. */
  videoUrl?: string | null;
  /** Attendee self-service cancel link (omit to hide the button). */
  cancelUrl?: string;
  /** Attendee self-service reschedule link (U5, D16; omit to hide). */
  rescheduleUrl?: string;
}

export interface CancellationEmailParams
  extends Omit<BookingEmailParams, 'cancelUrl' | 'rescheduleUrl'> {
  cancelledBy: 'attendee' | 'host' | 'system';
  reason?: string | null;
}

export interface RescheduleEmailParams
  extends Omit<BookingEmailParams, 'cancelUrl' | 'rescheduleUrl'> {
  previousStartTime: string; // ISO instant
  rescheduledBy: 'attendee' | 'host';
}

/**
 * A face-to-face meeting became a Google Meet (mode switch, 2026-08-19).
 * `previousStartTime` is present ONLY when the switch also moved the meeting —
 * a mode-only switch keeps the time and says so.
 */
export interface SwitchedToOnlineEmailParams
  extends Omit<BookingEmailParams, 'cancelUrl' | 'rescheduleUrl'> {
  previousStartTime?: string | null;
  switchedBy: 'attendee' | 'host';
}

/**
 * A video meeting went BACK to being face-to-face or a phone call (host-only
 * switch-back, 2026-08-21). `locationMode` is where it lands — never 'online',
 * which is the state being undone. Only a host can cause this, so there is no
 * `switchedBy`: the copy always names the host.
 */
export interface SwitchedBackEmailParams
  extends Omit<BookingEmailParams, 'cancelUrl' | 'rescheduleUrl' | 'locationMode' | 'videoUrl'> {
  locationMode: 'in_person' | 'phone';
  videoUrl?: null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function actionButton(href: string, label: string): string {
  if (!href) return '';
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
    <tr>
      <td align="center">
        <a href="${href}"
           style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;
                  padding:11px 26px;border-radius:6px;font-size:14px;font-weight:500;letter-spacing:0.01em;">
          ${label} &#8594;
        </a>
      </td>
    </tr>
  </table>`;
}

function emailShell(bannerBg: string, bannerText: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${bannerText}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="background-color:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:28px 40px;text-align:center;">
              <p style="margin:0;color:#71717a;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">JKKN Management System</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Meeting Booking</h1>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="background-color:${bannerBg};padding:14px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:500;">${bannerText}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">This email was sent by JKKN Management System</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">You are receiving this because you are part of a meeting booking.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailsCard(rows: { label: string; value: string }[]): string {
  const rowHtml = rows
    .filter((r) => r.value)
    .map(
      (r) => `
      <tr>
        <td style="padding:5px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">${r.label}</td>
        <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${r.value}</td>
      </tr>`
    )
    .join('');
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
    <tr>
      <td style="padding:20px 24px;">
        <p style="margin:0 0 14px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Meeting Details</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${rowHtml}
        </table>
      </td>
    </tr>
  </table>`;
}

/** Escape user-supplied strings before interpolating into email HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format an ISO instant in the host schedule's timezone. Vercel lambdas run
 * in UTC, so the explicit timeZone is load-bearing — without it the email
 * would show UTC times to IST users.
 */
function fmtWhen(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone || 'Asia/Kolkata',
    });
  } catch {
    // Unknown/invalid timezone string — fall back to IST rather than throwing.
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });
  }
}

/**
 * Human "Where" row for details cards (U2, D4). The videoUrl anchor is the
 * one place we intentionally inject HTML — everything else stays esc()'d.
 */
function locationRow(params: {
  locationMode?: 'in_person' | 'phone' | 'online' | null;
  locationText?: string | null;
  videoUrl?: string | null;
}): { label: string; value: string } {
  switch (params.locationMode) {
    case 'online':
      return {
        label: 'Where',
        value: params.videoUrl
          ? `<a href="${params.videoUrl}" style="color:#2563eb;">Google Meet — join link</a>`
          : 'Online (link will be shared)',
      };
    case 'phone':
      return { label: 'Where', value: 'Phone call — the host will call you' };
    case 'in_person':
      return { label: 'Where', value: params.locationText ? esc(params.locationText) : 'In person' };
    default:
      return { label: 'Where', value: '' }; // empty values are filtered by detailsCard
  }
}

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

async function send(
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string
): Promise<MeetingEmailResult> {
  if (!to) {
    return { success: false, skipped: true, skipReason: 'No email address for recipient' };
  }
  if (!isConfigured()) {
    logger.warn('meetings/email', 'RESEND_API_KEY not configured — skipping email', { to, subject });
    return { success: false, skipped: true, skipReason: 'RESEND_API_KEY not configured' };
  }
  try {
    const { data, error } = await resend.emails.send(
      { from: FROM_EMAIL, to, subject, html },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
    if (error) {
      logger.error('meetings/email', 'Resend API error', { error, to });
      return { success: false, error: (error as any).message ?? String(error) };
    }
    logger.info('meetings/email', 'Email sent', { resendId: data?.id, to, subject });
    return { success: true, resendId: data?.id };
  } catch (err: any) {
    logger.error('meetings/email', 'Unexpected send error', err);
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

/** Run the attendee + host legs in parallel; neither leg can throw. */
async function sendPair(
  attendee: Promise<MeetingEmailResult>,
  host: Promise<MeetingEmailResult>
): Promise<MeetingEmailPair> {
  const [a, h] = await Promise.allSettled([attendee, host]);
  const unwrap = (r: PromiseSettledResult<MeetingEmailResult>): MeetingEmailResult =>
    r.status === 'fulfilled' ? r.value : { success: false, error: String(r.reason) };
  return { attendee: unwrap(a), host: unwrap(h) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class MeetingBookingEmailService {
  /**
   * Booking confirmed: confirmation to the attendee + new-booking notice to
   * the host. Both legs run in parallel and never throw.
   */
  static async sendBookingConfirmedEmails(params: BookingEmailParams): Promise<MeetingEmailPair> {
    const when = fmtWhen(params.startTime, params.timezone);
    const hostName = esc(params.hostName || 'your counselor');
    const attendeeName = esc(params.attendeeName || 'there');
    const title = esc(params.meetingTitle);

    const attendeeBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${attendeeName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Your meeting has been <strong>confirmed</strong>. Here are the details:
      </p>
      ${detailsCard([
        { label: 'Meeting', value: title },
        { label: 'With', value: hostName },
        { label: 'Date & Time', value: when },
        { label: 'Duration', value: `${params.durationMin} minutes` },
        locationRow(params),
        { label: 'Reference', value: params.uid },
      ])}
      ${params.videoUrl ? actionButton(params.videoUrl, 'Join Google Meet') : ''}
      ${params.rescheduleUrl ? actionButton(params.rescheduleUrl, 'Reschedule') : ''}
      ${params.cancelUrl ? actionButton(params.cancelUrl, 'Cancel Booking') : ''}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        Plans changed? Use the buttons above to pick a new time or cancel.
      </p>`;

    const hostBookingUrl = APP_URL ? `${APP_URL}/meetings/${params.uid}` : '';
    const hostBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${hostName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        <strong>${attendeeName}</strong> has booked a meeting with you.
      </p>
      ${detailsCard([
        { label: 'Meeting', value: title },
        { label: 'Attendee', value: attendeeName },
        { label: 'Email', value: esc(params.attendeeEmail) },
        { label: 'Phone', value: params.attendeePhone ? esc(params.attendeePhone) : '' },
        { label: 'Date & Time', value: when },
        { label: 'Duration', value: `${params.durationMin} minutes` },
        locationRow(params),
      ])}
      ${actionButton(hostBookingUrl, 'View Booking')}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        Manage all your bookings from the Meetings inbox.
      </p>`;

    return sendPair(
      send(
        params.attendeeEmail,
        `Meeting Confirmed – ${params.meetingTitle}`,
        emailShell('#16a34a', '&#10003;&nbsp; Your meeting is confirmed', attendeeBody),
        `meeting-confirmed-attendee-${params.uid}`
      ),
      send(
        params.hostEmail,
        `New Booking – ${params.attendeeName} (${params.meetingTitle})`,
        emailShell('#2563eb', '&#128197;&nbsp; New meeting booked with you', hostBody),
        `meeting-confirmed-host-${params.uid}`
      )
    );
  }

  /**
   * Booking cancelled: notice to both parties. Copy names who cancelled so
   * the other side isn't left guessing.
   */
  static async sendBookingCancelledEmails(params: CancellationEmailParams): Promise<MeetingEmailPair> {
    const when = fmtWhen(params.startTime, params.timezone);
    const hostName = esc(params.hostName || 'the host');
    const attendeeName = esc(params.attendeeName || 'the attendee');
    const title = esc(params.meetingTitle);
    const byLabel =
      params.cancelledBy === 'attendee' ? attendeeName
      : params.cancelledBy === 'host' ? hostName
      : 'the system';

    const card = detailsCard([
      { label: 'Meeting', value: title },
      { label: 'Date & Time', value: when },
      { label: 'Cancelled by', value: byLabel },
      { label: 'Reason', value: params.reason ? esc(params.reason) : '' },
      { label: 'Reference', value: params.uid },
    ]);

    const attendeeBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${attendeeName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Your meeting with <strong>${hostName}</strong> has been <strong>cancelled</strong>.
      </p>
      ${card}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        You are welcome to book a new slot at any time.
      </p>`;

    const hostBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${hostName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        The meeting with <strong>${attendeeName}</strong> has been <strong>cancelled</strong>.
        This slot is now open again.
      </p>
      ${card}`;

    return sendPair(
      send(
        params.attendeeEmail,
        `Meeting Cancelled – ${params.meetingTitle}`,
        emailShell('#dc2626', '&#10007;&nbsp; Your meeting has been cancelled', attendeeBody),
        `meeting-cancelled-attendee-${params.uid}`
      ),
      send(
        params.hostEmail,
        `Booking Cancelled – ${params.attendeeName} (${params.meetingTitle})`,
        emailShell('#dc2626', '&#10007;&nbsp; A booking with you was cancelled', hostBody),
        `meeting-cancelled-host-${params.uid}`
      )
    );
  }

  /**
   * Booking rescheduled (U5, D16): old → new time to both parties, naming
   * who moved it. The Google event patch separately re-invites the attendee;
   * this email carries the explicit before/after.
   */
  static async sendBookingRescheduledEmails(params: RescheduleEmailParams): Promise<MeetingEmailPair> {
    const newWhen = fmtWhen(params.startTime, params.timezone);
    const oldWhen = fmtWhen(params.previousStartTime, params.timezone);
    const hostName = esc(params.hostName || 'the host');
    const attendeeName = esc(params.attendeeName || 'the attendee');
    const title = esc(params.meetingTitle);
    const byLabel = params.rescheduledBy === 'attendee' ? attendeeName : hostName;

    const card = detailsCard([
      { label: 'Meeting', value: title },
      { label: 'New time', value: `<strong>${newWhen}</strong>` },
      { label: 'Was', value: oldWhen },
      { label: 'Duration', value: `${params.durationMin} minutes` },
      { label: 'Moved by', value: byLabel },
      { label: 'Reference', value: params.uid },
    ]);

    const attendeeBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${attendeeName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Your meeting with <strong>${hostName}</strong> has been <strong>moved to a new time</strong>.
      </p>
      ${card}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        The cancel and reschedule links from your confirmation email keep working.
      </p>`;

    const hostBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${hostName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        The meeting with <strong>${attendeeName}</strong> has been <strong>moved to a new time</strong>.
        The old slot is open again.
      </p>
      ${card}`;

    // Idempotency key includes the new start — each distinct move sends once.
    const moveKey = params.startTime.replace(/[^0-9]/g, '').slice(0, 12);
    return sendPair(
      send(
        params.attendeeEmail,
        `Meeting Rescheduled – ${params.meetingTitle}`,
        emailShell('#d97706', '&#128260;&nbsp; Your meeting has a new time', attendeeBody),
        `meeting-rescheduled-attendee-${params.uid}-${moveKey}`
      ),
      send(
        params.hostEmail,
        `Booking Rescheduled – ${params.attendeeName} (${params.meetingTitle})`,
        emailShell('#d97706', '&#128260;&nbsp; A booking with you was rescheduled', hostBody),
        `meeting-rescheduled-host-${params.uid}-${moveKey}`
      )
    );
  }

  /**
   * The meeting is now online: join link to the attendee + confirmation to the
   * host. Mirrors sendBookingRescheduledEmails exactly.
   *
   * This is the ONE email the switch sends (decision 9). The attendee's
   * existing calendar entry is ALREADY updated in place — the Google patch runs
   * with sendUpdates=all, which edits their event and notifies them — so there
   * is deliberately no cancellation email and no re-invite.
   */
  static async sendBookingSwitchedToOnlineEmails(
    params: SwitchedToOnlineEmailParams
  ): Promise<MeetingEmailPair> {
    const when = fmtWhen(params.startTime, params.timezone);
    const hostName = esc(params.hostName || 'the host');
    const attendeeName = esc(params.attendeeName || 'the attendee');
    const title = esc(params.meetingTitle);
    const byLabel = params.switchedBy === 'attendee' ? attendeeName : hostName;
    const moved = !!params.previousStartTime;

    const card = detailsCard([
      { label: 'Meeting', value: title },
      { label: 'When', value: `<strong>${when}</strong>` },
      // Empty values are filtered out by detailsCard, so a mode-only switch
      // simply has no "Was" row.
      {
        label: 'Was',
        value: moved ? fmtWhen(params.previousStartTime as string, params.timezone) : '',
      },
      { label: 'Duration', value: `${params.durationMin} minutes` },
      locationRow({ locationMode: 'online', videoUrl: params.videoUrl }),
      { label: 'Changed by', value: byLabel },
      { label: 'Reference', value: params.uid },
    ]);

    const attendeeBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${attendeeName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Your meeting with <strong>${hostName}</strong> is now a
        <strong>Google Meet</strong>${moved ? ' at a new time' : ''}. There is no
        need to travel — join from the link below.
      </p>
      ${card}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        Your calendar entry has been updated in place, so the event you already
        have now carries the join link. The cancel and reschedule links from your
        confirmation email keep working.
      </p>`;

    const hostBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${hostName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        The meeting with <strong>${attendeeName}</strong> is now a
        <strong>Google Meet</strong>${moved ? ' at a new time' : ''}.
      </p>
      ${card}`;

    // Idempotency key includes the start, so a switch that also moves the
    // meeting sends once per distinct outcome.
    const switchKey = params.startTime.replace(/[^0-9]/g, '').slice(0, 12);
    return sendPair(
      send(
        params.attendeeEmail,
        `Now online – ${params.meetingTitle}`,
        emailShell('#2563eb', '&#128187;&nbsp; Your meeting moved online', attendeeBody),
        `meeting-online-attendee-${params.uid}-${switchKey}`
      ),
      send(
        params.hostEmail,
        `Now online – ${params.attendeeName} (${params.meetingTitle})`,
        emailShell('#2563eb', '&#128187;&nbsp; A booking with you moved online', hostBody),
        `meeting-online-host-${params.uid}-${switchKey}`
      )
    );
  }

  /**
   * The meeting is NOT online any more: the host turned it back into a
   * face-to-face meeting or a phone call (2026-08-21).
   *
   * The mirror of sendBookingSwitchedToOnlineEmails, and one email for the same
   * reason: the Google revert runs with sendUpdates=all, so the attendee's
   * existing calendar entry has already lost the join link and been corrected
   * in place. No cancellation, no re-invite.
   *
   * The time never changes on a switch back, so there is no "Was" row and no
   * previousStartTime to carry.
   */
  static async sendBookingSwitchedBackEmails(
    params: SwitchedBackEmailParams
  ): Promise<MeetingEmailPair> {
    const when = fmtWhen(params.startTime, params.timezone);
    const hostName = esc(params.hostName || 'the host');
    const attendeeName = esc(params.attendeeName || 'the attendee');
    const title = esc(params.meetingTitle);
    const onPhone = params.locationMode === 'phone';
    // Plain English, and it must match what the Where row below actually says.
    const backTo = onPhone ? 'a phone call' : 'an in-person meeting';

    const card = detailsCard([
      { label: 'Meeting', value: title },
      { label: 'When', value: `<strong>${when}</strong>` },
      { label: 'Duration', value: `${params.durationMin} minutes` },
      locationRow({ locationMode: params.locationMode, locationText: params.locationText }),
      { label: 'Changed by', value: hostName },
      { label: 'Reference', value: params.uid },
    ]);

    const attendeeBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${attendeeName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Your meeting with <strong>${hostName}</strong> is no longer a video call.
        It is now <strong>${backTo}</strong>, at the same time as before.
        ${onPhone ? 'The host will call you.' : 'Please come in person.'}
      </p>
      ${card}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        Your calendar entry has been updated in place, so the join link has been
        removed from the event you already have. The cancel and reschedule links
        from your confirmation email keep working.
      </p>`;

    const hostBody = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${hostName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        The meeting with <strong>${attendeeName}</strong> is back to being
        <strong>${backTo}</strong>. The Google Meet link has been removed from
        the calendar event.
      </p>
      ${card}`;

    const backKey = params.startTime.replace(/[^0-9]/g, '').slice(0, 12);
    return sendPair(
      send(
        params.attendeeEmail,
        `No longer online – ${params.meetingTitle}`,
        emailShell('#0f766e', '&#128205;&nbsp; Your meeting is not a video call any more', attendeeBody),
        `meeting-offline-attendee-${params.uid}-${backKey}`
      ),
      send(
        params.hostEmail,
        `No longer online – ${params.attendeeName} (${params.meetingTitle})`,
        emailShell('#0f766e', '&#128205;&nbsp; A booking with you is back off video', hostBody),
        `meeting-offline-host-${params.uid}-${backKey}`
      )
    );
  }

  /**
   * U2 (D19): the host's Google Calendar connection broke — their public
   * booking page was auto-hidden. One email per break (transition-gated by
   * GoogleCalendarService.markConnectionBroken).
   */
  static async sendGoogleConnectionBrokenEmail(params: {
    to: string;
    hostName: string;
    reason: string;
    /** false when the host had no public page to hide (availability-only host). */
    pageWasHidden: boolean;
  }): Promise<MeetingEmailResult> {
    const reconnectUrl = APP_URL ? `${APP_URL}/meetings/availability` : '';
    const body = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${esc(params.hostName)},
      </p>
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Your Google Calendar connection has stopped working
        (${esc(params.reason)}), so your real calendar can no longer protect
        your booking slots from double-booking.
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        ${params.pageWasHidden
          ? '<strong>Your public booking page has been hidden</strong> until you reconnect — visitors cannot book you in the meantime.'
          : 'Reconnect to keep your availability protected.'}
      </p>
      ${actionButton(reconnectUrl, 'Reconnect Google Calendar')}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        Reconnecting takes under a minute and restores your page exactly as it was.
      </p>`;

    return send(
      params.to,
      'Action needed – reconnect your Google Calendar',
      emailShell('#dc2626', '&#9888;&#65039;&nbsp; Your booking page needs attention', body),
      // One break-email per day per host at most, even across repeat flips.
      `google-broken-${params.to}-${new Date().toISOString().slice(0, 10)}`
    );
  }
}
