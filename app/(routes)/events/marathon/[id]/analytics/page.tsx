'use client';

// app/(routes)/events/marathon/[id]/analytics/page.tsx
// Post-race analytics dashboard — registration trends, race performance, college leaderboard.
// Created: 2026-04-07

import { useParams } from 'next/navigation';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, BarChart2, Users, TrendingUp, Building2 } from 'lucide-react';
import {
  useRegistrationAnalytics,
  useRaceAnalytics,
  useCollegePerformance,
  useYoYComparison,
} from '@/hooks/events/marathon/use-marathon-analytics';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { MarathonAccessDenied } from '../_components/marathon-access-denied';
import {
  PerformanceOverview,
  PaceDistributionChart,
  FinishTimeDistributionChart,
  CollegePerformanceTable,
} from './_components/race-analytics';
import { RaceReplay } from './_components/race-replay';

// ============================================================================
// Colours for pie / donut charts
// ============================================================================

const PIE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#fb923c', '#fbbf24', '#34d399', '#22d3ee',
];

// ============================================================================
// Registration Trend Chart
// ============================================================================

function RegistrationTrendChart({
  data,
}: {
  data: { date: string; cumulative: number; count: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Registration Trend</CardTitle>
        <CardDescription className="text-xs">Cumulative registrations over time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No registrations yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickLine={false}
                tickFormatter={(d) => {
                  try {
                    return new Date(d).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    });
                  } catch {
                    return d;
                  }
                }}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                labelFormatter={(d) => {
                  try {
                    return new Date(d as string).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    });
                  } catch {
                    return String(d);
                  }
                }}
                formatter={(value: number, name: string) => [
                  value,
                  name === 'cumulative' ? 'Total' : 'New',
                ]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                name="cumulative"
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#a78bfa"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
                name="count"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Category Breakdown
// ============================================================================

function CategoryBreakdown({
  data,
}: {
  data: { category: string; count: number; percentage: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">By Category</CardTitle>
        <CardDescription className="text-xs">Registration distribution across race categories</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No category data
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.map((d, i) => (
              <div key={d.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium truncate max-w-[60%]">{d.category}</span>
                  <span className="text-muted-foreground text-xs">
                    {d.count} ({d.percentage}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${d.percentage}%`,
                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Gender Split
// ============================================================================

function GenderSplit({ data }: { data: { gender: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Gender Split</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No data
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={32}
                  outerRadius={52}
                  dataKey="count"
                  paddingAngle={2}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`${v} (${Math.round((v / total) * 100)}%)`]}
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {data.map((d, i) => (
                <div key={d.gender} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="flex-1 capitalize">{d.gender}</span>
                  <span className="text-muted-foreground text-xs">
                    {d.count} ({total > 0 ? Math.round((d.count / total) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Institution Leaderboard
// ============================================================================

function InstitutionLeaderboard({ data }: { data: { institution: string; count: number }[] }) {
  const max = data[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Institution Leaderboard</CardTitle>
        </div>
        <CardDescription className="text-xs">Top 15 institutions by registrations</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm px-4">
            No institution data
          </div>
        ) : (
          <div className="divide-y">
            {data.slice(0, 15).map((d, i) => (
              <div key={d.institution} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.institution}</p>
                  <div className="h-1 rounded-full bg-muted mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-500"
                      style={{ width: `${Math.round((d.count / max) * 100)}%` }}
                    />
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {d.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// YoY Comparison Banner
// ============================================================================

function YoYBanner({ eventId }: { eventId: string }) {
  const { data: yoy, isLoading } = useYoYComparison(eventId);

  if (isLoading || !yoy?.previous) return null;

  const growthColor =
    (yoy.growth_percentage ?? 0) >= 0 ? 'text-green-600' : 'text-red-500';

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-semibold">Year-over-Year Comparison</span>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Registrations</p>
              <p className="font-bold">
                {yoy.current.registrations}{' '}
                {yoy.growth_percentage != null && (
                  <span className={`text-xs font-normal ${growthColor}`}>
                    ({yoy.growth_percentage >= 0 ? '+' : ''}
                    {yoy.growth_percentage}% vs last year)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Finish Time</p>
              <p className="font-bold font-mono text-sm">
                {yoy.current.avg_finish > 0
                  ? formatSecondsLocal(yoy.current.avg_finish)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">DNF Rate</p>
              <p className="font-bold">{yoy.current.dnf_rate}%</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatSecondsLocal(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonAnalyticsPage() {
  const params = useParams();
  const eventId = params.id as string;
  const access = useMarathonAccess();

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const { data: regAnalytics, isLoading: regLoading } = useRegistrationAnalytics(eventId);
  const { data: raceAnalytics, isLoading: raceLoading } = useRaceAnalytics(eventId);
  const { data: colleges, isLoading: collegesLoading } = useCollegePerformance(eventId);

  // Block non-admin users
  if (!access.isLoading && !access.canManage) {
    return <MarathonAccessDenied title="Analytics" eventId={eventId} />;
  }

  const hasRaceResults = (raceAnalytics?.fastest_time_seconds ?? 0) > 0;

  if (eventLoading) {
    return (
      <ContentLayout title="Analytics">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} — Analytics`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '...', href: `/events/marathon/${eventId}/dashboard` },
          { label: 'Analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Analytics</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registration trends, race performance metrics, and institutional comparison for{' '}
            {event?.name ?? 'this event'}.
          </p>
        </div>

        {/* YoY comparison banner (only when prior event linked) */}
        <YoYBanner eventId={eventId} />

        {/* ── Registration Analytics ─────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Registration Analytics</h2>
          </div>

          {regLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <div className="h-40 animate-pulse bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Trend + category side by side on large screens */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RegistrationTrendChart
                  data={regAnalytics?.registrations_over_time ?? []}
                />
                <CategoryBreakdown data={regAnalytics?.by_category ?? []} />
              </div>

              {/* Institution leaderboard + gender split */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <InstitutionLeaderboard
                    data={regAnalytics?.by_institution ?? []}
                  />
                </div>
                <GenderSplit data={regAnalytics?.by_gender ?? []} />
              </div>
            </div>
          )}
        </section>

        <Separator />

        {/* ── Race Analytics ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Race Performance</h2>
            {!hasRaceResults && !raceLoading && (
              <Badge variant="outline" className="text-xs ml-1">
                Results not published yet
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Available after race results are imported or entered.
          </p>

          {raceLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <div className="h-40 animate-pulse bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {hasRaceResults && raceAnalytics && (
                <PerformanceOverview analytics={raceAnalytics} />
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PaceDistributionChart
                  data={raceAnalytics?.pace_distribution ?? []}
                />
                <FinishTimeDistributionChart
                  data={raceAnalytics?.finish_time_distribution ?? []}
                />
              </div>
            </div>
          )}
        </section>

        <Separator />

        {/* ── College Comparison ──────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">College Performance Comparison</h2>
          </div>
          {collegesLoading ? (
            <Card>
              <CardContent className="pt-4">
                <div className="h-60 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ) : (
            <CollegePerformanceTable colleges={colleges ?? []} />
          )}
        </section>

        <Separator />

        {/* ── Race Replay ─────────────────────────────────────────────── */}
        <section>
          <RaceReplay eventId={eventId} />
        </section>
      </div>
    </ContentLayout>
  );
}
