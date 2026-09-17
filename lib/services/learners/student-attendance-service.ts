/**
 * Student Attendance Service
 * Created: 2025-12-29
 * Description: Service layer for student self-service attendance view
 */

import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StudentAttendanceRecord,
  AttendanceStatistics,
  CourseAttendance,
  TrendData,
  ExportData
} from '@/types/student-attendance';

/** Which read failed, for the log line and for tests. */
export type AttendanceFetchStage = 'learner' | 'timetables' | 'attendance';

/**
 * A read that failed, as opposed to a semester with nothing in it.
 *
 * The distinction is the bug: the service used to answer both with an empty
 * array, so a learner whose query was refused saw a confident "No Attendance
 * Records" and had nothing to retry.
 */
export class AttendanceFetchError extends Error {
  readonly stage: AttendanceFetchStage;

  constructor(stage: AttendanceFetchStage, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AttendanceFetchError';
    this.stage = stage;
  }
}

/**
 * Everything the My Attendance page renders, derived from ONE fetch of the
 * learner's attendance records.
 */
export interface AttendanceOverview {
  records: StudentAttendanceRecord[];
  statistics: AttendanceStatistics;
  courseWise: CourseAttendance[];
  trend: TrendData[];
}

/**
 * Derive overall statistics from already-fetched records. Pure — no I/O.
 */
export function deriveAttendanceStatistics(
  records: StudentAttendanceRecord[]
): AttendanceStatistics {
  const totalClasses = records.length;
  const presentCount = records.filter(r => r.status === 'Present').length;
  const absentCount = totalClasses - presentCount;
  const percentage = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

  return {
    totalClasses,
    presentCount,
    absentCount,
    percentage,
    threshold: 75,
    isAboveThreshold: percentage >= 75
  };
}

/**
 * Derive the course-wise breakdown from already-fetched records. Pure — no I/O.
 */
export function deriveCourseWiseAttendance(
  records: StudentAttendanceRecord[]
): CourseAttendance[] {
  const courseMap = new Map<string, CourseAttendance>();

  records.forEach(record => {
    const key = record.course_code || record.course_name;

    if (!courseMap.has(key)) {
      courseMap.set(key, {
        course_name: record.course_name,
        course_code: record.course_code,
        total: 0,
        present: 0,
        absent: 0,
        percentage: 0
      });
    }

    const course = courseMap.get(key)!;
    course.total++;
    if (record.status === 'Present') {
      course.present++;
    } else {
      course.absent++;
    }
  });

  return Array.from(courseMap.values())
    .map(c => ({
      ...c,
      percentage: c.total > 0 ? Math.round((c.present / c.total) * 100) : 0
    }))
    .sort((a, b) => a.course_name.localeCompare(b.course_name));
}

/**
 * Derive the last-N-days trend from already-fetched records. Pure — no I/O.
 */
