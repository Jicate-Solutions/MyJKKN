import type { JkknBaseFilters, JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

export interface JkknInstitution {
  id: string;
  name: string;
  counselling_code: string | null;
  /** Institution category (e.g. "engineering", "arts") — may be absent */
  category?: string | null;
  /** Institution type (e.g. "autonomous", "affiliated") — may be absent */
  institution_type?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Lightweight shape returned by /institutions/names — for dropdowns. */
export interface JkknInstitutionName {
  id: string;
  name: string;
}

/**
 * Raw upstream response from /institutions — uses the same pagination envelope
 * as all other JKKN org endpoints. The route handler normalises this to
 * JkknPaginatedResponse<JkknInstitution> so the rest of the stack is uniform.
 */
export interface JkknInstitutionUpstreamResponse {
  count: number;
  data: JkknInstitution[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}

export interface JkknInstitutionFilters extends JkknBaseFilters {
  isActive?: boolean;
}
