'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { INTERVIEW_STATUS_LABELS, type InterviewStatus } from '@/types/hr-recruitment';

const STATUS_COLORS: Record<InterviewStatus, string> = {
  scheduled:    'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
  completed:    'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
  cancelled:    'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300',
  no_show:      'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
  rescheduled:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
};

interface InterviewStatusBadgeProps {
  status: InterviewStatus;
  className?: string;
}

export function InterviewStatusBadge({ status, className }: InterviewStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-medium',
        STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700',
        className,
      )}
    >
      {INTERVIEW_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