export function deriveAttendanceTrend(
  records: StudentAttendanceRecord[],
  days = 30
): TrendData[] {
  // Filter to last N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentRecords = records
    .filter(r => {
      const recordDate = new Date(r.date);
      return recordDate >= cutoffDate;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group by date and calculate daily percentage
  const trendMap = new Map<string, { total: number; present: number }>();

  recentRecords.forEach(record => {
    if (!trendMap.has(record.date)) {
      trendMap.set(record.date, { total: 0, present: 0 });
    }
    const dayData = trendMap.get(record.date)!;
    dayData.total++;
    if (record.status === 'Present') {
      dayData.present++;
    }
  });

  return Array.from(trendMap.entries()).map(([date, data]) => ({
    date,
    percentage: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0
  }));
}

/**
 * Check if timetable_data JSONB contains a specific section_id in any slot's section_ids array.
 * Handles both day-based (MONDAY, TUESDAY...) and date-based (2026-03-13) top-level keys.
 */
function timetableContainsSection(timetableData: any, sectionId: string): boolean {
  if (!timetableData || typeof timetableData !== 'object') return false;

  // Check each top-level entry (day or date)
  for (const dayData of Object.values(timetableData)) {
    if (typeof dayData !== 'object' || dayData === null) continue;
    // Check each period slot
    for (const slotData of Object.values(dayData as Record<string, any>)) {
      if (slotData?.section_ids && Array.isArray(slotData.section_ids)) {
        if (slotData.section_ids.includes(sectionId)) return true;
      }
    }
  }
  return false;
}

export class StudentAttendanceService {
  /**
   * Get attendance records for a student in a specific semester
   * Parses JSONB attendance_data to extract individual student records
   *
   * Unchanged for existing callers: a failed read is logged and answered with an
   * empty array. That is why the read has to be available in a form that SAYS it
   * failed — see fetchAttendanceRecords.
   */
  static async getStudentAttendanceBySemester(
    learnerId: string,
    semesterId: string,
    // Optional injected client. The student-facing page omits it (cookie session
    // + RLS). The Parent Portal passes a service-role client because parents
    // authenticate with a custom JWT and have no Supabase session for RLS.
    injectedClient?: SupabaseClient
  ): Promise<StudentAttendanceRecord[]> {
    const { data } = await this.fetchAttendanceRecords(learnerId, semesterId, injectedClient);
    return data;
  }

  /**
   * The same read, with the failures visible.
   *
   * getStudentAttendanceBySemester answers a failed query with an empty array,
   * so "the database refused" and "you attended nothing" arrive at the caller
   * looking identical. A learner whose read fails is then shown a confident
   * "No Attendance Records" instead of an error they can act on.
   *
   * This returns both: `data` is exactly what the old method returns in every
   * case — best effort, empty on a hard failure — and `error` is non-null when
   * any query failed. Callers that want the old behaviour read `data` and
   * ignore `error`, which is what the three wrapper methods do.
   *
   * A genuinely empty result is NOT an error: no timetables for the semester
   * and no attendance rows yet both return `{ data: [], error: null }`.
   */
  static async fetchAttendanceRecords(
    learnerId: string,
    semesterId: string,
    injectedClient?: SupabaseClient
  ): Promise<{ data: StudentAttendanceRecord[]; error: AttendanceFetchError | null }> {
    const supabase = injectedClient ?? (await createClient());

    // 1. Get student's section_id and basic info
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('section_id, first_name, last_name')
      .eq('id', learnerId)
      .single();

    if (learnerError || !learner) {
      console.error('[learners/attendance] Failed to fetch learner profile:', learnerError);
      return {
        data: [],
        error: new AttendanceFetchError(
          'learner',
          'Could not read the learner profile for this attendance view.',
          learnerError ?? undefined
        )
      };
    }

    // 2. Get timetables for the semester
    // Step A: Try exact section_id match on the timetable table
    const { data: directTimetables, error: directError } = await supabase
      .from('timetables')
      .select('id, periods, timetable_data')
      .eq('semester_id', semesterId)
      .eq('section_id', learner.section_id)
      .eq('is_active', true);

    // A timetable read that fails does NOT stop the walk — the other step may
    // still find the learner's timetables, and stopping here would change what
    // existing callers get back. It is remembered so the caller can be told the
    // result is incomplete rather than empty.
    let timetableError: AttendanceFetchError | null = null;

    if (directError) {
      console.error('[learners/attendance] Failed to fetch timetables (direct):', directError);
      timetableError = new AttendanceFetchError(
        'timetables',
        'Could not read this semester\'s timetables for your section.',
        directError
      );
    }

    // Step B: Fallback — fetch timetables where section_id is NULL and check timetable_data JSONB
    let fallbackTimetables: typeof directTimetables = [];
    const { data: nullSectionTimetables, error: fallbackError } = await supabase
      .from('timetables')
      .select('id, periods, timetable_data')
      .eq('semester_id', semesterId)
      .is('section_id', null)
      .eq('is_active', true);

    if (fallbackError) {
      console.error('[learners/attendance] Failed to fetch timetables (fallback):', fallbackError);
      timetableError = timetableError ?? new AttendanceFetchError(
        'timetables',
        'Could not read this semester\'s shared timetables.',
        fallbackError
      );
    } else if (nullSectionTimetables?.length) {
      // Filter in code: only keep timetables whose timetable_data references the student's section
      fallbackTimetables = nullSectionTimetables.filter(
        t => timetableContainsSection(t.timetable_data, learner.section_id)
      );
    }

    // Merge and deduplicate by timetable ID
    const timetableMap = new Map<string, (typeof directTimetables)[number]>();
    for (const t of (directTimetables || [])) {
      timetableMap.set(t.id, t);
    }
    for (const t of (fallbackTimetables || [])) {
      if (!timetableMap.has(t.id)) {
        timetableMap.set(t.id, t);
      }
    }
    const timetables = Array.from(timetableMap.values());

    if (!timetables.length) {
      console.warn('[learners/attendance] No timetables found:', { semesterId, sectionId: learner.section_id });
      // Genuinely empty unless a read failed on the way here.
      return { data: [], error: timetableError };
    }

    // 3. Get attendance records (RLS automatically filters to student's section)
    const { data: attendance, error: attendanceError } = await supabase
      .from('student_attendance')
      .select('attendance_date, attendance_data, timetable_id')
      .in('timetable_id', timetables.map(t => t.id))
      .eq('section_id', learner.section_id)
      .order('attendance_date', { ascending: false });

    if (attendanceError) {
      console.error('[learners/attendance] Failed to fetch attendance records:', attendanceError);
      return {
        data: [],
        error: new AttendanceFetchError(
          'attendance',
          'Could not read your attendance records for this semester.',
          attendanceError
        )
      };
    }

    if (!attendance || attendance.length === 0) {
      console.warn('[learners/attendance] No attendance records found:', { learnerId, semesterId });
      // Genuinely empty unless a read failed on the way here.
      return { data: [], error: timetableError };
    }

    // 4. Extract student's attendance from JSONB
    const records: StudentAttendanceRecord[] = [];

    for (const record of attendance) {
      const attendanceData = record.attendance_data as any;
      const timetable = timetables.find(t => t.id === record.timetable_id);

      if (!attendanceData || !timetable) continue;

      // Iterate through each period in the attendance data
      for (const [periodId, periodData] of Object.entries(attendanceData)) {
        const students = (periodData as any).students || [];
        const studentData = students.find((s: any) => s.student_id === learnerId);

        if (studentData) {
          // New format: Period info is embedded directly in periodData
          // Fallback: Look up from timetable.periods for backward compatibility
          const periodInfo = (timetable.periods as any[])?.find(
            p => p.period_id === periodId
          );

          // Priority: Use embedded period info from attendance data, fallback to timetable periods
          const periodName = (periodData as any).period_name || periodInfo?.period_name || 'Period';
          const startTime = (periodData as any).start_time || periodInfo?.start_time || '';
          const endTime = (periodData as any).end_time || periodInfo?.end_time || '';

          records.push({
            date: record.attendance_date,
            period_name: periodName,
            start_time: startTime,
            end_time: endTime,
            course_name: (periodData as any).course_name || 'Unknown',
            course_code: (periodData as any).course_code,
            status: studentData.status,
            marked_at: studentData.marked_at
          });
        }
      }
    }

    return { data: records, error: timetableError };
  }

  /**
   * Everything the My Attendance page needs, from ONE fetch.
   *
   * getAttendanceStatistics, getCourseWiseAttendance and getAttendanceTrend each
   * re-run the whole fetch internally, so asking for all four in parallel pulled
   * the same section's attendance JSONB out of Postgres four times over. This
   * fetches once and derives the other three in memory.
   *
   * It THROWS when a read failed. The page shows the learner an error they can
   * retry, which is the whole point: "the database refused" must not reach the
   * screen wearing the empty state's clothes.
   */
  static async getAttendanceOverview(
    learnerId: string,
    semesterId: string,
    injectedClient?: SupabaseClient,
    trendDays = 30
  ): Promise<AttendanceOverview> {
    const { data: records, error } = await this.fetchAttendanceRecords(
      learnerId,
      semesterId,
      injectedClient
    );

    if (error) {
      throw error;
    }

    return {
      records,
      statistics: deriveAttendanceStatistics(records),
      courseWise: deriveCourseWiseAttendance(records),
      trend: deriveAttendanceTrend(records, trendDays)
    };
  }

  /**
   * Calculate attendance statistics for a semester
   */
  static async getAttendanceStatistics(
    learnerId: string,
    semesterId: string,
    injectedClient?: SupabaseClient
  ): Promise<AttendanceStatistics> {
    const records = await this.getStudentAttendanceBySemester(learnerId, semesterId, injectedClient);
    return deriveAttendanceStatistics(records);
  }

  /**
   * Get course-wise attendance breakdown
   */
  static async getCourseWiseAttendance(
    learnerId: string,
    semesterId: string
  ): Promise<CourseAttendance[]> {
    const records = await this.getStudentAttendanceBySemester(learnerId, semesterId);
    return deriveCourseWiseAttendance(records);
  }

  /**
   * Get attendance trend data for chart (last N days)
   */
  static async getAttendanceTrend(
    learnerId: string,
    semesterId: string,
    days = 30
  ): Promise<TrendData[]> {
    const records = await this.getStudentAttendanceBySemester(learnerId, semesterId);
    return deriveAttendanceTrend(records, days);
  }

  /**
   * Export attendance data (for PDF/Excel generation)
   */
  static async exportAttendanceData(
    learnerId: string,
    semesterId: string
  ): Promise<ExportData> {
    const supabase = await createClient();

    // Fetch all data in parallel
    const [learnerResult, semesterResult, statistics, courseWise, records] = await Promise.all([
      supabase
        .from('learners_profiles')
        .select('first_name, last_name, roll_number, section:sections(section_name)')
        .eq('id', learnerId)
        .single(),
      supabase
        .from('semesters')
        .select('semester_name, academic_year:academic_years(year_range)')
        .eq('id', semesterId)
        .single(),
      this.getAttendanceStatistics(learnerId, semesterId),
      this.getCourseWiseAttendance(learnerId, semesterId),
      this.getStudentAttendanceBySemester(learnerId, semesterId)
    ]);

    return {
      student: {
        name: `${learnerResult.data?.first_name || ''} ${learnerResult.data?.last_name || ''}`.trim(),
        roll_number: learnerResult.data?.roll_number || '',
        section: (learnerResult.data?.section as any)?.section_name || ''
      },
      semester: {
        name: semesterResult.data?.semester_name || '',
        academic_year: (semesterResult.data?.academic_year as any)?.year_range || ''
      },
      statistics,
      courseWise,
      records
    };
  }
}
