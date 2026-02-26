import type {
  JkknSection,
  JkknSectionFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/sections';

export class JkknSectionsService {
  static async getSections(
    filters: JkknSectionFilters = {}
  ): Promise<JkknPaginatedResponse<JkknSection>> {
    const { page = 1, limit = 20, search, institution_id, program_id, semester_id, isActive } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search?.trim()) params.set('search', search.trim());
    if (institution_id) params.set('institution_id', institution_id);
    if (program_id) params.set('program_id', program_id);
    if (semester_id) params.set('semester_id', semester_id);
    if (isActive !== undefined) params.set('isActive', String(isActive));

    const res = await fetch(`/api/jkkn/sections?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknSection>>;
  }
}
