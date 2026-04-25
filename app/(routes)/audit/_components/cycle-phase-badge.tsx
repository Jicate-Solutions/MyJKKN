// app/(routes)/audit/_components/cycle-phase-badge.tsx
// Colored phase badge reused across dashboard + cycles list + detail.
// Spec decision #7: phases are a DB enum.

'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AuditCyclePhase } from '@/lib/types/audit';

interface CyclePhaseBadgeProps {
  phase: AuditCyclePhase;
  className?: string;
}

const PHASE_META: Record<
  AuditCyclePhase,
  { label: string; classes: string }
> = {
  draft: {
    label: 'Draft',
    classes:
      'border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
  'in-progress': {
    label: 'In Progress',
    classes:
      'border-blue-300 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  },
  rectification: {
    label: 'Rectification',
    classes:
      'border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  },
  'peer-visit': {
    label: 'Peer Visit',
    classes:
      'border-purple-300 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  },
  closed: {
    label: 'Closed',
    classes:
      'border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
};

export function CyclePhaseBadge({ phase, className }: CyclePhaseBadgeProps) {
  const meta = PHASE_META[phase] ?? PHASE_META.draft;
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', meta.classes, className)}
    >
      {meta.label}
    </Badge>
  );
}
