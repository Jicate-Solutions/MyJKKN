// lib/services/email/reservation-email-service.ts
//
// Resend-powered email notifications for the four reservation lifecycle events.
// Pattern mirrors BugReportEmailService — non-throwing, returns result objects.
// Must only be called from server-side code (API routes / server components)
// because RESEND_API_KEY is a server-only secret.

import { resend } from '@/lib/resend';
import { logger } from '@/lib/utils/enhanced-logger';

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export interface ReservationEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
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
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Resource Reservation</h1>
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
              <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">You are receiving this because you are part of a resource reservation.</p>
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
        <p style="margin:0 0 14px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Booking Details</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${rowHtml}
        </table>
      </td>
    </tr>
  </table>`;
}

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

async function send(
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string
): Promise<ReservationEmailResult> {
  if (!to) {
    return { success: false, skipped: true, skipReason: 'No email address for recipient' };
  }
  if (!isConfigured()) {
    logger.warn('reservation/email', 'RESEND_API_KEY not configured — skipping email', { to });
    return { success: false, skipped: true, skipReason: 'RESEND_API_KEY not configured' };
  }
  try {
    const { data, error } = await resend.emails.send(
      { from: FROM_EMAIL, to, subject, html },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
    if (error) {
      logger.error('reservation/email', 'Resend API error', { error, to });
      return { success: false, error: (error as any).message ?? String(error) };
    }
    logger.info('reservation/email', 'Email sent', { resendId: data?.id, to, subject });
    return { success: true, resendId: data?.id };
  } catch (err: any) {
    logger.error('reservation/email', 'Unexpected send error', err);
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BookingEmailParams {
  to: string;
  recipientName: string;
  resourceName: string;
  startTime: string;   // ISO string
  endTime: string;     // ISO string
  purpose: string;
  reservationId: string;
}

export interface ApproverEmailParams extends BookingEmailParams {
  requesterName: string;
}

export interface RejectedEmailParams extends BookingEmailParams {
  reason: string;
}

export class ReservationEmailService {

  /** Email to the booker: booking submitted, pending approval. */
  static async sendBookingSubmittedEmail(
    params: BookingEmailParams
  ): Promise<ReservationEmailResult> {
    const viewUrl = APP_URL
      ? `${APP_URL}/resource-management/reservations/${params.reservationId}`
      : '';
    const date = new Date(params.startTime).toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short'
    });
    const body = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Your booking request has been received and is currently <strong>pending approval</strong>.
        You will be notified once it has been reviewed.
      </p>
      ${detailsCard([
        { label: 'Resource',  value: params.resourceName },
        { label: 'Date & Time', value: date },
        { label: 'Purpose',   value: params.purpose },
      ])}
      ${actionButton(viewUrl, 'View Booking')}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        If you have any questions, please contact your institution administrator.
      </p>`;

    return send(
      params.to,
      `Booking Pending Approval – ${params.resourceName}`,
      emailShell('#d97706', '&#9203;&nbsp; Your booking is pending approval', body),
      `reservation-submitted-${params.reservationId}`
    );
  }

  /** Email to an approver: action required to review a booking. */
  static async sendApprovalRequiredEmail(
    params: ApproverEmailParams
  ): Promise<ReservationEmailResult> {
    const reviewUrl = APP_URL
      ? `${APP_URL}/resource-management/reservations/${params.reservationId}`
      : '';
    const date = new Date(params.startTime).toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short'
    });
    const body = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        <strong>${params.requesterName}</strong> has submitted a booking request that requires your approval.
      </p>
      ${detailsCard([
        { label: 'Resource',   value: params.resourceName },
        { label: 'Requested by', value: params.requesterName },
        { label: 'Date & Time',  value: date },
        { label: 'Purpose',    value: params.purpose },
      ])}
      ${actionButton(reviewUrl, 'Review Booking')}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        Please log in to approve or reject this request.
      </p>`;

    return send(
      params.to,
      `Action Required – Review Booking for ${params.resourceName}`,
      emailShell('#ea580c', '&#9889;&nbsp; A booking requires your approval', body),
      `reservation-approval-required-${params.reservationId}-${params.to}`
    );
  }

  /** Email to the booker: booking confirmed / approved. */
  static async sendBookingApprovedEmail(
    params: BookingEmailParams
  ): Promise<ReservationEmailResult> {
    const viewUrl = APP_URL
      ? `${APP_URL}/resource-management/reservations/${params.reservationId}`
      : '';
    const date = new Date(params.startTime).toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short'
    });
    const body = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Great news! Your reservation has been <strong>approved</strong>. Please make sure to
        check in at the scheduled time.
      </p>
      ${detailsCard([
        { label: 'Resource',    value: params.resourceName },
        { label: 'Date & Time', value: date },
        { label: 'Purpose',     value: params.purpose },
      ])}
      ${actionButton(viewUrl, 'View Booking')}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        If you need to cancel or make changes, please do so before the scheduled time.
      </p>`;

    return send(
      params.to,
      `Booking Confirmed – ${params.resourceName}`,
      emailShell('#16a34a', '&#10003;&nbsp; Your booking has been approved', body),
      `reservation-approved-${params.reservationId}`
    );
  }

  /** Email to the booker: booking rejected. */
  static async sendBookingRejectedEmail(
    params: RejectedEmailParams
  ): Promise<ReservationEmailResult> {
    const viewUrl = APP_URL
      ? `${APP_URL}/resource-management/reservations/${params.reservationId}`
      : '';
    const date = new Date(params.startTime).toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short'
    });
    const body = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
        Unfortunately your reservation request has been <strong>declined</strong>.
      </p>
      ${detailsCard([
        { label: 'Resource',    value: params.resourceName },
        { label: 'Date & Time', value: date },
        { label: 'Purpose',     value: params.purpose },
        { label: 'Reason',      value: params.reason || 'No reason provided' },
      ])}
      ${actionButton(viewUrl, 'View Booking')}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        You may submit a new request for a different time or resource.
      </p>`;

    return send(
      params.to,
      `Booking Declined – ${params.resourceName}`,
      emailShell('#dc2626', '&#10007;&nbsp; Your booking has been declined', body),
      `reservation-rejected-${params.reservationId}`
    );
  }
}
