import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Updated: 2025-09-05 - Created monitoring service for attendance staff assignment conflicts
 * Service to monitor and report conflicts between assigned staff and marking staff
 */

export interface AttendanceConflict {
  id: string;
  attendance_id: string;
  timetable_id: string;
  attendance_date: string;
  section_name: string;
  course_name: string;
  period_name: string;
  marked_by: string;
  marked_by_name: string;
  assigned_staff: Array<{
    id: string;
    name: string;
    email: string;
    isPrimary?: boolean;
  }>;
  conflict_type: 'unauthorized_marker' | 'no_assignments' | 'missing_data';
  conflict_reason: string;
  detected_at: string;
}

export interface ConflictSummary {
  total_records: number;
  conflict_records: number;
  valid_records: number;
  conflict_percentage: number;
  conflicts_by_type: Record<string, number>;
  conflicts_by_date: Record<string, number>;
}

export class AttendanceConflictMonitorService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get current attendance conflicts
   */
  static async getActiveConflicts(
    institutionId: string,
    dateRange?: { start: string; end: string },
    limit = 50
  ): Promise<AttendanceConflict[]> {
    try {
      // Build date filter
      let dateFilter = '';
      if (dateRange) {
        dateFilter = `AND sa.attendance_date BETWEEN '${dateRange.start}' AND '${dateRange.end}'`;
      }

      const { data, error } = await (this.supabase as any).rpc(
        'get_attendance_staff_conflicts',
        {
          p_institution_id: institutionId,
          p_date_start: dateRange?.start || null,
          p_date_end: dateRange?.end || null,
          p_limit: limit
        }
      );

      if (error) {
        logger.error('academic/attendance', 'Error fetching attendance conflicts', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('academic/attendance', 'Error in getActiveConflicts', error);
      return [];
    }
  }

  /**
   * Get conflict summary statistics
   */
  static async getConflictSummary(
    institutionId: string,
    dateRange?: { start: string; end: string }
  ): Promise<ConflictSummary> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'get_attendance_conflict_summary',
        {
          p_institution_id: institutionId,
          p_date_start: dateRange?.start || null,
          p_date_end: dateRange?.end || null
        }
      );

      if (error) {
        logger.error('academic/attendance', 'Error fetching conflict summary', error);
        return this.getEmptyConflictSummary();
      }

      return data || this.getEmptyConflictSummary();
    } catch (error) {
      logger.error('academic/attendance', 'Error in getConflictSummary', error);
      return this.getEmptyConflictSummary();
    }
  }

  /**
   * Check if a specific attendance record has conflicts
   */
  static async validateAttendanceRecord(
    attendanceId: string
  ): Promise<{
    isValid: boolean;
    conflicts: AttendanceConflict[];
    suggestions: string[];
  }> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'validate_attendance_record',
        { p_attendance_id: attendanceId }
      );

      if (error) {
        logger.error('academic/attendance', 'Error validating attendance record', error);
        return {
          isValid: false,
          conflicts: [],
          suggestions: ['Unable to validate record - check database connection']
        };
      }

      return data || {
        isValid: true,
        conflicts: [],
        suggestions: []
      };
    } catch (error) {
      logger.error('academic/attendance', 'Error in validateAttendanceRecord', error);
      return {
        isValid: false,
        conflicts: [],
        suggestions: ['Validation error occurred']
      };
    }
  }

  /**
   * Get daily conflict report
   */
  static async getDailyConflictReport(
    institutionId: string,
    date: string
  ): Promise<{
    date: string;
    total_attendance: number;
    conflicts_found: number;
    conflict_details: AttendanceConflict[];
    staff_with_conflicts: Array<{
      staff_id: string;
      staff_name: string;
      unauthorized_markings: number;
    }>;
  }> {
    try {
      const conflicts = await this.getActiveConflicts(
        institutionId,
        { start: date, end: date }
      );

      // Group conflicts by staff
      const staffConflicts = new Map<string, {
        staff_id: string;
        staff_name: string;
        unauthorized_markings: number;
      }>();

      conflicts.forEach(conflict => {
        const key = conflict.marked_by;
        if (!staffConflicts.has(key)) {
          staffConflicts.set(key, {
            staff_id: conflict.marked_by,
            staff_name: conflict.marked_by_name,
            unauthorized_markings: 0
          });
        }
        staffConflicts.get(key)!.unauthorized_markings++;
      });

      // Get total attendance for the date
      const { data: totalAttendance } = await this.supabase
        .from('student_attendance')
        .select('id', { count: 'exact' })
        .eq('institution_id', institutionId)
        .eq('attendance_date', date);

      return {
        date,
        total_attendance: totalAttendance?.length || 0,
        conflicts_found: conflicts.length,
        conflict_details: conflicts,
        staff_with_conflicts: Array.from(staffConflicts.values())
      };
    } catch (error) {
      logger.error('academic/attendance', 'Error in getDailyConflictReport', error);
      return {
        date,
        total_attendance: 0,
        conflicts_found: 0,
        conflict_details: [],
        staff_with_conflicts: []
      };
    }
  }

  /**
   * Suggest fixes for conflicts
   */
  static async suggestConflictFixes(
    conflicts: AttendanceConflict[]
  ): Promise<Array<{
    conflict_id: string;
    suggested_action: 'reassign_timetable' | 'update_staff_assignment' | 'verify_permissions';
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>> {
    const suggestions = conflicts.map(conflict => {
      let suggested_action: 'reassign_timetable' | 'update_staff_assignment' | 'verify_permissions';
      let description: string;
      let priority: 'high' | 'medium' | 'low';

      switch (conflict.conflict_type) {
        case 'unauthorized_marker':
          suggested_action = 'update_staff_assignment';
          description = `Update timetable to include ${conflict.marked_by_name} as assigned staff for this period, or ensure only assigned staff mark attendance.`;
          priority = 'high';
          break;
        
        case 'no_assignments':
          suggested_action = 'reassign_timetable';
          description = `No staff assignments found in timetable data. Please assign staff to this timetable period.`;
          priority = 'high';
          break;
        
        case 'missing_data':
          suggested_action = 'verify_permissions';
          description = `Missing timetable or staff data. Please verify data integrity and user permissions.`;
          priority = 'medium';
          break;
        
        default:
          suggested_action = 'verify_permissions';
          description = 'Please review staff assignments and permissions.';
          priority = 'low';
      }

      return {
        conflict_id: conflict.id,
        suggested_action,
        description,
        priority
      };
    });

    return suggestions;
  }

  /**
   * Helper method to get empty conflict summary
   */
  private static getEmptyConflictSummary(): ConflictSummary {
    return {
      total_records: 0,
      conflict_records: 0,
      valid_records: 0,
      conflict_percentage: 0,
      conflicts_by_type: {},
      conflicts_by_date: {}
    };
  }

  /**
   * Schedule automated conflict detection (to be called by cron job or similar)
   */
  static async scheduleConflictDetection(
    institutionId: string,
    notificationEmail?: string
  ): Promise<boolean> {
    try {
      // Get yesterday's date for checking
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      const report = await this.getDailyConflictReport(institutionId, dateStr);

      // If conflicts found, you could send notification or log
      if (report.conflicts_found > 0 && notificationEmail) {
        logger.warn('academic/attendance', `Found ${report.conflicts_found} attendance conflicts on ${dateStr}`, { report });
        // Here you could integrate with email service to send alerts
        // await this.sendConflictNotification(notificationEmail, report);
      }

      return true;
    } catch (error) {
      logger.error('academic/attendance', 'Error in automated conflict detection', error);
      return false;
    }
  }
}