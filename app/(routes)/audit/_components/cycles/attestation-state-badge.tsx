'use client';

// app/(routes)/audit/_components/cycles/attestation-state-badge.tsx
// Small traffic-light badge for attestation state cells in the grid.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttestationLevel } from '@/lib/types/audit';

const META: Record<AttestationLevel, { label: string; classes: string }> = {
  pending: {
    label: 'Pending',
    classes:
      'border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
  compliant: {
    label: 'Compliant',
    classes:
      'border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  partial: {
    label: 'Partial',
    classes:
      'border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  },
  'non-compliant': {
    label: 'Non-compliant',
    classes:
      'border-red-300 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
};

interface AttestationStateBadgeProps {
  level: AttestationLevel;
  className?: string;
  compact?: boolean;
}

export function AttestationStateBadge({
  level,
  className,
  compact,
}: AttestationStateBadgeProps) {
  const meta = META[level] ?? META.pending;
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        compact ? 'text-[10px] px-1.5 py-0' : 'text-xs',
        meta.classes,
        className,
      )}
    >
      {meta.label}
    </Badge>
  );
}
