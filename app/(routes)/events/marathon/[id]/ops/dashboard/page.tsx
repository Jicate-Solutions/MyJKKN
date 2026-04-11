'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Award,
  Loader2,
  MapPin,
  Shirt,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { MarathonAccessDenied } from '../../_components/marathon-access-denied';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOpsStats } from '@/hooks/events/marathon/use-marathon-ops';
import { cn } from '@/lib/utils';

// ============================================================================
// Helpers
// ============================================================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100 * 10) / 10 : 0;
}

// ============================================================================
// Circular Progress Ring
// ============================================================================

function CircularProgress({
  value,
  total,
  size = 80,
  strokeWidth = 6,
  color,
}: {
  value: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorMap: Record<string, string> = {
    green: 'stroke-green-500',
    purple: 'stroke-purple-500',
    amber: 'stroke-amber-500',
    blue: 'stroke-blue-500',
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn('transition-all duration-700 ease-out', colorMap[color] ?? 'stroke-blue-500')}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold tabular-nums">
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Hero Stat Card (large, for top row)
// ============================================================================

function HeroStatCard({
  label,
  value,
  total,
  icon: Icon,
  color,
  description,
}: {
  label: string;
  value: number;
  total?: number;
  icon: React.ElementType;
  color: string;
  description?: string;
}) {
  const colorMap: Record<string, {
    gradient: string;
    iconBg: string;
    iconText: string;
    accent: string;
    border: string;
  }> = {
    blue: {
      gradient: 'from-blue-500/5 via-transparent to-transparent',
      iconBg: 'bg-blue-500/10',
      iconText: 'text-blue-600 dark:text-blue-400',
      accent: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200/50 dark:border-blue-800/50',
    },
    green: {
      gradient: 'from-green-500/5 via-transparent to-transparent',
      iconBg: 'bg-green-500/10',
      iconText: 'text-green-600 dark:text-green-400',
      accent: 'text-green-600 dark:text-green-400',
      border: 'border-green-200/50 dark:border-green-800/50',
    },
    purple: {
      gradient: 'from-purple-500/5 via-transparent to-transparent',
      iconBg: 'bg-purple-500/10',
      iconText: 'text-purple-600 dark:text-purple-400',
      accent: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-200/50 dark:border-purple-800/50',
    },
    amber: {
      gradient: 'from-amber-500/5 via-transparent to-transparent',
      iconBg: 'bg-amber-500/10',
      iconText: 'text-amber-600 dark:text-amber-400',
      accent: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200/50 dark:border-amber-800/50',
    },
  };
  const c = colorMap[color] ?? colorMap.blue;
  const showRing = total != null && total > 0;

  return (
    <Card className={cn('relative overflow-hidden', c.border)}>
      <div className={cn('absolute inset-0 bg-gradient-to-br', c.gradient)} />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          {/* Left: icon + text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={cn('p-2 rounded-lg', c.iconBg)}>
                <Icon className={cn('h-5 w-5', c.iconText)} />
              </div>
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums tracking-tight">
                {value.toLocaleString('en-IN')}
              </span>
              {total != null && (
                <span className="text-lg text-muted-foreground font-normal">
                  / {total.toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>

          {/* Right: circular progress */}
          {showRing && (
            <CircularProgress value={value} total={total!} color={color} />
          )}
        </div>

        {/* Bottom progress bar */}
        {showRing && (
          <div className="mt-4">
            <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700 ease-out',
                  color === 'green' && 'bg-green-500',
                  color === 'purple' && 'bg-purple-500',
                  color === 'amber' && 'bg-amber-500',
                  color === 'blue' && 'bg-blue-500'
                )}
                style={{ width: `${Math.min(pct(value, total!), 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Stall Card (individual stall in the grid)
// ============================================================================

function StallCard({
  stall,
}: {
  stall: {
    stall_id: string;
    stall_name: string;
    stall_code: string;
    capacity: number;
    assigned: number;
    checked_in: number;
  };
}) {
  const fillPct = stall.capacity > 0 ? Math.round((stall.assigned / stall.capacity) * 100) : 0;
  const checkinPct = stall.assigned > 0 ? Math.round((stall.checked_in / stall.assigned) * 100) : 0;

  const fillColor =
    fillPct > 95 ? 'text-red-600 bg-red-50 border-red-200'
      : fillPct >= 80 ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-green-600 bg-green-50 border-green-200';

  const barColor =
    fillPct > 95 ? 'bg-red-500'
      : fillPct >= 80 ? 'bg-amber-500'
        : 'bg-green-500';

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Header: stall name + code */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{stall.stall_name}</p>
              <p className="text-xs text-muted-foreground font-mono">{stall.stall_code}</p>
            </div>
          </div>
          <Badge variant="outline" className={cn('text-xs font-bold tabular-nums', fillColor)}>
            {fillPct}%
          </Badge>
        </div>

        {/* Fill bar */}
        <div className="h-2 bg-muted/50 rounded-full overflow-hidden mb-3">
          <div
            className={cn('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${Math.min(fillPct, 100)}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold tabular-nums">{stall.capacity}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Capacity</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold tabular-nums">{stall.assigned}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Assigned</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold tabular-nums text-green-600">{stall.checked_in}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Check-in</p>
          </div>
        </div>

        {/* Check-in progress */}
        {stall.assigned > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>{checkinPct}% checked in</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function OpsDashboardPage() {
  const params = useParams();
  const eventId = params.id as string;
  const access = useMarathonAccess();

  const { data: stats, isLoading, dataUpdatedAt } = useOpsStats(eventId);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data: event } = useQuery({
    queryKey: ['marathon-event-name', eventId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events')
        .select('name')
        .eq('id', eventId)
        .single();
      return data;
    },
    enabled: !!eventId,
  });
  const eventName = event?.name ?? 'Marathon';

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  // Block non-admin users
  if (!access.isLoading && !access.canManage) {
    return <MarathonAccessDenied title="Ops Dashboard" eventId={eventId} />;
  }

  if (isLoading && !stats) {
    return (
      <ContentLayout title="Ops Dashboard">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  const remaining = (stats?.total ?? 0) - (stats?.checked_in ?? 0);

  return (
    <ContentLayout title={`${eventName} - Ops Dashboard`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/dashboard` },
          { label: 'Dashboard' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* ── Header with live indicator ──────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Live Operations</h1>
              <p className="text-sm text-muted-foreground">{eventName}</p>
            </div>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-sm font-medium">
              {lastUpdated ? formatTime(lastUpdated) : '---'}
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">Auto-refresh 10s</span>
          </div>
        </div>

        {/* ── Stats Cards ────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <HeroStatCard
              label="Total"
              value={stats.total}
              icon={Users}
              color="blue"
              description={`${remaining} remaining`}
            />
            <HeroStatCard
              label="Checked In"
              value={stats.checked_in}
              total={stats.total}
              icon={UserCheck}
              color="green"
            />
            <HeroStatCard
              label="T-Shirts"
              value={stats.tshirt_collected}
              total={stats.total}
              icon={Shirt}
              color="purple"
            />
            <HeroStatCard
              label="Certificates"
              value={stats.certificate_issued}
              total={stats.total}
              icon={Award}
              color="amber"
            />
          </div>
        )}

        {/* ── Stall Breakdown Grid ───────────────────────────────── */}
        {stats?.stall_breakdown && stats.stall_breakdown.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Stall Overview</h2>
              <Badge variant="secondary" className="text-xs">
                {stats.stall_breakdown.length} stalls
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {stats.stall_breakdown.map((stall) => (
                <StallCard key={stall.stall_id} stall={stall} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
