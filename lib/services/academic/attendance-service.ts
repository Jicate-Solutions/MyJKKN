import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  StudentAttendance,
  // CreateStudentAttendanceDto,
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
  // CreateConsolidatedAttendanceDto,
  // UpdateConsolidatedAttendanceDto,
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
  // STAFF ASSIGNMENT VALIDATION METHODS
  // =====================

  /**
   * Updated: 2025-09-07 - Improved staff assignment validation
   * Validate if the current user is authorized to mark attendance for a specific timetable period
   */
  static async validateStaffAssignment(
    timetableId: string,
    markedBy: string,
    institutionId: string
  ): Promise<{
    isAuthorized: boolean;
    reason?: string;
    assignedStaff?: any[];
  }> {
    try {
      // STEP 1: Check if user is super admin first (super admins can mark any attendance)
      const { data: superAdminCheck } = await this.supabase
        .from('user_institution_access')
        .select('access_type')
        .eq('user_id', markedBy)
        .eq('institution_id', institutionId)
        .eq('access_type', 'super_admin')
        .eq('is_active', true)
        .maybeSingle();

      if (superAdminCheck) {
        console.log('✅ Super admin access granted for user:', markedBy);
        return { isAuthorized: true, reason: 'Super admin access' };
      }

      // STEP 2: Check if user has admin role (admins can also mark any attendance)
      const { data: adminCheck } = await this.supabase
        .from('user_institution_access')
        .select('access_type')
        .eq('user_id', markedBy)
        .eq('institution_id', institutionId)
        .eq('access_type', 'admin')
        .eq('is_active', true)
        .maybeSingle();

      if (adminCheck) {
        console.log('✅ Admin access granted for user:', markedBy);
        return { isAuthorized: true, reason: 'Admin access' };
      }

      // STEP 3: Get the profile information for the marking user
      const { data: profileData } = await this.supabase
        .from('profiles')
        .select('email, is_super_admin')
        .eq('id', markedBy)
        .single();

      if (!profileData) {
        return {
          isAuthorized: false,
          reason: 'User profile not found'
        };
      }

      // STEP 4: Check if user is marked as super admin in profiles table
      if (profileData.is_super_admin) {
        console.log(
          '✅ Profile super admin access granted for user:',
          markedBy
        );
        return { isAuthorized: true, reason: 'Profile super admin access' };
      }

      // STEP 5: Get the staff record for this user based on email (if exists)
      const { data: staffRecord } = await this.supabase
        .from('staff')
        .select('id')
        .eq('email', profileData.email)
        .eq('institution_id', institutionId)
        .maybeSingle();

      const userStaffId = staffRecord?.id;

      // STEP 6: Get timetable data to extract staff assignments
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select('timetable_data')
        .eq('id', timetableId)
        .single();

      if (timetableError || !timetableData) {
        return {
          isAuthorized: false,
          reason: 'Timetable data not found'
        };
      }

      // STEP 7: Extract all assigned staff AND profile IDs from timetable
      const timetableDataObj = timetableData.timetable_data || {};
      const allAssignedIds = new Set<string>();

      // Search through all days and periods to collect assignments
      Object.keys(timetableDataObj).forEach((dayKey) => {
        const dayData = timetableDataObj[dayKey];
        if (typeof dayData === 'object' && dayData !== null) {
          Object.keys(dayData).forEach((periodKey) => {
            const periodSlot = dayData[periodKey];

            // Add primary_staff_id if exists
            if (periodSlot && periodSlot.primary_staff_id) {
              allAssignedIds.add(periodSlot.primary_staff_id);
            }

            // Add all staff from staff_ids array if exists
            if (
              periodSlot &&
              periodSlot.staff_ids &&
              Array.isArray(periodSlot.staff_ids)
            ) {
              periodSlot.staff_ids.forEach((id: string) => {
                allAssignedIds.add(id);
              });
            }

            // Also check for profile_ids (for direct profile assignments)
            if (
              periodSlot &&
              periodSlot.profile_ids &&
              Array.isArray(periodSlot.profile_ids)
            ) {
              periodSlot.profile_ids.forEach((id: string) => {
                allAssignedIds.add(id);
              });
            }

            // Check for primary_profile_id (for direct profile assignment)
            if (periodSlot && periodSlot.primary_profile_id) {
              allAssignedIds.add(periodSlot.primary_profile_id);
            }
          });
        }
      });

      // STEP 8: Check authorization - Allow if either profile ID or staff ID matches
      const isAuthorizedByProfile = allAssignedIds.has(markedBy); // Check profile ID directly
      const isAuthorizedByStaff = userStaffId
        ? allAssignedIds.has(userStaffId)
        : false;

      if (isAuthorizedByProfile || isAuthorizedByStaff) {
        const authType = isAuthorizedByProfile ? 'profile' : 'staff';
        console.log(
          `✅ Authorized by ${authType} assignment for user:`,
          markedBy
        );
        return { isAuthorized: true, reason: `Assigned ${authType} member` };
      }

      // STEP 9: For development/testing - if no assignments found, allow with warning
      if (allAssignedIds.size === 0) {
        console.warn(
          '⚠️ No staff/profile assignments found in timetable - allowing access for testing'
        );
        return { isAuthorized: true, reason: 'No restrictions (testing mode)' };
      }

      // STEP 10: Not authorized - return details for debugging
      const { data: assignedStaff } = await this.supabase
        .from('staff')
        .select('id, first_name, last_name, email')
        .in(
          'id',
          Array.from(allAssignedIds).filter((id) =>
            // Filter to only valid UUIDs (staff IDs)
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              id
            )
          )
        );

      console.log('❌ Authorization failed:', {
        userProfile: markedBy,
        userEmail: profileData.email,
        userStaffId: userStaffId,
        assignedIds: Array.from(allAssignedIds),
        assignedStaff: assignedStaff
      });

      return {
        isAuthorized: false,
        reason: `User ${profileData.email} is not authorized to mark attendance for this timetable`,
        assignedStaff: assignedStaff || undefined
      };
    } catch (error) {
      console.error('Error validating staff assignment:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown validation error';
      return {
        isAuthorized: false,
        reason: `Validation error: ${errorMessage}`
      };
    }
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
          console.error('Invalid parameters for attendance check:', {
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

        const { data, error } = await this.supabase
          .from('student_attendance')
          .select('id, attendance_data')
          .eq('timetable_id', firstPeriod.timetable_id)
          .eq('section_id', firstPeriod.section_id)
          .eq('attendance_date', firstPeriod.attendance_date)
          .maybeSingle();

        if (error) {
          console.error('Error checking existing attendance:', {
            error,
            parameters: {
              timetable_id: firstPeriod.timetable_id,
              section_id: firstPeriod.section_id,
              attendance_date: firstPeriod.attendance_date
            }
          });
          // Mark all periods in this group as not marked on error
          groupPeriods.forEach((period) => {
            attendanceMap.set(period.timetable_slot_id, { isMarked: false });
          });
          continue;
        }

        // Check each period in this group
        groupPeriods.forEach((period) => {
          let isMarked = false;

          if (data?.attendance_data) {
            // Check if this specific slot has attendance data
            const slotData = data.attendance_data[period.timetable_slot_id];
            if (slotData && slotData.students && slotData.students.length > 0) {
              isMarked = true;
            }
          }

          attendanceMap.set(period.timetable_slot_id, {
            isMarked,
            recordId: isMarked ? data?.id : undefined
          });
        });
      }
    } catch (error) {
      console.error('Error in checkExistingAttendanceForPeriods:', error);
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
        institution_id,
        created_at,
        updated_at
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

      // If period_id is provided, check if this specific period has already been marked
      if (period_id && data.attendance_data) {
        // First check if period_id matches a slot key directly
        const periodData = data.attendance_data[period_id];
        if (
          periodData &&
          periodData.students &&
          periodData.students.length > 0
        ) {
          console.log(
            `Period ${period_id} has already been marked in this record (direct match)`
          );
          return {
            ...data,
            marked_by: '', // Add missing required property
            marked_by_profile: undefined
          } as ConsolidatedStudentAttendance;
        }

        // If not found by slot ID, search by period_id within the attendance data
        for (const [slotId, slotData] of Object.entries(data.attendance_data)) {
          if (
            (slotData as any).period_id === period_id &&
            (slotData as any).students &&
            (slotData as any).students.length > 0
          ) {
            console.log(
              `Period ${period_id} has already been marked in this record (found by period_id in slot ${slotId})`
            );
            return {
              ...data,
              marked_by: '', // Add missing required property
              marked_by_profile: undefined
            } as ConsolidatedStudentAttendance;
          }
        }

        console.log(
          `Period ${period_id} has not been marked yet, but attendance exists for other periods`
        );
        // Return null to allow marking attendance for this specific period
        // Even though other periods may have been marked on the same date
        return null;
      }
    } else {
      console.log('No consolidated attendance found.');
    }

    // If no period_id is provided, return the record as-is (for general attendance checking)
    // If period_id is provided and we reach here, it means no data was found for that specific period
    if (period_id) {
      console.log(`No attendance data found for period ${period_id}`);
      return null;
    }

    return data
      ? ({
          ...data,
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
        console.error('Error fetching attendance by date and section:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map((record) => ({
        ...record,
        marked_by: '', // Add missing required property
        marked_by_profile: undefined
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
        .select('*')
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
          .select('*')
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
      console.error('Error in direct slot attendance fetch:', error);
      return [];
    }
  }

  // Upsert consolidated attendance record
  static async upsertConsolidatedAttendance(
    data: UpsertConsolidatedAttendanceDto
  ): Promise<ConsolidatedStudentAttendance> {
    try {
      // Updated: 2025-09-07 - Added staff assignment validation
      // Validate staff assignment before proceeding
      const validationResult = await this.validateStaffAssignment(
        data.timetable_id,
        data.marked_by,
        data.institution_id
      );

      if (!validationResult.isAuthorized) {
        const errorMessage = `Attendance marking not authorized: ${validationResult.reason}`;
        console.error(errorMessage, {
          timetable_id: data.timetable_id,
          marked_by: data.marked_by,
          institution_id: data.institution_id,
          assignedStaff: validationResult.assignedStaff
        });
        toast.error(
          'You are not authorized to mark attendance for this period. Only assigned staff can mark attendance.'
        );
        throw new Error(errorMessage);
      }

      console.log(
        '✅ Staff assignment validation passed:',
        validationResult.reason
      );
      // Validate section_id is a valid UUID
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      let resolvedSectionId = data.section_id;

      // If section_id is not a valid UUID, try to resolve it
      if (resolvedSectionId && !uuidRegex.test(resolvedSectionId)) {
        console.error(
          `Invalid section_id provided: "${resolvedSectionId}". Section ID must be a valid UUID.`
        );

        // Try to resolve section name to UUID
        const { data: timetableData } = await this.supabase
          .from('timetables')
          .select('program_id, department_id, degree_id')
          .eq('id', data.timetable_id)
          .single();

        if (timetableData) {
          const { data: sectionData } = await this.supabase
            .from('sections')
            .select('id')
            .eq('institution_id', data.institution_id)
            .eq('section_name', resolvedSectionId)
            .eq('program_id', timetableData.program_id)
            .eq('department_id', timetableData.department_id)
            .eq('degree_id', timetableData.degree_id)
            .eq('is_active', true)
            .maybeSingle();

          if (sectionData) {
            console.log(
              `Resolved section name "${resolvedSectionId}" to UUID: ${sectionData.id}`
            );
            resolvedSectionId = sectionData.id;
          } else {
            const errorMessage = `Cannot resolve section name "${resolvedSectionId}" to a valid UUID`;
            console.error(errorMessage);
            throw new Error(errorMessage);
          }
        } else {
          const errorMessage = 'Cannot resolve section without timetable data';
          console.error(errorMessage);
          throw new Error(errorMessage);
        }
      }

      if (!resolvedSectionId) {
        const errorMessage = 'Section ID is required for attendance';
        console.error(errorMessage);
        throw new Error(errorMessage);
      }

      // First, try to find existing consolidated record
      console.log('🔍 Checking for existing attendance record with key:', {
        institution_id: data.institution_id,
        timetable_id: data.timetable_id,
        section_id: resolvedSectionId,
        attendance_date: data.attendance_date
      });

      const { data: existingRecord, error: findError } = await this.supabase
        .from('student_attendance')
        .select('id, timetable_id')
        .eq('institution_id', data.institution_id)
        .eq('timetable_id', data.timetable_id)
        .eq('section_id', resolvedSectionId)
        .eq('attendance_date', data.attendance_date)
        .maybeSingle();

      if (findError) {
        console.error('Error finding existing attendance record:', findError);
        throw findError;
      }

      console.log('📊 Attendance record lookup result:', {
        found: !!existingRecord,
        action: existingRecord ? 'UPDATE_EXISTING' : 'CREATE_NEW',
        existing_record_id: existingRecord?.id,
        existing_timetable_id: existingRecord?.timetable_id
      });

      let result;
      if (existingRecord) {
        // Fetch existing record to get current attendance_data for merging
        const { data: currentRecord, error: fetchError } = await this.supabase
          .from('student_attendance')
          .select('attendance_data')
          .eq('id', existingRecord.id)
          .single();

        if (fetchError) {
          console.error('Error fetching existing attendance data:', fetchError);
          throw fetchError;
        }

        // Merge new attendance data with existing data
        const existingAttendanceData =
          (currentRecord?.attendance_data as ConsolidatedAttendanceData) || {};
        const mergedAttendanceData = {
          ...existingAttendanceData, // Keep existing periods
          ...data.attendance_data // Add/update new periods
        };

        console.log('Merging attendance data:', {
          existing: existingAttendanceData,
          new: data.attendance_data,
          merged: mergedAttendanceData
        });

        // Update existing record with merged data
        const { data: updateResult, error: updateError } = await this.supabase
          .from('student_attendance')
          .update({
            attendance_data: mergedAttendanceData, // Use merged data instead of overwriting
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
        // Updated: 2025-09-09 - Fetch academic fields from timetable if not provided
        let academicFields = {
          academic_year_id: data.academic_year_id,
          degree_id: data.degree_id,
          program_id: data.program_id,
          department_id: data.department_id,
          semester_id: data.semester_id
        };

        // If any academic field is missing, fetch from timetable
        if (
          !data.academic_year_id ||
          !data.degree_id ||
          !data.program_id ||
          !data.department_id ||
          !data.semester_id
        ) {
          const { data: timetableData, error: timetableError } =
            await this.supabase
              .from('timetables')
              .select(
                'academic_year_id, degree_id, program_id, department_id, semester_id'
              )
              .eq('id', data.timetable_id)
              .single();

          if (!timetableError && timetableData) {
            // Use semester_id from data or timetableData (should always be available now)
            const resolvedSemesterId =
              data.semester_id || timetableData.semester_id;

            academicFields = {
              academic_year_id:
                data.academic_year_id || timetableData.academic_year_id,
              degree_id: data.degree_id || timetableData.degree_id,
              program_id: data.program_id || timetableData.program_id,
              department_id: data.department_id || timetableData.department_id,
              semester_id: resolvedSemesterId
            };
          }
        }

        // Validate required fields before insertion
        const validationErrors: string[] = [];
        if (!academicFields.semester_id)
          validationErrors.push('semester_id is null or undefined');
        if (!academicFields.academic_year_id)
          validationErrors.push('academic_year_id is null or undefined');
        if (!academicFields.degree_id)
          validationErrors.push('degree_id is null or undefined');
        if (!academicFields.program_id)
          validationErrors.push('program_id is null or undefined');
        if (!academicFields.department_id)
          validationErrors.push('department_id is null or undefined');

        if (validationErrors.length > 0) {
          console.error('❌ ATTENDANCE VALIDATION FAILED:', {
            errors: validationErrors,
            timetable_id: data.timetable_id,
            section_id: resolvedSectionId,
            attendance_date: data.attendance_date,
            academicFields
          });
          throw new Error(
            `Attendance validation failed: ${validationErrors.join(', ')}`
          );
        }

        console.log('✅ Attendance validation passed, inserting record:', {
          timetable_id: data.timetable_id,
          section_id: resolvedSectionId,
          attendance_date: data.attendance_date,
          academicFields
        });

        const { data: insertResult, error: insertError } = await this.supabase
          .from('student_attendance')
          .insert({
            timetable_id: data.timetable_id,
            section_id: resolvedSectionId,
            attendance_date: data.attendance_date,
            attendance_data: data.attendance_data,
            institution_id: data.institution_id,
            academic_year_id: academicFields.academic_year_id,
            degree_id: academicFields.degree_id,
            program_id: academicFields.program_id,
            department_id: academicFields.department_id,
            semester_id: academicFields.semester_id,
            updated_at: new Date().toISOString()
          })
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
            for (const [, periodData] of Object.entries(attendanceData)) {
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
    institution_id: string,
    academicFields?: {
      academic_year_id?: string;
      degree_id?: string;
      program_id?: string;
      department_id?: string;
      semester_id?: string;
    }
  ): Promise<void> {
    try {
      await this.upsertConsolidatedAttendance({
        timetable_id,
        section_id,
        attendance_date,
        attendance_data,
        marked_by,
        institution_id,
        ...academicFields
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
        for (const [, dayData] of Object.entries(timetable.timetable_data)) {
          if (typeof dayData === 'object' && dayData !== null) {
            for (const [, slotData] of Object.entries(
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

  // Get slot details from JSON-based timetable structure
  static async getSlotDetails(slotId: string): Promise<any> {
    try {
      console.log('getSlotDetails called with slotId:', slotId);

      // Find the timetable containing this slot
      const timetableId = await this.getTimetableIdFromSlot(slotId);
      if (!timetableId) {
        console.error('Could not find timetable for slot:', slotId);
        return null;
      }

      // Get the timetable data
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select('timetable_data')
        .eq('id', timetableId)
        .single();

      if (timetableError || !timetableData?.timetable_data) {
        console.error('Error fetching timetable data:', timetableError);
        return null;
      }

      // Search through the JSON structure to find the slot
      const timetableJson = timetableData.timetable_data;
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
      console.error('Error getting slot details:', error);
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
        console.error('Error fetching course details:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getCourseDetails:', error);
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
        console.error('Error fetching period details:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getPeriodDetails:', error);
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
      console.log('🎯 getStudentsForAttendance called with filters:', filters);

      // First, check current user authentication and profile
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      if (authError || !user) {
        console.error('❌ Authentication error in getStudentsForAttendance:', authError);
        throw new Error('User not authenticated');
      }

      console.log('✅ User authenticated:', user.id);

      // Get current user's profile to understand RLS context
      const { data: profileData, error: profileError } = await this.supabase
        .from('profiles')
        .select('id, role, institution_id, department_id, is_super_admin, email')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('❌ Error fetching user profile:', profileError);
        throw new Error('Failed to fetch user profile');
      }

      console.log('📋 User profile:', {
        id: profileData.id,
        role: profileData.role,
        institution_id: profileData.institution_id,
        department_id: profileData.department_id,
        is_super_admin: profileData.is_super_admin
      });

      // Check if user meets RLS policy requirements
      const hasInstitutionAccess = profileData.institution_id === filters.institution_id;
      const hasDepartmentAccess = profileData.department_id === filters.department_id;
      const isSuperAdmin = profileData.is_super_admin === true;
      const isPrivilegedRole = ['admission', 'administrator'].includes(profileData.role);

      console.log('🔐 RLS Policy Check:', {
        hasInstitutionAccess,
        hasDepartmentAccess,
        isSuperAdmin,
        isPrivilegedRole,
        userRole: profileData.role,
        canAccess: isSuperAdmin || isPrivilegedRole || (hasInstitutionAccess && hasDepartmentAccess)
      });

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

      console.log('🔍 Executing students query with filters:', filters);
      const { data, error } = await query;

      if (error) {
        console.error('❌ Supabase query error:', error);
        console.error('❌ Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log('✅ Query executed successfully, found students:', data?.length || 0);

      if (!data || data.length === 0) {
        console.warn('⚠️ No students found. This could be due to:');
        console.warn('  1. RLS policy blocking access (check institution_id and department_id match)');
        console.warn('  2. No students exist with the given filters');
        console.warn('  3. All students are inactive');
        console.warn('Current filter values:', filters);
        console.warn('User profile values:', {
          institution_id: profileData.institution_id,
          department_id: profileData.department_id,
          role: profileData.role
        });
      }

      // Transform the data to include student_name constructed from first_name and last_name
      const transformedData = (data || []).map((student: any) => ({
        ...student,
        student_name:
          `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
          'Unknown Student'
      })) as AttendanceStudent[];

      console.log('📊 Returning transformed student data:', transformedData.length, 'students');
      return transformedData;
    } catch (error) {
      console.error('💥 Error in getStudentsForAttendance:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
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
      console.log('Searching for timetable with date:', date);
      console.log('Filters:', {
        institution_id: filters.institution_id,
        academic_year_id: filters.academic_year_id,
        degree_id: filters.degree_id,
        program_id: filters.program_id,
        department_id: filters.department_id,
        semester_id: filters.semester
      });

      const timetableQuery = this.supabase
        .from('timetables')
        .select('id, start_date, end_date, timetable_name')
        .eq('institution_id', filters.institution_id)
        .eq('academic_year_id', filters.academic_year_id)
        .eq('degree_id', filters.degree_id)
        .eq('program_id', filters.program_id)
        .eq('department_id', filters.department_id)
        .eq('semester_id', filters.semester) // Use semester_id column directly
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
          .eq('semester_id', filters.semester);

        if (!allError && allTimetables) {
          console.log('All timetables for this configuration:', allTimetables);
        }

        return [];
      }

      const timetableId = timetables[0].id;

      // Determine day of week from date
      const dayOfWeek = this.getDayOfWeekFromDate(date);
      console.log('Day of week for date', date, 'is:', dayOfWeek);

      // Get timetable data and extract slots for the specific day
      const { data: timetableData, error: timetableDataError } =
        await this.supabase
          .from('timetables')
          .select('timetable_data')
          .eq('id', timetableId)
          .single();

      if (timetableDataError) {
        console.error('Timetable data query error:', timetableDataError);
        throw timetableDataError;
      }

      let slots: any[] = [];
      if (timetableData?.timetable_data) {
        const daySlots = timetableData.timetable_data[dayOfWeek];
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

      // Staff assignments are now included in the JSON structure
      // No need for separate queries as staff_ids are in the slot data
      console.log('Using staff assignments from JSON timetable structure');

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
    _timetable_slot_id: string,
    _attendance_date: string
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

      // Get slot details using the new JSON-based approach
      const slot = await this.getSlotDetails(timetable_slot_id);

      if (!slot) {
        throw new Error(`Slot ${timetable_slot_id} not found`);
      }

      // Get section IDs assigned to this slot from JSON structure
      const sectionIds = slot.section_ids || [];

      if (sectionIds.length === 0) {
        console.warn(
          'No sections assigned to timetable slot:',
          timetable_slot_id
        );
        return {
          students: [],
          timetable_slot:
            slot as unknown as AttendanceRosterData['timetable_slot'],
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
        timetable_slot:
          slot as unknown as AttendanceRosterData['timetable_slot'],
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
      console.log('🔍 ==== getAvailablePeriodsForDate CALLED ====');
      console.log('📅 Date:', date);
      console.log('🏫 Filters:', {
        institution_id: filters.institution_id || 'MISSING ❌',
        academic_year_id: filters.academic_year_id || 'MISSING ❌',
        degree_id: filters.degree_id || 'MISSING ❌',
        program_id: filters.program_id || 'MISSING ❌',
        department_id: filters.department_id || 'MISSING ❌',
        semester: filters.semester || 'MISSING ❌',
        section: filters.section || 'NOT PROVIDED (optional)'
      });
      console.log('⚙️ Options:', {
        filterByStaffAssignment: options.filterByStaffAssignment ?? 'default',
        isSuperAdmin: options.isSuperAdmin ?? 'default'
      });

      // Add warning if multiple programs might conflict
      if (filters.program_id && filters.department_id) {
        console.log(
          '✅ Program filtering active - this should prevent cross-program conflicts:',
          {
            program_id: filters.program_id,
            department_id: filters.department_id
          }
        );
      } else {
        console.warn(
          '⚠️  Missing program/department filters - this might cause cross-program conflicts!'
        );
      }

      const dayOfWeek = this.getDayOfWeekFromDate(date);
      console.log('Day of week for date:', dayOfWeek);

      // Note: Database expects UUIDs directly, no name resolution needed
      console.log('Using semester UUID directly:', filters.semester);
      if (filters.section) {
        console.log('Using section UUID directly:', filters.section);
      }

      // Fetch all active timetables for the given context (both regular and batch)
      let timetableQuery = this.supabase
        .from('timetables')
        .select(
          `id, timetable_format, start_date, end_date, selected_dates, section_id, semester_id, timetable_data,
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
      timetableQuery = timetableQuery.eq('semester_id', filters.semester);
      console.log('Querying with semester_id:', filters.semester);

      // For section filtering, use the section_id column directly (timetables table stores section_id as UUID)
      if (filters.section) {
        console.log('Filtering by section_id:', filters.section);
        timetableQuery = timetableQuery.eq('section_id', filters.section);
      } else {
        console.log(
          'No section filter specified - getting all timetables regardless of section'
        );
        // Don't filter by section - get all timetables for this context
        // This allows fetching timetables that have a section set even when no specific section is requested
      }

      let timetables;
      let timetableError;

      try {
        const result = await timetableQuery;
        timetables = result.data;
        timetableError = result.error;
      } catch (networkError) {
        console.error('❌ Network error fetching timetables:', networkError);
        console.error('Network error details:', {
          message: networkError instanceof Error ? networkError.message : 'Unknown error',
          stack: networkError instanceof Error ? networkError.stack : undefined
        });
        throw new Error(`Failed to fetch timetables: ${networkError instanceof Error ? networkError.message : 'Network error'}`);
      }

      console.log('Timetables query result:', {
        timetables,
        timetablesCount: timetables?.length || 0,
        error: timetableError
      });

      if (timetableError) {
        console.error('❌ Database error fetching timetables:', timetableError);
        throw new Error(`Database error: ${timetableError.message || 'Unknown database error'}`);
      }

      if (!timetables || timetables.length === 0) {
        console.warn('⚠️ No active timetables found for the given criteria.');
        console.warn('Search criteria used:', {
          institution_id: filters.institution_id,
          academic_year_id: filters.academic_year_id,
          degree_id: filters.degree_id,
          program_id: filters.program_id,
          department_id: filters.department_id,
          semester_id: filters.semester,
          section_id: filters.section || 'ANY',
          date: date,
          dayOfWeek: dayOfWeek
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

        // Check date range for ALL timetable formats (both regular and batch)
        if (timetable.start_date && timetable.end_date) {
          const searchDate = new Date(date);
          const startDate = new Date(timetable.start_date);
          const endDate = new Date(timetable.end_date);

          console.log(
            'Checking date range for',
            timetable.timetable_format,
            'timetable:',
            {
              searchDate: searchDate.toISOString(),
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              isWithinRange: searchDate >= startDate && searchDate <= endDate
            }
          );

          // Skip this timetable if the date is outside its range
          if (searchDate < startDate || searchDate > endDate) {
            console.log('Date is outside timetable range, skipping');
            continue;
          }
        }

        // Additional checks for batch timetables
        if (timetable.timetable_format === 'batch') {
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

              console.log('Processing batch timetable for date:', date);
              console.log('Timetable selected_dates:', timetable.selected_dates);
              console.log('🔍 Full timetable_data structure:', JSON.stringify(timetableData, null, 2));

              // For batch timetables, extract slots for the specific date
              // Strategy: Find the date range that contains the query date, then look for ANY slot
              // in that range and apply it to the query date

              console.log('🔍 Strategy: Find slots from same date range and apply to query date');

              // Step 1: Find which date range contains the query date
              let matchingRangeStart = null;
              let matchingRangeEnd = null;

              if (timetable.selected_dates && Array.isArray(timetable.selected_dates)) {
                const queryDate = new Date(date);

                for (const dateItem of timetable.selected_dates) {
                  if (typeof dateItem === 'string' && dateItem.startsWith('RANGE:')) {
                    const parts = dateItem.split(':');
                    if (parts.length === 3) {
                      const rangeStart = new Date(parts[1]);
                      const rangeEnd = new Date(parts[2]);

                      if (queryDate >= rangeStart && queryDate <= rangeEnd) {
                        matchingRangeStart = parts[1];
                        matchingRangeEnd = parts[2];
                        console.log('✅ Query date falls in range:', {
                          range: `${parts[1]} to ${parts[2]}`,
                          query_date: date
                        });
                        break;
                      }
                    }
                  }
                }
              }

              if (!matchingRangeStart || !matchingRangeEnd) {
                console.log('❌ No matching date range found for query date');
              } else {
                console.log('🔍 Looking for slots with dates in range:', {
                  rangeStart: matchingRangeStart,
                  rangeEnd: matchingRangeEnd
                });

                // Step 2: Find ONE representative slot per period from this date range
                // Use a Map to track which periods we've already found slots for
                const periodSlotMap = new Map();

                Object.keys(timetableData).forEach((day) => {
                  const daySlots = timetableData[day];
                  if (daySlots && typeof daySlots === 'object') {
                    Object.keys(daySlots).forEach((periodId) => {
                      const slotData = daySlots[periodId];

                      // Skip break slots
                      if (slotData && slotData.is_break_slot) {
                        return;
                      }

                      // Skip if we already have a slot for this period
                      if (periodSlotMap.has(periodId)) {
                        return;
                      }

                      if (slotData && slotData.slot_date) {
                        const slotDate = new Date(slotData.slot_date);
                        const rangeStart = new Date(matchingRangeStart);
                        const rangeEnd = new Date(matchingRangeEnd);

                        // Check if this slot's date is in the same range
                        if (slotDate >= rangeStart && slotDate <= rangeEnd) {
                          console.log('✅ Found slot in same range:', {
                            slot_date: slotData.slot_date,
                            period_id: periodId,
                            course_id: slotData.course_id
                          });

                          // Mark this period as found
                          periodSlotMap.set(periodId, true);

                          // Apply this slot configuration to the query date
                          slots.push({
                            ...slotData,
                            period_id: periodId,
                            day_of_week: day,
                            id: slotData.slot_id,
                            // Override slot_date with query date for attendance tracking
                            slot_date: date,
                            _original_slot_date: slotData.slot_date // Keep original for reference
                          });

                          console.log('✅ Slot applied to query date:', date);
                        }
                      }
                    });
                  }
                });
              }

              console.log(`Extracted ${slots.length} slots for date ${date} from batch timetable`);
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
        let isHODUser = false;

        if (options.filterByStaffAssignment && !options.isSuperAdmin) {
          console.log('Filtering required for non-admin user');
          staffIdForFiltering = await this.getCurrentUserStaffId();

          if (!staffIdForFiltering) {
            // Check if user is HOD - HOD users don't have staff records but should see their department's periods
            const { data: userData } = await this.supabase.auth.getUser();
            if (userData.user) {
              const { data: profile } = await this.supabase
                .from('profiles')
                .select('role, department_id')
                .eq('id', userData.user.id)
                .single();

              if (profile?.role === 'hod' && profile.department_id === filters.department_id) {
                console.log('User is HOD for this department - allowing access to periods');
                isHODUser = true;
              } else {
                console.log('No staff ID found for current user - skipping timetable');
                continue; // Skip this timetable if user has no staff access and is not HOD
              }
            } else {
              console.log('No authenticated user found - skipping timetable');
              continue;
            }
          } else {
            console.log('Will filter periods for staff ID:', staffIdForFiltering);
          }
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

          // Filter slots by staff assignment if needed (but not for super admin or HOD users)
          let filteredSlots = slots;
          if (isHODUser) {
            console.log('HOD user detected - showing all periods from department without staff filtering');
          } else if (staffIdForFiltering && !options.isSuperAdmin) {
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

          // Filter out break periods - they should not appear in attendance
          const periodData = periodsData.find((p) => p.id === slot.period_id);
          if (periodData?.is_break) {
            console.log('Filtering out break period from attendance:', {
              period_name: periodData.period_name,
              period_id: slot.period_id
            });
            return false;
          }

          return true;
        })
        .map((slot: any) => {
          // Find the period data for this slot
          const periodData = periodsData.find((p) => p.id === slot.period_id);
          // Find the timetable for this slot to get related names
          const timetableData = timetables.find((t: any) => t.id === slot.timetable_id);

          return {
            timetable_slot_id: slot.slot_id || slot.id,
            timetable_id: slot.timetable_id,
            id: slot.period_id,
            period_name: periodData?.period_name || 'Unknown Period',
            start_time: periodData?.start_time || '',
            end_time: periodData?.end_time || '',
            is_break: periodData?.is_break || false,
            // Add the hierarchy names from timetable relations
            degree_name: Array.isArray(timetableData?.degrees) ? timetableData.degrees[0]?.degree_name || '' : (timetableData?.degrees as any)?.degree_name || '',
            program_name: Array.isArray(timetableData?.programs) ? timetableData.programs[0]?.program_name || '' : (timetableData?.programs as any)?.program_name || '',
            department_name: Array.isArray(timetableData?.departments) ? timetableData.departments[0]?.department_name || '' : (timetableData?.departments as any)?.department_name || '',
            semester_name: Array.isArray(timetableData?.semesters) ? timetableData.semesters[0]?.semester_name || '' : (timetableData?.semesters as any)?.semester_name || '',
            section_name: Array.isArray(timetableData?.sections) ? timetableData.sections[0]?.section_name || '' : (timetableData?.sections as any)?.section_name || '',
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

      // Get the user's profile to find their email and role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('email, role')
        .eq('id', userData.user.id)
        .single();

      if (profileError || !profile) {
        return null;
      }

      // HOD users don't have staff records - return null immediately to avoid RLS issues
      if (profile.role === 'hod') {
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

      // Get timetable data and extract all slots
      const { data: timetableData, error: slotsError } = await this.supabase
        .from('timetables')
        .select('timetable_data')
        .eq('id', timetableId)
        .single();

      if (slotsError || !timetableData?.timetable_data) {
        console.error(
          'Error fetching timetable data for staff assignment check:',
          slotsError
        );
        return false;
      }

      // Extract all slots from JSON structure
      const slots: any[] = [];
      const timetableJson = timetableData.timetable_data;
      for (const [dayKey, dayData] of Object.entries(timetableJson)) {
        if (typeof dayData === 'object' && dayData !== null) {
          for (const [periodKey, slotData] of Object.entries(
            dayData as Record<string, any>
          )) {
            if (slotData) {
              slots.push({
                ...slotData,
                id: slotData.slot_id || periodKey,
                period_id: periodKey,
                day_of_week: dayKey
              });
            }
          }
        }
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

      // Legacy table support removed - using JSON-based structure only
      console.log(
        'Staff assignment check completed using JSON-based timetable structure'
      );

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

      // Second check: Is user an HOD with department-based access?
      const hasHODAccess = await this.checkHODDepartmentAccess(timetableSlotId);

      if (hasHODAccess) {
        console.log(
          `User is HOD with department access to slot ${timetableSlotId}`
        );
        return true;
      }

      // Third check: Does user have faculty role with attendance permissions?
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

  // New helper method to check HOD department-based access
  static async checkHODDepartmentAccess(timetableSlotId: string): Promise<boolean> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError || !userData.user) {
        return false;
      }

      // Get user's profile, role, and department
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role, department_id, is_super_admin')
        .eq('id', userData.user.id)
        .single();

      if (profileError || !profile) {
        return false;
      }

      // Only check for HOD role
      if (profile.role !== 'hod' || profile.is_super_admin) {
        return false;
      }

      // HOD must have a department assigned
      if (!profile.department_id) {
        console.log('HOD user has no department assigned');
        return false;
      }

      // Check if the timetable slot belongs to a timetable in the HOD's department
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select('department_id')
        .eq('id', timetableSlotId) // Assuming timetableSlotId refers to timetable ID
        .single();

      if (timetableError) {
        // If direct lookup fails, it might be we need to get timetable info differently
        // Let's try to get it from the timetable structure
        console.log('Could not find timetable by direct ID, checking timetable data...');

        // Alternative approach: Search through timetables for this slot
        const { data: allTimetables, error: allTimetablesError } = await this.supabase
          .from('timetables')
          .select('id, department_id, timetable_data')
          .eq('department_id', profile.department_id)
          .eq('is_active', true);

        if (allTimetablesError || !allTimetables) {
          console.log('Could not fetch department timetables');
          return false;
        }

        // Check if any timetable in the department contains this slot
        const hasSlot = allTimetables.some(timetable => {
          const timetableData = timetable.timetable_data as any;
          if (!timetableData) return false;

          // Check if timetableSlotId exists in the timetable_data
          for (const dayData of Object.values(timetableData)) {
            if (dayData && typeof dayData === 'object') {
              for (const [slotId] of Object.entries(dayData as Record<string, any>)) {
                if (slotId === timetableSlotId) {
                  return true;
                }
              }
            }
          }
          return false;
        });

        return hasSlot;
      }

      // Check if the timetable belongs to the HOD's department
      const belongsToHODDepartment = timetableData.department_id === profile.department_id;

      if (belongsToHODDepartment) {
        console.log(`Timetable slot belongs to HOD's department: ${profile.department_id}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking HOD department access:', error);
      return false;
    }
  }

  // Save manual attendance to database
  static async saveManualAttendance(attendanceData: {
    attendance_date: string;
    student_records: Array<{
      student_id: string;
      status: 'Present' | 'Absent';
    }>;
    marked_by: string;
    institution_id: string;
    section_id: string;
    notes?: string;
  }): Promise<void> {
    try {
      if (
        !attendanceData.student_records ||
        attendanceData.student_records.length === 0
      ) {
        throw new Error('No student records provided for manual attendance');
      }

      // Get current user's information for marker details
      const { data: profileData } = await this.supabase
        .from('profiles')
        .select('email, full_name, role')
        .eq('id', attendanceData.marked_by)
        .single();

      let markerName = profileData?.full_name || 'Unknown User';
      let markerEmail = profileData?.email || '';
      const markerRole = profileData?.role || 'faculty';

      // Try to get better name from staff table if user is faculty
      if (profileData?.role === 'faculty') {
        const { data: staffData } = await this.supabase
          .from('staff')
          .select('staff_name, staff_email')
          .eq('profile_id', attendanceData.marked_by)
          .eq('institution_id', attendanceData.institution_id)
          .eq('is_active', true)
          .maybeSingle();

        if (staffData) {
          markerName = staffData.staff_name;
          markerEmail = staffData.staff_email || markerEmail;
        }
      }

      // Create attendance data structure for manual entries
      const manualAttendanceData: ConsolidatedAttendanceData = {
        'manual-entry': {
          period_id: 'manual-entry',
          period_name: 'Manual Entry',
          course_id: 'manual-course',
          course_name: 'Manual Attendance',
          start_time: '00:00',
          end_time: '23:59',
          students: attendanceData.student_records.map((record) => ({
            student_id: record.student_id,
            status: record.status,
            marked_at: new Date().toISOString()
          })),
          // Add marker details with timestamp
          marked_by_details: {
            marker_id: attendanceData.marked_by,
            marker_name: markerName,
            marker_role: markerRole,
            marker_email: markerEmail,
            marked_at: new Date().toISOString() // Add timestamp when period is marked
          }
        }
      };

      // Use the consolidated attendance structure
      await this.upsertConsolidatedAttendance({
        timetable_id: 'manual-timetable', // Special marker for manual entries
        section_id: attendanceData.section_id,
        attendance_date: attendanceData.attendance_date,
        attendance_data: manualAttendanceData,
        marked_by: attendanceData.marked_by,
        institution_id: attendanceData.institution_id
      });

      toast.success(
        `✅ Manual attendance saved for ${attendanceData.student_records.length} students`
      );
    } catch (error) {
      console.error('Error saving manual attendance:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to save manual attendance';
      toast.error(errorMessage);
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
      console.error('Error parsing date:', error);
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
        if (!record.semester_id) nullFields.push('semester_id');
        if (!record.academic_year_id) nullFields.push('academic_year_id');
        if (!record.degree_id) nullFields.push('degree_id');
        if (!record.program_id) nullFields.push('program_id');
        if (!record.department_id) nullFields.push('department_id');

        if (nullFields.length > 0) {
          issues.push(`Null fields detected: ${nullFields.join(', ')}`);
        }

        // Fetch timetable information
        if (record.timetable_id) {
          const { data: timetableData, error: timetableError } =
            await this.supabase
              .from('timetables')
              .select(
                'id, semester, semester_id, section, section_id, degree_id, program_id, department_id, academic_year_id'
              )
              .eq('id', record.timetable_id)
              .single();

          if (!timetableError && timetableData) {
            timetableInfo = timetableData;

            // Check if timetable has missing semester_id
            if (!timetableData.semester_id) {
              issues.push(
                `Timetable ${record.timetable_id} is missing semester_id`
              );
              suggestions.push(
                `Update timetable ${record.timetable_id} with correct semester_id`
              );
            }

            // Check if record fields match timetable
            if (
              timetableData.degree_id &&
              record.degree_id !== timetableData.degree_id
            ) {
              issues.push(
                `Degree mismatch: record=${record.degree_id}, timetable=${timetableData.degree_id}`
              );
            }
            if (
              timetableData.program_id &&
              record.program_id !== timetableData.program_id
            ) {
              issues.push(
                `Program mismatch: record=${record.program_id}, timetable=${timetableData.program_id}`
              );
            }
          }
        }

        // Try to find correct semester_id if missing
        if (
          !record.semester_id &&
          timetableInfo?.semester &&
          timetableInfo?.degree_id &&
          timetableInfo?.program_id
        ) {
          const { data: semesterData, error: semesterError } =
            await this.supabase
              .from('semesters')
              .select('id, semester_name')
              .eq('semester_name', timetableInfo.semester)
              .eq('degree_id', timetableInfo.degree_id)
              .eq('program_id', timetableInfo.program_id)
              .single();

          if (!semesterError && semesterData) {
            semesterInfo = semesterData;
            suggestions.push(
              `Record should have semester_id: ${semesterData.id} (${semesterData.semester_name})`
            );
            suggestions.push(
              `UPDATE student_attendance SET semester_id = '${semesterData.id}' WHERE id = '${record.id}'`
            );
          } else {
            issues.push(
              `Cannot resolve semester_id for semester '${timetableInfo.semester}'`
            );
          }
        }

        // Summary
        console.log('🔍 ATTENDANCE RECORD DEBUG:', {
          record_id: record.id,
          attendance_date: record.attendance_date,
          issues: issues.length,
          suggestions: suggestions.length,
          null_fields: nullFields.length
        });
      }

      return {
        record,
        issues,
        suggestions,
        timetableInfo,
        semesterInfo
      };
    } catch (error) {
      console.error('Error debugging attendance record:', error);
      issues.push(
        `Debug error: ${
          error instanceof Error ? error.message : 'Unknown error'
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
      console.log('🔧 Starting attendance records fix...', {
        dryRun,
        dateRange,
        limit
      });

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
      console.log(`📊 Found ${totalFound} records with null semester_id`);

      if (!recordsToFix || recordsToFix.length === 0) {
        return { totalFound: 0, fixedCount: 0, errors, summary };
      }

      // Process each record
      for (const record of recordsToFix) {
        try {
          const debugResult = await this.debugAttendanceRecord(record.id);

          if (debugResult.semesterInfo && debugResult.semesterInfo.id) {
            const recordSummary = {
              record_id: record.id,
              attendance_date: record.attendance_date,
              timetable_id: record.timetable_id,
              resolved_semester_id: debugResult.semesterInfo.id,
              semester_name: debugResult.semesterInfo.semester_name,
              action: dryRun ? 'would_fix' : 'fixed'
            };

            if (!dryRun) {
              // Actually update the record
              const { error: updateError } = await this.supabase
                .from('student_attendance')
                .update({ semester_id: debugResult.semesterInfo.id })
                .eq('id', record.id);

              if (updateError) {
                errors.push(
                  `Failed to fix record ${record.id}: ${updateError.message}`
                );
                recordSummary.action = 'failed';
              } else {
                fixedCount++;
              }
            }

            summary.push(recordSummary);
          } else {
            summary.push({
              record_id: record.id,
              attendance_date: record.attendance_date,
              timetable_id: record.timetable_id,
              action: 'cannot_resolve',
              issues: debugResult.issues
            });
          }
        } catch (error) {
          errors.push(
            `Error processing record ${record.id}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      console.log('🎯 Fix operation completed:', {
        totalFound,
        fixedCount: dryRun ? 0 : fixedCount,
        errors: errors.length,
        dryRun
      });

      return { totalFound, fixedCount, errors, summary };
    } catch (error) {
      console.error('Error in fixAttendanceRecords:', error);
      errors.push(
        `Fix operation error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return { totalFound: 0, fixedCount: 0, errors, summary };
    }
  }
}
