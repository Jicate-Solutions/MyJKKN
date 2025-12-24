import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/types/auth';
import { OrganizationStats } from '@/types/organizations';

export class DashboardService {
  private static async getUserAccessibleInstitutionIds(
    supabase: SupabaseClient,
    userId: string
  ): Promise<string[]> {
    const { data, error } = await supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user institution access:', error);
      return [];
    }
    return data.map((item) => item.institution_id);
  }

  static async getOrganizationStats(
    supabase: SupabaseClient,
    user: Profile,
    institutionId?: string | null
  ): Promise<OrganizationStats> {
    const userId = user.id;
    const isSuperAdmin = user.role === 'super_admin';

    let filterInstitutionIds: string[] | null = null;

    if (institutionId) {
      // If a specific institution is selected, that's our filter.
      filterInstitutionIds = [institutionId];
    } else if (!isSuperAdmin) {
      // If no institution is selected AND the user is not a super admin,
      // the filter should be the list of institutions they have access to.
      filterInstitutionIds = await this.getUserAccessibleInstitutionIds(
        supabase,
        userId
      );
      if (filterInstitutionIds.length === 0) {
        // If they have access to zero institutions, return zero stats.
        return {
          institutionCount: 0,
          degreeCount: 0,
          departmentCount: 0,
          programCount: 0,
          courseCount: 0,
          semesterCount: 0,
          sectionCount: 0,
          courseMappingCount: 0,
          programsByDegree: [],
          coursesByDepartment: [],
          recentAdditions: []
        };
      }
    }
    // If no institution is selected AND the user IS a super admin,
    // filterInstitutionIds remains null, meaning "no filter / all institutions".

    const createQuery = (table: string) => {
      let query = (supabase as any).from(table).select('id', {
        count: 'exact',
        head: true
      });
      // If we have a filter, apply it.
      if (filterInstitutionIds) {
        query = query.in('institution_id', filterInstitutionIds);
      }
      return query;
    };

    const rpcParams = {
      inst_ids: filterInstitutionIds
    };

    // Special handling for institution count
    const institutionCountPromise = () => {
      if (filterInstitutionIds) {
        return Promise.resolve({
          count: filterInstitutionIds.length,
          error: null
        });
      }
      return supabase
        .from('institutions')
        .select('id', { count: 'exact', head: true });
    };

    const [
      institutionCount,
      degreeCount,
      departmentCount,
      programCount,
      courseCount,
      semesterCount,
      sectionCount,
      courseMappingCount,
      programsByDegreeData,
      coursesByDepartmentData,
      recentInstitutions,
      recentDegrees,
      recentDepartments
    ] = await Promise.all([
      institutionCountPromise(),
      createQuery('degrees'),
      createQuery('departments'),
      createQuery('programs'),
      createQuery('courses'),
      createQuery('semesters'),
      createQuery('sections'),
      createQuery('course_mappings'),
      supabase.rpc('get_programs_by_degree_count', rpcParams),
      supabase.rpc('get_courses_by_department_count', rpcParams),
      supabase
        .from('institutions')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('degrees')
        .select('id, degree_name, created_at')
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('departments')
        .select('id, department_name, created_at')
        .order('created_at', { ascending: false })
        .limit(3)
    ]);

    const recentAdditions = [
      ...(recentInstitutions.data || []).map((i) => ({
        ...i,
        type: 'Institution'
      })),
      ...(recentDegrees.data || []).map((d) => ({
        ...d,
        name: d.degree_name,
        type: 'Degree'
      })),
      ...(recentDepartments.data || []).map((d) => ({
        ...d,
        name: d.department_name,
        type: 'Department'
      }))
    ]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 5);

    return {
      institutionCount: institutionCount.count ?? 0,
      degreeCount: degreeCount.count ?? 0,
      departmentCount: departmentCount.count ?? 0,
      programCount: programCount.count ?? 0,
      courseCount: courseCount.count ?? 0,
      semesterCount: semesterCount.count ?? 0,
      sectionCount: sectionCount.count ?? 0,
      courseMappingCount: courseMappingCount.count ?? 0,
      programsByDegree: programsByDegreeData.data || [],
      coursesByDepartment: coursesByDepartmentData.data || [],
      recentAdditions
    };
  }
}
