import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface SchoolDefaultsRecord {
  school_id: string;
  school_name: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
  created_at: string | null;
}

export interface SchoolDefaultsStats {
  total: number;
  configured: number;
  missing: number;
}

/**
 * Service for querying and managing school default records
 * (K-12 Program degree and Academic department assignments)
 */
export class SchoolDefaultsAdminService {
  /**
   * Get all schools with their K-12 Program degree/department assignments
   */
  static async getSchoolDefaults(): Promise<SchoolDefaultsRecord[]> {
    const supabase = createClientSupabaseClient();

    const { data, error } = await supabase
      .from('institutions')
      .select(
        `
        id,
        institution_name,
        degrees!left (
          id,
          degree_name,
          degree_code,
          created_at,
          departments!left (
            id,
            department_name,
            department_code
          )
        ),
        learners_profiles!left (
          id
        )
      `
      )
      .eq('entity_type', 'school')
      .order('institution_name');

    if (error) {
      throw new Error(`Failed to fetch school defaults: ${error.message}`);
    }

    return (data || []).map((school: any) => {
      const k12Degree = school.degrees?.find((d: any) => d.degree_code === 'K12');
      const acadDept = k12Degree?.departments?.find((d: any) => d.department_code === 'ACAD');

      return {
        school_id: school.id,
        school_name: school.institution_name,
        degree_id: k12Degree?.id || null,
        degree_name: k12Degree?.degree_name || null,
        degree_code: k12Degree?.degree_code || null,
        department_id: acadDept?.id || null,
        department_name: acadDept?.department_name || null,
        department_code: acadDept?.department_code || null,
        learner_count: school.learners_profiles?.length || 0,
        created_at: k12Degree?.created_at || null,
      };
    });
  }

  /**
   * Get count statistics of schools with vs. without defaults
   */
  static async getDefaultsStats(): Promise<SchoolDefaultsStats> {
    const records = await this.getSchoolDefaults();

    return {
      total: records.length,
      configured: records.filter(r => !!r.degree_id).length,
      missing: records.filter(r => !r.degree_id).length,
    };
  }

  /**
   * Get a specific school's default assignments
   */
  static async getSchoolDefault(schoolId: string): Promise<SchoolDefaultsRecord | null> {
    const records = await this.getSchoolDefaults();
    return records.find(r => r.school_id === schoolId) || null;
  }

  /**
   * Check if a school has all required defaults (degree + department)
   */
  static async hasAllDefaults(schoolId: string): Promise<boolean> {
    const record = await this.getSchoolDefault(schoolId);
    return !!record && !!record.degree_id && !!record.department_id;
  }
}
