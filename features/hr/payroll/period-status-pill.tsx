/**
 * PeriodStatusPill — colored pill rendering a hr_payroll_periods.status value.
 *
 * Palette locked in spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md (E2):
 *   draft               → slate    (gray)
 *   prepared            → blue
 *   cao_reviewed        → indigo
 *   accounts_verified   → purple   (collision-resolved against backdate amber)
 *   chairperson_approved→ emerald
 *   distributed         → teal
 *   locked              → stone    (dark gray, terminal)
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PayrollPeriodStatus } from '@/types/hr-payroll';

const STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
  draft: 'Draft',
  prepared: 'Prepared',
  cao_reviewed: 'CAO reviewed',
  accounts_verified: 'Accounts verified',
  chairperson_approved: 'Chairperson approved',
  distributed: 'Distributed',
  locked: 'Locked',
};

const STATUS_CLASSES: Record<PayrollPeriodStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-300',
  prepared: 'bg-blue-50 text-blue-700 border-blue-300',
  cao_reviewed: 'bg-indigo-50 text-indigo-700 border-indigo-300',
  accounts_verified: 'bg-purple-50 text-purple-700 border-purple-300',
  chairperson_approved: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  distributed: 'bg-teal-50 text-teal-700 border-teal-300',
  locked: 'bg-stone-200 text-stone-800 border-stone-400',
};

export function PeriodStatusPill({
  status,
  size = 'md',
}: {
  status: PayrollPeriodStatus;
  size?: 'sm' | 'md';
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        STATUS_CLASSES[status],
        size === 'sm' && 'text-[10px] px-1.5 py-0 h-5',
      )}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
