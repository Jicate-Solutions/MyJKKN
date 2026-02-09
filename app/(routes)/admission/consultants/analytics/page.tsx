'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  BarChart3,
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Award,
  RefreshCw,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertCircle,
  PieChart,
  Activity
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type {
  ConsultantDashboardStats,
  CommissionLiabilityReport,
  ConsultantPerformanceMetrics
} from '@/types/education-consultants';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip
} from 'recharts';

// Color palette for charts
const CHART_COLORS = {
  primary: '#0b6d41',
  secondary: '#ffde59',
  tertiary: '#3b82f6',
  quaternary: '#8b5cf6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  muted: '#94a3b8'
};

const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  diamond: '#B9F2FF'
};

const TYPE_COLORS: Record<string, string> = {
  external: '#3b82f6',
  internal: '#22c55e',
  institutional: '#8b5cf6',
  alumni: '#f59e0b',
  student: '#ef4444'
};

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

// Format percentage
function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

// KPI Card Component
function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  loading
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend && (
            <span
              className={`flex items-center ${
                trend === 'up'
                  ? 'text-green-600'
                  : trend === 'down'
                  ? 'text-red-600'
                  : 'text-gray-500'
              }`}
            >
              {trend === 'up' ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : trend === 'down' ? (
                <ArrowDownRight className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {trendValue}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// Top Performers Table Component
function TopPerformersTable({
  performers,
  loading
}: {
  performers: ConsultantPerformanceMetrics[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (performers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Award className="h-12 w-12 mb-2 opacity-50" />
        <p>No performance data available yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rank</TableHead>
          <TableHead>Consultant</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">Conversions</TableHead>
          <TableHead className="text-right">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {performers.map((performer, index) => (
          <TableRow key={performer.consultant_id}>
            <TableCell>
              <Badge
                variant={index < 3 ? 'default' : 'secondary'}
                className={
                  index === 0
                    ? 'bg-yellow-500'
                    : index === 1
                    ? 'bg-gray-400'
                    : index === 2
                    ? 'bg-orange-600'
                    : ''
                }
              >
                #{index + 1}
              </Badge>
            </TableCell>
            <TableCell className="font-medium">
              {performer.consultant_name || 'Unknown'}
            </TableCell>
            <TableCell>
              <Badge
                style={{ backgroundColor: TIER_COLORS[performer.tier] || '#gray' }}
                className="text-black"
              >
                {performer.tier}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{performer.total_leads}</TableCell>
            <TableCell className="text-right">{performer.total_conversions}</TableCell>
            <TableCell className="text-right">
              {formatPercentage(performer.conversion_rate)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Liability Summary Component
function LiabilitySummary({
  liability,
  loading
}: {
  liability: CommissionLiabilityReport | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!liability) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-2 opacity-50" />
        <p>No liability data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Liability Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-yellow-50 rounded-lg">
          <div className="text-sm text-yellow-700">Pending</div>
          <div className="text-xl font-bold text-yellow-800">
            {formatCurrency(liability.total_pending)}
          </div>
        </div>
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="text-sm text-blue-700">Earned</div>
          <div className="text-xl font-bold text-blue-800">
            {formatCurrency(liability.total_earned)}
          </div>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <div className="text-sm text-green-700">Approved</div>
          <div className="text-xl font-bold text-green-800">
            {formatCurrency(liability.total_approved)}
          </div>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg">
          <div className="text-sm text-purple-700">Total Liability</div>
          <div className="text-xl font-bold text-purple-800">
            {formatCurrency(liability.grand_total_liability)}
          </div>
        </div>
      </div>

      {/* Top Consultants by Liability */}
      {liability.liability_by_consultant.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Top Liabilities by Consultant</h4>
          <div className="space-y-2">
            {liability.liability_by_consultant.slice(0, 5).map((item) => (
              <div
                key={item.consultant_id}
                className="flex items-center justify-between p-2 bg-muted/30 rounded"
              >
                <span className="text-sm">{item.consultant_name}</span>
                <span className="font-medium">{formatCurrency(item.total_liability)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsultantAnalyticsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;
  const [dateRange, setDateRange] = useState('30d');

  // Fetch dashboard stats
  const {
    data: dashboardStats,
    isLoading: statsLoading,
    refetch: refetchStats
  } = useQuery({
    queryKey: ['consultant-dashboard-stats', institutionId],
    queryFn: () => ConsultantService.getDashboardStats(institutionId!),
    enabled: !!institutionId
  });

  // Fetch liability report
  const {
    data: liabilityReport,
    isLoading: liabilityLoading
  } = useQuery({
    queryKey: ['consultant-liability-report', institutionId],
    queryFn: () => ConsultantService.getCommissionLiabilityReport(institutionId!),
    enabled: !!institutionId
  });

  // Prepare chart data
  const tierChartData = useMemo(() => {
    if (!dashboardStats?.consultants_by_tier) return [];
    return Object.entries(dashboardStats.consultants_by_tier).map(([tier, count]) => ({
      name: tier.charAt(0).toUpperCase() + tier.slice(1),
      value: count,
      fill: TIER_COLORS[tier] || CHART_COLORS.muted
    }));
  }, [dashboardStats]);

  const typeChartData = useMemo(() => {
    if (!dashboardStats?.consultants_by_type) return [];
    return Object.entries(dashboardStats.consultants_by_type).map(([type, count]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: count,
      fill: TYPE_COLORS[type] || CHART_COLORS.muted
    }));
  }, [dashboardStats]);

  const liabilityTrendData = useMemo(() => {
    if (!liabilityReport?.liability_by_month) return [];
    return liabilityReport.liability_by_month.map((item) => ({
      month: item.month,
      amount: item.amount
    }));
  }, [liabilityReport]);

  const isLoading = statsLoading || liabilityLoading;

  return (
    <PermissionGuard module="admission.consultants.analytics" action="view">
      <ContentLayout title="Consultant Analytics">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admission">Admission</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admission/consultants">Consultants</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Analytics</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between mt-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Consultant Analytics
            </h1>
            <p className="text-muted-foreground">
              Performance metrics and insights for education consultants
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetchStats()}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
          <KPICard
            title="Total Consultants"
            value={dashboardStats?.total_consultants || 0}
            subtitle={`${dashboardStats?.active_consultants || 0} active`}
            icon={Users}
            loading={statsLoading}
          />
          <KPICard
            title="Total Leads"
            value={dashboardStats?.total_leads_referred || 0}
            subtitle={`${dashboardStats?.leads_this_month || 0} this month`}
            icon={Target}
            loading={statsLoading}
          />
          <KPICard
            title="Conversion Rate"
            value={formatPercentage(dashboardStats?.overall_conversion_rate || 0)}
            subtitle={`${dashboardStats?.total_conversions || 0} conversions`}
            icon={TrendingUp}
            loading={statsLoading}
          />
          <KPICard
            title="Commission Paid"
            value={formatCurrency(dashboardStats?.total_commission_paid || 0)}
            subtitle={`${formatCurrency(dashboardStats?.pending_commission || 0)} pending`}
            icon={DollarSign}
            loading={statsLoading}
          />
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="overview" className="mt-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="commissions">Commissions</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Consultants by Tier */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Consultants by Tier
                  </CardTitle>
                  <CardDescription>Distribution of consultants across tiers</CardDescription>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : tierChartData.length > 0 ? (
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={tierChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {tierChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No tier data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Consultants by Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Consultants by Type
                  </CardTitle>
                  <CardDescription>Distribution by consultant type</CardDescription>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : typeChartData.length > 0 ? (
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={typeChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill={CHART_COLORS.primary}>
                            {typeChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No type data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Performers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Top Performers
                </CardTitle>
                <CardDescription>
                  Consultants ranked by conversion performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TopPerformersTable
                  performers={dashboardStats?.top_consultants || []}
                  loading={statsLoading}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Performance Metrics Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Performance Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span>Average Conversion Rate</span>
                      <span className="font-bold text-lg">
                        {formatPercentage(dashboardStats?.overall_conversion_rate || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span>Average Commission/Conversion</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(dashboardStats?.average_commission_per_conversion || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span>Total Conversions</span>
                      <span className="font-bold text-lg">
                        {dashboardStats?.total_conversions || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span>Conversions This Month</span>
                      <span className="font-bold text-lg">
                        {dashboardStats?.conversions_this_month || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Leads Pipeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Lead Pipeline
                  </CardTitle>
                  <CardDescription>Leads by funnel stage</CardDescription>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <Skeleton className="h-[200px] w-full" />
                  ) : Object.keys(dashboardStats?.leads_by_stage || {}).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(dashboardStats?.leads_by_stage || {}).map(
                        ([stage, count]) => (
                          <div
                            key={stage}
                            className="flex items-center gap-3 p-2 bg-muted/30 rounded"
                          >
                            <Badge variant="outline" className="capitalize">
                              {stage.replace(/_/g, ' ')}
                            </Badge>
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full"
                                style={{
                                  width: `${Math.min(
                                    ((count as number) /
                                      (dashboardStats?.total_leads_referred || 1)) *
                                      100,
                                    100
                                  )}%`
                                }}
                              />
                            </div>
                            <span className="font-medium">{count}</span>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No pipeline data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Full Performers List */}
            <Card>
              <CardHeader>
                <CardTitle>All Consultant Performance</CardTitle>
                <CardDescription>Detailed performance metrics for all consultants</CardDescription>
              </CardHeader>
              <CardContent>
                <TopPerformersTable
                  performers={dashboardStats?.top_consultants || []}
                  loading={statsLoading}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Commission Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Commission Summary
                  </CardTitle>
                  <CardDescription>Overview of all commission transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-green-700">Total Paid</span>
                      <span className="font-bold text-lg text-green-800">
                        {formatCurrency(dashboardStats?.total_commission_paid || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-blue-700">Paid This Month</span>
                      <span className="font-bold text-lg text-blue-800">
                        {formatCurrency(dashboardStats?.commission_paid_this_month || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                      <span className="text-yellow-700">Pending</span>
                      <span className="font-bold text-lg text-yellow-800">
                        {formatCurrency(dashboardStats?.pending_commission || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                      <span className="text-purple-700">Avg. per Conversion</span>
                      <span className="font-bold text-lg text-purple-800">
                        {formatCurrency(dashboardStats?.average_commission_per_conversion || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Liability Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Liability Trend
                  </CardTitle>
                  <CardDescription>Monthly commission liability</CardDescription>
                </CardHeader>
                <CardContent>
                  {liabilityLoading ? (
                    <Skeleton className="h-[200px] w-full" />
                  ) : liabilityTrendData.length > 0 ? (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={liabilityTrendData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={(value) => [formatCurrency(value as number), 'Amount']}
                          />
                          <Line
                            type="monotone"
                            dataKey="amount"
                            stroke={CHART_COLORS.primary}
                            strokeWidth={2}
                            dot={{ fill: CHART_COLORS.primary }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No trend data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Liability Report */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Commission Liability Report
                </CardTitle>
                <CardDescription>
                  Outstanding commission liabilities as of{' '}
                  {liabilityReport?.as_of_date
                    ? new Date(liabilityReport.as_of_date).toLocaleDateString()
                    : 'now'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LiabilitySummary liability={liabilityReport || null} loading={liabilityLoading} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ContentLayout>
    </PermissionGuard>
  );
}
