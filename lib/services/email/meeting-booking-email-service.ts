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
  /** Attendee self-service cancel link (omit to hide the button). */
  cancelUrl?: string;
}

export interface CancellationEmailParams extends Omit<BookingEmailParams, 'cancelUrl'> {
  cancelledBy: 'attendee' | 'host' | 'system';
  reason?: string | null;
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
        { label: 'Reference', value: params.uid },
      ])}
      ${params.cancelUrl ? actionButton(params.cancelUrl, 'Cancel Booking') : ''}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        Need to change the time? Cancel this booking and book a new slot.
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
}
