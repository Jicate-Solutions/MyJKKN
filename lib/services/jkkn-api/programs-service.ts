import type {
  JkknProgram,
  JkknProgramFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/programs';

export class JkknProgramsService {
  /**
   * Calls the local proxy route (/api/jkkn/programs), which forwards
   * the request to the JKKN central API with the server-side API key.
   */
  static async getPrograms(
    filters: JkknProgramFilters = {}
  ): Promise<JkknPaginatedResponse<JkknProgram>> {
    const { page = 1, limit = 20, search, institution_id, degree_id, department_id, isActive } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search?.trim()) params.set('search', search.trim());
    if (institution_id) params.set('institution_id', institution_id);
    if (degree_id) params.set('degree_id', degree_id);
    if (department_id) params.set('department_id', department_id);
    if (isActive !== undefined) params.set('isActive', String(isActive));

    const res = await fetch(`/api/jkkn/programs?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknProgram>>;
  }
}
