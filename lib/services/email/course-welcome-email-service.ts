// lib/services/email/course-welcome-email-service.ts
//
// The email a course participant gets when their application is approved:
// their JKKN ID, their temporary password, and what they have been enrolled
// onto. Pattern mirrors ReservationEmailService — non-throwing, returns a
// result object, server-only because RESEND_API_KEY is a server secret.
//
// THIS EMAIL MUST NEVER FAIL AN APPROVAL. By the time it is sent the
// transaction has already committed: a profile, a JKKN identity, an enrollment
// and a full bill schedule exist. Throwing here would report failure for work
// that succeeded, and a retry would then hit "already enrolled". So every path
// returns a result and the caller decides what to tell the admin.
//
// SKIPPING IS THE NORMAL CASE, not an error. External participants frequently
// have no email at all — that is the whole reason they sign in with a JKKN ID
// — so `skipped` is reported distinctly from `error`, and the admin UI uses it
// to say "hand these over yourself" rather than "something went wrong".

import { logger } from '@/lib/utils/enhanced-logger';

// NOT a top-level `import { resend } from '@/lib/resend'`. That module runs
// `new Resend(process.env.RESEND_API_KEY)` at load time, and the Resend
// constructor THROWS when the key is absent. A static import would therefore
// crash this module — and with it the approval route that imports it — on any
// deployment without RESEND_API_KEY set, turning an optional notification into
// a hard failure of the thing it is supposed to notify about.
//
// Imported lazily, after isConfigured(), so a missing key stays what it should
// be: an email that is skipped.
async function getResend() {
  const mod = await import('@/lib/resend');
  return mod.resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export interface CourseWelcomeEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface CourseWelcomeInstalment {
  installment_no: number;
  label: string | null;
  total_amount: number;
  due_date: string;
}

export interface CourseWelcomeEmailParams {
  to: string | null;
  participantName: string;
  jkknId: string;
  /** Null when an existing identity was reused — no password was issued, and
   *  inventing one to put in an email would lock the person out. */
  tempPassword: string | null;
  courseTitle: string;
  courseStartDate: string | null;
  courseEndDate: string | null;
  courseMode: string | null;
  venueText: string | null;
  packageName: string;
  totalPayable: number;
  enrollmentNumber: string;
  instalments: CourseWelcomeInstalment[];
  /** True when an admin reissued the password for someone already enrolled.
   *  Changes the subject and opening line only — telling an existing
   *  participant "your application has been accepted" a second time is
   *  confusing, and worse, hides the one thing that actually changed. */
  isReissue?: boolean;
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/** HTML-escape every interpolated value. Names, package names and instalment
 *  labels are all admin- or applicant-supplied free text; an apostrophe or a
 *  stray angle bracket would otherwise break the markup, and a deliberate one
 *  would inject into an email we send in the institution's name. */
const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

function detailsCard(title: string, rows: { label: string; value: string }[]): string {
  const rowHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:5px 0;color:#6b7280;font-size:13px;width:150px;vertical-align:top;">${esc(r.label)}</td>
        <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${r.value}</td>
      </tr>`,
    )
    .join('');
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
    <tr>
      <td style="padding:20px 24px;">
        <p style="margin:0 0 14px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${esc(title)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rowHtml}</table>
      </td>
    </tr>
  </table>`;
}

/** The credentials block. Visually separated because it is the one part the
 *  reader must not miss, and the one part they must act on. */
function credentialsCard(jkknId: string, tempPassword: string | null): string {
  const passwordRow = tempPassword
    ? `
      <tr>
        <td style="padding:6px 0;color:#78350f;font-size:13px;width:150px;">Temporary password</td>
        <td style="padding:6px 0;color:#111827;font-size:16px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(tempPassword)}</td>
      </tr>`
    : `
      <tr>
        <td colspan="2" style="padding:6px 0;color:#78350f;font-size:13px;">
          Use the password you already set for your JKKN account.
        </td>
      </tr>`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:6px;margin-bottom:24px;">
    <tr>
      <td style="padding:20px 24px;">
        <p style="margin:0 0 14px;color:#92400e;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Your sign-in details</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding:6px 0;color:#78350f;font-size:13px;width:150px;">JKKN ID</td>
            <td style="padding:6px 0;color:#111827;font-size:16px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(jkknId)}</td>
          </tr>
          ${passwordRow}
        </table>
      </td>
    </tr>
  </table>`;
}

function instalmentsTable(rows: CourseWelcomeInstalment[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .slice()
    .sort((a, b) => a.installment_no - b.installment_no)
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;">
          ${esc(i.label || `Instalment ${i.installment_no}`)}
        </td>
        <td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px;text-align:right;">
          by ${esc(formatDate(i.due_date) ?? '—')}
        </td>
        <td style="padding:8px 0;border-top:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:600;text-align:right;">
          ${esc(inr.format(Number(i.total_amount ?? 0)))}
        </td>
      </tr>`,
    )
    .join('');

  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
    <tr><td colspan="3" style="padding-bottom:8px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Payment schedule</td></tr>
    ${body}
  </table>`;
}

function actionButton(href: string, label: string): string {
  if (!href) return '';
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
    <tr><td align="center">
      <a href="${esc(href)}"
         style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;
                padding:11px 26px;border-radius:6px;font-size:14px;font-weight:500;">
        ${esc(label)} &#8594;
      </a>
    </td></tr>
  </table>`;
}

function emailShell(bannerText: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(bannerText)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f6f8;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation"
             style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:560px;">
        <tr>
          <td style="background-color:#18181b;padding:28px 40px;text-align:center;">
            <p style="margin:0;color:#71717a;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">JKKN Institutions</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:600;">Course enrolment</h1>
          </td>
        </tr>
        <tr>
          <td style="background-color:#059669;padding:14px 40px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:14px;font-weight:500;">${esc(bannerText)}</p>
          </td>
        </tr>
        <tr><td style="padding:32px 40px;">${body}</td></tr>
        <tr>
          <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
              JKKN Institutions &middot; This message was sent because your course application was accepted.<br />
              Never share your password. JKKN staff will never ask you for it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export class CourseWelcomeEmailService {
  /**
   * Sent once, immediately after an approval commits.
   *
   * `idempotencyKey` is the enrollment number: one enrollment, one welcome
   * email. A retried approval cannot produce a second enrollment (the
   * course_enrollments_person_uniq constraint stops it), so this key cannot
   * collide across different people.
   */
  static async sendApprovedEmail(
    params: CourseWelcomeEmailParams,
  ): Promise<CourseWelcomeEmailResult> {
    if (!params.to) {
      // The normal case for an external participant, not a fault.
      return {
        success: false,
        skipped: true,
        skipReason: 'This participant has no email address',
      };
    }
    if (!isConfigured()) {
      logger.warn('courses/email', 'RESEND_API_KEY not configured — skipping', {
        to: params.to,
      });
      return { success: false, skipped: true, skipReason: 'RESEND_API_KEY not configured' };
    }

    const loginUrl = APP_URL ? `${APP_URL}/auth/participant-login` : '';

    const dates = [formatDate(params.courseStartDate), formatDate(params.courseEndDate)]
      .filter(Boolean)
      .join(' – ');

    const courseRows: { label: string; value: string }[] = [
      { label: 'Course', value: esc(params.courseTitle) },
    ];
    if (dates) courseRows.push({ label: 'Dates', value: esc(dates) });
    if (params.venueText) courseRows.push({ label: 'Venue', value: esc(params.venueText) });
    if (params.courseMode) {
      courseRows.push({
        label: 'Mode',
        value: esc(params.courseMode.charAt(0).toUpperCase() + params.courseMode.slice(1)),
      });
    }
    courseRows.push({ label: 'Package', value: esc(params.packageName) });
    courseRows.push({
      label: 'Total payable',
      value: esc(inr.format(Number(params.totalPayable ?? 0))),
    });
    courseRows.push({ label: 'Enrolment number', value: esc(params.enrollmentNumber) });

    const opening = params.isReissue
      ? `<p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
           New sign-in details have been issued for your place on
           <strong>${esc(params.courseTitle)}</strong>.
           <strong>Any password you were given before has now stopped working</strong> —
           use the one below.
         </p>`
      : `<p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.65;">
           Your application for <strong>${esc(params.courseTitle)}</strong> has been accepted.
           You now have a JKKN ID, which is your permanent identity across JKKN Institutions.
         </p>`;

    const body = `
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">
        Hi ${esc(params.participantName)},
      </p>
      ${opening}
      ${credentialsCard(params.jkknId, params.tempPassword)}
      <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.65;">
        Sign in with your <strong>JKKN ID</strong> and password — not an email address —
        to see your course and your payment schedule.
      </p>
      ${actionButton(loginUrl, 'Sign in')}
      ${detailsCard('Your enrolment', courseRows)}
      ${instalmentsTable(params.instalments)}
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.65;">
        To pay an instalment, contact the institution running your course.
        If anything above looks wrong, reply to this message or get in touch with them.
      </p>`;

    try {
      const resend = await getResend();
      const { data, error } = await resend.emails.send(
        {
          from: FROM_EMAIL,
          to: params.to,
          subject: params.isReissue
            ? `Your JKKN sign-in details — ${params.courseTitle}`
            : `You are enrolled — ${params.courseTitle}`,
          html: emailShell(
            params.isReissue
              ? '&#128273;&nbsp; New sign-in details'
              : '&#10003;&nbsp; Your application was accepted',
            body,
          ),
        },
        // A reissue MUST NOT reuse the enrolment's key: Resend would treat it as
        // a duplicate of the original welcome and silently drop it, so the
        // participant would never receive the new password.
        {
          headers: {
            'Idempotency-Key': params.isReissue
              ? `course-reissue-${params.enrollmentNumber}-${params.jkknId}-${params.tempPassword ?? ''}`
              : `course-welcome-${params.enrollmentNumber}`,
          },
        },
      );

      if (error) {
        logger.error('courses/email', 'Resend API error', { error, to: params.to });
        return { success: false, error: (error as any).message ?? String(error) };
      }

      logger.info('courses/email', 'Welcome email sent', {
        resendId: data?.id,
        enrollment: params.enrollmentNumber,
      });
      return { success: true, resendId: data?.id };
    } catch (err: any) {
      logger.error('courses/email', 'Unexpected send error', err);
      return { success: false, error: err?.message ?? 'Unknown error' };
    }
  }
}
