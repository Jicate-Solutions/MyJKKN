import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cache } from 'react';
import { logger } from '@/lib/utils/enhanced-logger';
import type { TimetableData } from '@/types/academics';
import type {
  AttendanceStats,
  PendingAttendancePeriod,
  PendingAttendanceResponse,
  DashboardFilters,
  AttendanceTrendData
} from '@/types/attendance-dashboard';
import { getPolicyString, getPolicyInt } from '@/lib/policies/get-policy-client';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Post-class-feedback attendance-confirmation split for the admin dashboard.
 * VISIBILITY-ONLY: derived from student_attendance + session_feedback via the
 * fn_scf_confirmation_rollup RPC. Does NOT affect the official attendance %.
 * When gate_mode = 'off' the split is not computed and `split` is null.
 */
export type SessionFeedbackGateMode = 'off' | 'visibility' | 'hard';

export interface ConfirmationSplit {
  totalPresent: number;
  confirmed: number;
  pendingWithin: number;
  pendingOverdue: number;
}

export interface ConfirmationSplitResult {
  gateMode: SessionFeedbackGateMode;
  windowHours: number;
  split: ConfirmationSplit | null;
  /** Set when the rollup RPC errored — lets the UI distinguish failure from empty. */
  error?: string;
}

export class AttendanceDashboardService {
  private static supabase = createClientSupabaseClient();

  /**
   * Confirmation split for the selected date + institution scope.
   * Reads session_feedback.gate_mode: when 'off', returns early without hitting
   * the RPC. Otherwise reads window_hours and calls fn_scf_confirmation_rollup
   * (SECURITY DEFINER; enforces the same institution scope as the dashboard RLS).
   */
  static async getConfirmationSplit(
    fromDate: string,
    toDate: string,
    institutionId?: string
  ): Promise<ConfirmationSplitResult> {
    // A failed policy read must not surface an error card for a feature that may
    // well be 'off'. getPolicy* already fail-soft on the RPC's error field, but a
    // thrown/rejected fetch would otherwise propagate to the query and render the
    // error card — so treat any policy-read failure as 'off' (feature hidden).
    let gateMode: SessionFeedbackGateMode = 'off';
    let windowHours = 48;
    try {
      gateMode = (await getPolicyString(
        POLICY_KEYS.SESSION_FEEDBACK_GATE_MODE,
        'off'
      )) as SessionFeedbackGateMode;
      windowHours = await getPolicyInt(
        POLICY_KEYS.SESSION_FEEDBACK_WINDOW_HOURS,
        48
      );
    } catch (e) {
      logger.warn(
        'academic/attendance-dashboard',
        'session_feedback policy read failed; treating gate as off',
        e
      );
      return { gateMode: 'off', windowHours, split: null };
    }

    if (gateMode === 'off') {
      return { gateMode, windowHours, split: null };
    }

    // Institution + date scoped, matching the sibling attendance stat cards.
    // The RPC also accepts p_program_id/p_department_id/p_section_id, but the
    // attendance dashboard's Statistics section (DashboardFilterState) exposes
    // no program/department/section filter — only institution + academic year —
    // so there is nothing narrower to forward here. academic_year is redundant
    // for a single date (a day maps to one academic year), so it is not passed.
    // If a finer dashboard filter is added later, thread it through to these
    // already-present RPC params.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'fn_scf_confirmation_rollup',
      {
        p_from: fromDate,
        p_to: toDate,
        p_institution_id: institutionId ?? null,
        p_window_hours: windowHours
      }
    );

