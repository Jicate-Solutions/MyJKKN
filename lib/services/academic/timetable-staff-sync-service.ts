import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import { logger } from '@/lib/utils/enhanced-logger';

export interface StaffPlanningChange {
  course_id: string;
  course_name: string;
  old_staff_id: string;
  new_staff_id: string;
  old_staff_name: string;
  new_staff_name: string;
  affected_timetables: {
    id: string;
    name: string;
    semester: string;
    section: string;
  }[];
}

export interface TimetableStaffConflict {
  timetable_id: string;
  timetable_name: string;
  semester: string;
  section: string;
  course_id: string;
  course_name: string;
  timetable_staff_id: string;
  timetable_staff_name: string;
  planned_staff_id: string;
  planned_staff_name: string;
  conflict_type: 'STAFF_MISMATCH' | 'NO_STAFF_PLAN' | 'OUTDATED_ASSIGNMENT';
}

export class TimetableStaffSyncService {
  private static supabase = createClientSupabaseClient();

  /**
   * Check for conflicts when staff planning changes
   * Call this when updating staff_plan_courses
   */
  static async checkStaffPlanningImpact(
    courseId: string,
    oldStaffId: string,
    newStaffId: string
  ): Promise<StaffPlanningChange | null> {
    try {
      // Find all timetables that have this course assigned to the old staff
      const { data: conflictingSlots, error } = await (this.supabase as any).rpc(
        'find_timetable_staff_conflicts_for_course',
        {
          p_course_id: courseId,
          p_staff_id: oldStaffId
        }
      );

      if (error) {
        logger.error('academic/timetables', 'Error checking staff planning impact', error);
        return null;
      }

      if (!conflictingSlots || conflictingSlots.length === 0) {
        return null; // No conflicts found
      }

      // Get staff names
      const { data: staffData, error: staffError } = await this.supabase
        .from('staff')
        .select('id, first_name, last_name')
        .in('id', [oldStaffId, newStaffId]);

      if (staffError) throw staffError;

      const oldStaff = staffData?.find(s => s.id === oldStaffId);
      const newStaff = staffData?.find(s => s.id === newStaffId);

      // Get course name
      const { data: courseData, error: courseError } = await this.supabase
        .from('courses')
        .select('course_name')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;

      return {
        course_id: courseId,
        course_name: courseData.course_name,
        old_staff_id: oldStaffId,
        new_staff_id: newStaffId,
        old_staff_name: `${oldStaff?.first_name || ''} ${oldStaff?.last_name || ''}`.trim(),
        new_staff_name: `${newStaff?.first_name || ''} ${newStaff?.last_name || ''}`.trim(),
        affected_timetables: conflictingSlots.map((slot: any) => ({
          id: slot.timetable_id,
          name: slot.timetable_name,
          semester: slot.semester,
          section: slot.section
        }))
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error in checkStaffPlanningImpact', error);
      return null;
    }
  }

  /**
   * Get all current timetable-staff conflicts
   */
  static async getAllTimetableStaffConflicts(): Promise<TimetableStaffConflict[]> {
    try {
      const { data: conflicts, error } = await (this.supabase as any).rpc(
        'get_all_timetable_staff_conflicts'
      );

      if (error) throw error;

      return conflicts || [];
    } catch (error) {
      logger.error('academic/timetables', 'Error getting timetable staff conflicts', error);
      return [];
    }
  }

  /**
   * Update timetable slots to sync with staff planning changes
   */
  static async syncTimetablesToStaffPlanning(
    affectedTimetables: { id: string; name: string; semester: string; section: string }[],
    courseId: string,
    oldStaffId: string,
    newStaffId: string
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const timetable of affectedTimetables) {
      try {
        const { error } = await (this.supabase as any).rpc('sync_timetable_staff_assignment', {
          p_timetable_id: timetable.id,
          p_course_id: courseId,
          p_old_staff_id: oldStaffId,
          p_new_staff_id: newStaffId
        });

        if (error) {
          failed++;
          errors.push(`${timetable.name}: ${error.message}`);
        } else {
          success++;
        }
      } catch (error) {
        failed++;
        errors.push(`${timetable.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { success, failed, errors };
  }

  /**
   * Show user notification about staff planning conflicts
   */
  static showStaffPlanningConflictNotification(change: StaffPlanningChange) {
    const message = `⚠️ Staff Planning Change Impact

Course: ${change.course_name}
Changed from: ${change.old_staff_name}
Changed to: ${change.new_staff_name}

This affects ${change.affected_timetables.length} timetable(s):
${change.affected_timetables.map(t => `• ${t.name} (${t.semester} - ${t.section})`).join('\n')}

Would you like to update the affected timetables automatically?`;

    return new Promise<boolean>((resolve) => {
      // You can integrate this with your UI notification system
      const userChoice = confirm(message + '\n\nClick OK to auto-update, Cancel to handle manually.');
      resolve(userChoice);
    });
  }

  /**
   * Main method to handle staff planning changes with user interaction
   */
  static async handleStaffPlanningChange(
    courseId: string,
    oldStaffId: string,
    newStaffId: string
  ): Promise<void> {
    try {
      // Check impact
      const impact = await this.checkStaffPlanningImpact(courseId, oldStaffId, newStaffId);
      
      if (!impact || impact.affected_timetables.length === 0) {
        toast.success('Staff planning updated successfully. No timetable conflicts found.');
        return;
      }

      // Show notification and get user choice
      const shouldAutoUpdate = await this.showStaffPlanningConflictNotification(impact);

      if (shouldAutoUpdate) {
        // Auto-update timetables
        const result = await this.syncTimetablesToStaffPlanning(
          impact.affected_timetables,
          courseId,
          oldStaffId,
          newStaffId
        );

        if (result.success > 0) {
          toast.success(
            `✅ Staff planning updated!\n\n• ${result.success} timetable(s) updated automatically${
              result.failed > 0 ? `\n• ${result.failed} timetable(s) need manual attention` : ''
            }`
          );
        }

        if (result.failed > 0) {
          toast.error(
            `⚠️ Some timetables could not be updated automatically:\n\n${result.errors.slice(0, 3).join('\n')}${
              result.errors.length > 3 ? `\n... and ${result.errors.length - 3} more` : ''
            }`
          );
        }
      } else {
        // User chose manual handling
        toast.success(
          `📋 Staff planning updated. ${impact.affected_timetables.length} timetable(s) need manual review:\n\n${impact.affected_timetables.map(t => t.name).slice(0, 3).join(', ')}${
            impact.affected_timetables.length > 3 ? '...' : ''
          }`
        );
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error handling staff planning change', error);
      toast.error('Failed to process staff planning change. Please check manually.');
    }
  }
}