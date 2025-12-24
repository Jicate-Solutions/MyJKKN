import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export class AttendanceFacultySync {
  private static supabase = createClientSupabaseClient();

  /**
   * Syncs faculty data from timetables to attendance records
   * This ensures attendance records always reflect current faculty assignments
   */
  static async syncFacultyForAttendanceRecord(
    attendanceId: string,
    options: {
      updateOnlyIfChanged?: boolean;
      preserveMarkerDetails?: boolean;
    } = {}
  ) {
    const { updateOnlyIfChanged = true, preserveMarkerDetails = true } =
      options;

    try {
      // Get the attendance record
      const { data: attendance, error: fetchError } = await this.supabase
        .from('student_attendance')
        .select('*, timetables!inner(timetable_data)')
        .eq('id', attendanceId)
        .single();

      if (fetchError || !attendance) {
        logger.error('academic/attendance', 'Error fetching attendance', fetchError);
        return { success: false, error: fetchError };
      }

      // Type cast to fix TypeScript inference after React 19 upgrade
      const attendanceData = attendance as { timetables: { timetable_data: any }; attendance_date: string; attendance_data: any };

      const timetableData = attendanceData.timetables.timetable_data;
      const attendanceDate = attendanceData.attendance_date;
      const dayOfWeek = new Date(attendanceDate)
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toUpperCase();

      // Process each period in attendance_data
      const updatedAttendanceData: any = {};
      let hasChanges = false;

      for (const [periodId, periodData] of Object.entries(
        attendanceData.attendance_data
      )) {
        const updatedPeriodData = { ...(periodData as any) };

        // Find the matching slot in timetable
        const dayData = timetableData[dayOfWeek];
        if (!dayData) {
          updatedAttendanceData[periodId] = periodData;
          continue;
        }

        // Find slot by slot_id
        let timetableSlot = null;
        for (const slot of Object.values(dayData)) {
          if ((slot as any).slot_id === periodId) {
            timetableSlot = slot as any;
            break;
          }
        }

        if (!timetableSlot || !timetableSlot.staff_ids?.length) {
          updatedAttendanceData[periodId] = periodData;
          continue;
        }

        // Get current faculty from timetable
        const currentStaffIds = timetableSlot.staff_ids || [];
        const primaryStaffId = timetableSlot.primary_staff_id;

        // Fetch staff details
        const { data: staffMembers } = await this.supabase
          .from('staff')
          .select('id, first_name, last_name, institution_email')
          .in('id', currentStaffIds);

        // Type cast to fix TypeScript inference after React 19 upgrade
        const staffData = staffMembers as { id: string; first_name: string; last_name: string; institution_email: string }[] | null;

        if (!staffData?.length) {
          updatedAttendanceData[periodId] = periodData;
          continue;
        }

        // Build faculty data
        const facultyData = staffData.map((staff) => ({
          faculty_id: staff.id,
          faculty_name: `${staff.first_name} ${staff.last_name}`.trim(),
          faculty_email: staff.institution_email,
          ...(currentStaffIds.length > 1
            ? { is_primary: staff.id === primaryStaffId }
            : {})
        }));

        // Sort to put primary first
        facultyData.sort((a, b) => {
          if ('is_primary' in a && a.is_primary) return -1;
          if ('is_primary' in b && b.is_primary) return 1;
          return 0;
        });

        // Determine if faculty has changed
        const existingFaculty = updatedPeriodData.assigned_faculty;
        const hasChanged =
          JSON.stringify(existingFaculty) !==
          JSON.stringify(
            facultyData.length === 1 ? facultyData[0] : facultyData
          );

        if (hasChanged) {
          hasChanges = true;
          // Update assigned_faculty
          updatedPeriodData.assigned_faculty =
            facultyData.length === 1 ? facultyData[0] : facultyData;

          // Add sync metadata
          updatedPeriodData.faculty_synced_at = new Date().toISOString();
          updatedPeriodData.faculty_sync_source = 'timetable';
        }

        // Preserve marked_by_details if requested
        if (preserveMarkerDetails && updatedPeriodData.marked_by_details) {
          // Keep the original marker details
        }

        updatedAttendanceData[periodId] = updatedPeriodData;
      }

      // Update only if there are changes
      if (!updateOnlyIfChanged || hasChanges) {
        const { error: updateError } = await (this.supabase as any)
          .from('student_attendance')
          .update({
            attendance_data: updatedAttendanceData,
            updated_at: new Date().toISOString()
          })
          .eq('id', attendanceId);

        if (updateError) {
          logger.error('academic/attendance', 'Error updating attendance', updateError);
          return { success: false, error: updateError };
        }

        return {
          success: true,
          hasChanges,
          message: hasChanges
            ? 'Faculty data synced successfully'
            : 'No faculty changes detected'
        };
      }

      return { success: true, hasChanges: false, message: 'No updates needed' };
    } catch (error) {
      logger.error('academic/attendance', 'Error syncing faculty', error);
      return { success: false, error };
    }
  }

  /**
   * Batch sync faculty for multiple attendance records
   * Useful for updating all records after timetable changes
   */
  static async batchSyncFaculty(filters: {
    timetableId?: string;
    dateRange?: { from: string; to: string };
    sectionId?: string;
  }) {
    try {
      let query = (this.supabase as any).from('student_attendance').select('id');

      if (filters.timetableId) {
        query = query.eq('timetable_id', filters.timetableId);
      }
      if (filters.sectionId) {
        query = query.eq('section_id', filters.sectionId);
      }
      if (filters.dateRange) {
        query = query
          .gte('attendance_date', filters.dateRange.from)
          .lte('attendance_date', filters.dateRange.to);
      }

      const { data: records, error } = await query;

      // Type cast to fix TypeScript inference after React 19 upgrade
      const recordsData = records as { id: string }[] | null;

      if (error || !recordsData) {
        return { success: false, error };
      }

      const results = {
        total: recordsData.length,
        synced: 0,
        changed: 0,
        failed: 0
      };

      // Process in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < recordsData.length; i += batchSize) {
        const batch = recordsData.slice(i, i + batchSize);
        const promises = batch.map((record) =>
          this.syncFacultyForAttendanceRecord(record.id as string)
        );

        const batchResults = await Promise.allSettled(promises);

        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            results.synced++;
            if (result.value.hasChanges) {
              results.changed++;
            }
          } else {
            results.failed++;
          }
        });
      }

      return { success: true, results };
    } catch (error) {
      logger.error('academic/attendance', 'Batch sync error', error);
      return { success: false, error };
    }
  }

  /**
   * Check if faculty assignments have changed for a specific period
   * without updating the record
   */
  static async checkFacultyChanges(
    attendanceId: string,
    periodId: string
  ): Promise<{
    hasChanges: boolean;
    currentFaculty?: any;
    newFaculty?: any;
  }> {
    try {
      const { data: attendance } = await this.supabase
        .from('student_attendance')
        .select(
          'attendance_data, attendance_date, timetables!inner(timetable_data)'
        )
        .eq('id', attendanceId)
        .single();

      // Type cast to fix TypeScript inference after React 19 upgrade
      const attendanceRecord = attendance as {
        attendance_data: any;
        attendance_date: string;
        timetables: { timetable_data: any };
      } | null;

      if (!attendanceRecord) {
        return { hasChanges: false };
      }

      const periodData = attendanceRecord.attendance_data[periodId as string];
      if (!periodData) {
        return { hasChanges: false };
      }

      const currentFaculty = periodData.assigned_faculty;

      // Get day and find slot
      const dayOfWeek = new Date(attendanceRecord.attendance_date)
        .toLocaleDateString('en-US', { weekday: 'long' })
        .toUpperCase();

      const dayData = attendanceRecord.timetables.timetable_data[dayOfWeek];
      if (!dayData) {
        return { hasChanges: false, currentFaculty };
      }

      // Find the slot
      let timetableSlot = null;
      for (const slot of Object.values(dayData)) {
        if ((slot as any).slot_id === periodId) {
          timetableSlot = slot as any;
          break;
        }
      }

      if (!timetableSlot?.staff_ids?.length) {
        return { hasChanges: false, currentFaculty };
      }

      // Get new faculty data
      const { data: staffMembers } = await this.supabase
        .from('staff')
        .select('id, first_name, last_name, institution_email')
        .in('id', timetableSlot.staff_ids);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const staffList = staffMembers as { id: string; first_name: string; last_name: string; institution_email: string }[] | null;

      if (!staffList?.length) {
        return { hasChanges: false, currentFaculty };
      }

      const newFaculty = staffList.map((staff) => ({
        faculty_id: staff.id,
        faculty_name: `${staff.first_name} ${staff.last_name}`.trim(),
        faculty_email: staff.institution_email,
        ...(timetableSlot.staff_ids.length > 1
          ? {
              is_primary: staff.id === timetableSlot.primary_staff_id
            }
          : {})
      }));

      const hasChanges =
        JSON.stringify(currentFaculty) !==
        JSON.stringify(newFaculty.length === 1 ? newFaculty[0] : newFaculty);

      return { hasChanges, currentFaculty, newFaculty };
    } catch (error) {
      logger.error('academic/attendance', 'Error checking faculty changes', error);
      return { hasChanges: false };
    }
  }
}
