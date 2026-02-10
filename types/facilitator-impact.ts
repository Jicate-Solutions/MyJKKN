// types/facilitator-impact.ts
// ============================================================================
// Facilitator Impact Dashboard - Types
// Measures facilitator effectiveness by learner outcome evidence,
// NOT teaching hours.
// ============================================================================

// ---- Data Stream Status ----

export type DataStreamKey = 'lti_grades' | 'attendance' | 'competencies' | 'alumni_outcomes';

export type DataStreamStatus = 'active' | 'partial' | 'empty';

export interface DataStream {
  key: DataStreamKey;
  label: string;
  description: string;
  status: DataStreamStatus;
  recordCount: number;
  /** What table/source powers this stream */
  source: string;
  /** What action activates this stream */
  activationHint: string;
  /** Icon name from lucide-react */
  icon: string;
}

// ---- Outcome Readiness Score ----

export interface OutcomeReadinessScore {
  /** 0-4: number of active data streams */
  activeStreams: number;
  totalStreams: number;
  /** 0-100 percentage */
  percentage: number;
  streams: DataStream[];
  /** Human-readable readiness level */
  level: 'not_started' | 'beginning' | 'developing' | 'established' | 'mature';
  levelLabel: string;
}

// ---- Facilitator Impact Overview ----

export interface FacilitatorImpactOverview {
  totalFacilitators: number;
  facilitatorsWithCourses: number;
  totalCourseAssignments: number;
  totalLearnersReached: number;
  /** % of facilitators who have at least 1 course assignment */
  courseAssignmentRate: number;
  /** Average courses per facilitator */
  avgCoursesPerFacilitator: number;
  /** Total unique courses with facilitators assigned */
  uniqueCoursesAssigned: number;
  /** Unique departments with course assignments */
  departmentsWithAssignments: number;
}

// ---- Facilitator with Impact Data ----

export interface FacilitatorImpactRow {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  designation: string;
  departmentName: string;
  institutionName: string;
  courseCount: number;
  /** Course names assigned */
  courses: string[];
  /** Learners in those courses (from sections) */
  learnersReached: number;
  /** From outcome_metrics JSONB */
  outcomeMetrics: {
    learners_mentored?: number;
    average_competency_improvement?: number;
    courses_with_competency_mapping?: number;
    industry_projects_facilitated?: number;
    placement_success_rate?: number;
    student_satisfaction_score?: number;
    last_computed?: string;
  };
  /** Role type: teacher/facilitator/trainer/etc */
  roleType: string;
  isActive: boolean;
}

// ---- Department Impact Summary ----

export interface DepartmentImpactSummary {
  departmentId: string;
  departmentName: string;
  institutionName: string;
  facilitatorCount: number;
  courseCount: number;
  learnersReached: number;
  /** Avg courses per facilitator in this dept */
  avgCoursesPerFacilitator: number;
}

// ---- Dashboard Filters ----

export interface FacilitatorImpactFilters {
  institutionId?: string;
  departmentId?: string;
}

// ---- Full Dashboard Data ----

export interface FacilitatorImpactDashboardData {
  readiness: OutcomeReadinessScore;
  overview: FacilitatorImpactOverview;
  facilitators: FacilitatorImpactRow[];
  departmentSummaries: DepartmentImpactSummary[];
}
