// ============================================
// LIFECYCLE ANALYTICS DASHBOARD
// ============================================
// Created: 2026-02-06
// Updated: 2026-02-06 - Phase 2: Added Institution Comparison + Reports tabs
// Purpose: Cross-institution usage tracking, module adoption,
//          health scores, and downloadable reports
// ============================================

'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { subDays } from 'date-fns';
import { Filter } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import toast from 'react-hot-toast';

import { useLifecycleDashboard } from '@/hooks/analytics/use-lifecycle-dashboard';
import { useModuleBreakdown } from '@/hooks/analytics/use-module-breakdown';
import { useInstitutionComparison } from '@/hooks/analytics/use-institution-comparison';
import { useUserStats } from '@/hooks/analytics/use-user-stats';

import { LifecycleHero } from './_components/lifecycle-hero';
import { LifecycleFilters } from './_components/lifecycle-filters';
import { LifecycleKPICards } from './_components/lifecycle-kpi-cards';
import { OverviewTab } from './_components/overview-tab';
import { ModuleUsageTab } from './_components/module-usage-tab';
import { DrillDownBreadcrumb } from './_components/drill-down-breadcrumb';
import { InstitutionComparisonTab } from './_components/institution-comparison-tab';
import { ReportsTab } from './_components/reports-tab';
import { UserStatsTab } from './_components/user-stats-tab';

export default function LifecycleAnalyticsPage() {
  const queryClient = useQueryClient();
  const { can, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  // State
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedPresetDays, setSelectedPresetDays] = useState(7);
  const [institutionId, setInstitutionId] = useState<string | undefined>();
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  // Reset department when institution changes
  const handleInstitutionChange = (id: string | undefined) => {
    setInstitutionId(id);
    setDepartmentId(undefined);
  };

  // Initialize lastUpdated on client
  useEffect(() => {
    setLastUpdated(new Date());
  }, []);

  // Auto-filter non-super-admin users to their institution
  useEffect(() => {
    if (!authLoading && profile && !isSuperAdmin && profile.institution_id) {
      setInstitutionId(profile.institution_id);
    }
  }, [authLoading, profile, isSuperAdmin]);

  // Date range (inclusive: "Today"=1 means just today, "Last 7 days"=7 means 7 calendar days)
  const dateTo = new Date().toISOString().split('T')[0];
  const dateFrom = subDays(new Date(), selectedPresetDays - 1)
    .toISOString()
    .split('T')[0];

  // Permission check
  const hasAccess = isSuperAdmin || can('admin.lifecycle.view');

  // Fetch dashboard data
  const {
    data: dashboard,
    isLoading: dashLoading,
    error: dashError,
    refetch,
  } = useLifecycleDashboard({
    dateFrom,
    dateTo,
    institutionId,
    departmentId,
    enabled: hasAccess && !authLoading && !permissionsLoading,
  });

  // Fetch module breakdown for drill-down
  const { data: moduleDetail, isLoading: moduleDetailLoading } =
    useModuleBreakdown({
      dateFrom,
      dateTo,
      institutionId,
      module: selectedModule || undefined,
      enabled:
        hasAccess &&
        !authLoading &&
        !permissionsLoading &&
        !!selectedModule,
    });

  // Fetch institution comparison (super admin only, on comparison tab)
  const { data: comparisons, isLoading: comparisonsLoading } =
    useInstitutionComparison({
      days: selectedPresetDays,
      enabled:
        isSuperAdmin &&
        hasAccess &&
        !authLoading &&
        !permissionsLoading &&
        activeTab === 'comparison',
    });

  // Fetch user stats (lazy-loaded on user stats tab)
  const { data: userStats, isLoading: userStatsLoading } = useUserStats({
    dateFrom,
    dateTo,
    institutionId,
    departmentId,
    enabled:
      hasAccess &&
      !authLoading &&
      !permissionsLoading &&
      activeTab === 'users',
  });

  // Tab change handler
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['lifecycle-dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['lifecycle-modules'] });
      await queryClient.invalidateQueries({ queryKey: ['institution-comparison'] });
      await queryClient.invalidateQueries({ queryKey: ['health-scores'] });
      await queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      await refetch();
      setLastUpdated(new Date());
      toast.success('Dashboard refreshed');
    } catch {
      toast.error('Failed to refresh dashboard');
    } finally {
      setIsRefreshing(false);
    }
  };

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Administration' },
    { label: 'Lifecycle Analytics' },
  ];

  // Loading state
  if (authLoading || permissionsLoading) {
    return (
      <ContentLayout title="Lifecycle Analytics">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  // Permission denied
  if (!hasAccess) {
    return (
      <ContentLayout title="Lifecycle Analytics">
        <PageBreadcrumb items={breadcrumbItems} />
        <Alert variant="destructive" className="mt-8">
          <AlertDescription>
            You do not have permission to view lifecycle analytics. Contact your
            administrator.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const isLoading = dashLoading;

  return (
    <ContentLayout title="Lifecycle Analytics">
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="mt-6 space-y-6">
        {/* Hero Section */}
        <LifecycleHero
          lastUpdated={lastUpdated}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          selectedPreset={selectedPresetDays}
          onPresetChange={setSelectedPresetDays}
        />

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {(institutionId || departmentId) && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {(institutionId ? 1 : 0) + (departmentId ? 1 : 0)}
              </Badge>
            )}
          </Button>
        </div>

        {showFilters && (
          <LifecycleFilters
            institutionId={institutionId}
            onInstitutionChange={handleInstitutionChange}
            departmentId={departmentId}
            onDepartmentChange={setDepartmentId}
            isSuperAdmin={isSuperAdmin}
            onClose={() => setShowFilters(false)}
          />
        )}

        {/* Error state */}
        {dashError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load dashboard data: {dashError.message}
            </AlertDescription>
          </Alert>
        )}

        {/* KPI Cards */}
        <LifecycleKPICards kpis={dashboard?.kpis || null} loading={isLoading} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="modules">Module Usage</TabsTrigger>
            <TabsTrigger value="users">User Stats</TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="comparison">Institutions</TabsTrigger>
            )}
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab
              dailyTrends={dashboard?.daily_trends || []}
              moduleBreakdown={dashboard?.module_breakdown || []}
              eventDistribution={dashboard?.event_distribution || []}
              dormantAlerts={isSuperAdmin ? dashboard?.dormant_alerts : undefined}
              loading={isLoading}
            />
          </TabsContent>

          <TabsContent value="modules" className="mt-4">
            <DrillDownBreadcrumb
              selectedModule={selectedModule}
              onClear={() => setSelectedModule(null)}
            />
            <ModuleUsageTab
              moduleBreakdown={
                selectedModule && moduleDetail
                  ? moduleDetail
                  : dashboard?.module_breakdown || []
              }
              loading={selectedModule ? moduleDetailLoading : isLoading}
              onModuleDrillDown={(module) => setSelectedModule(module)}
            />
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <UserStatsTab
              data={userStats}
              loading={userStatsLoading}
            />
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="comparison" className="mt-4">
              <InstitutionComparisonTab
                comparisons={comparisons || []}
                loading={comparisonsLoading}
              />
            </TabsContent>
          )}

          <TabsContent value="reports" className="mt-4">
            <ReportsTab
              isSuperAdmin={isSuperAdmin}
              defaultDateFrom={dateFrom}
              defaultDateTo={dateTo}
              institutionId={institutionId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
