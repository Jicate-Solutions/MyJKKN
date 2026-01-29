/**
 * Leave/OnDuty Attendance Check Service
 *
 * Checks for approved leave/onduty applications when marking attendance
 * Provides data for pre-filling attendance status and showing indicators
 *
 * @module services/academic/leave-onduty-attendance-check-service
 * @created 2026-01-29
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ApprovedLeaveInfo {
  learner_id: string;
  application_id: string;
  category: 'leave' | 'onduty';
  subcategory: string;
  selected_periods: string[];
  start_date: string;
  end_date: string;
  reason: string;
  attachment_url: string | null;
  // Computed field for display
  attendance_status: 'absent' | 'onduty';
}

export interface AttendancePreFillData {
  student_id: string;
  suggested_status: 'Present' | 'Absent' | 'OnDuty';
  has_approved_leave: boolean;
  leave_info?: ApprovedLeaveInfo;
  can_override: boolean;
}

export class LeaveOndutyAttendanceCheckService {
  /**
   * Get approved leave/onduty applications for students in a section on a specific date
   */
  static async getApprovedLeaveForAttendance(
    sectionId: string,
    date: string,
    periods?: string[]
  ): Promise<ApprovedLeaveInfo[]> {
    const supabase = createClientSupabaseClient();

    try {
      // Call the database function
      const { data, error } = await supabase.rpc(
        'get_approved_leave_for_attendance',
        {
          p_section_id: sectionId,
          p_date: date,
          p_periods: periods || null
        }
      );

      if (error) {
        console.error('[leave-check] Error fetching approved leave:', error);
        throw error;
      }

      // Transform and add computed fields
      return (data || []).map((item: any) => ({
        ...item,
        attendance_status: item.category === 'leave' ? 'absent' : 'onduty'
      }));
    } catch (error) {
      console.error('[leave-check] Failed to get approved leave:', error);
      return [];
    }
  }

  /**
   * Get pre-fill data for attendance marking
   * Returns suggested status for each student based on approved applications
   */
  static async getAttendancePreFillData(
    sectionId: string,
    date: string,
    studentIds: string[],
    periods?: string[]
  ): Promise<Map<string, AttendancePreFillData>> {
    const approvedLeave = await this.getApprovedLeaveForAttendance(
      sectionId,
      date,
      periods
    );

    // Create a map of student_id -> pre-fill data
    const preFillMap = new Map<string, AttendancePreFillData>();

    // Initialize all students with default "Present" status
    for (const studentId of studentIds) {
      preFillMap.set(studentId, {
        student_id: studentId,
        suggested_status: 'Present',
        has_approved_leave: false,
        can_override: true
      });
    }

    // Update students who have approved leave
    for (const leave of approvedLeave) {
      const existingData = preFillMap.get(leave.learner_id);
      if (existingData) {
        preFillMap.set(leave.learner_id, {
          student_id: leave.learner_id,
          suggested_status:
            leave.category === 'leave' ? 'Absent' : 'OnDuty',
          has_approved_leave: true,
          leave_info: leave,
          can_override: false // Don't allow overriding approved leave (can be changed based on requirements)
        });
      }
    }

    return preFillMap;
  }

  /**
   * Check if a specific student has approved leave for a date/period
   */
  static async hasApprovedLeave(
    studentId: string,
    sectionId: string,
    date: string,
    periods?: string[]
  ): Promise<boolean> {
    const approvedLeave = await this.getApprovedLeaveForAttendance(
      sectionId,
      date,
      periods
    );

    return approvedLeave.some((leave) => leave.learner_id === studentId);
  }

  /**
   * Get leave summary for display in UI
   */
  static getLeaveDisplayInfo(leaveInfo: ApprovedLeaveInfo): {
    badge_text: string;
    badge_color: string;
    tooltip: string;
    icon: string;
  } {
    const isLeave = leaveInfo.category === 'leave';

    return {
      badge_text: isLeave ? 'Leave' : 'On Duty',
      badge_color: isLeave
        ? 'bg-orange-100 text-orange-800 border-orange-200'
        : 'bg-blue-100 text-blue-800 border-blue-200',
      tooltip: `${isLeave ? 'Leave' : 'On Duty'}: ${leaveInfo.subcategory}\n${leaveInfo.reason}`,
      icon: isLeave ? '🏖️' : '💼'
    };
  }

  /**
   * Check if attendance can be marked for a student (considering approved leave)
   * This can be used to show warnings or block certain actions
   */
  static canMarkAttendance(
    preFillData: AttendancePreFillData,
    newStatus: 'Present' | 'Absent' | 'OnDuty'
  ): {
    allowed: boolean;
    warning?: string;
  } {
    // If student has approved leave, check if teacher is trying to override
    if (preFillData.has_approved_leave) {
      const suggestedStatus = preFillData.suggested_status;

      if (newStatus !== suggestedStatus) {
        return {
          allowed: preFillData.can_override,
          warning: `Student has approved ${preFillData.leave_info?.category}. Are you sure you want to mark them as ${newStatus}?`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get statistics about approved leave for reporting
   */
  static getLeaveStatistics(approvedLeave: ApprovedLeaveInfo[]): {
    total: number;
    leave_count: number;
    onduty_count: number;
    by_subcategory: Record<string, number>;
  } {
    const stats = {
      total: approvedLeave.length,
      leave_count: 0,
      onduty_count: 0,
      by_subcategory: {} as Record<string, number>
    };

    for (const leave of approvedLeave) {
      if (leave.category === 'leave') {
        stats.leave_count++;
      } else {
        stats.onduty_count++;
      }

      // Count by subcategory
      const key = leave.subcategory;
      stats.by_subcategory[key] = (stats.by_subcategory[key] || 0) + 1;
    }

    return stats;
  }
}
