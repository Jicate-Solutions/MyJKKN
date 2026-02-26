import type {
  JkknLearner,
  JkknLearnerFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/learners';

export class JkknLearnersService {
  /**
   * Fetches learner profiles from the local proxy route (/api/jkkn/learners),
   * which in turn calls the JKKN API with the server-side API key.
   */
  static async getLearners(
    filters: JkknLearnerFilters = {}
  ): Promise<JkknPaginatedResponse<JkknLearner>> {
    const {
      page = 1,
      limit = 50,
      search,
      institution_id,
      program_id,
      semester_id,
      section_id,
      lifecycle_status,
      isActive,
    } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search?.trim())         params.set('search', search.trim());
    if (institution_id)         params.set('institution_id', institution_id);
    if (program_id)             params.set('program_id', program_id);
    if (semester_id)            params.set('semester_id', semester_id);
    if (section_id)             params.set('section_id', section_id);
    if (lifecycle_status)       params.set('lifecycle_status', lifecycle_status);
    if (isActive !== undefined) params.set('isActive', String(isActive));

    const res = await fetch(`/api/jkkn/learners?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknLearner>>;
  }
}
