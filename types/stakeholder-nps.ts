// Stakeholder NPS Types
// This file contains all TypeScript interfaces for the Stakeholder NPS module

// Enums and Union Types
export type StakeholderType = 'parent' | 'learner' | 'alumni' | 'industry' | 'staff';
export type NPSCategory = 'promoter' | 'passive' | 'detractor';
export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived';
export type QuestionType = 'nps' | 'text' | 'rating' | 'multiple_choice' | 'yes_no';

// Survey Question Interface
export interface NPSQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required: boolean;
  options?: string[];
  min_value?: number;
  max_value?: number;
}

// NPS Survey Interface
export interface NPSSurvey {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  stakeholder_type: StakeholderType;
  department_id: string | null;
  program_id: string | null;
  start_date: string;
  end_date: string;
  status: SurveyStatus;
  questions: NPSQuestion[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Related data (populated from joins)
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  creator?: {
    id: string;
    full_name: string;
    email: string;
  };
  response_count?: number;
}

// NPS Response Interface
export interface NPSResponse {
  id: string;
  survey_id: string;
  respondent_id: string | null;
  respondent_type: StakeholderType;
  respondent_email: string | null;
  respondent_name: string | null;
  nps_score: number;
  nps_category: NPSCategory;
  additional_feedback: string | null;
  question_responses: Record<string, unknown>;
  department_id: string | null;
  submitted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  // Related data (populated from joins)
  survey?: NPSSurvey;
  department?: {
    id: string;
    department_name: string;
  };
}

// NPS Analytics Interface
export interface NPSAnalytics {
  id: string;
  institution_id: string;
  survey_id: string | null;
  stakeholder_type: StakeholderType;
  department_id: string | null;
  period_start: string;
  period_end: string;
  total_responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps_score: number;
  calculated_at: string;
  // Related data
  department?: {
    id: string;
    department_name: string;
  };
}

// Dashboard Data Interface
export interface NPSDashboardData {
  overall_nps: number;
  total_responses: number;
  response_rate: number;
  by_stakeholder: Record<StakeholderType, {
    score: number;
    responses: number;
    promoters: number;
    passives: number;
    detractors: number;
  }>;
  by_department: Record<string, {
    name: string;
    score: number;
    responses: number;
  }>;
  trend: {
    period: string;
    score: number;
    responses: number;
  }[];
  recent_feedback: {
    id: string;
    score: number;
    category: NPSCategory;
    feedback: string;
    stakeholder_type: StakeholderType;
    submitted_at: string;
  }[];
}

// Stakeholder Info for Display
export const STAKEHOLDER_INFO: Record<StakeholderType, {
  label: string;
  description: string;
  frequency: string;
  trigger: string;
}> = {
  parent: {
    label: 'Parents',
    description: 'Parents and guardians of current students',
    frequency: 'Semester-end',
    trigger: 'After each semester'
  },
  learner: {
    label: 'Learners',
    description: 'Current students enrolled in programs',
    frequency: 'Semester-end',
    trigger: 'After each semester'
  },
  alumni: {
    label: 'Alumni',
    description: 'Graduated students',
    frequency: 'Annual',
    trigger: 'Annual campaign'
  },
  industry: {
    label: 'Industry Partners',
    description: 'Placement partners and recruiters',
    frequency: 'Post-placement',
    trigger: 'After placement cycle'
  },
  staff: {
    label: 'Staff',
    description: 'Faculty and administrative staff',
    frequency: 'Annual',
    trigger: 'Annual review'
  }
};

// DTOs for Create/Update Operations
export interface CreateSurveyDto {
  institution_id: string;
  title: string;
  description?: string;
  stakeholder_type: StakeholderType;
  department_id?: string;
  program_id?: string;
  start_date: string;
  end_date: string;
  questions: NPSQuestion[];
}

export interface UpdateSurveyDto {
  title?: string;
  description?: string;
  department_id?: string;
  program_id?: string;
  start_date?: string;
  end_date?: string;
  status?: SurveyStatus;
  questions?: NPSQuestion[];
}

export interface SubmitResponseDto {
  survey_id: string;
  respondent_id?: string;
  respondent_type: StakeholderType;
  respondent_email?: string;
  respondent_name?: string;
  nps_score: number;
  additional_feedback?: string;
  question_responses?: Record<string, unknown>;
  department_id?: string;
}

// Filter Interfaces
export interface SurveyFilters {
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  stakeholder_type?: StakeholderType;
  status?: SurveyStatus;
  department_id?: string;
  program_id?: string;
  search?: string;
  start_date_from?: string;
  start_date_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface ResponseFilters {
  survey_id?: string;
  nps_category?: NPSCategory;
  department_id?: string;
  respondent_type?: StakeholderType;
  submitted_from?: string;
  submitted_to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface AnalyticsFilters {
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  stakeholder_type?: StakeholderType;
  department_id?: string;
  period_start?: string;
  period_end?: string;
}

// Response Types for List Operations
export interface SurveyListResponse {
  data: NPSSurvey[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ResponseListResponse {
  data: NPSResponse[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Export Report Interface
export interface NPSExportData {
  surveys: NPSSurvey[];
  responses: NPSResponse[];
  analytics: NPSAnalytics[];
  generated_at: string;
  filters_applied: AnalyticsFilters;
}

// Category Color Mapping
export const NPS_CATEGORY_COLORS: Record<NPSCategory, {
  bg: string;
  text: string;
  border: string;
}> = {
  promoter: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-500'
  },
  passive: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-500'
  },
  detractor: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-500'
  }
};

// Status Color Mapping
export const SURVEY_STATUS_COLORS: Record<SurveyStatus, {
  bg: string;
  text: string;
}> = {
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-800'
  },
  active: {
    bg: 'bg-green-100',
    text: 'text-green-800'
  },
  closed: {
    bg: 'bg-blue-100',
    text: 'text-blue-800'
  },
  archived: {
    bg: 'bg-orange-100',
    text: 'text-orange-800'
  }
};

// Helper function to calculate NPS category from score
export function getNPSCategory(score: number): NPSCategory {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

// Helper function to calculate NPS score from counts
export function calculateNPSScore(promoters: number, passives: number, detractors: number): number {
  const total = promoters + passives + detractors;
  if (total === 0) return 0;
  return Math.round(((promoters - detractors) / total) * 100);
}
