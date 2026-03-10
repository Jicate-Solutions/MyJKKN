import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AttendanceRosterStudent,
  AttendanceStudent,
  ConsolidatedStudentAttendance,
  ConsolidatedAttendanceData,
  ConsolidatedAttendanceStudent,
} from '@/types/attendance';

/**
 * AttendanceRosterService — fetching and building attendance rosters.
 * Split from AttendanceService (Task 5.2).
 *
 * @see AttendanceCoreService for marking and validation methods
 * @see AttendanceService for timetable lookup and utility methods
 */
export class AttendanceRosterService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // =====================
  // ROSTER CHECKING / AGGREGATION METHODS
  // =====================

  /**
   * Check existing attendance for multiple periods at once
   */
  static async checkExistingAttendanceForPeriods(
    periods: Array<{
      timetable_slot_id: string;
      timetable_id: string;
      section_id: string;
      attendance_date: string;
    }>
  ): Promise<Map<string, { isMarked: boolean; recordId?: string }>> {
    const attendanceMap = new Map<
      string,
      { isMarked: boolean; recordId?: string }
    >();

    try {
      // Group periods by timetable_id, section_id, and date for efficient querying
      const groupedPeriods = new Map<string, typeof periods>();

      periods.forEach((period) => {
        const key = `${period.timetable_id}_${period.section_id}_${period.attendance_date}`;
        if (!groupedPeriods.has(key)) {
          groupedPeriods.set(key, []);
        }
        groupedPeriods.get(key)!.push(period);
      });

      // Query attendance records for each group
      for (const [_, groupPeriods] of groupedPeriods) {
        if (groupPeriods.length === 0) continue;

        const firstPeriod = groupPeriods[0];

        // Validate parameters before query
        if (
          !firstPeriod.timetable_id ||
          !firstPeriod.section_id ||
          !firstPeriod.attendance_date
        ) {
          logger.error('academic/attendance', 'Invalid parameters for attendance check', {
            timetable_id: firstPeriod.timetable_id,
            section_id: firstPeriod.section_id,
            attendance_date: firstPeriod.attendance_date
          });
          // Mark all periods in this group as not marked on error
          groupPeriods.forEach((period) => {
            attendanceMap.set(period.timetable_slot_id, { isMarked: false });
          });
          continue;
        }

        // Updated: 2025-10-09 - Check for both section_id match and section_ids array containment
        // For multi-section timetables, attendance is stored with section_ids array
        // We need to check if the section is either:
        // 1. The main section_id (for single-section or as primary in multi-section)
        // 2. In the section_ids array (for multi-section timetables)

        // First try to find by exact section_id match
        let { data, error } = await this.supabase
          .from('student_attendance')
          .select('id, attendance_data, section_ids')
          .eq('timetable_id', firstPeriod.timetable_id)
          .eq('section_id', firstPeriod.section_id)
          .eq('attendance_date', firstPeriod.attendance_date)
          .maybeSingle();

        // If not found by section_id, try finding by section_ids array containment
        if (!data && firstPeriod.section_id) {
          const { data: arrayData, error: arrayError } = await this.supabase
            .from('student_attendance')
            .select('id, attendance_data, section_ids')
            .eq('timetable_id', firstPeriod.timetable_id)
            .eq('attendance_date', firstPeriod.attendance_date)
            .contains('section_ids', [firstPeriod.section_id])
            .maybeSingle();

          if (arrayData) {
            data = arrayData;
            error = arrayError;
          }
        }

        if (error) {
          logger.error('academic/attendance', 'Error checking existing attendance', error);
          // Mark all periods in this group as not marked on error
          groupPeriods.forEach((period) => {
            attendanceMap.set(period.timetable_slot_id, { isMarked: false });
          });
          continue;
        }

        // Check each period in this group
        groupPeriods.forEach((period) => {
          let isMarked = false;

          if ((data as any)?.attendance_data) {
            // Updated: 2025-10-09 - Check ONLY this specific slot, not any other slots
            // Even for multi-section records, we should only mark a period as complete
            // if THIS specific slot has attendance data
            const slotData = (data as any).attendance_data[period.timetable_slot_id];
            if (slotData && slotData.students && slotData.students.length > 0) {
              isMarked = true;
            }
          }

          attendanceMap.set(period.timetable_slot_id, {
            isMarked,
            recordId: isMarked ? (data as any)?.id : undefined
          });
        });
      }
    } catch (error) {
      logger.error('academic/attendance', 'Error in checkExistingAttendanceForPeriods', error);
      // On error, mark all periods as not marked
      periods.forEach((period) => {
        attendanceMap.set(period.timetable_slot_id, { isMarked: false });
      });
    }

    return attendanceMap;
  }

  static async getConsolidatedAttendance(
    timetable_id: string,
    section_id: string,
    attendance_date: string,
    period_id?: string
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
        logger.error('academic/attendance', `Error fetching timetable ${timetable_id} to resolve section name`, timetableError);
        return null;
      }

      const { data: sectionData, error: sectionError } = await this.supabase
        .from('sections')
        .select('id')
        .eq('program_id', (timetableData as any).program_id)
        .eq('section_name', resolvedSectionId)
        .limit(1)
        .single();

      if (sectionError || !sectionData) {
        logger.error('academic/attendance', `Could not resolve section name "${resolvedSectionId}" to an ID`, sectionError);
        return null; // Return null to avoid crash
      }

      resolvedSectionId = (sectionData as any).id;
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
        institution_id,
        created_at,
        updated_at
      `
      )
      .eq('timetable_id', timetable_id)
      .eq('section_id', resolvedSectionId)
      .eq('attendance_date', attendance_date)
      .maybeSingle();

    if (error) {
      logger.error('academic/attendance', 'Error fetching consolidated attendance', error);
      throw error;
    }

    if (data) {
      // If period_id is provided, check if this specific period has already been marked
      if (period_id && (data as any).attendance_data) {
        // First check if period_id matches a slot key directly
        const periodData = (data as any).attendance_data[period_id];
        if (
          periodData &&
          periodData.students &&
          periodData.students.length > 0
        ) {
          return {
            ...(data as any),
            marked_by: '', // Add missing required property
            marked_by_profile: undefined
          } as ConsolidatedStudentAttendance;
        }

        // If not found by slot ID, search by period_id within the attendance data
        for (const [slotId, slotData] of Object.entries((data as any).attendance_data)) {
          if (
            (slotData as any).period_id === period_id &&
            (slotData as any).students &&
            (slotData as any).students.length > 0
          ) {
            return {
              ...(data as any),
              marked_by: '', // Add missing required property
              marked_by_profile: undefined
            } as ConsolidatedStudentAttendance;
          }
        }

        // Return null to allow marking attendance for this specific period
        // Even though other periods may have been marked on the same date
        return null;
      }
    }

    // If no period_id is provided, return the record as-is (for general attendance checking)
    // If period_id is provided and we reach here, it means no data was found for that specific period
    if (period_id) {
      return null;
    }

    return data
      ? ({
        ...(data as any),
        marked_by: '', // Add missing required property
        marked_by_profile: undefined
      } as ConsolidatedStudentAttendance)
      : null;
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
          institution_id,
          created_at,
          updated_at
        `
        )
        .eq('section_id', section_id)
        .eq('attendance_date', attendance_date);

      if (error) {
        logger.error('academic/attendance', 'Error fetching attendance by date and section', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map((record) => ({
        ...(record as any),
        marked_by: '', // Add missing required property
        marked_by_profile: undefined
      })) as unknown as ConsolidatedStudentAttendance[];
    } catch (error) {
      logger.error('academic/attendance', 'Error fetching consolidated attendance by date and section', error);
      return [];
    }
  }

  // =====================
  // ROSTER BUILDING METHODS
  // =====================

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
          academic_year_id,
          degree_id,
          program_id,
          department_id,
          semester_id,
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
        .from('learners_profiles')
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
          lifecycle_status
        `
        )
        .eq('lifecycle_status', 'active')
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
            for (const [, periodData] of Object.entries(attendanceData)) {
              const studentRecord = (periodData as any).students?.find(
                (s: ConsolidatedAttendanceStudent) =>
                  s.student_id === (student as any).id
              );

              if (studentRecord) {
                status = studentRecord.status;
                attendance_id = (consolidatedRecord as any).id;
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
            id: (student as any).id,
            first_name: (student as any).first_name || 'Unknown',
            last_name: (student as any).last_name || '',
            roll_number: (student as any).roll_number,
            student_photo_url: (student as any).student_photo_url,
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
      logger.error('academic/attendance', 'Error fetching consolidated attendance roster', error);
      throw error;
    }
  }

  // =====================
  // AGGREGATION / SUMMARY METHODS
  // =====================

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

      (data || []).forEach((record: any) => {
        uniqueDates.add(record.attendance_date);
        const attendanceData =
          record.attendance_data as ConsolidatedAttendanceData;

        for (const [, periodData] of Object.entries(attendanceData)) {
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
      logger.error('academic/attendance', 'Error fetching attendance summary', error);
      throw error;
    }
  }

  // =====================
  // LEGACY ROSTER METHODS (for backward compatibility)
  // =====================

  // Get students for attendance based on filters
  // Updated: 2025-10-08 - Added support for multiple sections (multi-section attendance)
  static async getStudentsForAttendance(filters: {
    institution_id: string;
    degree_id?: string;
    program_id?: string;
    department_id?: string;
    semester_id?: string;
    section_id?: string; // Single section (backward compatibility)
    section_ids?: string[]; // Multiple sections (new feature)
  }): Promise<AttendanceStudent[]> {
    try {
      // Updated: 2026-03-10 - Removed redundant auth + profile queries
      // RLS policies on learners_profiles already enforce institution-level access
      // The caller (mark page) already has auth context from useAuth/usePermissions

      let query = this.supabase
        .from('learners_profiles')
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
          lifecycle_status
        `
        )
        .eq('lifecycle_status', 'active')
        .eq('institution_id', filters.institution_id);

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      // Updated: 2025-10-13 - Skip department_id filter for faculty users
      // Faculty can teach students from other departments (e.g., subdivision groups, electives)
      // Department filter is intentionally omitted — section_id/section_ids
      // already scope students correctly, and RLS enforces institution access

      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      // Updated: 2025-10-08 - Support both single section and multiple sections
      if (filters.section_ids && filters.section_ids.length > 0) {
        // Multi-section support (new feature)
        query = query.in('section_id', filters.section_ids);
      } else if (filters.section_id) {
        // Single section (backward compatibility)
        query = query.eq('section_id', filters.section_id);
      }

      // Order by section_id first, then roll_number for better grouping
      query = query
        .order('section_id', { ascending: true })
        .order('roll_number', { ascending: true });

      const { data, error } = await query;

      if (error) {
        logger.error('academic/attendance', 'Supabase query error in getStudentsForAttendance', error);
        throw error;
      }

      if (!data || data.length === 0) {
        logger.warn('academic/attendance', 'No students found for attendance', { filters });
      }

      // Transform the data to include student_name constructed from first_name and last_name
      const transformedData = (data || []).map((student: any) => ({
        ...student,
        student_name:
          `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
          'Unknown Student'
      })) as AttendanceStudent[];

      return transformedData;
    } catch (error) {
      logger.error('academic/attendance', 'Error in getStudentsForAttendance', error);
      throw error;
    }
  }
}
