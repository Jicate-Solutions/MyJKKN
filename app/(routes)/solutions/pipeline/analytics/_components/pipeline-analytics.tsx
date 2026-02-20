'use client';

import { usePipelineAnalytics, useProspectStats } from '@/hooks/solutions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, Clock, DollarSign, Users } from 'lucide-react';

// Stage colors
const STAGE_COLORS: Record<string, string> = {
  Lead: '#64748b',
  Qualified: '#3b82f6',
  Proposal: '#f59e0b',
  Negotiation: '#8b5cf6',
  Won: '#22c55e',
  Lost: '#ef4444',
  Dormant: '#9ca3af',
};

const SOURCE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4', '#ec4899'];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);


export function PipelineAnalytics() {
  const { data: analytics, isLoading: analyticsLoading } = usePipelineAnalytics();
  const { data: stats, isLoading: statsLoading } = useProspectStats();

  const isLoading = analyticsLoading || statsLoading;

  // Current month win rate
  const currentMonthWinRate = analytics?.monthlyWinRate?.[analytics.monthlyWinRate.length - 1]?.winRate ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Performance insights across the prospect pipeline
        </p>
      </div>

      {/* Key Metrics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Win Rate (This Month)"
          value={`${currentMonthWinRate}%`}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          loading={isLoading}
        />
        <MetricCard
          title="Avg Days in Pipeline"
          value={`${analytics?.avgDaysInPipeline ?? 0} days`}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          loading={isLoading}
        />
        <MetricCard
          title="Total Pipeline Value"
          value={formatCurrency(stats?.totalPipelineValue ?? 0)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          loading={isLoading}
        />
        <MetricCard
          title="Active Prospects"
          value={`${stats?.total ?? 0}`}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          loading={isLoading}
        />
      </div>

      {/* Charts - 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A. Monthly Win Rate */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monthly Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : !analytics?.monthlyWinRate?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.monthlyWinRate}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    domain={[0, 100]}
                    label={{ value: 'Win %', angle: 90, position: 'insideRight', style: { fontSize: 11 } }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--card-foreground))',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="won" name="Won" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="lost" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="winRate"
                    name="Win Rate %"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* B. Source Breakdown (Pie/Donut) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Source Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : !analytics?.sourceBreakdown?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={analytics.sourceBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="source"
                    label={({ source, count }) => `${source}: ${count}`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {analytics.sourceBreakdown.map((_, idx) => (
                      <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--card-foreground))',
                    }}
                    formatter={(value: number, name: string, entry: { payload: { won: number; value: number } }) => {
                      const d = entry.payload;
                      return [`${value} total, ${d.won} won, ${formatCurrency(d.value)} value`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* C. Conversion Funnel (Horizontal Bar) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : !analytics?.conversionFunnel?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={analytics.conversionFunnel}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 12 }}
                    width={90}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--card-foreground))',
                    }}
                    formatter={(value: number, _name: string, entry: { payload: { percentage: number } }) => [
                      `${value} prospects (${entry.payload.percentage}%)`,
                      'Count',
                    ]}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {analytics.conversionFunnel.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={STAGE_COLORS[entry.stage] || '#64748b'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* D. Monthly Prospect Trends (Line/Area) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monthly Prospect Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : !analytics?.monthlyProspects?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analytics.monthlyProspects}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--card-foreground))',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="new"
                    name="New Prospects"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="won"
                    name="Won"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="lost"
                    name="Lost"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{title}</span>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
