/**
 * Sends the applicant's approved / rejected email for leave, short time off and
 * comp-off decisions (2026-09-11).
 *
 * SERVER ONLY — service-role client and the Resend key. The rows are queued by
 * a database trigger on the final decision (hr_decision_emails; see
 * supabase/migrations/20260911200000_hr_decision_email_outbox.sql). This
 * service takes due rows, sends each one and records what happened, so HR can
 * see it in the request detail. Called right after a decision (next/server
 * `after`) and every 5 minutes by /api/cron/hr/decision-emails for retries.
 *
 * Never throws: an email problem must not turn into a failed decision.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { resend } from '@/lib/resend';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils';
import {
  buildDecisionEmail,
  type DecisionEmailDetails,
} from '@/lib/hr/leave/decision-email-template';
import { LEAVE_DURATION_LABELS, type LeaveDurationType } from '@/types/hr';
import { formatWorkLocation, type CompOffWorkLocation } from '@/types/hr-comp-off';
import { DECISION_EMAIL_MAX_ATTEMPTS } from '@/types/hr-decision-email';

/** Minutes to wait after failed attempt 1, 2, 3, 4. Attempt 5 failing is final. */
export const DECISION_EMAIL_RETRY_MINUTES = [5, 30, 120, 360];

/** Resend's default limit is a few requests a second per team; stay under it. */
const SEND_GAP_MS = 550;

interface QueueRow {
  id: string;
  leave_application_id: string | null;
  comp_off_credit_id: string | null;
  employee_id: string;
  decision: string;
  to_email: string | null;
  attempts: number;
}

export interface DecisionEmailFlushResult {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
}

