import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  StudentAttendance,
  CreateStudentAttendanceDto,
  UpdateStudentAttendanceDto,
  BatchUpdateAttendanceDto,
  AttendanceFilters,
  AttendanceListResponse,
  AttendanceRosterData,
  AttendanceRosterStudent,
  AttendancePeriodOption,
  AttendanceStudent,
  ConsolidatedStudentAttendance,
  ConsolidatedAttendanceData,
  ConsolidatedAttendanceStudent,
  CreateConsolidatedAttendanceDto,
  UpdateConsolidatedAttendanceDto,
  UpsertConsolidatedAttendanceDto
} from '@/types/attendance';
import type { DayOfWeek } from '@/types/academics';

/**
 * IMPORTANT NOTE: This service is currently under refactoring due to timetable structure changes.
 *
 * The timetable structure has been migrated from normalized tables (timetable_slots, timetable_periods)
 * to a JSON-based structure stored in timetables.timetable_data.
 *
 * Many methods in this service still reference the old structure and may not work correctly.
 *
 * TODO: Major refactor needed to update all methods to work with the new JSON-based timetable structure.
 *
 * AFFECTED METHODS:
 * - getSlotDetails()
 * - getTimetableSlotsForDate()
 * - getAvailablePeriodsForDate()
 * - canMarkAttendanceForSlot()
 * - And many others that query timetable_slots table
 */
export class AttendanceService {
  private static supabase = createClientSupabaseClient();

  // =====================
  // NEW CONSOLIDATED ATTENDANCE METHODS
  // =====================

  // Get consolidated attendance record for a specific timetable, section, and date
  static async getConsolidatedAttendance(
    timetable_id: string,
    section_id: string,
    attendance_date: string
  ): Promise<ConsolidatedStudentAttendance | null> {
    let resolvedSectionId = section_id;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (resolvedSectionId && !uuidRegex.test(resolvedSectionId)) {
      // Not a UUID, assume it's a name and try to resolve it
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select('program_id')
        .eq('id', timetable_id)
        .single();

      if (timetableError || !timetableData) {
        console.error(
          `Error fetching timetable ${timetable_id} to resolve section name`,
          timetableError
        );
        return null;
      }

      const { data: sectionData, error: sectionError } = await this.supabase
        .from('sections')
        .select('id')
        .eq('program_id', timetableData.program_id)
        .eq('section_name', resolvedSectionId)
        .limit(1)
        .single();

      if (sectionError || !sectionData) {
        console.error(
          `Could not resolve section name "${resolvedSectionId}" to an ID for program ${timetableData.program_id}`,
          sectionError
        );
        return null; // Return null to avoid crash
      }

      resolvedSectionId = sectionData.id;
    }

    if (!resolvedSectionId) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('student_attendance')
      .select(
        `
        id,
        timetable_id,
        section_id,
        attendance_date,
        attendance_data,
        marked_by,
        institution_id,
        created_at,
        updated_at,
        marked_by_profile:profiles!marked_by(id, email, full_name)
      `
      )
      .eq('timetable_id', timetable_id)
      .eq('section_id', resolvedSectionId)
      .eq('attendance_date', attendance_date)
      .maybeSingle();

    // Debugging logs to understand what's being passed
    console.log('Fetching consolidated attendance with:', {
      timetable_id,
      section_id: resolvedSectionId,
      attendance_date
    });

    if (error) {
      console.error('Error fetching consolidated attendance:', error);
      throw error;
    }

    if (data) {
      console.log('Found consolidated attendance:', data);
    } else {
      console.log('No consolidated attendance found.');
    }

    return data as ConsolidatedStudentAttendance | null;
  }

