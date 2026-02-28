import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { AttendanceCoreService } from './attendance-core-service';
import type {
  StudentAttendance,
  // CreateStudentAttendanceDto,
  AttendanceFilters,
  AttendanceListResponse,
  AttendanceRosterData,
  AttendanceRosterStudent,
  AttendancePeriodOption,
  AttendanceStudent,
  ConsolidatedStudentAttendance,
  ConsolidatedAttendanceData,
  ConsolidatedAttendanceStudent,
  // CreateConsolidatedAttendanceDto,
  // UpdateConsolidatedAttendanceDto,
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
  // FORWARDING STUBS — methods moved to AttendanceCoreService
  // These remain here for backward compatibility with existing callers.
  // =====================

  static validateStaffAssignment(...args: Parameters<typeof AttendanceCoreService.validateStaffAssignment>) {
    return AttendanceCoreService.validateStaffAssignment(...args);
  }

  static upsertConsolidatedAttendance(...args: Parameters<typeof AttendanceCoreService.upsertConsolidatedAttendance>) {
    return AttendanceCoreService.upsertConsolidatedAttendance(...args);
  }

  static batchUpdateConsolidatedAttendance(...args: Parameters<typeof AttendanceCoreService.batchUpdateConsolidatedAttendance>) {
    return AttendanceCoreService.batchUpdateConsolidatedAttendance(...args);
  }

  static batchUpdateAttendance(...args: Parameters<typeof AttendanceCoreService.batchUpdateAttendance>) {
    return AttendanceCoreService.batchUpdateAttendance(...args);
  }

  static updateAttendance(...args: Parameters<typeof AttendanceCoreService.updateAttendance>) {
    return AttendanceCoreService.updateAttendance(...args);
  }

  static saveManualAttendance(...args: Parameters<typeof AttendanceCoreService.saveManualAttendance>) {
    return AttendanceCoreService.saveManualAttendance(...args);
  }

  static getCurrentUserStaffId(...args: Parameters<typeof AttendanceCoreService.getCurrentUserStaffId>) {
    return AttendanceCoreService.getCurrentUserStaffId(...args);
  }

  static isStaffAssignedToSlot(...args: Parameters<typeof AttendanceCoreService.isStaffAssignedToSlot>) {
    return AttendanceCoreService.isStaffAssignedToSlot(...args);
  }

  static canMarkAttendanceForSlot(...args: Parameters<typeof AttendanceCoreService.canMarkAttendanceForSlot>) {
    return AttendanceCoreService.canMarkAttendanceForSlot(...args);
  }

  static checkFacultyAttendancePermission(...args: Parameters<typeof AttendanceCoreService.checkFacultyAttendancePermission>) {
    return AttendanceCoreService.checkFacultyAttendancePermission(...args);
  }

  static checkHODDepartmentAccess(...args: Parameters<typeof AttendanceCoreService.checkHODDepartmentAccess>) {
    return AttendanceCoreService.checkHODDepartmentAccess(...args);
  }

  static checkPracticalConflict(...args: Parameters<typeof AttendanceCoreService.checkPracticalConflict>) {
    return AttendanceCoreService.checkPracticalConflict(...args);
  }

  // =====================
  // NEW CONSOLIDATED ATTENDANCE METHODS
  // =====================

  // Get consolidated attendance record for a specific timetable, section, and date
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

  // Check if a slot has version history
  static async getSlotVersionInfo(slot_id: string): Promise<{
    hasVersions: boolean;
    currentVersion: number;
    totalVersions: number;
    changeHistory: any[];
  }> {
    try {
      // First check if the slot has continuity tracking
      // Type assertion to prevent TypeScript infinite recursion on Supabase query chain
      const { data: continuityCheck, error: checkError } = await (this.supabase as any)
        .from('timetable_slot_continuity')
        .select('continuity_group_id')
        .eq('timetable_slot_id', slot_id)
        .single();

      if (checkError || !(continuityCheck as any)?.continuity_group_id) {
        // No continuity tracking for this slot
        return {
          hasVersions: false,
          currentVersion: 1,
          totalVersions: 1,
          changeHistory: []
        };
      }

      // Get all versions in the continuity group
      // Type assertion to prevent TypeScript infinite recursion on Supabase query chain
      const { data: continuityData, error } = await (this.supabase as any)
        .from('timetable_slot_continuity')
        .select('*')
        .eq('continuity_group_id', (continuityCheck as any).continuity_group_id)
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
        (c: any) => c.timetable_slot_id === slot_id
      );
      const currentVersion = (currentSlot as any)?.version_number || 1;

      return {
        hasVersions: true,
        currentVersion,
        totalVersions: continuityData.length,
        changeHistory: continuityData.map((c: any) => ({
          version: c.version_number,
          validFrom: c.valid_from,
          validUntil: c.valid_until,
          changeReason: c.change_reason,
          changedBy: c.changed_by_user,
          isCurrent: c.is_current
        }))
      };
    } catch (error) {
      logger.error('academic/attendance', 'Error getting slot version info', error);
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
          .eq('program_id', (timetableData as any).program_id)
          .eq('section_name', resolvedSectionId)
          .limit(1)
          .single();

        if (sectionError || !sectionData) {
          logger.error('academic/attendance', `Could not resolve section name "${resolvedSectionId}"`, sectionError);
          return []; // Return empty to avoid crash
        }
        resolvedSectionId = (sectionData as any).id;
      }

      if (!resolvedSectionId) {
        return [];
      }

      // Check if this slot has versions by querying the continuity table directly
      // Since the RPC function has a bug, we'll implement the logic here
      // Type assertion to prevent TypeScript infinite recursion on Supabase query chain
      const { data: continuityData, error: continuityError } =
        await (this.supabase as any)
          .from('timetable_slot_continuity')
          .select('continuity_group_id')
          .eq('timetable_slot_id', slot_id)
          .limit(1)
          .single();

      let hasVersions = false;

      if (!continuityError && (continuityData as any)?.continuity_group_id) {
        // Check if there are multiple slots in this continuity group
        // Type assertion to prevent TypeScript infinite recursion on Supabase query chain
        const { data: groupSlots, error: groupError } = await (this.supabase as any)
          .from('timetable_slot_continuity')
          .select('id')
          .eq('continuity_group_id', (continuityData as any).continuity_group_id);

        if (!groupError && groupSlots && groupSlots.length > 1) {
          hasVersions = true;
        }
      }

      if (hasVersions) {
        // Logic for versioned slots - get timetable_id from slot
        const timetableId = await this.getTimetableIdFromSlot(slot_id);
        if (!timetableId) {
          logger.error('academic/attendance', 'Could not get timetable_id for slot', { slot_id });
          return this.getSlotAttendanceDirectly(
            slot_id,
            resolvedSectionId,
            start_date,
            end_date
          );
        }

        const { data, error } = await this.supabase
          .from('student_attendance')
          .select('*')
          .eq('timetable_id', timetableId)
          .eq('section_id', resolvedSectionId)
          .gte('attendance_date', start_date)
          .lte('attendance_date', end_date)
          .order('attendance_date', { ascending: false });

        if (error) {
          logger.error('academic/attendance', 'Error fetching attendance with versions', error);
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
      logger.error('academic/attendance', 'Error in getSlotAttendanceWithHistory', error);
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
      let query = this.supabase
        .from('student_attendance')
        .select(
          `
          id,
          attendance_date,
          attendance_data,
          created_at,
          updated_at
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

      data.forEach((record: any) => {
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
            marked_by: null,
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
      logger.error('academic/attendance', 'Error in direct slot attendance fetch', error);
      return [];
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

  /**
   * Returns the timetable ID that owns the given slot key.
   *
   * Primary path: uses student_attendance.period_slot_id as an indexed bridge (O(1)).
   * Fallback: scans active timetables JSON (O(n×m)) — only triggers for new slots
   * with no attendance records yet.
   *
   * Known limitation: the primary path returns the timetable_id from the earliest
   * attendance record for the slot. If a slot is reassigned to a new timetable,
   * the old timetable_id is returned until a new attendance record is written.
   * This is acceptable for the current schema where slots are not re-homed between timetables.
   */
  static async getTimetableIdFromSlot(slotId: string): Promise<string | null> {
    // PRIMARY PATH: Use student_attendance as an indexed bridge.
    // period_slot_id stores the slot key string; timetable_id is always populated.
    // This avoids loading all timetable JSONB into memory.
    const { data: attendanceRef, error: primaryError } = await this.supabase
      .from('student_attendance')
      .select('timetable_id')
      .eq('period_slot_id', slotId)
      .limit(1)
      .maybeSingle();

    if (!primaryError && attendanceRef?.timetable_id) {
      return attendanceRef.timetable_id;
    }

    // FALLBACK: If no attendance records exist yet for this slot (new slot),
    // scan timetables — but limit to active timetables only to reduce load.
    // Log DB error separately so it's not masked as "slot may be new"
    if (primaryError) {
      logger.warn('academic/attendance', 'Primary slot lookup failed, falling back to timetable scan', { slotId, error: primaryError });
    } else {
      // No rows means slot has never been used; falling back to scan
      logger.warn('academic/attendance', 'Falling back to timetable scan for slot lookup — slot may be new', { slotId });
    }

    const { data: timetables, error: scanError } = await this.supabase
      .from('timetables')
      .select('id, timetable_data')
      .not('timetable_data', 'is', null)
      .eq('is_active', true); // Only scan active timetables

    if (scanError || !timetables) return null;

    for (const timetable of timetables) {
      const data = (timetable as any).timetable_data;
      if (!data || typeof data !== 'object') continue;
      for (const dayData of Object.values(data)) {
        if (!dayData || typeof dayData !== 'object') continue;
        for (const [periodId, slotData] of Object.entries(dayData as Record<string, any>)) {
          if (
            (slotData as any)?.slot_id === slotId ||
            periodId === slotId
          ) {
            return (timetable as any).id;
          }
        }
      }
    }

    return null;
  }

  // Get slot details from JSON-based timetable structure
  static async getSlotDetails(slotId: string): Promise<any> {
    try {
      // Find the timetable containing this slot
      const timetableId = await this.getTimetableIdFromSlot(slotId);
      if (!timetableId) {
        logger.warn('academic/attendance', 'Could not find timetable for slot', { slotId });
        return null;
      }

      // Get the timetable data
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select('timetable_data')
        .eq('id', timetableId)
        .single();

      if (timetableError || !(timetableData as any)?.timetable_data) {
        logger.error('academic/attendance', 'Error fetching timetable data', timetableError);
        return null;
      }

      // Search through the JSON structure to find the slot
      const timetableJson = (timetableData as any).timetable_data;
      for (const [dayKey, dayData] of Object.entries(timetableJson)) {
        if (typeof dayData === 'object' && dayData !== null) {
          for (const [, slotData] of Object.entries(
            dayData as Record<string, any>
          )) {
            if (
              slotData &&
              (slotData.slot_id === slotId || slotData.id === slotId)
            ) {
              // Fetch related data
              const courseData = slotData.course_id
                ? await this.getCourseDetails(slotData.course_id)
                : null;
              const periodData = slotData.period_id
                ? await this.getPeriodDetails(slotData.period_id)
                : null;

              return {
                id: slotId,
                timetable_id: timetableId,
                day_of_week: dayKey,
                period: periodData,
                course: courseData,
                ...slotData
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('academic/attendance', 'Error getting slot details', error);
      return null;
    }
  }

  // Helper method to get course details
  private static async getCourseDetails(courseId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('courses')
        .select('id, course_name, course_code')
        .eq('id', courseId)
        .single();

      if (error) {
        logger.error('academic/attendance', 'Error fetching course details', error);
        return null;
      }

      return data;
    } catch (error) {
      logger.error('academic/attendance', 'Error in getCourseDetails', error);
      return null;
    }
  }

  // Helper method to get period details
  private static async getPeriodDetails(periodId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('periods')
        .select('id, period_name, start_time, end_time')
        .eq('id', periodId)
        .single();

      if (error) {
        logger.error('academic/attendance', 'Error fetching period details', error);
        return null;
      }

      return data;
    } catch (error) {
      logger.error('academic/attendance', 'Error in getPeriodDetails', error);
      return null;
    }
  }

  // =====================
  // LEGACY METHODS (for backward compatibility)
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
      // First, check current user authentication and profile
      const {
        data: { user },
        error: authError
      } = await this.supabase.auth.getUser();
      if (authError || !user) {
        logger.error('academic/attendance', 'Authentication error in getStudentsForAttendance', authError);
        throw new Error('User not authenticated');
      }

      // Get current user's profile to understand RLS context
      const { data: profileData, error: profileError } = await this.supabase
        .from('profiles')
        .select(
          'id, role, institution_id, department_id, is_super_admin, email'
        )
        .eq('id', user.id)
        .single();

      if (profileError) {
        logger.error('academic/attendance', 'Error fetching user profile', profileError);
        throw new Error('Failed to fetch user profile');
      }

      // Check if user meets RLS policy requirements
      const hasInstitutionAccess =
        (profileData as any).institution_id === filters.institution_id;
      const hasDepartmentAccess =
        (profileData as any).department_id === filters.department_id;
      const isSuperAdmin = (profileData as any).is_super_admin === true;
      const isPrivilegedRole = ['admission', 'administrator'].includes(
        (profileData as any).role
      );

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
      // Only apply department filter for super admin and privileged roles
      if (filters.department_id && (isSuperAdmin || isPrivilegedRole)) {
        query = query.eq('department_id', filters.department_id);
      }

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
      // Now using semester_id directly - no conversion needed

      // First, find the active timetable for the given filters that includes the selected date
      const timetableQuery = this.supabase
        .from('timetables')
        .select('id, start_date, end_date, timetable_name')
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('semester_id', String(filters.semester)) // Use semester_id column directly
        .eq('is_active', true)
        .lte('start_date', date) // start_date <= selected date
        .gte('end_date', date); // end_date >= selected date

      // Note: section filter removed as sections are at slot level, not timetable level

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) {
        logger.error('academic/attendance', 'Timetable query error', timetableError);
        throw timetableError;
      }

      if (!timetables || timetables.length === 0) {
        logger.warn('academic/attendance', 'No active timetable found for date', { date });
        return [];
      }

      const timetableId = (timetables[0] as any).id;

      // Determine day of week from date
      const dayOfWeek = this.getDayOfWeekFromDate(date);

      // Get timetable data and extract slots for the specific day
      const { data: timetableData, error: timetableDataError } =
        await this.supabase
          .from('timetables')
          .select('timetable_data')
          .eq('id', timetableId)
          .single();

      if (timetableDataError) {
        logger.error('academic/attendance', 'Timetable data query error', timetableDataError);
        throw timetableDataError;
      }

      let slots: any[] = [];
      if ((timetableData as any)?.timetable_data) {
        const daySlots = (timetableData as any).timetable_data[dayOfWeek];
        if (daySlots && typeof daySlots === 'object') {
          // Convert JSON structure to array format
          slots = Object.entries(daySlots).map(
            ([periodId, slotData]: [string, any]) => ({
              ...slotData,
              id: slotData.slot_id || periodId,
              period_id: periodId,
              day_of_week: dayOfWeek
            })
          );
        }
      }

      // Filter out break slots to only get class periods
      const classSlots = (slots || []).filter(
        (slot: any) => !slot.is_break_slot
      );

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

      // Staff assignments are now included in the JSON structure
      // No need for separate queries as staff_ids are in the slot data

      // Sort by period start time
      filteredSlots.sort((a: any, b: any) => {
        const timeA = a.period?.start_time || '';
        const timeB = b.period?.start_time || '';
        return timeA.localeCompare(timeB);
      });

      return filteredSlots as unknown as any[];
    } catch (error) {
      logger.error('academic/attendance', 'Error fetching timetable slots for date', error);
      throw error;
    }
  }

  // Get attendance records for a specific slot and date
  // NOTE: This method is deprecated and returns empty array since we moved to consolidated approach
  static async getAttendanceRecords(
    _timetable_slot_id: string,
    _attendance_date: string
  ): Promise<StudentAttendance[]> {
    try {
      // Since we moved to consolidated attendance, individual records no longer exist
      // Return empty array to indicate no existing attendance in old format
      return [];
    } catch (error) {
      logger.error('academic/attendance', 'Error fetching attendance records', error);
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
          logger.error('academic/attendance', `Could not resolve section name "${resolvedSectionId}"`, sectionError);
          // Proceed with original (likely incorrect) ID, or could throw error
        } else {
          resolvedSectionId = (sectionData as any).id;
        }
      }

      // Get slot details using the new JSON-based approach
      const slot = await this.getSlotDetails(timetable_slot_id);

      if (!slot) {
        throw new Error(`Slot ${timetable_slot_id} not found`);
      }

      // Get section IDs assigned to this slot from JSON structure
      const sectionIds = slot.section_ids || [];

      if (sectionIds.length === 0) {
        logger.warn('academic/attendance', 'No sections assigned to timetable slot', { timetable_slot_id });
        return {
          students: [],
          timetable_slot:
            slot as unknown as AttendanceRosterData['timetable_slot'],
          attendance_date
        };
      }

      // Get students for the sections assigned to this slot
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
          lifecycle_status,
          section:sections(
            id,
            section_name
          )
        `
        )
        .eq('lifecycle_status', 'active')
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
        (student: any) => {
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
        timetable_slot:
          slot as unknown as AttendanceRosterData['timetable_slot'],
        attendance_date
      };
    } catch (error) {
      logger.error('academic/attendance', 'Error fetching attendance roster', error);
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
      // Add warning if multiple programs might conflict
      if (!filters.program_id || !filters.department_id) {
        logger.warn('academic/attendance', 'Missing program/department filters - this might cause cross-program conflicts');
      }

      const dayOfWeek = this.getDayOfWeekFromDate(date);

      // Fetch all active timetables for the given context (both regular and batch)
      // Updated: 2025-10-09 - Added timetable_type to query for section-level filtering
      let timetableQuery = this.supabase
        .from('timetables')
        .select(
          `id, timetable_format, timetable_type, start_date, end_date, selected_dates, section_id, semester_id, timetable_data,
           degrees(degree_name),
           programs(program_name),
           departments(department_name),
           semesters(semester_name),
           sections(section_name)`
        )
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('is_active', true);

      // Use the semester_id column for comparison (timetables table stores semester_id as UUID)
      timetableQuery = timetableQuery.eq('semester_id', String(filters.semester));

      let timetables;
      let timetableError;

      try {
        const result = await timetableQuery;
        timetables = result.data;
        timetableError = result.error;
      } catch (networkError) {
        logger.error('academic/attendance', 'Network error fetching timetables', networkError);
        throw new Error(
          `Failed to fetch timetables: ${networkError instanceof Error
            ? networkError.message
            : 'Network error'
          }`
        );
      }

      if (timetableError) {
        logger.error('academic/attendance', 'Database error fetching timetables', timetableError);
        throw new Error(
          `Database error: ${timetableError.message || 'Unknown database error'
          }`
        );
      }

      if (!timetables || timetables.length === 0) {
        logger.warn('academic/attendance', 'No active timetables found for the given criteria', {
          semester_id: filters.semester,
          section_id: filters.section
        });
        return [];
      }

      // Updated: 2025-10-09 - Filter section-level timetables by section_id
      // For section-level timetables, we need to filter by the timetable's section_id
      // For semester-level timetables, we'll filter by slot section_ids later
      if (filters.section) {
        timetables = timetables.filter((t: any) => {
          // For semester-level timetables, keep them (we'll filter by slot section_ids later)
          if (t.timetable_type === 'semester') {
            return true;
          }
          // For section-level timetables, only keep if section_id matches
          return t.section_id === filters.section;
        });

        if (timetables.length === 0) {
          logger.warn('academic/attendance', 'No timetables found after section filtering', { section: filters.section });
          return [];
        }
      }

      // Collect all slots from all relevant timetables
      const allSlots: any[] = [];

      for (const timetable of timetables) {
        // Check date range for ALL timetable formats (both regular and batch)
        if ((timetable as any).start_date && (timetable as any).end_date) {
          const searchDate = new Date(date);
          const startDate = new Date((timetable as any).start_date);
          const endDate = new Date((timetable as any).end_date);

          // Skip this timetable if the date is outside its range
          if (searchDate < startDate || searchDate > endDate) {
            continue;
          }
        }

        // Additional checks for batch timetables
        if ((timetable as any).timetable_format === 'batch') {
          // Also check if the date is in the selected_dates array
          if ((timetable as any).selected_dates) {
            let dateIsInRange = false;
            const dateStr = date;

            // Check if date is covered by any of the date ranges
            for (const item of (timetable as any).selected_dates) {
              if (typeof item === 'string' && item.startsWith('RANGE:')) {
                const parts = item.split(':');
                if (parts.length === 3) {
                  const rangeStart = new Date(parts[1]);
                  const rangeEnd = new Date(parts[2]);
                  const checkDate = new Date(dateStr);

                  if (checkDate >= rangeStart && checkDate <= rangeEnd) {
                    dateIsInRange = true;
                    break;
                  }
                }
              }
            }

            if (!dateIsInRange) {
              continue;
            }
          }
        }

        // Extract slots directly from timetable_data (avoiding RLS issues with RPC functions)
        let slots: any[] = [];
        try {
          const timetableData = (timetable as any).timetable_data;
          if (timetableData && typeof timetableData === 'object') {
            if ((timetable as any).timetable_format === 'batch') {
              if (!date) {
                logger.error('academic/attendance', 'Date is required for batch timetables');
                continue;
              }

              // For batch timetables, extract slots for the specific date
              // Strategy: Find the date range that contains the query date, then look for slots
              // from dates in that range and apply the pattern to the query date

              // Step 1: Find which date range contains the query date
              let matchingRangeStart = null;
              let matchingRangeEnd = null;

              if (
                (timetable as any).selected_dates &&
                Array.isArray((timetable as any).selected_dates)
              ) {
                const queryDate = new Date(date);

                for (const dateItem of (timetable as any).selected_dates) {
                  if (
                    typeof dateItem === 'string' &&
                    dateItem.startsWith('RANGE:')
                  ) {
                    const parts = dateItem.split(':');
                    if (parts.length === 3) {
                      const rangeStart = new Date(parts[1]);
                      const rangeEnd = new Date(parts[2]);

                      if (queryDate >= rangeStart && queryDate <= rangeEnd) {
                        matchingRangeStart = parts[1];
                        matchingRangeEnd = parts[2];
                        break;
                      }
                    }
                  }
                }
              }

              if (matchingRangeStart && matchingRangeEnd) {

                // Step 2: Find ONE representative slot per period from this date range
                // Use a Map to track which periods we've already found slots for
                // FIX: 2025-12-06 - Store the actual slot data (not just boolean) to compare staff counts
                // Updated: 2025-12-11 - Added isFromRange to prefer RANGE slots over individual slots
                const periodSlotMap = new Map<string, { slotData: any; day: string; staffCount: number; isFromRange?: boolean }>();

                Object.keys(timetableData).forEach((day) => {
                  const daySlots = timetableData[day];
                  if (daySlots && typeof daySlots === 'object') {
                    Object.keys(daySlots).forEach((periodId) => {
                      const slotData = daySlots[periodId];

                      // Skip break slots
                      if (slotData && slotData.is_break_slot) {
                        return;
                      }

                      // FIX: Smart date parsing to handle both regular dates AND range strings
                      // Updated: 2025-11-28 - Fix for section-level batch timetables not showing in attendance search
                      if (slotData) {
                        let shouldIncludeSlot = false;

                        if (slotData.slot_date) {
                          if (
                            typeof slotData.slot_date === 'string' &&
                            slotData.slot_date.startsWith('RANGE:')
                          ) {
                            // slot_date is a range marker (e.g., "RANGE:2025-11-02:2025-11-27")
                            // Check if query date falls within this range
                            const parts = slotData.slot_date.split(':');
                            if (parts.length === 3) {
                              const slotRangeStart = new Date(parts[1]);
                              const slotRangeEnd = new Date(parts[2]);
                              const queryDate = new Date(date);
                              shouldIncludeSlot =
                                queryDate >= slotRangeStart &&
                                queryDate <= slotRangeEnd;

                            }
                          } else {
                            // slot_date is a specific date (e.g., "2025-11-27") - use existing comparison logic
                            const slotDate = new Date(slotData.slot_date);
                            if (!isNaN(slotDate.getTime())) {
                              const rangeStart = new Date(matchingRangeStart);
                              const rangeEnd = new Date(matchingRangeEnd);
                              shouldIncludeSlot =
                                slotDate >= rangeStart && slotDate <= rangeEnd;

                            }
                          }
                        }

                        if (shouldIncludeSlot) {
                          // FIX: 2025-12-11 - Prefer RANGE slots over individual date slots for consistency with grid
                          // The grid displays from RANGE slots, so attendance should match
                          // Only use "prefer more staff" as tiebreaker when both slots are same type
                          const currentStaffCount = slotData.staff_ids?.length || 0;
                          const existingSlot = periodSlotMap.get(periodId);

                          // Track if slot comes from RANGE key vs individual date key
                          const isFromRange = slotData.slot_date?.startsWith('RANGE:');
                          const existingIsFromRange = existingSlot?.isFromRange;

                          if (!existingSlot) {
                            // First slot for this period - store it with range flag
                            periodSlotMap.set(periodId, {
                              slotData,
                              day,
                              staffCount: currentStaffCount,
                              isFromRange
                            });
                          } else if (isFromRange && !existingIsFromRange) {
                            // Current is RANGE, existing is individual → prefer RANGE for consistency
                            periodSlotMap.set(periodId, {
                              slotData,
                              day,
                              staffCount: currentStaffCount,
                              isFromRange
                            });
                          } else if (currentStaffCount > existingSlot.staffCount && !(!isFromRange && existingIsFromRange)) {
                            // Both same type and current has more staff - use as tiebreaker
                            periodSlotMap.set(periodId, {
                              slotData,
                              day,
                              staffCount: currentStaffCount,
                              isFromRange
                            });
                          }
                          // If current has fewer or equal staff and same type, keep existing
                          // If current is individual and existing is RANGE → keep RANGE
                        }
                      }
                    });
                  }
                });

                // Build final slots array from the map (with slots having most staff)
                periodSlotMap.forEach(({ slotData, day }, periodId) => {
                  slots.push({
                    ...slotData,
                    period_id: periodId,
                    day_of_week: day,
                    id: slotData.slot_id,
                    // Override slot_date with query date for attendance tracking
                    slot_date: date,
                    _original_slot_date: slotData.slot_date // Keep original for reference
                  });
                });
              }
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

          // Fetch related data for slots
          if (slots.length > 0) {
            // Get unique IDs for fetching related data
            // Updated: 2025-10-13 - Include course_ids from sub_slots for subdivision support
            const uniqueCourseIds = [
              ...new Set([
                ...slots.map((s) => s.course_id).filter(Boolean),
                ...slots
                  .flatMap((s) =>
                    (s.sub_slots || []).map((ss: any) => ss.course_id)
                  )
                  .filter(Boolean)
              ])
            ];
            const uniqueStaffIds = [
              ...new Set([
                ...slots.flatMap((s) => s.staff_ids || []).filter(Boolean),
                ...slots
                  .flatMap((s) =>
                    (s.sub_slots || []).flatMap((ss: any) => ss.staff_ids || [])
                  )
                  .filter(Boolean)
              ])
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
                courses?.forEach((course: any) => coursesMap.set(course.id, course));
              } catch (error) {
                logger.error('academic/attendance', 'Error fetching courses', error);
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
                staff?.forEach((s: any) => staffMap.set(s.id, s));
              } catch (error) {
                logger.error('academic/attendance', 'Error fetching staff', error);
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
                sections?.forEach((section: any) =>
                  sectionsMap.set(section.id, section)
                );
              } catch (error) {
                logger.error('academic/attendance', 'Error fetching sections', error);
              }
            }

            // Updated: 2026-02-06 - Inject timetable-level section_id into slots for section-level timetables
            // For section-level timetables, the section_id is stored on the timetable record,
            // not in each slot's section_ids array. Practical periods especially may have empty section_ids.
            if (
              (timetable as any).timetable_type === 'section' &&
              (timetable as any).section_id
            ) {
              const timetableSectionId = (timetable as any).section_id;
              slots = slots.map((slot) => {
                if (!slot.section_ids || slot.section_ids.length === 0) {
                  return { ...slot, section_ids: [timetableSectionId] };
                }
                return slot;
              });

              // Ensure the timetable's section is in the sectionsMap for resolution
              if (!sectionsMap.has(timetableSectionId) && uniqueSectionIds.indexOf(timetableSectionId) === -1) {
                try {
                  const { data: sectionData } = await this.supabase
                    .from('sections')
                    .select('*')
                    .eq('id', timetableSectionId)
                    .single();
                  if (sectionData) {
                    sectionsMap.set(timetableSectionId, sectionData);
                  }
                } catch (error) {
                  logger.warn('academic/attendance', 'Could not fetch timetable section', { timetableSectionId });
                }
              }
            }

            // Enhance slots with related data
            slots = slots.map((slot) => {
              // For section-level timetables, get section name from timetable.sections
              // For semester-level timetables, get from slot.section_ids
              let sectionName = '';
              if (
                (timetable as any).timetable_type === 'section' &&
                (timetable as any).sections?.section_name
              ) {
                sectionName = (timetable as any).sections.section_name;
              } else if (slot.section_ids && slot.section_ids.length > 0) {
                const firstSection = sectionsMap.get(slot.section_ids[0]);
                sectionName = firstSection?.section_name || '';
              }

              // Updated: 2025-10-13 - Enhance sub_slots with course data
              const enhancedSubSlots = (slot.sub_slots || []).map(
                (subSlot: any) => ({
                  ...subSlot,
                  // Add course details from coursesMap if course_id exists
                  course_name: subSlot.course_id
                    ? coursesMap.get(subSlot.course_id)?.course_name ||
                    subSlot.course_name
                    : subSlot.course_name,
                  course_code: subSlot.course_id
                    ? coursesMap.get(subSlot.course_id)?.course_code ||
                    subSlot.course_code
                    : subSlot.course_code,
                  // Add staff members from staffMap
                  staff_members: (subSlot.staff_ids || [])
                    .map((id: string) => staffMap.get(id))
                    .filter(Boolean)
                })
              );

              return {
                ...slot,
                section_name: sectionName, // Add section_name directly to slot
                course: slot.course_id ? coursesMap.get(slot.course_id) : null,
                staff_members: (slot.staff_ids || [])
                  .map((id: string) => staffMap.get(id))
                  .filter(Boolean),
                sections: (slot.section_ids || [])
                  .map((id: string) => sectionsMap.get(id))
                  .filter(Boolean),
                sub_slots: enhancedSubSlots
              };
            });
          }
        } catch (error) {
          logger.error('academic/attendance', 'Error extracting slots from timetable_data', error);
          continue;
        }

        // Store staffId for later filtering if needed
        let staffIdForFiltering: string | null = null;
        let isHODUser = false;

        if (options.filterByStaffAssignment && !options.isSuperAdmin) {
          staffIdForFiltering = await this.getCurrentUserStaffId();

          if (!staffIdForFiltering) {
            // Check if user is HOD - HOD users don't have staff records but should see their department's periods
            const { data: userData } = await (this.supabase as any).auth.getUser();
            if (userData.user) {
              const { data: profile } = await this.supabase
                .from('profiles')
                .select('role, department_id')
                .eq('id', userData.user.id)
                .single();

              if (
                (profile as any)?.role === 'hod' &&
                (profile as any).department_id === filters.department_id
              ) {
                isHODUser = true;
              } else {
                continue; // Skip this timetable if user has no staff access and is not HOD
              }
            } else {
              continue;
            }
          }
        }

        if (slots && slots.length > 0) {
          // Filter slots by staff assignment if needed (but not for super admin or HOD users)
          let filteredSlots = slots;
          if (staffIdForFiltering && !options.isSuperAdmin && !isHODUser) {

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

            // Warning: If all slots were filtered out, this may indicate a duplicate staff record issue
            if (slots.length > 0 && filteredSlots.length === 0) {
              logger.warn('academic/attendance', 'All slots filtered out for staff - possible duplicate staff record', {
                userStaffId: staffIdForFiltering,
                sampleSlotStaffIds: slots[0]?.staff_ids || [],
                timetableId: (timetable as any).id
              });
            }
          }

          // Add the timetable_id and staff filtering context to each slot for reference
          // Updated: 2025-10-13 - Include staff filtering info for subdivision expansion
          const slotsWithTimetableId = filteredSlots.map((slot: any) => ({
            ...slot,
            timetable_id: (timetable as any).id,
            _staff_filter_id: staffIdForFiltering, // Track staff ID for subdivision filtering
            _is_hod_user: isHODUser, // Track if user is HOD
            _is_super_admin: options.isSuperAdmin // Track if user is super admin
          }));
          allSlots.push(...slotsWithTimetableId);
        }
      }

      // If no slots found from any timetable
      if (allSlots.length === 0) {
        return [];
      }

      // Get period details for all unique period IDs found in slots
      const uniquePeriodIds = [
        ...new Set(allSlots.map((slot: any) => slot.period_id).filter(Boolean))
      ];

      let periodsData: any[] = [];
      if (uniquePeriodIds.length > 0) {
        try {
          const { data: periods, error: periodsError } = await this.supabase
            .from('periods')
            .select('*')
            .in('id', uniquePeriodIds);

          if (periodsError) {
            logger.error('academic/attendance', 'Error fetching periods', periodsError);
          } else {
            periodsData = periods || [];
          }
        } catch (error) {
          logger.error('academic/attendance', 'Error fetching periods data', error);
        }
      }

      // Map all collected slots to AttendancePeriodOption with validation
      let filteredOutBreakCount = 0;
      const availablePeriods = allSlots
        .filter((slot: any) => {
          // Ensure slot has required fields
          if (!slot || !slot.period_id) {
            return false;
          }

          // Filter out break periods - they should not appear in attendance
          const periodData = periodsData.find((p) => p.id === slot.period_id);
          if (periodData?.is_break) {
            filteredOutBreakCount++;
            return false;
          }

          return true;
        })
        .map((slot: any) => {
          // Find the period data for this slot
          const periodData = periodsData.find((p) => p.id === slot.period_id);
          // Find the timetable for this slot to get related names
          const timetableData = timetables.find(
            (t: any) => t.id === slot.timetable_id
          );

          return {
            timetable_slot_id: slot.slot_id || slot.id,
            timetable_id: slot.timetable_id,
            id: slot.period_id,
            period_name: periodData?.period_name || 'Unknown Period',
            start_time: periodData?.start_time || '',
            end_time: periodData?.end_time || '',
            is_break: periodData?.is_break || false,
            // Add the hierarchy names from timetable relations
            degree_name: Array.isArray((timetableData as any)?.degrees)
              ? (timetableData as any).degrees[0]?.degree_name || ''
              : ((timetableData as any)?.degrees as any)?.degree_name || '',
            program_name: Array.isArray((timetableData as any)?.programs)
              ? (timetableData as any).programs[0]?.program_name || ''
              : ((timetableData as any)?.programs as any)?.program_name || '',
            department_name: Array.isArray((timetableData as any)?.departments)
              ? (timetableData as any).departments[0]?.department_name || ''
              : ((timetableData as any)?.departments as any)?.department_name || '',
            semester_name: Array.isArray((timetableData as any)?.semesters)
              ? (timetableData as any).semesters[0]?.semester_name || ''
              : ((timetableData as any)?.semesters as any)?.semester_name || '',
            // Updated: 2025-10-09 - Fix section name for section-level timetables
            // Priority 1: slot.section_name (direct property from slot data)
            // Priority 2: timetableData.sections from join (section-level timetables)
            // Priority 3: slot.sections array with 'name' property (semester-level slots)
            // Priority 4: slot.sections array with 'section_name' property (fallback)
            section_name:
              slot.section_name ||
              ((timetableData as any)?.sections as any)?.section_name ||
              (Array.isArray(slot.sections) && slot.sections.length > 0
                ? slot.sections[0]?.name || slot.sections[0]?.section_name || ''
                : ''),
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
            sections: slot.sections || [],
            // Updated: 2026-02-06 - Pass through period_mode and practical_config for dual-mode period support
            // Practical periods use batches instead of sections for runtime attendance selection
            period_mode: slot.period_mode || 'standard',
            practical_config: slot.practical_config || undefined,
            // Updated: 2025-10-13 - Pass through staff filtering metadata for subdivision expansion
            _staff_filter_id: slot._staff_filter_id,
            _is_hod_user: slot._is_hod_user,
            _is_super_admin: slot._is_super_admin
          };
        });

      // Updated: 2025-10-13 - Expand subdivision slots into separate period entries
      // For subdivided slots (practical/lab groups), create one period entry per group
      const expandedPeriods = availablePeriods.flatMap((period: any) => {
        // Check if this is a subdivided slot with sub_slots
        if (
          period.sub_slots &&
          Array.isArray(period.sub_slots) &&
          period.sub_slots.length > 0
        ) {
          // Filter sub-slots by staff assignment if needed
          let subSlotsToExpand = period.sub_slots;

          if (
            period._staff_filter_id &&
            !period._is_hod_user &&
            !period._is_super_admin
          ) {
            // Filter to only sub-slots where this staff member is assigned
            subSlotsToExpand = period.sub_slots.filter((subSlot: any) => {
              const isAssignedToSubSlot =
                subSlot.staff_ids &&
                Array.isArray(subSlot.staff_ids) &&
                subSlot.staff_ids.includes(period._staff_filter_id);
              return isAssignedToSubSlot;
            });
          }

          // If no sub-slots remain after filtering, return empty array (hide this period)
          if (subSlotsToExpand.length === 0) {
            return [];
          }

          // Create a separate period entry for each sub-slot/group
          return subSlotsToExpand.map((subSlot: any, index: number) => {
            const groupName =
              subSlot.group_name || `Group ${String.fromCharCode(65 + index)}`;
            const groupOrder = subSlot.sub_slot_order || index + 1;

            const groupPeriod = {
              ...period,
              // Modify timetable_slot_id to be unique for each group
              timetable_slot_id: `${period.timetable_slot_id}_group_${groupOrder}`,
              // Updated: 2025-10-13 - Add group name to period_name for display
              period_name: `${period.period_name} - ${groupName}`,
              // Override course if sub-slot has its own course (Updated: 2025-10-13)
              course: subSlot.course_id
                ? {
                  id: subSlot.course_id,
                  course_name:
                    subSlot.course_name || period.course?.course_name || '',
                  course_code:
                    subSlot.course_code || period.course?.course_code || ''
                }
                : period.course,
              // Updated: 2025-10-13 - Override section_name to include group info for better identification
              section_name: `${period.section_name} - ${groupName}`,
              // Use sub-slot's staff members instead of main slot's staff
              staff_members: subSlot.staff_members || [],
              // Add subdivision metadata for identification
              is_subdivided: true,
              subdivision_type: subSlot.subdivision_type || 'practical',
              subdivision_group: {
                group_order: groupOrder,
                group_name: groupName,
                lab_room: subSlot.lab_room,
                max_capacity: subSlot.max_capacity,
                student_ids: subSlot.student_ids || [],
                staff_ids: subSlot.staff_ids || []
              },
              // Keep original sub_slots for reference but mark as expanded
              sub_slots: [subSlot], // Only include this specific sub-slot
              _expanded_from_slot_id: period.timetable_slot_id // Track original slot
            };

            return groupPeriod;
          });
        }

        // Not a subdivided slot, return as-is
        return [period];
      });

      // Updated: 2025-10-09 - Remove duplicates based on timetable_slot_id (not period id)
      // For batch timetables, the same period can have multiple slots on different dates
      // We want to keep all unique slots, not de-duplicate by period
      // Updated: 2025-10-13 - Use expandedPeriods instead of availablePeriods
      const uniquePeriods = expandedPeriods.filter(
        (period, index, self) =>
          index ===
          self.findIndex(
            (p) => p.timetable_slot_id === period.timetable_slot_id
          )
      );

      const sortedPeriods = uniquePeriods.sort((a, b) => {
        if (a.start_time < b.start_time) return -1;
        if (a.start_time > b.start_time) return 1;
        return 0;
      });

      // Updated: 2025-10-13 - Clean up internal metadata fields before returning
      const cleanedPeriods = sortedPeriods.map((period: any) => {
        const {
          _staff_filter_id,
          _is_hod_user,
          _is_super_admin,
          ...cleanPeriod
        } = period;
        return cleanPeriod;
      });

      // Final validation to ensure we always return an array
      return Array.isArray(cleanedPeriods) ? cleanedPeriods : [];
    } catch (error) {
      logger.error('academic/attendance', 'Error in getAvailablePeriodsForDate', error);
      return [];
    }
  }

  /**
   * Updated: 2025-10-09 - Get timetable type for a semester to determine if section is required
   * Returns 'semester' for semester-level timetables (section optional)
   * Returns 'section' for section-level timetables (section required)
   * Returns null if no timetables found
   */
  static async getTimetableTypeForSemester(
    institution_id: string,
    academic_year_id: string,
    degree_id: string,
    program_id: string,
    department_id: string,
    semester_id: string
  ): Promise<'semester' | 'section' | null> {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select('timetable_type')
        .eq('institution_id', institution_id)
        .eq('academic_year_id', academic_year_id)
        .eq('degree_id', degree_id)
        .eq('program_id', program_id)
        .eq('department_id', department_id)
        .eq('semester_id', semester_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error('academic/attendance', 'Error checking timetable type', error);
        return null;
      }

      if (!data) {
        logger.warn('academic/attendance', 'No timetables found for this semester');
        return null;
      }

      const timetableType = (data as any).timetable_type as 'semester' | 'section';
      return timetableType;
    } catch (error) {
      logger.error('academic/attendance', 'Error in getTimetableTypeForSemester', error);
      return null;
    }
  }

  // Get attendance records with filters
  // NOTE: This method is deprecated since we moved to consolidated approach
  static async getAttendance(
    filters: AttendanceFilters = {}
  ): Promise<AttendanceListResponse> {
    try {
      // Since we moved to consolidated attendance, return empty result
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
      logger.error('academic/attendance', 'Error fetching attendance', error);
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

    try {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
      }

      // Parse the date parts to avoid timezone issues
      const [year, month, day] = date.split('-').map(Number);

      // Validate date components
      if (year < 1900 || year > 2100) {
        throw new Error(`Invalid year: ${year}`);
      }
      if (month < 1 || month > 12) {
        throw new Error(`Invalid month: ${month}`);
      }
      if (day < 1 || day > 31) {
        throw new Error(`Invalid day: ${day}`);
      }

      // Create date using local timezone (month is 0-indexed in JS)
      const dateObj = new Date(year, month - 1, day);

      // Validate that the date is valid (handles invalid dates like Feb 30)
      if (
        dateObj.getFullYear() !== year ||
        dateObj.getMonth() !== month - 1 ||
        dateObj.getDate() !== day
      ) {
        throw new Error(`Invalid date: ${date}`);
      }

      return days[dateObj.getDay()];
    } catch (error) {
      logger.error('academic/attendance', 'Error parsing date', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : `Failed to parse date: ${date}`;
      throw new Error(errorMessage);
    }
  }

  // Debug and validate attendance records
  static async debugAttendanceRecord(
    recordId?: string,
    options?: {
      checkDate?: string;
      timetableId?: string;
      sectionId?: string;
    }
  ): Promise<{
    record?: any;
    issues: string[];
    suggestions: string[];
    timetableInfo?: any;
    semesterInfo?: any;
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let record: any = null;
    let timetableInfo: any = null;
    let semesterInfo: any = null;

    try {
      if (recordId) {
        // Debug specific record
        const { data, error } = await this.supabase
          .from('student_attendance')
          .select('*')
          .eq('id', recordId)
          .single();

        if (error || !data) {
          issues.push(`Cannot find attendance record with ID: ${recordId}`);
          return { issues, suggestions };
        }

        record = data;
      } else if (
        options?.checkDate &&
        options?.timetableId &&
        options?.sectionId
      ) {
        // Debug by criteria
        const { data, error } = await this.supabase
          .from('student_attendance')
          .select('*')
          .eq('attendance_date', options.checkDate)
          .eq('timetable_id', options.timetableId)
          .eq('section_id', options.sectionId)
          .maybeSingle();

        record = data;
        if (error) {
          issues.push(`Error querying attendance: ${error.message}`);
        }
        if (!record) {
          issues.push(
            `No attendance record found for date: ${options.checkDate}, timetable: ${options.timetableId}, section: ${options.sectionId}`
          );
        }
      } else {
        issues.push(
          'Please provide either recordId or (checkDate + timetableId + sectionId)'
        );
        return { issues, suggestions };
      }

      if (record) {
        // Check for null values
        const nullFields = [];
        if (!(record as any).semester_id) nullFields.push('semester_id');
        if (!(record as any).academic_year_id) nullFields.push('academic_year_id');
        if (!(record as any).degree_id) nullFields.push('degree_id');
        if (!(record as any).program_id) nullFields.push('program_id');
        if (!(record as any).department_id) nullFields.push('department_id');

        if (nullFields.length > 0) {
          issues.push(`Null fields detected: ${nullFields.join(', ')}`);
        }

        // Fetch timetable information
        if ((record as any).timetable_id) {
          const { data: timetableData, error: timetableError } =
            await this.supabase
              .from('timetables')
              .select(
                'id, semester, semester_id, section, section_id, degree_id, program_id, department_id, academic_year_id'
              )
              .eq('id', (record as any).timetable_id)
              .single();

          if (!timetableError && timetableData) {
            timetableInfo = timetableData;

            // Check if timetable has missing semester_id
            if (!(timetableData as any).semester_id) {
              issues.push(
                `Timetable ${(record as any).timetable_id} is missing semester_id`
              );
              suggestions.push(
                `Update timetable ${(record as any).timetable_id} with correct semester_id`
              );
            }

            // Check if record fields match timetable
            if (
              (timetableData as any).degree_id &&
              (record as any).degree_id !== (timetableData as any).degree_id
            ) {
              issues.push(
                `Degree mismatch: record=${(record as any).degree_id}, timetable=${(timetableData as any).degree_id}`
              );
            }
            if (
              (timetableData as any).program_id &&
              (record as any).program_id !== (timetableData as any).program_id
            ) {
              issues.push(
                `Program mismatch: record=${(record as any).program_id}, timetable=${(timetableData as any).program_id}`
              );
            }
          }
        }

        // Try to find correct semester_id if missing
        if (
          !(record as any).semester_id &&
          (timetableInfo as any)?.semester &&
          (timetableInfo as any)?.degree_id &&
          (timetableInfo as any)?.program_id
        ) {
          const { data: semesterData, error: semesterError } =
            await this.supabase
              .from('semesters')
              .select('id, semester_name')
              .eq('semester_name', (timetableInfo as any).semester)
              .eq('degree_id', (timetableInfo as any).degree_id)
              .eq('program_id', (timetableInfo as any).program_id)
              .single();

          if (!semesterError && semesterData) {
            semesterInfo = semesterData;
            suggestions.push(
              `Record should have semester_id: ${(semesterData as any).id} (${(semesterData as any).semester_name})`
            );
            suggestions.push(
              `UPDATE student_attendance SET semester_id = '${(semesterData as any).id}' WHERE id = '${(record as any).id}'`
            );
          } else {
            issues.push(
              `Cannot resolve semester_id for semester '${(timetableInfo as any).semester}'`
            );
          }
        }

      }

      return {
        record,
        issues,
        suggestions,
        timetableInfo,
        semesterInfo
      };
    } catch (error) {
      logger.error('academic/attendance', 'Error debugging attendance record', error);
      issues.push(
        `Debug error: ${error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return { issues, suggestions };
    }
  }

  // Bulk fix attendance records with missing semester_id
  static async fixAttendanceRecords(
    options: {
      dryRun?: boolean;
      dateRange?: { start: string; end: string };
      limit?: number;
    } = {}
  ): Promise<{
    totalFound: number;
    fixedCount: number;
    errors: string[];
    summary: any[];
  }> {
    const { dryRun = true, dateRange, limit = 100 } = options;
    const errors: string[] = [];
    const summary: any[] = [];
    let fixedCount = 0;

    try {
      // Find records with null semester_id
      let query = this.supabase
        .from('student_attendance')
        .select('id, attendance_date, timetable_id, semester_id')
        .is('semester_id', null)
        .limit(limit);

      if (dateRange) {
        query = query
          .gte('attendance_date', dateRange.start)
          .lte('attendance_date', dateRange.end);
      }

      const { data: recordsToFix, error: queryError } = await query;

      if (queryError) {
        errors.push(`Query error: ${queryError.message}`);
        return { totalFound: 0, fixedCount: 0, errors, summary };
      }

      const totalFound = recordsToFix?.length || 0;

      if (!recordsToFix || recordsToFix.length === 0) {
        return { totalFound: 0, fixedCount: 0, errors, summary };
      }

      // Process each record
      for (const record of recordsToFix) {
        try {
          const debugResult = await this.debugAttendanceRecord((record as any).id);

          if (debugResult.semesterInfo && (debugResult.semesterInfo as any).id) {
            const recordSummary = {
              record_id: (record as any).id,
              attendance_date: (record as any).attendance_date,
              timetable_id: (record as any).timetable_id,
              resolved_semester_id: (debugResult.semesterInfo as any).id,
              semester_name: (debugResult.semesterInfo as any).semester_name,
              action: dryRun ? 'would_fix' : 'fixed'
            };

            if (!dryRun) {
              // Actually update the record
              const { error: updateError } = await (this.supabase
                .from('student_attendance') as any)
                .update({ semester_id: (debugResult.semesterInfo as any).id })
                .eq('id', (record as any).id);

              if (updateError) {
                errors.push(
                  `Failed to fix record ${(record as any).id}: ${updateError.message}`
                );
                recordSummary.action = 'failed';
              } else {
                fixedCount++;
              }
            }

            summary.push(recordSummary);
          } else {
            summary.push({
              record_id: (record as any).id,
              attendance_date: (record as any).attendance_date,
              timetable_id: (record as any).timetable_id,
              action: 'cannot_resolve',
              issues: debugResult.issues
            });
          }
        } catch (error) {
          errors.push(
            `Error processing record ${(record as any).id}: ${error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      return { totalFound, fixedCount, errors, summary };
    } catch (error) {
      logger.error('academic/attendance', 'Error in fixAttendanceRecords', error);
      errors.push(
        `Fix operation error: ${error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return { totalFound: 0, fixedCount: 0, errors, summary };
    }
  }

  // =====================
  // PRACTICAL PERIOD METHODS (Dual-Mode Period System)
  // Updated: 2025-10-25
  // Note: checkPracticalConflict moved to AttendanceCoreService
  // =====================

  /**
   * Get practical period configuration from timetable data
   */
  static async getPracticalPeriodConfig(
    timetableId: string,
    periodSlotId: string
  ): Promise<any | null> {
    try {
      const { data: timetableData, error } = await this.supabase
        .from('timetables')
        .select('timetable_data')
        .eq('id', timetableId)
        .single();

      if (error || !timetableData) {
        logger.error('academic/attendance', 'Error fetching timetable data', error);
        return null;
      }

      const timetableDataObj = (timetableData as any).timetable_data || {};

      // Search through all days to find the period slot
      for (const day of Object.keys(timetableDataObj)) {
        const dayData = timetableDataObj[day];
        if (dayData[periodSlotId]) {
          const periodConfig = dayData[periodSlotId];
          if (periodConfig.period_mode === 'practical') {
            return periodConfig.practical_config || null;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('academic/attendance', 'Error in getPracticalPeriodConfig', error);
      return null;
    }
  }

  // =====================
  // PROFILE / STAFF LOOKUP METHODS
  // =====================

  /**
   * Resolve the staff record for a given auth profile ID.
   * Used by report pages to map the logged-in user's profile to their staff row.
   */
  static async getStaffByProfileId(
    profileId: string,
    institutionId: string
  ): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from('staff')
      .select('id')
      .eq('profile_id', profileId)
      .eq('institution_id', institutionId)
      .maybeSingle();

    if (error) {
      logger.error('academic/attendance', 'Failed to look up staff record for profile', { profileId, institutionId, error });
      return null;
    }
    if (!data) {
      logger.warn('academic/attendance', 'No staff record found for profile', { profileId, institutionId });
      return null;
    }
    return data;
  }
}
