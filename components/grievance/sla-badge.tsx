/**
 * SLA Badge Component
 * F004: Grievance Ticketing System
 *
 * Badge showing SLA status with time remaining/overdue
 */

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import type { GrievanceSLAStatus } from '@/types/grievance';

interface SLABadgeProps {
  status: GrievanceSLAStatus;
  deadline: string;
  showTimeRemaining?: boolean;
  className?: string;
}

const slaConfig = {
  on_track: {
    label: 'On Track',
    className: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle2
  },
  at_risk: {
    label: 'At Risk',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: AlertTriangle
  },
  breached: {
    label: 'Breached',
    className: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertCircle
  }
};

export function SLABadge({
  status,
  deadline,
  showTimeRemaining = true,
  className = ''
}: SLABadgeProps) {
  const config = slaConfig[status];
  const Icon = config.icon;
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const hoursRemaining = differenceInHours(deadlineDate, now);
  const isOverdue = hoursRemaining < 0;

  return (
    <div className="flex flex-col gap-1">
      <Badge variant="outline" className={`flex items-center gap-1 w-fit ${config.className} ${className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>

      {showTimeRemaining && (
        <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
          {isOverdue ? (
            <>
              <Clock className="h-3 w-3 inline mr-1" />
              Overdue by {formatDistanceToNow(deadlineDate)}
            </>
          ) : (
            <>
              <Clock className="h-3 w-3 inline mr-1" />
              {formatDistanceToNow(deadlineDate, { addSuffix: true })}
            </>
          )}
        </span>
      )}
    </div>
  );
}