    if (error) {
      logger.error(
        'academic/attendance-dashboard',
        'fn_scf_confirmation_rollup failed',
        error
      );
      return { gateMode, windowHours, split: null, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const split: ConfirmationSplit = {
      totalPresent: Number(row?.total_present ?? 0),
      confirmed: Number(row?.confirmed ?? 0),
      pendingWithin: Number(row?.pending_within ?? 0),
      pendingOverdue: Number(row?.pending_overdue ?? 0)
    };

    return { gateMode, windowHours, split };
  }

  /**
   * Today's attendance statistics as an
   * institution -> department -> semester -> section hierarchy.
   *
   * Aggregated by fn_attendance_dashboard_section_stats, NOT in the browser.
   * This previously paged EVERY active learner (4,179 rows) with four embedded
   * joins across five SEQUENTIAL round trips and grouped them in JavaScript --
   * so every learner row was evaluated against five tables' RLS policies -- just
   * to derive 233 section rows. The RPC returns those 233 rows in one call
   * (~2.0s -> ~0.23s measured).
   *
   * The RPC is SECURITY DEFINER and self-authorizes on
   * academic.attendance.dashboard.view, then bounds rows by
   * role_has_institution_access -- so a scope='own' caller reads only its own
   * institution even if it passes another institution's id.
   */
  static getTodayAttendanceStats = cache(
    async (
      userInstitutionId?: string,
      canViewAllInstitutions: boolean = false,
      dateString?: string,
      academicYearId?: string
    ): Promise<AttendanceStats[]> => {
      try {
        const today = dateString || new Date().toISOString().split('T')[0];

        if (!userInstitutionId && !canViewAllInstitutions) {
          logger.warn(
            'academic/attendance-dashboard',
            'No institution ID provided and user cannot view all institutions'
          );
          return [];
        }

        const { data, error } = await this.supabase.rpc(
          'fn_attendance_dashboard_section_stats',
          {
            p_date: today,
            // `?? null`, never `|| null`: '' would flow through as a real uuid
            // parameter and match zero rows (breaking "All Institutions").
            p_institution_id: userInstitutionId ?? null,
            p_academic_year_id: academicYearId ?? null
          }
        );

        if (error) {
          logger.error(
            'academic/attendance-dashboard',
            'fn_attendance_dashboard_section_stats failed',
            error
          );
          throw error;
        }

        return this.buildStatsHierarchy(data ?? []);
      } catch (error) {
        logger.error(
          'academic/attendance-dashboard',
          'Error in getTodayAttendanceStats',
          error
        );
        throw error;
      }
    }
  );

  /**
   * Nest the RPC's flat section rows into the AttendanceStats tree.
   *
   * present/absent roll UP from the sections, so a parent is always exactly the
   * sum of its children and can never disagree with the rows beneath it. The
   * section numbers themselves are already period-averaged and learner-attributed
   * by the RPC.
   */
  private static buildStatsHierarchy(rows: any[]): AttendanceStats[] {
    const institutions = new Map<string, any>();

    rows.forEach((row) => {
      let institution = institutions.get(row.institution_id);
      if (!institution) {
        institution = {
          institution_id: row.institution_id,
          institution_name: row.institution_name,
          total_students: 0,
          total_present: 0,
          total_absent: 0,
          attendance_percentage: 0,
          departments: new Map()
        };
        institutions.set(row.institution_id, institution);
      }

      let department = institution.departments.get(row.department_id);
      if (!department) {
        department = {
          department_id: row.department_id,
          department_name: row.department_name,
          total_students: 0,
          total_present: 0,
          total_absent: 0,
          attendance_percentage: 0,
          semesters: new Map()
        };
        institution.departments.set(row.department_id, department);
      }

      let semester = department.semesters.get(row.semester_id);
      if (!semester) {
        semester = {
          semester_id: row.semester_id,
          semester_name: row.semester_name,
          total_students: 0,
          total_present: 0,
          total_absent: 0,
          attendance_percentage: 0,
          sections: []
        };
        department.semesters.set(row.semester_id, semester);
      }

      // Postgres bigint arrives as a string over PostgREST.
      const totalStudents = Number(row.total_students) || 0;
      const present = Number(row.present) || 0;
      const absent = Number(row.absent) || 0;

      semester.sections.push({
        section_id: row.section_id,
        section_name: row.section_name,
        total_students: totalStudents,
        present,
        absent,
        percentage:
          totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0
      });

      semester.total_students += totalStudents;
      semester.total_present += present;
      semester.total_absent += absent;

      department.total_students += totalStudents;
      department.total_present += present;
      department.total_absent += absent;

      institution.total_students += totalStudents;
      institution.total_present += present;
      institution.total_absent += absent;
    });

    const pct = (present: number, total: number) =>
      total > 0 ? Math.round((present / total) * 100) : 0;

    return Array.from(institutions.values()).map((institution) => ({
      ...institution,
      attendance_percentage: pct(
        institution.total_present,
        institution.total_students
      ),
      departments: Array.from(institution.departments.values()).map(
        (department: any) => ({
          ...department,
          attendance_percentage: pct(
            department.total_present,
            department.total_students
          ),
          semesters: Array.from(department.semesters.values()).map(
            (semester: any) => ({
              ...semester,
              attendance_percentage: pct(
                semester.total_present,
                semester.total_students
              )
            })
          )
        })
      )
    }));
  }

  /**
   * Get pending attendance periods with enhanced filtering and date range support
   * Returns periods that should have been marked but haven't been
   */
  static async getTodayPendingAttendance(
    filters: DashboardFilters = {}
  ): Promise<PendingAttendanceResponse> {
    try {
      const {
        userInstitutionId,
        page = 1,
        limit = 10,
        sortBy = 'attendance_date',
        sortDirection = 'desc',
        search = '',
        startDate,
        endDate,
        institutionId,
        academicYearId,
        degreeId,
        departmentId,
        programId,
        semesterId,
        sectionId,
        staffId
      } = filters;

      // Determine date range
      const today = new Date().toISOString().split('T')[0];
      const queryStartDate = startDate || today;
      const queryEndDate = endDate || today;

      // Generate date range
      const dates = [];
      const start = new Date(queryStartDate);
      const end = new Date(queryEndDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }

      // Exclude weekends from the date range
      const workingDates = dates.filter(date => {
        const day = new Date(date + 'T00:00:00').getDay()
        return day !== 0 && day !== 6
      })

      const offset = (page - 1) * limit;

      // Step 1: Build comprehensive timetable query with all hierarchy joins
      let timetableQuery = this.supabase
        .from('timetables')
        .select(
          `
          id,
          timetable_name,
          institution_id,
          academic_year_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          timetable_data,
          periods,
          attendance_mode,
          class_incharge_id,
          start_date,
          end_date,
          institution:institutions(id, name),
          academic_year:academic_years(id, academic_year_name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semesters(id, semester_name),
          sections(id, section_name)
        `
        )
        .eq('is_active', true);

      // Apply hierarchy filters
      const effectiveInstitutionId = institutionId || userInstitutionId;
      if (effectiveInstitutionId) {
        timetableQuery = timetableQuery.eq(
          'institution_id',
          effectiveInstitutionId
        );
      }

      // Exclude institution-specific off days (e.g. public holidays, declared closures)
      let filteredWorkingDates = workingDates
      if (effectiveInstitutionId) {
        const { data: offDays } = await (this.supabase as any)
          .from('institution_off_days')
          .select('off_date')
          .eq('institution_id', effectiveInstitutionId)
          .gte('off_date', queryStartDate)
          .lte('off_date', queryEndDate)
        const offDaySet = new Set(offDays?.map((d: any) => d.off_date) ?? [])
        filteredWorkingDates = workingDates.filter(d => !offDaySet.has(d))
      }
      if (academicYearId) {
        timetableQuery = timetableQuery.eq('academic_year_id', academicYearId);
      }
      if (degreeId) {
        timetableQuery = timetableQuery.eq('degree_id', degreeId);
      }
      if (departmentId) {
        timetableQuery = timetableQuery.eq('department_id', departmentId);
      }
      if (programId) {
        timetableQuery = timetableQuery.eq('program_id', programId);
      }
      if (semesterId) {
        timetableQuery = timetableQuery.eq('semester_id', semesterId);
      }
      if (sectionId) {
        timetableQuery = timetableQuery.eq('section_id', sectionId);
      }

      // Apply date range filtering for timetable validity - remove for now to get all timetables
      // TODO: Add proper date filtering logic later if needed
      // For now, let's get all active timetables and filter in code

      const { data: timetables, error: timetableError } = await timetableQuery;

      if (timetableError) {
        logger.error('academic/attendance-dashboard', 'Error fetching timetables', timetableError);
        throw timetableError;
      }

      // Type cast to fix TypeScript inference after React 19 upgrade
      const timetablesData = timetables as { id: string; timetable_data: any }[] | null;

      // Apply timetable ID filter if specified (spec Change 3)
      const filteredTimetablesData = filters.timetableId
        ? timetablesData?.filter(t => t.id === filters.timetableId) ?? null
        : timetablesData;

      // Step 2: Get courses and staff data for enrichment
      const courseIds = new Set<string>();
      const staffIds = new Set<string>();

      filteredTimetablesData?.forEach((timetable) => {
        const timetableData = timetable.timetable_data as TimetableData | null;
        if (timetableData) {
          Object.values(timetableData).forEach((daySlots) => {
            if (daySlots && typeof daySlots === 'object') {
              Object.values(daySlots).forEach((slot: any) => {
                if (slot?.course_id) courseIds.add(slot.course_id);
                if (slot?.staff_ids && Array.isArray(slot.staff_ids)) {
                  slot.staff_ids.forEach((id: string) => staffIds.add(id));
                }
                if (slot?.primary_staff_id) staffIds.add(slot.primary_staff_id);
              });
            }
          });
        }
      });

      // Fetch course and staff lookup data
      const [coursesData, staffData] = await Promise.all([
        courseIds.size > 0
          ? this.supabase
              .from('courses')
              .select('id, course_name, course_code')
              .in('id', Array.from(courseIds))
          : { data: [] },
        staffIds.size > 0
          ? this.supabase
              .from('staff')
              .select('id, first_name, last_name, email, institution_email')
              .in('id', Array.from(staffIds))
          : { data: [] }
      ]);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const coursesResult = (coursesData as any).data || [];
      const staffResult = (staffData as any).data || [];

      // Create lookup maps
      const courseLookup = (coursesResult as any[]).reduce((acc, course) => {
        acc[course.id] = course;
        return acc;
      }, {} as Record<string, any>);

      const staffLookup = (staffResult as any[]).reduce((acc, staff) => {
        acc[staff.id] = staff;
        return acc;
      }, {} as Record<string, any>);

      // Step 3: Extract scheduled periods for each date in range
      const allScheduledPeriods = new Map<string, PendingAttendancePeriod>();

      filteredWorkingDates.forEach((date) => {
        const dateObj = new Date(date);
        const dayOfWeek = dateObj
          .toLocaleDateString('en-US', { weekday: 'long' })
          .toUpperCase();

        filteredTimetablesData?.forEach((timetable: any) => {
          // Check if timetable is valid for the current date
          const isValidForDate =
            (!timetable.start_date || timetable.start_date <= date) &&
            (!timetable.end_date || timetable.end_date >= date);

          if (!isValidForDate) {
            return; // Skip this timetable for this date
          }

          const timetableData = timetable.timetable_data as TimetableData | null;
          const periods = timetable.periods as any;

          // Updated: 2026-06-10 - Day-wise (session_wise) classes are NOT
          // period-based. Generate two session entries (FN/AN) per working day
          // and skip the period loop entirely; their marked status comes from
          // daily_session_attendance (folded into markedPeriods below).
          if (timetable.attendance_mode === 'session_wise') {
            if (!timetable.section_id) return; // need a section to track sessions
            // Keys 'FN'/'AN' match the attendance_data session keys that the
            // generic marked-attendance builder below reads from student_attendance.
            (['FN', 'AN'] as const).forEach((sess) => {
              const periodKey = `${date}_${timetable.id}_${sess}`;
              allScheduledPeriods.set(periodKey, {
                attendance_date: date,
                period_name:
                  sess === 'FN' ? 'Morning Session' : 'Afternoon Session',
                period_id: sess,
                start_time: '',
                end_time: '',
                course_id: '',
                course_name: 'Day Attendance',
                course_code: undefined,
                institution_id: timetable.institution_id,
                institution_name:
                  (timetable.institution as any)?.name || 'Unknown Institution',
                degree_id: timetable.degree_id,
                degree_name: (timetable.degree as any)?.degree_name || '',
                department_id: timetable.department_id,
                department_name:
                  (timetable.department as any)?.department_name || '',
                program_id: timetable.program_id,
                program_name: (timetable.program as any)?.program_name || '',
                semester_id: timetable.semester_id,
                semester_name: (timetable.semesters as any)?.semester_name || '',
                section_id: timetable.section_id,
                section_name:
                  (timetable.sections as any)?.section_name || 'Unknown Section',
                academic_year_id: timetable.academic_year_id,
                academic_year_name:
                  (timetable.academic_year as any)?.academic_year_name || '',
                assigned_staff: [],
                primary_staff_name: 'Class Incharge',
                timetable_id: timetable.id,
                timetable_name: timetable.timetable_name
              } as PendingAttendancePeriod);
            });
            return;
          }

          if (timetableData && timetableData[dayOfWeek]) {
            Object.entries(timetableData[dayOfWeek]).forEach(
              ([periodId, slot]) => {
                if (slot && !slot.is_break_slot && slot.course_id) {
                  const periodInfo = Array.isArray(periods)
                    ? periods.find((p: any) => p.period_id === periodId)
                    : null;

                  if (periodInfo && !periodInfo.is_break) {
                    const course = courseLookup[slot.course_id];
                    const primaryStaff = staffLookup[slot.primary_staff_id];
                    const assignedStaff = (slot.staff_ids || [])
                      .map((staffId: string) => {
                        const staff = staffLookup[staffId];
                        return staff
                          ? {
                              staff_id: staff.id,
                              staff_name: `${staff.first_name} ${staff.last_name}`,
                              staff_email:
                                staff.email || staff.institution_email,
                              is_primary: staffId === slot.primary_staff_id
                            }
                          : null;
                      })
                      .filter(Boolean);

                    // IMPORTANT: The period key should use the slot_id if available,
                    // because attendance is stored using slot_id, not period_id
                    const actualPeriodId = slot.slot_id || periodId;
                    const periodKey = `${date}_${timetable.id}_${actualPeriodId}`;

                    // Apply staff filter if provided
                    if (
                      staffId &&
                      !assignedStaff.some((s: any) => s.staff_id === staffId)
                    ) {
                      return;
                    }

                    const pendingPeriod: PendingAttendancePeriod = {
                      // Date and period info
                      attendance_date: date,
                      period_name: periodInfo.period_name,
                      period_id: actualPeriodId, // Use the actual period ID that matches attendance storage
                      start_time: periodInfo.start_time,
                      end_time: periodInfo.end_time,

                      // Course info
                      course_id: slot.course_id || '',
                      course_name: course?.course_name || 'Unknown Course',
                      course_code: course?.course_code,

                      // Institution hierarchy
                      institution_id: timetable.institution_id,
                      institution_name:
                        (timetable.institution as any)?.name ||
                        'Unknown Institution',
                      degree_id: timetable.degree_id,
                      degree_name:
                        (timetable.degree as any)?.degree_name ||
                        'Unknown Degree',
                      department_id: timetable.department_id,
                      department_name:
                        (timetable.department as any)?.department_name ||
                        'Unknown Department',
                      program_id: timetable.program_id,
                      program_name:
                        (timetable.program as any)?.program_name ||
                        'Unknown Program',
                      semester_id: timetable.semester_id,
                      semester_name:
                        (timetable.semesters as any)?.semester_name ||
                        'Unknown Semester',
                      section_id: timetable.section_id,
                      section_name:
                        (timetable.sections as any)?.section_name ||
                        'Unknown Section',

                      // Academic year
                      academic_year_id: timetable.academic_year_id,
                      academic_year_name:
                        (timetable.academic_year as any)?.academic_year_name ||
                        'Unknown Academic Year',

                      // Staff details
                      assigned_staff: assignedStaff,
                      primary_staff_name: primaryStaff
                        ? `${primaryStaff.first_name} ${primaryStaff.last_name}`
                        : 'Unknown Staff',

                      // Timetable reference
                      timetable_id: timetable.id,
                      timetable_name: timetable.timetable_name
                    };

                    allScheduledPeriods.set(periodKey, pendingPeriod);
                  }
                }
              }
            );
          }
        });
      });

      // Step 4: Find marked attendance for the date range
      // Force fresh data by adding a timestamp to avoid caching issues
      let attendanceQuery = this.supabase
        .from('student_attendance')
        .select('attendance_date, timetable_id, attendance_data, updated_at')
        .in('attendance_date', dates)
        .order('updated_at', { ascending: false }); // Get most recent updates first

      if (effectiveInstitutionId) {
        attendanceQuery = attendanceQuery.eq(
          'institution_id',
          effectiveInstitutionId
        );
      }

      const { data: markedAttendance, error: attendanceError } =
        await attendanceQuery;

      if (attendanceError) {
        logger.error('academic/attendance-dashboard', 'Error fetching marked attendance', attendanceError);
        throw attendanceError;
      }

      // Type cast to fix TypeScript inference after React 19 upgrade
      const markedAttendanceData = markedAttendance as { attendance_date: string; timetable_id: string; attendance_data: any; updated_at: string }[] | null;

      // Create set of marked periods with enhanced validation
      const markedPeriods = new Set<string>();
      const markedPeriodsDetails = new Map<string, any>(); // For debugging

      markedAttendanceData?.forEach((record) => {
        const attendanceData = record.attendance_data as any;
        if (attendanceData && typeof attendanceData === 'object') {
          Object.keys(attendanceData).forEach((periodId) => {
            // Validate that the period actually has attendance data
            const periodData = attendanceData[periodId];
            if (
              periodData &&
              periodData.students &&
              Array.isArray(periodData.students) &&
              periodData.students.length > 0
            ) {
              const periodKey = `${record.attendance_date}_${record.timetable_id}_${periodId}`;
              markedPeriods.add(periodKey);
              markedPeriodsDetails.set(periodKey, {
                date: record.attendance_date,
                timetableId: record.timetable_id,
                periodId: periodId,
                studentsCount: periodData.students.length,
                updatedAt: record.updated_at
              });
            } else {
              logger.warn('academic/attendance-dashboard', 'Period exists but has no valid student data', { periodId, timetableId: record.timetable_id, attendanceDate: record.attendance_date });
            }
          });
        }
      });

      // Day-wise (session_wise) marks live in student_attendance keyed 'FN'/'AN'
      // and are already folded into markedPeriods by the generic builder above
      // (key `${date}_${timetable_id}_${FN|AN}`), so no extra query is needed.

      // Step 5: Find pending periods (scheduled but not marked)
      const pendingPeriods: PendingAttendancePeriod[] = [];
      const skippedMarkedCount = { count: 0 };
      const debugPendingPeriods: string[] = [];

      allScheduledPeriods.forEach((period, periodKey) => {
        const isMarked = markedPeriods.has(periodKey);

        if (isMarked) {
          skippedMarkedCount.count++;
        }

        if (!isMarked) {
          // Apply search filter
          if (search) {
            const searchLower = search.toLowerCase();
            const searchableText = [
              period.institution_name,
              period.degree_name,
              period.department_name,
              period.program_name,
              period.semester_name,
              period.section_name,
              period.period_name,
              period.course_name,
              period.primary_staff_name,
              period.attendance_date
            ]
              .join(' ')
              .toLowerCase();

            if (searchableText.includes(searchLower)) {
              pendingPeriods.push(period);
            }
          } else {
            pendingPeriods.push(period);
          }
        }
      });

      // Step 6: Apply sorting
      const sortedPeriods = pendingPeriods.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'attendance_date':
            comparison = a.attendance_date.localeCompare(b.attendance_date);
            break;
          case 'institution_name':
            comparison = a.institution_name.localeCompare(b.institution_name);
            break;
          case 'degree_name':
            comparison = a.degree_name.localeCompare(b.degree_name);
            break;
          case 'department_name':
            comparison = a.department_name.localeCompare(b.department_name);
            break;
          case 'program_name':
            comparison = a.program_name.localeCompare(b.program_name);
            break;
          case 'semester_name':
            comparison = a.semester_name.localeCompare(b.semester_name);
            break;
          case 'section_name':
            comparison = a.section_name.localeCompare(b.section_name);
            break;
          case 'course_name':
            comparison = a.course_name.localeCompare(b.course_name);
            break;
          case 'primary_staff_name':
            comparison = a.primary_staff_name.localeCompare(
              b.primary_staff_name
            );
            break;
          case 'start_time':
            comparison = a.start_time.localeCompare(b.start_time);
            break;
          default: // period_name
            comparison = a.period_name.localeCompare(b.period_name);
        }

        return sortDirection === 'desc' ? -comparison : comparison;
      });

