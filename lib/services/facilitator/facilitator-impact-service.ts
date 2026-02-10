// lib/services/facilitator/facilitator-impact-service.ts
// ============================================================================
// Facilitator Impact Service
// Queries existing staff, course assignments, and outcome data to build
// the Facilitator Impact Dashboard — designed to work with ZERO outcome data
// and progressively reveal more as data streams activate.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  DataStream,
  DataStreamStatus,
  OutcomeReadinessScore,
  FacilitatorImpactOverview,
  FacilitatorImpactRow,
  DepartmentImpactSummary,
  FacilitatorImpactDashboardData,
  FacilitatorImpactFilters
} from '@/types/facilitator-impact';

export class FacilitatorImpactService {
  // ---- Main Dashboard Loader ----

  static async getDashboardData(
    filters?: FacilitatorImpactFilters
  ): Promise<FacilitatorImpactDashboardData> {
    const [readiness, overview, facilitators, departmentSummaries] =
      await Promise.all([
        this.getOutcomeReadiness(filters),
        this.getOverview(filters),
        this.getFacilitatorList(filters),
        this.getDepartmentSummaries(filters)
      ]);

    return { readiness, overview, facilitators, departmentSummaries };
  }

  // ---- Outcome Readiness Score ----

  static async getOutcomeReadiness(
    filters?: FacilitatorImpactFilters
  ): Promise<OutcomeReadinessScore> {
    const supabase = createClientSupabaseClient();

    // Check each data stream's status
    const streams = await Promise.all([
      this.checkLtiGradesStream(supabase, filters),
      this.checkAttendanceStream(supabase, filters),
      this.checkCompetencyStream(supabase, filters),
      this.checkAlumniOutcomesStream(supabase, filters)
    ]);

    const activeStreams = streams.filter((s) => s.status === 'active').length;
    const partialStreams = streams.filter((s) => s.status === 'partial').length;

    // Score: active = 1 point, partial = 0.5 points
    const score = activeStreams + partialStreams * 0.5;
    const percentage = Math.round((score / 4) * 100);

    let level: OutcomeReadinessScore['level'];
    let levelLabel: string;

    if (score === 0) {
      level = 'not_started';
      levelLabel = 'Not Started';
    } else if (score <= 1) {
      level = 'beginning';
      levelLabel = 'Beginning';
    } else if (score <= 2) {
      level = 'developing';
      levelLabel = 'Developing';
    } else if (score <= 3) {
      level = 'established';
      levelLabel = 'Established';
    } else {
      level = 'mature';
      levelLabel = 'Mature';
    }

    return {
      activeStreams,
      totalStreams: 4,
      percentage,
      streams,
      level,
      levelLabel
    };
  }

  // ---- Individual Stream Checks ----

