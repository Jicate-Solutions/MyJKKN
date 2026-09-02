import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  CycleCalculationService,
  type CycleDateMap
} from '@/lib/services/academic/cycle-calculation-service';
import { cache } from 'react';
import { logger } from '@/lib/utils/enhanced-logger';
import type { TimetableData } from '@/types/academics';
import type {
  AttendanceStats,
  PendingAttendancePeriod,
  PendingAttendanceResponse,
  DashboardFilters,
  AttendanceTrendData,
  IntakeReadinessRow,
  IntakeReadinessInstitutionSummary,
  ScheduledTimetable
} from '@/types/attendance-dashboard';
import { getPolicyString, getPolicyInt } from '@/lib/policies/get-policy-client';
import { POLICY_KEYS } from '@/lib/policies/keys';
import { selectInChunks } from '@/lib/utils/postgrest-in-chunks';

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

/**
 * Org-hierarchy narrowing from the Statistics tab's "Attendance Filters" bar,
 * below institution + academic year:
 *   Degree > Department > Programme > Semester > Section.
 *
 * Grouped into one object rather than five more positional parameters: the
 * callers below already take four, and five consecutive optional strings is
 * exactly how an argument-order slip turns into a silent wrong-scope result.
 */
export interface AttendanceHierarchyFilter {
  degreeId?: string;
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  /** Narrow to first-year learners only — those admitted in their institution's
   *  CURRENT intake (admission_years.is_current). Resolves per-institution, so it
   *  stays correct in the all-institutions view (each college's own newest batch).
   *  Chosen over a semester-based rule because semester data isn't reliably
   *  advanced (e.g. Dental showed 597/600 by semester vs ~56 by admission year). */
  firstYearOnly?: boolean;
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
    institutionId?: string,
    hierarchy: AttendanceHierarchyFilter = {}
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

