/**
 * Priority Badge Component
 * F004: Grievance Ticketing System
 *
 * Color-coded badge for ticket priority levels
 */

import { Badge } from '@/components/ui/badge';
import { AlertCircle, ArrowUp, Minus, Zap } from 'lucide-react';
import type { GrievancePriority } from '@/types/grievance';

interface PriorityBadgeProps {
  priority: GrievancePriority;
  showIcon?: boolean;
  className?: string;
}

const priorityConfig: Record<
  GrievancePriority,
  {
    label: string;
    className: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  low: {
    label: 'Low',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: Minus
  },
  medium: {
    label: 'Medium',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: ArrowUp
  },
  high: {
    label: 'High',
    className: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: AlertCircle
  },
  urgent: {
    label: 'Urgent',
    className: 'bg-red-100 text-red-700 border-red-200',
    icon: Zap
  }
};

export function PriorityBadge({ priority, showIcon = true, className = '' }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`flex items-center gap-1 w-fit ${config.className} ${className}`}>
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
