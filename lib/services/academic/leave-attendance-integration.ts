// lib/services/academic/leave-attendance-integration.ts
// Leave-Attendance Integration Service
// Created: 2025-12-16
//
// Purpose: Checks if attendance marking is blocked by approved leaves
// Access Control: Uses profiles.institution_id (NOT user_institution_access)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  LeaveBlockInfo,
  AttendanceLeaveCheck,
  AttendanceLeaveResult
} from '@/types/leaves';

export class LeaveAttendanceIntegration {
  private static supabase = createClientSupabaseClient();

  /**
   * Check if attendance can be marked for a given date and scope
   * This is the main integration point with the attendance module
   */
  static async canMarkAttendance(
    params: AttendanceLeaveCheck
  ): Promise<AttendanceLeaveResult> {
    try {
      // Use the database function for efficient checking
      const { data, error } = await (this.supabase as any).rpc('is_date_blocked_by_leave', {
        p_institution_id: params.institution_id,
        p_date: params.date,
        p_department_id: params.department_id || null,
        p_semester_id: params.semester_id || null,
        p_section_id: params.section_id || null
      });

      if (error) {
        logger.error('academic/leaves', 'Database error checking leave block', error);
        // In case of error, allow attendance marking (fail-open)
        return { allowed: true };
      }

      if (data && data.length > 0 && data[0].is_blocked) {
        const leave = data[0];
        return {
          allowed: false,
          reason: `Attendance marking is blocked due to: ${leave.leave_name}`,
          leave: {
            is_blocked: true,
            leave_id: leave.leave_id,
            leave_name: leave.leave_name,
            leave_type_name: leave.leave_type_name,
            color_code: leave.color_code
          }
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('academic/leaves', 'Error checking attendance block', error);
      // Fail-open: allow attendance if there's an error checking
      return { allowed: true };
    }
  }

  /**
   * Check multiple dates at once (for bulk attendance marking)
   */
  static async checkMultipleDates(
    institutionId: string,
    dates: string[],
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<Map<string, LeaveBlockInfo>> {
    const results = new Map<string, LeaveBlockInfo>();

    try {
      // Get all approved leaves that overlap with any of the dates
      const minDate = dates.reduce((a, b) => (a < b ? a : b));
      const maxDate = dates.reduce((a, b) => (a > b ? a : b));

      // Define type for leave data
      interface LeaveData {
        id: string;
        leave_name: string;
        start_date: string;
        end_date: string;
        scope_level: string;
        department_ids?: string[];
        semester_ids?: string[];
        section_ids?: string[];
        leave_type?: {
          leave_type_name: string;
          color_code: string;
        };
      }

      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          id,
          leave_name,
          start_date,
          end_date,
          scope_level,
          department_ids,
          semester_ids,
          section_ids,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .lte('start_date', maxDate)
        .gte('end_date', minDate);

      if (error) {
        logger.error('academic/leaves', 'Error fetching leaves for multiple dates', error);
        // Return empty results (fail-open)
        dates.forEach((date) => results.set(date, { is_blocked: false }));
        return results;
      }

      const typedLeaves = (leaves || []) as LeaveData[];

      // Check each date against the leaves
      for (const date of dates) {
        const dateObj = new Date(date);

        const blockingLeave = typedLeaves.find((leave) => {
          const leaveStart = new Date(leave.start_date);
          const leaveEnd = new Date(leave.end_date);

          // Check if date is within leave range
          if (dateObj < leaveStart || dateObj > leaveEnd) {
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

        if (blockingLeave) {
          results.set(date, {
            is_blocked: true,
            leave_id: blockingLeave.id,
            leave_name: blockingLeave.leave_name,
            leave_type_name: blockingLeave.leave_type?.leave_type_name,
            color_code: blockingLeave.leave_type?.color_code
          });
        } else {
          results.set(date, { is_blocked: false });
        }
      }

      return results;
    } catch (error) {
      logger.error('academic/leaves', 'Error checking multiple dates', error);
      // Return all as non-blocked (fail-open)
      dates.forEach((date) => results.set(date, { is_blocked: false }));
      return results;
    }
  }

  /**
   * Get blocked dates for a date range (for calendar highlighting)
   */
  static async getBlockedDatesInRange(
    institutionId: string,
    startDate: string,
    endDate: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<string[]> {
    try {
      // Define type for leave data
      interface BlockedLeaveData {
        start_date: string;
        end_date: string;
        scope_level: string;
        department_ids?: string[];
        semester_ids?: string[];
        section_ids?: string[];
      }

      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          start_date,
          end_date,
          scope_level,
          department_ids,
          semester_ids,
          section_ids
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate);

      if (error) {
        logger.error('academic/leaves', 'Error fetching blocked dates', error);
        return [];
      }

      const typedLeaves = (leaves || []) as BlockedLeaveData[];
      const blockedDates: Set<string> = new Set();
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (const leave of typedLeaves) {
        const leaveStart = new Date(leave.start_date);
        const leaveEnd = new Date(leave.end_date);

        // Check scope match
        let scopeMatches = false;
        if (leave.scope_level === 'institution') {
          scopeMatches = true;
        } else if (
          leave.scope_level === 'department' &&
          (!departmentId || leave.department_ids?.includes(departmentId))
        ) {
          scopeMatches = true;
        } else if (
          leave.scope_level === 'semester' &&
          (!semesterId || leave.semester_ids?.includes(semesterId))
        ) {
          scopeMatches = true;
        } else if (
          leave.scope_level === 'section' &&
          (!sectionId || leave.section_ids?.includes(sectionId))
        ) {
          scopeMatches = true;
        }

        if (!scopeMatches) continue;

        // Add all dates in the leave range
        const current = new Date(Math.max(leaveStart.getTime(), start.getTime()));
        const rangeEnd = new Date(Math.min(leaveEnd.getTime(), end.getTime()));

        while (current <= rangeEnd) {
          blockedDates.add(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
      }

      return Array.from(blockedDates).sort();
    } catch (error) {
      logger.error('academic/leaves', 'Error getting blocked dates', error);
      return [];
    }
  }

  /**
   * Check if a specific timetable slot can have attendance marked
   * This integrates with the attendance marking flow
   */
  static async canMarkSlotAttendance(
    institutionId: string,
    date: string,
    timetableSlotId: string
  ): Promise<AttendanceLeaveResult> {
    try {
      // Define type for timetable slot data
      interface TimetableSlotData {
        id: string;
        timetable?: {
          id: string;
          section_id?: string;
          section?: {
            id: string;
            semester_id?: string;
            semester?: {
              id: string;
              department_id?: string;
            };
          };
        };
      }

      // First, get the timetable slot to determine scope
      const { data: slot, error: slotError } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          id,
          timetable:timetables(
            id,
            section_id,
            section:sections(
              id,
              semester_id,
              semester:semesters(
                id,
                department_id
              )
            )
          )
        `
        )
        .eq('id', timetableSlotId)
        .single();

      if (slotError || !slot) {
        // If we can't get the slot, allow attendance (fail-open)
        return { allowed: true };
      }

      const typedSlot = slot as TimetableSlotData;

      // Extract scope IDs
      const sectionId = typedSlot.timetable?.section_id;
      const semesterId = typedSlot.timetable?.section?.semester_id;
      const departmentId = typedSlot.timetable?.section?.semester?.department_id;

      // Check if blocked
      return this.canMarkAttendance({
        institution_id: institutionId,
        date,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId
      });
    } catch (error) {
      logger.error('academic/leaves', 'Error checking slot attendance', error);
      return { allowed: true };
    }
  }

  /**
   * Get leave information for display in attendance UI
   */
  static async getLeaveInfoForDate(
    institutionId: string,
    date: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<LeaveBlockInfo | null> {
    try {
      const result = await this.canMarkAttendance({
        institution_id: institutionId,
        date,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId
      });

      return result.leave || null;
    } catch (error) {
      logger.error('academic/leaves', 'Error getting leave info for date', error);
      return null;
    }
  }
}
