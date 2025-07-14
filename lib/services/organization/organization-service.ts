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

export class OrganizationService {
  private static supabase = createClientSupabaseClient();

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
      // First create the institution record
      const { data: institution, error: institutionError } = await this.supabase
        .from('institutions')
        .insert([
          {
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
          }
        ])
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
            return this.supabase.from('institution_departments').insert({
              institution_id: institution.id,
              department_type: type,
              contact_name: contact.contact_name,
              designation: contact.designation,
              email: contact.email,
              mobile: contact.mobile
            });
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
      // Update institution record
      const { data: institution, error: institutionError } = await this.supabase
        .from('institutions')
        .update({
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
        })
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
            return this.supabase.from('institution_departments').insert({
              institution_id: id,
              department_type: type,
              contact_name: contact.contact_name,
              designation: contact.designation,
              email: contact.email,
              mobile: contact.mobile
            });
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

  static async deleteInstitution(id: string): Promise<void> {
    try {
      // Get institution logo URL first
      const { data: institution } = await this.supabase
        .from('institutions')
        .select('logo_url')
        .eq('id', id)
        .single();

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
      const { data: institution, error } = await this.supabase
        .from('institutions')
        .select('*')
        .eq('name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No results found
          console.log(`No institution found with name: ${name}`);
          return null;
        }
        throw error;
      }

      return institution;
    } catch (error) {
      console.error('Error fetching institution by name:', error);
      return null;
    }
  }
}
