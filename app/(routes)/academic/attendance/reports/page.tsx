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
import { useState, useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import type { AttendanceStatistics } from '@/lib/services/academic/attendance-report-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export default function AttendanceReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  // State for statistics (shown for all roles)
  const [statistics, setStatistics] = useState<AttendanceStatistics | null>(
    null
  );
  const [loadingStats, setLoadingStats] = useState(false);
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

  // Update URL without navigation when search changes
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(search).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    const newUrl = `/academic/attendance/reports?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [search]);

  // Determine user role - memoize to prevent unnecessary re-renders
  const getUserRole = useMemo(() => {
    if (isSuperAdmin) return 'super_admin';
    if (profile?.role === 'admin') return 'admin';
    if (profile?.role === 'faculty') return 'faculty';
    return 'faculty';
  }, [isSuperAdmin, profile?.role]);

  // Fetch staff ID for faculty users
  useEffect(() => {
    const fetchStaffId = async () => {
      if (profile?.role === 'faculty' && profile?.id) {
        const supabase = createClientSupabaseClient();
        const { data } = await supabase
          .from('staffs')
          .select('id')
          .eq('profile_id', profile.id)
          .single();
        
        if (data) {
          setFacultyStaffId(data.id);
        }
      }
    };
    
    fetchStaffId();
  }, [profile]);

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

  // Fetch statistics for all users (including faculty)
  const fetchStatistics = useCallback(async () => {
    // Allow all users to see statistics (faculty will see their own data)

    try {
      setLoadingStats(true);

      // Build filters from search params
      const filters = {
        institution_id: search.institution_id,
        academic_year_id: search.academic_year_id,
        degree_id: search.degree_id,
        department_id: search.department_id,
        program_id: search.program_id,
        semester_id: search.semester_id,
        section_id: search.section_id,
        faculty_id: search.faculty_id,
        attendance_status: search.attendance_status,
        attendance_threshold: search.attendance_threshold,
        date_range: search.dateRange
          ? {
              from: search.dateRange.from?.toISOString().split('T')[0] || '',
              to: search.dateRange.to?.toISOString().split('T')[0] || ''
            }
          : undefined
      };

      // For faculty, add their staff ID to the filters to get their specific statistics
      const statsFilters = profile?.role === 'faculty' && facultyStaffId
        ? { ...filters, faculty_id: facultyStaffId }
        : filters;
      
      const { data } = await AttendanceReportService.getAttendanceStatistics(
        statsFilters,
        profile?.role === 'faculty' ? 'faculty' : 'institution'
      );

      setStatistics(data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoadingStats(false);
    }
  }, [search, isSuperAdmin, profile]);

  // Fetch statistics when filters change
  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

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

          {/* Statistics Dashboard (Available for all roles) */}
          <ReportStatistics
            statistics={statistics}
            loading={loadingStats}
            userRole={getUserRole}
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
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
