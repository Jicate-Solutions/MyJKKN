/**
 * Stakeholder NPS (Net Promoter Score) Types
 * F001 - TQM Module
 *
 * NPS Calculation:
 * NPS Score = % Promoters (9-10) - % Detractors (0-6)
 * Range: -100 to +100
 *
 * Segments:
 * - Promoters: Score 9-10 (Enthusiastic, will recommend)
 * - Passives: Score 7-8 (Satisfied but unenthusiastic)
 * - Detractors: Score 0-6 (Unhappy, may spread negative word-of-mouth)
 */

// ============================================
// Core Types
// ============================================

export type StakeholderType = 'student' | 'parent' | 'staff' | 'alumni' | 'learner' | 'industry' | 'employer' | 'community';
export type NPSScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type NPSSegment = 'promoter' | 'passive' | 'detractor';
export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived';
export type QuestionType = 'nps' | 'rating' | 'text' | 'multiple_choice' | 'yes_no';

// Survey question interface
export interface NPSQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required: boolean;
  options?: string[];
}

// Helper to determine segment from score
export function getNPSSegment(score: NPSScore): NPSSegment {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

// Helper to get segment color for UI
export function getNPSSegmentColor(segment: NPSSegment): string {
  switch (segment) {
    case 'promoter':
      return 'text-green-600';
    case 'passive':
      return 'text-yellow-600';
    case 'detractor':
      return 'text-red-600';
  }
}

// Helper to get NPS score color for UI
export function getNPSScoreColor(score: number): string {
  if (score >= 50) return 'text-green-600';
  if (score >= 0) return 'text-yellow-600';
  return 'text-red-600';
}

// ============================================
// Database Entities
// ============================================

export interface NPSSurvey {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  stakeholder_types: StakeholderType[];
  question: string;
  start_date: string;
  end_date: string;
  status: SurveyStatus;
  response_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface NPSResponse {
  id: string;
  survey_id: string;
  stakeholder_type: StakeholderType;
  stakeholder_id: string;
  stakeholder_email: string | null;
  stakeholder_name: string | null;
  score: NPSScore;
  feedback: string | null;
  sentiment: NPSSegment;
  created_at: string;
}

export interface NPSSurveyAnalytics {
  survey_id: string;
  institution_id: string;
  title: string;
  stakeholder_types: StakeholderType[];
  start_date: string;
  end_date: string;
  status: SurveyStatus;
  total_responses: number;
  promoter_count: number;
  passive_count: number;
  detractor_count: number;
  promoter_percentage: number;
  passive_percentage: number;
  detractor_percentage: number;
  nps_score: number;
  avg_score: number;
  responses_by_type: Record<StakeholderType, number>;
}

export interface NPSTrendData {
  institution_id: string;
  stakeholder_type: StakeholderType;
  month: string;
  response_count: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps_score: number;
  avg_score: number;
}

export interface CreateNPSSurveyDto {
  institution_id: string;
  title: string;
  description?: string;
  stakeholder_types: StakeholderType[];
  question?: string;
  start_date: string;
  end_date: string;
  status?: SurveyStatus;
}

export interface UpdateNPSSurveyDto {
  title?: string;
  description?: string;
  stakeholder_types?: StakeholderType[];
  question?: string;
  start_date?: string;
  end_date?: string;
  status?: SurveyStatus;
}

export interface SubmitNPSResponseDto {
  survey_id: string;
  stakeholder_type: StakeholderType;
  stakeholder_id: string;
  stakeholder_email?: string;
  stakeholder_name?: string;
  score: NPSScore;
  feedback?: string;
}

export interface NPSSurveyFilters {
  institution_id: string;
  status?: SurveyStatus | SurveyStatus[];
  stakeholder_type?: StakeholderType;
  department_id?: string;
  program_id?: string;
  start_date_from?: string;
  start_date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface NPSResponseFilters {
  survey_id?: string;
  institution_id?: string;
  stakeholder_type?: StakeholderType;
  sentiment?: NPSSegment;
  score_min?: NPSScore;
  score_max?: NPSScore;
  has_feedback?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface NPSAnalyticsFilters {
  institution_id: string;
  stakeholder_type?: StakeholderType;
  date_from?: string;
  date_to?: string;
  survey_id?: string;
}

export interface NPSSurveyListResponse {
  data: NPSSurvey[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface NPSResponseListResponse {
  data: NPSResponse[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface StakeholderNPSData {
  score: number;
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
}

export interface RecentFeedback {
  id: string;
  score: number;
  feedback: string;
  stakeholder_type: StakeholderType;
  submitted_at: string;
}

export interface NPSDashboardData {
  overall_nps: number;
  total_responses: number;
  by_stakeholder: Record<string, StakeholderNPSData>;
  recent_feedback?: RecentFeedback[];
}

export const STAKEHOLDER_TYPE_LABELS: Record<StakeholderType, string> = {
  student: 'Students',
  parent: 'Parents',
  staff: 'Staff',
  alumni: 'Alumni',
  learner: 'Learners',
  industry: 'Industry Partners',
  employer: 'Employers',
  community: 'Community'
};

export const NPS_SEGMENT_LABELS: Record<NPSSegment, string> = {
  promoter: 'Promoters',
  passive: 'Passives',
  detractor: 'Detractors'
};

export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived'
};

export const NPS_INTERPRETATION = [
  { min: 70, max: 100, label: 'World Class', description: 'Exceptional performance', color: 'text-green-700' },
  { min: 50, max: 69, label: 'Excellent', description: 'Strong performance', color: 'text-green-600' },
  { min: 30, max: 49, label: 'Great', description: 'Good performance', color: 'text-green-500' },
  { min: 0, max: 29, label: 'Good', description: 'Acceptable performance', color: 'text-yellow-600' },
  { min: -20, max: -1, label: 'Needs Improvement', description: 'Below expectations', color: 'text-orange-600' },
  { min: -100, max: -21, label: 'Critical', description: 'Urgent attention required', color: 'text-red-600' }
];

export function getNPSInterpretation(score: number): typeof NPS_INTERPRETATION[0] {
  return NPS_INTERPRETATION.find(
    (range) => score >= range.min && score <= range.max
  ) || NPS_INTERPRETATION[NPS_INTERPRETATION.length - 1];
}

// Aliases for backward compatibility
export type SurveyFilters = NPSSurveyFilters;
export type SurveyListResponse = NPSSurveyListResponse;
