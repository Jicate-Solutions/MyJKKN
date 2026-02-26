import type { JkknBaseFilters, JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

/** Nested institution summary embedded in program responses. */
export interface JkknProgramInstitution {
  id: string;
  name: string;
  counselling_code: string | null;
}

/** Nested degree summary embedded in program responses. */
export interface JkknProgramDegree {
  id: string;
  degree_id: string | null;
  degree_name: string;
}

/** Nested department summary embedded in program responses. */
export interface JkknProgramDepartment {
  id: string;
  department_name: string;
  department_code: string | null;
}

export interface JkknProgram {
  id: string;
  /** Human-readable program code (e.g. "B.E-CSE", "MBA-FIN") — distinct from the UUID `id` */
  program_id: string | null;
  program_name: string;
  institution_id: string | null;
  department_id: string | null;
  degree_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Nested — present in list and detail responses */
  institution: JkknProgramInstitution | null;
  degree: JkknProgramDegree | null;
  department: JkknProgramDepartment | null;
}

export interface JkknProgramFilters extends JkknBaseFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  isActive?: boolean;
}

/**
 * Raw upstream response from /programs — normalised by the route handler
 * to JkknPaginatedResponse<JkknProgram>.
 */
export interface JkknProgramUpstreamResponse {
  count: number;
  data: JkknProgram[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}