  private static async checkLtiGradesStream(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters?: FacilitatorImpactFilters
  ): Promise<DataStream> {
    let query = (supabase as any)
      .from('lti_grades')
      .select('id', { count: 'exact', head: true });

    if (filters?.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    const { count, error } = await query;
    const recordCount = error ? 0 : (count ?? 0);

    return {
      key: 'lti_grades',
      label: 'Course Grades (LTI)',
      description:
        'Grade data from LMS integration — shows how learners perform in each course',
      status: this.getStreamStatus(recordCount),
      recordCount,
      source: 'lti_grades table',
      activationHint:
        'Connect your LMS (Moodle/Canvas) via LTI integration to start receiving grade data',
      icon: 'GraduationCap'
    };
  }

  private static async checkAttendanceStream(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters?: FacilitatorImpactFilters
  ): Promise<DataStream> {
    let query = (supabase as any)
      .from('student_attendance')
      .select('id', { count: 'exact', head: true });

    if (filters?.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    const { count, error } = await query;
    const recordCount = error ? 0 : (count ?? 0);

    return {
      key: 'attendance',
      label: 'Attendance Patterns',
      description:
        'Daily attendance data — reveals engagement patterns per facilitator\'s sessions',
      status: this.getStreamStatus(recordCount),
      recordCount,
      source: 'student_attendance table',
      activationHint:
        'Start marking daily attendance in Academic > Attendance module',
      icon: 'CalendarCheck'
    };
  }

  private static async checkCompetencyStream(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters?: FacilitatorImpactFilters
  ): Promise<DataStream> {
    let query = (supabase as any)
      .from('learner_competencies')
      .select('id', { count: 'exact', head: true });

    if (filters?.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    const { count, error } = await query;
    const recordCount = error ? 0 : (count ?? 0);

    return {
      key: 'competencies',
      label: 'Competency Tracking',
      description:
        'Pre/post competency assessments — measures actual skill growth per learner',
      status: this.getStreamStatus(recordCount),
      recordCount,
      source: 'learner_competencies table',
      activationHint:
        'Define competencies in Competency Catalog and assess learners',
      icon: 'Target'
    };
  }

  private static async checkAlumniOutcomesStream(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    filters?: FacilitatorImpactFilters
  ): Promise<DataStream> {
    let query = (supabase as any)
      .from('alumni_outcomes')
      .select('id', { count: 'exact', head: true });

    if (filters?.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    const { count, error } = await query;
    const recordCount = error ? 0 : (count ?? 0);

    return {
      key: 'alumni_outcomes',
      label: 'Alumni Outcomes',
      description:
        'Employment, salary, and placement data — the ultimate measure of educational impact',
      status: this.getStreamStatus(recordCount),
      recordCount,
      source: 'alumni_outcomes table',
      activationHint:
        'Track alumni placements and employment in Alumni Outcomes module',
      icon: 'Briefcase'
    };
  }

  private static getStreamStatus(count: number): DataStreamStatus {
    if (count === 0) return 'empty';
    if (count < 50) return 'partial';
    return 'active';
  }

  // ---- Overview Stats ----

  static async getOverview(
    filters?: FacilitatorImpactFilters
  ): Promise<FacilitatorImpactOverview> {
    const supabase = createClientSupabaseClient();

    // Get total facilitators (active staff)
    let staffQuery = supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    if (filters?.institutionId) {
      staffQuery = staffQuery.eq('institution_id', filters.institutionId);
    }
    if (filters?.departmentId) {
      staffQuery = staffQuery.eq('department_id', filters.departmentId);
    }

    const { count: totalFacilitators } = await staffQuery;

    // Get facilitators with course assignments
    let assignmentQuery = supabase
      .from('staff_plan_courses')
      .select('staff_id, course_id');

    if (filters?.institutionId || filters?.departmentId) {
      // Need to join through staff_plans for institution/department filter
      let planQuery = supabase
        .from('staff_plans')
        .select('id');

      if (filters?.institutionId) {
        planQuery = planQuery.eq('institution_id', filters.institutionId);
      }
      if (filters?.departmentId) {
        planQuery = planQuery.eq('department_id', filters.departmentId);
      }

      const { data: plans } = await planQuery;
      if (plans && plans.length > 0) {
        assignmentQuery = assignmentQuery.in(
          'staff_plan_id',
          plans.map((p) => p.id)
        );
      } else {
        // No matching plans = no assignments
        return {
          totalFacilitators: totalFacilitators ?? 0,
          facilitatorsWithCourses: 0,
          totalCourseAssignments: 0,
          totalLearnersReached: 0,
          courseAssignmentRate: 0,
          avgCoursesPerFacilitator: 0,
          uniqueCoursesAssigned: 0,
          departmentsWithAssignments: 0
        };
      }
    }

    const { data: assignments } = await assignmentQuery;

    const uniqueStaffWithCourses = new Set(
      assignments?.map((a) => a.staff_id) ?? []
    );
    const uniqueCourses = new Set(
      assignments?.map((a) => a.course_id) ?? []
    );

    const facilitatorsWithCourses = uniqueStaffWithCourses.size;
    const totalCourseAssignments = assignments?.length ?? 0;
    const uniqueCoursesAssigned = uniqueCourses.size;

    // Course assignment rate
    const courseAssignmentRate =
      totalFacilitators && totalFacilitators > 0
        ? Math.round((facilitatorsWithCourses / totalFacilitators) * 100)
        : 0;

    // Average courses per facilitator (only for those with assignments)
    const avgCoursesPerFacilitator =
      facilitatorsWithCourses > 0
        ? Math.round(
            (totalCourseAssignments / facilitatorsWithCourses) * 10
          ) / 10
        : 0;

    // Get total learners count (profiles with role='student' or from learners table)
    let learnersQuery = supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('is_active', true);

    if (filters?.institutionId) {
      learnersQuery = learnersQuery.eq('institution_id', filters.institutionId);
    }
    if (filters?.departmentId) {
      learnersQuery = learnersQuery.eq('department_id', filters.departmentId);
    }

    const { count: totalLearnersReached } = await learnersQuery;

    // Get departments with assignments
    let deptQuery = supabase
      .from('staff_plans')
      .select('department_id');

    if (filters?.institutionId) {
      deptQuery = deptQuery.eq('institution_id', filters.institutionId);
    }

    const { data: plans } = await deptQuery;
    const uniqueDepts = new Set(plans?.map((p) => p.department_id) ?? []);

    return {
      totalFacilitators: totalFacilitators ?? 0,
      facilitatorsWithCourses,
      totalCourseAssignments,
      totalLearnersReached: totalLearnersReached ?? 0,
      courseAssignmentRate,
      avgCoursesPerFacilitator,
      uniqueCoursesAssigned,
      departmentsWithAssignments: uniqueDepts.size
    };
  }

  // ---- Facilitator List ----

  static async getFacilitatorList(
    filters?: FacilitatorImpactFilters
  ): Promise<FacilitatorImpactRow[]> {
    const supabase = createClientSupabaseClient();

    // Get staff with department and institution names
    let staffQuery = (supabase as any)
      .from('staff')
      .select(
        `
        id,
        staff_id,
        first_name,
        last_name,
        designation,
        role_type,
        outcome_metrics,
        is_active,
        department:departments!staff_department_id_fkey(id, department_name),
        institution:institutions!staff_institution_id_fkey(id, name)
      `
      )
      .eq('is_active', true)
      .order('first_name', { ascending: true });

    if (filters?.institutionId) {
      staffQuery = staffQuery.eq('institution_id', filters.institutionId);
    }
    if (filters?.departmentId) {
      staffQuery = staffQuery.eq('department_id', filters.departmentId);
    }

    const { data: staffList, error: staffError } = await staffQuery as { data: any[] | null; error: any };

    if (staffError || !staffList) {
      console.error('[facilitator-impact] Error fetching staff:', staffError);
      return [];
    }

    // Get all course assignments in one query
    const staffIds = staffList.map((s: any) => s.id);

    if (staffIds.length === 0) return [];

    const { data: courseAssignments } = await (supabase as any)
      .from('staff_plan_courses')
      .select(
        `
        staff_id,
        course:courses!staff_plan_courses_course_id_fkey(id, course_name)
      `
      )
      .in('staff_id', staffIds) as { data: any[] | null };

    // Group assignments by staff_id
    const assignmentMap = new Map<
      string,
      { courseCount: number; courses: string[] }
    >();

    if (courseAssignments) {
      for (const a of courseAssignments) {
        const existing = assignmentMap.get(a.staff_id) ?? {
          courseCount: 0,
          courses: []
        };
        existing.courseCount++;
        const courseName =
          (a.course as any)?.course_name ?? 'Unknown Course';
        if (!existing.courses.includes(courseName)) {
          existing.courses.push(courseName);
        }
        assignmentMap.set(a.staff_id, existing);
      }
    }

    return staffList.map((staff) => {
      const assignments = assignmentMap.get(staff.id) ?? {
        courseCount: 0,
        courses: []
      };
      const dept = staff.department as any;
      const inst = staff.institution as any;

      return {
        id: staff.id,
        staffId: staff.staff_id ?? '',
        firstName: staff.first_name,
        lastName: staff.last_name,
        designation: staff.designation ?? '',
        departmentName: dept?.department_name ?? 'Unassigned',
        institutionName: inst?.name ?? 'Unknown',
        courseCount: assignments.courseCount,
        courses: assignments.courses,
        learnersReached: 0, // Will be computed when grade data flows
        outcomeMetrics: (staff.outcome_metrics as any) ?? {},
        roleType: staff.role_type ?? 'teacher',
        isActive: staff.is_active
      };
    });
  }

  // ---- Department Summaries ----

  static async getDepartmentSummaries(
    filters?: FacilitatorImpactFilters
  ): Promise<DepartmentImpactSummary[]> {
    const supabase = createClientSupabaseClient();

    // Get staff grouped by department with course counts
    let staffQuery = supabase
      .from('staff')
      .select(
        `
        id,
        department_id,
        department:departments!staff_department_id_fkey(id, department_name),
        institution:institutions!staff_institution_id_fkey(id, name)
      `
      )
      .eq('is_active', true);

    if (filters?.institutionId) {
      staffQuery = staffQuery.eq('institution_id', filters.institutionId);
    }
    if (filters?.departmentId) {
      staffQuery = staffQuery.eq('department_id', filters.departmentId);
    }

    const { data: staffList } = await staffQuery;

    if (!staffList || staffList.length === 0) return [];

    // Get all course assignments
    const staffIds = staffList.map((s) => s.id);
    const { data: courseAssignments } = await supabase
      .from('staff_plan_courses')
      .select('staff_id, course_id')
      .in('staff_id', staffIds);

    // Build department map
    const deptMap = new Map<
      string,
      {
        departmentId: string;
        departmentName: string;
        institutionName: string;
        staffIds: Set<string>;
        courseIds: Set<string>;
      }
    >();

    for (const staff of staffList) {
      const dept = staff.department as any;
      const inst = staff.institution as any;
      const deptId = staff.department_id;

      if (!deptId) continue;

      const existing = deptMap.get(deptId) ?? {
        departmentId: deptId,
        departmentName: dept?.department_name ?? 'Unknown',
        institutionName: inst?.name ?? 'Unknown',
        staffIds: new Set<string>(),
        courseIds: new Set<string>()
      };

      existing.staffIds.add(staff.id);
      deptMap.set(deptId, existing);
    }

    // Add course data
    if (courseAssignments) {
      for (const a of courseAssignments) {
        for (const [, dept] of deptMap) {
          if (dept.staffIds.has(a.staff_id)) {
            dept.courseIds.add(a.course_id);
          }
        }
      }
    }

    return Array.from(deptMap.values())
      .map((dept) => ({
        departmentId: dept.departmentId,
        departmentName: dept.departmentName,
        institutionName: dept.institutionName,
        facilitatorCount: dept.staffIds.size,
        courseCount: dept.courseIds.size,
        learnersReached: 0, // Will populate when outcome data flows
        avgCoursesPerFacilitator:
          dept.staffIds.size > 0
            ? Math.round((dept.courseIds.size / dept.staffIds.size) * 10) / 10
            : 0
      }))
      .sort((a, b) => b.facilitatorCount - a.facilitatorCount);
  }
}
