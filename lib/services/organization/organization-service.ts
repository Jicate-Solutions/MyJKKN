// lib/services/organization-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Institution,
  CreateInstitutionDto,
  UpdateInstitutionDto,
  InstitutionFilters,
  OrganizationListResponse
} from '@/types/organizations';
import { StorageService } from '@/lib/storage/storage-service';
import type { Database } from '@/types/database.types';

export class OrganizationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async checkCodeExists(
    counsellingCode: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('institutions')
        .select('id')
        .or(
          `counselling_code.eq.${counsellingCode.toUpperCase()},name.ilike.${counsellingCode}`
        );

      // If excludeId is provided (for editing), exclude that institution
      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking institution code/name:', error);
      return false;
    }
  }

  static async createInstitution(
    data: CreateInstitutionDto
  ): Promise<Institution> {
    try {
      // Prepare institution data for database insert
      const institutionData: Database['public']['Tables']['institutions']['Insert'] = {
        name: data.name,
        counselling_code: data.counselling_code,
        institution_type: data.institution_type,
        category: data.category,
        timetable_type: data.timetable_type,
        accredited_by: data.accredited_by,
        address_line1: data.address_line1,
        address_line2: data.address_line2,
        address_line3: data.address_line3,
        city: data.city,
        state: data.state,
        country: data.country,
        pin_code: data.pin_code,
        email: data.email,
        phone: data.phone,
        website: data.website,
        logo_url: data.logo_url,
        is_active: data.is_active
      };

      // First create the institution record
      const { data: institution, error: institutionError } = await ((this.supabase
        .from('institutions') as any)
        .insert(institutionData))
        .select()
        .single();

      if (institutionError) {
        if (institutionError.code === '23505') {
          throw new Error(
            `Institution code "${data.counselling_code}" already exists`
          );
        }
        throw institutionError;
      }

      // Only create department contacts if they exist and have data
      if (data.departments) {
        const departmentPromises = Object.entries(data.departments)
          .filter(([_, contact]) => contact && contact.contact_name) // Only process departments with data
          .map(([type, contact]) => {
            const deptData: Database['public']['Tables']['institution_departments']['Insert'] = {
              institution_id: institution.id,
              department_type: type,
              contact_name: contact.contact_name!,
              designation: contact.designation!,
              email: contact.email!,
              mobile: contact.mobile!
            };
            return ((this.supabase.from('institution_departments') as any).insert(deptData));
          });

        if (departmentPromises.length > 0) {
          await Promise.all(departmentPromises);
        }
      }

      return institution;
    } catch (error) {
      console.error('Error creating institution:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to create institution';
      toast.error(message);
      throw error;
    }
  }

  static async updateInstitution(
    id: string,
    data: UpdateInstitutionDto
  ): Promise<Institution> {
    try {
      // Prepare institution data for database update
      const institutionData: Database['public']['Tables']['institutions']['Update'] = {
        name: data.name,
        counselling_code: data.counselling_code,
        institution_type: data.institution_type,
        category: data.category,
        timetable_type: data.timetable_type,
        accredited_by: data.accredited_by,
        address_line1: data.address_line1,
        address_line2: data.address_line2,
        address_line3: data.address_line3,
        city: data.city,
        state: data.state,
        country: data.country,
        pin_code: data.pin_code,
        email: data.email,
        phone: data.phone,
        website: data.website,
        logo_url: data.logo_url,
        is_active: data.is_active,
        updated_at: new Date().toISOString()
      };

      // Update institution record
      const { data: institution, error: institutionError} = await ((this.supabase
        .from('institutions') as any)
        .update(institutionData))
        .eq('id', id)
        .select()
        .single();

      if (institutionError) throw institutionError;

      // Update department contacts if provided
      if (data.departments) {
        // First delete existing departments
        await this.supabase
          .from('institution_departments')
          .delete()
          .eq('institution_id', id);

        // Then create new ones if they have data
        const departmentPromises = Object.entries(data.departments)
          .filter(([_, contact]) => contact && contact.contact_name)
          .map(([type, contact]) => {
            const deptData: Database['public']['Tables']['institution_departments']['Insert'] = {
              institution_id: id,
              department_type: type,
              contact_name: contact.contact_name!,
              designation: contact.designation!,
              email: contact.email!,
              mobile: contact.mobile!
            };
            return ((this.supabase.from('institution_departments') as any).insert(deptData));
          });

        if (departmentPromises.length > 0) {
          await Promise.all(departmentPromises);
        }
      }

      return institution;
    } catch (error) {
      console.error('Error updating institution:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to update institution';
      toast.error(message);
      throw error;
    }
  }

  static async getInstitutionRelatedDataCount(id: string): Promise<{
    degrees: number;
    programs: number;
    departments: number;
    staff: number;
    students: number;
    bills: number;
    academic_years: number;
    sections: number;
    courses: number;
    timetables: number;
  }> {
    try {
      // Count related data
      const [
        degreesResult,
        programsResult,
        departmentsResult,
        staffResult,
        studentsResult,
        billsResult,
        academicYearsResult,
        sectionsResult,
        coursesResult,
        timetablesResult
      ] = await Promise.all([
        this.supabase.from('degrees').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('programs').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('departments').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('staff').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('learners_profiles').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('billing_student_bills').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('academic_years').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('sections').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('courses').select('id', { count: 'exact', head: true }).eq('institution_id', id),
        this.supabase.from('timetables').select('id', { count: 'exact', head: true }).eq('institution_id', id)
      ]);

      return {
        degrees: degreesResult.count || 0,
        programs: programsResult.count || 0,
        departments: departmentsResult.count || 0,
        staff: staffResult.count || 0,
        students: studentsResult.count || 0,
        bills: billsResult.count || 0,
        academic_years: academicYearsResult.count || 0,
        sections: sectionsResult.count || 0,
        courses: coursesResult.count || 0,
        timetables: timetablesResult.count || 0
      };
    } catch (error) {
      console.error('Error counting related data:', error);
      return {
        degrees: 0,
        programs: 0,
        departments: 0,
        staff: 0,
        students: 0,
        bills: 0,
        academic_years: 0,
        sections: 0,
        courses: 0,
        timetables: 0
      };
    }
  }

  static async deleteInstitutionWithCascade(id: string): Promise<void> {
    try {
      // Get institution logo URL first
      const { data: institution } = await this.supabase
        .from('institutions')
        .select('logo_url')
        .eq('id', id)
        .single() as { data: { logo_url: string | null } | null };

      // Delete the logo if exists
      if (institution?.logo_url) {
        await StorageService.deleteInstitutionLogo(id);
      }

      // Delete related data in order to handle foreign key constraints
      // Start with the most dependent tables and work backwards
      await Promise.all([
        this.supabase.from('billing_receipts').delete().eq('institution_id', id),
        this.supabase.from('billing_invoices').delete().eq('institution_id', id),
        this.supabase.from('student_attendance').delete().eq('institution_id', id),
        this.supabase.from('timetables').delete().eq('institution_id', id),
        this.supabase.from('staff_plans').delete().eq('institution_id', id),
        this.supabase.from('course_mappings').delete().eq('institution_id', id),
        this.supabase.from('user_activity_logs').delete().eq('institution_id', id),
        this.supabase.from('user_institution_access').delete().eq('institution_id', id),
        this.supabase.from('resources').delete().eq('institution_id', id),
        this.supabase.from('bug_reports').delete().eq('institution_id', id)
      ]);

      // Delete billing related data
      await Promise.all([
        this.supabase.from('billing_student_bills').delete().eq('institution_id', id),
        this.supabase.from('billing_sub_categories').delete().eq('institution_id', id),
        this.supabase.from('billing_item_categories').delete().eq('institution_id', id),
        this.supabase.from('billing_parent_categories').delete().eq('institution_id', id)
      ]);

      // Delete academic structure
      await Promise.all([
        this.supabase.from('learners_profiles').delete().eq('institution_id', id),
        this.supabase.from('learners_profiles').delete().eq('institution_id', id),
        this.supabase.from('staff').delete().eq('institution_id', id),
        this.supabase.from('sections').delete().eq('institution_id', id),
        this.supabase.from('semesters').delete().eq('institution_id', id),
        this.supabase.from('courses').delete().eq('institution_id', id),
        this.supabase.from('periods').delete().eq('institution_id', id)
      ]);

      // Delete programs and degrees
      await Promise.all([
        this.supabase.from('programs').delete().eq('institution_id', id),
        this.supabase.from('degrees').delete().eq('institution_id', id),
        this.supabase.from('departments').delete().eq('institution_id', id),
        this.supabase.from('academic_years').delete().eq('institution_id', id)
      ]);

      // Delete institution departments
      await this.supabase.from('institution_departments').delete().eq('institution_id', id);

      // Finally delete the institution itself
      const { error } = await this.supabase
        .from('institutions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return;
    } catch (error) {
      console.error('Error deleting institution with cascade:', error);
      throw error;
    }
  }

  static async deleteInstitution(id: string): Promise<void> {
    try {
      // Get institution logo URL first
      const { data: institution } = await this.supabase
        .from('institutions')
        .select('logo_url')
        .eq('id', id)
        .single() as { data: { logo_url: string | null } | null };

      // Delete the logo if exists
      if (institution?.logo_url) {
        await StorageService.deleteInstitutionLogo(id);
      }

      // Delete the institution (departments will be deleted via cascade)
      const { error } = await this.supabase
        .from('institutions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Return void explicitly
      return;
    } catch (error) {
      console.error('Error deleting institution:', error);
      throw error;
    }
  }

  private static transformDepartments(departments: any[]): Record<string, any> {
    const transformedDepartments: Record<string, any> = {};

    departments.forEach((dept) => {
      transformedDepartments[dept.department_type] = {
        contact_name: dept.contact_name,
        designation: dept.designation,
        email: dept.email,
        mobile: dept.mobile
      };
    });

    return transformedDepartments;
  }

  static async getInstitutions(
    filters: InstitutionFilters = {}
  ): Promise<OrganizationListResponse<Institution>> {
    try {
      let query = this.supabase
        .from('institutions')
        .select('*', { count: 'exact' });

      // Apply search filter
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,counselling_code.ilike.%${filters.search}%`
        );
      }

      // Apply active status filter
      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply institution filtering based on user access if userId is provided
      if (filters.userId && !filters.bypassInstitutionFilter) {
        const accessibleInstitutionIds =
          await this.getUserAccessibleInstitutionIds(filters.userId);
        if (accessibleInstitutionIds.length > 0) {
          query = query.in('id', accessibleInstitutionIds);
        } else {
          // If user has no accessible institutions, return empty result
          return {
            data: [],
            metadata: {
              total: 0,
              page: filters.page || 1,
              limit: filters.limit || 10,
              totalPages: 0
            }
          };
        }
      }

      // Calculate pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Apply pagination
      query = query.range(from, to).order('created_at', { ascending: false });

      // Execute query
      const { data: institutions, error, count } = await query;

      if (error) throw error;

      return {
        data: institutions || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error in getInstitutions:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to fetch institutions'
      );
      throw error;
    }
  }

  /**
   * Helper method to get accessible institution IDs for a user
   */
  private static async getUserAccessibleInstitutionIds(
    userId: string
  ): Promise<string[]> {
    try {
      // Import the service to avoid circular dependency
      const { UserInstitutionAccessService } = await import(
        '@/lib/services/users/user-institution-access-service'
      );
      return await UserInstitutionAccessService.getUserAccessibleInstitutionIds(
        userId
      );
    } catch (error) {
      console.error('Error getting user accessible institution IDs:', error);
      return [];
    }
  }

  static async getInstitution(id: string): Promise<{
    institution: Institution;
    departments: Record<string, any>;
  }> {
    try {
      // Fetch institution
      const { data: institution, error: institutionError } = await this.supabase
        .from('institutions')
        .select('*')
        .eq('id', id)
        .single();

      if (institutionError) throw institutionError;

      // Fetch department contacts
      const { data: departments, error: departmentsError } = await this.supabase
        .from('institution_departments')
        .select('*')
        .eq('institution_id', id);

      if (departmentsError) throw departmentsError;

      // Transform departments into expected format
      const transformedDepartments = this.transformDepartments(departments);

      return {
        institution,
        departments: transformedDepartments
      };
    } catch (error) {
      console.error('Error fetching institution:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to fetch institution'
      );
      throw error;
    }
  }

  static async getInstitutionNames(
    isActive?: boolean,
    userId?: string
  ): Promise<{ id: string; name: string; counselling_code: string }[]> {
    try {
      // If userId is provided, use institution filtering
      if (userId) {
        const { data: institutions } = await this.getInstitutions({
          isActive,
          userId
        });
        return institutions.map((inst) => ({
          id: inst.id,
          name: inst.name,
          counselling_code: inst.counselling_code
        }));
      }

      // Fallback to direct query (for super admin or service contexts)
      let query = this.supabase
        .from('institutions')
        .select('id, name, counselling_code');

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching institution names:', error);
      throw error;
    }
  }

  static async getInstitutionByName(name: string): Promise<Institution | null> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('*')
        .ilike('name', name.trim())
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching institution by name:', error);
      throw error;
    }
  }
}
