'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Info, Briefcase, Plane } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovedLeaveInfo } from '@/lib/services/academic/leave-onduty-attendance-check-service';

interface StudentLeaveIndicatorProps {
  leaveInfo: ApprovedLeaveInfo;
  className?: string;
}

export function StudentLeaveIndicator({
  leaveInfo,
  className
}: StudentLeaveIndicatorProps) {
  const isLeave = leaveInfo.category === 'leave';

  const badgeColor = isLeave
    ? 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-700'
    : 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700';

  const Icon = isLeave ? Plane : Briefcase;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-medium flex items-center gap-1 cursor-help',
              badgeColor,
              className
            )}
          >
            <Icon className="w-3 h-3" />
            <span>{isLeave ? 'Leave' : 'On Duty'}</span>
            <Info className="w-3 h-3" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-2">
            <div className="font-semibold">
              Approved {isLeave ? 'Leave' : 'On Duty'}
            </div>
            <div className="text-sm">
              <div>
                <span className="font-medium">Type:</span> {leaveInfo.subcategory}
              </div>
              <div>
                <span className="font-medium">Period:</span>{' '}
                {new Date(leaveInfo.start_date).toLocaleDateString()} -{' '}
                {new Date(leaveInfo.end_date).toLocaleDateString()}
              </div>
              {leaveInfo.reason && (
                <div>
                  <span className="font-medium">Reason:</span> {leaveInfo.reason}
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              ℹ️ This student has pre-approved {isLeave ? 'leave' : 'on duty'}.
              Attendance will be automatically set.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact version for use in attendance grid
 */
export function StudentLeaveIndicatorCompact({
  leaveInfo
}: {
  leaveInfo: ApprovedLeaveInfo;
}) {
  const isLeave = leaveInfo.category === 'leave';
  const Icon = isLeave ? Plane : Briefcase;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center cursor-help',
              isLeave
                ? 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300'
                : 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
            )}
          >
            <Icon className="w-3 h-3" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="text-xs">
            <div className="font-semibold">
              {isLeave ? '🏖️ Leave' : '💼 On Duty'}
            </div>
            <div>{leaveInfo.subcategory}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
