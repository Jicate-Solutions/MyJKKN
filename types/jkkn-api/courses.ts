import type { JkknPaginatedResponse } from './common';

export type { JkknPaginatedResponse };

export interface JkknCourse {
  id: string;
  course_code: string | null;
  course_name: string;
  /** Credit hours for this course */
  credits: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Raw upstream response from /courses — uses a different pagination envelope
 * than all other JKKN endpoints. The route handler normalises this to
 * JkknPaginatedResponse<JkknCourse> so the rest of the stack is uniform.
 */
export interface JkknCourseUpstreamResponse {
  count: number;
  data: JkknCourse[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}

/**
 * NOTE: The courses endpoint does NOT support a `search` query param.
 * Default limit is 50 (max 200).
 */
export interface JkknCourseFilters {
  page?: number;
  limit?: number;
  is_active?: boolean;
}
