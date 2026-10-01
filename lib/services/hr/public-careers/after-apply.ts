/**
 * Side effects after a website application is saved. Runs inside next/server
 * `after()`; neither function may throw — the applicant already has their 201.
 *
 * Recipients come ONLY from hr_recruitment_application_recipient_ids, which is
 * a subset of who can read the row under RLS — a service-role fan-out with an
 * ad-hoc profiles query is how leave notifications went cross-college (BUG-005884).
 * Written directly (one notifications row + user_notifications junction rows)
 * rather than via notification-service, which imports the browser client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resend } from '@/lib/resend';
import { buildApplicationConfirmationEmail } from '@/lib/hr/recruitment/application-confirmation-email';
import type { CreatedApplication } from './public-careers-service';
import { withTimeout as raceTimeout } from './with-timeout';

function withTimeout<T>(what: string, p: PromiseLike<T>): Promise<T> {
  return raceTimeout(what, p, AFTER_APPLY_TIMEOUT_MS);
}

/** Upper bound on any single after-apply side effect. A hung Resend or Supabase
 *  call would otherwise hold the invocation until the platform kills it — before
 *  the outcome is written to the row, which is exactly the record we want. */
export const AFTER_APPLY_TIMEOUT_MS = 20_000;

export async function notifyHrOfApplication(
  db: SupabaseClient, app: CreatedApplication, applicantName: string,
): Promise<number> {
  try {
    const { data, error } = await withTimeout(
      'recipient lookup',
      db.rpc('hr_recruitment_application_recipient_ids', { p_institution_id: app.institutionId }),
    );
    if (error) throw error;
    const ids = [...new Set((data ?? []) as string[])];
    if (ids.length === 0) {
      console.warn('[public/careers] no HR recipients for institution', app.institutionId);
      return 0;
    }

    const { data: n, error: nErr } = await withTimeout(
      'notification insert',
      db
        .from('notifications')
        .insert({
          title: 'New application from the website',
          body: `${applicantName} applied for ${app.jobTitle}${app.institutionName ? ` (${app.institutionName})` : ''}.`,
          category: 'hr_recruitment',
          priority: 'normal',
          // created_by is NOT NULL; system-generated cards attribute to the first
          // recipient, as the cron generators do.
          created_by: ids[0],
          targeting: { type: 'user', user_ids: ids },
          url: `/hr/recruitment/applications/${app.applicationId}`,
          metadata: {
            type: 'info',
            action_label: 'Review application',
            application_id: app.applicationId,
            source: 'external_website',
          },
        })
        .select('id')
        .single(),
    );
    if (nErr) throw nErr;

    const notificationId = (n as { id: string }).id;
    const { error: ujErr } = await withTimeout(
      'recipient fan-out',
      db.from('user_notifications').insert(ids.map((user_id) => ({ user_id, notification_id: notificationId }))),
    );
    if (ujErr) throw ujErr;
    return ids.length;
  } catch (err) {
    console.error('[public/careers] HR notification failed', err);
    return 0;
  }
}

type Send = (msg: { from: string; to: string; subject: string; html: string; text: string }) => Promise<{ error: unknown }>;

function fromAddress(): string {
  const from = (process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev').trim();
  return from.includes('<') ? from : `JKKN HR <${from}>`;
}

export async function sendApplicantConfirmation(
  db: SupabaseClient, app: CreatedApplication, to: string, firstName: string,
  send: Send = (msg) => resend.emails.send(msg) as Promise<{ error: unknown }>,
): Promise<void> {
  let patch: Record<string, unknown>;
  try {
    const mail = buildApplicationConfirmationEmail({
      firstName, jobTitle: app.jobTitle, institutionName: app.institutionName, reference: app.reference,
    });
    const { error } = await withTimeout('confirmation email', send({ from: fromAddress(), to, ...mail }));
    patch = error
      ? { confirmation_email_error: String((error as { message?: string }).message ?? error).slice(0, 500) }
      : { confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null };
  } catch (err) {
    patch = { confirmation_email_error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
  try {
    await withTimeout('email outcome write', db.from('hr_job_applications').update(patch).eq('id', app.applicationId));
  } catch (err) {
    console.error('[public/careers] could not record email outcome', err);
  }
}
