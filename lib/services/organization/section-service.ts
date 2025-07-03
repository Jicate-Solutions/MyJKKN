import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Section,
  CreateSectionDto,
  UpdateSectionDto,
  SectionFilters,
  SectionListResponse
} from '@/types/organizations';

export class SectionService {
  private static supabase = createClientSupabaseClient();

  static async checkSectionExists(
    institutionId: string,
    degreeId: string,
    departmentId: string,
    programId: string,
    semesterId: string,
    sectionName: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('sections')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('degree_id', degreeId)
        .eq('department_id', departmentId)
        .eq('program_id', programId)
        .eq('semester_id', semesterId)
        .eq('section_name', sectionName);

      // Exclude current section when updating
      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is what we want
        throw error;
      }

      return !!data; // Returns true if section exists, false if not
    } catch (error) {
      console.error('Error checking section existence:', error);
      // Return false on error to allow the create operation to proceed
      // The database constraint will catch any actual conflicts
      return false;
    }
  }

  static async createSection(data: CreateSectionDto): Promise<Section> {
    try {
      const { data: section, error } = await this.supabase
        .from('sections')
        .insert([data])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Handle unique constraint violations with specific context
          const errorMessage = error.message || '';

          if (errorMessage.includes('sections_unique_per_semester')) {
            throw new Error(
              `Section name "${data.section_name}" already exists in this semester. Please choose a different name or check if the section already exists in the selected semester.`
            );
          } else if (errorMessage.includes('sections_section_name_key')) {
            // Legacy global constraint (if still exists)
            throw new Error(
              `Section name "${data.section_name}" already exists in the system. Please choose a different name.`
            );
          } else if (
            errorMessage.includes('sections_institution_section_name_unique')
          ) {
            // Legacy institution-level constraint (if still exists)
            throw new Error(
              `Section name "${data.section_name}" already exists in this institution. Please choose a different name.`
            );
          } else {
            // Generic constraint violation
            throw new Error(
              `Section "${data.section_name}" cannot be created due to a constraint violation. Please check if this section already exists in the selected context.`
            );
          }
        }

        // Handle foreign key constraint violations
        if (error.code === '23503') {
          throw new Error(
            'Invalid reference data provided. Please ensure all selected institution, degree, department, program, and semester exist and are active.'
          );
        }

        // Handle other database errors
        throw new Error(`Database error: ${error.message}`);
      }

      return section;
    } catch (error) {
      console.error('Error creating section:', error);
      // Re-throw the error to be handled by the UI
      throw error;
    }
  }

  static async updateSection(
    id: string,
    data: UpdateSectionDto
  ): Promise<Section> {
    try {
      const { data: section, error } = await this.supabase
        .from('sections')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Section updated successfully');
      return section;
    } catch (error) {
      console.error('Error updating section:', error);
      throw error;
    }
  }

  static async deleteSection(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('sections')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting section:', error);
      throw error;
    }
  }

  static async getSections(
    filters: SectionFilters = {}
  ): Promise<SectionListResponse> {
    try {
      let query = this.supabase.from('sections').select(
        `
          *,
          institution:institutions!institution_id(
            id,
            name,
            counselling_code
          ),
          degree:degrees!degree_id(
            id,
            degree_name
          ),
          department:departments!department_id(
            id,
            department_name
          ),
          program:programs!program_id(
            id,
            program_name
          ),
          semester:semesters!semester_id(
            id,
            semester_name,
            semester_code
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(`section_name.ilike.%${filters.search}%`);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: sections, error, count } = await query;

      if (error) throw error;

      return {
        data: sections || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching sections:', error);
      throw error;
    }
  }

  static async getSection(id: string): Promise<Section> {
    try {
      const { data: section, error } = await this.supabase
        .from('sections')
        .select(
          `
          *,
          institution:institutions!institution_id(
            id,
            name,
            counselling_code
          ),
          degree:degrees!degree_id(
            id,
            degree_name
          ),
          department:departments!department_id(
            id,
            department_name
          ),
          program:programs!program_id(
            id,
            program_name
          ),
          semester:semesters!semester_id(
            id,
            semester_name,
            semester_code
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return section;
    } catch (error) {
      console.error('Error fetching section:', error);
      throw error;
    }
  }

  static async getSectionsBySemester(semesterId: string): Promise<Section[]> {
    try {
      const { data: sections, error } = await this.supabase
        .from('sections')
        .select(
          `
          *,
          institution:institutions!institution_id(
            id,
            name,
            counselling_code
          ),
          degree:degrees!degree_id(
            id,
            degree_name
          ),
          department:departments!department_id(
            id,
            department_name
          ),
          program:programs!program_id(
            id,
            program_name
          ),
          semester:semesters!semester_id(
            id,
            semester_name,
            semester_code
          )
        `
        )
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return sections || [];
    } catch (error) {
      console.error('Error fetching sections by semester:', error);
      throw error;
    }
  }

  static async getSectionsBySemesterAndInstitution(
    semesterId: string,
    institutionId: string
  ): Promise<Section[]> {
    try {
      const { data: sections, error } = await this.supabase
        .from('sections')
        .select(
          `
          *,
          institution:institutions!institution_id(
            id,
            name,
            counselling_code
          ),
          degree:degrees!degree_id(
            id,
            degree_name
          ),
          department:departments!department_id(
            id,
            department_name
          ),
          program:programs!program_id(
            id,
            program_name
          ),
          semester:semesters!semester_id(
            id,
            semester_name,
            semester_code
          )
        `
        )
        .eq('semester_id', semesterId)
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return sections || [];
    } catch (error) {
      console.error(
        'Error fetching sections by semester and institution:',
        error
      );
      throw error;
    }
  }

  static async getSectionsByInstitution(
    institutionId: string
  ): Promise<Section[]> {
    try {
      const { data: sections, error } = await this.supabase
        .from('sections')
        .select(
          `
          *,
          institution:institutions!institution_id(
            id,
            name,
            counselling_code
          ),
          degree:degrees!degree_id(
            id,
            degree_name
          ),
          department:departments!department_id(
            id,
            department_name
          ),
          program:programs!program_id(
            id,
            program_name
          ),
          semester:semesters!semester_id(
            id,
            semester_name,
            semester_code
          )
        `
        )
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return sections || [];
    } catch (error) {
      console.error('Error fetching sections by institution:', error);
      throw error;
    }
  }

  // Add new methods for getting sections by various hierarchy levels
  static async getSectionsByProgram(programId: string): Promise<Section[]> {
    try {
      const { data: sections, error } = await this.supabase
        .from('sections')
        .select(
          `
          *,
          institution:institutions!institution_id(
            id,
            name,
            counselling_code
          ),
          degree:degrees!degree_id(
            id,
            degree_name
          ),
          department:departments!department_id(
            id,
            department_name
          ),
          program:programs!program_id(
            id,
            program_name
          ),
          semester:semesters!semester_id(
            id,
            semester_name,
            semester_code
          )
        `
        )
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return sections || [];
    } catch (error) {
      console.error('Error fetching sections by program:', error);
      throw error;
    }
  }

  static async getSectionsByDepartment(
    departmentId: string
  ): Promise<Section[]> {
    try {
      const { data: sections, error } = await this.supabase
        .from('sections')
        .select(
          `
          *,
          institution:institutions!institution_id(
            id,
            name,
            counselling_code
          ),
          degree:degrees!degree_id(
            id,
            degree_name
          ),
          department:departments!department_id(
            id,
            department_name
          ),
          program:programs!program_id(
            id,
            program_name
          ),
          semester:semesters!semester_id(
            id,
            semester_name,
            semester_code
          )
        `
        )
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return sections || [];
    } catch (error) {
      console.error('Error fetching sections by department:', error);
      throw error;
    }
  }
}
