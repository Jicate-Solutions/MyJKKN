'use client';

// app/(routes)/events/marathon/[id]/ops/dashboard/page.tsx
// Live operations dashboard — designed for wall-mounted display with large fonts.
// Auto-refreshes every 10 seconds via useOpsStats.
// Created: 2026-04-11

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  LayoutDashboard,
  Loader2,
  Shirt,
  UserCheck,
  Users,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOpsStats } from '@/hooks/events/marathon/use-marathon-ops';

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
// Stat Card
// ============================================================================

function StatCard({
  label,
  value,
  total,
  icon: Icon,
  color,
  showProgress,
}: {
  label: string;
  value: number;
  total?: number;
  icon: React.ElementType;
  color: string;
  showProgress?: boolean;
}) {
  const percentage = total ? pct(value, total) : 0;

  // Color map for background/text
  const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
    blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' },
    green: { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  };
  const c = colorMap[color] ?? colorMap.blue;

  return (
    <Card className={c.bg}>
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <Icon className={`h-7 w-7 ${c.text}`} />
          <span className={`text-lg font-semibold ${c.text} uppercase tracking-wide`}>
            {label}
          </span>
        </div>

        <div className="text-5xl font-bold tabular-nums">
          {value.toLocaleString('en-IN')}
          {total != null && (
            <span className="text-2xl text-muted-foreground font-normal">
              {' '}/ {total.toLocaleString('en-IN')}
            </span>
          )}
        </div>

        {showProgress && total != null && (
          <>
            <div className="text-lg text-muted-foreground mt-1">
              {percentage}%
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden mt-2">
              <div
                className={`h-full ${c.bar} rounded-full transition-all duration-500`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Stall Breakdown Table
// ============================================================================

function StallBreakdown({
  breakdown,
}: {
  breakdown: {
    stall_id: string;
    stall_name: string;
    stall_code: string;
    capacity: number;
    assigned: number;
    checked_in: number;
  }[];
}) {
  if (!breakdown || breakdown.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold mb-4">Stall Breakdown</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-base">Stall Name</TableHead>
              <TableHead className="text-base">Code</TableHead>
              <TableHead className="text-base text-right">Capacity</TableHead>
              <TableHead className="text-base text-right">Assigned</TableHead>
              <TableHead className="text-base text-right">Checked In</TableHead>
              <TableHead className="text-base w-[200px]">Fill %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakdown.map((stall) => {
              const fillPct =
                stall.capacity > 0
                  ? Math.round((stall.assigned / stall.capacity) * 100)
                  : 0;
              const barColor =
                fillPct > 95
                  ? 'bg-red-500'
                  : fillPct >= 80
                    ? 'bg-amber-500'
                    : 'bg-green-500';

              return (
                <TableRow key={stall.stall_id}>
                  <TableCell className="text-base font-medium">
                    {stall.stall_name}
                  </TableCell>
                  <TableCell className="text-base font-mono">
                    {stall.stall_code}
                  </TableCell>
                  <TableCell className="text-base text-right tabular-nums">
                    {stall.capacity}
                  </TableCell>
                  <TableCell className="text-base text-right tabular-nums">
                    {stall.assigned}
                  </TableCell>
                  <TableCell className="text-base text-right tabular-nums">
                    {stall.checked_in}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColor} rounded-full transition-all`}
                          style={{ width: `${Math.min(fillPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium tabular-nums w-10 text-right">
                        {fillPct}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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

  // Track last-updated timestamp from dataUpdatedAt
  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  // ── Loading ────────────────────────────────────────────────────
  if (isLoading && !stats) {
    return (
      <ContentLayout title="Ops Dashboard">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${eventName} - Ops Dashboard`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/settings` },
          { label: 'Dashboard' },
        ]}
      />

      <div className="space-y-4 mt-4">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-3xl font-bold">Operations Dashboard</h1>
      </div>

      {/* ── Row 1: Stats Cards ────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Registrations"
            value={stats.total}
            icon={Users}
            color="blue"
          />
          <StatCard
            label="Checked In"
            value={stats.checked_in}
            total={stats.total}
            icon={UserCheck}
            color="green"
            showProgress
          />
          <StatCard
            label="T-Shirts Collected"
            value={stats.tshirt_collected}
            total={stats.total}
            icon={Shirt}
            color="purple"
            showProgress
          />
          <StatCard
            label="Certificates Issued"
            value={stats.certificate_issued}
            total={stats.total}
            icon={Award}
            color="amber"
            showProgress
          />
        </div>
      )}

      {/* ── Row 2: Stall Breakdown ────────────────────────────────── */}
      {stats?.stall_breakdown && (
        <StallBreakdown breakdown={stats.stall_breakdown} />
      )}

      {/* ── Row 3: Last Updated ───────────────────────────────────── */}
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="text-base">
          Last updated:{' '}
          {lastUpdated ? formatTime(lastUpdated) : '---'}
        </span>
        <span className="text-sm">(auto-refreshes every 10s)</span>
      </div>
      </div>
    </ContentLayout>
  );
}