      // Step 7: Apply pagination
      const totalCount = sortedPeriods.length;
      const paginatedPeriods = sortedPeriods.slice(offset, offset + limit);

      // Compute enriched metadata from the full (pre-paginated) result set
      const overdueCount = sortedPeriods.filter(p => p.attendance_date < today).length;
      const todayCount = sortedPeriods.filter(p => p.attendance_date === today).length;
      const sectionsCount = new Set(sortedPeriods.map(p => p.section_id)).size;
      const subjectsCount = new Set(sortedPeriods.map(p => p.course_id).filter(Boolean)).size;
      const staffCount = new Set(
        sortedPeriods.flatMap(p => p.assigned_staff.map(s => s.staff_id))
      ).size;

      return {
        data: paginatedPeriods,
        metadata: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          overdueCount,
          todayCount,
          sectionsCount,
          subjectsCount,
          staffCount
        }
      };
    } catch (error) {
      logger.error('academic/attendance-dashboard', 'Error in getTodayPendingAttendance', error);
      throw error;
    }
  }

  /**
   * Get all active institutions for super admin institution selector
   */
  static async getActiveInstitutions(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('academic/attendance-dashboard', 'Failed to fetch active institutions', error);
      return [];
    }
    return data ?? [];
  }

  /**
   * Get attendance summary for a date range
   * Useful for trend analysis
   */
  static async getAttendanceTrend(
    institutionId: string | null | undefined,
    days: number = 7
  ): Promise<AttendanceTrendData[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days + 1);

      const dates = [];
      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        dates.push(d.toISOString().split('T')[0]);
      }

      // All-colleges viewer (scope='all', no institution selected) passes null/undefined:
      // omit the .eq filter so every RLS-permitted institution's rows come back and the
      // per-day loop below sums them into a combined overall %. A concrete institutionId
      // still scopes to that one college. RLS keeps the no-filter branch scope-honest.
      let query = this.supabase
        .from('student_attendance')
        .select('attendance_date, attendance_data')
        .in('attendance_date', dates);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data: attendanceData, error } = await query.order('attendance_date');

      if (error) throw error;

      // Type cast to fix TypeScript inference after React 19 upgrade
      const attendanceRecords = attendanceData as { attendance_date: string; attendance_data: any }[] | null;

      // Calculate daily percentages
      const dailyStats = dates.map((date) => {
        const dayRecords =
          attendanceRecords?.filter((record) => record.attendance_date === date) ||
          [];

        let totalPresent = 0;
        let totalStudents = 0;

        dayRecords.forEach((record) => {
          const attendanceData = record.attendance_data as any;
          if (attendanceData && typeof attendanceData === 'object') {
            Object.values(attendanceData).forEach((periodData: any) => {
              if (
                periodData &&
                periodData.students &&
                Array.isArray(periodData.students)
              ) {
                periodData.students.forEach((student: any) => {
                  totalStudents++;
                  if (student.status === 'Present') {
                    totalPresent++;
                  }
                });
              }
            });
          }
        });

        const percentage =
          totalStudents > 0
            ? Math.round((totalPresent / totalStudents) * 100)
            : 0;

        return {
          date,
          percentage
        };
      });

      return dailyStats;
    } catch (error) {
      logger.error('academic/attendance-dashboard', 'Error in getAttendanceTrend', error);
      throw error;
    }
  }
}
