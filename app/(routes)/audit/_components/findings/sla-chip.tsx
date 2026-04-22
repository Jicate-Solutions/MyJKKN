'use client';

// Audit Workflow Sprint 01 — SLA days-remaining chip.
// Colour coding: green >7d, yellow 3–7d, red <3d or overdue.
// Expected-resolution window is stored on service_requests.requester_context.expected_resolution_days
// (red → p1_sla_days, yellow/green → p2_sla_days). This component only renders; callers
// compute the reference "submitted_at" + expected_resolution_days to derive deadline.

import { cn } from '@/lib/utils';
import { Clock, AlertTriangle } from 'lucide-react';

interface SlaChipProps {
  /** ISO timestamp when the finding was logged (service_requests.submitted_at). */
  submittedAt: string | null;
  /** Expected rectification window in days (derived from parameter SLA × severity). */
  expectedResolutionDays: number | null | undefined;
  className?: string;
}

/**
 * Compute days remaining until SLA breach.
 * Negative value = overdue.
 */
function computeDaysRemaining(
  submittedAt: string | null,
  expectedResolutionDays: number | null | undefined
): number | null {
  if (!submittedAt || !expectedResolutionDays || expectedResolutionDays <= 0) {
    return null;
  }
  const submitted = new Date(submittedAt).getTime();
  if (Number.isNaN(submitted)) return null;
  const deadline = submitted + expectedResolutionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const diffMs = deadline - now;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function SlaChip({ submittedAt, expectedResolutionDays, className }: SlaChipProps) {
  const daysRemaining = computeDaysRemaining(submittedAt, expectedResolutionDays);

  if (daysRemaining === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
          'bg-muted text-muted-foreground border-muted-foreground/20',
          className
        )}
      >
        <Clock className="h-3 w-3" />
        SLA n/a
      </span>
    );
  }

  const isOverdue = daysRemaining < 0;
  const isCritical = daysRemaining >= 0 && daysRemaining < 3;
  const isWarning = daysRemaining >= 3 && daysRemaining <= 7;

  const colour =
    isOverdue || isCritical
      ? 'bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800'
      : isWarning
        ? 'bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800'
        : 'bg-green-100 text-green-900 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800';

  const Icon = isOverdue ? AlertTriangle : Clock;
  const label = isOverdue
    ? `Overdue ${Math.abs(daysRemaining)}d`
    : daysRemaining === 0
      ? 'Due today'
      : `${daysRemaining}d left`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        colour,
        className
      )}
      title={
        isOverdue
          ? `Overdue by ${Math.abs(daysRemaining)} day(s) — SLA breached`
          : `${daysRemaining} day(s) until SLA deadline`
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
