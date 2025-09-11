'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { AttendanceReportsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AttendanceReportService } from '@/lib/services/academic/attendance-report-service';
import type { AttendanceReport } from '@/lib/services/academic/attendance-report-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useState, useCallback, useMemo } from 'react';

interface AttendanceReportsDataTableProps {
  search: AttendanceReportsSearchParams;
}

export function AttendanceReportsDataTable({
  search
}: AttendanceReportsDataTableProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  // Determine user role - use useMemo to memoize this
  const userRole = useMemo(() => {
    if (isSuperAdmin) return 'super_admin';
    if (profile?.role === 'admin') return 'admin';
    if (profile?.role === 'faculty') return 'faculty';
    return 'faculty';
  }, [isSuperAdmin, profile?.role]);

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sortBy: string;
      sortOrder: string;
    }) => {
      try {
        // Map the DataTable parameters to our AttendanceReportService parameters
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

        const { data, count, error } =
          await AttendanceReportService.getAttendanceReports(
            filters,
            userRole,
            profile?.id,
            params.page,
            params.limit
          );

        if (error) {
          throw new Error(error);
        }

        return {
          data: data || [],
          totalCount: count || 0
        };
      } catch (error) {
        console.error('Failed to fetch attendance reports:', error);
        throw new Error(
          error instanceof Error ? error.message : 'Failed to fetch data'
        );
      }
    },
    [search, profile?.id, userRole]
  );

  const fetchDataFn = useCallback(
    async (params: any) => {
      const result = await fetchData({
        page: params.page,
        limit: params.limit,
        search: params.search,
        sortBy: params.sort_by,
        sortOrder: params.sort_order
      });
      return {
        success: true,
        data: result.data as any,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.ceil(result.totalCount / params.limit),
          total_items: result.totalCount
        }
      };
    },
    [fetchData]
  );

  const getColumns = useCallback(() => columns as any, []);

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return (
    <DataTable getColumns={getColumns} fetchDataFn={fetchDataFn} idField='id' />
  );
}