function fromAddress(): string {
  const from = (process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev').trim();
  return from.includes('<') ? from : `JKKN HR <${from}>`;
}

function appLink(path: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function staffName(supabase: SupabaseClient, staffId: string): Promise<string> {
  const { data, error } = await supabase
    .from('staff')
    .select('first_name, last_name')
    .eq('id', staffId)
    .maybeSingle();
  if (error) throw error;
  return [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();
}

async function profileName(supabase: SupabaseClient, profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.full_name?.trim() || null;
}

async function leaveDetails(supabase: SupabaseClient, row: QueueRow): Promise<DecisionEmailDetails> {
  const { data: app, error } = await supabase
    .from('hr_leave_applications')
    .select(
      'id, leave_type_id, start_date, end_date, start_time, end_time, duration_type, duration_minutes, total_days, rejection_reason, final_approver_id, revoked_by, revoke_reason'
    )
    .eq('id', row.leave_application_id as string)
    .single();
  if (error) throw error;

  const { data: type, error: typeError } = await supabase
    .from('hr_leave_types')
    .select('leave_type_name, request_category')
    .eq('id', app.leave_type_id)
    .maybeSingle();
  if (typeError) throw typeError;

  const isShort = type?.request_category === 'short_time_off';
  const duration = app.duration_type as LeaveDurationType | null;
  // 'revoked' is carried through verbatim. Collapsing it to 'rejected' here —
  // which this line used to do for anything that was not 'approved' — would send
  // somebody whose leave was granted last week a mail headed "Rejected".
  const decision: DecisionEmailDetails['decision'] =
    row.decision === 'approved' ? 'approved' : row.decision === 'revoked' ? 'revoked' : 'rejected';

  return {
    kind: isShort ? 'short_time_off' : 'leave',
    decision,
    staffName: await staffName(supabase, row.employee_id),
    typeName: type?.leave_type_name ?? null,
    startDate: app.start_date,
    endDate: app.end_date,
    startTime: app.start_time,
    endTime: app.end_time,
    totalDays: app.total_days,
    durationMinutes: app.duration_minutes,
    durationLabel:
      !isShort && duration && duration !== 'full' ? LEAVE_DURATION_LABELS[duration] ?? null : null,
    decidedBy: await profileName(supabase, app.final_approver_id),
    revokedBy:
      decision === 'revoked' ? await profileName(supabase, app.revoked_by) : null,
    rejectionReason: decision === 'revoked' ? app.revoke_reason : app.rejection_reason,
    link: appLink(`/hr/leave/${app.id}`),
  };
}

async function compOffDetails(supabase: SupabaseClient, row: QueueRow): Promise<DecisionEmailDetails> {
  const { data: credit, error } = await supabase
    .from('hr_comp_off_credits')
    .select('worked_date, expires_on, credit_days, work_location, work_place, rejection_reason, approved_by, revoked_by, revoke_reason')
    .eq('id', row.comp_off_credit_id as string)
    .single();
  if (error) throw error;

  const decision: DecisionEmailDetails['decision'] =
    row.decision === 'approved' ? 'approved' : row.decision === 'revoked' ? 'revoked' : 'rejected';

  return {
    kind: 'comp_off',
    decision,
    staffName: await staffName(supabase, row.employee_id),
    workedDate: credit.worked_date,
    workLocation: credit.work_location
      ? formatWorkLocation(credit.work_location as CompOffWorkLocation, 'claim')
      : null,
    workPlace: credit.work_place,
    expiresOn: credit.expires_on,
    creditDays: credit.credit_days,
    decidedBy: await profileName(supabase, credit.approved_by),
    revokedBy:
      decision === 'revoked' ? await profileName(supabase, credit.revoked_by) : null,
    rejectionReason: decision === 'revoked' ? credit.revoke_reason : credit.rejection_reason,
    link: appLink('/hr/leave/compensatory-off'),
  };
}

async function record(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('hr_decision_emails').update(patch).eq('id', id);
  if (error) console.error('[hr/decision-email] could not record outcome', id, getErrorMessage(error));
}

export class HrDecisionEmailService {
  /**
   * Send whatever is due — for one request when an id is given (right after
   * its decision), otherwise the oldest due rows (the cron).
   */
  static async flush(
    opts: { leaveApplicationId?: string; compOffCreditId?: string; limit?: number } = {},
    client?: SupabaseClient
  ): Promise<DecisionEmailFlushResult> {
    const result: DecisionEmailFlushResult = { claimed: 0, sent: 0, retrying: 0, failed: 0 };

    // Without a key nothing is claimed, so no attempt is burned; the rows wait
    // for the cron once the key is configured.
    if (!process.env.RESEND_API_KEY) {
      console.warn('[hr/decision-email] RESEND_API_KEY not configured — nothing sent');
      return result;
    }

    try {
      const supabase = client ?? createServiceRoleClient();
      const args: {
        p_leave_application_id?: string;
        p_comp_off_credit_id?: string;
        p_limit?: number;
      } = {};
      if (opts.leaveApplicationId) args.p_leave_application_id = opts.leaveApplicationId;
      if (opts.compOffCreditId) args.p_comp_off_credit_id = opts.compOffCreditId;
      if (opts.limit) args.p_limit = opts.limit;

      const { data, error } = await supabase.rpc('fn_hr_decision_emails_claim', args);
      if (error) throw error;
      const rows = (data ?? []) as QueueRow[];
      result.claimed = rows.length;

      for (const [i, row] of rows.entries()) {
        if (i > 0) await sleep(SEND_GAP_MS);
        try {
          if (!row.to_email) throw new Error('No recipient address');
          const details = row.leave_application_id
            ? await leaveDetails(supabase, row)
            : await compOffDetails(supabase, row);
          const email = buildDecisionEmail(details);

          const { data: sent, error: sendError } = await resend.emails.send(
            {
              from: fromAddress(),
              to: row.to_email,
              subject: email.subject,
              html: email.html,
              text: email.text,
            },
            // The row id: a retry after a lost response can never send twice.
            { idempotencyKey: `hr-decision-email/${row.id}` }
          );
          if (sendError) throw new Error(sendError.message || sendError.name);

          await record(supabase, row.id, {
            status: 'sent',
            sent_at: new Date().toISOString(),
            resend_id: sent?.id ?? null,
            last_error: null,
          });
          result.sent += 1;
        } catch (err) {
          const message = getErrorMessage(err).slice(0, 500);
          if (row.attempts >= DECISION_EMAIL_MAX_ATTEMPTS) {
            await record(supabase, row.id, { status: 'failed', last_error: message });
            result.failed += 1;
          } else {
            const wait = DECISION_EMAIL_RETRY_MINUTES[Math.max(0, row.attempts - 1)] ?? 360;
            await record(supabase, row.id, {
              last_error: message,
              next_attempt_at: new Date(Date.now() + wait * 60_000).toISOString(),
            });
            result.retrying += 1;
          }
          console.warn('[hr/decision-email] send failed', row.id, message);
        }
      }
    } catch (err) {
      console.error('[hr/decision-email] flush failed', getErrorMessage(err));
    }
    return result;
  }
}
