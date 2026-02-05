'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useGrievanceDashboardStats, useGrievanceSLAReport } from '@/hooks/grievance/use-grievance-dashboard';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  Users,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GrievanceAnalyticsClientProps {
  institutionId: string;
}

export function GrievanceAnalyticsClient({ institutionId }: GrievanceAnalyticsClientProps) {
  // Date range filter
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Calculate date range
  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    const dateTo = now.toISOString();
    let dateFrom: string | undefined;

    switch (dateRange) {
      case '7d':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '30d':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '90d':
        dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'all':
      default:
        dateFrom = undefined;
    }

    return { dateFrom, dateTo };
  }, [dateRange]);

  // Fetch data
  const {
    data: dashboardStats,
    isLoading: isLoadingStats,
    refetch: refetchStats
  } = useGrievanceDashboardStats(institutionId);

  const {
    data: slaReport,
    isLoading: isLoadingSLA,
    refetch: refetchSLA
  } = useGrievanceSLAReport(institutionId, dateFrom, dateTo);

  const isLoading = isLoadingStats || isLoadingSLA;

  // Calculate metrics
  const totalTickets = slaReport?.total_tickets || 0;
  const resolutionRate = totalTickets > 0
    ? Math.round((slaReport?.resolved_within_sla || 0) / totalTickets * 100)
    : 0;
  const avgResolutionTime = slaReport?.avg_resolution_hours || 0;
  const slaCompliance = slaReport?.sla_compliance_rate || 0;

  // Category data with percentages
  const categoryData = useMemo(() => {
    if (!slaReport?.by_category) return [];

    const categories = Object.entries(slaReport.by_category).map(([name, data]) => ({
      category: name,
      count: data.total,
      percentage: totalTickets > 0 ? Math.round((data.total / totalTickets) * 100) : 0,
      withinSLA: data.within_sla,
      trend: data.total > 0 ? 'stable' : 'stable' // Can be enhanced with historical data
    }));

    return categories.sort((a, b) => b.count - a.count);
  }, [slaReport, totalTickets]);

  // Priority data
  const priorityData = useMemo(() => {
    if (!slaReport?.by_priority) return [];

    return [
      { priority: 'Urgent', ...slaReport.by_priority.urgent, color: 'text-red-600' },
      { priority: 'High', ...slaReport.by_priority.high, color: 'text-orange-600' },
      { priority: 'Medium', ...slaReport.by_priority.medium, color: 'text-yellow-600' },
      { priority: 'Low', ...slaReport.by_priority.low, color: 'text-green-600' },
    ];
  }, [slaReport]);

  const handleRefresh = () => {
    refetchStats();
    refetchSLA();
  };

  return (
    <ContentLayout title="Grievance Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Grievance', href: '/grievance' },
          { label: 'Analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header with filters */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Grievance Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Track trends, identify patterns, and improve resolution rates
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{totalTickets}</div>
                  <p className="text-xs text-muted-foreground">
                    {dateRange === 'all' ? 'All time' : `Last ${dateRange === '7d' ? '7' : dateRange === '30d' ? '30' : '90'} days`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{resolutionRate}%</div>
                  <p className="text-xs text-muted-foreground">
                    {slaReport?.resolved_within_sla || 0} of {totalTickets} resolved
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Resolution Time</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {avgResolutionTime < 24
                      ? `${Math.round(avgResolutionTime)}h`
                      : `${Math.round(avgResolutionTime / 24)}d`
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average time to resolve
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
              <AlertTriangle className={cn(
                "h-4 w-4",
                slaCompliance >= 95 ? "text-green-500" :
                slaCompliance >= 85 ? "text-yellow-500" :
                "text-red-500"
              )} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{Math.round(slaCompliance)}%</div>
                  <p className="text-xs text-muted-foreground">
                    Target: 95%
                    {slaCompliance < 95 && (
                      <span className="text-red-600 ml-1">
                        ({Math.round(95 - slaCompliance)}% below)
                      </span>
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Status Overview</CardTitle>
            <CardDescription>Current distribution of tickets by status</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {dashboardStats && Object.entries({
                  'Open': dashboardStats.total_open,
                  'In Progress': dashboardStats.total_in_progress,
                  'Pending Info': dashboardStats.total_pending_info,
                  'Resolved': dashboardStats.total_resolved,
                  'Closed': dashboardStats.total_closed,
                }).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="font-medium">{status}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trends by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Tickets by Category</CardTitle>
            <CardDescription>Distribution of grievances across categories</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : categoryData.length > 0 ? (
              <div className="space-y-4">
                {categoryData.map((cat, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-32 font-medium truncate" title={cat.category}>
                      {cat.category}
                    </div>
                    <div className="flex-1">
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${cat.percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right text-sm">{cat.count}</div>
                    <div className="w-20 text-right text-xs text-muted-foreground">
                      {cat.percentage}%
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No category data available for selected period
              </p>
            )}
          </CardContent>
        </Card>

        {/* Performance by Priority */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Priority Analysis
            </CardTitle>
            <CardDescription>Resolution metrics by priority level</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {priorityData.map((priority, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className={cn("font-medium", priority.color)}>{priority.priority}</p>
                      <p className="text-sm text-muted-foreground">
                        {priority.total} total • {priority.within_sla} within SLA
                      </p>
                    </div>
                    <div className="text-right">
                      {priority.breached > 0 ? (
                        <Badge variant="destructive">
                          {priority.breached} breached
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600">
                          No breaches
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SLA Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              SLA Performance
            </CardTitle>
            <CardDescription>Service level agreement compliance tracking</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : dashboardStats ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center justify-between p-4 rounded-lg border border-green-200 bg-green-50">
                  <div>
                    <p className="text-sm text-muted-foreground">On Track</p>
                    <p className="text-2xl font-bold text-green-700">
                      {dashboardStats.sla_on_track}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-yellow-200 bg-yellow-50">
                  <div>
                    <p className="text-sm text-muted-foreground">At Risk</p>
                    <p className="text-2xl font-bold text-yellow-700">
                      {dashboardStats.sla_at_risk}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-red-200 bg-red-50">
                  <div>
                    <p className="text-sm text-muted-foreground">Breached</p>
                    <p className="text-2xl font-bold text-red-700">
                      {dashboardStats.sla_breached}
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
