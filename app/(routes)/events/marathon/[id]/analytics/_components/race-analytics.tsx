'use client';

// app/(routes)/events/marathon/[id]/analytics/_components/race-analytics.tsx
// Race performance charts: pace distribution, finish time histogram, college comparison.
// Created: 2026-04-07

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer, TrendingUp, Users, Award } from 'lucide-react';
import type { RaceAnalytics, CollegePerformance } from '@/lib/services/events/marathon/marathon-analytics-service';

// ============================================================================
// Helpers
// ============================================================================

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd',
  '#ec4899', '#f43f5e', '#fb923c', '#fbbf24',
];

// ============================================================================
// Performance Overview Cards
// ============================================================================

function PerformanceOverview({ analytics }: { analytics: RaceAnalytics }) {
  const cards = [
    {
      label: 'Fastest Finisher',
      value: formatSeconds(analytics.fastest_time_seconds),
      icon: Award,
      color: 'text-yellow-500',
    },
    {
      label: 'Average Finish Time',
      value: formatSeconds(analytics.avg_finish_time_seconds),
      icon: Timer,
      color: 'text-blue-500',
    },
    {
      label: 'Median Finish Time',
      value: formatSeconds(analytics.median_finish_time_seconds),
      icon: TrendingUp,
      color: 'text-green-500',
    },
    {
      label: 'DNF / Disqualified',
      value: `${analytics.dnf_count} (${analytics.dnf_percentage}%)`,
      icon: Users,
      color: 'text-red-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className={`flex items-center gap-2 text-xs mb-1 ${c.color}`}>
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="text-xl font-bold font-mono">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Pace Distribution Bar Chart
// ============================================================================

function PaceDistributionChart({ data }: { data: RaceAnalytics['pace_distribution'] }) {
  const hasData = data.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Pace Distribution</CardTitle>
        <CardDescription className="text-xs">Runners grouped by pace (min/km)</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No pace data available yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value: number) => [value, 'Runners']}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} name="Runners" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Finish Time Distribution
// ============================================================================

function FinishTimeDistributionChart({
  data,
}: {
  data: RaceAnalytics['finish_time_distribution'];
}) {
  const hasData = data.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Finish Time Distribution</CardTitle>
        <CardDescription className="text-xs">
          Runners finishing in each 30-minute window
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No finish time data available yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value: number) => [value, 'Runners']}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Runners" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// College Performance Table
// ============================================================================

function CollegePerformanceTable({ colleges }: { colleges: CollegePerformance[] }) {
  if (colleges.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">College Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
            No college data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">College Performance Comparison</CardTitle>
        <CardDescription className="text-xs">
          Top institutions by participation and race performance
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Institution</th>
                <th className="text-right px-4 py-2.5 font-medium">Runners</th>
                <th className="text-right px-4 py-2.5 font-medium">Finishers</th>
                <th className="text-right px-4 py-2.5 font-medium">Avg Time</th>
                <th className="text-right px-4 py-2.5 font-medium">Best Time</th>
                <th className="text-right px-4 py-2.5 font-medium">DNF</th>
              </tr>
            </thead>
            <tbody>
              {colleges.slice(0, 20).map((c, i) => (
                <tr key={c.institution} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <span className="font-medium truncate max-w-[200px]">{c.institution}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">{c.participants}</td>
                  <td className="px-4 py-2.5 text-right">
                    {c.finishers > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {c.finishers}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatSeconds(c.avg_finish_time)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatSeconds(c.best_finish_time)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.dnf_count > 0 ? (
                      <span className="text-destructive text-xs">{c.dnf_count}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { PerformanceOverview, PaceDistributionChart, FinishTimeDistributionChart, CollegePerformanceTable };
