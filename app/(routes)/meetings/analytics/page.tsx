'use client';

// app/(routes)/meetings/analytics/page.tsx
// Module 8 — Meetings Analytics & Insights (Calendly-parity dashboard).
// Read-only dashboard over meeting_bookings + meeting_routing_log via the two
// SECURITY DEFINER RPCs (host-scoped server-side). Mirrors the campus-living
// analytics page pattern: ContentLayout -> metric cards -> recharts.

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  CalendarCheck,
  CheckCircle2,
  XCircle,
  TrendingDown,
  Users,
  Loader2,
  Shuffle,
} from 'lucide-react';
import {
  useMeetingAnalyticsSummary,
  useMeetingRoutingDistribution,
  useMeetingAnalyticsTier,
} from '@/hooks/meetings/use-meeting-analytics';
import { Building2 } from 'lucide-react';

// --- Date-range presets (resolved to ISO [from, to) at render) ---
type RangeKey = '7d' | '30d' | '90d';

const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

function rangeToIso(key: RangeKey): { from: string; to: string } {
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
} as const;

// Sentinel for the institution picker meaning "all my accessible institutions".
const ALL_INSTITUTIONS = '__all__';

function MeetingsAnalyticsInner() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  // Recompute ISO bounds when the preset changes (stable across re-renders of
  // the same preset so React Query keys stay constant within a selection).
  const { from, to } = useMemo(() => rangeToIso(rangeKey), [rangeKey]);

  // Resolve the read tier from the canonical permission layer.
  const { tier } = useMeetingAnalyticsTier();

  // Institution-manager picker state (only meaningful in the 'institution' tier).
  const [selectedInstitution, setSelectedInstitution] =
    useState<string>(ALL_INSTITUTIONS);
  const institutionIds = useMemo<string[] | null>(
    () =>
      tier === 'institution' && selectedInstitution !== ALL_INSTITUTIONS
        ? [selectedInstitution]
        : null,
    [tier, selectedInstitution]
  );

  const { data: summary, isLoading: summaryLoading } =
    useMeetingAnalyticsSummary(from, to, { tier, institutionIds });
  const { data: routing, isLoading: routingLoading } =
    useMeetingRoutingDistribution(from, to, { tier, institutionIds });

  // Institution options come from the summary RPC (institution tier only).
  const institutionOptions = summary?.available_institutions ?? [];
  const showInstitutionPicker =
    tier === 'institution' && institutionOptions.length > 0;

  // Scope-aware subtitle copy.
  const scopeLabel =
    summary?.scope === 'own'
      ? ' for your meetings'
      : summary?.scope === 'institution'
        ? selectedInstitution === ALL_INSTITUTIONS
          ? ' across all hosts in your institution(s)'
          : ` across all hosts in ${
              institutionOptions.find(
                (i) => i.institution_id === selectedInstitution
              )?.name ?? 'the selected institution'
            }`
        : ' across all hosts';

  const isLoading = summaryLoading || routingLoading;

  const totals = summary?.totals;
  const cancelRatePct = totals ? Math.round(totals.cancel_rate * 100) : 0;

  const metrics = useMemo(
    () => [
      {
        label: 'Total Bookings',
        value: `${totals?.total ?? 0}`,
        icon: CalendarCheck,
        tone: 'text-foreground',
      },
      {
        label: 'Confirmed',
        value: `${totals?.confirmed ?? 0}`,
        icon: CheckCircle2,
        tone: 'text-green-600',
      },
      {
        label: 'Cancelled',
        value: `${totals?.cancelled ?? 0}`,
        icon: XCircle,
        tone: 'text-red-600',
      },
      {
        label: 'Cancel Rate',
        value: `${cancelRatePct}%`,
        icon: TrendingDown,
        tone: cancelRatePct > 20 ? 'text-red-600' : 'text-foreground',
      },
      {
        label: 'Completed',
        value: `${totals?.completed ?? 0}`,
        icon: CheckCircle2,
        tone: 'text-foreground',
      },
      {
        label: 'No-shows',
        value: `${totals?.no_show ?? 0}`,
        icon: Users,
        tone: (totals?.no_show ?? 0) > 0 ? 'text-amber-600' : 'text-foreground',
      },
    ],
    [totals, cancelRatePct]
  );

  // Bookings over time
  const byDay = useMemo(
    () =>
      (summary?.by_day ?? []).map((d) => ({
        day: d.day.slice(5), // MM-DD for compact axis
        Total: d.total,
        Confirmed: d.confirmed,
        Cancelled: d.cancelled,
      })),
    [summary]
  );

  // By event type (top 10)
  const byType = useMemo(
    () =>
      (summary?.by_type ?? [])
        .slice(0, 10)
        .map((t) => ({ name: t.name, Bookings: t.count })),
    [summary]
  );

  // By host (top 10)
  const byHost = useMemo(
    () =>
      (summary?.by_host ?? [])
        .slice(0, 10)
        .map((h) => ({ name: h.name, Bookings: h.count })),
    [summary]
  );

  // Routing pool distribution
  const byPool = useMemo(
    () =>
      (routing?.by_pool ?? []).map((p) => ({
        name: p.pool_size == null ? 'n/a' : `${p.pool_size}`,
        Routings: p.count,
      })),
    [routing]
  );

  if (isLoading) {
    return (
      <ContentLayout title="Meetings Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Meetings Analytics">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Meetings Analytics</h1>
            <p className="text-muted-foreground">
              Booking activity, cancellations, and routing insights
              {scopeLabel}.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {showInstitutionPicker && (
              <Select
                value={selectedInstitution}
                onValueChange={setSelectedInstitution}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Institution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_INSTITUTIONS}>
                    All my institutions
                  </SelectItem>
                  {institutionOptions.map((inst) => (
                    <SelectItem
                      key={inst.institution_id}
                      value={inst.institution_id}
                    >
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={rangeKey}
              onValueChange={(v) => setRangeKey(v as RangeKey)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {RANGE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="p-4">
                <metric.icon className="h-4 w-4 text-muted-foreground mb-2" />
                <p className={`text-2xl font-bold ${metric.tone}`}>
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bookings over time */}
        <Card>
          <CardHeader>
            <CardTitle>Bookings Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {byDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={byDay}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Cancelled"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No bookings in this range." />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* By event type */}
          <Card>
            <CardHeader>
              <CardTitle>By Event Type</CardTitle>
            </CardHeader>
            <CardContent>
              {byType.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={byType}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      className="text-xs"
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar
                      dataKey="Bookings"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No event-type data." />
              )}
            </CardContent>
          </Card>

          {/* By host */}
          <Card>
            <CardHeader>
              <CardTitle>By Host</CardTitle>
            </CardHeader>
            <CardContent>
              {byHost.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={byHost}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      className="text-xs"
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar
                      dataKey="Bookings"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No host data." />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Routing pool distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-muted-foreground" />
              Round-Robin Routing Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byPool.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={byPool}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar
                    dataKey="Routings"
                    name="Routings (by eligible pool size)"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No round-robin routing activity in this range." />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[280px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

export default function MeetingsAnalyticsPage() {
  return (
    <PermissionGuard
      module="meetings"
      action="analytics.view"
      fallback={
        <ContentLayout title="Meetings Analytics">
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-muted-foreground">
              You don&apos;t have access to Meetings Analytics. Contact your
              administrator if you believe this is an error.
            </p>
          </div>
        </ContentLayout>
      }
    >
      <MeetingsAnalyticsInner />
    </PermissionGuard>
  );
}
