'use client';

/**
 * Recent Activities Feed (T3.3) — sidebar/below-grid component for /hr.
 *
 * Reads /api/hr/dashboard/activities (24h window, top 20). Groups entries
 * by hour for readability. Renders timestamp ago ("3 min ago"), actor name,
 * KPI accessed, and institution name.
 *
 * Per CLAUDE.md visual-proof bookend: this component is read-only and never
 * mutates data — pure rendering of the audit log already populated by the
 * dashboard's /access-log POST.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Activity, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentActivities } from '@/hooks/hr/use-hr-dashboard';
import type { RecentActivityEntry } from '@/types/hr-dashboard';

// =====================================================================================
// Helpers
// =====================================================================================

/** Format a timestamp as a short relative ago string ("3 min ago", "2 h ago"). */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} d ago`;
}

/** Hour bucket label like "Today, 14:00" or "Yesterday, 09:00". */
function hourBucketLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const isYesterday =
    d.getUTCFullYear() === yesterday.getUTCFullYear() &&
    d.getUTCMonth() === yesterday.getUTCMonth() &&
    d.getUTCDate() === yesterday.getUTCDate();
  const hh = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
  if (isToday) return `Today, ${hh}`;
  if (isYesterday) return `Yesterday, ${hh}`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** Bucket key — YYYY-MM-DD-HH (UTC) so two views in the same hour collapse. */
function bucketKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

/** Pretty KPI name (snake_case → Title Case). */
function kpiLabel(kpi: string): string {
  return kpi.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// =====================================================================================
// Component
// =====================================================================================

export function RecentActivitiesFeed() {
  const { data, isLoading, isError, error } = useRecentActivities({ hoursBack: 24, limit: 20 });

  const grouped = useMemo(() => {
    if (!data?.entries) return [] as Array<{ label: string; entries: RecentActivityEntry[] }>;
    const map = new Map<string, { label: string; entries: RecentActivityEntry[] }>();
    for (const entry of data.entries) {
      const key = bucketKey(entry.viewed_at);
      if (!map.has(key)) {
        map.set(key, { label: hourBucketLabel(entry.viewed_at), entries: [] });
      }
      map.get(key)!.entries.push(entry);
    }
    // Map iteration preserves insertion order, which is already viewed_at DESC.
    return Array.from(map.values());
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-700">Could not load activity feed.</p>
          <p className="text-[10px] text-red-600/80 font-mono break-all mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No dashboard views in the last 24 hours.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Activities will appear here as HR staff load this dashboard.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </span>
          <Badge variant="outline" className="text-[10px] font-normal">
            Last 24 h
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {grouped.map((bucket) => (
          <div key={bucket.label} className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {bucket.label}
            </div>
            <ul className="space-y-1.5">
              {bucket.entries.map((entry, idx) => (
                <li
                  key={`${entry.viewed_at}-${entry.user_id}-${entry.kpi_name}-${idx}`}
                  className="text-xs flex items-start gap-2 py-1 border-b border-dashed last:border-b-0"
                >
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap pt-0.5">
                    {timeAgo(entry.viewed_at)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{entry.actor_name}</span>
                    <span className="text-muted-foreground"> viewed </span>
                    <span className="font-medium">{kpiLabel(entry.kpi_name)}</span>
                    {entry.institution_name && (
                      <span className="text-muted-foreground"> · {entry.institution_name}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
