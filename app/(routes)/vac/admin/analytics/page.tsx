'use client';

import { useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import {
  useVACOverviewStats,
  useEnrollmentTrends,
  useVACProgrammeStats,
} from '@/hooks/vac/use-vac';
import { useTrackCompletionStats } from '@/hooks/vac/use-case';
import type { VACOverviewStats, VACTrendDataPoint, VACProgrammeStats } from '@/types/vac';
import type { TrackCompletionStats } from '@/types/case';
import {
  BookOpen,
  Users,
  GraduationCap,
  TrendingUp,
  IndianRupee,
  BarChart3,
} from 'lucide-react';

// ── Simple Bar Chart (dependency-free) ────────────────────────────────────────

function BarChart({
  data,
  labelKey,
  valueKey,
  maxValue,
  color = 'bg-primary',
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  maxValue: number;
  color?: string;
}) {
  if (!data.length) return <p className="text-sm text-muted-foreground">No data</p>;

  return (
    <div className="space-y-3">
      {data.map((item, i) => {
        const label = String(item[labelKey] || '');
        const value = Number(item[valueKey] || 0);
        const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
        return (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="truncate max-w-[200px]">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all`}
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Simple SVG Line Chart (dependency-free) ───────────────────────────────────

function LineChart({
  data,
  lines,
  labelKey,
}: {
  data: Record<string, unknown>[];
  lines: { key: string; color: string; label: string }[];
  labelKey: string;
}) {
  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough data for trends</p>;
  }

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };

  const allValues = lines.flatMap((line) =>
    data.map((d) => Number(d[line.key] || 0))
  );
  const maxVal = Math.max(...allValues, 1);

  const xScale = (i: number) =>
    padding.left +
    (i / (data.length - 1)) * (width - padding.left - padding.right);
  const yScale = (v: number) =>
    height -
    padding.bottom -
    (v / maxVal) * (height - padding.top - padding.bottom);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[400px]">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = yScale(maxVal * pct);
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="stroke-muted"
                strokeWidth={0.5}
              />
              <text
                x={padding.left - 5}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={9}
              >
                {Math.round(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {/* Lines */}
        {lines.map((line) => {
          const points = data
            .map((d, i) => `${xScale(i)},${yScale(Number(d[line.key] || 0))}`)
            .join(' ');
          return (
            <polyline
              key={line.key}
              points={points}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (data.length > 12 && i % 2 !== 0) return null;
          return (
            <text
              key={i}
              x={xScale(i)}
              y={height - 5}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={8}
            >
              {String(d[labelKey] || '')}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 justify-center">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center gap-1.5 text-xs">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: line.color }}
            />
            <span>{line.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Funnel Visualization ──────────────────────────────────────────────────────

function EnrollmentFunnel({ stats }: { stats: VACOverviewStats }) {
  const stages = [
    { label: 'Total Enrolled', value: stats.total_enrollments, color: 'bg-blue-500' },
    { label: 'Active', value: stats.active_enrollments, color: 'bg-green-500' },
    { label: 'Completed', value: stats.completed_enrollments, color: 'bg-violet-500' },
  ];
  const maxVal = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const pct = (stage.value / maxVal) * 100;
        return (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{stage.label}</span>
              <span className="font-bold">{stage.value}</span>
            </div>
            <div className="h-8 bg-muted rounded overflow-hidden">
              <div
                className={`h-full ${stage.color} rounded transition-all flex items-center justify-end pr-2`}
                style={{ width: `${Math.max(pct, 5)}%` }}
              >
                <span className="text-white text-xs font-medium">
                  {Math.round(pct)}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const { data: overviewData, isLoading: overviewLoading } =
    useVACOverviewStats(institutionId);
  const { data: trendsData, isLoading: trendsLoading } =
    useEnrollmentTrends(institutionId);
  const { data: trackStatsData, isLoading: trackLoading } =
    useTrackCompletionStats(institutionId);
  const { data: progStatsData, isLoading: progLoading } =
    useVACProgrammeStats(institutionId);

  const stats = overviewData as VACOverviewStats | undefined;
  const trends = (trendsData ?? []) as VACTrendDataPoint[];
  const trackStats = (trackStatsData ?? []) as TrackCompletionStats[];
  const progStats = (progStatsData ?? []) as VACProgrammeStats[];

  const trackBarMax = useMemo(
    () => Math.max(...trackStats.map((t) => t.total_enrolled), 1),
    [trackStats]
  );

  return (
    <ContentLayout title="Analytics">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Analytics</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Enrollment trends, CASE progress, and programme statistics
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="case-tracks">CASE Tracks</TabsTrigger>
            <TabsTrigger value="programmes">Programmes</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          {/* Tab 1: Overview */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {overviewLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <BookOpen className="h-8 w-8 text-primary" />
                      <div>
                        <p className="text-2xl font-bold">{stats.total_courses}</p>
                        <p className="text-xs text-muted-foreground">Total Courses</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <Users className="h-8 w-8 text-green-600" />
                      <div>
                        <p className="text-2xl font-bold">{stats.total_enrollments}</p>
                        <p className="text-xs text-muted-foreground">Total Enrollments</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <GraduationCap className="h-8 w-8 text-violet-600" />
                      <div>
                        <p className="text-2xl font-bold">
                          {stats.avg_completion_rate.toFixed(0)}%
                        </p>
                        <p className="text-xs text-muted-foreground">Avg Completion</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <IndianRupee className="h-8 w-8 text-amber-600" />
                      <div>
                        <p className="text-2xl font-bold">
                          {(stats.total_revenue / 1000).toFixed(1)}K
                        </p>
                        <p className="text-xs text-muted-foreground">Revenue (INR)</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Enrollment Funnel</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EnrollmentFunnel stats={stats} />
                  </CardContent>
                </Card>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No data available</p>
            )}
          </TabsContent>

          {/* Tab 2: CASE Tracks */}
          <TabsContent value="case-tracks" className="space-y-4 mt-4">
            {trackLoading ? (
              <Skeleton className="h-64" />
            ) : trackStats.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No CASE track data available
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Track Completion Rates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChart
                    data={trackStats as unknown as Record<string, unknown>[]}
                    labelKey="track_name"
                    valueKey="total_enrolled"
                    maxValue={trackBarMax}
                    color="bg-blue-500"
                  />
                  <div className="mt-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Track</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-center">Enrolled</TableHead>
                          <TableHead className="text-center">Completed</TableHead>
                          <TableHead className="text-center">Rate</TableHead>
                          <TableHead className="text-center">Avg Attendance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trackStats.map((track) => (
                          <TableRow key={track.track_id}>
                            <TableCell className="font-medium">
                              {track.track_name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {track.track_type === 'ai_mastery' ? 'AI' : 'Human'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {track.total_enrolled}
                            </TableCell>
                            <TableCell className="text-center">
                              {track.completed_count}
                            </TableCell>
                            <TableCell className="text-center">
                              {track.completion_rate.toFixed(0)}%
                            </TableCell>
                            <TableCell className="text-center">
                              {track.avg_attendance.toFixed(0)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab 3: Programmes */}
          <TabsContent value="programmes" className="space-y-4 mt-4">
            {progLoading ? (
              <Skeleton className="h-64" />
            ) : progStats.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No programme data available
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Programme-wise Enrollment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Programme</TableHead>
                        <TableHead className="text-center">Enrolled</TableHead>
                        <TableHead className="text-center">Completed</TableHead>
                        <TableHead className="text-center">At Risk</TableHead>
                        <TableHead className="text-center">Avg Completion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {progStats.map((prog) => (
                        <TableRow key={prog.programme_id}>
                          <TableCell className="font-medium">
                            {prog.programme_name}
                          </TableCell>
                          <TableCell className="text-center">
                            {prog.enrolled_count}
                          </TableCell>
                          <TableCell className="text-center">
                            {prog.completed_count}
                          </TableCell>
                          <TableCell className="text-center">
                            {prog.at_risk_count > 0 ? (
                              <Badge variant="destructive">
                                {prog.at_risk_count}
                              </Badge>
                            ) : (
                              0
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {prog.avg_completion_pct.toFixed(0)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab 4: Trends */}
          <TabsContent value="trends" className="space-y-4 mt-4">
            {trendsLoading ? (
              <Skeleton className="h-64" />
            ) : trends.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No trend data available
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Monthly Enrollment & Completion Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <LineChart
                    data={trends as unknown as Record<string, unknown>[]}
                    labelKey="month"
                    lines={[
                      { key: 'enrollments', color: '#3b82f6', label: 'Enrollments' },
                      { key: 'completions', color: '#22c55e', label: 'Completions' },
                    ]}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
