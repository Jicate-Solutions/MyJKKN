import type { JkknBaseFilters, JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

export interface JkknLearner {
  id: string;                    // JKKN UUID → stored in original_student_id
  application_id?: string | null;
  first_name: string;
  last_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  student_email?: string | null;
  student_mobile?: string | null;
  college_email?: string | null;
  roll_number?: string | null;
  register_number?: string | null;
  lifecycle_status?: string | null;
  is_profile_complete?: boolean | null;
  institution_id?: string | null;
  degree_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  academic_year_id?: string | null;
  regulation_id?: string | null;
  batch_id?: string | null;
  is_active?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Raw upstream response from /api-management/learners/profiles — uses the same
 * pagination envelope as all other JKKN org endpoints. The route handler
 * normalises this to JkknPaginatedResponse<JkknLearner>.
 */
export interface JkknLearnerUpstreamResponse {
  count: number;
  data: JkknLearner[];
  pagination: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
  };
}

export interface JkknLearnerFilters extends JkknBaseFilters {
  institution_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  lifecycle_status?: string;
  isActive?: boolean;
}
