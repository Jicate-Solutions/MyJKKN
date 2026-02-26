import type {
  JkknDepartment,
  JkknDepartmentFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/departments';

export class JkknDepartmentsService {
  /**
   * Calls the local proxy route (/api/jkkn/departments), which forwards
   * the request to the JKKN central API with the server-side API key.
   */
  static async getDepartments(
    filters: JkknDepartmentFilters = {}
  ): Promise<JkknPaginatedResponse<JkknDepartment>> {
    const { page = 1, limit = 20, search, institution_id, isActive } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search?.trim()) params.set('search', search.trim());
    if (institution_id) params.set('institution_id', institution_id);
    if (isActive !== undefined) params.set('isActive', String(isActive));

    const res = await fetch(`/api/jkkn/departments?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknDepartment>>;
  }
}
