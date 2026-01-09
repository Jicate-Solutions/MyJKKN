// ============================================
// LEARNERS ANALYTICS DASHBOARD - COMPREHENSIVE
// ============================================
// Created: 2025-01-20
// Updated: 2025-01-23 - Complete dashboard with 6 tabs
// Purpose: Unified analytics for entire learner lifecycle
// ============================================

'use client';

import { useState, useEffect } from 'react';
import { subDays, formatDistanceToNow } from 'date-fns';
import {
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  MapPin,
  UserCheck,
  RefreshCw,
  Filter,
  AlertCircle,
  Download,
  Sparkles
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import type { LearnerDashboardFilters } from '@/types/learner-dashboard';
import toast from 'react-hot-toast';

// Tab components (will be created in subsequent phases)
import { OverviewTab } from './_components/overview-tab';
import { OrganizationalTab } from './_components/organizational-tab';
import { DemographicsTab } from './_components/demographics-tab';
import { GeographicTab } from './_components/geographic-tab';
import { TrendsTab } from './_components/trends-tab';
import { ProfileCompletionTab } from './_components/profile-completion-tab';
import { DashboardFilters } from './_components/dashboard-filters';
import { ExportDashboardDialog } from './_components/export-dashboard-dialog';

/**
 * Learners Analytics Dashboard - Main Page
 *
 * Comprehensive analytics dashboard combining features from:
 * - Old student dashboard (institution hierarchy, enrollment analytics)
 * - Old admission dashboard (conversion funnel, status breakdown)
 *
 * Features:
 * - 6 tabbed sections for organized data presentation
 * - Advanced filtering with cascading dropdowns
 * - Export functionality (PDF, Excel, CSV)
 * - Interactive charts with drill-down capability
 * - Real-time refresh mechanism
 * - Permission-based access control
 * - Institution-based data filtering
 *
 * Access Control:
 * - Permission: learners.dashboard
 * - Super admins: See all institutions
 * - Regular users: See only accessible institutions
 */
export default function LearnersAnalyticsDashboard() {
  const queryClient = useQueryClient();
  const { can, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { profile, isLoading: authLoading } = useAuth();

  // Institution access based on user's profile
  // Super admins can access all institutions
  // Regular users can only access their own institution
  const canAccessAllInstitutions = isSuperAdmin || profile?.institution_id === null;
  const userInstitutionId = profile?.institution_id;

  // State management
  const [showFilters, setShowFilters] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Initialize lastUpdated on client side only
  useEffect(() => {
    setLastUpdated(new Date());
  }, []);

  // Permission check - using correct permission key from database
  const hasAccess = can('learners.dashboard.view');

  // Initialize filters with institution filtering based on user's profile institution_id
  // NOTE: No date range by default - shows all data
  // Users can apply date range filter via the filter panel if needed
  const [filters, setFilters] = useState<LearnerDashboardFilters>({
    institutionIds: canAccessAllInstitutions
      ? undefined
      : userInstitutionId ? [userInstitutionId] : []
  });

  // Fetch dashboard stats via API route
  const {
    data: dashboardStats,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['learners', 'dashboard', filters],
    queryFn: async () => {
      // Build query parameters from filters
      const searchParams = new URLSearchParams();

      if (filters.institutionIds) {
        searchParams.set('institutionIds', filters.institutionIds.join(','));
      }
      if (filters.academicYearId) {
        searchParams.set('academicYearId', filters.academicYearId);
      }
      if (filters.degreeId) {
        searchParams.set('degreeId', filters.degreeId);
      }
      if (filters.departmentId) {
        searchParams.set('departmentId', filters.departmentId);
      }
      if (filters.programId) {
        searchParams.set('programId', filters.programId);
      }
      if (filters.semesterId) {
        searchParams.set('semesterId', filters.semesterId);
      }
      if (filters.sectionId) {
        searchParams.set('sectionId', filters.sectionId);
      }
      if (filters.dateRange?.from && filters.dateRange?.to) {
        searchParams.set('dateFrom', filters.dateRange.from.toISOString());
        searchParams.set('dateTo', filters.dateRange.to.toISOString());
      }

      const response = await fetch(`/api/learners/dashboard/stats?${searchParams.toString()}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch dashboard stats');
      }

      return response.json();
    },
    enabled: hasAccess && !authLoading && !permissionsLoading,
    staleTime: 5 * 60 * 1000,      // 5 minutes (cache fresh data for 5 min)
    gcTime: 10 * 60 * 1000,        // 10 minutes (keep in memory for 10 min)
    refetchOnMount: true,           // Revalidate in background on mount
    refetchOnWindowFocus: false     // Don't refetch when window regains focus
  });

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: ['learners', 'dashboard']
      });
      await refetch();
      setLastUpdated(new Date());
      toast.success('Dashboard refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle filter changes
  const handleFiltersChange = (newFilters: LearnerDashboardFilters) => {
    setFilters(newFilters);
    setLastUpdated(new Date());
  };

  // Handle filter reset
  const handleResetFilters = () => {
    setFilters({
      institutionIds: canAccessAllInstitutions
        ? undefined
        : userInstitutionId ? [userInstitutionId] : []
      // No default date range - truly reset to "All Time"
    });
  };

  // Breadcrumb
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Learners', href: '/learners/profiles' },
    { label: 'Analytics Dashboard' }
  ];

  // Count active filters
  const activeFilterCount = Object.keys(filters).filter(
    (key) => key !== 'institutionIds' && filters[key as keyof LearnerDashboardFilters] !== undefined
  ).length;

  // Loading state - Check this FIRST to prevent permission flash
  if (isLoading || authLoading || permissionsLoading) {
    return (
      <ContentLayout title="Learners Analytics">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  // Permission denied - Only check after permissions have loaded
  if (!hasAccess) {
    return (
      <ContentLayout title="Access Denied">
        <PageBreadcrumb items={breadcrumbItems} />
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to view the learners analytics dashboard.
            Please contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // Main dashboard render
  if (isLoading || authLoading) {
    return (
      <ContentLayout title="Learners Analytics">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  // Error state - Also check if data is undefined
  if (error || !dashboardStats) {
    return (
      <ContentLayout title="Learners Analytics">
        <PageBreadcrumb items={breadcrumbItems} />
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load dashboard data. Please try again.
            {error && (
              <div className="mt-2 text-xs opacity-80">
                Error: {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            )}
          </AlertDescription>
        </Alert>
        <Button onClick={handleRefresh} className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </ContentLayout>
    );
  }

  const stats = dashboardStats;

  return (
    <ContentLayout title="Learners Analytics Dashboard">
      <div className="space-y-6">
        <PageBreadcrumb items={breadcrumbItems} />

        {/* Hero Section with Gradient */}
        <div className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold">Learners Analytics</h1>
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                  <div className="h-2 w-2 rounded-full bg-green-400 mr-2 animate-pulse" />
                  Live Data
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-blue-100">
                Comprehensive analytics for {stats.totalCount.toLocaleString()} learners
                {!canAccessAllInstitutions && userInstitutionId && (
                  <> in your institution</>
                )}
              </p>
              <p className="text-xs text-blue-200 mt-1">
                Last updated: {lastUpdated ? formatDistanceToNow(lastUpdated, { addSuffix: true }) : 'Just now'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="bg-white/10 hover:bg-white/20 text-white border-white/30"
              >
                <Filter className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {showFilters ? 'Hide' : 'Show'} Filters
                </span>
                {activeFilterCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="bg-white/10 hover:bg-white/20 text-white border-white/30"
              >
                <RefreshCw className={`h-4 w-4 sm:mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                className="bg-white/10 hover:bg-white/20 text-white border-white/30"
              >
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Filters Panel (Collapsible) */}
        {showFilters && (
          <Card>
            <CardContent className="pt-6">
              <DashboardFilters
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onReset={handleResetFilters}
                canAccessAllInstitutions={canAccessAllInstitutions}
                accessibleInstitutionIds={userInstitutionId ? [userInstitutionId] : []}
              />
            </CardContent>
          </Card>
        )}

        {/* Tabbed Analytics */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-2">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="organizational" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Organizational</span>
            </TabsTrigger>
            <TabsTrigger value="demographics" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Demographics</span>
            </TabsTrigger>
            <TabsTrigger value="geographic" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Geographic</span>
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Trends</span>
            </TabsTrigger>
            <TabsTrigger value="profile-completion" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Profile Completion</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <OverviewTab
              data={stats}
              filters={filters}
            />
          </TabsContent>

          {/* Organizational Tab */}
          <TabsContent value="organizational">
            <OrganizationalTab
              data={stats}
              filters={filters}
            />
          </TabsContent>

          {/* Demographics Tab */}
          <TabsContent value="demographics">
            <DemographicsTab
              data={stats}
              filters={filters}
            />
          </TabsContent>

          {/* Geographic Tab */}
          <TabsContent value="geographic">
            <GeographicTab
              data={stats}
              filters={filters}
            />
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends">
            <TrendsTab
              data={stats}
              filters={filters}
            />
          </TabsContent>

          {/* Profile Completion Tab */}
          <TabsContent value="profile-completion">
            <ProfileCompletionTab
              data={stats}
              filters={filters}
            />
          </TabsContent>
        </Tabs>

        {/* Metadata Footer */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm text-muted-foreground">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className="font-medium">
                  Total Records: <span className="font-normal">{stats.totalCount.toLocaleString()}</span>
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="font-medium">
                  Date Range:{' '}
                  <span className="font-normal">
                    {filters.dateRange?.from && filters.dateRange?.to
                      ? `${new Date(filters.dateRange.from).toLocaleDateString()} - ${new Date(filters.dateRange.to).toLocaleDateString()}`
                      : 'All Time'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  Generated:{' '}
                  <span className="font-normal">
                    {new Date(stats.generatedAt).toLocaleString()}
                  </span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Dialog */}
      <ExportDashboardDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        dashboardData={stats}
        filters={filters}
      />
    </ContentLayout>
  );
}
