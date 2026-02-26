import type { JkknBaseFilters, JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

/** Nested institution summary embedded in department responses. */
export interface JkknDeptInstitution {
  id: string;
  name: string;
  counselling_code: string | null;
}

/** Nested degree summary embedded in department responses. */
export interface JkknDeptDegree {
  id: string;
  degree_id: string | null;
  degree_name: string;
}

export interface JkknDepartment {
  id: string;
  institution_id: string | null;
  degree_id: string | null;
  department_code: string | null;
  department_name: string;
  /** Longer descriptive name, e.g. "Department of Computer Science & Engineering" */
  display_name: string | null;
  /** Custom sort order independent of alphabetical ordering */
  department_order: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Nested — always present in list and detail responses */
  institution: JkknDeptInstitution | null;
  degree: JkknDeptDegree | null;
}

export interface JkknDepartmentFilters extends JkknBaseFilters {
  institution_id?: string;
  isActive?: boolean;
}

/**
 * Raw upstream response from /departments — normalised by the route handler
 * to JkknPaginatedResponse<JkknDepartment>.
 */
export interface JkknDepartmentUpstreamResponse {
  count: number;
  data: JkknDepartment[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}
