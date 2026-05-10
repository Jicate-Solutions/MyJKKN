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
  open: {
    label: 'Open',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200',
  },
  closed: {
    label: 'Closed',
    className: 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200',
  },
  archived: {
    label: 'Archived',
    className: 'bg-zinc-100 text-zinc-600 hover:bg-zinc-100 border-zinc-200',
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