  // Get consolidated attendance records by section and date (regardless of timetable_id)
  static async getConsolidatedAttendanceByDateAndSection(
    section_id: string,
    attendance_date: string
  ): Promise<ConsolidatedStudentAttendance[]> {
    try {
      const { data, error } = await this.supabase
        .from('student_attendance')
        .select(
          `
          id,
          timetable_id,
          section_id,
          attendance_date,
          attendance_data,
          marked_by,
          institution_id,
          created_at,
          updated_at,
          marked_by_profile:profiles!marked_by(
            id,
            email,
            full_name
          )
        `
        )
        .eq('section_id', section_id)
        .eq('attendance_date', attendance_date);

      if (error) {
        console.error('Error fetching attendance by date and section:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map((record) => ({
        ...record,
        marked_by_profile: Array.isArray(record.marked_by_profile)
          ? record.marked_by_profile[0]
          : record.marked_by_profile
      })) as unknown as ConsolidatedStudentAttendance[];
    } catch (error) {
      console.error(
        'Error fetching consolidated attendance by date and section:',
        error
      );
      return [];
    }
  }

  // Check if a slot has version history
  static async getSlotVersionInfo(slot_id: string): Promise<{
    hasVersions: boolean;
    currentVersion: number;
    totalVersions: number;
    changeHistory: any[];
  }> {
    try {
      // First check if the slot has continuity tracking
      const { data: continuityCheck, error: checkError } = await this.supabase
        .from('timetable_slot_continuity')
        .select('continuity_group_id')
        .eq('slot_id', slot_id)
        .single();

      if (checkError || !continuityCheck?.continuity_group_id) {
        // No continuity tracking for this slot
        return {
          hasVersions: false,
          currentVersion: 1,
          totalVersions: 1,
          changeHistory: []
        };
      }

      // Get all versions in the continuity group
      const { data: continuityData, error } = await this.supabase
        .from('timetable_slot_continuity')
        .select(
          `
          *,
          changed_by_user:profiles!changed_by(
            full_name,
            email
          )
        `
        )
        .eq('continuity_group_id', continuityCheck.continuity_group_id)
        .order('version_number', { ascending: false });

      if (error || !continuityData || continuityData.length === 0) {
        return {
          hasVersions: false,
          currentVersion: 1,
          totalVersions: 1,
          changeHistory: []
        };
      }

      const currentSlot = continuityData.find(
        (c) => c.timetable_slot_id === slot_id
      );
      const currentVersion = currentSlot?.version_number || 1;

      return {
        hasVersions: true,
        currentVersion,
        totalVersions: continuityData.length,
        changeHistory: continuityData.map((c) => ({
          version: c.version_number,
          validFrom: c.valid_from,
          validUntil: c.valid_until,
          changeReason: c.change_reason,
          changedBy: c.changed_by_user,
          isCurrent: c.is_current
        }))
      };
    } catch (error) {
      console.error('Error getting slot version info:', error);
      return {
        hasVersions: false,
        currentVersion: 1,
        totalVersions: 1,
        changeHistory: []
      };
    }
  }

  static async getSlotAttendanceWithHistory(
    slot_id: string,
    section_id: string,
    start_date?: string,
    end_date?: string
  ): Promise<any[]> {
    try {
      const timetableId = await this.getTimetableIdFromSlot(slot_id);
      if (!timetableId) {
        throw new Error(`Could not find timetable for slot_id: ${slot_id}`);
      }

      let resolvedSectionId = section_id;
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (resolvedSectionId && !uuidRegex.test(resolvedSectionId)) {
        const { data: timetableData, error: timetableError } =
          await this.supabase
            .from('timetables')
            .select('program_id')
            .eq('id', timetableId)
            .single();

        if (timetableError || !timetableData) {
          throw new Error(
            `Error fetching timetable ${timetableId} to resolve section name`
          );
        }

        const { data: sectionData, error: sectionError } = await this.supabase
          .from('sections')
          .select('id')
          .eq('program_id', timetableData.program_id)
          .eq('section_name', resolvedSectionId)
          .limit(1)
          .single();

        if (sectionError || !sectionData) {
          console.error(
            `Could not resolve section name "${resolvedSectionId}" to an ID for program ${timetableData.program_id}`,
            sectionError
          );
          return []; // Return empty to avoid crash
        }
        resolvedSectionId = sectionData.id;
      }

      if (!resolvedSectionId) {
        return [];
      }

      console.log('Checking for slot versions with slot_id:', slot_id);

      // Check if this slot has versions by querying the continuity table directly
      // Since the RPC function has a bug, we'll implement the logic here
      const { data: continuityData, error: continuityError } =
        await this.supabase
          .from('timetable_slot_continuity')
          .select('continuity_group_id')
          .eq('timetable_slot_id', slot_id)
          .limit(1)
          .single();

      let hasVersions = false;

      if (!continuityError && continuityData?.continuity_group_id) {
        // Check if there are multiple slots in this continuity group
        const { data: groupSlots, error: groupError } = await this.supabase
          .from('timetable_slot_continuity')
          .select('id')
          .eq('continuity_group_id', continuityData.continuity_group_id);

        if (!groupError && groupSlots && groupSlots.length > 1) {
          hasVersions = true;
        }
      }

      console.log('Slot has versions:', hasVersions);

      if (hasVersions) {
        // Logic for versioned slots - get timetable_id from slot
        const timetableId = await this.getTimetableIdFromSlot(slot_id);
        if (!timetableId) {
          console.error('Could not get timetable_id for slot:', slot_id);
          return this.getSlotAttendanceDirectly(
            slot_id,
            resolvedSectionId,
            start_date,
            end_date
          );
        }

        const { data, error } = await this.supabase
          .from('student_attendance')
          .select(
            '*, marked_by_profile:profiles!marked_by(id, email, full_name)'
          )
          .eq('timetable_id', timetableId)
          .eq('section_id', resolvedSectionId)
          .gte('attendance_date', start_date)
          .lte('attendance_date', end_date)
          .order('attendance_date', { ascending: false });

        if (error) {
          console.error('Error fetching attendance with versions:', error);
          throw error;
        }
        return data || [];
      }

      // Fallback for non-versioned slots or if RPC returns no data
      return this.getSlotAttendanceDirectly(
        slot_id,
        resolvedSectionId,
        start_date,
        end_date
      );
    } catch (error) {
      console.error('Error in getSlotAttendanceWithHistory:', error);
      return [];
    }
  }

  // Direct method for getting slot attendance (fallback)
  private static async getSlotAttendanceDirectly(
    slot_id: string,
    section_id: string,
    start_date?: string,
    end_date?: string
  ): Promise<any[]> {
    try {
      console.log('getSlotAttendanceDirectly called with:', {
        slot_id,
        section_id,
        start_date,
        end_date
      });

      let query = this.supabase
        .from('student_attendance')
        .select(
          `
          id,
          attendance_date,
          attendance_data,
          marked_by,
          created_at,
          updated_at,
          marked_by_profile:profiles!marked_by(
            id,
            email,
            full_name
          )
        `
        )
        .eq('section_id', section_id);

      // Add timetable_id filter if available (get from slot_id)
      if (slot_id) {
        const timetableId = await this.getTimetableIdFromSlot(slot_id);
        if (timetableId) {
          query = query.eq('timetable_id', timetableId);
        }
      }

      if (start_date) {
        query = query.gte('attendance_date', start_date);
      }
      if (end_date) {
        query = query.lte('attendance_date', end_date);
      }

      const { data, error } = await query;

      if (error || !data) {
        return [];
      }

      const attendanceRecords: any[] = [];

      data.forEach((record) => {
        const attendanceData = record.attendance_data as any;

        // Check if this slot exists in the attendance data
        if (attendanceData[slot_id]) {
          const period = attendanceData[slot_id];
          attendanceRecords.push({
            attendance_id: record.id,
            attendance_date: record.attendance_date,
            slot_id,
            period_name: period.period_name,
            course_name: period.course_name,
            start_time: period.start_time,
            end_time: period.end_time,
            student_count: period.students ? period.students.length : 0,
            marked_by: record.marked_by_profile,
            marked_at: record.created_at,
            students: period.students || []
          });
        }
      });

      return attendanceRecords.sort(
        (a, b) =>
          new Date(b.attendance_date).getTime() -
          new Date(a.attendance_date).getTime()
      );
    } catch (error) {
      console.error('Error in direct slot attendance fetch:', error);
      return [];
    }
  }

  // Upsert consolidated attendance record
  static async upsertConsolidatedAttendance(
    data: UpsertConsolidatedAttendanceDto
  ): Promise<ConsolidatedStudentAttendance> {
    try {
      // First, try to find existing consolidated record
      const { data: existingRecord, error: findError } = await this.supabase
        .from('student_attendance')
        .select('id')
        .eq('institution_id', data.institution_id)
        .eq('timetable_id', data.timetable_id)
        .eq('section_id', data.section_id)
        .eq('attendance_date', data.attendance_date)
        .maybeSingle();

      if (findError) {
        console.error('Error finding existing attendance record:', findError);
        throw findError;
      }

      let result;
      if (existingRecord) {
        // Update existing record
        const { data: updateResult, error: updateError } = await this.supabase
          .from('student_attendance')
          .update({
            attendance_data: data.attendance_data,
            marked_by: data.marked_by,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecord.id)
          .select(
            `
            id,
            timetable_id,
            section_id,
            attendance_date,
            attendance_data,
            marked_by,
            institution_id,
            created_at,
            updated_at
          `
          )
          .single();

        if (updateError) throw updateError;
        result = updateResult;
      } else {
        // Create new record
        const { data: insertResult, error: insertError } = await this.supabase
          .from('student_attendance')
          .insert({
            timetable_id: data.timetable_id,
            section_id: data.section_id,
            attendance_date: data.attendance_date,
            attendance_data: data.attendance_data,
            marked_by: data.marked_by,
            institution_id: data.institution_id,
            updated_at: new Date().toISOString()
          })
          .select(
            `
            id,
            timetable_id,
            section_id,
            attendance_date,
            attendance_data,
            marked_by,
            institution_id,
            created_at,
            updated_at
          `
          )
          .single();

        if (insertError) throw insertError;
        result = insertResult;
      }

      return result as ConsolidatedStudentAttendance;
    } catch (error) {
      console.error('Error upserting consolidated attendance:', error);
      throw error;
    }
  }

  // Get attendance roster data using consolidated structure
  static async getConsolidatedAttendanceRoster(
    timetable_id: string,
    section_id: string,
    attendance_date: string,
    studentFilters: {
      institution_id: string;
      degree_id?: string;
      program_id?: string;
      department_id?: string;
      semester_id?: string;
    }
  ): Promise<{
    students: AttendanceRosterStudent[];
    timetable: any;
    section: any;
    attendance_date: string;
    consolidated_record?: ConsolidatedStudentAttendance;
  }> {
    try {
      // Get timetable details
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select(
          `
          id,
          timetable_name,
          start_date,
          end_date,
          degree:degree_id(
            id,
            degree_name
          ),
          program:program_id(
            id,
            program_name
          ),
          department:department_id(
            id,
            department_name
          )
        `
        )
        .eq('id', timetable_id)
        .single();

      if (timetableError) throw timetableError;

      // Get section details
      const { data: sectionData, error: sectionError } = await this.supabase
        .from('sections')
        .select('id, section_name')
        .eq('id', section_id)
        .single();

      if (sectionError) throw sectionError;

      // Get students for this section
      let studentsQuery = this.supabase
        .from('students')
        .select(
          `
          id,
          first_name,
          last_name,
          roll_number,
          student_photo_url,
          institution_id,
          degree_id,
          program_id,
          department_id,
          semester_id,
          section_id,
          status
        `
        )
        .eq('status', 'active')
        .eq('institution_id', studentFilters.institution_id)
        .eq('section_id', section_id);

      // Apply other filters if provided
      if (studentFilters.degree_id) {
        studentsQuery = studentsQuery.eq('degree_id', studentFilters.degree_id);
      }

      if (studentFilters.program_id) {
        studentsQuery = studentsQuery.eq(
          'program_id',
          studentFilters.program_id
        );
      }

      if (studentFilters.department_id) {
        studentsQuery = studentsQuery.eq(
          'department_id',
          studentFilters.department_id
        );
      }

      if (studentFilters.semester_id) {
        studentsQuery = studentsQuery.eq(
          'semester_id',
          studentFilters.semester_id
        );
      }

      studentsQuery = studentsQuery.order('roll_number', { ascending: true });

      const { data: students, error: studentsError } = await studentsQuery;

      if (studentsError) throw studentsError;

      // Get existing consolidated attendance record
      // Only check for the specific timetable_id to avoid showing attendance marked for other periods
      const consolidatedRecord = await this.getConsolidatedAttendance(
        timetable_id,
        section_id,
        attendance_date
      );

      // Note: Removed fallback logic that was showing attendance from other periods
      // This was causing faculty attendance to show as marked for all periods on the same date

      // Build roster students with attendance status from consolidated record
      const rosterStudents: AttendanceRosterStudent[] = (students || []).map(
        (student) => {
          let status: 'Present' | 'Absent' = 'Present'; // Default to Present
          let attendance_id: string | undefined = undefined;

          // Check if student has attendance in any period of the consolidated record
          if (consolidatedRecord?.attendance_data) {
            const attendanceData =
              consolidatedRecord.attendance_data as ConsolidatedAttendanceData;

            // Look through all periods to find this student
            // Since we may have different slot IDs for the same period, check all periods
            for (const [slotId, periodData] of Object.entries(attendanceData)) {
              const studentRecord = (periodData as any).students?.find(
                (s: ConsolidatedAttendanceStudent) =>
                  s.student_id === student.id
              );

              if (studentRecord) {
                status = studentRecord.status;
                attendance_id = consolidatedRecord.id;
                break; // Found the student, use their status
              }
            }

            // If no student record found but attendance exists, default to Present
            // This handles edge cases where student list might have changed
            if (!attendance_id && Object.keys(attendanceData).length > 0) {
              // Attendance was marked but this student wasn't in the list
              // This could happen if student was added to section after attendance was marked
              status = 'Present'; // Default for safety
            }
          }

          return {
            id: student.id,
            first_name: student.first_name || 'Unknown',
            last_name: student.last_name || '',
            roll_number: student.roll_number,
            student_photo_url: student.student_photo_url,
            status,
            attendance_id
          };
        }
      );

      return {
        students: rosterStudents,
        timetable: timetableData,
        section: sectionData,
        attendance_date,
        consolidated_record: consolidatedRecord || undefined
      };
    } catch (error) {
      console.error('Error fetching consolidated attendance roster:', error);
      throw error;
    }
  }

  // Batch update consolidated attendance
  static async batchUpdateConsolidatedAttendance(
    timetable_id: string,
    section_id: string,
    attendance_date: string,
    attendance_data: ConsolidatedAttendanceData,
    marked_by: string,
    institution_id: string
  ): Promise<void> {
    try {
      await this.upsertConsolidatedAttendance({
        timetable_id,
        section_id,
        attendance_date,
        attendance_data,
        marked_by,
        institution_id
      });

      toast.success('Attendance saved successfully');
    } catch (error) {
      console.error('Error batch updating consolidated attendance:', error);
      toast.error('Failed to save attendance');
      throw error;
    }
  }

  // Get attendance summary for a date range
  static async getAttendanceSummary(filters: {
    institution_id: string;
    timetable_id?: string;
    section_id?: string;
    start_date: string;
    end_date: string;
  }): Promise<{
    total_days: number;
    total_students: number;
    total_present: number;
    total_absent: number;
    attendance_percentage: number;
  }> {
    try {
      let query = this.supabase
        .from('student_attendance')
        .select('attendance_data, attendance_date')
        .eq('institution_id', filters.institution_id)
        .is('student_id', null) // Only consolidated records
        .gte('attendance_date', filters.start_date)
        .lte('attendance_date', filters.end_date);

      if (filters.timetable_id) {
        query = query.eq('timetable_id', filters.timetable_id);
      }

      if (filters.section_id) {
        query = query.eq('section_id', filters.section_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalStudents = 0;
      const uniqueDates = new Set<string>();

      (data || []).forEach((record) => {
        uniqueDates.add(record.attendance_date);
        const attendanceData =
          record.attendance_data as ConsolidatedAttendanceData;

        for (const [slotId, periodData] of Object.entries(attendanceData)) {
          (periodData as any).students?.forEach(
            (student: ConsolidatedAttendanceStudent) => {
              totalStudents++;
              if (student.status === 'Present') {
                totalPresent++;
              } else {
                totalAbsent++;
              }
            }
          );
        }
      });

      const attendancePercentage =
        totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0;

      return {
        total_days: uniqueDates.size,
        total_students: totalStudents,
        total_present: totalPresent,
        total_absent: totalAbsent,
        attendance_percentage: Math.round(attendancePercentage * 100) / 100
      };
    } catch (error) {
      console.error('Error fetching attendance summary:', error);
      throw error;
    }
  }

  // Helper method to get timetable ID from slot ID
  // Note: With the new JSON structure, this method searches through timetable_data
  static async getTimetableIdFromSlot(slotId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select('id, timetable_data')
        .not('timetable_data', 'is', null);

      if (error) {
        console.error('Error getting timetable ID from slot:', error);
        return null;
      }

      // Search through all timetables to find the one containing this slot ID
      for (const timetable of data) {
        if (!timetable.timetable_data) continue;

        // Search through all days and periods in the JSON structure
        for (const [dayKey, dayData] of Object.entries(
          timetable.timetable_data
        )) {
          if (typeof dayData === 'object' && dayData !== null) {
            for (const [periodKey, slotData] of Object.entries(
              dayData as Record<string, any>
            )) {
              if (
                typeof slotData === 'object' &&
                slotData !== null &&
                (slotData as any).slot_id === slotId
              ) {
                return timetable.id;
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting timetable ID from slot:', error);
      return null;
    }
  }

  // Helper method to get slot details including period and course
  // TODO: This method needs to be updated to work with the new JSON-based timetable structure
  // For now, this method is deprecated and may not work correctly
  static async getSlotDetails(slotId: string): Promise<any> {
    try {
      console.log('getSlotDetails called with slotId:', slotId);

      // This method needs to be rewritten to work with the new timetable_data JSON structure
      // For now, return a placeholder to prevent crashes
      console.warn(
        'getSlotDetails method is deprecated and needs updating for new timetable structure'
      );
      return null;

      /*
      // OLD CODE - NEEDS UPDATING
      const { data, error } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          id,
          timetable_id,
          day_of_week,
          period:period_id(
            id,
            period_name,
            start_time,
            end_time
          ),
          course:course_id(
            id,
            course_name,
            course_code
          )
        `
        )
        .eq('id', slotId)
        .single();

      if (error) {
        console.error('Error getting slot details:', error);
        return null;
      }

      return data;
      */
    } catch (error) {
      console.error('Error getting slot details:', error);
      return null;
    }
  }

  // =====================
  // LEGACY METHODS (for backward compatibility)
  // =====================

  // Get students for attendance based on filters
  static async getStudentsForAttendance(filters: {
    institution_id: string;
    degree_id?: string;
    program_id?: string;
    department_id?: string;
    semester_id?: string;
    section_id?: string;
  }): Promise<AttendanceStudent[]> {
    try {
      let query = this.supabase
        .from('students')
        .select(
          `
          id,
          first_name,
          last_name,
          roll_number,
          student_photo_url,
          institution_id,
          degree_id,
          program_id,
          department_id,
          semester_id,
          section_id,
          status
        `
        )
        .eq('status', 'active')
        .eq('institution_id', filters.institution_id);

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      if (filters.section_id) {
        query = query.eq('section_id', filters.section_id);
      }

      query = query.order('roll_number', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      // Transform the data to include student_name constructed from first_name and last_name
      return (data || []).map((student: any) => ({
        ...student,
        student_name:
          `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
          'Unknown Student'
      })) as AttendanceStudent[];
    } catch (error) {
      console.error('Error fetching students for attendance:', error);
      throw error;
    }
  }

  // Get timetable slots for a specific date and filters
  static async getTimetableSlotsForDate(
    filters: {
      institution_id: string;
      academic_year_id: string;
      degree_id: string;
      program_id: string;
      department_id: string;
      semester: string | number;
      section?: string;
    },
    date: string
  ): Promise<any[]> {
    try {
      // First, convert semester_id to semester_name if it's a UUID
      let semesterFilter = filters.semester;

      // Check if semester is a UUID (if it contains hyphens and is 36 chars)
      if (
        typeof filters.semester === 'string' &&
        filters.semester.includes('-') &&
        filters.semester.length === 36
      ) {
        const { data: semesterData, error: semesterError } = await this.supabase
          .from('semesters')
          .select('semester_name')
          .eq('id', filters.semester)
          .single();

        if (semesterError) {
          console.error('Error fetching semester name:', semesterError);
          throw semesterError;
        }

        semesterFilter = semesterData.semester_name;
      }

      // First, find the active timetable for the given filters that includes the selected date
      console.log('Searching for timetable with date:', date);
      console.log('Filters:', {
        institution_id: filters.institution_id,
        academic_year_id: filters.academic_year_id,
        degree_id: filters.degree_id,
        program_id: filters.program_id,
        department_id: filters.department_id,
        semester: semesterFilter
      });

      const timetableQuery = this.supabase
        .from('timetables')
        .select('id, start_date, end_date, timetable_name')
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('semester', semesterFilter) // Use converted semester name
        .eq('is_active', true)
        .lte('start_date', date) // start_date <= selected date
        .gte('end_date', date); // end_date >= selected date

      // Note: section filter removed as sections are at slot level, not timetable level

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) {
        console.error('Timetable query error:', timetableError);
        throw timetableError;
      }

      console.log('Found timetables:', timetables?.length || 0);
      if (timetables && timetables.length > 0) {
        console.log('Timetable date range:', {
          start_date: timetables[0].start_date,
          end_date: timetables[0].end_date,
          selected_date: date
        });
      }

      if (!timetables || timetables.length === 0) {
        console.log('No active timetable found for date:', date);

        // Debug: Check all timetables for this configuration
        const { data: allTimetables, error: allError } = await this.supabase
          .from('timetables')
          .select('id, start_date, end_date, timetable_name, is_active')
          .eq('institution_id', filters.institution_id)
          .eq('academic_year_id', filters.academic_year_id)
          .eq('degree_id', filters.degree_id)
          .eq('program_id', filters.program_id)
          .eq('department_id', filters.department_id)
          .eq('semester', semesterFilter);

        if (!allError && allTimetables) {
          console.log('All timetables for this configuration:', allTimetables);
        }

        return [];
      }

      const timetableId = timetables[0].id;

      // Determine day of week from date
      const dayOfWeek = this.getDayOfWeekFromDate(date);
      console.log('Day of week for date', date, 'is:', dayOfWeek);

      // Get timetable slots using the new JSON structure
      const { data: slots, error: slotsError } = await this.supabase.rpc(
        'get_timetable_slots_for_day_or_date',
        {
          p_timetable_id: timetableId,
          p_day_of_week: dayOfWeek,
          p_slot_date: null
        }
      );

      if (slotsError) {
        console.error('Slots query error:', slotsError);
        throw slotsError;
      }

      // Filter out break slots to only get class periods
      const classSlots = (slots || []).filter(
        (slot: any) => !slot.is_break_slot
      );

      console.log('Found slots before filtering:', slots?.length || 0);
      console.log('Class slots (non-break):', classSlots?.length || 0);

      // Filter slots based on section if specified
      let filteredSlots = classSlots || [];

      if (filters.section) {
        filteredSlots = filteredSlots.filter((slot: any) =>
          slot.sections?.some((section: any) => section.id === filters.section)
        );
      }

      // Only return slots that have at least one section assigned
      filteredSlots = filteredSlots.filter(
        (slot: any) => slot.sections && slot.sections.length > 0
      );

      // Fetch staff assignments from junction table for each slot
      for (const slot of filteredSlots) {
        try {
          const { data: staffAssignments, error: staffError } =
            await this.supabase
              .from('timetable_slot_staff')
              .select(
                `
              staff_id,
              staff:staff(
                id,
                first_name,
                last_name
              )
            `
              )
              .eq('timetable_slot_id', slot.id);

          if (staffError) {
            console.error(
              'Error fetching staff assignments for slot:',
              slot.id,
              staffError
            );
          } else {
            // Add staff_members array to slot (cast to any to avoid TypeScript error)
            (slot as any).staff_members =
              staffAssignments?.map((sa: any) => sa.staff).filter(Boolean) ||
              [];
          }
        } catch (error) {
          console.error('Error fetching staff assignments:', error);
        }
      }

      // Sort by period start time
      filteredSlots.sort((a: any, b: any) => {
        const timeA = a.period?.start_time || '';
        const timeB = b.period?.start_time || '';
        return timeA.localeCompare(timeB);
      });

      console.log(
        `Found ${filteredSlots.length} periods for ${date} (${dayOfWeek})`
      );

      return filteredSlots as unknown as any[];
    } catch (error) {
      console.error('Error fetching timetable slots for date:', error);
      throw error;
    }
  }

  // Get attendance records for a specific slot and date
  // NOTE: This method is deprecated and returns empty array since we moved to consolidated approach
  static async getAttendanceRecords(
    timetable_slot_id: string,
    attendance_date: string
  ): Promise<StudentAttendance[]> {
    try {
      // Since we moved to consolidated attendance, individual records no longer exist
      // Return empty array to indicate no existing attendance in old format
      console.log(
        'getAttendanceRecords called - returning empty array (consolidated approach active)'
      );
      return [];
    } catch (error) {
      console.error('Error fetching attendance records:', error);
      throw error;
    }
  }

  // Get attendance roster data for a specific slot and date
  static async getAttendanceRoster(
    timetable_slot_id: string,
    attendance_date: string,
    studentFilters: {
      institution_id: string;
      degree_id?: string;
      program_id?: string;
      department_id?: string;
      semester_id?: string;
      section_id?: string;
    }
  ): Promise<AttendanceRosterData> {
    try {
      let resolvedSectionId = studentFilters.section_id;
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Resolve section name to ID if needed
      if (
        resolvedSectionId &&
        !uuidRegex.test(resolvedSectionId) &&
        studentFilters.program_id
      ) {
        const { data: sectionData, error: sectionError } = await this.supabase
          .from('sections')
          .select('id')
          .eq('program_id', studentFilters.program_id)
          .eq('section_name', resolvedSectionId)
          .limit(1)
          .single();

        if (sectionError || !sectionData) {
          console.error(
            `Could not resolve section name "${resolvedSectionId}" to an ID for program ${studentFilters.program_id}`,
            sectionError
          );
          // Proceed with original (likely incorrect) ID, or could throw error
        } else {
          resolvedSectionId = sectionData.id;
        }
      }

      const { data: slot, error: slotError } = await this.supabase
        .from('timetable_slots')
        .select(
          `
          id,
          day_of_week,
          period:period_id(
            id,
            period_name,
            start_time,
            end_time
          ),
          course:course_id(
            id,
            course_name,
            course_code
          ),
          timetable_slot_staff(
            staff_id,
            staff:staff(
              id,
              first_name,
              last_name
            )
          ),
          timetable_slot_sections(
            section_id,
            section:section_id(
              id,
              section_name
            )
          )
        `
        )
        .eq('id', timetable_slot_id)
        .single();

      if (slotError) throw slotError;

      // Fetch staff assignments from junction table for this slot
      try {
        const { data: staffAssignments, error: staffError } =
          await this.supabase
            .from('timetable_slot_staff')
            .select(
              `
            staff_id,
            staff:staff(
              id,
              first_name,
              last_name
            )
          `
            )
            .eq('timetable_slot_id', timetable_slot_id);

        if (staffError) {
          console.error(
            'Error fetching staff assignments for slot:',
            timetable_slot_id,
            staffError
          );
        } else {
          // Add staff_members array to slot (cast to any to avoid TypeScript error)
          (slot as any).staff_members =
            staffAssignments?.map((sa: any) => sa.staff).filter(Boolean) || [];
        }
      } catch (error) {
        console.error('Error fetching staff assignments:', error);
      }

      // Get section IDs assigned to this slot
      const sectionIds =
        slot.timetable_slot_sections?.map((tss: any) => tss.section_id) || [];

      if (sectionIds.length === 0) {
        console.warn(
          'No sections assigned to timetable slot:',
          timetable_slot_id
        );
        return {
          students: [],
          timetable_slot: {
            ...slot,
            timetable_slot_sections: undefined // Remove from final output
          } as unknown as AttendanceRosterData['timetable_slot'],
          attendance_date
        };
      }

      // Get students for the sections assigned to this slot
      let studentsQuery = this.supabase
        .from('students')
        .select(
          `
          id,
          first_name,
          last_name,
          roll_number,
          student_photo_url,
          institution_id,
          degree_id,
          program_id,
          department_id,
          semester_id,
          section_id,
          status
        `
        )
        .eq('status', 'active')
        .eq('institution_id', studentFilters.institution_id)
        .in('section_id', sectionIds); // Filter by sections assigned to the slot

      // Apply other filters if provided
      if (studentFilters.degree_id) {
        studentsQuery = studentsQuery.eq('degree_id', studentFilters.degree_id);
      }

      if (studentFilters.program_id) {
        studentsQuery = studentsQuery.eq(
          'program_id',
          studentFilters.program_id
        );
      }

      if (studentFilters.department_id) {
        studentsQuery = studentsQuery.eq(
          'department_id',
          studentFilters.department_id
        );
      }

      if (studentFilters.semester_id) {
        studentsQuery = studentsQuery.eq(
          'semester_id',
          studentFilters.semester_id
        );
      }

      studentsQuery = studentsQuery.order('roll_number', { ascending: true });

      const { data: students, error: studentsError } = await studentsQuery;

      if (studentsError) throw studentsError;

      // Get existing attendance records
      const attendanceRecords = await this.getAttendanceRecords(
        timetable_slot_id,
        attendance_date
      );

      // Create attendance record map for quick lookup
      const attendanceMap = new Map(
        attendanceRecords.map((record) => [record.student_id, record])
      );

      // Build roster students with attendance status
      const rosterStudents: AttendanceRosterStudent[] = (students || []).map(
        (student) => {
          const attendanceRecord = attendanceMap.get(student.id);
          return {
            id: student.id,
            first_name: student.first_name || 'Unknown',
            last_name: student.last_name || '',
            roll_number: student.roll_number,
            student_photo_url: student.student_photo_url,
            status: attendanceRecord ? attendanceRecord.status : 'Present', // Default to Present
            attendance_id: attendanceRecord?.id
          };
        }
      );

      return {
        students: rosterStudents,
        timetable_slot: {
          ...slot,
          timetable_slot_sections: undefined // Remove from final output
        } as unknown as AttendanceRosterData['timetable_slot'],
        attendance_date
      };
    } catch (error) {
      console.error('Error fetching attendance roster:', error);
      throw error;
    }
  }

  // Get available periods for a specific date and context with staff-based filtering
  static async getAvailablePeriodsForDate(
    filters: {
      institution_id: string;
      academic_year_id: string;
      degree_id: string;
      program_id: string;
      department_id: string;
      semester: string | number;
      section?: string;
    },
    date: string,
    options: {
      filterByStaffAssignment?: boolean;
      isSuperAdmin?: boolean;
    } = {}
  ): Promise<AttendancePeriodOption[]> {
    try {
      console.log('getAvailablePeriodsForDate called with:', {
        filters,
        date,
        options,
        semesterValue: filters.semester,
        semesterType: typeof filters.semester,
        semesterAsString: String(filters.semester)
      });

      const dayOfWeek = this.getDayOfWeekFromDate(date);
      console.log('Day of week for date:', dayOfWeek);

      // First, check if the semester filter is an ID and get the actual semester name
      let semesterName = String(filters.semester);

      // Check if it looks like a UUID (semester ID)
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(filters.semester)
        );

      if (isUUID) {
        console.log(
          'Semester appears to be an ID, fetching semester details...'
        );
        // Fetch the semester details to get the name
        const { data: semesterData, error: semesterError } = await this.supabase
          .from('semesters')
          .select('semester_name')
          .eq('id', filters.semester)
          .single();

        if (semesterData && !semesterError) {
          semesterName = semesterData.semester_name;
          console.log('Found semester name:', semesterName);
        } else {
          console.log('Could not fetch semester name, using ID as-is');
        }
      }

      // Similarly check for section
      let sectionName = filters.section;
      if (
        filters.section &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(filters.section)
        )
      ) {
        console.log('Section appears to be an ID, fetching section details...');
        const { data: sectionData, error: sectionError } = await this.supabase
          .from('sections')
          .select('section_name')
          .eq('id', filters.section)
          .single();

        if (sectionData && !sectionError) {
          sectionName = sectionData.section_name;
          console.log('Found section name:', sectionName);
        }
      }

      // Fetch all active timetables for the given context (both regular and batch)
      let timetableQuery = this.supabase
        .from('timetables')
        .select(
          'id, timetable_format, start_date, end_date, selected_dates, section, semester, timetable_data'
        )
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('is_active', true);

      // Use the semester name for comparison
      timetableQuery = timetableQuery.eq('semester', semesterName);
      console.log('Querying with semester name:', semesterName);

      // For section filtering, use the section name if we have it
      if (sectionName) {
        console.log('Filtering by section name:', sectionName);
        timetableQuery = timetableQuery.eq('section', sectionName);
      } else {
        console.log(
          'No section filter specified - getting all timetables regardless of section'
        );
        // Don't filter by section - get all timetables for this context
        // This allows fetching timetables that have a section set even when no specific section is requested
      }

      const { data: timetables, error: timetableError } = await timetableQuery;

      console.log('Timetables query result:', {
        timetables,
        error: timetableError
      });

      if (timetableError || !timetables || timetables.length === 0) {
        console.warn('No active timetables found for the given criteria.', {
          error: timetableError,
          timetablesCount: timetables?.length || 0
        });
        return [];
      }

      // Collect all slots from all relevant timetables
      const allSlots: any[] = [];

      for (const timetable of timetables) {
        console.log('Processing timetable:', {
          id: timetable.id,
          format: timetable.timetable_format,
          start_date: timetable.start_date,
          end_date: timetable.end_date,
          selected_dates: timetable.selected_dates
        });

        // For batch timetables, check if the date falls within the date range
        if (timetable.timetable_format === 'batch') {
          // Check if date is within the timetable's date range
          if (timetable.start_date && timetable.end_date) {
            const searchDate = new Date(date);
            const startDate = new Date(timetable.start_date);
            const endDate = new Date(timetable.end_date);

            console.log('Checking date range:', {
              searchDate: searchDate.toISOString(),
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              isWithinRange: searchDate >= startDate && searchDate <= endDate
            });

            // Skip this timetable if the date is outside its range
            if (searchDate < startDate || searchDate > endDate) {
              console.log('Date is outside timetable range, skipping');
              continue;
            }
          }

          // Also check if the date is in the selected_dates array
          if (timetable.selected_dates) {
            let dateIsInRange = false;
            const dateStr = date;

            console.log('Checking selected_dates for date:', dateStr);

            // Check if date is covered by any of the date ranges
            for (const item of timetable.selected_dates) {
              if (typeof item === 'string' && item.startsWith('RANGE:')) {
                const parts = item.split(':');
                if (parts.length === 3) {
                  const rangeStart = new Date(parts[1]);
                  const rangeEnd = new Date(parts[2]);
                  const checkDate = new Date(dateStr);

                  console.log('Checking range:', {
                    range: item,
                    rangeStart: rangeStart.toISOString(),
                    rangeEnd: rangeEnd.toISOString(),
                    checkDate: checkDate.toISOString(),
                    isInRange: checkDate >= rangeStart && checkDate <= rangeEnd
                  });

                  if (checkDate >= rangeStart && checkDate <= rangeEnd) {
                    dateIsInRange = true;
                    break;
                  }
                }
              }
            }

            if (!dateIsInRange) {
              console.log('Date is not in any selected_dates range, skipping');
              continue;
            }
          }
        }

        // Extract slots directly from timetable_data (avoiding RLS issues with RPC functions)
        let slots: any[] = [];
        try {
          const timetableData = (timetable as any).timetable_data;
          if (timetableData && typeof timetableData === 'object') {
            if (timetable.timetable_format === 'batch') {
              if (!date) {
                console.error('Date is required for batch timetables');
                continue;
              }
              // For batch timetables, extract slots for the specific date
              Object.keys(timetableData).forEach((day) => {
                const daySlots = timetableData[day];
                if (daySlots && typeof daySlots === 'object') {
                  Object.keys(daySlots).forEach((periodId) => {
                    const slotData = daySlots[periodId];
                    if (
                      slotData &&
                      slotData.slot_date === date &&
                      !slotData.is_break_slot
                    ) {
                      slots.push({
                        ...slotData,
                        period_id: periodId,
                        day_of_week: day,
                        id: slotData.slot_id
                      });
                    }
                  });
                }
              });
            } else {
              // For regular timetables, extract slots for the specific day
              const daySlots = timetableData[dayOfWeek];
              if (daySlots && typeof daySlots === 'object') {
                Object.keys(daySlots).forEach((periodId) => {
                  const slotData = daySlots[periodId];
                  if (slotData && !slotData.is_break_slot) {
                    slots.push({
                      ...slotData,
                      period_id: periodId,
                      day_of_week: dayOfWeek,
                      id: slotData.slot_id
                    });
                  }
                });
              }
            }
          }

          console.log('Extracted slots from timetable_data:', {
            timetable_id: timetable.id,
            format: timetable.timetable_format,
            queryDate:
              timetable.timetable_format === 'batch' ? date : dayOfWeek,
            slotsCount: slots?.length || 0
          });

          // Fetch related data for slots
          if (slots.length > 0) {
            // Get unique IDs for fetching related data
            const uniqueCourseIds = [
              ...new Set(slots.map((s) => s.course_id).filter(Boolean))
            ];
            const uniqueStaffIds = [
              ...new Set(
                slots.flatMap((s) => s.staff_ids || []).filter(Boolean)
              )
            ];
            const uniqueSectionIds = [
              ...new Set(
                slots.flatMap((s) => s.section_ids || []).filter(Boolean)
              )
            ];

            // Fetch courses
            const coursesMap = new Map();
            if (uniqueCourseIds.length > 0) {
              try {
                const { data: courses } = await this.supabase
                  .from('courses')
                  .select('*')
                  .in('id', uniqueCourseIds);
                courses?.forEach((course) => coursesMap.set(course.id, course));
              } catch (error) {
                console.error('Error fetching courses:', error);
              }
            }

            // Fetch staff
            const staffMap = new Map();
            if (uniqueStaffIds.length > 0) {
              try {
                const { data: staff } = await this.supabase
                  .from('staff')
                  .select('*')
                  .in('id', uniqueStaffIds);
                staff?.forEach((s) => staffMap.set(s.id, s));
              } catch (error) {
                console.error('Error fetching staff:', error);
              }
            }

            // Fetch sections
            const sectionsMap = new Map();
            if (uniqueSectionIds.length > 0) {
              try {
                const { data: sections } = await this.supabase
                  .from('sections')
                  .select('*')
                  .in('id', uniqueSectionIds);
                sections?.forEach((section) =>
                  sectionsMap.set(section.id, section)
                );
              } catch (error) {
                console.error('Error fetching sections:', error);
              }
            }

            // Enhance slots with related data
            slots = slots.map((slot) => ({
              ...slot,
              course: slot.course_id ? coursesMap.get(slot.course_id) : null,
              staff_members: (slot.staff_ids || [])
                .map((id: string) => staffMap.get(id))
                .filter(Boolean),
              sections: (slot.section_ids || [])
                .map((id: string) => sectionsMap.get(id))
                .filter(Boolean)
            }));
          }
        } catch (error) {
          console.error('Error extracting slots from timetable_data:', error);
          continue;
        }

        // Store staffId for later filtering if needed
        let staffIdForFiltering: string | null = null;
        if (options.filterByStaffAssignment && !options.isSuperAdmin) {
          console.log('Filtering required for non-admin user');
          staffIdForFiltering = await this.getCurrentUserStaffId();
          if (!staffIdForFiltering) {
            // If no staff ID, return no periods for non-admins
            console.log(
              'No staff ID found for current user - skipping timetable'
            );
            continue; // Skip this timetable if user has no staff access
          }
          console.log('Will filter periods for staff ID:', staffIdForFiltering);
        } else {
          console.log(
            'No filtering needed - user is super admin or filtering disabled'
          );
        }

        console.log('Fetched slots for timetable:', {
          timetable_id: timetable.id,
          format: timetable.timetable_format,
          queryDate: timetable.timetable_format === 'batch' ? date : dayOfWeek,
          slotsCount: slots?.length || 0
        });

        if (slots && slots.length > 0) {
          console.log('Found slots:', slots.length);

          // Debug: Log the first slot structure to understand staff assignments
          if (slots.length > 0) {
            console.log('Sample slot structure:', {
              slot_id: slots[0].id,
              has_staff_members: !!slots[0].staff_members,
              staff_members_count: slots[0].staff_members?.length || 0,
              staff_ids: slots[0].staff_ids || [],
              staff_member_ids:
                slots[0].staff_members?.map((sm: any) => sm.id) || [],
              has_sub_slots: !!slots[0].sub_slots,
              sub_slots_count: slots[0].sub_slots?.length || 0
            });
          }

          // Filter slots by staff assignment if needed (but not for super admin)
          let filteredSlots = slots;
          if (staffIdForFiltering && !options.isSuperAdmin) {
            console.log(`Filtering slots for staff ID: ${staffIdForFiltering}`);

            filteredSlots = slots.filter((slot: any) => {
              // Check if staff is assigned to the main slot
              if (slot.staff_members && Array.isArray(slot.staff_members)) {
                const isAssignedToMain = slot.staff_members.some(
                  (staff: any) => staff.id === staffIdForFiltering
                );
                if (isAssignedToMain) return true;
              }

              // Also check staff_ids array directly as fallback
              if (slot.staff_ids && Array.isArray(slot.staff_ids)) {
                const isAssignedViaIds =
                  slot.staff_ids.includes(staffIdForFiltering);
                if (isAssignedViaIds) return true;
              }

              // Check if staff is assigned to any sub-slot (for combined classes)
              if (slot.sub_slots && Array.isArray(slot.sub_slots)) {
                for (const subSlot of slot.sub_slots) {
                  if (
                    subSlot.staff_members &&
                    Array.isArray(subSlot.staff_members)
                  ) {
                    const isAssignedToSubSlot = subSlot.staff_members.some(
                      (staff: any) => staff.id === staffIdForFiltering
                    );
                    if (isAssignedToSubSlot) return true;
                  }

                  // Also check sub-slot staff_ids array
                  if (subSlot.staff_ids && Array.isArray(subSlot.staff_ids)) {
                    const isAssignedViaSubSlotIds =
                      subSlot.staff_ids.includes(staffIdForFiltering);
                    if (isAssignedViaSubSlotIds) return true;
                  }
                }
              }

              return false;
            });

            console.log(`Filtered slots by staff ${staffIdForFiltering}:`, {
              original: slots.length,
              filtered: filteredSlots.length
            });
          }

          // Add the timetable_id to each slot for reference
          const slotsWithTimetableId = filteredSlots.map((slot: any) => ({
            ...slot,
            timetable_id: timetable.id
          }));
          allSlots.push(...slotsWithTimetableId);
        } else {
          console.log('No slots found for this timetable');
        }
      }

      // If no slots found from any timetable
      if (allSlots.length === 0) {
        console.log('No slots found from any timetable');
        return [];
      }

      console.log(
        'Total slots collected from all timetables:',
        allSlots.length
      );

      // Get period details for all unique period IDs found in slots
      const uniquePeriodIds = [
        ...new Set(allSlots.map((slot: any) => slot.period_id).filter(Boolean))
      ];

      console.log('Unique period IDs found in slots:', uniquePeriodIds);

      let periodsData: any[] = [];
      if (uniquePeriodIds.length > 0) {
        try {
          const { data: periods, error: periodsError } = await this.supabase
            .from('periods')
            .select('*')
            .in('id', uniquePeriodIds);

          if (periodsError) {
            console.error('Error fetching periods:', periodsError);
          } else {
            periodsData = periods || [];
            console.log('Fetched periods:', periodsData.length);
          }
        } catch (error) {
          console.error('Error fetching periods data:', error);
        }
      }

      // Map all collected slots to AttendancePeriodOption with validation
      const availablePeriods = allSlots
        .filter((slot: any) => {
          // Ensure slot has required fields
          if (!slot || !slot.period_id) {
            console.warn('Invalid slot found, skipping:', slot);
            return false;
          }
          return true;
        })
        .map((slot: any) => {
          // Find the period data for this slot
          const periodData = periodsData.find((p) => p.id === slot.period_id);

          return {
            timetable_slot_id: slot.slot_id || slot.id,
            timetable_id: slot.timetable_id,
            id: slot.period_id,
            period_name: periodData?.period_name || 'Unknown Period',
            start_time: periodData?.start_time || '',
            end_time: periodData?.end_time || '',
            is_break: periodData?.is_break || false,
            course: slot.course
              ? {
                  id: slot.course.id,
                  course_name: slot.course.course_name || '',
                  course_code: slot.course.course_code || ''
                }
              : undefined,
            // Note: staff field is deprecated, use staff_members instead
            staff: undefined,
            staff_members: slot.staff_members || [],
            sub_slots:
              slot.sub_slots?.map((ss: any) => ({
                ...ss,
                staff_members: ss.staff_members || [],
                sections: ss.sections || []
              })) || [],
            sections: slot.sections || []
          };
        });

      // Remove duplicates based on period id and sort
      const uniquePeriods = availablePeriods.filter(
        (period, index, self) =>
          index === self.findIndex((p) => p.id === period.id)
      );

      const sortedPeriods = uniquePeriods.sort((a, b) => {
        if (a.start_time < b.start_time) return -1;
        if (a.start_time > b.start_time) return 1;
        return 0;
      });

      // Final validation to ensure we always return an array
      return Array.isArray(sortedPeriods) ? sortedPeriods : [];
    } catch (error) {
      console.error('Error in getAvailablePeriodsForDate:', error);
      return [];
    }
  }

  // Batch update attendance records
  static async batchUpdateAttendance(
    data: BatchUpdateAttendanceDto
  ): Promise<void> {
    try {
      // Check if this is a manual entry (no real timetable slot)
      const isManualEntry = data.records.some(
        (record) => record.timetable_slot_id === 'manual-entry'
      );

      if (isManualEntry) {
        // For manual entries, save to a manual attendance table or with special handling
        // For now, we'll skip saving manual entries to preserve data integrity
        console.warn('Manual attendance entries are not saved to database yet');
        toast.success('Manual attendance marked (not saved to database)');
        return;
      }

      // Use upsert to create or update attendance records
      const { error } = await this.supabase
        .from('student_attendance')
        .upsert(data.records, {
          onConflict: 'student_id,timetable_slot_id,attendance_date'
        });

      if (error) throw error;

      toast.success('Attendance saved successfully');
    } catch (error) {
      console.error('Error batch updating attendance:', error);
      toast.error('Failed to save attendance');
      throw error;
    }
  }

  // Get current user's staff ID if they are a staff member
  static async getCurrentUserStaffId(): Promise<string | null> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        return null;
      }

      // Get the user's profile to find their email
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('email')
        .eq('id', userData.user.id)
        .single();

      if (profileError || !profile) {
        return null;
      }

      // Find staff record with matching institution_email
      const { data: staff, error: staffError } = await this.supabase
        .from('staff')
        .select('id')
        .eq('institution_email', profile.email)
        .eq('is_active', true)
        .single();

      if (staffError || !staff) {
        return null;
      }

      return staff.id;
    } catch (error) {
      console.error('Error getting current user staff ID:', error);
      return null;
    }
  }

  // Check if a staff member is assigned to a specific timetable slot
  static async isStaffAssignedToSlot(
    staffId: string,
    timetableSlotId: string
  ): Promise<boolean> {
    try {
      // NEW: Use JSON-based timetable structure
      // First, find the timetable containing this slot
      const timetableId = await this.getTimetableIdFromSlot(timetableSlotId);
      if (!timetableId) {
        console.log('Could not find timetable for slot:', timetableSlotId);
        return false;
      }

      // Get all slots for this timetable and check staff assignments
      const { data: slots, error: slotsError } = await this.supabase.rpc(
        'get_all_timetable_slots',
        {
          p_timetable_id: timetableId
        }
      );

      if (slotsError) {
        console.error(
          'Error fetching slots for staff assignment check:',
          slotsError
        );
        return false;
      }

      // Find the specific slot and check if staff is assigned
      const targetSlot = (slots || []).find(
        (slot: any) => slot.id === timetableSlotId
      );
      if (!targetSlot) {
        return false;
      }

      // Check if staff is in the main slot staff_members
      if (targetSlot.staff_members && Array.isArray(targetSlot.staff_members)) {
        const isAssignedToMain = targetSlot.staff_members.some(
          (staff: any) => staff.id === staffId
        );
        if (isAssignedToMain) return true;
      }

      // Check if staff is in any sub-slot staff_members (for combined classes)
      if (targetSlot.sub_slots && Array.isArray(targetSlot.sub_slots)) {
        for (const subSlot of targetSlot.sub_slots) {
          if (subSlot.staff_members && Array.isArray(subSlot.staff_members)) {
            const isAssignedToSubSlot = subSlot.staff_members.some(
              (staff: any) => staff.id === staffId
            );
            if (isAssignedToSubSlot) return true;
          }
        }
      }

      // OLD CODE - Keep as fallback for any remaining legacy data
      const { data: junctionAssignment, error: junctionError } =
        await this.supabase
          .from('timetable_slot_staff')
          .select('timetable_slot_id')
          .eq('timetable_slot_id', timetableSlotId)
          .eq('staff_id', staffId)
          .single();

      if (!junctionError && junctionAssignment) {
        return true;
      }

      // Check sub-slots for combined classes
      const { data: subSlotAssignment, error: subSlotError } =
        await this.supabase
          .from('timetable_sub_slot_staff')
          .select('sub_slot_id')
          .eq('staff_id', staffId);

      if (subSlotError) {
        console.error('Error checking sub-slot assignments:', subSlotError);
        return false;
      }

      if (subSlotAssignment && subSlotAssignment.length > 0) {
        // Check if any of these sub-slots belong to our timetable slot
        const subSlotIds = subSlotAssignment.map((ss) => ss.sub_slot_id);

        const { data: parentSlots, error: parentError } = await this.supabase
          .from('timetable_sub_slots')
          .select('parent_slot_id')
          .in('id', subSlotIds)
          .eq('parent_slot_id', timetableSlotId);

        if (!parentError && parentSlots && parentSlots.length > 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking staff assignment to slot:', error);
      return false;
    }
  }

  // Check if current user can mark attendance for a specific timetable slot
  static async canMarkAttendanceForSlot(
    timetableSlotId: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    try {
      // Super admins can mark attendance for any slot
      if (isSuperAdmin) {
        return true;
      }

      // Skip check for manual entries
      if (timetableSlotId === 'manual-entry') {
        return true;
      }

      // Get current user's staff ID
      const staffId = await this.getCurrentUserStaffId();

      if (!staffId) {
        console.log('User is not a staff member');
        return false;
      }

      // First check: Is staff specifically assigned to this slot?
      const isAssigned = await this.isStaffAssignedToSlot(
        staffId,
        timetableSlotId
      );

      if (isAssigned) {
        console.log(`Staff ${staffId} is assigned to slot ${timetableSlotId}`);
        return true;
      }

      // Second check: Does user have faculty role with attendance permissions?
      // This allows faculty members to mark attendance even if not specifically assigned
      const hasRolePermission = await this.checkFacultyAttendancePermission();

      if (hasRolePermission) {
        console.log(
          `Staff ${staffId} has faculty role permissions to mark attendance for any slot`
        );
        return true;
      }

      console.log(
        `Staff ${staffId} is not assigned to slot ${timetableSlotId} and lacks sufficient permissions`
      );
      return false;
    } catch (error) {
      console.error('Error checking attendance permission for slot:', error);
      return false;
    }
  }

  // New helper method to check faculty role permissions
  static async checkFacultyAttendancePermission(): Promise<boolean> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        return false;
      }

      // Get user's profile and role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (profileError || !profile) {
        return false;
      }

      // Check if user has faculty role with attendance permissions
      const { data: roleData, error: roleError } = await this.supabase
        .from('custom_roles')
        .select('permissions')
        .eq('role_key', profile.role)
        .single();

      if (roleError || !roleData) {
        return false;
      }

      // Check if role has attendance marking permission
      const permissions = roleData.permissions as any;
      return permissions && permissions['academic.attendance.mark'] === true;
    } catch (error) {
      console.error('Error checking faculty attendance permission:', error);
      return false;
    }
  }

  // New method to save manual attendance
  static async saveManualAttendance(attendanceData: {
    attendance_date: string;
    student_records: Array<{
      student_id: string;
      status: 'Present' | 'Absent';
    }>;
    marked_by: string;
    institution_id: string;
    notes?: string;
  }): Promise<void> {
    try {
      // This could be saved to a separate manual_attendance table
      // or with a special timetable_slot_id marker
      console.log('Manual attendance data:', attendanceData);

      // For now, just show success message
      toast.success(
        `Manual attendance marked for ${attendanceData.student_records.length} students`
      );
    } catch (error) {
      console.error('Error saving manual attendance:', error);
      toast.error('Failed to save manual attendance');
      throw error;
    }
  }

  // Update single attendance record
  static async updateAttendance(
    id: string,
    data: UpdateStudentAttendanceDto
  ): Promise<StudentAttendance> {
    try {
      const { data: updatedRecord, error } = await this.supabase
        .from('student_attendance')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return updatedRecord;
    } catch (error) {
      console.error('Error updating attendance:', error);
      throw error;
    }
  }

  // Get attendance records with filters
  // NOTE: This method is deprecated since we moved to consolidated approach
  static async getAttendance(
    filters: AttendanceFilters = {}
  ): Promise<AttendanceListResponse> {
    try {
      // Since we moved to consolidated attendance, return empty result
      console.log(
        'getAttendance called - returning empty result (consolidated approach active)'
      );
      return {
        data: [],
        metadata: {
          total: 0,
          page: filters.page || 1,
          limit: filters.limit || 50,
          totalPages: 0
        }
      };
    } catch (error) {
      console.error('Error fetching attendance:', error);
      throw error;
    }
  }

  // Helper method to get day of week from date
  private static getDayOfWeekFromDate(date: string): DayOfWeek {
    const days: DayOfWeek[] = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY'
    ];
    // Parse the date parts to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    // Create date using local timezone (month is 0-indexed in JS)
    const dateObj = new Date(year, month - 1, day);
    return days[dateObj.getDay()];
  }
}
