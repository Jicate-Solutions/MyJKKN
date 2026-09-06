'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AttendanceReportsDataTable } from './_components/reports-data-table';
import { attendanceReportsSearchParamsSchema } from './_components/data-table-schema';
import { ReportsFilters } from './_components/reports-filters';
import { ReportStatistics } from './_components/report-statistics';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { AttendanceReportService } from '@/lib/services/academic/attendance-report-service';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { useState, useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ATTENDANCE_REPORT_TABS,
  RECORDS_TAB,
  findReportTab
} from './_components/report-tabs';
import { ReportPanel } from './_components/report-panel';
import { ReportSettingsDialog } from './_components/report-settings-dialog';
import type { AttendanceStatistics } from '@/lib/services/academic/attendance-report-service';

export default function AttendanceReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  // State for statistics (shown for all roles)
  const [statistics, setStatistics] = useState<AttendanceStatistics | null>(
    null
  );
  const [loadingStats, setLoadingStats] = useState(true); // Start with loading for all users
  const [facultyStaffId, setFacultyStaffId] = useState<string | null>(null);

  // Parse initial search parameters
  const initialSearch = useMemo(
    () =>
      attendanceReportsSearchParamsSchema.parse(
        Object.fromEntries(searchParams.entries())
      ),
    [searchParams]
  );

  // Use local state for search params to avoid page refreshes
  const [search, setSearch] = useState(initialSearch);

  // Which report is on screen. Seeded from ?tab= so a tab can be linked and
  // bookmarked; an unknown value falls back to the records tab rather than
  // rendering nothing.
  const [activeTab, setActiveTab] = useState(
    () => findReportTab(searchParams.get('tab')).value
  );

  // Update URL without navigation when search or the active tab changes
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(search).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
    if (activeTab && activeTab !== RECORDS_TAB) {
      params.set('tab', activeTab);
    }

    const newUrl = `/academic/attendance/reports?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [search, activeTab]);

  // Determine user role - memoize to prevent unnecessary re-renders
  const userRole = useMemo(() => {
    if (isSuperAdmin) return 'super_admin';
    if (profile?.role === 'admin') return 'admin';
    if (profile?.role === 'hod') return 'hod';
    if (profile?.role === 'faculty') return 'faculty';
    return 'faculty';
  }, [isSuperAdmin, profile?.role]);

  // Fetch staff ID for faculty users
  useEffect(() => {
    const fetchStaffId = async () => {
      if (profile?.role === 'faculty' && profile?.id && profile?.institution_id) {
        const staffData = await AttendanceService.getStaffByProfileId(profile.id, profile.institution_id);
        if (staffData) {
          setFacultyStaffId(staffData.id);
        }
      }
    };

    fetchStaffId();
  }, [profile?.role, profile?.id, profile?.institution_id]);

  // Handle filter changes using local state
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      setSearch((prev) => ({
        ...prev,
        [key]: value,
        // Reset page to 1 when filters change (except for page and pageSize)
        page: key !== 'page' && key !== 'pageSize' ? 1 : prev.page || 1
      }));
    },
    []
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    setSearch({
      page: 1,
      pageSize: search.pageSize || 10
    } as any);
  }, [search.pageSize]);

  // Determine if we should wait for faculty role resolution
  const isRegularFaculty =
    userRole === 'faculty' && !isSuperAdmin && profile?.role === 'faculty';
  const shouldWaitForFacultyId =
    isRegularFaculty && profile?.id && !facultyStaffId;

  // Fetch statistics for all users (including faculty and HOD)
  const fetchStatistics = useCallback(async () => {
    // For faculty users, wait until staff ID is available to prevent showing institutional data
    if (shouldWaitForFacultyId) {
      setLoadingStats(true); // Keep loading state active while waiting
      return;
    }

    try {
      setLoadingStats(true);

      // Build filters from search params with role-based filtering
      // FIXED: 2025-11-24 - Auto-set institution_id for non-super-admin users to fix Today's Overview stats showing 0
      const filters = {
        institution_id:
          search.institution_id ||
          // For non-super-admin users, automatically use their institution
          (!isSuperAdmin && profile?.institution_id
            ? profile.institution_id
            : undefined),
        academic_year_id: search.academic_year_id,
        degree_id: search.degree_id,
        department_id:
          search.department_id ||
          // For HOD users, automatically filter by their department
          (userRole === 'hod' && profile?.department_id && !isSuperAdmin
            ? profile.department_id
            : undefined),
        program_id: search.program_id,
        semester_id: search.semester_id,
        section_id: search.section_id,
        faculty_id:
          search.faculty_id ||
          // For faculty users, filter by their own staff ID
          (isRegularFaculty && facultyStaffId
            ? facultyStaffId
            : undefined),
        attendance_status: search.attendance_status,
        attendance_threshold: search.attendance_threshold,
        date_range: search.dateRange
          ? {
              from: search.dateRange.from?.toISOString().split('T')[0] || '',
              to: search.dateRange.to?.toISOString().split('T')[0] || ''
            }
          : undefined
      };

      // Determine statistics level based on user role
      let statisticsLevel: 'institution' | 'department' | 'faculty' = 'institution';
      let staffIdForStats: string | undefined = undefined;

      if (userRole === 'hod') {
        statisticsLevel = 'department';
      } else if (isRegularFaculty && facultyStaffId) {
        statisticsLevel = 'faculty';
        staffIdForStats = facultyStaffId;
      }

      const { data } = await AttendanceReportService.getAttendanceStatistics(
        filters,
        statisticsLevel,
        staffIdForStats
      );

      setStatistics(data);
    } catch (error) {
      // Error fetching statistics - silently fail and show empty state
    } finally {
      setLoadingStats(false);
    }
  }, [
    search,
    isSuperAdmin,
    profile,
    userRole,
    facultyStaffId,
    isRegularFaculty,
    shouldWaitForFacultyId
  ]);

  // Fetch statistics when filters change
  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  // Show loading state while waiting for faculty role resolution
  const shouldShowLoading = shouldWaitForFacultyId;

  return (
    <PermissionGuard module='academic.attendance.reports' action='view'>
      <ContentLayout title='Attendance Reports'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic/attendance'>
                  Attendance
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Reports</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {shouldShowLoading ? (
            /* Loading State for Faculty Users */
            <div className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className='animate-pulse'>
                    <CardContent className='p-6'>
                      <div className='flex items-center justify-between space-y-0 pb-2'>
                        <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-24'></div>
                        <div className='h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full'></div>
                      </div>
                      <div className='space-y-2'>
                        <div className='h-8 bg-gray-200 dark:bg-gray-700 rounded w-16'></div>
                        <div className='h-3 bg-gray-200 dark:bg-gray-700 rounded w-20'></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardContent className='p-6'>
                  <div className='animate-pulse space-y-4'>
                    <div className='h-6 bg-gray-200 dark:bg-gray-700 rounded w-48'></div>
                    <div className='h-40 bg-gray-200 dark:bg-gray-700 rounded'></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className='space-y-6'
            >
              {/* Report selector. Scrolls horizontally rather than wrapping, so
                  the strip stays one row on a phone instead of eating the fold. */}
              <div className='flex items-center gap-3'>
                <div className='-mx-1 min-w-0 flex-1 overflow-x-auto px-1 pb-1'>
                  <TabsList className='inline-flex w-max'>
                    {ATTENDANCE_REPORT_TABS.map((tab) => (
                      <TabsTrigger key={tab.value} value={tab.value}>
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {/* Admin-only; renders nothing until an institution is picked,
                    since the rules are per-institution. */}
                <ReportSettingsDialog institutionId={search.institution_id} />
              </div>

              {/* Records - the page as it has always been, untouched */}
              <TabsContent value={RECORDS_TAB} className='space-y-6'>
                {/* Statistics Dashboard (Available for all roles) */}
                <ReportStatistics
                  statistics={statistics}
                  loading={loadingStats}
                  userRole={userRole}
                />

                {/* Main Content */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <FileText className='h-5 w-5' />
                      Attendance Reports
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='p-6'>
                    <div className='space-y-6'>
                      {/* Filters */}
                      <ReportsFilters
                        searchParams={search}
                        onFilterChange={handleFilterChange}
                        onClearFilters={handleClearFilters}
                      />

                      {/* Data Table */}
                      <AttendanceReportsDataTable search={search} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* One tab per report. The filter bar is shared, so switching
                  reports keeps the cohort you already narrowed to. */}
              {ATTENDANCE_REPORT_TABS.filter(
                (tab) => tab.value !== RECORDS_TAB
              ).map((tab) => (
                <TabsContent
                  key={tab.value}
                  value={tab.value}
                  className='space-y-6'
                >
                  <ReportsFilters
                    searchParams={search}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                  />
                  {/* Pending Attendance reads timetables, whose visibility is
                      institution-wide, so it cannot inherit the per-faculty
                      narrowing the student_attendance RPCs get from RLS. Hand it
                      the caller's own staff id when — and only when — they are a
                      plain faculty member. */}
                  <ReportPanel
                    tab={tab}
                    search={search}
                    facultyStaffId={isRegularFaculty ? facultyStaffId : null}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
