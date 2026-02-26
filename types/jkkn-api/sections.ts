import type { JkknBaseFilters, JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

/** Nested institution summary embedded in section responses. */
export interface JkknSectionInstitution {
  id: string;
  name: string;
  counselling_code: string | null;
}

/** Nested program summary embedded in section responses. */
export interface JkknSectionProgram {
  id: string;
  program_id: string | null;
  program_name: string;
}

/** Nested semester summary embedded in section responses. */
export interface JkknSectionSemester {
  id: string;
  semester_id: string | null;
  semester_name: string;
}

export interface JkknSection {
  id: string;
  /** Human-readable section code (e.g. "A", "B") */
  section_id: string | null;
  section_name: string;
  institution_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Nested — present in list and detail responses */
  institution: JkknSectionInstitution | null;
  program: JkknSectionProgram | null;
  semester: JkknSectionSemester | null;
}

export interface JkknSectionFilters extends JkknBaseFilters {
  institution_id?: string;
  program_id?: string;
  semester_id?: string;
  isActive?: boolean;
}

/**
 * Raw upstream response from /sections — normalised by the route handler
 * to JkknPaginatedResponse<JkknSection>.
 */
export interface JkknSectionUpstreamResponse {
  count: number;
  data: JkknSection[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}
