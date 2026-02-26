import type { JkknBaseFilters, JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

/** Nested institution summary embedded in degree responses. */
export interface JkknDegreeInstitution {
  id: string;
  name: string;
  counselling_code: string | null;
}

export interface JkknDegree {
  id: string;
  /** Human-readable code (e.g. "B.E", "MBA") — distinct from the UUID `id` */
  degree_id: string | null;
  degree_name: string;
  /** Full display name, e.g. "Bachelor of Engineering" */
  display_name: string | null;
  /** 'ug' = undergraduate, 'pg' = postgraduate */
  degree_type: 'ug' | 'pg' | null;
  /** Custom sort order independent of alphabetical ordering */
  degree_order: number | null;
  institution_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Nested — present in list and detail responses */
  institution: JkknDegreeInstitution | null;
}

export interface JkknDegreeFilters extends JkknBaseFilters {
  institution_id?: string;
  degree_type?: 'ug' | 'pg';
  isActive?: boolean;
}

/**
 * Raw upstream response from /degrees — normalised by the route handler
 * to JkknPaginatedResponse<JkknDegree>.
 */
export interface JkknDegreeUpstreamResponse {
  count: number;
  data: JkknDegree[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}
