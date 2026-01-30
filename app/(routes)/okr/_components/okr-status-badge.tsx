'use client';

import { Badge } from '@/components/ui/badge';
import { KRStatus } from '@/types/okr';
import { CheckCircle2, AlertCircle, AlertTriangle, Ban, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OKRStatusBadgeProps {
  status: KRStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<KRStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ReactNode;
  className: string;
}> = {
  not_started: {
    label: 'Not Started',
    variant: 'outline',
    icon: <Circle className="h-3 w-3" />,
    className: 'border-slate-300 text-slate-600'
  },
  on_track: {
    label: 'On Track',
    variant: 'default',
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: 'bg-emerald-500 hover:bg-emerald-600 text-white'
  },
  at_risk: {
    label: 'At Risk',
    variant: 'secondary',
    icon: <AlertCircle className="h-3 w-3" />,
    className: 'bg-amber-500 hover:bg-amber-600 text-white'
  },
  behind: {
    label: 'Behind',
    variant: 'destructive',
    icon: <AlertTriangle className="h-3 w-3" />,
    className: 'bg-red-500 hover:bg-red-600 text-white'
  },
  blocked: {
    label: 'Blocked',
    variant: 'destructive',
    icon: <Ban className="h-3 w-3" />,
    className: 'bg-slate-700 hover:bg-slate-800 text-white'
  },
  completed: {
    label: 'Completed',
    variant: 'default',
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: 'bg-blue-500 hover:bg-blue-600 text-white'
  }
};

export function OKRStatusBadge({ status, size = 'md', showIcon = true, className }: OKRStatusBadgeProps) {
  const config = statusConfig[status];

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1'
  };

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, sizeClasses[size], className)}
    >
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </Badge>
  );
}

// Export config for external use
export { statusConfig };
