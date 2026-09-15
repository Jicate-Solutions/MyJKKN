/**
 * The applicant's approved / rejected email for a leave, short time off or
 * comp-off decision — one row of hr_decision_emails (2026-09-11).
 *
 * Queued by a database trigger on the final decision and sent by
 * lib/services/hr/decision-email-service.ts. See
 * supabase/migrations/20260911200000_hr_decision_email_outbox.sql
 */

export type DecisionEmailStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface HrDecisionEmail {
  id: string;
  leave_application_id: string | null;
  comp_off_credit_id: string | null;
  /** 'revoked' = an approval taken back (approved → rejected), 2026-09-12. */
  decision: 'approved' | 'rejected' | 'revoked';
  /** staff.institution_email at decision time; null when there was none (skipped). */
  to_email: string | null;
  status: DecisionEmailStatus;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

/** After this many failed sends the email is marked failed for good. */
export const DECISION_EMAIL_MAX_ATTEMPTS = 5;
