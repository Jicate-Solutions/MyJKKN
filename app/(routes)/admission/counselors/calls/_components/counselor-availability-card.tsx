'use client';

// Counselor Availability Card — shows real-time Exotel agent status
// Placed on the Calls dashboard between KPI cards and charts

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCounselorStatus, type CounselorInfo } from '@/hooks/admission';
import { Users, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return 'Never';

  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 0) return 'Just now';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCallDuration(startTime: string | null): string {
  if (!startTime) return '';
  const diff = Date.now() - new Date(startTime).getTime();
  if (diff < 0) return '00:00';

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const STATUS_CONFIG = {
  online: {
    dotColor: 'bg-green-500',
    label: 'Online',
    badgeClass: 'bg-green-100 text-green-800 border-green-200',
  },
  on_call: {
    dotColor: 'bg-yellow-500',
    label: 'On Call',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  offline: {
    dotColor: 'bg-gray-400',
    label: 'Offline',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
} as const;

// ============================================================================
// COUNSELOR ROW
// ============================================================================

function CounselorRow({ counselor }: { counselor: CounselorInfo }) {
  const config = STATUS_CONFIG[counselor.status];

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      {/* Status dot */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full',
            config.dotColor,
            counselor.status === 'on_call' && 'animate-ping opacity-75'
          )}
        />
        <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', config.dotColor)} />
      </span>

      {/* Name */}
      <span className="flex-1 text-sm font-medium truncate">{counselor.name}</span>

      {/* Status badge */}
      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', config.badgeClass)}>
        {config.label}
      </Badge>

      {/* Context info */}
      <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
        {counselor.status === 'on_call' && counselor.active_call_start
          ? formatCallDuration(counselor.active_call_start)
          : counselor.status === 'online'
            ? 'Available'
            : `Last: ${formatTimeAgo(counselor.last_login)}`}
      </span>
    </div>
  );
}

// ============================================================================
// MAIN CARD
// ============================================================================

export function CounselorAvailabilityCard() {
  const { counselors, summary, isLoading, isError, error, refetch } = useCounselorStatus();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Counselor Availability
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => refetch()}
          title="Refresh status"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-6">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              {error?.message || 'Failed to load counselor status'}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : counselors.length === 0 ? (
          <div className="text-center py-6">
            <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No counselors found in Exotel</p>
          </div>
        ) : (
          <>
            {/* Counselor list */}
            <div className="divide-y">
              {counselors.map((c) => (
                <CounselorRow key={c.user_id} counselor={c} />
              ))}
            </div>

            {/* Summary line */}
            <div className="flex items-center gap-3 pt-3 mt-3 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                {summary.online} Online
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500 inline-block" />
                {summary.on_call} On Call
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" />
                {summary.offline} Offline
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
