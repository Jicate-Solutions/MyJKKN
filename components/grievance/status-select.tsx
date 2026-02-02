'use client';

/**
 * Status Select Component
 * F004: Grievance Ticketing System
 *
 * Dropdown for changing ticket status with validation
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw
} from 'lucide-react';
import type { GrievanceStatus } from '@/types/grievance';

interface StatusSelectProps {
  value: GrievanceStatus;
  onChange: (value: GrievanceStatus) => void;
  disabled?: boolean;
  className?: string;
}

const statusConfig: Record<
  GrievanceStatus,
  {
    label: string;
    description: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  open: {
    label: 'Open',
    description: 'Newly created ticket',
    variant: 'default',
    icon: AlertCircle,
    color: 'text-blue-600'
  },
  in_progress: {
    label: 'In Progress',
    description: 'Being actively worked on',
    variant: 'secondary',
    icon: Clock,
    color: 'text-purple-600'
  },
  pending_info: {
    label: 'Pending Info',
    description: 'Waiting for more information',
    variant: 'outline',
    icon: AlertTriangle,
    color: 'text-yellow-600'
  },
  resolved: {
    label: 'Resolved',
    description: 'Solution provided',
    variant: 'default',
    icon: CheckCircle2,
    color: 'text-green-600'
  },
  closed: {
    label: 'Closed',
    description: 'Completed and rated',
    variant: 'secondary',
    icon: XCircle,
    color: 'text-gray-600'
  },
  reopened: {
    label: 'Reopened',
    description: 'Reopened after resolution',
    variant: 'destructive',
    icon: RefreshCw,
    color: 'text-red-600'
  }
};

export function StatusSelect({ value, onChange, disabled = false, className = '' }: StatusSelectProps) {
  const currentStatus = statusConfig[value];
  const Icon = currentStatus.icon;

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={`w-full ${className}`}>
        <SelectValue>
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${currentStatus.color}`} />
            <span>{currentStatus.label}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(statusConfig).map(([status, config]) => {
          const StatusIcon = config.icon;
          return (
            <SelectItem key={status} value={status}>
              <div className="flex items-center gap-2">
                <StatusIcon className={`h-4 w-4 ${config.color}`} />
                <div className="flex flex-col">
                  <span className="font-medium">{config.label}</span>
                  <span className="text-xs text-muted-foreground">{config.description}</span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// Export status badge for read-only display
interface StatusBadgeProps {
  status: GrievanceStatus;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, showIcon = true, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`flex items-center gap-1 w-fit ${className}`}>
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
