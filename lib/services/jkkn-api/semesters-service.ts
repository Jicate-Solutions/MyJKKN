import type {
  JkknSemester,
  JkknSemesterFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/semesters';

export class JkknSemestersService {
  static async getSemesters(
    filters: JkknSemesterFilters = {}
  ): Promise<JkknPaginatedResponse<JkknSemester>> {
    const { page = 1, limit = 20, search, institution_id, program_id, isActive } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search?.trim()) params.set('search', search.trim());
    if (institution_id) params.set('institution_id', institution_id);
    if (program_id) params.set('program_id', program_id);
    if (isActive !== undefined) params.set('isActive', String(isActive));

    const res = await fetch(`/api/jkkn/semesters?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknSemester>>;
  }
}
