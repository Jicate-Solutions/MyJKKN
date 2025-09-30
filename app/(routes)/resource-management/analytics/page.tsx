// app/(routes)/resource-management/analytics/page.tsx
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AnalyticsStatsCards } from './_components/analytics-stats-cards';
import { ResourceUsageChart } from './_components/resource-usage-chart';
import { TimeDistributionChart } from './_components/time-distribution-chart';
import { CategoryUsageChart } from './_components/category-usage-chart';
import { ExportOptions } from './_components/export-options';
import {
  useResourceAnalytics,
  useReservationAnalytics,
  useDashboardSummary
} from '@/hooks/analytics/use-analytics';
import { AnalyticsPeriod } from '@/types/analytics';
import { Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<AnalyticsPeriod>(
    AnalyticsPeriod.LAST_30_DAYS
  );

  // Fetch real-time analytics data
  const { data: resourceAnalytics, isLoading: loadingResources } =
    useResourceAnalytics({ period: timeRange });
  const { data: reservationAnalytics, isLoading: loadingReservations } =
    useReservationAnalytics({ period: timeRange });
  const { data: dashboardData, isLoading: loadingDashboard } =
    useDashboardSummary({ period: timeRange });

  const isLoading = loadingResources || loadingReservations || loadingDashboard;

  // Calculate date range for display
  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();

    switch (timeRange) {
      case AnalyticsPeriod.LAST_7_DAYS:
        from.setDate(from.getDate() - 7);
        break;
      case AnalyticsPeriod.LAST_30_DAYS:
        from.setDate(from.getDate() - 30);
        break;
      case AnalyticsPeriod.LAST_90_DAYS:
        from.setDate(from.getDate() - 90);
        break;
      case AnalyticsPeriod.THIS_YEAR:
        from.setMonth(0, 1); // Jan 1st
        break;
      default:
        from.setDate(from.getDate() - 30);
    }

    return { from, to };
  }, [timeRange]);

  // Transform data for charts
  const resourceUsageData = useMemo(() => {
    if (!reservationAnalytics?.by_resource) return [];

    return reservationAnalytics.by_resource.slice(0, 10).map((item) => ({
      resource_name: item.resource_name,
      reservation_count: item.reservation_count,
      total_hours: item.total_hours,
      utilization_rate: item.utilization_rate
    }));
  }, [reservationAnalytics]);

  const timeDistributionData = useMemo(() => {
    if (!reservationAnalytics?.by_time_slot) return [];

    return reservationAnalytics.by_time_slot.map((item) => ({
      hour: item.hour,
      count: item.reservation_count,
      period:
        item.hour < 12 ? 'Morning' : item.hour < 18 ? 'Afternoon' : 'Evening'
    }));
  }, [reservationAnalytics]);

  const categoryUsageData = useMemo(() => {
    if (!resourceAnalytics?.by_category) return [];

    return resourceAnalytics.by_category.map((item) => ({
      category_name: item.category_name,
      reservation_count: item.total_reservations,
      resource_count: item.resource_count,
      percentage: item.utilization_rate
    }));
  }, [resourceAnalytics]);

  // Stats data
  const statsData = useMemo(() => {
    return {
      total_resources: resourceAnalytics?.total_resources || 0,
      total_reservations: reservationAnalytics?.total_reservations || 0,
      active_users: dashboardData?.users?.active_users || 0,
      utilization_rate: resourceAnalytics?.avg_utilization_rate || 0,
      avg_duration_hours: reservationAnalytics?.avg_duration_hours || 0,
      peak_usage_time:
        reservationAnalytics?.by_time_slot?.[0]?.time_label || 'N/A'
    };
  }, [dashboardData, resourceAnalytics, reservationAnalytics]);

  return (
    <ContentLayout title='Analytics Dashboard'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/resources'>
                Resource Management
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Analytics</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold'>Usage Analytics</h1>
          <p className='text-muted-foreground'>
            Real-time insights into resource utilization and booking patterns
          </p>
        </div>
        <div className='flex items-center gap-4'>
          {/* Time Range Selector */}
          <div className='flex items-center gap-2'>
            <Calendar className='h-4 w-4 text-muted-foreground' />
            <Select
              value={timeRange}
              onValueChange={(value) => setTimeRange(value as AnalyticsPeriod)}
            >
              <SelectTrigger className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AnalyticsPeriod.LAST_7_DAYS}>
                  Last 7 days
                </SelectItem>
                <SelectItem value={AnalyticsPeriod.LAST_30_DAYS}>
                  Last 30 days
                </SelectItem>
                <SelectItem value={AnalyticsPeriod.LAST_90_DAYS}>
                  Last 90 days
                </SelectItem>
                <SelectItem value={AnalyticsPeriod.THIS_YEAR}>
                  This year
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ExportOptions dateRange={dateRange} />
        </div>
      </div>

      {/* Date Range Badge */}
      <div className='mb-6'>
        <Badge variant='outline' className='text-sm'>
          {dateRange.from.toLocaleDateString()} -{' '}
          {dateRange.to.toLocaleDateString()}
        </Badge>
      </div>

      {/* Statistics Cards */}
      <div className='mb-8'>
        <AnalyticsStatsCards stats={statsData} isLoading={isLoading} />
      </div>

      {/* Charts Grid */}
      <div className='grid gap-6 md:grid-cols-2'>
        {/* Resource Usage Chart */}
        <ResourceUsageChart data={resourceUsageData} isLoading={isLoading} />

        {/* Time Distribution Chart */}
        <TimeDistributionChart
          data={timeDistributionData}
          isLoading={isLoading}
        />

        {/* Category Usage Chart - Full Width */}
        <div className='md:col-span-2'>
          <CategoryUsageChart data={categoryUsageData} isLoading={isLoading} />
        </div>
      </div>
    </ContentLayout>
  );
}
