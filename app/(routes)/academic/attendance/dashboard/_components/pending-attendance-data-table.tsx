'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table/data-table';
import { createColumns } from './pending-attendance-columns';
import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service';
import type {
  PendingAttendancePeriod,
  DashboardFilters
} from '@/types/attendance-dashboard';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import { logger } from '@/lib/utils/enhanced-logger';

interface PendingAttendanceDataTableProps {
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
  filters?: {
    institutionId?: string;
    academicYearId?: string;
    degreeId?: string;
    departmentId?: string;
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    attendanceDate?: string;
  };
  refreshTrigger?: number;
}

export function PendingAttendanceDataTable({
  userInstitutionId,
  canViewAllInstitutions,
  filters: pendingFilters,
  refreshTrigger = 0
}: PendingAttendanceDataTableProps) {
  const router = useRouter();

  // Fetch data function for advanced DataTable
  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {

      // Map DataTable parameters to our service parameters
      const attendanceDate = pendingFilters?.attendanceDate || new Date().toISOString().split('T')[0];
      const filters: DashboardFilters = {
        userInstitutionId: pendingFilters?.institutionId || userInstitutionId,
        page: params.page,
        limit: params.limit,
        sortBy: params.sort_by || 'attendance_date',
        sortDirection: (params.sort_order as 'asc' | 'desc') || 'desc',
        search: params.search || '',
        startDate: attendanceDate,
        endDate: attendanceDate,
        institutionId: pendingFilters?.institutionId,
        academicYearId: pendingFilters?.academicYearId,
        degreeId: pendingFilters?.degreeId,
        departmentId: pendingFilters?.departmentId,
        programId: pendingFilters?.programId,
        semesterId: pendingFilters?.semesterId,
        sectionId: pendingFilters?.sectionId,
        staffId: undefined
      };

      const result = await AttendanceDashboardService.getTodayPendingAttendance(
        filters
      );

      return {
        success: true,
        data: result.data || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: result.metadata?.totalPages ?? 0,
          total_items: result.metadata?.total ?? 0
        }
      };
    } catch (error) {
      logger.error('academic/attendance-dashboard', 'Error fetching pending attendance', error);
      throw error;
    }
  };

  // Handle sending reminder (simulated - sends toast notification)
  const handleSendReminder = useCallback((period: PendingAttendancePeriod) => {
    toast.success(
      `Reminder sent for ${period.period_name} - ${period.course_name}`
    );
  }, []);

  // Handle mark attendance navigation
  const handleMarkAttendance = useCallback(
    async (period: PendingAttendancePeriod) => {
      try {

        // Quick check using the same logic as the service
        const { data: existingAttendance } = await createClientSupabaseClient()
          .from('student_attendance')
          .select('attendance_data')
          .eq('attendance_date', period.attendance_date)
          .eq('timetable_id', period.timetable_id)
          .single();

        const attendanceRecord = existingAttendance as { attendance_data: Record<string, unknown> } | null;
        if (attendanceRecord?.attendance_data) {
          const attendanceData = attendanceRecord.attendance_data;
          if (attendanceData && typeof attendanceData === 'object' && attendanceData[period.period_id]) {
            toast.error(
              `Attendance for ${period.period_name} on ${format(new Date(period.attendance_date), 'MMM dd, yyyy')} has already been marked`,
              {

                duration: 5000
              }
            );
            return;
          }
        }

        // Navigate to attendance marking page with pre-filled data
        const params = new URLSearchParams({
          timetableId: period.timetable_id,
          sectionId: period.section_id,
          periodId: period.period_id,
          date: period.attendance_date,
          periodName: period.period_name,
          courseName: period.course_name,
          startTime: period.start_time,
          endTime: period.end_time
        });

        router.push(`/academic/attendance/mark?${params.toString()}`);
        toast.success(
          `Navigating to mark attendance for ${period.period_name}`
        );
      } catch (error) {
        logger.error('academic/attendance-dashboard', 'Error navigating to mark attendance', error);
        // Still navigate even if the check fails
        const params = new URLSearchParams({
          timetableId: period.timetable_id,
          sectionId: period.section_id,
          periodId: period.period_id,
          date: period.attendance_date,
          periodName: period.period_name,
          courseName: period.course_name,
          startTime: period.start_time,
          endTime: period.end_time
        });

        router.push(`/academic/attendance/mark?${params.toString()}`);
        toast.success(
          `Navigating to mark attendance for ${period.period_name}`
        );
      }
    },
    [router]
  );

  // Custom toolbar for bulk actions
  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {props.selectedRows.length > 0 && (
        <Button
          variant='outline'
          size='sm'
          disabled={props.selectedRows.length === 0}
          className='gap-2'
          onClick={() => toast('Individual reminders can be sent from the attendance page')}
        >
          <Bell className='h-4 w-4' />
          Send Reminders ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  return (
    <div className='space-y-4'>
      {/* Advanced Data Table */}
      <DataTable
        key={`${refreshTrigger}-${JSON.stringify(pendingFilters)}`} // Force refresh when filters change
        fetchDataFn={fetchData}
        getColumns={() =>
          createColumns(
            canViewAllInstitutions,
            handleSendReminder,
            handleMarkAttendance
          )
        }
        exportConfig={{
          entityName: 'pending-attendance-periods',
          columnMapping: {
            attendance_date: 'Date',
            period_name: 'Period',
            course_name: 'Course',
            institution_name: 'Institution',
            degree_name: 'Degree',
            department_name: 'Department',
            program_name: 'Program',
            semester_name: 'Semester',
            section_name: 'Section',
            academic_year_name: 'Academic Year',
            primary_staff_name: 'Primary Staff'
          },
          columnWidths: [
            { wch: 15 }, // Date
            { wch: 15 }, // Period
            { wch: 20 }, // Course
            { wch: 15 }, // Institution
            { wch: 15 }, // Degree
            { wch: 20 }, // Department
            { wch: 20 }, // Program
            { wch: 15 }, // Semester
            { wch: 12 }, // Section
            { wch: 15 }, // Academic Year
            { wch: 20 }  // Primary Staff
          ],
          headers: [
            'Date',
            'Period',
            'Course',
            'Institution',
            'Degree',
            'Department',
            'Program',
            'Semester',
            'Section',
            'Academic Year',
            'Primary Staff'
          ]
        }}
        idField='period_id'
        config={{
          enableUrlState: false, // Disable URL state for dashboard component
          enableDateFilter: false, // Using custom date filters
          enableExport: true,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'pending-attendance-table'
        }}
        renderToolbarContent={renderCustomToolbar}
      />
    </div>
  );
}
