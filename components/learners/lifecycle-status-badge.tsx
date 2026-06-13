// ============================================
// LIFECYCLE STATUS BADGE COMPONENT
// ============================================
// Created: 2025-01-18
// Updated: 2026-05-18 — reads colors/labels from admission_statuses dynamically
// Purpose: Visual indicator for learner lifecycle status
// ============================================

'use client';

import { Badge } from '@/components/ui/badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { cn } from '@/lib/utils';
import { useAdmissionStatuses } from '@/hooks/admission/use-admission-statuses';
import {
  getStatusColor as getDynamicStatusColor,
  getStatusLabel as getDynamicStatusLabel,
} from '@/lib/admission/status-helpers';

interface LifecycleStatusBadgeProps {
  status: LifecycleStatus;
  className?: string;
  showIcon?: boolean;
}

// KEEP the original statusConfig as a fallback — synchronous helpers below depend on it
// and the dynamic badge uses the `icon` field when `showIcon` is true.
const statusConfig: Record<
  LifecycleStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
    className: string;
    icon?: string;
  }
> = {
  // 2026-05-20: New workflow entries. Colors mirror the admission_statuses seed.
  enquiry: {
    label: 'Enquiry',
    variant: 'outline',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: '📨',
  },
  enquiry_submitted: {
    label: 'Enquiry Submitted',
    variant: 'secondary',
    className: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: '✉️',
  },
  reserved: {
    label: 'Reserved',
    variant: 'secondary',
    className: 'bg-sky-100 text-sky-800 border-sky-300',
    icon: '🎫',
  },
  // 'admitted' now means post-threshold (50% paid). Updated colour + label intent.
  admitted: {
    label: 'Admitted',
    variant: 'success',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: '🎯',
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
  account: {
    label: 'Account',
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: '🏦',
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
 * Displays a colored badge indicating the learner's current lifecycle status.
 * Colors and labels are sourced from the `admission_statuses` table via
 * `useAdmissionStatuses('learner')` — edits in Settings propagate without code
 * changes. Falls back to the hardcoded `statusConfig` map (above) for unknown
 * codes or before the query resolves.
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
  const { data: statuses } = useAdmissionStatuses('learner', { activeOnly: false });
  const fallback = statusConfig[status];
  const color = getDynamicStatusColor(statuses, 'learner', status);
  const label = getDynamicStatusLabel(statuses, 'learner', status);

  if (!fallback && !statuses?.find((s) => s.scope === 'learner' && s.code === status)) {
    console.warn(`[LifecycleStatusBadge] Unknown status: ${status}`);
  }

  return (
    <Badge
      style={{ backgroundColor: color, color: '#fff', borderColor: color }}
      className={cn('font-medium', className)}
    >
      {showIcon && fallback?.icon && <span className="mr-1">{fallback.icon}</span>}
      {label}
    </Badge>
  );
}

/**
 * Helper function to get status color class (for use in other components)
 * Synchronous fallback — uses hardcoded map only.
 */
export function getStatusColorClass(status: LifecycleStatus): string {
  return statusConfig[status]?.className || 'bg-gray-100 text-gray-700';
}

/**
 * Helper function to get status label
 * Synchronous fallback — uses hardcoded map only.
 */
export function getStatusLabel(status: LifecycleStatus): string {
  return statusConfig[status]?.label || status;
}

/**
 * Helper function to get status icon
 * Synchronous fallback — uses hardcoded map only.
 */
export function getStatusIcon(status: LifecycleStatus): string | undefined {
  return statusConfig[status]?.icon;
}
