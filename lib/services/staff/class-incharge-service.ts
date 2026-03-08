// lib/services/staff/class-incharge-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ClassIncharge,
  ClassInchargeFilters,
  AssignInchargeDto,
  SectionWithIncharges,
  SectionWithInchargesResponse,
} from '@/types/staff';

export class ClassInchargeService {
  private static supabase = createClientSupabaseClient();

  /**
   * Fetch sections with their class incharges embedded.
   * Uses sections as the primary table so sections with no incharges still appear.
   */
  static async getSectionsWithIncharges(
    filters: ClassInchargeFilters = {}
  ): Promise<SectionWithInchargesResponse> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      let query = this.supabase
        .from('sections')
        .select(
          `
          id,
          section_name,
          institution_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          is_active,
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name, semester_code),
          class_incharges(
            id,
            staff_id,
            section_id,
            institution_id,
            is_active,
            created_at,
            updated_at,
            staff:staff(id, first_name, last_name, designation, profile_picture)
          )
        `,
          { count: 'estimated' }
        )
        .eq('is_active', true);

      // Apply institution filter first (reduces dataset, improves RLS performance)
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
      if (filters.section_id) {
        query = query.eq('id', filters.section_id);
      }

      query = query
        .order('section_name', { ascending: true })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count || 0;

      return {
        data: (data as SectionWithIncharges[]) || [],
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('[class-incharge-service] Error fetching sections with incharges:', error);
      throw error;
    }
  }

  /**
   * Fetch all class incharges for a specific section (used in the manage dialog).
   */
  static async getInchargesBySection(sectionId: string): Promise<ClassIncharge[]> {
    try {
      const { data, error } = await this.supabase
        .from('class_incharges')
        .select(
          `
          id,
          staff_id,
          section_id,
          institution_id,
          is_active,
          created_at,
          updated_at,
          staff:staff(id, first_name, last_name, designation, profile_picture)
        `
        )
        .eq('section_id', sectionId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data as ClassIncharge[]) || [];
    } catch (error) {
      console.error('[class-incharge-service] Error fetching incharges by section:', error);
      throw error;
    }
  }

  /**
   * Assign a staff member as class incharge for a section.
   */
  static async assignIncharge(dto: AssignInchargeDto): Promise<ClassIncharge> {
    try {
      const { data, error } = await this.supabase
        .from('class_incharges')
        .insert({
          institution_id: dto.institution_id,
          section_id: dto.section_id,
          staff_id: dto.staff_id,
          is_active: true,
        })
        .select(
          `
          id,
          staff_id,
          section_id,
          institution_id,
          is_active,
          created_at,
          updated_at,
          staff:staff(id, first_name, last_name, designation, profile_picture)
        `
        )
        .single();

      if (error) {
        // Unique constraint violation — staff already assigned to this section
        if (error.code === '23505') {
          throw new Error('This staff member is already assigned as class incharge for this section.');
        }
        throw error;
      }

      return data as ClassIncharge;
    } catch (error) {
      console.error('[class-incharge-service] Error assigning incharge:', error);
      throw error;
    }
  }

  /**
   * Remove a class incharge assignment by its ID.
   */
  static async removeIncharge(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('class_incharges')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[class-incharge-service] Error removing incharge:', error);
      throw error;
    }
  }
}
