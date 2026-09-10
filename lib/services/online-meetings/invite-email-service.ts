/**
 * Online Meetings — invitation emails.
 *
 * WHY THIS EXISTS EVEN THOUGH GOOGLE ALREADY EMAILS THE ATTENDEES
 *   A Google Calendar invite carries the Meet link. It does NOT carry the join
 *   token, and the token is the only thing that makes a guest identifiable to
 *   the attendance report. A guest who clicks straight through to Meet from a
 *   calendar invite is present in the room and absent from every record. So
 *   this email — the one with /join/[token] in it — is the invitation that
 *   matters, and the calendar entry is the convenience.
 *
 * SKIPPING IS NORMAL, NOT AN ERROR
 *   External guests frequently have no email address; that is exactly why the
 *   link is a token rather than a login. `skipped` is reported distinctly from
 *   `error` so the UI can say "copy these links and send them yourself"
 *   instead of "something went wrong". The host always has the link on screen,
 *   so a mail outage never blocks an invitation.
 *
 * SERVER-ONLY — RESEND_API_KEY is a server secret.
 */

import { logger } from '@/lib/utils/enhanced-logger';

// NOT a top-level `import { resend } from '@/lib/resend'`. That module runs
// `new Resend(process.env.RESEND_API_KEY)` at load time and the constructor
// THROWS when the key is absent, so a static import would crash this module —
// and the route that imports it — on any deployment without the key set.
// Imported lazily, after isConfigured(), so a missing key stays what it should
// be: an email that is skipped.
async function getResend() {
  const mod = await import('@/lib/resend');
  return mod.resend;
}

const LOG_SCOPE = 'online-meetings/invite-email';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.jkkn.ai').replace(/\/$/, '');

export interface InviteEmailResult {
  participantId: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  resendId?: string;
}

export interface MeetingInviteRecipient {
  participantId: string;
  name: string;
  email: string | null;
  joinToken: string;
}

export interface MeetingInviteContext {
  title: string;
  description?: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone: string;
  hostName: string | null;
  meetUrl: string | null;
}

export function isInviteEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** The guest-facing URL for one participant. Also shown in the host's UI. */
export function joinUrlFor(joinToken: string): string {
  return `${APP_URL}/join/${joinToken}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWindow(ctx: MeetingInviteContext): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: ctx.timezone || 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  const start = new Date(ctx.startsAt).toLocaleString('en-IN', opts);
  const end = new Date(ctx.endsAt).toLocaleTimeString('en-IN', {
    timeZone: ctx.timezone || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

function emailHtml(ctx: MeetingInviteContext, to: MeetingInviteRecipient): string {
  const joinUrl = joinUrlFor(to.joinToken);
  const host = ctx.hostName ? `${escapeHtml(ctx.hostName)} has` : 'You have been';
  return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <p style="font-size:15px;line-height:1.5">Hello ${escapeHtml(to.name)},</p>
  <p style="font-size:15px;line-height:1.5">
    ${host} invited you to an online meeting.
  </p>
  <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:0 0 6px;font-size:17px;font-weight:600">${escapeHtml(ctx.title)}</p>
    <p style="margin:0;font-size:14px;color:#555">${escapeHtml(formatWindow(ctx))}</p>
    ${
      ctx.description
        ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#333">${escapeHtml(ctx.description)}</p>`
        : ''
    }
  </div>
  <p style="margin:24px 0">
    <a href="${joinUrl}"
       style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:15px;font-weight:600">
      Open your meeting page
    </a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#555">
    Use this page rather than the meeting link alone &mdash; it is how your
    attendance is recorded, and it is where any live polls appear.
    ${ctx.meetUrl ? 'The video link is on it.' : ''}
  </p>
  <p style="font-size:12px;line-height:1.5;color:#888;margin-top:24px">
    This link is personal to you. Please do not forward it &mdash; anyone who
    opens it will be recorded as you.
  </p>
</div>`.trim();
}

/**
 * Send one invitation. Never throws.
 *
 * A recipient with no email is `skipped`, not failed: the host copies their
 * link from the participants tab and sends it however they normally reach that
 * person.
 */
export async function sendMeetingInvite(
  ctx: MeetingInviteContext,
  to: MeetingInviteRecipient,
): Promise<InviteEmailResult> {
  if (!to.email) {
    return {
      participantId: to.participantId,
      success: false,
      skipped: true,
      skipReason: 'No email address on file — share the link directly.',
    };
  }
  if (!isInviteEmailConfigured()) {
    return {
      participantId: to.participantId,
      success: false,
      skipped: true,
      skipReason: 'Email is not configured on this deployment (RESEND_API_KEY).',
    };
  }

  try {
    const resend = await getResend();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: to.email,
      subject: `Invitation: ${ctx.title}`,
      html: emailHtml(ctx, to),
    });

    if (error) {
      logger.error(LOG_SCOPE, 'Resend API error', { error, participantId: to.participantId });
      return {
        participantId: to.participantId,
        success: false,
        error: typeof error === 'string' ? error : ((error as any).message ?? 'Send failed'),
      };
    }
    return { participantId: to.participantId, success: true, resendId: data?.id };
  } catch (err) {
    logger.error(LOG_SCOPE, 'send threw', err);
    return {
      participantId: to.participantId,
      success: false,
      error: err instanceof Error ? err.message : 'Send failed',
    };
  }
}

/**
 * Send to many, sequentially.
 *
 * Sequential on purpose: a bulk department invite can be hundreds of
 * recipients, and firing them all at once is the fastest way to be rate
 * limited by the provider and have most of them fail. Each result is reported
 * separately so the UI can list exactly who was not reached.
 */
export async function sendMeetingInvites(
  ctx: MeetingInviteContext,
  recipients: MeetingInviteRecipient[],
): Promise<InviteEmailResult[]> {
  const results: InviteEmailResult[] = [];
  for (const to of recipients) {
    results.push(await sendMeetingInvite(ctx, to));
  }
  return results;
}
