// app/(routes)/resource-management/analytics-dashboard/page.tsx
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Download, BarChart3, AlertCircle } from 'lucide-react';
import { AnalyticsPeriod } from '@/types/analytics';
import {
  useDashboardSummary,
  useAnalyticsFilters,
  useMaintenanceAnalytics
} from '@/hooks/analytics/use-analytics';
import { useAuth } from '@/hooks/use-auth';
import { AnalyticsKPICards } from './_components/analytics-kpi-cards';
import { ResourceUtilizationChart } from './_components/resource-utilization-chart';
import { ReservationStatusChart } from './_components/reservation-status-chart';
import { FinancialOverviewChart } from './_components/financial-overview-chart';
import { TopResourcesTable } from './_components/top-resources-table';
import { InstitutionComparisonChart } from './_components/institution-comparison-chart';
import { MaintenanceAnalyticsCard } from './_components/maintenance-analytics-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

export default function AnalyticsDashboardPage() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>(
    AnalyticsPeriod.LAST_30_DAYS
  );
  const [selectedInstitution, setSelectedInstitution] = useState<string>('all');

  const isSuperAdmin = profile?.role === 'super_admin';
  const { institutions } = useInstitutionsWithAccess();

  // Build filters with RBAC
  const baseFilters = useMemo(
    () => ({
      period,
      institution_id:
        selectedInstitution !== 'all' ? selectedInstitution : undefined
    }),
    [period, selectedInstitution]
  );

  const { filters: rbacFilters, canViewAll } = useAnalyticsFilters(baseFilters);
  const { data, isLoading, error } = useDashboardSummary(rbacFilters);
  const { data: maintenanceData, isLoading: loadingMaintenance } =
    useMaintenanceAnalytics(rbacFilters);

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Exporting analytics data...');
  };

  const getPeriodLabel = (period: AnalyticsPeriod) => {
    const labels = {
      [AnalyticsPeriod.TODAY]: 'Today',
      [AnalyticsPeriod.YESTERDAY]: 'Yesterday',
      [AnalyticsPeriod.LAST_7_DAYS]: 'Last 7 Days',
      [AnalyticsPeriod.LAST_30_DAYS]: 'Last 30 Days',
      [AnalyticsPeriod.LAST_90_DAYS]: 'Last 90 Days',
      [AnalyticsPeriod.THIS_MONTH]: 'This Month',
      [AnalyticsPeriod.LAST_MONTH]: 'Last Month',
      [AnalyticsPeriod.THIS_YEAR]: 'This Year',
      [AnalyticsPeriod.CUSTOM]: 'Custom Range'
    };
    return labels[period];
  };

  return (
    <ContentLayout title='Analytics Dashboard'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management'>
              Resource Management
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Analytics Dashboard</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <BarChart3 className='h-8 w-8' />
            Advanced Analytics
          </h1>
          <p className='text-muted-foreground'>
            {canViewAll
              ? 'Comprehensive analytics across all institutions'
              : 'Analytics for your institution'}
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <Button variant='outline' onClick={handleExport}>
            <Download className='mr-2 h-4 w-4' />
            Export Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className='flex items-center gap-4 mb-6 flex-wrap'>
        {/* Period Selector */}
        <div className='flex items-center gap-2'>
          <Calendar className='h-4 w-4 text-muted-foreground' />
          <Select
            value={period}
            onValueChange={(value) => setPeriod(value as AnalyticsPeriod)}
          >
            <SelectTrigger className='w-[200px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(AnalyticsPeriod).map((p) => (
                <SelectItem key={p} value={p}>
                  {getPeriodLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Institution Selector (Super Admin Only) */}
        {canViewAll && institutions && institutions.length > 0 && (
          <Select
            value={selectedInstitution}
            onValueChange={setSelectedInstitution}
          >
            <SelectTrigger className='w-[250px]'>
              <SelectValue placeholder='Select institution' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Access Level Badge */}
        <Badge
          variant={canViewAll ? 'default' : 'secondary'}
          className='ml-auto'
        >
          {canViewAll
            ? 'Super Admin View - All Institutions'
            : 'Institution View'}
        </Badge>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant='destructive' className='mb-6'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load analytics data. Please try again later.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className='mb-8'>
        <AnalyticsKPICards data={data} isLoading={isLoading} />
      </div>

      {/* Maintenance Analytics */}
      <div className='mb-8'>
        <MaintenanceAnalyticsCard
          data={maintenanceData}
          isLoading={loadingMaintenance}
        />
      </div>

      {/* Charts Grid */}
      <div className='space-y-6'>
        {/* Institution Comparison (Super Admin Only) */}
        {canViewAll && (
          <InstitutionComparisonChart
            data={data?.resources}
            isLoading={isLoading}
            canViewAll={canViewAll}
          />
        )}

        {/* Row 1: Resource Utilization & Reservation Status */}
        <div className='grid gap-6 md:grid-cols-2'>
          <ResourceUtilizationChart
            data={data?.resources}
            isLoading={isLoading}
          />
          <ReservationStatusChart
            data={data?.reservations}
            isLoading={isLoading}
          />
        </div>

        {/* Row 2: Financial Overview (Full Width) */}
        <FinancialOverviewChart data={data?.financial} isLoading={isLoading} />

        {/* Row 3: Top Resources Table (Full Width) */}
        <TopResourcesTable data={data?.reservations} isLoading={isLoading} />
      </div>
    </ContentLayout>
  );
}
