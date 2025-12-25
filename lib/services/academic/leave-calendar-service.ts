// lib/services/academic/leave-calendar-service.ts
// Leave Calendar Service for calendar display and working days calculation
// Created: 2025-12-16
//
// Access Control: Uses profiles.institution_id (NOT user_institution_access)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  CalendarLeave,
  CalendarDayInfo,
  MonthlyCalendarData,
  LeaveCalendarFilters,
  AttendanceLeaveCheck,
  AttendanceLeaveResult,
  LeaveBlockInfo,
  LeaveScopeLevel
} from '@/types/leaves';

export class LeaveCalendarService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get leaves for a specific month (uses database function)
   */
  static async getLeavesForMonth(
    filters: LeaveCalendarFilters
  ): Promise<CalendarLeave[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc('get_leaves_for_month', {
        p_institution_id: filters.institution_id,
        p_year: filters.year,
        p_month: filters.month,
        p_department_id: filters.department_id || null,
        p_semester_id: filters.semester_id || null,
        p_section_id: filters.section_id || null
      });

      if (error) {
        logger.error('academic/leaves', 'Database error fetching leaves for month', error);
        throw error;
      }

      return (data || []).map((row: any) => ({
        leave_id: row.leave_id,
        leave_name: row.leave_name,
        leave_type_name: row.leave_type_name,
        color_code: row.color_code,
        start_date: row.start_date,
        end_date: row.end_date,
        scope_level: row.scope_level,
        status: row.status
      }));
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leaves for month', error);
      throw error;
    }
  }

  /**
   * Get calendar data with day-by-day breakdown
   */
  static async getMonthlyCalendarData(
    filters: LeaveCalendarFilters
  ): Promise<MonthlyCalendarData> {
    try {
      const leaves = await this.getLeavesForMonth(filters);

      // Generate all days of the month
      const daysInMonth = new Date(filters.year, filters.month, 0).getDate();
      const days: CalendarDayInfo[] = [];

      let totalWorkingDays = 0;
      let totalLeaveDays = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        // Use local date construction to avoid timezone shifts
        const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0; // Only Sunday is weekend

        // Find leaves that include this day
        const dayLeaves = leaves.filter((leave) => {
          // Normalize dates to compare only date parts (not time)
          const leaveStart = new Date(leave.start_date + 'T00:00:00');
          const leaveEnd = new Date(leave.end_date + 'T23:59:59');
          const currentDate = new Date(dateStr + 'T12:00:00');
          return currentDate >= leaveStart && currentDate <= leaveEnd;
        });

        // Check if day is blocked (has approved leave)
        const isBlocked = dayLeaves.some((leave) => leave.status === 'approved');

        if (isBlocked) {
          totalLeaveDays++;
        } else if (!isWeekend) {
          totalWorkingDays++;
        }

        days.push({
          date: dateStr,
          leaves: dayLeaves,
          is_blocked: isBlocked,
          is_weekend: isWeekend
        });
      }

      return {
        year: filters.year,
        month: filters.month,
        days,
        total_working_days: totalWorkingDays,
        total_leave_days: totalLeaveDays
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error generating calendar data', error);
      throw error;
    }
  }

  /**
   * Get working days count between two dates
   */
  static async getWorkingDays(
    institutionId: string,
    startDate: string,
    endDate: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<{
    total_days: number;
    working_days: number;
    leave_days: number;
    weekend_days: number;
  }> {
    try {
      let totalDays = 0;
      let weekendDays = 0;
      let leaveDays = 0;
      const leaveDates = new Set<string>();

      // Get all approved leaves in the date range
      const { data: leaves, error } = (await this.supabase
        .from('institution_leaves')
        .select('start_date, end_date, scope_level, department_ids, semester_ids, section_ids')
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`)) as {
        data: Array<{
          start_date: string;
          end_date: string;
          scope_level: LeaveScopeLevel;
          department_ids: string[] | null;
          semester_ids: string[] | null;
          section_ids: string[] | null;
        }> | null;
        error: any;
      };

      if (error) throw error;

      // Calculate days
      const current = new Date(startDate + 'T00:00:00');
      const endDateTime = new Date(endDate + 'T23:59:59');
      while (current <= endDateTime) {
        totalDays++;
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const dayOfWeek = current.getDay();

        if (dayOfWeek === 0) { // Only Sunday is weekend
          weekendDays++;
        } else {
          // Check if this day has an approved leave
          const hasLeave = (leaves || []).some((leave) => {
            const leaveStart = new Date(leave.start_date + 'T00:00:00');
            const leaveEnd = new Date(leave.end_date + 'T23:59:59');

            if (current < leaveStart || current > leaveEnd) {
              return false;
            }

            // Check scope
            if (leave.scope_level === 'institution') {
              return true;
            }
            if (
              leave.scope_level === 'department' &&
              departmentId &&
              leave.department_ids?.includes(departmentId)
            ) {
              return true;
            }
            if (
              leave.scope_level === 'semester' &&
              semesterId &&
              leave.semester_ids?.includes(semesterId)
            ) {
              return true;
            }
            if (
              leave.scope_level === 'section' &&
              sectionId &&
              leave.section_ids?.includes(sectionId)
            ) {
              return true;
            }

            return false;
          });

          if (hasLeave && !leaveDates.has(dateStr)) {
            leaveDates.add(dateStr);
            leaveDays++;
          }
        }

        current.setDate(current.getDate() + 1);
      }

      const workingDays = totalDays - weekendDays - leaveDays;

      return {
        total_days: totalDays,
        working_days: workingDays,
        leave_days: leaveDays,
        weekend_days: weekendDays
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error calculating working days', error);
      throw error;
    }
  }

  /**
   * Get leaves for a specific date
   */
  static async getLeavesForDate(
    institutionId: string,
    date: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<CalendarLeave[]> {
    try {
      const query = this.supabase
        .from('institution_leaves')
        .select(
          `
          id,
          leave_name,
          start_date,
          end_date,
          scope_level,
          status,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .in('status', ['approved', 'pending'])
        .lte('start_date', date)
        .gte('end_date', date);

      const { data, error } = await query;

      if (error) throw error;

      // Filter by scope
      const filteredLeaves = (data || []).filter((leave: any) => {
        if (leave.scope_level === 'institution') return true;
        // Additional scope filtering would be applied here based on parameters
        return true;
      });

      return filteredLeaves.map((leave: any) => ({
        leave_id: leave.id,
        leave_name: leave.leave_name,
        leave_type_name: leave.leave_type?.leave_type_name || '',
        color_code: leave.leave_type?.color_code || '#6B7280',
        start_date: leave.start_date,
        end_date: leave.end_date,
        scope_level: leave.scope_level,
        status: leave.status
      }));
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leaves for date', error);
      throw error;
    }
  }

  /**
   * Get leave dates for date picker highlighting
   */
  static async getLeaveDatesInRange(
    institutionId: string,
    startDate: string,
    endDate: string
  ): Promise<{ date: string; color: string; status: string }[]> {
    try {
      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          start_date,
          end_date,
          status,
          leave_type:leave_types(color_code)
        `
        )
        .eq('institution_id', institutionId)
        .in('status', ['approved', 'pending'])
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

      if (error) throw error;

      const dates: { date: string; color: string; status: string }[] = [];
      const dateSet = new Set<string>();

      (leaves || []).forEach((leave: any) => {
        const start = new Date(leave.start_date + 'T00:00:00');
        const end = new Date(leave.end_date + 'T23:59:59');
        const current = new Date(start);

        while (current <= end) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;

          if (
            !dateSet.has(dateStr) &&
            dateStr >= startDate &&
            dateStr <= endDate
          ) {
            dateSet.add(dateStr);
            dates.push({
              date: dateStr,
              color: leave.leave_type?.color_code || '#6B7280',
              status: leave.status
            });
          }

          current.setDate(current.getDate() + 1);
        }
      });

      return dates.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leave dates', error);
      throw error;
    }
  }

  /**
   * Get monthly leave summary (for dashboard widgets)
   */
  static async getMonthlyLeaveSummary(
    institutionId: string,
    year: number,
    month: number
  ): Promise<{
    total_leaves: number;
    approved_count: number;
    pending_count: number;
    by_type: { leave_type_name: string; count: number; color_code: string }[];
  }> {
    try {
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          status,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

      if (error) throw error;

      const typeCount: Record<string, { count: number; color_code: string }> = {};
      let approvedCount = 0;
      let pendingCount = 0;

      (leaves || []).forEach((leave: any) => {
        if (leave.status === 'approved') approvedCount++;
        if (leave.status === 'pending') pendingCount++;

        const typeName = leave.leave_type?.leave_type_name || 'Unknown';
        if (!typeCount[typeName]) {
          typeCount[typeName] = {
            count: 0,
            color_code: leave.leave_type?.color_code || '#6B7280'
          };
        }
        typeCount[typeName].count++;
      });

      return {
        total_leaves: leaves?.length || 0,
        approved_count: approvedCount,
        pending_count: pendingCount,
        by_type: Object.entries(typeCount).map(([name, data]) => ({
          leave_type_name: name,
          count: data.count,
          color_code: data.color_code
        }))
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching monthly summary', error);
      throw error;
    }
  }

  /**
   * Check if attendance marking is blocked by an approved leave
   * Updated: 2025-01-16 - Added for leave-attendance integration
   *
   * Checks leave hierarchy in order:
   * 1. Institution-wide leaves (applies to all)
   * 2. Department-level leaves (applies to specific departments)
   * 3. Semester-level leaves (applies to specific semesters)
   * 4. Section-level leaves (applies to specific sections)
   *
   * @param params - Institution ID, date, and optional hierarchy filters
   * @returns Promise<AttendanceLeaveResult> - Whether attendance is allowed and leave details
   */
  static async checkLeaveBlockForAttendance(
    params: AttendanceLeaveCheck
  ): Promise<AttendanceLeaveResult> {
    try {
      const { institution_id, date, department_id, semester_id, section_id } = params;

      // Query approved leaves for the specific date
      const { data: leaves, error } = (await this.supabase
        .from('institution_leaves')
        .select(
          `
          id,
          leave_name,
          scope_level,
          department_ids,
          semester_ids,
          section_ids,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institution_id)
        .eq('status', 'approved')
        .lte('start_date', date)
        .gte('end_date', date)) as {
        data: Array<{
          id: string;
          leave_name: string;
          scope_level: LeaveScopeLevel;
          department_ids: string[] | null;
          semester_ids: string[] | null;
          section_ids: string[] | null;
          leave_type: { leave_type_name: string; color_code: string } | null;
        }> | null;
        error: any;
      };

      if (error) {
        logger.error('academic/leaves', 'Error checking leave block for attendance', {
          error_code: error.code,
          error_message: error.message,
          error_details: error.details,
          error_hint: error.hint,
          params
        });
        throw error;
      }

      // No approved leaves on this date
      if (!leaves || leaves.length === 0) {
        return {
          allowed: true
        };
      }

      // Check for blocking leave in hierarchy order
      for (const leave of leaves) {
        let isBlocked = false;

        // Check scope level (priority order: institution > department > semester > section)
        switch (leave.scope_level) {
          case 'institution':
            // Institution-wide leaves block ALL attendance
            isBlocked = true;
            break;

          case 'department':
            // Block if department matches
            if (department_id && leave.department_ids?.includes(department_id)) {
              isBlocked = true;
            }
            break;

          case 'semester':
            // Block if semester matches
            if (semester_id && leave.semester_ids?.includes(semester_id)) {
              isBlocked = true;
            }
            break;

          case 'section':
            // Block if section matches
            if (section_id && leave.section_ids?.includes(section_id)) {
              isBlocked = true;
            }
            break;

          default:
            logger.warn('academic/leaves', 'Unknown leave scope level', {
              scope_level: leave.scope_level,
              leave_id: leave.id
            });
        }

        // If blocked, return leave details
        if (isBlocked) {
          const leaveInfo: LeaveBlockInfo = {
            is_blocked: true,
            leave_id: leave.id,
            leave_name: leave.leave_name,
            leave_type_name: leave.leave_type?.leave_type_name || 'Holiday',
            color_code: leave.leave_type?.color_code || '#6B7280'
          };

          return {
            allowed: false,
            reason: `Cannot mark attendance: ${leave.leave_name} (${leaveInfo.leave_type_name})`,
            leave: leaveInfo
          };
        }
      }

      // No blocking leave found for this specific scope
      return {
        allowed: true
      };
    } catch (error) {
      logger.error('academic/leaves', 'Exception in checkLeaveBlockForAttendance', {
        error_message: error instanceof Error ? error.message : 'Unknown error',
        error_stack: error instanceof Error ? error.stack : undefined,
        params
      });
      // On error, allow attendance marking (fail open for availability)
      // But log the error for investigation
      return {
        allowed: true,
        reason: 'Error checking leave status - allowing attendance'
      };
    }
  }
}
