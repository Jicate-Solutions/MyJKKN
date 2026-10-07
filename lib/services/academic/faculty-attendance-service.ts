import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AttendancePeriodOption } from '@/types/attendance';
import { format } from 'date-fns';
import { AttendanceService } from './attendance-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { isTimetableOnApprovedLeave } from '@/lib/utils/academic/approved-leave-scope';
import { fillPeriodSectionNames, sectionIdsNeedingNames } from '@/lib/utils/academic/fill-period-section-names';
import { practicalSectionIdsForStaff, practicalStudentIdsForStaff } from '@/lib/utils/practical-period-sections';
import { isNonMarkableSlot } from '@/lib/utils/academic/non-markable-slot';
import * as resolver from './faculty-schedule-resolver';
import type {
  TimetableWithRelations,
  TimetableDataStructure,
  AcademicYearBasic,
  StaffBasic,
  CourseBasic,
} from '@/types/academic/timetable-queries';
import type { LearnerAttendanceHistoryRow } from '@/lib/utils/academic/learner-attendance-history';

export class FacultyAttendanceService {
  private static supabase = createClientSupabaseClient();

  // Updated: 2026-10-08 - formatTo12Hour, fetchPeriodMasterMap and mergePeriodMaster
  // (and getDayOfWeekFromDate, isDateInTimetableRange, parseTime) moved UNCHANGED,
  // with getFacultyTodayPeriods' body, to ./faculty-schedule-resolver.ts, so a
  // server job can resolve a day without this file's browser client. The rest of
  // this class keeps calling them through these delegates.
  private static formatTo12Hour(time24: string): string {
    return resolver.formatTo12Hour(time24);
  }

  private static async fetchPeriodMasterMap(
    institutionIds: (string | null | undefined)[]
  ): Promise<Map<string, any>> {
    return resolver.fetchPeriodMasterMap(institutionIds, this.supabase);
  }

  private static mergePeriodMaster(periodDef: any, master: Map<string, any>): any {
    return resolver.mergePeriodMaster(periodDef, master);
  }

  /**
   * Get staff ID from user institution email.
   *
   * Returns null ONLY when no staff row carries this institution_email.
   * THROWS on every other failure — a timeout, a dropped connection, an RLS
   * refusal, or the impossible "two rows for one unique email".
   *
   * ── WHY IT THROWS (hardened 2026-08-17, from BUG-005820) ─────────────────
   * This used to swallow every error and return null, which the callers cannot
   * tell apart from "you have no staff record". The attendance screen renders
   * that null as:
   *
   *   "Your faculty account is not linked to a staff record. Please contact the
   *    administrator to link your email (…) to your staff profile."
   *
   * On a statement timeout that sentence is simply false, and it is worse than
   * a blank screen: it is an instruction, addressed to an administrator, to go
   * and change data that was never wrong. In BUG-005820 an admin acted on that
   * message and created a SECOND staff record — which resolved the lookup and
   * still showed no classes, because the teaching load stayed on the original
   * row. A wrong diagnosis is more expensive than a visible error.
   *
   * This is the same rule getFacultyTodayPeriods below already follows: a DB
   * error must not masquerade as an empty result. Callers catch this and offer
   * a Retry instead of blaming the user's account.
   *
   * maybeSingle(), not single(): with maybeSingle "no rows" is data (null), not
   * a PGRST116 error, so the genuine-absence path no longer has to be told
   * apart from a failure by inspecting an error code. staff.institution_email
   * carries a UNIQUE index, so >1 row is a real corruption and maybeSingle's
   * error on it is exactly right — it now surfaces instead of reading as
   * "no staff record".
   */
  static async getStaffIdByEmail(email: string): Promise<string | null> {
    const { data, error } = (await this.supabase
      .from('staff')
      .select('id')
      .eq('institution_email', email)
      .maybeSingle()) as { data: { id: string } | null; error: any };

    if (error) {
      logger.error(
        'academic/faculty-attendance',
        'Staff lookup by institution_email failed',
        { email, code: error.code, message: error.message }
      );
      throw error;
    }

    // A genuine absence. Note this matches institution_email ONLY, never the
    // personal `email` column — a staff row whose institution_email is
    // misspelled is invisible here even though the person plainly exists.
    return data?.id ?? null;
  }

