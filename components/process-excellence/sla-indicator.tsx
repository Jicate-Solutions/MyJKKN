/**
 * SLA Indicator Component
 *
 * Traffic light indicator (green/yellow/red) showing SLA status with time remaining
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { SLA_STATUS_LABELS } from '@/types/process-excellence';
import type { SLAStatus } from '@/types/process-excellence';
import { CheckCircle2, AlertCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SLAIndicatorProps {
  status: SLAStatus;
  percentComplete?: number;
  timeRemainingHours?: number;
  slaTargetHours?: number;
  showProgress?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SLAIndicator({
  status,
  percentComplete,
  timeRemainingHours,
  slaTargetHours,
  showProgress = false,
  showLabel = true,
  size = 'md',
  className
}: SLAIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'on_track':
        return {
          icon: CheckCircle2,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500',
          label: 'On Track',
          variant: 'default' as const
        };
      case 'at_risk':
        return {
          icon: AlertCircle,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500',
          label: 'At Risk',
          variant: 'secondary' as const
        };
      case 'breached':
        return {
          icon: XCircle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500',
          label: 'Breached',
          variant: 'destructive' as const
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const iconSize = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }[size];

  const formatTimeRemaining = () => {
    if (timeRemainingHours === undefined) return null;

    if (timeRemainingHours < 0) {
      const overdue = Math.abs(timeRemainingHours);
      if (overdue < 24) return `${overdue.toFixed(1)}h overdue`;
      return `${(overdue / 24).toFixed(1)}d overdue`;
    }

    if (timeRemainingHours < 24) {
      return `${timeRemainingHours.toFixed(1)}h remaining`;
    }

    return `${(timeRemainingHours / 24).toFixed(1)}d remaining`;
  };

  const tooltipContent = (
    <div className="space-y-1">
      <p className="font-semibold">{SLA_STATUS_LABELS[status]}</p>
      {timeRemainingHours !== undefined && (
        <p className="text-xs">{formatTimeRemaining()}</p>
      )}
      {slaTargetHours !== undefined && (
        <p className="text-xs text-muted-foreground">
          SLA Target: {slaTargetHours < 24 ? `${slaTargetHours}h` : `${(slaTargetHours / 24).toFixed(1)}d`}
        </p>
      )}
      {percentComplete !== undefined && (
        <p className="text-xs text-muted-foreground">
          {percentComplete.toFixed(0)}% complete
        </p>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('inline-flex flex-col gap-2', className)}>
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <div className={cn('p-1 rounded-full', config.bgColor)}>
                <Icon className={cn(iconSize, config.color)} />
              </div>
              {showLabel && (
                <Badge variant={config.variant} className="font-medium">
                  {config.label}
                </Badge>
              )}
              {timeRemainingHours !== undefined && showLabel && (
                <span className={cn('text-xs', config.color)}>
                  {formatTimeRemaining()}
                </span>
              )}
            </div>

            {/* Progress Bar */}
            {showProgress && percentComplete !== undefined && (
              <div className="space-y-1">
                <Progress
                  value={percentComplete}
                  className="h-2"
                  indicatorClassName={cn(
                    status === 'on_track' && 'bg-green-500',
                    status === 'at_risk' && 'bg-yellow-500',
                    status === 'breached' && 'bg-red-500'
                  )}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {percentComplete.toFixed(0)}% complete
                </p>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
