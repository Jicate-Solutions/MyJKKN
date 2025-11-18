// lib/services/organization/profile-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ProfileFilters {
  institution_id?: string;
  department_id?: string;
  roles?: string[];
  is_active?: boolean;
  search?: string;
}

export interface ProfileForSelection {
  id: string;
  full_name: string;
  email: string;
  role: string;
  designation: string | null;
  department_id: string | null;
}

/**
 * Profile Service for organization-wide user management
 * Use this service to fetch users (profiles) across all roles
 * (faculty, hod, admin, student, etc.)
 */
export class ProfileService {
  private static supabase = createClientSupabaseClient();

  /**
   * Lightweight profile query for dropdowns/selection components
   * Fetches users by institution and optionally department/roles
   *
   * Use cases:
   * - Resource caretaker selection
   * - Approval workflow assignees
   * - Task assignment
   * - Any user selection UI
   *
   * @param filters - Filtering options
   * @returns Array of profiles with minimal fields for selection
   */
  static async getProfilesForSelection(
    filters: ProfileFilters = {}
  ): Promise<ProfileForSelection[]> {
    try {
      let query = this.supabase
        .from('profiles')
        .select('id, full_name, email, role, designation, department_id');

      // Filter by institution (required for multi-tenant)
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Filter by department (optional)
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      // Filter by roles (optional) - useful for role-specific selections
      if (filters.roles && filters.roles.length > 0) {
        query = query.in('role', filters.roles);
      }

      // Filter by active status
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      // Search by name or email
      if (filters.search) {
        query = query.or(
          `full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        );
      }

      // Order by full name for better UX
      query = query
        .order('full_name', { ascending: true })
        .limit(1000); // Reasonable limit for dropdowns

      const { data, error } = await query;

      if (error) {
        console.error('[profile-service] Error fetching profiles:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[profile-service] Error in getProfilesForSelection:', error);
      throw error;
    }
  }

  /**
   * Get a single profile by ID
   * Useful for fetching detailed user information
   *
   * @param profileId - The profile UUID
   * @returns Profile data
   */
  static async getProfileById(profileId: string) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', profileId)
        .single();

      if (error) {
        console.error('[profile-service] Error fetching profile by ID:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[profile-service] Error in getProfileById:', error);
      throw error;
    }
  }

  /**
   * Get multiple profiles by IDs
   * Useful for batch fetching (e.g., getting all caretakers for a resource)
   *
   * @param profileIds - Array of profile UUIDs
   * @returns Array of profiles
   */
  static async getProfilesByIds(profileIds: string[]): Promise<ProfileForSelection[]> {
    try {
      if (!profileIds || profileIds.length === 0) {
        return [];
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, full_name, email, role, designation, department_id')
        .in('id', profileIds);

      if (error) {
        console.error('[profile-service] Error fetching profiles by IDs:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[profile-service] Error in getProfilesByIds:', error);
      throw error;
    }
  }
}
