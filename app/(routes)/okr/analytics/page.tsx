'use client';

// ============================================================================
// OKR Analytics Dashboard Page
// Role-based analytics with Recharts visualizations
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  useOKRAnalyticsSummary,
  useOKRProgressTrend,
  useOKRDepartmentComparison,
  useOKRProjections,
  useOKRDashboardRole,
} from '@/hooks/okr';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { format } from 'date-fns';

// Colors
const JKKN_GREEN = '#0b6d41';
const CHART_COLORS = {
  primary: JKKN_GREEN,
  secondary: '#10b981',
  tertiary: '#06b6d4',
  warning: '#f59e0b',
  danger: '#ef4444',
  muted: '#94a3b8',
};

const STATUS_COLORS = {
  on_track: '#10b981',
  at_risk: '#f59e0b',
  behind: '#ef4444',
  completed: '#06b6d4',
  not_started: '#94a3b8',
};

export default function OKRAnalyticsPage() {
  const [selectedWeeks, setSelectedWeeks] = useState<string>('12');
  const { profile } = useAuth();
  const { institutions } = useUserInstitutionAccess();

  const institutionId = institutions[0]?.institution_id;
  const dashboardRole = useOKRDashboardRole(profile?.role);

  const { data: summary, isLoading: summaryLoading } = useOKRAnalyticsSummary(institutionId);
  const { data: trendData, isLoading: trendLoading } = useOKRProgressTrend(
    institutionId,
    undefined,
    parseInt(selectedWeeks)
  );
  const { data: departmentData, isLoading: departmentLoading } = useOKRDepartmentComparison(institutionId);
  const { data: projections, isLoading: projectionsLoading } = useOKRProjections(institutionId);

  return (
    <ContentLayout title="OKR Analytics">
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Role-based header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {dashboardRole === 'executive' && 'Executive Dashboard'}
              {dashboardRole === 'hod' && 'Department Dashboard'}
              {dashboardRole === 'admin' && 'Admin Dashboard'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {dashboardRole === 'executive' && 'Institution-wide OKR performance overview'}
              {dashboardRole === 'hod' && 'Your department\'s OKR performance'}
              {dashboardRole === 'admin' && 'Complete OKR analytics with full data access'}
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            {dashboardRole === 'executive' && '30-sec view'}
            {dashboardRole === 'hod' && '2-3 min view'}
            {dashboardRole === 'admin' && 'Full access'}
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard
            title="Total Objectives"
            value={summary?.total_objectives ?? 0}
            icon={<Target className="h-4 w-4" />}
            trend={summary?.trend_direction}
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="Active"
            value={summary?.active_objectives ?? 0}
            icon={<Activity className="h-4 w-4" />}
            color="text-blue-600"
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="At Risk"
            value={summary?.at_risk_objectives ?? 0}
            icon={<AlertTriangle className="h-4 w-4" />}
            color="text-amber-600"
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="Milestones This Week"
            value={summary?.milestones_achieved_this_week ?? 0}
            icon={<CheckCircle2 className="h-4 w-4" />}
            color="text-emerald-600"
            isLoading={summaryLoading}
          />
          <SummaryCard
            title="Check-in Compliance"
            value={`${summary?.check_in_compliance_rate ?? 0}%`}
            icon={<Clock className="h-4 w-4" />}
            isLoading={summaryLoading}
          />
        </div>

        {/* Tabs for different chart views */}
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trends" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Departments
            </TabsTrigger>
            <TabsTrigger value="projections" className="gap-2">
              <PieChartIcon className="h-4 w-4" />
              Projections
            </TabsTrigger>
          </TabsList>

          {/* Progress Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Progress Over Time</CardTitle>
                    <CardDescription>Track OKR progress trends across weeks</CardDescription>
                  </div>
                  <Select value={selectedWeeks} onValueChange={setSelectedWeeks}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 weeks</SelectItem>
                      <SelectItem value="8">8 weeks</SelectItem>
                      <SelectItem value="12">12 weeks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : trendData && trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="progress"
                        name="Avg Progress %"
                        stroke={CHART_COLORS.primary}
                        fill={CHART_COLORS.primary}
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No trend data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution Over Time */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status Distribution</CardTitle>
                <CardDescription>How OKR statuses have changed over time</CardDescription>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : trendData && trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="on_track" name="On Track" fill={STATUS_COLORS.on_track} stackId="status" />
                      <Bar dataKey="at_risk" name="At Risk" fill={STATUS_COLORS.at_risk} stackId="status" />
                      <Bar dataKey="behind" name="Behind" fill={STATUS_COLORS.behind} stackId="status" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No status data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Department Comparison</CardTitle>
                <CardDescription>Compare OKR performance across departments</CardDescription>
              </CardHeader>
              <CardContent>
                {departmentLoading ? (
                  <Skeleton className="h-[350px] w-full" />
                ) : departmentData && departmentData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={departmentData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" domain={[0, 100]} className="text-xs" />
                      <YAxis
                        type="category"
                        dataKey="department_name"
                        width={120}
                        className="text-xs"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value) => [`${value ?? 0}%`, 'Progress']}
                      />
                      <Bar dataKey="avg_progress" name="Progress" radius={[0, 4, 4, 0]}>
                        {departmentData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.avg_progress >= 70
                                ? STATUS_COLORS.on_track
                                : entry.avg_progress >= 50
                                ? STATUS_COLORS.at_risk
                                : STATUS_COLORS.behind
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                    No department data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Department Stats Table */}
            {departmentData && departmentData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Department Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Department</th>
                          <th className="text-center p-2 font-medium">Objectives</th>
                          <th className="text-center p-2 font-medium">On Track %</th>
                          <th className="text-center p-2 font-medium">Check-in Rate</th>
                          <th className="text-center p-2 font-medium">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departmentData.map((dept) => (
                          <tr key={dept.department_id} className="border-b last:border-0">
                            <td className="p-2 font-medium">{dept.department_name}</td>
                            <td className="text-center p-2">{dept.total_objectives}</td>
                            <td className="text-center p-2 text-emerald-600">{dept.on_track_percentage}%</td>
                            <td className="text-center p-2">{dept.check_in_rate}%</td>
                            <td className="text-center p-2">
                              <Badge
                                variant={
                                  dept.avg_progress >= 70
                                    ? 'default'
                                    : dept.avg_progress >= 50
                                    ? 'secondary'
                                    : 'destructive'
                                }
                              >
                                {dept.avg_progress}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Projections Tab */}
          <TabsContent value="projections" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Projection Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Completion Projections</CardTitle>
                  <CardDescription>Predicted outcomes based on current progress</CardDescription>
                </CardHeader>
                <CardContent>
                  {projectionsLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : projections && projections.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={[
                            {
                              name: 'On Track',
                              value: projections.filter((p) => p.status === 'on_track').length,
                              color: STATUS_COLORS.on_track,
                            },
                            {
                              name: 'At Risk',
                              value: projections.filter((p) => p.status === 'at_risk').length,
                              color: STATUS_COLORS.at_risk,
                            },
                            {
                              name: 'Unlikely',
                              value: projections.filter((p) => p.status === 'unlikely').length,
                              color: STATUS_COLORS.behind,
                            },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {[STATUS_COLORS.on_track, STATUS_COLORS.at_risk, STATUS_COLORS.behind].map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No projection data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top At-Risk OKRs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top At-Risk OKRs</CardTitle>
                  <CardDescription>OKRs needing immediate attention</CardDescription>
                </CardHeader>
                <CardContent>
                  {projectionsLoading ? (
                    <Skeleton className="h-[250px] w-full" />
                  ) : projections && projections.length > 0 ? (
                    <div className="space-y-3 max-h-[250px] overflow-y-auto">
                      {projections
                        .filter((p) => p.status !== 'on_track')
                        .slice(0, 5)
                        .map((proj) => (
                          <div
                            key={proj.objective_id}
                            className="p-3 border rounded-lg space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm truncate max-w-[200px]">
                                {proj.title}
                              </span>
                              <Badge
                                variant={proj.status === 'at_risk' ? 'secondary' : 'destructive'}
                                className="text-xs"
                              >
                                {proj.current_progress}%
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Daily rate: {proj.current_daily_rate.toFixed(1)}%</span>
                              <span>|</span>
                              <span>{proj.days_remaining} days left</span>
                            </div>
                            <div className="text-xs text-amber-600">
                              Needs {proj.daily_rate_needed.toFixed(1)}%/day to complete
                            </div>
                          </div>
                        ))}
                      {projections.filter((p) => p.status !== 'on_track').length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                          <p>All OKRs on track!</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed Projections List */}
            {projections && projections.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">All Projections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Objective</th>
                          <th className="text-center p-2 font-medium">Current</th>
                          <th className="text-center p-2 font-medium">Projected</th>
                          <th className="text-center p-2 font-medium">Days Left</th>
                          <th className="text-center p-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projections.map((proj) => (
                          <tr key={proj.objective_id} className="border-b last:border-0">
                            <td className="p-2">
                              <span className="font-medium truncate block max-w-[200px]">
                                {proj.title}
                              </span>
                            </td>
                            <td className="text-center p-2">{proj.current_progress}%</td>
                            <td className="text-center p-2">{proj.projected_progress}%</td>
                            <td className="text-center p-2">{proj.days_remaining}</td>
                            <td className="text-center p-2">
                              {proj.status === 'on_track' ? (
                                <Badge variant="default">On Track</Badge>
                              ) : proj.status === 'at_risk' ? (
                                <Badge variant="secondary">At Risk</Badge>
                              ) : (
                                <Badge variant="destructive">Unlikely</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Blocked Users Alert (Admin only) */}
        {dashboardRole === 'admin' && summary && (summary.blocked_users_count ?? 0) > 0 && (
          <Card className="border-amber-500">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Blocked Users
              </CardTitle>
              <CardDescription>
                {summary.blocked_users_count} users are currently blocked due to missed check-ins
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}

// Summary Card Component
function SummaryCard({
  title,
  value,
  icon,
  trend,
  color,
  isLoading,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  color?: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className={`text-2xl font-bold ${color || ''}`}>{value}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="p-2 rounded-full bg-muted">{icon}</div>
              {trend && (
                <div className="text-xs">
                  {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                  {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
