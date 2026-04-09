import type {
  CiaMarksSyncRequest,
  CiaMarksSyncResponse,
  CiaReportResponse,
  CourseMapping,
  ExamRegistration,
  LearnerForMarkEntry,
} from '@/types/internal-marks';

export class CiaMarksService {
  private static marksUrl = '/api/internal-marks/marks';
  private static registrationsUrl = '/api/internal-marks/registrations';
  private static courseMappingUrl = '/api/internal-marks/course-mapping';

  /**
   * Fetches COE course-mapping records for a program.
   * Used to populate Semester + Course dropdowns client-side.
   */
  static async getCourseMapping(params: {
    institutionId: string;
    programCode: string;
  }): Promise<CourseMapping[]> {
    const sp = new URLSearchParams({
      institutionId: params.institutionId,
      programCode: params.programCode,
    });

    const res = await fetch(`${this.courseMappingUrl}?${sp.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch course mapping' }));
      throw new Error(err.error ?? 'Failed to fetch course mapping');
    }
    const json = await res.json();
    return json.data ?? [];
  }

  /**
   * Derives distinct semester codes from a course-mapping list.
   * Sorted naturally (PCM-1, PCM-2, PCM-3...) by extracting the trailing number.
   */
  static getSemestersFromMapping(mapping: CourseMapping[]): string[] {
    const codes = new Set<string>();
    for (const m of mapping) {
      if (m.semester_code && m.is_active) codes.add(m.semester_code);
    }
    const extractNum = (code: string): number => {
      const match = code.match(/(\d+)\s*$/);
      return match ? parseInt(match[1], 10) : 0;
    };
    return Array.from(codes).sort((a, b) => extractNum(a) - extractNum(b));
  }

  /**
   * Derives the course list for a given semester, sorted by course_order ASC.
   */
  static getCoursesForSemester(
    mapping: CourseMapping[],
    semesterCode: string
  ): Array<{ course_code: string; course_name: string; course_order: number }> {
    return mapping
      .filter((m) => m.is_active && m.semester_code === semesterCode)
      .sort((a, b) => (a.course_order ?? 0) - (b.course_order ?? 0))
      .map((m) => ({
        course_code: m.course_code,
        course_name: m.course_name ?? '',
        course_order: m.course_order ?? 0,
      }));
  }

  /**
   * Fetches exam registrations from COE.
   * Used to populate course dropdown and student list.
   */
  static async getRegistrations(params: {
    institutionId: string;
    examSessionId: string;
    programCode?: string;
    courseCode?: string;
  }): Promise<ExamRegistration[]> {
    const sp = new URLSearchParams({
      institutionId: params.institutionId,
      examSessionId: params.examSessionId,
    });
    if (params.programCode) sp.set('programCode', params.programCode);
    if (params.courseCode) sp.set('courseCode', params.courseCode);

    const res = await fetch(`${this.registrationsUrl}?${sp.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch registrations' }));
      throw new Error(err.error ?? 'Failed to fetch registrations');
    }
    const json = await res.json();
    return json.data ?? [];
  }

  /**
   * Derives distinct courses from registrations, filtered by program code and is_regular.
   */
  static getCoursesFromRegistrations(
    registrations: ExamRegistration[],
    programCode?: string
  ): Array<{ course_code: string; course_offering_id: string }> {
    const filtered = registrations.filter((r) =>
      r.is_regular && (!programCode || r.program_code === programCode)
    );

    const courseMap = new Map<string, string>();
    for (const reg of filtered) {
      if (!courseMap.has(reg.course_code)) {
        courseMap.set(reg.course_code, reg.course_offering_id);
      }
    }
    return Array.from(courseMap.entries())
      .map(([course_code, course_offering_id]) => ({ course_code, course_offering_id }))
      .sort((a, b) => a.course_code.localeCompare(b.course_code));
  }

  /**
   * COE course info (code → name + internal_max_mark).
   */
  static async fetchCoeCoursesMap(
    institutionId: string
  ): Promise<Map<string, { course_name: string; internal_max_mark: number }>> {
    const res = await fetch(
      `/api/internal-marks/courses?institutionId=${institutionId}`
    );
    if (!res.ok) return new Map();

    const json = await res.json();
    const courses = json.data ?? json ?? [];

    const map = new Map<string, { course_name: string; internal_max_mark: number }>();
    for (const c of courses) {
      if (c.course_code) {
        map.set(c.course_code, {
          course_name: c.course_name ?? '',
          internal_max_mark: c.internal_max_mark ?? 0,
        });
      }
    }
    return map;
  }

  /**
   * Enriches course list with names and max marks from COE courses.
   */
  static enrichCoursesWithNames(
    courses: Array<{ course_code: string; course_offering_id: string }>,
    courseInfoMap: Map<string, { course_name: string; internal_max_mark: number }>
  ): Array<{ course_code: string; course_name: string; course_offering_id: string; internal_max_mark: number }> {
    return courses.map((c) => {
      const info = courseInfoMap.get(c.course_code);
      return {
        ...c,
        course_name: info?.course_name ?? '',
        internal_max_mark: info?.internal_max_mark ?? 0,
      };
    });
  }

  /**
   * Derives student list from registrations for a specific course.
   */
  static getLearnersFromRegistrations(
    registrations: ExamRegistration[],
    courseCode: string
  ): LearnerForMarkEntry[] {
    return registrations
      .filter((r) => r.course_code === courseCode && r.registration_status === 'Approved' && r.is_regular)
      .map((r) => ({
        id: r.student_id,
        register_number: r.stu_register_no,
        name: r.student_name,
        exam_registration_id: r.id,
        course_offering_id: r.course_offering_id,
      }))
      .sort((a, b) => a.register_number.localeCompare(b.register_number));
  }

  static async getMarks(params: {
    institutionId: string;
    examSessionId: string;
    courseCode: string;
    ciaRound: number;
    programCode?: string;
  }): Promise<CiaReportResponse> {
    const sp = new URLSearchParams({
      institutionId: params.institutionId,
      examSessionId: params.examSessionId,
      courseCode: params.courseCode,
      ciaRound: String(params.ciaRound),
    });
    if (params.programCode) sp.set('programCode', params.programCode);

    const res = await fetch(`${this.marksUrl}?${sp.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch marks' }));
      throw new Error(err.error ?? 'Failed to fetch marks');
    }
    return (await res.json()).data;
  }

  static async syncMarks(data: CiaMarksSyncRequest): Promise<CiaMarksSyncResponse> {
    const res = await fetch(this.marksUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to submit marks' }));
      throw new Error(err.error ?? 'Failed to submit marks');
    }
    return res.json();
  }
}
