'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  active: { label: 'Active', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  at_risk: { label: 'At Risk', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  dormant: { label: 'Dormant', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  pending_approval: { label: 'Pending', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
} as const;

interface DepartmentStatusBadgeProps {
  status: keyof typeof STATUS_CONFIG;
  size?: 'sm' | 'default';
}

export function DepartmentStatusBadge({ status, size = 'default' }: DepartmentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.active;
  return (
    <Badge variant="outline" className={cn(config.className, size === 'sm' && 'text-xs px-1.5 py-0')}>
      {config.label}
    </Badge>
  );
}
