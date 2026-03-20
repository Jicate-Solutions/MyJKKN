import { createClientSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { logger } from '@/lib/utils/enhanced-logger';
import { trackUsage } from '@/lib/utils/track-usage';
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
import { LeaveCalendarService } from './leave-calendar-service';
import type {
  StudentAttendance,
  UpdateStudentAttendanceDto,
  BatchUpdateAttendanceDto,
  ConsolidatedStudentAttendance,
  ConsolidatedAttendanceData,
  ConsolidatedAttendanceStudent,
  UpsertConsolidatedAttendanceDto,
  AttendanceAuditEntry
} from '@/types/attendance';
import type { TimetableData } from '@/types/academics';

/**
 * Computes which students changed status between two snapshots.
 * OnDuty entries are skipped in both old and new — leave system owns that status.
 * Exported for unit testing.
 */
export function computeAttendanceDiff(
  oldStudents: Array<{ student_id: string; status: string }>,
  newStudents: Array<{ student_id: string; status: string }>
): Array<{ student_id: string; old_status: string; new_status: string }> {
  const newMap = new Map(newStudents.map((s) => [s.student_id, s.status]))
  return oldStudents
    .filter((old) => {
      if (old.status === 'OnDuty') return false           // skip OnDuty originals
      const newStatus = newMap.get(old.student_id)
      if (!newStatus || newStatus === 'OnDuty') return false  // skip if new is OnDuty
      return old.status !== newStatus                     // only changed rows
    })
    .map((old) => ({
      student_id: old.student_id,
      old_status: old.status,
      new_status: newMap.get(old.student_id)!,
    }))
}

/**
 * AttendanceCoreService — marking, locking, and validation.
 * Split from AttendanceService (was 3,825 lines).
 *
 * @see AttendanceService for roster/consolidation/report methods
 */
export class AttendanceCoreService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

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
    authorizationType?: 'super_admin' | 'admin' | 'hod_department' | 'assigned_faculty' | 'permission_based';
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
        return { isAuthorized: true, reason: 'Super admin access', authorizationType: 'super_admin' };
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
        return { isAuthorized: true, reason: 'Admin access', authorizationType: 'admin' };
      }

      // STEP 3: Get the profile information for the marking user
      const { data: profileData } = await this.supabase
        .from('profiles')
        .select('email, is_super_admin, role, department_id')
        .eq('id', markedBy)
        .single();

      if (!profileData) {
        return {
          isAuthorized: false,
          reason: 'User profile not found'
        };
      }

      // STEP 4: Check if user is marked as super admin in profiles table
      if ((profileData as any).is_super_admin) {
        return { isAuthorized: true, reason: 'Profile super admin access', authorizationType: 'super_admin' };
      }

      // STEP 4.5: Check if user is HOD with department access
      if ((profileData as any).role === 'hod' && (profileData as any).department_id) {
        logger.info('academic/attendance', 'Checking HOD department access', {
          hod_id: markedBy,
          hod_department: (profileData as any).department_id,
          timetable_id: timetableId
        });

        // Get timetable department
        const { data: timetableData, error: timetableError } = await this.supabase
          .from('timetables')
          .select('department_id')
          .eq('id', timetableId)
          .single();

        if (timetableError || !timetableData) {
          logger.error('academic/attendance', 'Failed to fetch timetable department', timetableError);
          throw timetableError || new Error('Timetable not found');
        }

        if (timetableData.department_id === (profileData as any).department_id) {
          logger.info('academic/attendance', 'HOD department authorization granted', {
            hod_id: markedBy,
            department_id: (profileData as any).department_id,
            timetable_id: timetableId
          });

          return {
            isAuthorized: true,
            reason: 'HOD department access',
            assignedStaff: [],
            authorizationType: 'hod_department'
          };
        } else {
          logger.warn('academic/attendance', 'HOD department mismatch', {
            hod_department: (profileData as any).department_id,
            timetable_department: timetableData.department_id
          });
        }
      }

      // STEP 5: Get the staff record for this user
      // Updated: 2025-10-13 - Use institution_email instead of email
      // profile.email matches staff.institution_email (not staff.email which is personal)
      const { data: staffRecord } = await this.supabase
        .from('staff')
        .select('id')
        .eq('institution_email', (profileData as any).email)
        .eq('institution_id', institutionId)
        .maybeSingle();

      const userStaffId = (staffRecord as any)?.id;

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
      const timetableDataObj = ((timetableData as { timetable_data?: TimetableData }).timetable_data ?? {}) as TimetableData;
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

            // Updated: 2025-10-13 - Check sub_slots for subdivision group staff assignments
            if (
              periodSlot &&
              periodSlot.sub_slots &&
              Array.isArray(periodSlot.sub_slots)
            ) {
              periodSlot.sub_slots.forEach((subSlot: any) => {
                // Add staff from sub-slot staff_ids
                if (subSlot.staff_ids && Array.isArray(subSlot.staff_ids)) {
                  subSlot.staff_ids.forEach((id: string) => {
                    allAssignedIds.add(id);
                  });
                }

                // Add primary staff from sub-slot
                if (subSlot.primary_staff_id) {
                  allAssignedIds.add(subSlot.primary_staff_id);
                }
              });
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
        return { isAuthorized: true, reason: `Assigned ${authType} member`, authorizationType: 'assigned_faculty' };
      }

      // STEP 9: For development/testing - if no assignments found, allow with warning
      if (allAssignedIds.size === 0) {
        logger.warn('academic/attendance', 'No staff/profile assignments found in timetable - allowing access for testing');
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

      return {
        isAuthorized: false,
        reason: `User ${(profileData as any).email} is not authorized to mark attendance for this timetable`,
        assignedStaff: assignedStaff || undefined
      };
    } catch (error) {
      logger.error('academic/attendance', 'Error validating staff assignment', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown validation error';
      return {
        isAuthorized: false,
        reason: `Validation error: ${errorMessage}`
      };
    }
  }

  // =====================
  // MARKING METHODS
  // =====================

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
        logger.error('academic/attendance', errorMessage, {
          timetable_id: data.timetable_id,
          marked_by: data.marked_by
        });
        toast.error(
          'You are not authorized to mark attendance for this period. Only assigned staff can mark attendance.'
        );
        throw new Error(errorMessage);
      }

      // Enrich attendance_data with authorization_type in marked_by_details
      const enrichedAttendanceData = { ...data.attendance_data };
      Object.keys(enrichedAttendanceData).forEach((periodKey) => {
        const period = enrichedAttendanceData[periodKey];
        if (period && period.marked_by_details) {
          period.marked_by_details = {
            ...period.marked_by_details,
            authorization_type: validationResult.authorizationType || 'assigned_faculty'
          };
        }
      });

      // Validate section_id is a valid UUID
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      let resolvedSectionId = data.section_id;

      // If section_id is not a valid UUID, try to resolve it
      if (resolvedSectionId && !uuidRegex.test(resolvedSectionId)) {
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
            .eq('program_id', (timetableData as any).program_id)
            .eq('department_id', (timetableData as any).department_id)
            .eq('degree_id', (timetableData as any).degree_id)
            .eq('is_active', true)
            .maybeSingle();

          if (sectionData) {
            resolvedSectionId = (sectionData as any).id;
          } else {
            const errorMessage = `Cannot resolve section name "${resolvedSectionId}" to a valid UUID`;
            logger.error('academic/attendance', errorMessage);
            throw new Error(errorMessage);
          }
        } else {
          const errorMessage = 'Cannot resolve section without timetable data';
          logger.error('academic/attendance', errorMessage);
          throw new Error(errorMessage);
        }
      }

      if (!resolvedSectionId) {
        const errorMessage = 'Section ID is required for attendance';
        logger.error('academic/attendance', errorMessage);
        throw new Error(errorMessage);
      }

      // Updated: 2025-01-16 - Check if date is blocked by approved leave
      // This prevents attendance marking on dates with institution/department/semester/section leaves
      const leaveCheck = await LeaveCalendarService.checkLeaveBlockForAttendance({
        institution_id: data.institution_id,
        date: data.attendance_date,
        department_id: data.department_id,
        semester_id: data.semester_id,
        section_id: resolvedSectionId
      });

      if (!leaveCheck.allowed) {
        const errorMessage = leaveCheck.reason || 'Cannot mark attendance on a holiday';
        logger.error('academic/attendance', 'Attendance blocked by approved leave', {
          date: data.attendance_date,
          leave: leaveCheck.leave,
          institution_id: data.institution_id,
          section_id: resolvedSectionId
        });
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }

      // First, try to find existing consolidated record
      const { data: existingRecord, error: findError } = await this.supabase
        .from('student_attendance')
        .select('id, timetable_id')
        .eq('institution_id', data.institution_id)
        .eq('timetable_id', data.timetable_id)
        .eq('section_id', resolvedSectionId)
        .eq('attendance_date', data.attendance_date)
        .maybeSingle();

      if (findError) {
        logger.error('academic/attendance', 'Error finding existing attendance record', findError);
        throw findError;
      }

      let result;
      if (existingRecord) {
        // ─── Service-layer HOD scope check (added 2026-03-20) ────────────────────
        // Prevents API-level bypass: only super_admin can edit any record;
        // HOD can only edit records within their own institution + department.
        if (data.is_edit_mode) {
          const editorProfile = data.editor_profile
          if (!editorProfile) {
            throw new Error('editor_profile is required for attendance edits')
          }
          if (editorProfile.role !== 'super_admin') {
            if (editorProfile.role !== 'hod') {
              throw new Error('Not authorized to edit attendance')
            }
            // Fetch timetable department to validate HOD scope
            const { data: timetableData } = await (this.supabase as any)
              .from('timetables')
              .select('department_id, institution_id')
              .eq('id', data.timetable_id)
              .single()
            if (!timetableData) {
              throw new Error('Cannot verify HOD scope: timetable not found')
            }
            if (timetableData.department_id !== data.department_id) {
              throw new Error('HOD can only edit attendance in their own department')
            }
            if (timetableData.institution_id !== data.institution_id) {
              throw new Error('HOD can only edit attendance in their own institution')
            }
          }
        }
        // ─── End scope check ──────────────────────────────────────────────────────

        // Fetch existing record to get current attendance_data for merging
        const { data: currentRecord, error: fetchError } = await this.supabase
          .from('student_attendance')
          .select('attendance_data')
          .eq('id', (existingRecord as any).id)
          .single();

        if (fetchError) {
          logger.error('academic/attendance', 'Error fetching existing attendance data', fetchError);
          throw fetchError;
        }

        // Merge new attendance data with existing data
        const existingAttendanceData =
          ((currentRecord as any)?.attendance_data as ConsolidatedAttendanceData) || {};
        const mergedAttendanceData = {
          ...existingAttendanceData, // Keep existing periods
          ...enrichedAttendanceData // Add/update new periods with authorization_type
        };

        // Updated: 2025-10-09 - Update section_ids array for multi-section support
        const { data: updateResult, error: updateError } = await (this.supabase
          .from('student_attendance') as any)
          .update({
            attendance_data: mergedAttendanceData, // Use merged data instead of overwriting
            section_ids: data.section_ids || null, // Update section_ids array if provided
            updated_at: new Date().toISOString()
          })
          .eq('id', (existingRecord as any).id)
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

        // ─── Audit log: record per-student status changes ────────────────────────
        // Added: 2026-03-20 — Attendance edit audit trail
        // Only runs when an edit is being performed (data.is_edit_mode === true)
        if (data.is_edit_mode && data.editor_profile && data.period_id_being_edited) {
          const periodKey = data.period_id_being_edited
          const oldPeriodStudents: Array<{ student_id: string; status: string }> =
            (existingAttendanceData?.[periodKey]?.students || [])
          const newPeriodStudents: Array<{ student_id: string; status: string }> =
            (mergedAttendanceData?.[periodKey]?.students || [])

          const diff = computeAttendanceDiff(oldPeriodStudents, newPeriodStudents)

          if (diff.length > 0) {
            const auditRows = diff.map((change) => ({
              attendance_id: (existingRecord as any).id,
              period_id: periodKey,
              student_id: change.student_id,
              old_status: change.old_status,
              new_status: change.new_status,
              edited_by: data.editor_profile!.id,
              edited_by_name: data.editor_profile!.full_name,
              edited_by_role: data.editor_profile!.role,
              edited_at: new Date().toISOString(),
              institution_id: data.institution_id,
              attendance_date: data.attendance_date,
            }))

            const { error: auditError } = await (this.supabase as any)
              .from('attendance_audit_log')
              .insert(auditRows)

            if (auditError) {
              // Best-effort: log but do not throw — attendance update already succeeded
              logger.error('academic/attendance', 'Failed to write attendance audit log', auditError)
            }
          }
        }
        // ─── End audit log ────────────────────────────────────────────────────────
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
              data.semester_id || (timetableData as any).semester_id;

            academicFields = {
              academic_year_id:
                data.academic_year_id || (timetableData as any).academic_year_id,
              degree_id: data.degree_id || (timetableData as any).degree_id,
              program_id: data.program_id || (timetableData as any).program_id,
              department_id: data.department_id || (timetableData as any).department_id,
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
          logger.error('academic/attendance', 'Attendance validation failed', {
            errors: validationErrors,
            timetable_id: data.timetable_id
          });
          throw new Error(
            `Attendance validation failed: ${validationErrors.join(', ')}`
          );
        }

        // Updated: 2025-10-09 - Add section_ids array for multi-section support
        const { data: insertResult, error: insertError } = await this.supabase
          .from('student_attendance')
          .insert({
            timetable_id: data.timetable_id,
            section_id: resolvedSectionId,
            section_ids: data.section_ids || null, // Store section_ids array if provided
            attendance_date: data.attendance_date,
            attendance_data: enrichedAttendanceData, // Use enriched data with authorization_type
            institution_id: data.institution_id,
            academic_year_id: academicFields.academic_year_id,
            degree_id: academicFields.degree_id,
            program_id: academicFields.program_id,
            department_id: academicFields.department_id,
            semester_id: academicFields.semester_id,
            updated_at: new Date().toISOString()
          } as any)
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

      trackUsage({ module: 'academic/attendance', feature: 'mark_attendance', eventType: 'create' });
      return result as ConsolidatedStudentAttendance;
    } catch (error) {
      logger.error('academic/attendance', 'Error upserting consolidated attendance', error);
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
      logger.error('academic/attendance', 'Error batch updating consolidated attendance', error);
      toast.error('Failed to save attendance');
      throw error;
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
        logger.warn('academic/attendance', 'Manual attendance entries are not saved to database yet');
        toast.success('Manual attendance marked (not saved to database)');
        return;
      }

      // Use upsert to create or update attendance records
      const { error } = await this.supabase
        .from('student_attendance')
        .upsert(data.records as any, {
          onConflict: 'student_id,timetable_slot_id,attendance_date'
        });

      if (error) throw error;

      toast.success('Attendance saved successfully');
    } catch (error) {
      logger.error('academic/attendance', 'Error batch updating attendance', error);
      toast.error('Failed to save attendance');
      throw error;
    }
  }

  // Update single attendance record
  static async updateAttendance(
    id: string,
    data: UpdateStudentAttendanceDto
  ): Promise<StudentAttendance> {
    try {
      const { data: updatedRecord, error } = await (this.supabase
        .from('student_attendance') as any)
        .update({
          ...(data as any),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return updatedRecord;
    } catch (error) {
      logger.error('academic/attendance', 'Error updating attendance', error);
      throw error;
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

      let markerName = (profileData as any)?.full_name || 'Unknown User';
      let markerEmail = (profileData as any)?.email || '';
      const markerRole = (profileData as any)?.role || 'faculty';

      // Try to get better name from staff table if user is faculty
      if ((profileData as any)?.role === 'faculty') {
        const { data: staffData } = await this.supabase
          .from('staff')
          .select('staff_name, staff_email')
          .eq('profile_id', attendanceData.marked_by)
          .eq('institution_id', attendanceData.institution_id)
          .eq('is_active', true)
          .maybeSingle();

        if (staffData) {
          markerName = (staffData as any).staff_name;
          markerEmail = (staffData as any).staff_email || markerEmail;
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
            section_id: attendanceData.section_id, // Updated: 2025-10-09 - Add required section_id property
            status: record.status,
            marked_at: new Date().toISOString()
          })),
          // Add marker details with timestamp
          marked_by_details: {
            marker_id: attendanceData.marked_by,
            marker_name: markerName,
            marker_role: markerRole,
            marker_email: markerEmail,
            marked_at: new Date().toISOString(), // Add timestamp when period is marked
            authorization_type: 'permission_based' // Manual entries use permission-based authorization
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

      // Activity logging — one summary log per marking session
      const presentCount = attendanceData.student_records.filter(r => r.status === 'Present').length;
      const totalCount = attendanceData.student_records.length;

      let sectionNameForLog = attendanceData.section_id;
      try {
        const { data: section } = await AttendanceCoreService.supabase
          .from('sections')
          .select('name, section_name')
          .eq('id', attendanceData.section_id)
          .single();
        sectionNameForLog = (section as any)?.name || (section as any)?.section_name || attendanceData.section_id;
      } catch { /* ignore */ }

      const markerDisplayName = markerName || attendanceData.marked_by;

      (async () => {
        try {
          const logTemplate = AcademicActivityTemplates.attendanceMarked(
            markerDisplayName,
            sectionNameForLog,
            'Manual Entry',
            presentCount,
            totalCount
          );
          await logActivityClient({
            userId: attendanceData.marked_by,
            actionType: logTemplate.actionType,
            resourceType: logTemplate.resourceType,
            description: logTemplate.description,
            metadata: {
              sub_type: logTemplate.sub_type,
              section_id: attendanceData.section_id,
              period_id: 'manual-entry',
              attendance_date: attendanceData.attendance_date,
              present_count: presentCount,
              total_count: totalCount,
            },
            institutionId: attendanceData.institution_id,
          });
        } catch { /* never block */ }
      })();

      trackUsage({ module: 'academic/attendance', feature: 'save_manual_attendance', eventType: 'create', metadata: { student_count: attendanceData.student_records.length } });
      toast.success(
        `✅ Manual attendance saved for ${attendanceData.student_records.length} students`
      );
    } catch (error) {
      logger.error('academic/attendance', 'Error saving manual attendance', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to save manual attendance';
      toast.error(errorMessage);
      throw error;
    }
  }

  // =====================
  // PERMISSION CHECK METHODS
  // =====================

  // Get current user's staff ID if they are a staff member
  // Updated: 2025-11-29 - Enhanced email lookup with case-insensitive matching and fallbacks
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
      if ((profile as any).role === 'hod') {
        return null;
      }

      // Normalize email for matching
      const profileEmail = (profile as any).email?.trim().toLowerCase();
      const authEmail = userData.user.email?.trim().toLowerCase();

      if (!profileEmail && !authEmail) {
        logger.warn('academic/attendance', 'No email found for user', { userId: userData.user.id });
        return null;
      }

      // 1. Try case-insensitive match on institution_email with profile email
      if (profileEmail) {
        // Updated: 2025-12-01 - Include staff name and number for better debugging
        const { data: staff } = await this.supabase
          .from('staff')
          .select('id, first_name, last_name, staff_id, institution_email')
          .ilike('institution_email', profileEmail)
          .eq('is_active', true)
          .maybeSingle();

        if (staff) {
          return (staff as any).id;
        }

        // 2. Fallback: Try matching on personal email field
        const { data: staffByPersonalEmail } = await this.supabase
          .from('staff')
          .select('id')
          .ilike('email', profileEmail)
          .eq('is_active', true)
          .maybeSingle();

        if (staffByPersonalEmail) {
          return (staffByPersonalEmail as any).id;
        }
      }

      // 3. Fallback: Try auth user's email if different from profile email
      if (authEmail && authEmail !== profileEmail) {
        const { data: staffByAuthEmail } = await this.supabase
          .from('staff')
          .select('id')
          .or(`institution_email.ilike.${authEmail},email.ilike.${authEmail}`)
          .eq('is_active', true)
          .maybeSingle();

        if (staffByAuthEmail) {
          return (staffByAuthEmail as any).id;
        }
      }

      // No staff record found
      logger.warn('academic/attendance', 'No staff record found for user', { userId: userData.user.id });

      return null;
    } catch (error) {
      logger.error('academic/attendance', 'Error getting current user staff ID', error);
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
      const timetableId = await AttendanceCoreService.getTimetableIdFromSlotInternal(timetableSlotId);
      if (!timetableId) {
        return false;
      }

      // Get timetable data and extract all slots
      const { data: timetableData, error: slotsError } = await this.supabase
        .from('timetables')
        .select('timetable_data')
        .eq('id', timetableId)
        .single();

      if (slotsError || !(timetableData as { timetable_data?: TimetableData })?.timetable_data) {
        logger.error('academic/attendance', 'Error fetching timetable data for staff assignment check', slotsError);
        return false;
      }

      // Extract all slots from JSON structure
      const slots: any[] = [];
      const timetableJson = (timetableData as { timetable_data: TimetableData }).timetable_data;
      for (const [dayKey, dayData] of Object.entries(timetableJson)) {
        if (typeof dayData === 'object' && dayData !== null) {
          for (const [periodKey, slotData] of Object.entries(dayData)) {
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

      return false;
    } catch (error) {
      logger.error('academic/attendance', 'Error checking staff assignment to slot', error);
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
        return false;
      }

      // First check: Is staff specifically assigned to this slot?
      const isAssigned = await this.isStaffAssignedToSlot(
        staffId,
        timetableSlotId
      );

      if (isAssigned) {
        return true;
      }

      // Second check: Is user an HOD with department-based access?
      const hasHODAccess = await this.checkHODDepartmentAccess(timetableSlotId);

      if (hasHODAccess) {
        return true;
      }

      // Third check: Does user have faculty role with attendance permissions?
      // This allows faculty members to mark attendance even if not specifically assigned
      const hasRolePermission = await this.checkFacultyAttendancePermission();

      if (hasRolePermission) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('academic/attendance', 'Error checking attendance permission for slot', error);
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
        .eq('role_key', (profile as any).role)
        .single();

      if (roleError || !roleData) {
        return false;
      }

      // Check if role has attendance marking permission
      const permissions = (roleData as any).permissions as any;
      return permissions && permissions['academic.attendance.mark'] === true;
    } catch (error) {
      logger.error('academic/attendance', 'Error checking faculty attendance permission', error);
      return false;
    }
  }

  // New helper method to check HOD department-based access
  static async checkHODDepartmentAccess(
    timetableSlotId: string
  ): Promise<boolean> {
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
      if ((profile as any).role !== 'hod' || (profile as any).is_super_admin) {
        return false;
      }

      // HOD must have a department assigned
      if (!(profile as any).department_id) {
        return false;
      }

      // Check if the timetable slot belongs to a timetable in the HOD's department
      const { data: timetableData, error: timetableError } = await this.supabase
        .from('timetables')
        .select('department_id')
        .eq('id', timetableSlotId) // Assuming timetableSlotId refers to timetable ID
        .single();

      if (timetableError) {
        // If direct lookup fails, search through timetables for this slot
        const { data: allTimetables, error: allTimetablesError } =
          await this.supabase
            .from('timetables')
            .select('id, department_id, timetable_data')
            .eq('department_id', (profile as any).department_id)
            .eq('is_active', true);

        if (allTimetablesError || !allTimetables) {
          return false;
        }

        // Check if any timetable in the department contains this slot
        const hasSlot = allTimetables.some((timetable: any) => {
          const timetableData = timetable.timetable_data as TimetableData | null;
          if (!timetableData) return false;

          // Check if timetableSlotId exists in the timetable_data
          for (const dayData of Object.values(timetableData)) {
            if (dayData && typeof dayData === 'object') {
              for (const [slotId] of Object.entries(dayData)) {
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
      const belongsToHODDepartment =
        (timetableData as any).department_id === (profile as any).department_id;

      return belongsToHODDepartment;
    } catch (error) {
      logger.error('academic/attendance', 'Error checking HOD department access', error);
      return false;
    }
  }

  // =====================
  // PRACTICAL PERIOD METHODS (Dual-Mode Period System)
  // Updated: 2025-10-25
  // =====================

  /**
   * Check if a batch already has attendance marked for a specific period/date
   * Prevents duplicate batch attendance for practical periods
   */
  static async checkPracticalConflict(params: {
    timetable_id: string;
    period_slot_id: string;
    batch_id: string;
    date: string;
  }): Promise<{
    hasConflict: boolean;
    message?: string;
    existingRecord?: {
      lab: string;
      time: string;
      course: string;
    };
  }> {
    try {
      const { timetable_id, period_slot_id, batch_id, date } = params;

      // Query student_attendance for this timetable, date, and period
      const { data: existingAttendance, error } = await this.supabase
        .from('student_attendance')
        .select('id, attendance_data, created_at')
        .eq('timetable_id', timetable_id)
        .eq('attendance_date', date)
        .eq('period_slot_id', period_slot_id);

      if (error) {
        logger.error('academic/attendance', 'Error checking conflict', error);
        throw error;
      }

      // Check if any record has this batch_id in attendance_data
      if (existingAttendance && existingAttendance.length > 0) {
        for (const record of existingAttendance) {
          const attendanceData = (record as any).attendance_data as any;
          const periodData = attendanceData[period_slot_id];

          if (periodData && periodData.period_mode === 'practical') {
            // Check if this batch was already marked
            if (periodData.batch_selected?.batch_id === batch_id) {
              // Conflict found!
              return {
                hasConflict: true,
                message: `Attendance already marked for this batch on ${date}`,
                existingRecord: {
                  lab: periodData.lab_selected || 'Unknown Lab',
                  course: periodData.course_selected || 'Unknown Course',
                  time: new Date((record as any).created_at).toLocaleTimeString()
                }
              };
            }
          }
        }
      }

      // No conflict found
      return {
        hasConflict: false
      };
    } catch (error) {
      logger.error('academic/attendance', 'Error in checkPracticalConflict', error);
      throw error;
    }
  }

  // =====================
  // AUDIT LOG METHODS
  // =====================

  /**
   * Returns all audit log entries for a given student_attendance record.
   * RLS ensures only super_admin can read these — all other roles get [].
   * Throws on unexpected Supabase errors.
   * Added: 2026-03-20 — Attendance edit audit trail
   */
  static async getAttendanceAuditLog(attendanceId: string): Promise<AttendanceAuditEntry[]> {
    const { data, error } = await (this.supabase as any)
      .from('attendance_audit_log')
      .select('*')
      .eq('attendance_id', attendanceId)
      .order('edited_at', { ascending: false })

    if (error) {
      logger.error('academic/attendance', 'Failed to fetch attendance audit log', error)
      throw error
    }

    const rows = data || []
    if (rows.length === 0) return []

    // Fetch student names in a separate query — no FK exists between
    // attendance_audit_log.student_id and learners_profiles, so PostgREST
    // join syntax is not available.
    const studentIds = [...new Set(rows.map((r: any) => r.student_id as string))]
    const { data: profiles } = await (this.supabase as any)
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .in('id', studentIds)

    const profileMap = new Map<string, { first_name: string; last_name: string; roll_number: string }>(
      (profiles || []).map((p: any) => [p.id, p])
    )

    return rows.map((row: any) => {
      const profile = profileMap.get(row.student_id)
      return {
        ...row,
        student_name: profile
          ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || undefined
          : undefined,
        roll_number: profile?.roll_number ?? undefined,
      } as AttendanceAuditEntry
    })
  }

  // =====================
  // INTERNAL HELPERS (used only within this class)
  // =====================

  /**
   * Internal helper: resolve a slot key to a timetable ID.
   * Duplicated from AttendanceService to avoid circular imports.
   * AttendanceService.getTimetableIdFromSlot is the canonical version
   * with full logging; this is a lean copy for intra-class use.
   */
  private static async getTimetableIdFromSlotInternal(slotId: string): Promise<string | null> {
    // PRIMARY PATH: Use student_attendance as an indexed bridge.
    const { data: attendanceRef, error: primaryError } = await this.supabase
      .from('student_attendance')
      .select('timetable_id')
      .eq('period_slot_id', slotId)
      .limit(1)
      .maybeSingle();

    if (!primaryError && attendanceRef?.timetable_id) {
      return attendanceRef.timetable_id;
    }

    // FALLBACK: Scan active timetables
    const { data: timetables, error: scanError } = await this.supabase
      .from('timetables')
      .select('id, timetable_data')
      .not('timetable_data', 'is', null)
      .eq('is_active', true);

    if (scanError || !timetables) return null;

    for (const timetable of timetables) {
      const data = (timetable as { timetable_data?: TimetableData; id?: string }).timetable_data as TimetableData | undefined;
      if (!data || typeof data !== 'object') continue;
      for (const dayData of Object.values(data)) {
        if (!dayData || typeof dayData !== 'object') continue;
        for (const [periodId, slotData] of Object.entries(dayData)) {
          if (
            slotData?.slot_id === slotId ||
            periodId === slotId
          ) {
            return (timetable as { id?: string }).id ?? null;
          }
        }
      }
    }

    return null;
  }
}
