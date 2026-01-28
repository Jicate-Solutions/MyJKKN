'use client';

/**
 * Approval Timeline Component
 *
 * Displays approval workflow progress as a stepper.
 * Shows each approval step with status, approver, and comments.
 *
 * @module components/academic/leave-onduty/approval-timeline
 */

import { useApprovalTimeline } from '@/hooks/academic/use-leave-onduty';
import { ApprovalTimelineStep, APPROVER_ROLE_LABELS } from '@/types/leave-onduty';
import { Check, X, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface ApprovalTimelineProps {
  applicationId: string;
  className?: string;
}

export function ApprovalTimeline({ applicationId, className }: ApprovalTimelineProps) {
  const { data: timeline, isLoading, error } = useApprovalTimeline(applicationId);

  if (isLoading) {
    return <ApprovalTimelineSkeleton />;
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400">
        Failed to load approval timeline
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        No approval workflow configured
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {timeline.map((step, index) => (
        <TimelineStep
          key={step.step_order}
          step={step}
          isLast={index === timeline.length - 1}
        />
      ))}
    </div>
  );
}

function TimelineStep({
  step,
  isLast,
}: {
  step: ApprovalTimelineStep;
  isLast: boolean;
}) {
  const getStepIcon = () => {
    if (step.status === 'approved') {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
      );
    }

    if (step.status === 'rejected') {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <X className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
      );
    }

    if (step.is_current) {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 animate-pulse">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
      );
    }

    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600">
        <Clock className="h-5 w-5 text-gray-400" />
      </div>
    );
  };

  const getStepStatus = () => {
    if (step.status === 'approved') return 'Approved';
    if (step.status === 'rejected') return 'Rejected';
    if (step.is_current) return 'Pending';
    return 'Awaiting';
  };

  const getStepStatusColor = () => {
    if (step.status === 'approved')
      return 'text-green-600 dark:text-green-400';
    if (step.status === 'rejected')
      return 'text-red-600 dark:text-red-400';
    if (step.is_current)
      return 'text-blue-600 dark:text-blue-400';
    return 'text-gray-500 dark:text-gray-400';
  };

  return (
    <div className="flex gap-4">
      {/* Icon Column */}
      <div className="flex flex-col items-center">
        {getStepIcon()}
        {!isLast && (
          <div
            className={cn(
              'w-0.5 flex-1 min-h-[40px]',
              step.status === 'approved'
                ? 'bg-green-200 dark:bg-green-900/50'
                : 'bg-gray-200 dark:bg-gray-700'
            )}
          />
        )}
      </div>

      {/* Content Column */}
      <div className="flex-1 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {/* Step Header */}
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {APPROVER_ROLE_LABELS[step.role]}
              </h4>
              {step.is_required && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  (Required)
                </span>
              )}
            </div>

            {/* Step Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {step.description}
            </p>

            {/* Approver Info */}
            {step.approver_name && (
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-2">
                <User className="h-4 w-4" />
                <span>{step.approver_name}</span>
              </div>
            )}

            {/* Action Date */}
            {step.action_taken_at && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(step.action_taken_at), 'MMM dd, yyyy hh:mm a')}
              </p>
            )}

            {/* Comments */}
            {step.comments && (
              <div className="mt-2 rounded-md bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Comments:
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {step.comments}
                </p>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                getStepStatusColor()
              )}
            >
              {getStepStatus()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalTimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <Skeleton className="h-8 w-8 rounded-full" />
            {i < 3 && <Skeleton className="w-0.5 flex-1 min-h-[40px] mt-2" />}
          </div>
          <div className="flex-1 pb-6 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
