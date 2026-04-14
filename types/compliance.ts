// types/compliance.ts
// ============================================================================
// AI-Solution Graduation Gate — Compliance Dashboard Types
// Tracks whether graduating learners have built a solution using AI
// via Solutions Hub (Lovable + Flywheel).
// ============================================================================

// ---- Clearance Status ----

export type ClearanceStatus =
  | 'cleared'      // ai_solution_cleared = true
  | 'completed'    // Assignment done, clearance pending trigger
  | 'in_progress'  // Builder assigned, working on solution
  | 'registered'   // Builder registered, no assignment yet
  | 'not_started'; // Not registered as builder

export const CLEARANCE_STATUS_CONFIG: Record<
  ClearanceStatus,
  { label: string; color: string; description: string }
> = {
  cleared: {
    label: 'Cleared',
    color: 'bg-green-100 text-green-800 border-green-200',
    description: 'AI solution requirement fulfilled'
  },
  completed: {
    label: 'Completed',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Assignment completed, clearance pending'
  },
  in_progress: {
    label: 'In Progress',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Working on solution'
  },
  registered: {
    label: 'Registered',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    description: 'Builder registered, awaiting assignment'
  },
  not_started: {
    label: 'Not Started',
    color: 'bg-red-100 text-red-800 border-red-200',
    description: 'Not yet registered as a builder'
  }
};

// ---- Overview Stats ----

export interface ComplianceOverview {
  totalLearners: number;
  cleared: number;
  inProgress: number;
  notStarted: number;
  registered: number;
  clearanceRate: number;
}

// ---- Department Breakdown ----

export interface DepartmentCompliance {
  departmentId: string;
  departmentName: string;
  institutionId: string;
  institutionName: string;
  totalLearners: number;
  cleared: number;
  inProgress: number;
  notStarted: number;
  clearanceRate: number;
}

// ---- Individual Learner ----

export interface LearnerCompliance {
  learnerId: string;
  firstName: string;
  lastName: string;
  rollNumber: string | null;
  registerNumber: string | null;
  institutionId: string;
  departmentId: string | null;
  departmentName: string | null;
  institutionName: string | null;
  aiSolutionCleared: boolean;
  aiSolutionClearedAt: string | null;
  builderId: string | null;
  builderCode: string | null;
  assignmentId: string | null;
  assignmentStatus: string | null;
  assignmentRole: string | null;
  assignmentRating: number | null;
  solutionTitle: string | null;
  solutionCode: string | null;
  solutionStatus: string | null;
  clearanceStatus: ClearanceStatus;
}

// ---- Solution Teams ----

export interface SolutionTeamMember {
  builderId: string;
  builderName: string;
  role: string;
  learnerId: string | null;
  clearanceStatus: ClearanceStatus;
}

export interface SolutionTeam {
  solutionId: string;
  solutionTitle: string;
  solutionCode: string;
  solutionType: string;
  solutionStatus: string;
  deploymentUrl: string | null;
  teamSize: number;
  graduatingBuilders: number;
  teamMembers: SolutionTeamMember[];
}

// ---- Dashboard Data ----

export interface ComplianceDashboardData {
  overview: ComplianceOverview;
  departments: DepartmentCompliance[];
  learners: LearnerCompliance[];
  solutions: SolutionTeam[];
}

// ---- Filters ----

export interface ComplianceFilters {
  institutionId?: string;
  departmentId?: string;
  clearanceStatus?: ClearanceStatus | 'all';
  searchQuery?: string;
}
