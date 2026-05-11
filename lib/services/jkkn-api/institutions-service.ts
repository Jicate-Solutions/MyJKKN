import type {
  JkknInstitution,
  JkknInstitutionFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/institutions';

export class JkknInstitutionsService {
  /**
   * Fetches institutions from the local proxy route (/api/jkkn/institutions),
   * which in turn calls the JKKN API with the server-side API key.
   */
  static async getInstitutions(
    filters: JkknInstitutionFilters = {}
  ): Promise<JkknPaginatedResponse<JkknInstitution>> {
    const { page = 1, limit = 20, search } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search?.trim()) params.set('search', search.trim());

    const res = await fetch(`/api/jkkn/institutions?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknInstitution>>;
  }
}
