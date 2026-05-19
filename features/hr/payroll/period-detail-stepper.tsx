'use client';

/**
 * PeriodDetailStepper — horizontal stage strip rendered at top of detail page.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md Q2 + E5:
 *   - 6 stages: Prepared / CAO Reviewed / Accounts Verified /
 *     Chairperson Approved / Distributed / Locked.
 *   - Reached stages show a check icon + actor + relative timestamp.
 *   - Current stage is the right-most reached stage (highlighted).
 *   - Unreached stages render as muted outlined circles.
 *   - Below md breakpoint, labels hide; numbered dots only with current
 *     stage's label visible inline.
 *
 * Rejection note: rejection reverts status one stage back (RPC behavior).
 * The audit timeline panel below the stepper renders rejection events;
 * the stepper itself always reflects the CURRENT status only — no inline
 * red x markers for past rejections.
 */

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { HRPayrollPeriod, PayrollPeriodStatus } from '@/types/hr-payroll';

interface StageDef {
  key: PayrollPeriodStatus;
  label: string;
  shortLabel: string;
  getAt: (p: HRPayrollPeriod) => string | null;
  getBy: (p: HRPayrollPeriod) => string | null;
}

const STAGES: StageDef[] = [
  {
    key: 'prepared',
    label: 'Prepared',
    shortLabel: 'Prep',
    getAt: (p) => p.prepared_at,
    getBy: (p) => p.prepared_by,
  },
  {
    key: 'cao_reviewed',
    label: 'CAO reviewed',
    shortLabel: 'CAO',
    getAt: (p) => p.cao_reviewed_at,
    getBy: (p) => p.cao_reviewed_by,
  },
  {
    key: 'accounts_verified',
    label: 'Accounts verified',
    shortLabel: 'Accts',
    getAt: (p) => p.accounts_verified_at,
    getBy: (p) => p.accounts_verified_by,
  },
  {
    key: 'chairperson_approved',
    label: 'Chairperson approved',
    shortLabel: 'Chair',
    getAt: (p) => p.chairperson_approved_at,
    getBy: (p) => p.chairperson_approved_by,
  },
  {
    key: 'distributed',
    label: 'Distributed',
    shortLabel: 'Dist',
    getAt: (p) => p.distributed_at,
    getBy: (p) => p.distributed_by,
  },
  {
    key: 'locked',
    label: 'Locked',
    shortLabel: 'Lock',
    getAt: (p) => p.locked_at,
    getBy: (p) => p.locked_by,
  },
];

function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function PeriodDetailStepper({
  period,
  userLookup,
}: {
  period: HRPayrollPeriod;
  userLookup: Record<string, string>;
}) {
  const currentIndex = STAGES.findIndex((s) => s.key === period.status);

  return (
    <div className="border rounded-md bg-card p-4">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {STAGES.map((stage, idx) => {
          const reached = idx <= currentIndex;
          const isCurrent = idx === currentIndex;
          const at = stage.getAt(period);
          const by = stage.getBy(period);
          const actor = by ? (userLookup[by] ?? by.slice(0, 8)) : null;

          return (
            <div key={stage.key} className="flex items-center gap-2 min-w-0">
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
                    reached && !isCurrent && 'bg-emerald-500 border-emerald-500 text-white',
                    isCurrent && 'bg-primary border-primary text-primary-foreground ring-2 ring-primary/30',
                    !reached && 'border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  {reached ? <Check className="h-4 w-4" /> : <span className="text-xs">{idx + 1}</span>}
                </div>
                <div className="text-center min-w-0">
                  <div
                    className={cn(
                      'text-xs font-medium hidden md:block',
                      isCurrent ? 'text-primary' : reached ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {stage.label}
                  </div>
                  <div className={cn('text-xs font-medium md:hidden', isCurrent ? 'text-primary' : 'text-muted-foreground')}>
                    {isCurrent ? stage.label : stage.shortLabel}
                  </div>
                  {reached && (at || actor) && (
                    <div className="text-[10px] text-muted-foreground hidden md:block">
                      {actor ? `${actor} · ` : ''}{formatShortDate(at)}
                    </div>
                  )}
                </div>
              </div>
              {idx < STAGES.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 min-w-[20px] md:min-w-[40px]',
                    idx < currentIndex ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