  /**
   * Get today's periods for a faculty member
   * OPTIMIZED: Directly extracts periods from timetable_data instead of calling expensive service methods
   * Updated: 2025-10-13 - Performance optimization for "My Classes" view
   *
   * Updated: 2026-10-08 - `options` (all optional; My Classes passes none and is
   * unchanged). The raise-targets schedule record
   * (lib/services/hr/salary-revision/scheduled-periods-recorder.ts) calls this same
   * resolver from the nightly job with the SERVICE-ROLE client:
   *   client                 the Supabase client to read with (default: the browser client)
   *   includeInactive        also read timetables switched off since (the daily job
   *                          switches a timetable off the day after it ends; default dd)
   *   teachingInstitutionIds the institutions the team member teaches in, worked out by
   *                          the caller (fn_staff_teaching_institutions refuses a
   *                          caller with no signed-in user, such as the service role)
   * Every period also carries `staff_is_primary`: whether this person is the slot's
   * main teacher (primary_staff_id).
   *
   * Updated: 2026-10-08 - the body moved unchanged to
   * ./faculty-schedule-resolver.ts (resolveFacultyTodayPeriods), which takes the
   * client as a parameter; the nightly job calls it there directly.
   */
  static async getFacultyTodayPeriods(
    staffId: string,
    date?: string,
    options?: { client?: any; includeInactive?: boolean; teachingInstitutionIds?: string[] }
  ): Promise<{
    periods: AttendancePeriodOption[];
    searchContext: any;
  }> {
    return resolver.resolveFacultyTodayPeriods(options?.client ?? this.supabase, staffId, date, options);
  }

  /**
   * Get all periods for a faculty member in the current academic year
   */
  static async getFacultyAllPeriods(staffId: string): Promise<{
    periodsByDay: Record<string, AttendancePeriodOption[]>;
    searchContext: any;
  }> {
    try {
      // Get staff details
      const { data: staffData, error: staffError } = (await this.supabase
        .from('staff')
        .select(
          `
          id,
          first_name,
          last_name,
          email,
          institution_id,
          department_id
        `
        )
        .eq('id', staffId)
        .single()) as { data: StaffBasic | null; error: any };

      if (staffError || !staffData) {
        return { periodsByDay: {}, searchContext: {} };
      }

      // Updated: 2026-03-10 - Pick the academic year that contains today's date
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: academicYears } = (await this.supabase
        .from('academic_years')
        .select('id')
        .eq('institution_id', staffData.institution_id)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today)
        .limit(1)) as { data: AcademicYearBasic[] | null; error: any };

      // Fallback: if no academic year contains today, use the most recent active one
      let academicYear: AcademicYearBasic;
      if (!academicYears || academicYears.length === 0) {
        const { data: fallbackYears } = (await this.supabase
          .from('academic_years')
          .select('id')
          .eq('institution_id', staffData.institution_id)
          .eq('is_active', true)
          .order('start_date', { ascending: false })
          .limit(1)) as { data: AcademicYearBasic[] | null; error: any };

        if (!fallbackYears || fallbackYears.length === 0) {
          return { periodsByDay: {}, searchContext: {} };
        }
        academicYear = fallbackYears[0];
      } else {
        academicYear = academicYears[0];
      }

      // Fetch all timetables for this staff
      const { data: timetables } = (await this.supabase
        .from('timetables')
        .select(
          `
          id,
          periods,
          timetable_data,
          section_id,
          semester_id,
          sections(id, section_name),
          semesters(id, semester_name),
          department_id,
          program_id,
          degree_id,
          departments(department_name),
          programs(program_name),
          degrees(degree_name)
`
        )
        .eq('institution_id', staffData.institution_id)
        .eq('academic_year_id', academicYear.id)
        .eq('is_active', true)) as { data: TimetableWithRelations[] | null; error: any };

