'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivePrivilegeInfo } from '@/types/privileges';

interface PrivilegeOdIndicatorProps {
  privileges: ActivePrivilegeInfo[];
  className?: string;
}

/**
 * Full badge indicator showing privilege-based auto-OD status.
 * Displayed next to student name in the attendance grid.
 */
export function PrivilegeOdIndicator({
  privileges,
  className
}: PrivilegeOdIndicatorProps) {
  // Find the first group that has full_od
  const odPrivilege = privileges.find(p =>
    p.privilege_types.some(t => t.key === 'full_od')
  );

  if (!odPrivilege) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'bg-amber-50 text-amber-700 border-amber-200 text-xs whitespace-nowrap cursor-help',
              'dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700',
              className
            )}
          >
            <Shield className="h-3 w-3 mr-1" />
            Auto OD
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-sm">
          <div className="space-y-2">
            <div className="font-semibold">
              Privilege-Based Auto On-Duty
            </div>
            <div className="text-sm">
              <div>
                <span className="font-medium">Group:</span> {odPrivilege.group_name}
              </div>
              <div>
                <span className="font-medium">Director Order:</span> #{odPrivilege.reference_code}
              </div>
              {odPrivilege.start_date && (
                <div>
                  <span className="font-medium">Since:</span>{' '}
                  {new Date(odPrivilege.start_date).toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              This student is automatically marked as On-Duty via the Exceptions &amp; Privileges module.
              This status cannot be changed by faculty.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact version for tight spaces — just a shield icon with tooltip.
 */
export function PrivilegeOdIndicatorCompact({
  privileges
}: {
  privileges: ActivePrivilegeInfo[];
}) {
  const odPrivilege = privileges.find(p =>
    p.privilege_types.some(t => t.key === 'full_od')
  );

  if (!odPrivilege) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-5 h-5 rounded-full flex items-center justify-center cursor-help bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300">
            <Shield className="w-3 h-3" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="text-xs">
            <div className="font-semibold">Auto OD (Privilege)</div>
            <div>{odPrivilege.group_name} — #{odPrivilege.reference_code}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
