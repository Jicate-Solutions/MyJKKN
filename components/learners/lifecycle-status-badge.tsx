// ============================================
// LIFECYCLE STATUS BADGE COMPONENT
// ============================================
// Created: 2025-01-18
// Purpose: Visual indicator for learner lifecycle status
// ============================================

import { Badge } from '@/components/ui/badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { cn } from '@/lib/utils';

interface LifecycleStatusBadgeProps {
  status: LifecycleStatus;
  className?: string;
  showIcon?: boolean;
}

// Status configuration with colors and labels
const statusConfig: Record<
  LifecycleStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
    className: string;
    icon?: string;
  }
> = {
  enquiry: {
    label: 'Enquiry',
    variant: 'outline',
    className: 'bg-gray-100 text-gray-700 border-gray-300',
    icon: '📋',
  },
  pending: {
    label: 'Pending Review',
    variant: 'secondary',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    icon: '⏳',
  },
  approved: {
    label: 'Approved',
    variant: 'success',
    className: 'bg-green-100 text-green-800 border-green-300',
    icon: '✅',
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 border-red-300',
    icon: '❌',
  },
  waitlisted: {
    label: 'Waitlisted',
    variant: 'secondary',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
    icon: '⏸️',
  },
  active: {
    label: 'Active',
    variant: 'success',
    className: 'bg-green-600 text-white border-green-700 hover:bg-green-700 hover:text-white',
    icon: '🎓',
  },
  inactive: {
    label: 'Inactive',
    variant: 'destructive',
    className: 'bg-red-600 text-white border-red-700 hover:bg-red-700 hover:text-white',
    icon: '⏸️',
  },
  exited: {
    label: 'Exited',
    variant: 'destructive',
    className: 'bg-red-100 text-red-700 border-red-300',
    icon: '🚪',
  },
  graduated: {
    label: 'Graduated',
    variant: 'default',
    className: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: '🎓',
  },
  alumni: {
    label: 'Alumni',
    variant: 'outline',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: '🌟',
  },
};

/**
 * LifecycleStatusBadge Component
 *
 * Displays a colored badge indicating the learner's current lifecycle status
 *
 * @param status - The lifecycle status to display
 * @param className - Optional additional CSS classes
 * @param showIcon - Whether to show an icon before the label (default: false)
 *
 * @example
 * ```tsx
 * <LifecycleStatusBadge status="active" />
 * <LifecycleStatusBadge status="pending" showIcon />
 * ```
 */
export function LifecycleStatusBadge({
  status,
  className,
  showIcon = false,
}: LifecycleStatusBadgeProps) {
  const config = statusConfig[status];

  if (!config) {
    console.warn(`[LifecycleStatusBadge] Unknown status: ${status}`);
    return (
      <Badge variant="outline" className={className}>
        {status}
      </Badge>
    );
  }

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, 'font-medium', className)}
    >
      {showIcon && config.icon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </Badge>
  );
}

/**
 * Helper function to get status color class (for use in other components)
 */
export function getStatusColorClass(status: LifecycleStatus): string {
  return statusConfig[status]?.className || 'bg-gray-100 text-gray-700';
}

/**
 * Helper function to get status label
 */
export function getStatusLabel(status: LifecycleStatus): string {
  return statusConfig[status]?.label || status;
}

/**
 * Helper function to get status icon
 */
export function getStatusIcon(status: LifecycleStatus): string | undefined {
  return statusConfig[status]?.icon;
}
