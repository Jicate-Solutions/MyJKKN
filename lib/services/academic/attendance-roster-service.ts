import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  ACTIVE_ONLY_LIFECYCLE_FILTER,
  buildRosterLifecycleFilter,
} from '@/lib/utils/academic/provisional-roster-filter';
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

  /**
   * Lifecycle filter for a roster read: `active` learners, plus provisional
   * freshers of the current intake (spec: provisional-freshers-spec-2026-08-05).
   *
   * The current-intake identifiers come from fn_current_admission_year_ids(), a
   * SECURITY DEFINER RPC, and deliberately NOT from a direct `admission_years`
   * read. That table's RLS requires `admission.settings.years.view`, and of the
   * eight active roles holding `academic.attendance.mark` only `hod` has it
   * (verified on production 2026-08-08). A direct read would return zero rows
   * with error = null for the other seven — so the feature would work for HODs
   * and silently do nothing for everyone else, with no error to explain it.
   *
   * Never throws, and every failure path falls back to active-only, which is
   * exactly the behaviour that shipped before provisional freshers: a roster
   * missing its provisional rows is degraded and visible, a roster that throws
   * is an outage on the marking screen.
   */
  private static async getRosterLifecycleFilter(): Promise<string> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_current_admission_year_ids'
      );

      if (error) {
        logger.warn(
          'academic/attendance',
          'Could not resolve the current intake; roster falls back to active-only',
          error
        );
        return ACTIVE_ONLY_LIFECYCLE_FILTER;
      }

      return buildRosterLifecycleFilter(data as string[] | null);
    } catch (error) {
      logger.warn(
        'academic/attendance',
        'Could not resolve the current intake; roster falls back to active-only',
        error
      );
      return ACTIVE_ONLY_LIFECYCLE_FILTER;
    }
  }

  /**
   * Added: 2026-08-20 — keep only the learners belonging to the timetable's cohort.
   *
   * `sections` has no academic-year column, so a section row is reused by every
   * intake that passes through it. Once the next intake is loaded, two cohorts
   * appear on one marking screen (JKKN AHS: "The Fresher's Name List has been
   * updated along with the current first year's list").
   *
   * The academic year cannot be read from the browser — learners_profiles SELECT
   * RLS excludes faculty, which is why the roster is served by an RPC in the first
   * place — so it is resolved through fn_learner_academic_years (migration
   * 20260820124500), which returns nothing but id + academic_year_id.
   *
   * DEGRADES, NEVER THROWS. If the function is absent (migration not applied yet)
   * or the call fails, the roster is returned unscoped and a warning is logged.
   * Freshers keep appearing until the migration lands — today's behaviour, not a
   * new failure. Losing the roster entirely would be far worse than showing it
   * slightly too wide, which is the standing principle on the marking screen.
   */
  private static async scopeRosterToAcademicYear(
    rows: any[],
    institutionId: string,
    academicYearId: string | null
  ): Promise<any[]> {
    if (!academicYearId || rows.length === 0) return rows;

    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_learner_academic_years',
        {
          p_institution_id: institutionId,
          p_learner_ids: rows.map((r) => r.id)
        }
      );

      if (error || !Array.isArray(data)) {
        logger.warn(
          'academic/attendance',
          'Could not resolve learner academic years; roster returned unscoped',
          { institutionId, code: (error as any)?.code, message: (error as any)?.message }
        );
        return rows;
      }

      const yearByLearner = new Map<string, string | null>(
        (data as any[]).map((r) => [r.id, r.academic_year_id])
      );

      const scoped = rows.filter((r) => {
        const year = yearByLearner.get(r.id);
        // A learner with NO academic year is KEPT: on production 14 of 391 AHS
        // learners have none, and dropping them would turn a missing-data problem
        // into a silently short roster — the failure mode behind BUG-003249/003250.
        // Absence of a year is not evidence of the wrong year.
        return year == null || year === academicYearId;
      });

      if (scoped.length < rows.length) {
        logger.dev('academic/attendance', 'Roster scoped to the timetable academic year', {
          institutionId,
          academicYearId,
          kept: scoped.length,
          dropped: rows.length - scoped.length
        });
      }

      return scoped;
    } catch (error) {
      logger.warn(
        'academic/attendance',
        'Could not resolve learner academic years; roster returned unscoped',
        error
      );
      return rows;
    }
  }

  // =====================
  // ROSTER CHECKING / AGGREGATION METHODS
  // =====================

  /**
   * A saved period slot carries students either directly (standard periods) or
   * nested under subdivision groups (combined/subdivided periods save `students: []`
   * at the top level and put the real rows in `groups[].students` — see mark/page.tsx).
   * Checking only the top-level array made subdivided periods look permanently
   * unmarked even though the record was saved.
   */
  private static periodHasAttendance(slotData: any): boolean {
    if (!slotData) return false;
    if (Array.isArray(slotData.students) && slotData.students.length > 0) {
      return true;
    }
    if (Array.isArray(slotData.groups)) {
      return slotData.groups.some(
        (group: any) => Array.isArray(group?.students) && group.students.length > 0
      );
    }
    return false;
  }

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

        // Validate parameters before query. A missing section_id is EXPECTED for
        // semester-level timetables (periods span all sections, so there's no
        // single section to pre-check) — that's a normal skip, not an error.
        // We still surface a genuinely malformed period (missing timetable/date)
        // at warn level.
        if (
          !firstPeriod.timetable_id ||
          !firstPeriod.section_id ||
          !firstPeriod.attendance_date
        ) {
          const isExpectedNoSection =
            !!firstPeriod.timetable_id &&
            !!firstPeriod.attendance_date &&
            !firstPeriod.section_id;
          const logParams = {
            timetable_id: firstPeriod.timetable_id,
            section_id: firstPeriod.section_id,
            attendance_date: firstPeriod.attendance_date
          };
          if (isExpectedNoSection) {
            logger.debug(
              'academic/attendance',
              'Skipping attendance pre-check for semester-level period (no specific section)',
              logParams
            );
          } else {
            logger.warn(
              'academic/attendance',
              'Invalid parameters for attendance check',
              logParams
            );
          }
          // Mark all periods in this group as not marked.
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
            if (this.periodHasAttendance(slotData)) {
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
        if (this.periodHasAttendance(periodData)) {
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
            this.periodHasAttendance(slotData)
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
      const lifecycleFilter =
        await AttendanceRosterService.getRosterLifecycleFilter();

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
          academic_year_id
        `
        )
        .or(lifecycleFilter)
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

      // Added: 2026-08-20 - Scope the roster to the timetable's academic year.
      // `sections` carries no academic-year column, so one "Section A" is reused by
      // every intake and, once the next intake is loaded, two cohorts appear on one
      // marking screen (JKKN AHS: the fresher list arriving on the current first
      // year's roster). The timetable's academic_year_id is already selected above
      // and was previously read but never applied.
      //
      // Applied here in TypeScript rather than as a second .or() on the query: the
      // lifecycle predicate above already occupies an .or(), and stacking a second
      // one leaves the AND/OR grouping to PostgREST's parameter merging rather than
      // stating it explicitly. Rosters are section-sized, so the filtering cost is
      // irrelevant next to the ambiguity.
      //
      // Learners with a NULL academic_year_id are KEPT: 14 of 391 AHS learners have
      // none, and dropping them would convert a missing-data problem into a silently
      // short roster — the exact failure mode behind BUG-003249/003250.
      const scopedStudents =
        timetableData?.academic_year_id
          ? (students || []).filter(
              (student: any) =>
                student.academic_year_id == null ||
                student.academic_year_id === timetableData.academic_year_id
            )
          : students || [];

      if (timetableData?.academic_year_id && students) {
        const droppedCount = students.length - scopedStudents.length;
        if (droppedCount > 0) {
          logger.dev(
            'academic/attendance',
            'Roster scoped to the timetable academic year',
            {
              timetable_id,
              section_id,
              academic_year_id: timetableData.academic_year_id,
              kept: scopedStudents.length,
              dropped: droppedCount
            }
          );
        }
      }

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
      const rosterStudents: AttendanceRosterStudent[] = scopedStudents.map(
        (student: any) => {
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
  // Updated: 2026-08-20 - academic_year_id added. `sections` carries no academic
  // year, so one "Section A" is reused by every intake that passes through it and
  // the next intake surfaces on the outgoing cohort's marking screen (reported by
  // JKKN AHS: "The Fresher's Name List has been updated along with the current
  // first year's list, which is preventing us from marking attendance").
  // Optional and NULL-safe end to end — omitting it preserves today's roster
  // exactly. Requires migration 20260820124500; see that file's deploy note.
  static async getStudentsForAttendance(filters: {
    institution_id: string;
    degree_id?: string;
    program_id?: string;
    department_id?: string;
    semester_id?: string;
    section_id?: string; // Single section (backward compatibility)
    section_ids?: string[]; // Multiple sections (new feature)
    academic_year_id?: string | null; // Cohort scope; from the timetable
  }): Promise<AttendanceStudent[]> {
    try {
      // Updated: 2026-06-19 (FIX 1) - Route roster reads through fn_attendance_roster,
      // a scoped SECURITY DEFINER RPC. The learners_profiles SELECT RLS policy only admits
      // roles holding a learners.*view permission; faculty/HOD/staff_counselor who can mark
      // attendance but lack those keys were getting an EMPTY roster even on fully-enrolled
      // sections. The RPC returns only the roster columns, gated by academic.attendance.
      // mark/view/reports + institution access — so it does not broaden learners_profiles
      // table RLS. Department is intentionally not filtered (faculty teach across departments);
      // section_id/section_ids scope the rows. Ordering is done inside the RPC.
      const sectionIds =
        filters.section_ids && filters.section_ids.length > 0
          ? filters.section_ids
          : filters.section_id
            ? [filters.section_id]
            : null;

      const { data, error } = await (this.supabase as any).rpc('fn_attendance_roster', {
        p_institution_id: filters.institution_id,
        p_section_ids: sectionIds,
        p_degree_id: filters.degree_id ?? null,
        p_program_id: filters.program_id ?? null,
        p_semester_id: filters.semester_id ?? null
      });

      if (error) {
        logger.error('academic/attendance', 'RPC error in getStudentsForAttendance (fn_attendance_roster)', error);
        throw error;
      }

      if (!data || data.length === 0) {
        logger.warn('academic/attendance', 'No students found for attendance', { filters });
      }

      // Added: 2026-08-20 - Keep only the cohort this timetable teaches.
      // `sections` has no academic-year column, so one section row is shared by every
      // intake and the next intake's freshers surface on the current cohort's marking
      // screen (JKKN AHS report). fn_attendance_roster does not return
      // academic_year_id, and the browser cannot read it from learners_profiles —
      // that table's RLS excludes faculty, which is why the roster is an RPC at all.
      // fn_learner_academic_years exposes just that one column under the same
      // permission gate. See migration 20260820124500.
      const rosterRows = (data || []) as any[];
      const scopedRows = await this.scopeRosterToAcademicYear(
        rosterRows,
        filters.institution_id,
        filters.academic_year_id ?? null
      );

      // Transform the data to include student_name constructed from first_name and last_name
      const transformedData = scopedRows.map((student: any) => ({
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
