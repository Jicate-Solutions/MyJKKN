'use client';

/**
 * PeriodAuditTimeline — vertical timeline of hr_payroll_period_approvals rows.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md Q6 + E7:
 *   - Everyone in the chain sees everything (transparency).
 *   - Special rendering for stage='rejected_to_prior' (red x icon,
 *     "Rejected from {rejected_from_stage}").
 *   - Special rendering for stage='backdated_approval' (amber history icon,
 *     "Backdated by Director"). DOM id matches BACKDATE_AUDIT_ROW_ID so the
 *     backdate-badge click can scroll into view.
 *   - Empty state when no approvals yet (draft period).
 *   - Chronological order: most recent first.
 */

import {
  Check,
  History,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { HRPayrollPeriodApproval, PayrollApprovalStage } from '@/types/hr-payroll';

import { BACKDATE_AUDIT_ROW_ID } from './period-backdate-badge';

const STAGE_LABELS: Record<PayrollApprovalStage, string> = {
  prepared: 'Prepared for review',
  cao_reviewed: 'CAO reviewed',
  accounts_verified: 'Accounts verified',
  chairperson_approved: 'Chairperson approved',
  distributed: 'Payslips distributed',
  backdated_approval: 'Backdated approval',
  rejected_to_prior: 'Rejected to prior stage',
};

interface IconStyle {
  Icon: LucideIcon;
  iconClass: string;
  bgClass: string;
}

function styleForStage(stage: PayrollApprovalStage): IconStyle {
  if (stage === 'rejected_to_prior') {
    return { Icon: X, iconClass: 'text-red-700', bgClass: 'bg-red-50 border-red-300' };
  }
  if (stage === 'backdated_approval') {
    return { Icon: History, iconClass: 'text-amber-700', bgClass: 'bg-amber-50 border-amber-300' };
  }
  return { Icon: Check, iconClass: 'text-emerald-700', bgClass: 'bg-emerald-50 border-emerald-300' };
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PeriodAuditTimeline({
  approvals,
  userLookup,
  isLoading,
}: {
  approvals: HRPayrollPeriodApproval[];
  userLookup: Record<string, string>;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Audit timeline</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-muted/60 animate-pulse" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Most recent first
  const sorted = [...approvals].sort((a, b) =>
    new Date(b.acted_at).getTime() - new Date(a.acted_at).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No actions yet. The first audit row writes when the period is prepared for review.
          </p>
        ) : (
          <div className="space-y-4">
            {sorted.map((row) => {
              const { Icon, iconClass, bgClass } = styleForStage(row.stage);
              const actor = userLookup[row.approver_id] ?? row.approver_id.slice(0, 8);
              const domId = row.stage === 'backdated_approval' ? BACKDATE_AUDIT_ROW_ID : undefined;

              return (
                <div key={row.id} id={domId} className="flex gap-3">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 shrink-0',
                      bgClass,
                    )}
                  >
                    <Icon className={cn('h-4 w-4', iconClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">{STAGE_LABELS[row.stage]}</span>
                      {row.stage === 'rejected_to_prior' && row.rejected_from_stage && (
                        <span className="text-xs text-red-700">
                          from {row.rejected_from_stage}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        by {actor}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {formatFullDate(row.acted_at)}
                      </span>
                    </div>
                    {row.comment && (
                      <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                        {row.comment}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
