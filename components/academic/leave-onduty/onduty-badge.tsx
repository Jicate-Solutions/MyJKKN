'use client';

/**
 * OnDuty Badge Component
 *
 * Special badge for displaying OnDuty status in attendance views.
 * OnDuty counts as Present but with distinct visual indicator.
 *
 * @module components/academic/leave-onduty/onduty-badge
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Briefcase } from 'lucide-react';

interface OnDutyBadgeProps {
  variant?: 'default' | 'compact';
  showIcon?: boolean;
  className?: string;
}

export function OnDutyBadge({
  variant = 'default',
  showIcon = true,
  className,
}: OnDutyBadgeProps) {
  if (variant === 'compact') {
    return (
      <Badge
        variant="outline"
        className={cn(
          'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
          'font-medium',
          className
        )}
      >
        {showIcon && <Briefcase className="h-3 w-3 mr-1" />}
        OD
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
        'font-medium',
        className
      )}
    >
      {showIcon && <Briefcase className="h-3 w-3 mr-1" />}
      OnDuty
    </Badge>
  );
}

/**
 * Attendance Status Badge
 * Updated to include OnDuty status
 */
interface AttendanceStatusBadgeProps {
  status: 'present' | 'absent' | 'late' | 'excused' | 'holiday' | 'onduty';
  showIcon?: boolean;
  variant?: 'default' | 'compact';
  className?: string;
}

export function AttendanceStatusBadge({
  status,
  showIcon = true,
  variant = 'default',
  className,
}: AttendanceStatusBadgeProps) {
  if (status === 'onduty') {
    return <OnDutyBadge variant={variant} showIcon={showIcon} className={className} />;
  }

  const statusConfig = {
    present: {
      label: variant === 'compact' ? 'P' : 'Present',
      className: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    },
    absent: {
      label: variant === 'compact' ? 'A' : 'Absent',
      className: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    },
    late: {
      label: variant === 'compact' ? 'L' : 'Late',
      className: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    },
    excused: {
      label: variant === 'compact' ? 'E' : 'Excused',
      className: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    },
    holiday: {
      label: variant === 'compact' ? 'H' : 'Holiday',
      className: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    },
  };

  const config = statusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn('font-medium', config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
