'use client';

// Audit Workflow Sprint 01 — finding severity badge.
// Red/Yellow/Green traffic-light semantics (decision #4 — DB enum, universal).

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FindingSeverity } from '@/lib/types/audit';

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  red: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800',
  yellow:
    'bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800',
  green:
    'bg-green-100 text-green-900 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800',
};

const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
};

interface SeverityBadgeProps {
  severity: FindingSeverity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', SEVERITY_STYLES[severity], className)}
    >
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}
