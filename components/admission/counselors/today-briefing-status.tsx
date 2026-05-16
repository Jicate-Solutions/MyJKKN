'use client';

/**
 * TodayBriefingStatus
 *
 * Shows the 4 active admission counselors and whether each has a briefing
 * generated for today. Reads from:
 *   - admission_counselors (is_active = true, by institution)
 *   - admission_daily_briefings (briefing_date = today, joined by user_id)
 *
 * Mount on: app/(routes)/admission/counselors/briefing/page.tsx
 *
 * Usage:
 *   <TodayBriefingStatus institutionId={institutionId} />
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Counselor {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
}

interface BriefingRow {
  user_id: string;
  briefing_date: string;
  created_at: string;
  is_read: boolean;
}

export interface CounselorBriefingStatus {
  counselor: Counselor;
  briefedToday: boolean;
  briefingCreatedAt: string | null;
  isRead: boolean;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCounselorBriefingStatuses(
  institutionId: string
): Promise<CounselorBriefingStatus[]> {
  const supabase = createClientSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  // Fetch active counselors for the institution
  const { data: counselors, error: cErr } = await (supabase as any)
    .from('admission_counselors')
    .select('id, user_id, name, email')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('name');

  if (cErr) {
    console.error('[admission/counselors/today-briefing-status] Error fetching counselors:', cErr);
    return [];
  }

  const activeCounselors: Counselor[] = counselors || [];
  if (activeCounselors.length === 0) return [];

  // Collect user_ids to look up briefings (skip nulls)
  const userIds = activeCounselors
    .map((c) => c.user_id)
    .filter((uid): uid is string => !!uid);

  // Fetch today's briefings for all those user_ids in one query
  let briefingsMap: Record<string, BriefingRow> = {};

  if (userIds.length > 0) {
    const { data: briefings, error: bErr } = await (supabase as any)
      .from('admission_daily_briefings')
      .select('user_id, briefing_date, created_at, is_read')
      .eq('briefing_date', today)
      .in('user_id', userIds);

    if (bErr) {
      console.error(
        '[admission/counselors/today-briefing-status] Error fetching briefings:',
        bErr
      );
    } else {
      for (const row of briefings || []) {
        briefingsMap[row.user_id] = row as BriefingRow;
      }
    }
  }

  return activeCounselors.map((counselor) => {
    const briefing = counselor.user_id ? briefingsMap[counselor.user_id] : undefined;
    return {
      counselor,
      briefedToday: !!briefing,
      briefingCreatedAt: briefing?.created_at ?? null,
      isRead: briefing?.is_read ?? false,
    };
  });
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CounselorInitial({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-primary"
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

function BriefingBadge({
  briefedToday,
  briefingCreatedAt,
  isRead,
}: {
  briefedToday: boolean;
  briefingCreatedAt: string | null;
  isRead: boolean;
}) {
  if (briefedToday) {
    const time = briefingCreatedAt
      ? new Date(briefingCreatedAt).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : null;

    return (
      <div className="flex flex-col items-end gap-1">
        <Badge
          variant="outline"
          className="border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 gap-1"
        >
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Briefed today
        </Badge>
        {time && (
          <span className="text-xs text-muted-foreground">
            {isRead ? 'Read' : 'Unread'} &middot; {time}
          </span>
        )}
      </div>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 gap-1"
    >
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      Not yet briefed
    </Badge>
  );
}

function CounselorRow({ status }: { status: CounselorBriefingStatus }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
        status.briefedToday
          ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
          : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
      )}
      role="listitem"
    >
      <CounselorInitial name={status.counselor.name} />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{status.counselor.name}</p>
        {status.counselor.email && (
          <p className="text-xs text-muted-foreground truncate">{status.counselor.email}</p>
        )}
      </div>

      <BriefingBadge
        briefedToday={status.briefedToday}
        briefingCreatedAt={status.briefingCreatedAt}
        isRead={status.isRead}
      />
    </div>
  );
}

function TodayBriefingStatusSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface TodayBriefingStatusProps {
  institutionId: string | undefined;
  className?: string;
}

export function TodayBriefingStatus({ institutionId, className }: TodayBriefingStatusProps) {
  const { data: statuses, isLoading, isError } = useQuery({
    queryKey: ['counselors-briefing-status-today', institutionId],
    queryFn: () => fetchCounselorBriefingStatuses(institutionId!),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  if (isLoading) {
    return <TodayBriefingStatusSkeleton />;
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Failed to load counselor briefing status. Please refresh.
        </CardContent>
      </Card>
    );
  }

  const briefedCount = statuses?.filter((s) => s.briefedToday).length ?? 0;
  const totalCount = statuses?.length ?? 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          Today&apos;s Briefing Status
        </CardTitle>
        <CardDescription>
          {totalCount === 0
            ? 'No active counselors found'
            : `${briefedCount} of ${totalCount} counselor${totalCount !== 1 ? 's' : ''} briefed today`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {totalCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active counselors in this institution.
          </p>
        ) : (
          <div className="space-y-2" role="list" aria-label="Counselor briefing statuses">
            {statuses!.map((status) => (
              <CounselorRow key={status.counselor.id} status={status} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
