import type {
  JkknDegree,
  JkknDegreeFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/degrees';

export class JkknDegreesService {
  static async getDegrees(
    filters: JkknDegreeFilters = {}
  ): Promise<JkknPaginatedResponse<JkknDegree>> {
    const { page = 1, limit = 20, search, institution_id, degree_type, isActive } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search?.trim()) params.set('search', search.trim());
    if (institution_id) params.set('institution_id', institution_id);
    if (degree_type) params.set('degree_type', degree_type);
    if (isActive !== undefined) params.set('isActive', String(isActive));

    const res = await fetch(`/api/jkkn/degrees?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknDegree>>;
  }
}
