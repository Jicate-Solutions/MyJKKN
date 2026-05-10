// app/(routes)/internships/cycles/_components/cycle-status-badge.tsx
// Color-coded pill for InternshipCycle.status. Uses static palette aligned with
// /admin/internship-policy color conventions; per-college label overrides from
// internship_cycle_status_labels can be layered in later via an optional prop.

import { Badge } from '@/components/ui/badge';
import type { CycleStatus } from '@/lib/services/internships/types';

type StatusStyle = {
  label: string;
  className: string;
};

const STATUS_STYLES: Record<CycleStatus, StatusStyle> = {
  draft: {
    label: 'Draft',
    className: 'bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200',
  },
  pending_approval: {
    label: 'Pending approval',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200',
  },
  approved: {
    label: 'Approved',
    className: 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200',
  },
  fee_checking: {
    label: 'Fee checking',
    className: 'bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-200',
  },
  assignments_ready: {
    label: 'Assignments ready',
    className: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-indigo-200',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200',
  },
  completed: {
    label: 'Completed',
    className: 'bg-teal-100 text-teal-800 hover:bg-teal-100 border-teal-200',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-100 border-rose-200',
  },
};

interface CycleStatusBadgeProps {
  status: CycleStatus;
  /** Override the default static label (e.g. per-college label_text from internship_cycle_status_labels) */
  label?: string;
  className?: string;
}

export function CycleStatusBadge({ status, label, className }: CycleStatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <Badge
      variant="outline"
      className={[style.className, 'font-medium text-xs', className].filter(Boolean).join(' ')}
    >
      {label ?? style.label}
    </Badge>
  );
}
