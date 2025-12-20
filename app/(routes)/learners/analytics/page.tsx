// ============================================
// LEARNERS ANALYTICS DASHBOARD
// ============================================
// Created: 2025-01-20
// Purpose: Comprehensive analytics dashboard for learner profiles
// Features: Institution-based filtering, permission checks, advanced metrics
// ============================================

'use client';

import { useState } from 'react';
import { subDays } from 'date-fns';
import {
  Users,
  UserCheck,
  Clock,
  RefreshCw,
  BarChart3,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  UserCog
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LearnerDashboardFilters } from '@/types/learner-dashboard';

/**
 * Learners Analytics Dashboard
 *
 * Comprehensive analytics for learner lifecycle management
 * - Permission-based access (learners.dashboard)
 * - Institution-based filtering (super admin sees all)
 * - Advanced filters and metrics
 * - Real-time data visualization
 */
export default function LearnersAnalyticsDashboard() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const {
    canAccessAllInstitutions,
    getAccessibleInstitutionIds,
    institutions,
    loading: institutionsLoading
  } = useUserInstitutionAccess();

  // Permission check
  const hasAccess = can('learners.dashboard');

  // Initialize filters with institution filtering based on user access
  const [filters, setFilters] = useState<LearnerDashboardFilters>({
    institutionIds: canAccessAllInstitutions
      ? undefined
      : getAccessibleInstitutionIds(),
    dateRange: {
      from: subDays(new Date(), 30),
      to: new Date()
    }
  });

  // Fetch dashboard stats
  const {
    data: dashboardStats,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['learners', 'dashboard', filters],
    queryFn: () => LearnerProfileService.getDashboardStats(filters),
    enabled: hasAccess && !institutionsLoading,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['learners', 'dashboard']
    });
    await refetch();
  };

  // Breadcrumb
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Learners', href: '/learners/profiles' },
    { label: 'Analytics Dashboard' }
  ];

  // Permission denied
  if (!hasAccess) {
    return (
      <ContentLayout title="Access Denied">
        <PageBreadcrumb items={breadcrumbItems} />
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to view the learners analytics dashboard.
            Please contact your administrator if you need access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // Loading state
  if (isLoading || institutionsLoading) {
    return (
      <ContentLayout title="Learners Analytics">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mt-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <ContentLayout title="Learners Analytics">
        <PageBreadcrumb items={breadcrumbItems} />
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load dashboard data. Please try again.
          </AlertDescription>
        </Alert>
        <Button onClick={handleRefresh} className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </ContentLayout>
    );
  }

  const stats = dashboardStats!;

  return (
    <ContentLayout title="Learners Analytics Dashboard">
      <PageBreadcrumb items={breadcrumbItems} />

      {/* Header with actions */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Learners Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Comprehensive analytics for {stats.totalCount.toLocaleString()} learners
            {!canAccessAllInstitutions && institutions.length > 0 && (
              <> across {institutions.length} institution(s)</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Learners */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Learners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              All learner profiles
            </p>
          </CardContent>
        </Card>

        {/* Active Students */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Students</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.activeCount.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {((stats.activeCount / stats.totalCount) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        {/* New Enquiries (30 days) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Enquiries</CardTitle>
            <UserCog className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.newEnquiries30Days.current.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-xs">
              {stats.newEnquiries30Days.trend === 'up' ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingUp className="h-3 w-3 rotate-180 text-red-600" />
              )}
              <span className={stats.newEnquiries30Days.change > 0 ? 'text-green-600' : 'text-red-600'}>
                {Math.abs(stats.newEnquiries30Days.change).toFixed(1)}%
              </span>
              <span className="text-muted-foreground">vs last month</span>
            </div>
          </CardContent>
        </Card>

        {/* Awaiting Activation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Activation</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats.profileCompletion.awaitingActivation.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Complete profiles ready for activation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lifecycle Status Overview */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle Status Distribution</CardTitle>
            <CardDescription>Learners by lifecycle stage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm">Enquiries</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.enquiriesCount}</span>
                <Badge variant="secondary">
                  {((stats.enquiriesCount / stats.totalCount) * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <span className="text-sm">Pending Approval</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.pendingCount}</span>
                <Badge variant="secondary">
                  {((stats.pendingCount / stats.totalCount) * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="text-sm">Approved</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.approvedCount}</span>
                <Badge variant="secondary">
                  {((stats.approvedCount / stats.totalCount) * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.activeCount}</span>
                <Badge variant="secondary">
                  {((stats.activeCount / stats.totalCount) * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-purple-500" />
                <span className="text-sm">Graduated</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.graduatedCount}</span>
                <Badge variant="secondary">
                  {((stats.graduatedCount / stats.totalCount) * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Completion */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Completion Status</CardTitle>
            <CardDescription>Required fields completion rate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Completion</span>
                <span className="text-sm font-bold">
                  {stats.profileCompletion.completionRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary">
                <div
                  className="h-2 rounded-full bg-green-500"
                  style={{ width: `${stats.profileCompletion.completionRate}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Complete Profiles</span>
                <span className="font-medium">{stats.profileCompletion.completeProfiles}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Incomplete Profiles</span>
                <span className="font-medium text-orange-600">
                  {stats.profileCompletion.incompleteProfiles}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Missing College Email</span>
                <span className="font-medium text-red-600">
                  {stats.profileCompletion.missingCollegeEmail}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Missing Academic Year</span>
                <span className="font-medium text-red-600">
                  {stats.profileCompletion.missingAcademicYear}
                </span>
              </div>
            </div>

            {stats.profileCompletion.awaitingActivation > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  {stats.profileCompletion.awaitingActivation} profile(s) are complete and ready
                  for auto-activation
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conversion Metrics */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Conversion Metrics</CardTitle>
          <CardDescription>Enquiry to active student conversion analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Enquiries</div>
              <div className="text-2xl font-bold">{stats.conversion.totalEnquiries}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Converted to Active</div>
              <div className="text-2xl font-bold text-green-600">
                {stats.conversion.convertedToActive}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Conversion Rate</div>
              <div className="text-2xl font-bold text-blue-600">
                {stats.conversion.conversionRate.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Avg. Time to Activation</div>
              <div className="text-2xl font-bold">
                {stats.conversion.averageTimeToActivation.toFixed(0)} days
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder for charts - to be implemented */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Trends & Distributions</CardTitle>
          <CardDescription>
            Detailed charts and visualizations (coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="mx-auto h-12 w-12 mb-2" />
            <p>Advanced charts and visualizations will be added here</p>
          </div>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
