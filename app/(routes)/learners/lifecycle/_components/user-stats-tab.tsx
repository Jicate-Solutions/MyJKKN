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
  XAxis,
  YAxis,
} from 'recharts';
import { Users, UserCheck, UserPlus, LogIn, Clock, Crown } from 'lucide-react';
import type { UserStatsResponse } from '@/types/usage-analytics';

interface UserStatsTabProps {
  data: UserStatsResponse | undefined;
  loading: boolean;
}

const loginTrendConfig: ChartConfig = {
  total_logins: {
    label: 'Total Logins',
    color: 'hsl(var(--chart-1))',
  },
  unique_users: {
    label: 'Unique Users',
    color: 'hsl(var(--chart-2))',
  },
};

const roleConfig: ChartConfig = {
  active_count: {
    label: 'Active',
    color: 'hsl(var(--chart-1))',
  },
  inactive: {
    label: 'Inactive',
    color: 'hsl(var(--chart-3))',
  },
};

const frequencyConfig: ChartConfig = {
  user_count: {
    label: 'Users',
    color: 'hsl(var(--chart-4))',
  },
};

const deptConfig: ChartConfig = {
  active_users: {
    label: 'Active Users',
    color: 'hsl(var(--chart-1))',
  },
  total_users: {
    label: 'Total Users',
    color: 'hsl(var(--chart-3))',
  },
};

export function UserStatsTab({ data, loading }: UserStatsTabProps) {
  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  const { summary, role_distribution, login_trends, login_frequency, top_users, department_breakdown } = data;

  // Format trend data
  const trendData = login_trends.map((t) => ({
    ...t,
    date: new Date(t.date).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  // Prepare role data with inactive count
  const roleData = role_distribution.map((r) => ({
    role: r.role,
    active_count: r.active_count,
    inactive: r.total_count - r.active_count,
  }));

  // Prepare department data (top 10)
  const deptData = department_breakdown.slice(0, 10).map((d) => ({
    name: d.department_name.length > 20
      ? d.department_name.substring(0, 18) + '...'
      : d.department_name,
    active_users: d.active_users,
    total_users: d.total_users,
  }));

  const kpiCards = [
    {
      title: 'Total Users',
      value: summary.total_registered_users.toLocaleString(),
      subtitle: `${summary.inactive_users_count} inactive`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Active in Period',
      value: summary.active_users_in_period.toLocaleString(),
      subtitle: `${summary.avg_logins_per_user} avg logins/user`,
      icon: UserCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'New Users',
      value: summary.new_users_in_period.toLocaleString(),
      subtitle: 'registered in period',
      icon: UserPlus,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Avg Session',
      value: `${summary.avg_session_duration_minutes}m`,
      subtitle: `Most active: ${summary.most_active_role}`,
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </p>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Login Activity Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LogIn className="h-4 w-4" />
            Login Activity Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-60 text-muted-foreground">
              No login data available for the selected period
            </div>
          ) : (
            <ChartContainer config={loginTrendConfig} className="h-72 w-full">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="total_logins"
                  stroke="var(--color-total_logins)"
                  fill="var(--color-total_logins)"
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

      {/* Row 3: Role Distribution + Login Frequency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Users by Role */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Users by Role</CardTitle>
          </CardHeader>
          <CardContent>
            {roleData.length === 0 ? (
              <div className="flex items-center justify-center h-60 text-muted-foreground">
                No role data available
              </div>
            ) : (
              <ChartContainer config={roleConfig} className="h-60 w-full">
                <BarChart data={roleData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis
                    dataKey="role"
                    type="category"
                    width={90}
                    fontSize={11}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="active_count"
                    stackId="a"
                    fill="var(--color-active_count)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="inactive"
                    stackId="a"
                    fill="var(--color-inactive)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Login Frequency Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Login Frequency Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {login_frequency.every((b) => b.user_count === 0) ? (
              <div className="flex items-center justify-center h-60 text-muted-foreground">
                No login frequency data available
              </div>
            ) : (
              <ChartContainer config={frequencyConfig} className="h-60 w-full">
                <BarChart data={login_frequency}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" fontSize={12} />
                  <YAxis fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="user_count"
                    fill="var(--color-user_count)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Department Breakdown + Top Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {deptData.length === 0 ? (
              <div className="flex items-center justify-center h-60 text-muted-foreground">
                No department data available
              </div>
            ) : (
              <ChartContainer config={deptConfig} className="h-60 w-full">
                <BarChart data={deptData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    fontSize={11}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="active_users"
                    fill="var(--color-active_users)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Active Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4" />
              Top 20 Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top_users.length === 0 ? (
              <div className="flex items-center justify-center h-60 text-muted-foreground">
                No user activity data available
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left py-2 pl-2 font-medium text-muted-foreground">#</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Role</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground">Logins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top_users.map((user, idx) => (
                      <tr key={user.user_id} className="border-b last:border-0">
                        <td className="py-1.5 pl-2 text-muted-foreground">{idx + 1}</td>
                        <td className="py-1.5">
                          <div className="truncate max-w-[160px]" title={user.full_name}>
                            {user.full_name}
                          </div>
                        </td>
                        <td className="py-1.5">
                          <Badge variant="outline" className="text-xs">
                            {user.role}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-2 text-right font-medium">
                          {user.login_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
