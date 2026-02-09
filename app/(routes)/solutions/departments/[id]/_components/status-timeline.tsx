'use client';

import { useDepartmentStatusHistory } from '@/hooks/use-department-tracker';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Clock, History } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface StatusTimelineProps {
  solutionDepartmentId: string;
}

// ============================================
// STATUS CONFIG
// ============================================

const STATUS_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  active: {
    dot: 'bg-green-500',
    bg: 'bg-green-100 dark:bg-green-900',
    text: 'text-green-800 dark:text-green-200',
  },
  at_risk: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-100 dark:bg-amber-900',
    text: 'text-amber-800 dark:text-amber-200',
  },
  dormant: {
    dot: 'bg-red-500',
    bg: 'bg-red-100 dark:bg-red-900',
    text: 'text-red-800 dark:text-red-200',
  },
  pending_approval: {
    dot: 'bg-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-800 dark:text-gray-200',
  },
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  at_risk: 'At Risk',
  dormant: 'Dormant',
  pending_approval: 'Pending',
};

// ============================================
// HELPERS
// ============================================

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending_approval;
}

function getStatusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

// ============================================
// LOADING SKELETON
// ============================================

function TimelineSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-16 w-0.5 mt-1" />
          </div>
          <div className="flex-1 space-y-2 pb-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// COMPONENT
// ============================================

export function StatusTimeline({ solutionDepartmentId }: StatusTimelineProps) {
  const { history, loading } = useDepartmentStatusHistory(solutionDepartmentId);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="h-4 w-4" />
          <span>Status History</span>
        </div>
        <TimelineSkeleton />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="h-4 w-4" />
          <span>Status History</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No status changes recorded</p>
        </div>
      </div>
    );
  }

  // Sort most recent first
  const sorted = [...history].sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <History className="h-4 w-4" />
        <span>Status History</span>
        <Badge variant="secondary" className="text-xs">
          {sorted.length}
        </Badge>
      </div>

      <div className="relative">
        {sorted.map((entry, index) => {
          const isLast = index === sorted.length - 1;
          const newStatusColor = getStatusColor(entry.new_status);
          const prevStatusColor = entry.previous_status
            ? getStatusColor(entry.previous_status)
            : null;

          return (
            <div key={entry.id} className="flex gap-4">
              {/* Timeline rail: dot + vertical line */}
              <div className="flex flex-col items-center relative">
                {/* Dot */}
                <div
                  className={cn(
                    'h-3 w-3 rounded-full ring-2 ring-background z-10 shrink-0 mt-1',
                    newStatusColor.dot
                  )}
                />
                {/* Connecting line */}
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-border min-h-[2rem]" />
                )}
              </div>

              {/* Content */}
              <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
                {/* Status transition */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {entry.previous_status && prevStatusColor && (
                    <>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs px-1.5 py-0',
                          prevStatusColor.bg,
                          prevStatusColor.text
                        )}
                      >
                        {getStatusLabel(entry.previous_status)}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    </>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs px-1.5 py-0',
                      newStatusColor.bg,
                      newStatusColor.text
                    )}
                  >
                    {getStatusLabel(entry.new_status)}
                  </Badge>
                </div>

                {/* Reason */}
                {entry.reason && (
                  <p className="text-sm text-muted-foreground mt-1 leading-snug">
                    {entry.reason}
                  </p>
                )}

                {/* Meta: time + changed_by */}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground/70">
                  <span>{timeAgo(entry.changed_at)}</span>
                  <span className="text-muted-foreground/30">|</span>
                  <span>{entry.changed_by || 'System'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
