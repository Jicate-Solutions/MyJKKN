/**
 * Leave/OnDuty Attendance Integration Service
 *
 * Handles automatic attendance updates when applications are approved:
 * - Updates attendance records from 'Present' to 'Absent' (leave) or 'OnDuty' (onduty)
 * - Creates audit trail of all changes
 * - Supports rollback functionality
 * - Validates attendance records before updating
 *
 * @module services/academic/leave-onduty-attendance-integration-service
 * @created 2026-01-28
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  LeaveOndutyApplication,
  AttendanceUpdateRecord,
} from '@/types/leave-onduty';

// Helper to get untyped client for tables not yet in database.types.ts
const getSupabase = () => createClientSupabaseClient() as any;

export class LeaveOndutyAttendanceIntegrationService {
  /**
   * Main function to update attendance when application is approved
   */
  static async updateAttendanceOnApproval(
    applicationId: string
  ): Promise<void> {
    const supabase = getSupabase();

    // Get application details
    const { data: application, error: appError } = await supabase
      .from('leave_onduty_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      throw new Error('Application not found');
    }

    // Get affected date range
    const dateRange = this.getDateRange(
      application.start_date,
      application.end_date
    );

    // Get periods to update
    const periods = application.selected_periods || [];

    if (periods.length === 0) {
      console.warn('No periods selected for application:', applicationId);
      return;
    }

    // Determine new status based on category
    const newStatus = application.category === 'leave' ? 'absent' : 'onduty';

    // Process each date
    for (const date of dateRange) {
      await this.updateAttendanceForDate(
        application,
        date,
        periods,
        newStatus
      );
    }
  }

  /**
   * Update attendance for a specific date
   */
  private static async updateAttendanceForDate(
    application: LeaveOndutyApplication,
    date: string,
    periods: string[],
    newStatus: string
  ): Promise<void> {
    const supabase = getSupabase();

    // Find attendance record for this date and section
    const { data: attendanceRecord, error: findError } = await supabase
      .from('student_attendance')
      .select('*')
      .eq('section_id', application.section_id)
      .eq('attendance_date', date)
      .maybeSingle();

    if (findError) {
      console.error('Error finding attendance record:', findError);
      return;
    }

    if (!attendanceRecord) {
      console.warn('No attendance record found for date:', date);
      return;
    }

    // Get current attendance data (JSONB)
    const attendanceData = { ...attendanceRecord.attendance_data };
    let updated = false;

    // Update each period
    for (const periodSlotId of periods) {
      if (attendanceData[periodSlotId]?.students) {
        const students = attendanceData[periodSlotId].students;
        const studentIndex = students.findIndex(
          (s: any) => s.student_id === application.learner_id
        );

        if (studentIndex !== -1) {
          const oldStatus = students[studentIndex].status;

          // Only update if status is different
          if (oldStatus !== newStatus) {
            students[studentIndex].status = newStatus;
            students[studentIndex].marked_at = new Date().toISOString();

            // Create audit record
            await this.createAttendanceUpdateAudit({
              application_id: application.id,
              attendance_record_id: attendanceRecord.id,
              period_slot_id: periodSlotId,
              student_id: application.learner_id,
              old_status: oldStatus,
              new_status: newStatus,
              updated_by: null, // System update
            });

            updated = true;
          }
        }
      }
    }

    // Save updated attendance if changes were made
    if (updated) {
      const { error: updateError } = await supabase
        .from('student_attendance')
        .update({
          attendance_data: attendanceData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', attendanceRecord.id);

      if (updateError) {
        console.error('Error updating attendance:', updateError);
        throw new Error(`Failed to update attendance: ${updateError.message}`);
      }
    }
  }

  /**
   * Get date range between start and end dates (inclusive)
   */
  private static getDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    return dates;
  }

  /**
   * Create audit trail record for attendance update
   */
  private static async createAttendanceUpdateAudit(
    data: Omit<AttendanceUpdateRecord, 'id' | 'updated_at'>
  ): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('leave_onduty_attendance_updates')
      .insert(data);

    if (error) {
      console.error('Error creating audit record:', error);
      // Don't throw - audit failure shouldn't break the main flow
    }
  }

  /**
   * Get affected attendance records for an application
   */
  static async getAffectedAttendanceRecords(
    applicationId: string
  ): Promise<any[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leave_onduty_attendance_updates')
      .select(
        `
        *,
        application:leave_onduty_applications(
          *,
          learner:learners_profiles(first_name, last_name, roll_number)
        )
      `
      )
      .eq('application_id', applicationId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch attendance updates: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Revert attendance changes (in case application is cancelled/rejected after approval)
   */
  static async revertAttendanceChanges(
    applicationId: string
  ): Promise<void> {
    const supabase = getSupabase();

    // Get all attendance update records
    const { data: updates, error: fetchError } = await supabase
      .from('leave_onduty_attendance_updates')
      .select('*')
      .eq('application_id', applicationId);

    if (fetchError || !updates) {
      throw new Error('Failed to fetch attendance updates for rollback');
    }

    // Group updates by attendance record
    const recordMap = new Map<string, any[]>();
    for (const update of updates) {
      if (!recordMap.has(update.attendance_record_id)) {
        recordMap.set(update.attendance_record_id, []);
      }
      recordMap.get(update.attendance_record_id)!.push(update);
    }

    // Revert each attendance record
    for (const [recordId, recordUpdates] of recordMap.entries()) {
      const { data: attendanceRecord } = await supabase
        .from('student_attendance')
        .select('*')
        .eq('id', recordId)
        .single();

      if (!attendanceRecord) continue;

      const attendanceData = { ...attendanceRecord.attendance_data };

      // Revert each period
      for (const update of recordUpdates) {
        if (attendanceData[update.period_slot_id]?.students) {
          const students = attendanceData[update.period_slot_id].students;
          const studentIndex = students.findIndex(
            (s: any) => s.student_id === update.student_id
          );

          if (studentIndex !== -1) {
            // Revert to old status
            students[studentIndex].status = update.old_status;
            students[studentIndex].marked_at = new Date().toISOString();
          }
        }
      }

      // Save reverted attendance
      await supabase
        .from('student_attendance')
        .update({
          attendance_data: attendanceData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId);
    }

    // Delete audit records (since changes are reverted)
    await supabase
      .from('leave_onduty_attendance_updates')
      .delete()
      .eq('application_id', applicationId);
  }

  /**
   * Get attendance impact summary for an application
   */
  static async getAttendanceImpactSummary(
    applicationId: string
  ): Promise<{
    total_updates: number;
    periods_affected: number;
    dates_affected: number;
    status_breakdown: { absent: number; onduty: number };
  }> {
    const supabase = getSupabase();

    const { data: updates } = await supabase
      .from('leave_onduty_attendance_updates')
      .select('*')
      .eq('application_id', applicationId);

    if (!updates || updates.length === 0) {
      return {
        total_updates: 0,
        periods_affected: 0,
        dates_affected: 0,
        status_breakdown: { absent: 0, onduty: 0 },
      };
    }

    const uniquePeriods = new Set(updates.map((u) => u.period_slot_id));
    const uniqueDates = new Set(
      updates.map((u) => new Date(u.updated_at).toISOString().split('T')[0])
    );

    const statusBreakdown = {
      absent: updates.filter((u) => u.new_status === 'absent').length,
      onduty: updates.filter((u) => u.new_status === 'onduty').length,
    };

    return {
      total_updates: updates.length,
      periods_affected: uniquePeriods.size,
      dates_affected: uniqueDates.size,
      status_breakdown: statusBreakdown,
    };
  }

  /**
   * Validate attendance records exist before applying leave/onduty
   */
  static async validateAttendanceRecordsExist(
    sectionId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    valid: boolean;
    missing_dates: string[];
    message?: string;
  }> {
    const supabase = getSupabase();

    const dateRange = this.getDateRange(startDate, endDate);
    const missingDates: string[] = [];

    for (const date of dateRange) {
      const { data } = await supabase
        .from('student_attendance')
        .select('id')
        .eq('section_id', sectionId)
        .eq('attendance_date', date)
        .maybeSingle();

      if (!data) {
        missingDates.push(date);
      }
    }

    if (missingDates.length > 0) {
      return {
        valid: false,
        missing_dates: missingDates,
        message: `Attendance not yet marked for: ${missingDates.join(', ')}. Updates will be applied when attendance is marked.`,
      };
    }

    return {
      valid: true,
      missing_dates: [],
    };
  }
}
