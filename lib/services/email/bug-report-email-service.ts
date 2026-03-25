// lib/services/email/bug-report-email-service.ts
// Handles bug-report resolution email notifications via Resend.
// Kept separate from the admission-module EmailService stub.

import { resend } from '@/lib/resend';
import { logger } from '@/lib/utils/enhanced-logger';

export interface BugResolvedEmailData {
  reportId: string;
  displayId: string;
  reporterEmail: string;
  reporterName: string | null;
  description: string;
  pageUrl: string;
  institutionName: string | null;
  resolvedAt: string;
}

export interface BugEmailSendResult {
  success: boolean;
  resendId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

// ---------------------------------------------------------------------------
// HTML template (inline styles — required for email client compatibility)
// ---------------------------------------------------------------------------
function buildResolvedEmailHtml(data: BugResolvedEmailData): string {
  const displayName = data.reporterName ?? 'there';
  const descriptionExcerpt =
    data.description.length > 250
      ? data.description.slice(0, 250) + '…'
      : data.description;
  const resolvedDate = new Date(data.resolvedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const viewLink = APP_URL ? `${APP_URL}/my-bug-reports/${data.reportId}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bug Report Resolved</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:28px 40px;text-align:center;">
              <p style="margin:0;color:#71717a;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">JKKN Management System</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.01em;">Bug Report Resolved</h1>
            </td>
          </tr>

          <!-- Success Banner -->
          <tr>
            <td style="background-color:#16a34a;padding:14px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:500;">&#10003;&nbsp; Your bug report has been resolved</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">Hi ${displayName},</p>
              <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
                Great news! The bug you reported has been investigated and resolved by our team.
                Thank you for helping us improve the system.
              </p>

              <!-- Report Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 14px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Report Details</p>
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="padding:5px 0;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">Report ID</td>
                        <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;font-family:'Courier New',Courier,monospace;">#${data.displayId}</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:#6b7280;font-size:13px;vertical-align:top;">Resolved On</td>
                        <td style="padding:5px 0;color:#111827;font-size:13px;">${resolvedDate}</td>
                      </tr>
                      ${
                        data.institutionName
                          ? `<tr>
                        <td style="padding:5px 0;color:#6b7280;font-size:13px;vertical-align:top;">Institution</td>
                        <td style="padding:5px 0;color:#111827;font-size:13px;">${data.institutionName}</td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td style="padding:5px 0;color:#6b7280;font-size:13px;vertical-align:top;">Reported Page</td>
                        <td style="padding:5px 0;font-size:13px;word-break:break-all;"><a href="${data.pageUrl}" style="color:#2563eb;text-decoration:none;">${data.pageUrl}</a></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Description Preview -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-left:3px solid #18181b;margin-bottom:32px;">
                <tr>
                  <td style="padding:14px 18px;background-color:#fafafa;">
                    <p style="margin:0 0 6px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Your report</p>
                    <p style="margin:0;color:#374151;font-size:13px;line-height:1.65;">${descriptionExcerpt}</p>
                  </td>
                </tr>
              </table>

              ${
                viewLink
                  ? `<!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${viewLink}" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;padding:11px 26px;border-radius:6px;font-size:14px;font-weight:500;letter-spacing:0.01em;">View Report Details &#8594;</a>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
                If you experience this issue again or have further questions, please don't hesitate to submit a new bug report.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">This email was sent by JKKN Management System</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">You are receiving this because you submitted a bug report.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------
export class BugReportEmailService {
  static isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  /**
   * Send a "your bug has been resolved" notification to a single reporter.
   * Non-throwing — always returns a result object.
   */
  static async sendBugResolvedEmail(
    data: BugResolvedEmailData
  ): Promise<BugEmailSendResult> {
    if (!data.reporterEmail) {
      return {
        success: false,
        skipped: true,
        skipReason: 'Reporter has no email address'
      };
    }

    if (!this.isConfigured()) {
      logger.warn(
        'bug-reports/email',
        'Resend not configured — skipping resolution email',
        { reportId: data.reportId }
      );
      return { success: false, skipped: true, skipReason: 'RESEND_API_KEY not configured' };
    }

    try {
      const { data: result, error } = await resend.emails.send(
        {
          from: FROM_EMAIL,
          to: data.reporterEmail,
          subject: `Your bug report #${data.displayId} has been resolved`,
          html: buildResolvedEmailHtml(data)
        },
        {
          headers: {
            // Idempotency key: prevents duplicate emails if the route retries
            'Idempotency-Key': `bug-resolved-${data.reportId}`
          }
        }
      );

      if (error) {
        logger.error('bug-reports/email', 'Resend API error sending resolution email', error);
        return { success: false, error: (error as any).message ?? String(error) };
      }

      logger.info(
        'bug-reports/email',
        `Resolution email sent for #${data.displayId}`,
        { resendId: result?.id, to: data.reporterEmail }
      );
      return { success: true, resendId: result?.id };
    } catch (err: any) {
      logger.error('bug-reports/email', 'Unexpected error sending resolution email', err);
      return { success: false, error: err?.message ?? 'Unknown error' };
    }
  }

  /**
   * Batch-send resolution emails for multiple reports (bulk status update).
   * Uses Resend batch API — max 100 per API call.
   * Reports without a reporter email are silently skipped.
   */
  static async sendBulkResolvedEmails(
    reports: BugResolvedEmailData[]
  ): Promise<{ sent: number; failed: number; skipped: number }> {
    const validReports = reports.filter(r => !!r.reporterEmail);
    const skipped = reports.length - validReports.length;

    if (!this.isConfigured() || validReports.length === 0) {
      logger.warn('bug-reports/email', 'Bulk email skipped', {
        total: reports.length,
        skipped: reports.length,
        reason: !this.isConfigured() ? 'not configured' : 'no valid emails'
      });
      return { sent: 0, failed: 0, skipped: reports.length };
    }

    const BATCH_SIZE = 100; // Resend batch limit
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < validReports.length; i += BATCH_SIZE) {
      const chunk = validReports.slice(i, i + BATCH_SIZE);

      try {
        const { data: batchResult, error } = await resend.batch.send(
          chunk.map(r => ({
            from: FROM_EMAIL,
            to: r.reporterEmail,
            subject: `Your bug report #${r.displayId} has been resolved`,
            html: buildResolvedEmailHtml(r)
          }))
        );

        if (error) {
          logger.error('bug-reports/email', 'Batch send error', error);
          failed += chunk.length;
        } else {
          sent += batchResult?.data?.length ?? chunk.length;
        }
      } catch (err) {
        logger.error('bug-reports/email', 'Batch send exception', err);
        failed += chunk.length;
      }
    }

    logger.info('bug-reports/email', 'Bulk resolution emails complete', {
      sent,
      failed,
      skipped
    });
    return { sent, failed, skipped };
  }
}
