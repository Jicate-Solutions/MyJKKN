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

export interface ApproverProfileForSelection {
  id: string;
  full_name: string;
  email: string;
  role: string;
  designation: string | null;
  department_id: string | null;
  institution_id: string | null;
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
   * Get profiles for approver selection - supports cross-institution fetching
   * Fetches users across multiple institutions (all accessible to current user)
   * with optional role and search filtering.
   *
   * Use cases:
   * - Approval workflow approver selection
   * - Cross-institution approver assignment
   * - Role-based approver filtering (e.g., HODs, admins)
   *
   * @param filters - Filtering options including multi-institution and role_key
   * @returns Array of profiles with institution_id for display
   */
  static async getProfilesForApproverSelection(
    filters: {
      institution_ids?: string[];
      institution_id?: string;
      department_id?: string;
      role_key?: string;
      search?: string;
      is_active?: boolean;
    }
  ): Promise<ApproverProfileForSelection[]> {
    try {
      let userIdsWithRole: string[] | null = null;

      // Step 1: If role_key provided, find users with that role
      if (filters.role_key) {
        const { data: roleAssignments, error: roleError } = await (this.supabase as any)
          .from('user_roles')
          .select('user_id, custom_roles!inner(role_key)')
          .eq('custom_roles.role_key', filters.role_key);

        if (roleError) {
          console.error('[profile-service] Error fetching users by role:', roleError);
          throw roleError;
        }

        userIdsWithRole = (roleAssignments || []).map((r: any) => r.user_id);

        // If no users have this role, return empty
        if (userIdsWithRole.length === 0) {
          return [];
        }
      }

      // Step 2: Query profiles with filters
      let query = this.supabase
        .from('profiles')
        .select('id, full_name, email, role, designation, department_id, institution_id');

      // Filter by role users if role_key was specified
      if (userIdsWithRole) {
        query = query.in('id', userIdsWithRole);
      }

      // Filter by multiple institutions
      if (filters.institution_ids && filters.institution_ids.length > 0) {
        query = query.in('institution_id', filters.institution_ids);
      }

      // Filter by single institution (overrides multiple)
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Filter by department
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
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

      query = query
        .order('full_name', { ascending: true })
        .limit(500);

      const { data, error } = await query;

      if (error) {
        console.error('[profile-service] Error fetching approver profiles:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[profile-service] Error in getProfilesForApproverSelection:', error);
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
