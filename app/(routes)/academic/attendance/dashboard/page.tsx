'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Calendar, TrendingUp, Users, AlertCircle, ArrowRight, AlertTriangle, RefreshCw, MessageSquare, ShieldAlert } from 'lucide-react';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PermissionError } from '@/components/errors/permission-error';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { StatisticsCards } from './_components/statistics-cards';
import { PendingAttendanceDataTable } from './_components/pending-attendance-data-table';
import { PendingAttendanceHierarchyFilters } from './_components/pending-attendance-hierarchy-filters';
import { PendingStatisticsCards } from './_components/pending-statistics-cards';
import { FeedbackConfirmationTab } from './_components/feedback-confirmation-tab';
import { IntakeReadinessPanel } from './_components/intake-readiness-panel';
import {
  DashboardFilters,
  type DashboardFilterState
} from './_components/dashboard-filters';
import { useActiveInstitutions } from '@/hooks/academic/use-attendance-dashboard';
import { useTabParam } from '@/hooks/use-tab-param';
import { format } from 'date-fns';

const ATTENDANCE_DASHBOARD_TABS = [
  'statistics',
  'pending',
  'readiness',
  'feedback'
] as const;

function AttendanceDashboardContent() {
  const { profile } = useAuth();
  const { canAccess } = usePermissions();

  // Check if user can view all institutions
  const canViewAllInstitutions = canAccess(
    'academic.attendance.dashboard',
    'view_all_institutions'
  );

  const { institutions, isLoading: institutionsLoading } = useActiveInstitutions(canViewAllInstitutions);
  const loading = institutionsLoading && canViewAllInstitutions;

  const [filters, setFilters] = useState<DashboardFilterState>({
    selectedDate: new Date()
  });
  const [pendingFilters, setPendingFilters] = useState<{
    institutionId?: string;
    academicYearId?: string;
    degreeId?: string;
    departmentId?: string;
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    attendanceDate?: string;
  }>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useTabParam(
    'statistics',
    ATTENDANCE_DASHBOARD_TABS
  );

  // Initialize filters based on user permissions and role
  useEffect(() => {
    if (!canViewAllInstitutions && profile?.institution_id) {
      const institutionId = profile.institution_id || undefined;
      setFilters((prev) => ({
        ...prev,
        institutionId
      }));
      setPendingFilters((prev) => ({
        ...prev,
        institutionId
      }));
    }

    // Add role-based department filtering
    if (profile?.role === 'hod' && profile?.department_id) {
      // HOD users: filter by their department
      setFilters((prev) => ({
        ...prev,
        departmentId: profile.department_id
      }));
      setPendingFilters((prev) => ({
        ...prev,
        departmentId: profile.department_id || undefined
      }));
    } else if (profile?.role === 'faculty' && profile?.department_id) {
      // Faculty users: filter by their department (they'll see all classes in their department)
      setFilters((prev) => ({
        ...prev,
        departmentId: profile.department_id
      }));
      setPendingFilters((prev) => ({
        ...prev,
        departmentId: profile.department_id || undefined
      }));
    }
  }, [
    canViewAllInstitutions,
    profile?.institution_id,
    profile?.role,
    profile?.department_id
  ]);

  // Handle filter changes
  const handleFiltersChange = useCallback(
    (newFilters: DashboardFilterState) => {
      setFilters(newFilters);
    },
    []
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Handle pending filters change
  const handlePendingFiltersChange = useCallback((newFilters: any) => {
    setPendingFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // Reset pending filters
  const resetPendingFilters = useCallback(() => {
    setPendingFilters({
      institutionId: !canViewAllInstitutions
        ? profile?.institution_id || undefined
        : undefined,
      academicYearId: undefined,
      degreeId: undefined,
      departmentId: undefined,
      programId: undefined,
      semesterId: undefined,
      sectionId: undefined,
      attendanceDate: undefined
    });
  }, [canViewAllInstitutions, profile?.institution_id]);

  if (loading) {
    return (
      <ContentLayout title='Attendance Dashboard'>
        <div className='space-y-6'>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-32 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  // Check if showing historical data
  const isHistoricalData = !isToday(filters.selectedDate);

  // Helper function to check if date is today
  function isToday(date: Date) {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  return (
    <ContentLayout title='Attendance Dashboard'>
      <div className='space-y-6'>
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/'>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/academic'>Academic</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/academic/attendance'>Attendance</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Enhanced Header */}
        <div className='relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-6 text-white shadow-lg'>
          <div className='absolute inset-0 bg-black/10'></div>
          <div className='relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4'>
            <div>
              <h1 className='text-3xl font-bold tracking-tight flex items-center gap-3'>
                <TrendingUp className='h-8 w-8' />
                Attendance Dashboard
              </h1>
              <p className='text-blue-100 mt-2'>
                {isHistoricalData
                  ? `Historical attendance data for ${format(
                      filters.selectedDate,
                      'EEEE, MMMM dd, yyyy'
                    )}`
                  : "Real-time overview of today's attendance statistics and pending periods"}
              </p>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <Badge className='bg-white/20 text-white border-white/30 hover:bg-white/30 flex items-center gap-1'>
                <Calendar className='h-3 w-3' />
                {format(filters.selectedDate, 'MMM dd, yyyy')}
              </Badge>

              {!canViewAllInstitutions && profile?.institution_id && (
                <Badge className='bg-white/20 text-white border-white/30 hover:bg-white/30 flex items-center gap-1'>
                  <Users className='h-3 w-3' />
                  Your Institution
                </Badge>
              )}

              {isHistoricalData && (
                <Badge
                  variant='secondary'
                  className='bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700'
                >
                  <AlertCircle className='h-3 w-3 mr-1' />
                  Historical Data
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className='space-y-4'>
          <TabsList className='flex w-full justify-start gap-1 overflow-x-auto sm:grid sm:grid-cols-4 sm:gap-0 sm:overflow-visible'>
            <TabsTrigger value='statistics' className='flex items-center gap-2'>
              <TrendingUp className='h-4 w-4' />
              {isHistoricalData
                ? 'Historical Statistics'
                : "Today's Statistics"}
            </TabsTrigger>
            <TabsTrigger
              value='pending'
              className='flex items-center gap-2'
              disabled={isHistoricalData}
            >
              <Users className='h-4 w-4' />
              Pending Attendance
              {isHistoricalData && (
                <Badge variant='secondary' className='ml-1 px-1 py-0 text-xs'>
                  N/A
                </Badge>
              )}
            </TabsTrigger>
            {/* Deliberately NOT disabled for historical dates. This check is a
                trailing-window question about the current intake, not a
                point-in-time reading, so it stays reachable whatever date the
                filter bar is showing. */}
            <TabsTrigger
              value='readiness'
              className='flex items-center gap-2'
            >
              <ShieldAlert className='h-4 w-4' />
              Intake Readiness
            </TabsTrigger>
            <TabsTrigger
              value='feedback'
              className='flex items-center gap-2'
            >
              <MessageSquare className='h-4 w-4' />
              Feedback Confirmation
            </TabsTrigger>
          </TabsList>

          <TabsContent value='statistics' className='space-y-4'>
            {/* Smart Filter System - Only for Statistics Tab */}
            <DashboardFilters
              canViewAllInstitutions={canViewAllInstitutions}
              institutions={institutions}
              userInstitutionId={profile?.institution_id || undefined}
              onFiltersChange={handleFiltersChange}
              onRefresh={handleRefresh}
              isLoading={loading}
              showHierarchy
            />

            {/* Information Alert for Non-Today Data */}
            {isHistoricalData && (
              <Alert className='border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
                <AlertCircle className='h-4 w-4 text-amber-600' />
                <AlertDescription className='text-amber-800 dark:text-amber-300'>
                  <strong>Historical Data View:</strong> You are viewing
                  attendance data for{' '}
                  <strong>
                    {format(filters.selectedDate, 'EEEE, MMMM dd, yyyy')}
                  </strong>
                  . No pending periods will be shown for past dates.
                </AlertDescription>
              </Alert>
            )}

            <div>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-xl font-semibold'>
                  {isHistoricalData ? 'Historical' : "Today's"} Attendance
                  Statistics
                </h2>
                <div className='text-sm text-muted-foreground'>
                  Last updated: {format(new Date(), 'h:mm a')}
                </div>
              </div>
              <p className='text-muted-foreground mb-6'>
                {isHistoricalData
                  ? `Comprehensive view of attendance statistics for ${format(
                      filters.selectedDate,
                      'EEEE, MMMM dd, yyyy'
                    )} across your selected scope.`
                  : "Real-time overview of today's attendance statistics across institutions, departments, and sections."}
              </p>
              <Suspense fallback={<StatisticsCardsSkeleton />}>
                <StatisticsCards
                  userInstitutionId={
                    filters.institutionId ||
                    profile?.institution_id ||
                    undefined
                  }
                  canViewAllInstitutions={canViewAllInstitutions}
                  institutions={institutions}
                  selectedDate={filters.selectedDate}
                  filters={filters}
                  refreshTrigger={refreshTrigger}
                />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value='pending' className='space-y-4'>
            <div>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-xl font-semibold'>Pending Attendance</h2>
                <Badge variant='outline' className='flex items-center gap-1'>
                  <Calendar className='h-3 w-3' />
                  {pendingFilters.attendanceDate
                    ? format(
                        new Date(pendingFilters.attendanceDate + 'T00:00:00'),
                        'MMM dd, yyyy'
                      )
                    : 'Today'}
                </Badge>
              </div>
              <p className='text-muted-foreground mb-6'>
                Periods scheduled for{' '}
                {pendingFilters.attendanceDate
                  ? format(
                      new Date(pendingFilters.attendanceDate + 'T00:00:00'),
                      'EEEE, MMMM dd, yyyy'
                    )
                  : 'today'}{' '}
                that haven&apos;t been marked yet. Use filters to narrow down by
                organizational hierarchy.
              </p>

              {/* Hierarchy Filters */}
              <PendingAttendanceHierarchyFilters
                filters={pendingFilters}
                onFiltersChange={handlePendingFiltersChange}
                onReset={resetPendingFilters}
                canViewAllInstitutions={canViewAllInstitutions}
                userInstitutionId={profile?.institution_id || undefined}
                dashboardInstitutionId={filters.institutionId}
                dashboardAcademicYearId={filters.academicYearId}
              />

              {/* Statistics Cards */}
              <PendingStatisticsCards
                filters={pendingFilters}
                userInstitutionId={profile?.institution_id || undefined}
                canViewAllInstitutions={canViewAllInstitutions}
                refreshTrigger={refreshTrigger}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Unmarked Periods</CardTitle>
                  <CardDescription>
                    Periods scheduled for{' '}
                    {pendingFilters.attendanceDate
                      ? format(
                          new Date(pendingFilters.attendanceDate + 'T00:00:00'),
                          'MMMM dd, yyyy'
                        )
                      : 'today'}{' '}
                    that require attendance marking
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<PendingAttendanceTableSkeleton />}>
                    <PendingAttendanceDataTable
                      userInstitutionId={
                        pendingFilters.institutionId ||
                        filters.institutionId ||
                        profile?.institution_id ||
                        undefined
                      }
                      canViewAllInstitutions={canViewAllInstitutions}
                      filters={{
                        ...filters,
                        ...pendingFilters
                      }}
                      refreshTrigger={refreshTrigger}
                    />
                  </Suspense>
                </CardContent>
              </Card>
              <div className="flex justify-end pt-2">
                <Link href="/academic/attendance/pending" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  View Full Pending History
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='readiness' className='space-y-4'>
            <div>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-xl font-semibold'>
                  Current Intake Readiness
                </h2>
                <Badge variant='outline' className='flex items-center gap-1'>
                  <Users className='h-3 w-3' />
                  Current admission year
                </Badge>
              </div>
              <p className='text-muted-foreground mb-6'>
                Whether attendance can be recorded at all for the learners
                admitted in this intake. The Pending Attendance tab lists periods
                that were scheduled but not marked; this tab catches the case it
                cannot see — learners placed in a section that has no timetable,
                and so generates no periods to be pending in the first place.
              </p>

              <IntakeReadinessPanel
                institutionId={
                  filters.institutionId ||
                  (canViewAllInstitutions
                    ? undefined
                    : profile?.institution_id || undefined)
                }
                canViewAllInstitutions={canViewAllInstitutions}
                departmentId={filters.departmentId}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </TabsContent>

          <TabsContent value='feedback' className='space-y-4'>
            {/* Same filter bar, same `filters` state as the Statistics tab — so
                the chosen date/college survives a tab switch instead of silently
                resetting. It was previously rendered only under 'statistics',
                which is why this tab had no way to narrow to one college. */}
            <DashboardFilters
              canViewAllInstitutions={canViewAllInstitutions}
              institutions={institutions}
              userInstitutionId={profile?.institution_id || undefined}
              onFiltersChange={handleFiltersChange}
              onRefresh={handleRefresh}
              isLoading={loading}
              showHierarchy
            />
            <FeedbackConfirmationTab
              userInstitutionId={
                filters.institutionId || profile?.institution_id || undefined
              }
              canViewAllInstitutions={canViewAllInstitutions}
              selectedDate={filters.selectedDate}
              filters={filters}
              refreshTrigger={refreshTrigger}
            />
            <div className='flex justify-end pt-2'>
              <Link
                href='/academic/session-feedback/admin'
                className='text-sm text-muted-foreground hover:text-foreground flex items-center gap-1'
              >
                Open Full All-College Feedback Dashboard
                <ArrowRight className='h-3 w-3' />
              </Link>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

// Loading Skeletons
function StatisticsCardsSkeleton() {
  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <Skeleton className='h-4 w-20' />
            <Skeleton className='h-4 w-4' />
          </CardHeader>
          <CardContent>
            <Skeleton className='h-7 w-16 mb-1' />
            <Skeleton className='h-3 w-24' />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PendingAttendanceTableSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Filters */}
      <div className='flex items-center gap-4'>
        <Skeleton className='h-9 w-48' />
        <Skeleton className='h-9 w-36' />
        <Skeleton className='h-9 w-32' />
      </div>

      {/* Table */}
      <div className='space-y-2'>
        <Skeleton className='h-10 w-full' />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-12 w-full' />
        ))}
      </div>

      {/* Pagination */}
      <div className='flex items-center justify-between'>
        <Skeleton className='h-4 w-32' />
        <div className='flex items-center space-x-2'>
          <Skeleton className='h-8 w-20' />
          <Skeleton className='h-8 w-8' />
          <Skeleton className='h-8 w-8' />
          <Skeleton className='h-8 w-20' />
        </div>
      </div>
    </div>
  );
}

export default function AttendanceDashboardPage() {
  // Re-apply the #1616 reconciliation that never landed for this page.
  //
  // Previously this wrapped the content in a single-state <PermissionGuard>
  // whose `fallback` rendered "Access Denied" on ANY non-pass. That MISLABELS a
  // transient permission-load failure (network hiccup, RLS timeout) as a real
  // denial. Replace the all-or-nothing guard with the same explicit three-state
  // gate menu.tsx uses, computed in the page from usePermissions() directly:
  //   (1) LOADING          -> skeleton, NEVER "Access Denied"
  //   (2) LOAD FAILURE     -> amber retry-friendly card with a Retry button
  //   (3a) LOADED + grant  -> render the dashboard content
  //   (3b) LOADED + denial -> the existing "Access Denied" message, unchanged
  //
  // Ordering matters: a loading or failed state must short-circuit BEFORE the
  // deny branch, so a transient never reaches "Access Denied".
  const {
    isLoading: permsLoading,
    error: permsError,
    isSuperAdmin,
    isStudent,
    userProfile,
    permissions,
    refetch: refetchPermissions,
    canAccess
  } = usePermissions();

  // (1) Permissions still loading — show a skeleton, never a denial.
  if (permsLoading) {
    return (
      <ContentLayout title='Attendance Dashboard'>
        <div className='space-y-6'>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-32 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  // (2) Genuine load failure — mirror menu.tsx's permissionsLoadFailed
  // derivation verbatim. Super admins (no permission-keyed set), students
  // (status rules deliberately empty the set), and profile-less users are all
  // valid empty-set states, so they are excluded. A real granted role always
  // has >=1 true permission, so this cannot false-positive an actual grant.
  const hasAnyTruePermission = Object.values(permissions).some((v) => v === true);
  const permissionsLoadFailed =
    !isSuperAdmin &&
    !isStudent &&
    !permsLoading &&
    !!userProfile &&
    !!userProfile.role &&
    (!!permsError || !hasAnyTruePermission);

  if (permissionsLoadFailed) {
    return (
      <ContentLayout title='Attendance Dashboard'>
        <div className='flex flex-col items-center justify-center gap-3 px-4 py-12 text-center'>
          <AlertTriangle className='h-8 w-8 text-amber-500' aria-hidden />
          <div className='space-y-1'>
            <p className='text-sm font-medium text-foreground'>
              We couldn&apos;t load your access
            </p>
            <p className='text-xs text-muted-foreground'>
              Your permissions didn&apos;t load. This is almost always a
              temporary network hiccup — your access hasn&apos;t changed.
            </p>
          </div>
          <button
            type='button'
            onClick={() => {
              void refetchPermissions();
            }}
            className='inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          >
            <RefreshCw className='h-3.5 w-3.5' aria-hidden />
            Retry
          </button>
          <p className='text-[11px] text-muted-foreground'>
            If this keeps happening, refresh the page or contact your
            administrator.
          </p>
        </div>
      </ContentLayout>
    );
  }

  // (3a) Permissions loaded and the user genuinely has the grant — render
  // content. Uses the role's ACTUAL `.view` permission (not
  // view_all_institutions), so scope='own' roles render here and their scope is
  // still enforced downstream by AttendanceDashboardContent + RLS (#1618).
  const canViewDashboard =
    isSuperAdmin || canAccess('academic.attendance.dashboard', 'view');

  if (canViewDashboard) {
    // Suspense boundary required: AttendanceDashboardContent calls useTabParam()
    // which reads useSearchParams() for the deep-linkable / favoritable ?tab=.
    return (
      <Suspense fallback={null}>
        <AttendanceDashboardContent />
      </Suspense>
    );
  }

  // (3b) Permissions loaded and the user genuinely lacks the grant — the
  // existing, unchanged "Access Denied" message.
  return (
    <ContentLayout title='Attendance Dashboard'>
      <PermissionError
        message='You do not have permission to view the Attendance Dashboard. Ask your administrator to grant the "View Attendance Dashboard" permission to your role.'
        requiredPermission='academic.attendance.dashboard.view'
      />
    </ContentLayout>
  );
}
