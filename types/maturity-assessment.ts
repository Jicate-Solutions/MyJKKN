// types/maturity-assessment.ts

/**
 * Maturity Assessment Types
 * Based on TQM International Education Excellence Model
 *
 * 4-Stage Maturity Model:
 * 1 = Crisis (Reacting to Problems)
 * 2 = Survival (Early Systematic)
 * 3 = Stability (Aligned Approaches)
 * 4 = Excellence (Integrated Approaches)
 *
 * 6 Assessment Dimensions:
 * - Leadership
 * - Strategy
 * - People
 * - Processes
 * - Resources (Data)
 * - Results (Stakeholders)
 */

// Core Types
export type MaturityStage = 1 | 2 | 3 | 4;
export type AssessmentStatus = 'draft' | 'submitted' | 'approved' | 'archived';
export type ProgressStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

// Dimension names as constants
export const MATURITY_DIMENSIONS = [
  'Leadership',
  'Strategy',
  'People',
  'Processes',
  'Resources',
  'Results'
] as const;

export type MaturityDimensionName = (typeof MATURITY_DIMENSIONS)[number];

// Stage names for display
export const MATURITY_STAGE_NAMES: Record<MaturityStage, string> = {
  1: 'Crisis',
  2: 'Survival',
  3: 'Stability',
  4: 'Excellence'
};

export const MATURITY_STAGE_DESCRIPTIONS: Record<MaturityStage, string> = {
  1: 'Reacting to Problems - Ad-hoc responses, firefighting',
  2: 'Early Systematic - Some processes defined, basic documentation',
  3: 'Aligned Approaches - Processes linked to goals, OKRs and metrics tracked',
  4: 'Integrated Approaches - Full data-driven operation, continuous improvement'
};

// Dimension Interface
export interface MaturityDimension {
  name: MaturityDimensionName;
  description: string;
  stage_1_criteria: string;
  stage_2_criteria: string;
  stage_3_criteria: string;
  stage_4_criteria: string;
}

// Framework Interface
export interface MaturityFramework {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  dimensions: MaturityDimension[];
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateMaturityFrameworkDto {
  institution_id: string;
  name?: string;
  description?: string;
  dimensions?: MaturityDimension[];
}

export interface UpdateMaturityFrameworkDto {
  name?: string;
  description?: string;
  dimensions?: MaturityDimension[];
  is_active?: boolean;
}

// Assessment Interface
export interface MaturityAssessment {
  id: string;
  institution_id: string;
  framework_id: string;
  department_id: string | null;
  assessment_date: string;
  assessor_id: string | null;
  dimension_scores: Record<MaturityDimensionName, MaturityStage>;
  overall_stage: MaturityStage;
  evidence: string | null;
  improvement_plan: string | null;
  target_stage: MaturityStage | null;
  target_date: string | null;
  status: AssessmentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at?: string;

  // Joined relations
  department?: {
    id: string;
    name: string;
  } | null;
  assessor?: {
    id: string;
    full_name: string;
    email?: string;
  } | null;
  reviewer?: {
    id: string;
    full_name: string;
    email?: string;
  } | null;
  framework?: MaturityFramework;
  institution?: {
    id: string;
    name: string;
    counselling_code?: string;
  };
  progress_items?: MaturityProgressItem[];
}

export interface CreateMaturityAssessmentDto {
  institution_id: string;
  framework_id: string;
  department_id?: string | null;
  assessment_date: string;
  assessor_id?: string;
  dimension_scores: Record<MaturityDimensionName, MaturityStage>;
  evidence?: string;
  improvement_plan?: string;
  target_stage?: MaturityStage;
  target_date?: string;
}

export interface UpdateMaturityAssessmentDto {
  department_id?: string | null;
  assessment_date?: string;
  dimension_scores?: Record<MaturityDimensionName, MaturityStage>;
  evidence?: string;
  improvement_plan?: string;
  target_stage?: MaturityStage | null;
  target_date?: string | null;
  status?: AssessmentStatus;
}

// Progress Item Interface
export interface MaturityProgressItem {
  id: string;
  assessment_id: string;
  action_item: string;
  dimension: MaturityDimensionName;
  target_stage: MaturityStage;
  status: ProgressStatus;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at?: string;

  // Joined relations
  assessment?: MaturityAssessment;
  assignee?: {
    id: string;
    full_name: string;
  } | null;
}

export interface CreateMaturityProgressItemDto {
  assessment_id: string;
  action_item: string;
  dimension: MaturityDimensionName;
  target_stage: MaturityStage;
  due_date?: string;
  notes?: string;
  assigned_to?: string;
}

export interface UpdateMaturityProgressItemDto {
  action_item?: string;
  dimension?: MaturityDimensionName;
  target_stage?: MaturityStage;
  status?: ProgressStatus;
  due_date?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
}

// Filter Interfaces
export interface MaturityAssessmentFilters {
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  department_id?: string;
  status?: AssessmentStatus;
  date_from?: string;
  date_to?: string;
  assessor_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface MaturityProgressFilters {
  assessment_id?: string;
  dimension?: MaturityDimensionName;
  status?: ProgressStatus;
  assigned_to?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

// List Response Interfaces
export interface MaturityAssessmentListResponse {
  data: MaturityAssessment[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface MaturityProgressListResponse {
  data: MaturityProgressItem[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Dashboard Data Interface
export interface MaturityDashboardData {
  institution_overall: MaturityStage;
  by_department: Record<string, MaturityStage>;
  by_dimension: Record<MaturityDimensionName, number>; // Average across assessments
  trend: {
    date: string;
    stage: number;
    department?: string;
  }[];
  improvement_items: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    blocked: number;
    overdue: number;
  };
  latest_assessments: MaturityAssessment[];
}

// Radar Chart Data
export interface RadarChartDataPoint {
  dimension: MaturityDimensionName;
  score: MaturityStage;
  target?: MaturityStage;
}

export interface RadarChartData {
  current: RadarChartDataPoint[];
  previous?: RadarChartDataPoint[];
  target?: RadarChartDataPoint[];
}

// Comparison Data for departments
export interface DepartmentComparisonData {
  department_id: string;
  department_name: string;
  overall_stage: MaturityStage;
  dimension_scores: Record<MaturityDimensionName, MaturityStage>;
  assessment_date: string;
}

// Evidence Document
export interface MaturityEvidence {
  id: string;
  assessment_id: string;
  dimension: MaturityDimensionName;
  title: string;
  description?: string;
  file_url?: string;
  file_type?: string;
  created_at: string;
  created_by?: string;
}

export interface CreateMaturityEvidenceDto {
  assessment_id: string;
  dimension: MaturityDimensionName;
  title: string;
  description?: string;
  file_url?: string;
  file_type?: string;
}
