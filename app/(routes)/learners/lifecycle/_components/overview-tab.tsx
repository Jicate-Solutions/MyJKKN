'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Building2 } from 'lucide-react';
import type {
  DailyTrend,
  ModuleBreakdown,
  EventTypeDistribution,
  DormantInstitutionAlert,
} from '@/types/usage-analytics';
import { DORMANT_CONFIG, type DormantStatus } from '@/types/usage-analytics';

interface OverviewTabProps {
  dailyTrends: DailyTrend[];
  moduleBreakdown: ModuleBreakdown[];
  eventDistribution: EventTypeDistribution[];
  dormantAlerts?: DormantInstitutionAlert[];
  loading: boolean;
}

const trendConfig: ChartConfig = {
  weighted_score: {
    label: 'Weighted Score',
    color: 'hsl(var(--chart-1))',
  },
  unique_users: {
    label: 'Unique Users',
    color: 'hsl(var(--chart-2))',
  },
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  page_visit: 'hsl(var(--chart-1))',
  view: 'hsl(var(--chart-2))',
  create: 'hsl(var(--chart-3))',
  update: 'hsl(var(--chart-4))',
  delete: 'hsl(var(--chart-5))',
  export: 'hsl(210, 70%, 55%)',
  login: 'hsl(160, 60%, 50%)',
  logout: 'hsl(30, 60%, 50%)',
};

export function OverviewTab({
  dailyTrends,
  moduleBreakdown,
  eventDistribution,
  dormantAlerts = [],
  loading,
}: OverviewTabProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-80 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  // Prepare trend chart data - format dates for readability
  const trendData = dailyTrends.map((t) => ({
    ...t,
    date: new Date(t.date).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  // Top 10 modules for bar chart
  const top10Modules = moduleBreakdown.slice(0, 10).map((m) => ({
    name: m.module_label,
    score: m.weighted_score,
  }));

  // Pie chart config
  const pieConfig: ChartConfig = {};
  eventDistribution.forEach((ed) => {
    pieConfig[ed.event_type] = {
      label: ed.event_type.replace('_', ' '),
      color: EVENT_TYPE_COLORS[ed.event_type] || 'hsl(var(--chart-1))',
    };
  });

  return (
    <div className="space-y-4">
      {/* Dormant Institution Alerts */}
      {dormantAlerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Dormant Institutions
              <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                {dormantAlerts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {dormantAlerts.map((alert) => {
                const dormConfig = DORMANT_CONFIG[alert.status as DormantStatus];
                return (
                  <div
                    key={alert.institution_id}
                    className={`flex items-center justify-between p-2.5 rounded-md border ${dormConfig.borderColor} ${dormConfig.bgColor}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {alert.institution_name}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`${dormConfig.color} border-current text-xs shrink-0 ml-2`}
                    >
                      {alert.dormant_days > 0
                        ? `${alert.dormant_days}d`
                        : 'Never'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Trend Area Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Usage Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-60 text-muted-foreground">
              No trend data available for the selected period
            </div>
          ) : (
            <ChartContainer config={trendConfig} className="h-72 w-full">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="weighted_score"
                  stroke="var(--color-weighted_score)"
                  fill="var(--color-weighted_score)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="unique_users"
                  stroke="var(--color-unique_users)"
                  fill="var(--color-unique_users)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Module Usage Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Top Modules by Weighted Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top10Modules.length === 0 ? (
              <div className="flex items-center justify-center h-60 text-muted-foreground">
                No module data available
              </div>
            ) : (
              <ChartContainer
                config={{
                  score: {
                    label: 'Weighted Score',
                    color: 'hsl(var(--chart-1))',
                  },
                }}
                className="h-60 w-full"
              >
                <BarChart data={top10Modules} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    fontSize={11}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="score"
                    fill="var(--color-score)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Action Type Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Action Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventDistribution.length === 0 ? (
              <div className="flex items-center justify-center h-60 text-muted-foreground">
                No action data available
              </div>
            ) : (
              <ChartContainer config={pieConfig} className="h-60 w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={eventDistribution.map((ed) => ({
                      name: ed.event_type.replace('_', ' '),
                      value: ed.count,
                      fill:
                        EVENT_TYPE_COLORS[ed.event_type] ||
                        'hsl(var(--chart-1))',
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {eventDistribution.map((ed, idx) => (
                      <Cell
                        key={ed.event_type}
                        fill={
                          EVENT_TYPE_COLORS[ed.event_type] ||
                          `hsl(${idx * 45}, 70%, 55%)`
                        }
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            {/* Legend */}
            {eventDistribution.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {eventDistribution.map((ed) => (
                  <div
                    key={ed.event_type}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          EVENT_TYPE_COLORS[ed.event_type] ||
                          'hsl(var(--chart-1))',
                      }}
                    />
                    <span className="capitalize">
                      {ed.event_type.replace('_', ' ')}
                    </span>
                    <span className="text-muted-foreground">
                      ({ed.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