    // Institution + date scoped, matching the sibling attendance stat cards, and
    // now narrowed by the dashboard's hierarchy filters through the RPC's
    // already-present p_program_id/p_department_id/p_section_id params.
    // academic_year is redundant for a single date (a day maps to one academic
    // year), so it is not passed.
    //
    // NOTE — this rollup has no p_degree_id/p_semester_id. A Degree- or
    // Semester-only selection therefore narrows the attendance stat cards above
    // but NOT this split, which stays at the next-widest scope it can express.
    // `?? null`, never `|| null`: '' would flow through as a real uuid and match
    // zero rows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any).rpc(
      'fn_scf_confirmation_rollup',
      {
        p_from: fromDate,
        p_to: toDate,
        p_institution_id: institutionId ?? null,
        p_program_id: hierarchy.programId ?? null,
        p_department_id: hierarchy.departmentId ?? null,
        p_section_id: hierarchy.sectionId ?? null,
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
      academicYearId?: string,
      hierarchy: AttendanceHierarchyFilter = {}
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
            p_academic_year_id: academicYearId ?? null,
            p_degree_id: hierarchy.degreeId ?? null,
            p_department_id: hierarchy.departmentId ?? null,
            p_program_id: hierarchy.programId ?? null,
            p_semester_id: hierarchy.semesterId ?? null,
            p_section_id: hierarchy.sectionId ?? null,
            // First-year-only narrowing (default false → unchanged for every
            // existing caller). The RPC resolves "first year" as admitted in the
            // institution's is_current admission year.
            p_first_year_only: hierarchy.firstYearOnly ?? false
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
   *
   * marked/unmarked roll up the same way. Every percentage on this screen is
   * present ÷ marked, NOT present ÷ total (Director decision 2026-08-11):
   * unmarked learners are a backlog to chase, not absentees. `unmarked` is
   * carried at every level precisely so no caller can render a percentage
   * without it — 1 present of 1 marked is "100%" only if you also say 92 were
   * never marked.
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
          total_active: 0,
          total_reserved: 0,
          total_admitted: 0,
          total_scheduled: 0,
          total_scheduled_marked: 0,
          has_scheduling: false,
          total_present: 0,
          total_absent: 0,
          total_marked: 0,
          total_unmarked: 0,
          attendance_percentage: 0,
          is_empty_view: false,
          departments: new Map()
        };
        institutions.set(row.institution_id, institution);
      }

      // Whether the RPC EMITS the scheduling columns at all — deliberately not
      // "is any learner scheduled". On a Sunday nothing is scheduled anywhere and
      // every counter is legitimately 0; testing the value would read that as "no
      // scheduling data" and fall back to counting the whole roster as pending,
      // which is precisely the misleading state this split exists to remove.
      //
      // Set BEFORE the is_empty_view return below: column presence is a property
      // of the function, not of the row, and an empty-view row carries it too.
      if (
        row.scheduled_students !== undefined &&
        row.scheduled_students !== null
      ) {
        institution.has_scheduling = true;
      }

      // A college that holds learners in this scope but none once the view's
      // narrowing is applied. The RPC emits it as an explicit zero row with no
      // department/semester/section, so that it is listed with a reason rather
      // than silently dropped (CLAUDE.md rule #27).
      if (row.is_empty_view) {
        institution.is_empty_view = true;
        return;
      }

      let department = institution.departments.get(row.department_id);
      if (!department) {
        department = {
          department_id: row.department_id,
          department_name: row.department_name,
          total_students: 0,
          total_scheduled: 0,
          total_scheduled_marked: 0,
          total_present: 0,
          total_absent: 0,
          total_marked: 0,
          total_unmarked: 0,
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
          total_scheduled: 0,
          total_scheduled_marked: 0,
          total_present: 0,
          total_absent: 0,
          total_marked: 0,
          total_unmarked: 0,
          attendance_percentage: 0,
          sections: []
        };
        department.semesters.set(row.semester_id, semester);
      }

      // Postgres bigint arrives as a string over PostgREST.
      const totalStudents = Number(row.total_students) || 0;
      const present = Number(row.present) || 0;
      const absent = Number(row.absent) || 0;

      // `marked` arrives from the RPC, but the migration that adds it is
      // Director-gated and may not be applied when this ships. Falling back to
      // present + absent keeps the screen correct against BOTH shapes: those
      // two columns already count only learners who have a status recorded, so
      // their sum IS the marked headcount the old function could express.
      // Without this, an unapplied migration would silently report every
      // college as "nobody marked yet".
      const rawMarked = row.marked;
      const markedReported =
        rawMarked === null || rawMarked === undefined
          ? present + absent
          : Number(rawMarked) || 0;
      // The RPC caps marked at the section headcount, so unmarked is never
      // negative — but clamp anyway rather than render a "-3 not yet marked".
      const marked = Math.min(markedReported, totalStudents);
      const unmarked = Math.max(totalStudents - marked, 0);

      // Timetable-driven split. Absent columns coerce to 0 / [], which the UI
      // reads as "no scheduling information" and falls back to the roster-only
      // presentation — same defensive shape as the `marked` fallback above, so
      // the screen stays correct against a database where the migration that
      // adds these has not landed.
      //
      // Clamped to the section headcount for the same reason `marked` is: the
      // RPC already caps them, but a stale row must never render "-3 pending".
      const scheduled = Math.min(
        Math.max(Number(row.scheduled_students) || 0, 0),
        totalStudents
      );
      const scheduledMarked = Math.min(
        Math.max(Number(row.scheduled_marked) || 0, 0),
        scheduled
      );
      const timetables: ScheduledTimetable[] = Array.isArray(
        row.scheduled_timetables
      )
        ? row.scheduled_timetables
        : [];

      semester.sections.push({
        section_id: row.section_id,
        section_name: row.section_name,
        total_students: totalStudents,
        scheduled,
        scheduled_marked: scheduledMarked,
        timetables,
        present,
        absent,
        marked,
        unmarked,
        percentage: marked > 0 ? Math.round((present / marked) * 100) : 0,
        // `section_id == null` is the same condition the RPC flags, and it is
        // readable from the old shape too — so learners with no section are
        // labelled "Not yet placed" whether or not the migration has landed.
        is_unplaced: row.is_unplaced === true || row.section_id == null
      });

      semester.total_students += totalStudents;
      semester.total_scheduled += scheduled;
      semester.total_scheduled_marked += scheduledMarked;
      semester.total_present += present;
      semester.total_absent += absent;
      semester.total_marked += marked;
      semester.total_unmarked += unmarked;

      department.total_students += totalStudents;
      department.total_scheduled += scheduled;
      department.total_scheduled_marked += scheduledMarked;
      department.total_present += present;
      department.total_absent += absent;
      department.total_marked += marked;
      department.total_unmarked += unmarked;

      // The lifecycle split behind `total_students`, so the card can say "498
      // active + 14 reserved" instead of an unexplained 512 that disagrees with
      // the Learner Profiles Active tab. Institution level only — that is the
      // only level the RPC emits it at, and the only level anything renders.
      //
      // Absent columns coerce to 0, which the UI reads as "no breakdown
      // available" and falls back to the static subtitle. That keeps the screen
      // correct against a database where this migration has not landed yet,
      // exactly as the `marked` fallback above does.
      institution.total_active += Number(row.active_students) || 0;
      institution.total_reserved += Number(row.reserved_students) || 0;
      institution.total_admitted += Number(row.admitted_students) || 0;

      institution.total_students += totalStudents;
      institution.total_scheduled += scheduled;
      institution.total_scheduled_marked += scheduledMarked;
      institution.total_present += present;
      institution.total_absent += absent;
      institution.total_marked += marked;
      institution.total_unmarked += unmarked;
    });

    // Denominator is learners ACTUALLY MARKED, not the headcount. A learner
    // nobody marked is unknown, not absent, so counting them against the rate
    // reports a marking backlog as poor attendance.
    const pct = (present: number, marked: number) =>
      marked > 0 ? Math.round((present / marked) * 100) : 0;

    return Array.from(institutions.values()).map((institution) => ({
      ...institution,
      attendance_percentage: pct(
        institution.total_present,
        institution.total_marked
      ),
      departments: Array.from(institution.departments.values()).map(
        (department: any) => ({
          ...department,
          attendance_percentage: pct(
            department.total_present,
            department.total_marked
          ),
          semesters: Array.from(department.semesters.values()).map(
            (semester: any) => ({
              ...semester,
              attendance_percentage: pct(
                semester.total_present,
                semester.total_marked
              )
            })
          )
        })
      )
    }));
  }

  /**
   * Does this timetable teach on this weekday?
   *
   * Added: 2026-08-11 - The pending list used to answer this with
   * `getDay() !== 0 && getDay() !== 6`, applied to the whole date range before
   * any timetable was read. Saturday is a normal teaching day here: measured on
   * production, 121 of 178 active non-template timetables list SATURDAY in
   * `selected_days` and NONE list SUNDAY. The badge behind the same screen
   * applies no weekend rule, so the two surfaces disagreed by every Saturday.
   *
   * The answer now comes from what the timetable itself schedules. Sunday is
   * excluded because nothing selects it, not because a day number is hardcoded.
   *
   * `selected_days` OR the timetable's own weekday keys — the union, never one
   * alone. `selected_days` is populated on all 198 active timetables but 3
   * weekday slots exist in `timetable_data` without a matching `selected_days`
   * entry, and `timetable_data` is what the period loop below actually reads, so
   * gating on `selected_days` alone would drop rows that are listed today.
   * Cycle-format timetables are exempt: their date→cycle map already returns
   * null for a non-teaching day, and it, not a weekday, is their authority.
   */
  private static timetableSchedulesWeekday(
    timetable: any,
    dayOfWeek: string
  ): boolean {
    // Cycle and batch timetables are not weekday-driven and must not be gated on
    // `selected_days`: a cycle's date→cycle map already returns null for a
    // non-teaching day, and a batch timetable's `timetable_data` is keyed by the
    // date itself, so an absent date simply yields no periods. Applying a weekday
    // rule on top could only ever remove a day the schedule does list.
    if (
      timetable?.timetable_format === 'cycle' ||
      timetable?.timetable_format === 'batch'
    )
      return true;

    const selectedDays = Array.isArray(timetable?.selected_days)
      ? timetable.selected_days
      : null;
    const inSelectedDays =
      selectedDays?.some(
        (d: unknown) =>
          typeof d === 'string' && d.trim().toUpperCase() === dayOfWeek
      ) ?? false;
    if (inSelectedDays) return true;

    const timetableData = timetable?.timetable_data;
    const hasDayKey =
      timetableData !== null &&
      typeof timetableData === 'object' &&
      Object.prototype.hasOwnProperty.call(timetableData, dayOfWeek);
    if (hasDayKey) return true;

    // Neither source says anything about weekdays at all. Do not silently drop
    // the timetable over a missing column (CLAUDE.md rule #27) -- let the day
    // through and let the period lookup below decide. Zero rows on production.
    return selectedDays !== null && selectedDays.length > 0 ? false : true;
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

      // Updated: 2026-08-11 - This used to drop `getDay() === 0 || === 6`, so
      // every Saturday was silently removed from the range while the RPC behind
      // the badge applied no such rule. Measured on production: 121 of 178 active
      // non-template timetables list SATURDAY in `selected_days` and 0 list
      // SUNDAY -- so a hardcoded weekend rule hid a normal teaching day for two
      // colleges out of three, and the list and the badge could not agree.
      //
      // The teaching-day set is now derived from what the in-scope timetables
      // actually schedule (see `teachingDayKeys` below, applied once the
      // timetables are known). Sunday drops out because no timetable selects it,
      // not because a day number is hardcoded here.
      const workingDates = dates;

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
          timetable_format,
          selected_days,
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

      // No start_date/end_date predicate here on purpose.
      //
      // A timetable qualifies by OVERLAP with the requested window, which the
      // per-date `isValidForDate` check in the day loop below already enforces.
      // Filtering the query by containment instead (start_date >= from AND
      // end_date <= to) was tried and reverted: every timetable at CAS (Aided)
      // runs to 31 Oct, so any window ending earlier matched zero of 26 and the
      // report went blank. A semester that ends in October still teaches in
      // August, and this report is about the sessions, not the timetable's life.
      //
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

      // Fetch course and staff lookup data — chunked: the all-institutions view
      // resolves ~750 course ids, past the ~680-id URL cliff the gateway rejects.
      // A failed chunk THROWS instead of silently rendering "Unknown Course".
      const [coursesResult, staffResult] = await Promise.all([
        selectInChunks(Array.from(courseIds), (chunk) =>
          this.supabase
            .from('courses')
            .select('id, course_name, course_code')
            .in('id', chunk)
        ),
        selectInChunks(Array.from(staffIds), (chunk) =>
          this.supabase
            .from('staff')
            .select('id, first_name, last_name, email, institution_email')
            .in('id', chunk)
        ),
      ]);

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

      // Added: 2026-08-05 - Cycle-format timetables key timetable_data by "cycle-N",
      // not by weekday, so the weekday key below never matched and their periods were
      // invisible to this surface entirely. Resolve each cycle timetable's date->cycle
      // map up front (one RPC per timetable for the whole range) via the same
      // CycleCalculationService the Mark Attendance page uses, so the two cannot drift.
      const cycleMaps: Record<string, CycleDateMap> = {};
      const cycleTimetables = (filteredTimetablesData ?? []).filter(
        (t: any) => t.timetable_format === 'cycle'
      );
      if (cycleTimetables.length > 0 && filteredWorkingDates.length > 0) {
        const rangeStart = filteredWorkingDates[0];
        const rangeEnd = filteredWorkingDates[filteredWorkingDates.length - 1];
        await Promise.all(
          cycleTimetables.map(async (t: any) => {
            cycleMaps[t.id] = await CycleCalculationService.getCycleMap(
              t.id,
              rangeStart,
              rangeEnd
            );
          })
        );
      }

      const allScheduledPeriods = new Map<string, PendingAttendancePeriod>();

      /**
       * How each scheduled session decides whether it was marked.
       *
       * A combined slot produces two sessions from ONE period key, so its map
       * key carries a `::n` suffix to keep them apart — but student_attendance
       * is keyed by the bare period, so the lookup has to use `base`. For a
       * combined session the course is what distinguishes Group A from Group B;
       * for every ordinary slot the period alone is enough, and it keeps the
       * exact behaviour it has always had.
       */
      const scheduledMarkKeys = new Map<
        string,
        { base: string; course: string | null; combined: boolean }
      >();

      /**
       * Split a timetable slot into the sessions that actually need marking.
       *
       * A "combined" slot teaches two cohorts in the same period — different
       * course, different member of staff — and carries them in `sub_slots`
       * while its own `course_id` is null. The caller's guard requires a
       * course_id, so such a slot was skipped entirely and BOTH groups vanished
       * from the pending list. Measured: 6 slots across 3 timetables losing 12
       * group-sessions outright, plus 2 more where only the extra sub-slot was
       * lost — each repeating every cycle.
       */
      const expandSlotVariants = (
        slot: any
      ): Array<{ slot: any; suffix: string | null; combined: boolean }> => {
        const subs = Array.isArray(slot?.sub_slots) ? slot.sub_slots : [];
        if (subs.length === 0) {
          return [{ slot, suffix: null, combined: false }];
        }
        // Merge each sub-slot over its parent so the shared fields (slot_id,
        // period_mode, section_ids) survive while course and staff come from
        // the group.
        return subs.map((sub: any, i: number) => ({
          slot: {
            ...slot,
            course_id: sub?.course_id ?? slot?.course_id ?? null,
            staff_ids: Array.isArray(sub?.staff_ids) && sub.staff_ids.length
              ? sub.staff_ids
              : slot?.staff_ids || [],
            primary_staff_id:
              sub?.primary_staff_id ??
              (Array.isArray(sub?.staff_ids) ? sub.staff_ids[0] : undefined) ??
              slot?.primary_staff_id,
            section_ids: sub?.section_ids ?? slot?.section_ids,
            is_break_slot: sub?.is_break_slot ?? slot?.is_break_slot
          },
          suffix: String(sub?.sub_slot_order ?? i + 1),
          combined: true
        }));
      };

      filteredWorkingDates.forEach((date) => {
        // Updated: 2026-08-05 - Parse as local midnight, matching the sibling at
        // line 382. `new Date("YYYY-MM-DD")` is UTC midnight, so at a negative UTC
        // offset the weekday resolves one day early and the timetable_data day key
        // never matches. No-op in IST; hygiene only.
        const dateObj = new Date(date + 'T00:00:00');
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

          // Updated: 2026-08-11 - Replaces the hardcoded `getDay() !== 0 && !== 6`
          // that used to drop every Saturday from the range before this loop ran.
          if (!this.timetableSchedulesWeekday(timetable, dayOfWeek)) {
            return; // this timetable does not teach on this weekday
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

          // Updated: 2026-08-05 - Format-aware key: cycle timetables are keyed
          // "cycle-N" (see the cycleMaps note above), everything else by weekday.
          // A null cycle means that date has no classes (Sunday/holiday).
          const cycleNum =
            timetable.timetable_format === 'cycle'
              ? cycleMaps[timetable.id]?.[date] ?? null
              : null;
          // Updated: 2026-08-31 - `batch` was falling through to the weekday
          // branch. Its `timetable_data` is keyed by ISO DATE ('2026-03-02'), not
          // by weekday, so `timetableData['MONDAY']` never resolved and EVERY
          // batch timetable produced zero pending rows — measured on production,
          // all 25 active ones, 24 of them JKKN Dental's entire schedule. The
          // three key shapes are regular=weekday, batch=ISO date, cycle=cycle-N;
          // this must stay in step with fn_timetable_scheduled_sections, which
          // the Statistics tab now reads.
          const dayKey =
            timetable.timetable_format === 'cycle'
              ? cycleNum !== null
                ? `cycle-${cycleNum}`
                : null
              : timetable.timetable_format === 'batch'
                ? date
                : dayOfWeek;

          if (dayKey && timetableData && timetableData[dayKey]) {
            Object.entries(timetableData[dayKey]).forEach(
              ([periodId, rawSlot]) => {
                // One iteration per group on a combined slot, one otherwise.
                expandSlotVariants(rawSlot).forEach((variant) => {
                const slot = variant.slot;
                if (slot && !slot.is_break_slot && slot.course_id) {
                  // Updated: 2026-08-08 - `timetables.periods` stores each period's
                  // identifier as `id`, not `period_id`. Matching only on `period_id`
                  // therefore never resolved, and EVERY period-based row was dropped
                  // before it could be listed — measured on production: 1,085 of 1,244
                  // period rows carry only `id`, 159 carry only `period_id`, and none
                  // carry both, so the two shapes are mutually exclusive and the
                  // fallback is unambiguous. Mirrors the working lookup in
                  // learners/student-timetable-service.ts:245 (`p.id === slot.period_id`).
                  const periodInfo = Array.isArray(periods)
                    ? periods.find(
                        (p: any) => (p?.id ?? p?.period_id) === periodId
                      )
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
                    const baseKey = `${date}_${timetable.id}_${actualPeriodId}`;
                    // Both groups of a combined slot share one slot_id, so the
                    // map key needs the group suffix or the second would
                    // overwrite the first and only one would ever be listed.
                    const periodKey = variant.suffix
                      ? `${baseKey}::${variant.suffix}`
                      : baseKey;
                    scheduledMarkKeys.set(periodKey, {
                      base: baseKey,
                      course: slot.course_id || null,
                      combined: variant.combined
                    });

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
                });
              }
            );
          }
        });
      });

      // Step 4: Find marked attendance for the date range.
      //
      // Only the (date, timetable, slot) triples are needed, so the database
      // unnests attendance_data and returns them directly. Selecting the column
      // instead moved 4.6 MB of roster JSON per college-quarter to extract 84 KB
      // of keys, and the browser had to JSON.parse all of it before the pending
      // maths could start. See 20260926000000.
      const markedPeriods = new Set<string>();

      const { data: slotRows, error: slotError } = await (this.supabase as any).rpc(
        'get_marked_attendance_slots',
        {
          p_date_from: queryStartDate,
          p_date_to: queryEndDate,
          p_institution_id: effectiveInstitutionId || null
        }
      );

      // A combined slot teaches two cohorts in one period, each with its own
      // course. student_attendance keys only by PERIOD, so "was this period
      // marked?" cannot tell Group A from Group B — only the course can. This
      // second set carries `${date}_${timetable}_${period}_${course}` so each
      // group is checked against its own course.
      const markedPeriodCourses = new Set<string>();

      if (!slotError) {
        // One row per timetable, `marked` = { date: { slot_id: course_id } }.
        // Folded this way on purpose: the per-slot grain reached 21,991 rows for
        // a 92-day all-college window and PostgREST truncates at 10,000 without
        // saying so, which turns already-marked sessions into phantom pending
        // ones. Per timetable the count cannot exceed ~200 at any window size.
        (slotRows as { timetable_id: string; marked: Record<string, Record<string, string>> | null }[] | null)
          ?.forEach((row) => {
            const byDate = row.marked || {};
            for (const date of Object.keys(byDate)) {
              const slots = byDate[date];
              if (!slots || typeof slots !== 'object') continue;
              for (const periodId of Object.keys(slots)) {
                markedPeriods.add(`${date}_${row.timetable_id}_${periodId}`);
                const courseId = slots[periodId];
                if (courseId) {
                  markedPeriodCourses.add(
                    `${date}_${row.timetable_id}_${periodId}_${courseId}`
                  );
                }
              }
            }
          });
      } else {
        // The function is absent from the schema cache, which here means the
        // migration has not been applied. Fall back to the old column read so
        // the page keeps working — slower, never wrong.
        logger.warn(
          'academic/attendance-dashboard',
          'get_marked_attendance_slots unavailable; falling back to attendance_data read',
          { message: slotError.message, code: slotError.code }
        );

        let attendanceQuery = this.supabase
          .from('student_attendance')
          .select('attendance_date, timetable_id, attendance_data')
          .in('attendance_date', dates);

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

        const markedAttendanceData = markedAttendance as { attendance_date: string; timetable_id: string; attendance_data: any }[] | null;

        // This path is capped by PostgREST max_rows and cannot page past it.
        // Over a year across every college the record count reaches ~13,000, so
        // a truncated read here would silently report already-marked sessions as
        // pending. Say so loudly rather than printing a wrong backlog.
        if ((markedAttendanceData?.length || 0) >= 10000) {
          logger.error(
            'academic/attendance-dashboard',
            'Marked-attendance fallback hit the row ceiling; pending results will over-report. Apply migration 20260927000000 so the folded RPC is used.',
            { returned: markedAttendanceData?.length, queryStartDate, queryEndDate }
          );
        }

        markedAttendanceData?.forEach((record) => {
          const attendanceData = record.attendance_data as any;
          if (attendanceData && typeof attendanceData === 'object') {
            Object.keys(attendanceData).forEach((periodId) => {
              const periodData = attendanceData[periodId];
              if (
                periodData &&
                Array.isArray(periodData.students) &&
                periodData.students.length > 0
              ) {
                markedPeriods.add(
                  `${record.attendance_date}_${record.timetable_id}_${periodId}`
                );
                if (periodData.course_id) {
                  markedPeriodCourses.add(
                    `${record.attendance_date}_${record.timetable_id}_${periodId}_${periodData.course_id}`
                  );
                }
              }
            });
          }
        });
      }

      // Day-wise (session_wise) marks live in student_attendance keyed 'FN'/'AN'
      // and are already folded into markedPeriods by the generic builder above
      // (key `${date}_${timetable_id}_${FN|AN}`), so no extra query is needed.

      // Step 5: Find pending periods (scheduled but not marked)
      const pendingPeriods: PendingAttendancePeriod[] = [];
      const skippedMarkedCount = { count: 0 };
      const debugPendingPeriods: string[] = [];

      allScheduledPeriods.forEach((period, periodKey) => {
        const mark = scheduledMarkKeys.get(periodKey);

        // Ordinary slots keep the period-only test they have always used, so
        // this change cannot alter their results. Only a combined slot asks the
        // course-aware question, because only there does one period key stand
        // for two sessions that must be marked separately — marking Group A
        // would otherwise clear Group B.
        const isMarked =
          mark && mark.combined && mark.course
            ? markedPeriodCourses.has(`${mark.base}_${mark.course}`)
            : markedPeriods.has(mark?.base ?? periodKey);

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
          // The denominator the summary cards need. Both are counted over the
          // FULL scheduled set (pre-search, pre-pagination): `allScheduledPeriods`
          // is every markable period today's timetables produced, and
          // `skippedMarkedCount` is how many of those were already marked.
          //
          // Without these the cards had nothing but the pending list to count,
          // so "Total Periods" and "Pending Periods" were the same number and
          // the completion rate was structurally 0%.
          scheduledCount: allScheduledPeriods.size,
          markedCount: skippedMarkedCount.count,
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

  /**
   * Current-intake attendance readiness, one row per section holding
   * current-intake learners.
   *
   * DELIBERATELY NOT DERIVED FROM TIMETABLES. getPendingAttendance() above opens
   * with `.from('timetables')`, so its rows are scheduled periods — and a section
   * with no timetable produces no periods, therefore no pending rows, therefore
   * reads as perfectly healthy. This call starts from the LEARNERS instead, so a
   * section can never vanish by having nothing scheduled.
   *
   * The RPC is SECURITY DEFINER and self-authorizes on
   * academic.attendance.dashboard.view, then bounds rows by
   * role_has_institution_access — so a scope='own' caller reads only its own
   * institution even if it passes another institution's id.
   */
  static async getIntakeReadiness(
    windowDays: number = 21,
    institutionId?: string,
    departmentId?: string
  ): Promise<IntakeReadinessRow[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_attendance_fresher_readiness',
        {
          p_window_days: windowDays,
          // `?? null`, never `|| null`: '' would flow through as a real uuid
          // parameter and match zero rows (breaking "All Institutions").
          p_institution_id: institutionId ?? null,
          p_department_id: departmentId ?? null
        }
      );

      if (error) {
        logger.error(
          'academic/attendance',
          'fn_attendance_fresher_readiness failed',
          error
        );
        throw error;
      }

      return (data ?? []) as IntakeReadinessRow[];
    } catch (error) {
      logger.error(
        'academic/attendance',
        'Error in getIntakeReadiness',
        error
      );
      throw error;
    }
  }

  /**
   * Roll section rows up per institution. Kept next to the fetch so the two
   * cannot drift: every counter here is derived from readiness_status, the same
   * field the table renders, so a card can never disagree with the rows beneath it.
   */
  static summariseIntakeReadiness(
    rows: IntakeReadinessRow[]
  ): IntakeReadinessInstitutionSummary[] {
    const byInstitution = new Map<string, IntakeReadinessInstitutionSummary>();

    rows.forEach((row) => {
      let entry = byInstitution.get(row.institution_id);
      if (!entry) {
        entry = {
          institution_id: row.institution_id,
          institution_name: row.institution_name,
          sections: 0,
          ok: 0,
          notStarted: 0,
          blocked: 0,
          learners: 0,
          learnersBlocked: 0
        };
        byInstitution.set(row.institution_id, entry);
      }

      entry.sections += 1;
      entry.learners += row.learner_count;

      if (row.readiness_status === 'blocked') {
        entry.blocked += 1;
        entry.learnersBlocked += row.learner_count;
      } else if (row.readiness_status === 'not_started') {
        entry.notStarted += 1;
      } else {
        entry.ok += 1;
      }
    });

    // Worst first: the institutions with the most unreachable learners are the
    // ones an administrator has to act on today.
    return Array.from(byInstitution.values()).sort(
      (a, b) =>
        b.learnersBlocked - a.learnersBlocked ||
        b.blocked - a.blocked ||
        b.sections - a.sections
    );
  }
}
