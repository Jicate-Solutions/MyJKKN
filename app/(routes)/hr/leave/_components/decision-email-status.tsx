'use client';

// One line in a decided request's detail sheet: did the applicant get their
// approved / rejected email? (2026-09-11). Renders nothing while loading and for
// decisions made before these emails existed — no row means no email was due.

import { Mail, MailCheck, MailWarning, MailX } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDecisionEmail, type DecisionEmailTarget } from '@/hooks/hr/use-decision-email';
import { DECISION_EMAIL_MAX_ATTEMPTS, type HrDecisionEmail } from '@/types/hr-decision-email';

const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

function describe(e: HrDecisionEmail): { icon: typeof Mail; tone: string; text: string } {
  const to = e.to_email ?? 'the applicant';
  switch (e.status) {
    case 'sent':
      return {
        icon: MailCheck,
        tone: 'text-emerald-700 dark:text-emerald-400',
        text: `Email sent to ${to}${e.sent_at ? ` · ${fmtStamp(e.sent_at)}` : ''}`,
      };
    case 'failed':
      return {
        icon: MailX,
        tone: 'text-destructive',
        text: `Email to ${to} failed${e.last_error ? `: ${e.last_error}` : ''}`,
      };
    case 'skipped':
      return {
        icon: MailWarning,
        tone: 'text-muted-foreground',
        text: `No email sent — ${e.last_error ?? 'no address on file'}`,
      };
    default:
      return {
        icon: Mail,
        tone: 'text-muted-foreground',
        text:
          e.attempts > 0 && e.last_error
            ? `Email to ${to} not sent yet (attempt ${e.attempts} of ${DECISION_EMAIL_MAX_ATTEMPTS}): ${e.last_error} — retrying`
            : `Email to ${to} is queued`,
      };
  }
}

export function DecisionEmailStatus({
  target,
  className,
}: {
  target: DecisionEmailTarget;
  className?: string;
}) {
  const { data } = useDecisionEmail(target);
  if (!data) return null;
  const { icon: Icon, tone, text } = describe(data);
  return (
    <p
      className={cn('flex items-start gap-1.5 text-xs leading-snug', tone, className)}
      data-testid="decision-email-status"
    >
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="break-words">{text}</span>
    </p>
  );
}
