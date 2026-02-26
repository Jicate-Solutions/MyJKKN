import type { JkknBaseFilters, JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

/** Nested institution summary embedded in semester responses. */
export interface JkknSemesterInstitution {
  id: string;
  name: string;
  counselling_code: string | null;
}

/** Nested program summary embedded in semester responses. */
export interface JkknSemesterProgram {
  id: string;
  program_id: string | null;
  program_name: string;
}

export interface JkknSemester {
  id: string;
  /** Human-readable semester code (e.g. "SEM-1") */
  semester_id: string | null;
  semester_name: string;
  institution_id: string | null;
  program_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Nested — present in list and detail responses */
  institution: JkknSemesterInstitution | null;
  program: JkknSemesterProgram | null;
}

export interface JkknSemesterFilters extends JkknBaseFilters {
  institution_id?: string;
  program_id?: string;
  isActive?: boolean;
}

/**
 * Raw upstream response from /semesters — normalised by the route handler
 * to JkknPaginatedResponse<JkknSemester>.
 */
export interface JkknSemesterUpstreamResponse {
  count: number;
  data: JkknSemester[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}
