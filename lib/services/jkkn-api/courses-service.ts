import type {
  JkknCourse,
  JkknCourseFilters,
  JkknPaginatedResponse,
} from '@/types/jkkn-api/courses';

export class JkknCoursesService {
  /**
   * Calls the local proxy route (/api/jkkn/courses), which normalises the
   * upstream { count, data, pagination } envelope to JkknPaginatedResponse.
   *
   * NOTE: The courses endpoint does NOT support search. Default limit is 50.
   */
  static async getCourses(
    filters: JkknCourseFilters = {}
  ): Promise<JkknPaginatedResponse<JkknCourse>> {
    const { page = 1, limit = 50, is_active } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (is_active !== undefined) params.set('is_active', String(is_active));

    const res = await fetch(`/api/jkkn/courses?${params}`);

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(
        body?.error ?? `Request failed with status ${res.status}`
      );
    }

    return res.json() as Promise<JkknPaginatedResponse<JkknCourse>>;
  }
}
