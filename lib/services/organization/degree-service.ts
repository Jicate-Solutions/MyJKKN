// lib/services/degree-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Degree,
  CreateDegreeDto,
  UpdateDegreeDto,
  DegreeFilters,
  DegreeListResponse
} from '@/types/organizations';

export class DegreeService {
  private static supabase = createClientSupabaseClient();

  /**
   * Helper method to get accessible institution IDs for a user
   */
  private static async getUserAccessibleInstitutionIds(
    userId: string
  ): Promise<string[]> {
    console.log(
      'DegreeService: Getting accessible institution IDs for user:',
      userId
    );
    try {
      // Import the service to avoid circular dependency
      const { UserInstitutionAccessService } = await import(
        '@/lib/services/users/user-institution-access-service'
      );
      console.log(
        'DegreeService: UserInstitutionAccessService imported, calling getUserAccessibleInstitutionIds'
      );
      const result =
        await UserInstitutionAccessService.getUserAccessibleInstitutionIds(
          userId
        );
      console.log(
        'DegreeService: getUserAccessibleInstitutionIds returned:',
        result
      );
      return result;
    } catch (error) {
      console.error(
        'DegreeService: Error getting user accessible institution IDs:',
        error
      );
      return [];
    }
  }

  static async getDegreeByName(
    name: string,
    institutionId: string
  ): Promise<Degree | null> {
    try {
      const { data, error } = await this.supabase
        .from('degrees')
        .select('*')
        .eq('institution_id', institutionId)
        .ilike('degree_name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found, which is not an error in this case
          return null;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching degree by name:', error);
      throw error;
    }
  }

  static async createDegree(data: CreateDegreeDto): Promise<Degree> {
    try {
      const { data: degree, error } = await this.supabase
        .from('degrees')
        .insert([
          {
            ...data,
            degree_id: data.degree_id.toUpperCase()
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Degree ID "${data.degree_id}" already exists`);
        }
        throw error;
      }

      toast.success('Degree created successfully');
      return degree;
    } catch (error) {
      console.error('Error creating degree:', error);
      throw error;
    }
  }

  static async updateDegree(
    id: string,
    data: UpdateDegreeDto
  ): Promise<Degree> {
    try {
      const { data: degree, error } = await this.supabase
        .from('degrees')
        .update({
          ...data,
          degree_id: data.degree_id?.toUpperCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Degree updated successfully');
      return degree;
    } catch (error) {
      console.error('Error updating degree:', error);
      throw error;
    }
  }

  static async deleteDegree(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('degrees')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Degree deleted successfully');
    } catch (error) {
      console.error('Error deleting degree:', error);
      throw error;
    }
  }

  static async getDegrees(
    filters: DegreeFilters = {}
  ): Promise<DegreeListResponse> {
    console.log('DegreeService.getDegrees called with filters:', filters);
    try {
      let query = this.supabase.from('degrees').select(
        `
        *,
        institution:institutions (
          id,
          name,
          counselling_code
        )
      `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `degree_id.ilike.%${filters.search}%,degree_name.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.degree_type) {
        query = query.eq('degree_type', filters.degree_type);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply institution filtering based on user access if userId is provided
      if (filters.userId && !filters.bypassInstitutionFilter) {
        console.log(
          'DegreeService: Applying institution filtering for user:',
          filters.userId
        );
        const accessibleInstitutionIds =
          await this.getUserAccessibleInstitutionIds(filters.userId);
        console.log(
          'DegreeService: User accessible institution IDs:',
          accessibleInstitutionIds
        );

        if (accessibleInstitutionIds.length > 0) {
          query = query.in('institution_id', accessibleInstitutionIds);
          console.log('DegreeService: Applied institution filter');
        } else {
          console.log(
            'DegreeService: User has no accessible institutions, returning empty result'
          );
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
      } else if (filters.bypassInstitutionFilter) {
        console.log(
          'DegreeService: Bypassing institution filter for super admin'
        );
      } else {
        console.log(
          'DegreeService: No userId provided, not applying institution filtering'
        );
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      console.log('DegreeService: Executing query with pagination:', {
        page,
        limit,
        from,
        to
      });
      const { data: degrees, error, count } = await query;

      if (error) {
        console.error('DegreeService: Query error:', error);
        throw error;
      }

      console.log(
        'DegreeService: Query successful, got',
        degrees?.length || 0,
        'degrees, total count:',
        count
      );

      return {
        data: degrees || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching degrees:', error);
      throw error;
    }
  }

  static async getDegree(id: string): Promise<Degree> {
    try {
      const { data: degree, error } = await this.supabase
        .from('degrees')
        .select(
          `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return degree;
    } catch (error) {
      console.error('Error fetching degree:', error);
      throw error;
    }
  }

  static async getDegreesByInstitution(
    institutionId: string
  ): Promise<Degree[]> {
    try {
      // Check if institutionId is a UUID or a name/label
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          institutionId
        );

      let query;

      if (isUUID) {
        // If it's a UUID, use it directly with eq
        query = this.supabase
          .from('degrees')
          .select('*')
          .eq('institution_id', institutionId)
          .eq('is_active', true)
          .order('degree_name');
      } else {
        // If it's not a UUID, we need to first find the institution by name
        console.log('Searching for institution with name:', institutionId);

        // Option 1: Find the institution by name first, then get degrees for it
        const { data: institution } = await this.supabase
          .from('institutions')
          .select('id')
          .ilike('name', institutionId)
          .single();

        if (institution) {
          console.log('Found institution with ID:', institution.id);
          query = this.supabase
            .from('degrees')
            .select('*')
            .eq('institution_id', institution.id)
            .eq('is_active', true)
            .order('degree_name');
        } else {
          console.log('No institution found with name:', institutionId);
          // Return empty array if no institution found
          return [];
        }
      }

      const { data: degrees, error } = await query;

      if (error) throw error;

      return degrees || [];
    } catch (error) {
      console.error('Error fetching degrees by institution:', error);
      // Return empty array instead of throwing error
      return [];
    }
  }
}
