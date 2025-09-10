'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { AttendanceReportsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AttendanceReportService } from '@/lib/services/academic/attendance-report-service';
import type { AttendanceReport } from '@/lib/services/academic/attendance-report-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { AttendanceExportService } from '@/lib/services/academic/attendance-export-service';
import { toast } from 'sonner';
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

  const [isExporting, setIsExporting] = useState(false);

  // Determine user role - use useMemo to memoize this
  const userRole = useMemo(() => {
    if (isSuperAdmin) return 'super_admin';
    if (profile?.role === 'admin') return 'admin';
    if (profile?.role === 'faculty') return 'faculty';
    return 'faculty';
  }, [isSuperAdmin, profile?.role]);

  // Permission checks - use useMemo to ensure stable reference
  const canExportReports = useMemo(
    () => isSuperAdmin || canAccess('academic.attendance.reports', 'export'),
    [isSuperAdmin, canAccess]
  );

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

  const handleBulkExport = useCallback(
    async (
      selectedRows: AttendanceReport[],
      format: 'excel' | 'pdf' | 'csv'
    ) => {
      if (selectedRows.length === 0) {
        toast.error('Please select reports to export');
        return;
      }

      try {
        setIsExporting(true);
        let result;
        const filename = `attendance-reports-${
          new Date().toISOString().split('T')[0]
        }`;

        switch (format) {
          case 'excel':
            result = await AttendanceExportService.exportToExcel(
              selectedRows,
              filename
            );
            break;
          case 'pdf':
            result = await AttendanceExportService.exportToPDF(
              selectedRows,
              filename
            );
            break;
          case 'csv':
            result = await AttendanceExportService.exportToCSV(
              selectedRows,
              filename
            );
            break;
        }

        if (result.success) {
          toast.success(
            `Reports exported to ${format.toUpperCase()} successfully`
          );
        } else {
          toast.error(
            `Failed to export to ${format.toUpperCase()}: ${result.error}`
          );
        }
      } catch (error) {
        toast.error(
          `An error occurred while exporting to ${format.toUpperCase()}`
        );
      } finally {
        setIsExporting(false);
      }
    },
    []
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

  const exportConfig = useMemo(
    () => ({
      entityName: 'attendance-reports',
      columnMapping: {
        attendance_date: 'Date',
        institution_name: 'Institution',
        department_name: 'Department',
        program_name: 'Program',
        degree_name: 'Degree',
        semester_name: 'Semester',
        section_name: 'Section',
        periods_count: 'Periods',
        total_students: 'Total Students',
        average_attendance: 'Attendance %'
      },
      columnWidths: [
        { wch: 12 }, // Date
        { wch: 20 }, // Institution
        { wch: 15 }, // Department
        { wch: 15 }, // Program
        { wch: 10 }, // Degree
        { wch: 10 }, // Semester
        { wch: 10 }, // Section
        { wch: 8 }, // Periods
        { wch: 12 }, // Total Students
        { wch: 12 } // Attendance %
      ],
      headers: [
        'attendance_date',
        'institution_name',
        'department_name',
        'program_name',
        'degree_name',
        'semester_name',
        'section_name',
        'periods_count',
        'total_students',
        'average_attendance'
      ]
    }),
    []
  );

  const tableActions = useMemo(
    () => [
      ...(canExportReports
        ? [
            {
              label: 'Export Excel',
              onClick: (selectedRows: AttendanceReport[]) =>
                handleBulkExport(selectedRows, 'excel'),
              icon: Download,
              disabled: isExporting
            },
            {
              label: 'Export PDF',
              onClick: (selectedRows: AttendanceReport[]) =>
                handleBulkExport(selectedRows, 'pdf'),
              icon: Download,
              disabled: isExporting
            },
            {
              label: 'Export CSV',
              onClick: (selectedRows: AttendanceReport[]) =>
                handleBulkExport(selectedRows, 'csv'),
              icon: Download,
              disabled: isExporting
            }
          ]
        : [])
    ],
    [canExportReports, handleBulkExport, isExporting]
  );

  // Wait for permissions and profile to be loaded before rendering the table
  const isReady = !permissionsLoading && !!userProfile;

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return (
    <DataTable
      getColumns={getColumns}
      fetchDataFn={fetchDataFn}
      exportConfig={exportConfig}
      idField='id'
    />
  );
}
