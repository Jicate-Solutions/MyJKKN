'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart3,
  TrendingUp,
  Users,
  GraduationCap,
  MapPin,
  UserCheck,
  Calendar,
  Sparkles,
  RefreshCw,
  Filter
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { useAdmissionAnalytics, useAdmissionAIInsights } from '@/hooks/admission/use-admission-analytics';
import { AdmissionAnalyticsFilters } from '@/types/admission';
import { BeatLoader } from 'react-spinners';

// Import analytics components (to be created in Phase 7)
import { OverviewTab } from '@/components/admissions/analytics/overview-tab';
import { StatusBreakdownTab } from '@/components/admissions/analytics/status-breakdown-tab';
import { DemographicsTab } from '@/components/admissions/analytics/demographics-tab';
import { AcademicPerformanceTab } from '@/components/admissions/analytics/academic-performance-tab';
import { InstitutionDistributionTab } from '@/components/admissions/analytics/institution-distribution-tab';
import { GeographicTab } from '@/components/admissions/analytics/geographic-tab';
import { ReferenceSourcesTab } from '@/components/admissions/analytics/reference-sources-tab';
import { TimeTrendsTab } from '@/components/admissions/analytics/time-trends-tab';
import { AIInsightsTab } from '@/components/admissions/analytics/ai-insights-tab';
import { AnalyticsFilters } from '@/components/admissions/analytics/analytics-filters';

/**
 * Admissions Analytics Dashboard Page
 *
 * Comprehensive analytics dashboard for admissions data with:
 * - Overview KPIs
 * - Status breakdown
 * - Demographics analysis
 * - Academic performance metrics
 * - Institution and program distribution
 * - Geographic analysis
 * - Reference source tracking
 * - Time-based trends
 * - AI-powered insights
 *
 * Access Control:
 * - Requires 'admissions.dashboard' permission
 * - Super admins see all institutions
 * - Regular users see only their institution
 */
export default function AdmissionsAnalyticsPage() {
  const { can, isSuperAdmin, isLoading: permissionsLoading } = usePermissions([], { waitForLoad: true });

  // Filter state
  const [filters, setFilters] = useState<AdmissionAnalyticsFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  // AI insights state
  const [enableAIInsights, setEnableAIInsights] = useState(false);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check permissions
  const hasAnalyticsPermission = isSuperAdmin || can('admissions.dashboard') || can('admissions.analytics.view');

  // Fetch analytics data
  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics
  } = useAdmissionAnalytics(filters, {
    enabled: hasAnalyticsPermission && !permissionsLoading
  });

  // Fetch AI insights (disabled by default)
  const {
    data: aiInsights,
    isLoading: aiInsightsLoading,
    error: aiInsightsError,
    refetch: refetchAIInsights
  } = useAdmissionAIInsights(filters, {
    enabled: enableAIInsights && hasAnalyticsPermission && !permissionsLoading
  });

  // Handle filter changes
  const handleFiltersChange = (newFilters: AdmissionAnalyticsFilters) => {
    setFilters(newFilters);
    setEnableAIInsights(false); // Reset AI insights when filters change
  };

  // Handle AI insights generation
  const handleGenerateInsights = () => {
    setEnableAIInsights(true);
  };

  // Handle refresh - refetch both analytics and AI insights if enabled
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchAnalytics();
      if (enableAIInsights) {
        await refetchAIInsights();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Loading state
  if (permissionsLoading) {
    return (
      <ContentLayout title="Admissions Analytics">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  // Permission denied
  if (!hasAnalyticsPermission) {
    return (
      <ContentLayout title="Admissions Analytics">
        <div className="text-center py-8">
          <p className="text-destructive mb-4">
            You don&apos;t have permission to access the admissions analytics dashboard.
          </p>
          <Button variant="outline" asChild>
            <Link href="/admissions">Back to Admissions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Admissions Analytics">
      <div className="space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admissions', href: '/admissions' },
            { label: 'Analytics Dashboard' }
          ]}
        />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Admissions Analytics</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Comprehensive insights and trends for admissions data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex-1 sm:flex-none"
            >
              <Filter className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{showFilters ? 'Hide' : 'Show'} Filters</span>
              <span className="sm:hidden ml-2">{showFilters ? 'Hide' : 'Show'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || analyticsLoading}
              className="flex-1 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 sm:mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              <span className="sm:hidden ml-2">Refresh</span>
            </Button>
          </div>
        </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <AnalyticsFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {analyticsError && (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load analytics data: {analyticsError.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {analyticsLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {/* Analytics Tabs */}
      {analytics && !analyticsLoading && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-9 lg:w-auto">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-2">
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Status</span>
            </TabsTrigger>
            <TabsTrigger value="demographics" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Demographics</span>
            </TabsTrigger>
            <TabsTrigger value="academic" className="gap-2">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Academic</span>
            </TabsTrigger>
            <TabsTrigger value="institution" className="gap-2">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Institution</span>
            </TabsTrigger>
            <TabsTrigger value="geographic" className="gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Geographic</span>
            </TabsTrigger>
            <TabsTrigger value="references" className="gap-2">
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">References</span>
            </TabsTrigger>
            <TabsTrigger value="trends" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Trends</span>
            </TabsTrigger>
            <TabsTrigger value="ai-insights" className="gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">AI Insights</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <OverviewTab data={analytics.overview} metadata={analytics.metadata} />
          </TabsContent>

          {/* Status Breakdown Tab */}
          <TabsContent value="status">
            <StatusBreakdownTab data={analytics.statusBreakdown} />
          </TabsContent>

          {/* Demographics Tab */}
          <TabsContent value="demographics">
            <DemographicsTab data={analytics.demographics} />
          </TabsContent>

          {/* Academic Performance Tab */}
          <TabsContent value="academic">
            <AcademicPerformanceTab data={analytics.academicPerformance} />
          </TabsContent>

          {/* Institution Distribution Tab */}
          <TabsContent value="institution">
            <InstitutionDistributionTab data={analytics.institutionDistribution} />
          </TabsContent>

          {/* Geographic Tab */}
          <TabsContent value="geographic">
            <GeographicTab data={analytics.geographic} />
          </TabsContent>

          {/* Reference Sources Tab */}
          <TabsContent value="references">
            <ReferenceSourcesTab data={analytics.referenceSources} />
          </TabsContent>

          {/* Time Trends Tab */}
          <TabsContent value="trends">
            <TimeTrendsTab data={analytics.timeTrends} />
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="ai-insights">
            <AIInsightsTab
              insights={aiInsights}
              isLoading={aiInsightsLoading}
              error={aiInsightsError}
              onGenerate={handleGenerateInsights}
              onRefresh={refetchAIInsights}
              enabled={enableAIInsights}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Metadata Footer */}
      {analytics && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm text-muted-foreground">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className="font-medium">
                  Total Records: <span className="font-normal">{analytics.metadata.totalRecords.toLocaleString()}</span>
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="font-medium">
                  Date Range:{' '}
                  <span className="font-normal">
                    {analytics.metadata.dateRange.from && analytics.metadata.dateRange.to
                      ? `${new Date(analytics.metadata.dateRange.from).toLocaleDateString()} - ${new Date(analytics.metadata.dateRange.to).toLocaleDateString()}`
                      : 'All Time'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="font-medium">
                  Last Updated:{' '}
                  <span className="font-normal">
                    {new Date(analytics.metadata.lastUpdated).toLocaleString()}
                  </span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </ContentLayout>
  );
}