      const periodsByDay: Record<string, AttendancePeriodOption[]> = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: []
      };

      // Create a map to cache course details
      const courseDetailsMap = new Map<
        string,
        { course_code: string; course_name: string }
      >();

      // Fixed: 2026-08-19 - Authoritative period timings, overlaid onto the snapshot.
      const periodMaster = await this.fetchPeriodMasterMap([
        staffData.institution_id
      ]);

      if (timetables) {
        for (const timetable of timetables) {
          const timetableData = timetable.timetable_data as TimetableDataStructure | null;
          const periodsRaw = timetable.periods as any;

          // Helper: resolve period definition from either array or object format.
          // Array entries carry the identifier as `id` OR `period_id` (AHS
          // timetables use `period_id` only) — match both.
          // Updated: 2026-08-19 - Result is overlaid with the period master.
          const findPeriodDef = (pId: string): any => {
            if (!periodsRaw) return null;
            if (Array.isArray(periodsRaw)) {
              return this.mergePeriodMaster(
                periodsRaw.find(
                  (p: any) => p.id === pId || p.period_id === pId
                ),
                periodMaster
              );
            }
            if (typeof periodsRaw === 'object' && periodsRaw[pId]) {
              return this.mergePeriodMaster(
                { id: pId, ...periodsRaw[pId] },
                periodMaster
              );
            }
            return null;
          };

          if (!timetableData) continue;

          for (const day of Object.keys(periodsByDay)) {
            const dayKey = day.toUpperCase();
            if (timetableData[dayKey]) {
              for (const [periodId, slotData] of Object.entries(
                timetableData[dayKey]
              )) {
                const slot = slotData as any;

                // Check if this slot is assigned to the current staff
                const isAssignedToStaff =
                  slot.primary_staff_id === staffId ||
                  (Array.isArray(slot.staff_ids) &&
                    slot.staff_ids.includes(staffId));

                if (isAssignedToStaff) {
                  // Find period definition (handles both array and object format)
                  const periodDef = findPeriodDef(periodId);
                  // Skip break periods - they are not markable (slot flag included, BUG-005817)
                  if (isNonMarkableSlot(slot, periodDef)) continue;

                  const timetableSlotId =
                    slot.slot_id || `${timetable.id}_${day}_${periodId}`;

                  // Fetch course details if we have a course_id
                  let courseDetails = { course_code: '', course_name: '' };
                  if (slot.course_id) {
                    // Check cache first
                    if (courseDetailsMap.has(slot.course_id)) {
                      courseDetails = courseDetailsMap.get(slot.course_id)!;
                    } else {
                      // Fetch from database
                      try {
                        const { data: courseData, error: courseError } =
                          (await this.supabase
                            .from('courses')
                            .select('course_code, course_name')
                            .eq('id', slot.course_id)
                            .single()) as { data: { course_code: string; course_name: string } | null; error: any };

                        if (!courseError && courseData) {
                          courseDetails = {
                            course_code: courseData.course_code,
                            course_name: courseData.course_name
                          };
                          courseDetailsMap.set(slot.course_id, courseDetails);
                        }
                      } catch (error) {
                        logger.error('academic/faculty-attendance', 'Error fetching course details', error);
                      }
                    }
                  }

                  periodsByDay[day].push({
                    id: timetableSlotId,
                    timetable_slot_id: timetableSlotId,
                    timetable_id: timetable.id,
                    institution_id: staffData.institution_id,
                    period_name: periodDef?.period_name || `Period ${periodId}`,
                    start_time: this.formatTo12Hour(
                      periodDef?.start_time || ''
                    ),
                    end_time: this.formatTo12Hour(periodDef?.end_time || ''),
                    period_type: 'regular',
                    course: slot.course_id
                      ? {
                          id: slot.course_id,
                          course_code: courseDetails.course_code,
                          course_name: courseDetails.course_name
                        }
                      : undefined,
                    sections: [
                      {
                        id: timetable.section_id || '',
                        name: (timetable.sections as any)?.section_name || ''
                      }
                    ],
                    section_ids: slot.section_ids || (timetable.section_id ? [timetable.section_id] : []),
                    degree_name: (timetable.degrees as any)?.degree_name,
                    program_name: (timetable.programs as any)?.program_name,
                    department_name: (timetable.departments as any)?.department_name,
                    semester_name: (timetable.semesters as any)?.semester_name || '',
                    section_name: (timetable.sections as any)?.section_name || ''
                  });
                }
              }
            }
          }
        }
      }

      // Sort periods by time for each day
      Object.keys(periodsByDay).forEach((day) => {
        periodsByDay[day].sort((a, b) => {
          const timeA = this.parseTime(a.start_time);
          const timeB = this.parseTime(b.start_time);
          return timeA - timeB;
        });
      });

      // Resolve semester names to UUIDs for searchContext
      const allSemesterNames = new Set<string>();
      Object.values(periodsByDay).forEach((periods) => {
        periods.forEach((period) => {
          const semesterName = period.semester_name;
          if (semesterName) {
            allSemesterNames.add(semesterName);
          }
        });
      });

      // If we have semester names, resolve the first one to UUID for searchContext
      let semesterId = null;
      if (allSemesterNames.size > 0) {
        const firstSemesterName = Array.from(allSemesterNames)[0];
        try {
          const { data: semesterData, error: semesterError } =
            (await this.supabase
              .from('semesters')
              .select('id')
              .eq('institution_id', staffData.institution_id)
              .eq('semester_name', firstSemesterName)
              .eq('is_active', true)
              .single()) as { data: { id: string } | null; error: any };

          if (!semesterError && semesterData) {
            semesterId = semesterData.id;
          }
        } catch (error) {
          logger.error('academic/faculty-attendance', 'Error resolving semester name to ID for searchContext', error);
        }
      }

      return {
        periodsByDay,
        searchContext: {
          institution_id: staffData.institution_id,
          academic_year_id: academicYear.id,
          semester_id: semesterId // Include resolved semester UUID
        }
      };
    } catch (error) {
      logger.error('academic/faculty-attendance', 'Error fetching all faculty periods', error);
      return { periodsByDay: {}, searchContext: {} };
    }
  }

  /**
   * One learner's attendance history for the section currently being marked.
   *
   * Updated: 2026-09-07 - The marking screen could show today's roster and
   * nothing else, so the Senior Learner marking the register had no way to see
   * which days a learner actually came.
   *
   * Returns the raw per-period rows from fn_learner_attendance_history. The
   * day-level rollup and the percentage are deliberately NOT done here — they
   * live in lib/utils/academic/learner-attendance-history.ts, under unit test,
   * because "which days count toward this percentage" is the part that must not
   * drift.
   *
   * `error` is surfaced, never swallowed. Returning `data || []` on a failed
   * read is how this repo has repeatedly turned an RLS denial or a network
   * error into a dialog that says "no attendance recorded" — which reads as a
   * fact about the learner rather than a failure of the read.
   */
  static async getLearnerAttendanceHistory(params: {
    learnerId: string;
    sectionId: string;
    /** yyyy-MM-dd, inclusive. */
    fromDate: string;
    /** yyyy-MM-dd, inclusive. */
    toDate: string;
  }): Promise<{
    rows: LearnerAttendanceHistoryRow[];
    error: string | null;
  }> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_learner_attendance_history',
      {
        p_learner_id: params.learnerId,
        p_section_id: params.sectionId,
        p_from: params.fromDate,
        p_to: params.toDate
      }
    );

    if (error) {
      logger.error(
        'academic/faculty-attendance',
        'fn_learner_attendance_history failed',
        error
      );
      return {
        rows: [],
        error:
          error.message ||
          'Attendance history could not be read. Please try again.'
      };
    }

    return { rows: (data ?? []) as LearnerAttendanceHistoryRow[], error: null };
  }

  private static parseTime(timeString: string): number {
    return resolver.parseTime(timeString);
  }
}
