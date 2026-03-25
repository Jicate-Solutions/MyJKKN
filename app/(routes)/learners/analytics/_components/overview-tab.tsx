// ============================================
// OVERVIEW TAB - COMPREHENSIVE
// ============================================
// Created: 2025-01-23
// Purpose: High-level KPIs, lifecycle funnel, conversion metrics
// Charts: KPI cards, status distribution pie chart, conversion funnel
// ============================================

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  UserCheck,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import type { LearnerDashboardStats, LearnerDashboardFilters } from '@/types/learner-dashboard';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

interface OverviewTabProps {
  data: LearnerDashboardStats;
  filters: LearnerDashboardFilters;
}

// Color scheme for lifecycle statuses
const STATUS_COLORS: Record<string, string> = {
  enquiry: '#3b82f6',    // blue
  pending: '#eab308',    // yellow
  approved: '#f97316',   // orange
  active: '#22c55e',     // green
  inactive: '#6b7280',   // gray
  graduated: '#a855f7',  // purple
  exited: '#ef4444'      // red
};

export function OverviewTab({ data, filters }: OverviewTabProps) {
  // Prepare status distribution data for pie chart
  const statusData = data.byStatus.map((item) => ({
    name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    value: item.count,
    percentage: item.percentage,
    color: STATUS_COLORS[item.status] || '#6b7280'
  }));

  // Conversion funnel data
  const funnelData = [
    {
      stage: 'Enquiries',
      count: data.conversion.totalEnquiries,
      percentage: 100,
      color: STATUS_COLORS.enquiry
    },
    {
      stage: 'Pending',
      count: data.pendingCount,
      percentage: (data.pendingCount / data.conversion.totalEnquiries) * 100,
      color: STATUS_COLORS.pending
    },
    {
      stage: 'Approved',
      count: data.approvedCount,
      percentage: (data.approvedCount / data.conversion.totalEnquiries) * 100,
      color: STATUS_COLORS.approved
    },
    {
      stage: 'Active',
      count: data.conversion.convertedToActive,
      percentage: data.conversion.conversionRate,
      color: STATUS_COLORS.active
    },
    {
      stage: 'Graduated',
      count: data.graduatedCount,
      percentage: (data.graduatedCount / data.conversion.totalEnquiries) * 100,
      color: STATUS_COLORS.graduated
    }
  ];

  // Render custom label for pie chart
  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent
  }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
    const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));

    if (percent < 0.05) return null; // Don't show label for slices < 5%

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Render trend indicator
  const renderTrendIndicator = (trendData: { change: number; trend: 'up' | 'down' | 'stable' }) => {
    const isPositive = trendData.change > 0;
    const isStable = trendData.trend === 'stable';

    if (isStable) {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" />
          <span>No change</span>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        <span>{Math.abs(trendData.change).toFixed(1)}%</span>
        <span className="text-muted-foreground">vs previous period</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Learners */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Learners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All learner profiles
            </p>
          </CardContent>
        </Card>

        {/* Active Students */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Students</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data.activeCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((data.activeCount / data.totalCount) * 100).toFixed(1)}% of total
            </p>
            {renderTrendIndicator(data.activations30Days)}
          </CardContent>
        </Card>

        {/* Total Enquiries */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enquiries</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {data.newEnquiries30Days.current.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All enquiries
            </p>
            {renderTrendIndicator(data.newEnquiries30Days)}
          </CardContent>
        </Card>

        {/* Awaiting Activation */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Activation</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {data.profileCompletion.awaitingActivation.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Complete profiles ready for activation
            </p>
            {data.profileCompletion.awaitingActivation > 0 && (
              <Badge variant="outline" className="mt-2 border-orange-500 text-orange-600">
                Action Required
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Lifecycle Status Distribution - Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle Status Distribution</CardTitle>
            <CardDescription>
              Breakdown by learner status ({data.totalCount.toLocaleString()} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string, props: any) => [
                    `${value.toLocaleString()} (${props.payload.percentage.toFixed(1)}%)`,
                    name
                  ]}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value, entry: any) => (
                    <span className="text-sm">
                      {value}: {entry.payload.value.toLocaleString()}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Status List with Counts */}
            <div className="mt-4 space-y-2">
              {data.byStatus.map((status) => (
                <div key={status.status} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[status.status] }}
                    />
                    <span className="capitalize">{status.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{status.count.toLocaleString()}</span>
                    <Badge variant="secondary" className="text-xs">
                      {status.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>
              Enquiry to active student conversion ({data.conversion.conversionRate.toFixed(1)}% conversion)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                layout="vertical"
                data={funnelData}
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="stage" width={80} />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => [
                    `${value.toLocaleString()} (${props.payload.percentage.toFixed(1)}%)`,
                    'Count'
                  ]}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Funnel Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Drop-off at Pending</p>
                <p className="text-lg font-bold">{data.conversion.dropOffAtPending.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Drop-off at Approved</p>
                <p className="text-lg font-bold">{data.conversion.dropOffAtApproved.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Metrics Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion Metrics</CardTitle>
          <CardDescription>
            Detailed analytics on enquiry-to-active conversion performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <p className="text-sm text-muted-foreground">Total Enquiries</p>
              </div>
              <p className="text-2xl font-bold">{data.conversion.totalEnquiries.toLocaleString()}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <p className="text-sm text-muted-foreground">Converted to Active</p>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {data.conversion.convertedToActive.toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {data.conversion.conversionRate.toFixed(1)}%
              </p>
              <Progress value={data.conversion.conversionRate} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <p className="text-sm text-muted-foreground">Avg. Time to Activation</p>
              </div>
              <p className="text-2xl font-bold text-orange-600">
                {data.conversion.averageTimeToActivation.toFixed(0)} days
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Completion Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Completion Overview</CardTitle>
          <CardDescription>
            Overall profile completion status across all learners
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Overall Completion Progress */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Completion Rate</span>
                <span className="text-2xl font-bold text-green-600">
                  {data.profileCompletion.completionRate.toFixed(1)}%
                </span>
              </div>
              <Progress value={data.profileCompletion.completionRate} className="h-3" />
            </div>

            {/* Completion Stats Grid */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-muted-foreground">Complete Profiles</p>
                </div>
                <p className="text-xl font-bold">{data.profileCompletion.completeProfiles.toLocaleString()}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <p className="text-sm text-muted-foreground">Incomplete Profiles</p>
                </div>
                <p className="text-xl font-bold text-orange-600">
                  {data.profileCompletion.incompleteProfiles.toLocaleString()}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <p className="text-sm text-muted-foreground">Ready for Activation</p>
                </div>
                <p className="text-xl font-bold text-blue-600">
                  {data.profileCompletion.awaitingActivation.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Missing Fields Breakdown */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Most Common Missing Fields</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Missing College Email</span>
                  <Badge variant="destructive">
                    {data.profileCompletion.missingCollegeEmail.toLocaleString()}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Missing Academic Year</span>
                  <Badge variant="destructive">
                    {data.profileCompletion.missingAcademicYear.toLocaleString()}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Missing Semester</span>
                  <Badge variant="destructive">
                    {data.profileCompletion.missingSemester.toLocaleString()}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Missing Section</span>
                  <Badge variant="destructive">
                    {data.profileCompletion.missingSection.toLocaleString()}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
