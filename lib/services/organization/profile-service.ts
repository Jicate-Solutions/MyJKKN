// lib/services/organization/profile-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Format a list of ids for a PostgREST `in.(...)` clause inside an `or()`
 * expression. Values are double-quoted so commas/parens in a malformed id can
 * never break out of the list.
 */
function quoteForPostgrestInList(values: string[]): string {
  return values
    .map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
}

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

      // Step 1: If role_key provided, find users with that role.
      //
      // We MUST go through the get_user_ids_by_role_key SECURITY DEFINER RPC
      // here — querying user_roles directly returns an empty set for any
      // non-super-admin caller because the user_roles SELECT policy only
      // grants visibility to super_admin / admin / users with 'roles.edit'.
      // Resource owners building approver chains are typically none of those.
      if (filters.role_key) {
        const { data: roleUserIds, error: roleError } = await (
          this.supabase as any
        ).rpc('get_user_ids_by_role_key', {
          p_role_key: filters.role_key
        });

        if (roleError) {
          console.error('[profile-service] Error fetching users by role:', roleError);
          throw roleError;
        }

        // RPC returns SETOF uuid -> string[] in the JS client.
        userIdsWithRole = (roleUserIds as string[] | null) ?? [];

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

      // Filter by multiple institutions.
      //
      // A NULL institution_id must NOT be read as "excluded": cross-institution
      // and central staff legitimately have no institution, and SQL `IN` never
      // matches NULL, so `.in('institution_id', ids)` silently dropped every one
      // of them and a populated role rendered as "0 users found" (BUG-003915).
      if (filters.institution_ids && filters.institution_ids.length > 0) {
        query = query.or(
          `institution_id.in.(${quoteForPostgrestInList(filters.institution_ids)}),institution_id.is.null`
        );
      }

      // Filter by single institution (overrides multiple) - same NULL rule.
      if (filters.institution_id) {
        query = query.or(
          `institution_id.eq.${filters.institution_id},institution_id.is.null`
        );
      }

      // Filter by department
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      // Filter by active status. A NULL is_active means the flag was never set,
      // not that the user is deactivated, so treat it as active.
      if (filters.is_active !== undefined) {
        if (filters.is_active) {
          query = query.or('is_active.eq.true,is_active.is.null');
        } else {
          query = query.eq('is_active', false);
        }
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
   * Count how many users hold a role, across every institution.
   *
   * getProfilesForApproverSelection returns the list *after* institution and
   * department filtering, so its length cannot tell "this role has no members
   * at all" apart from "this role has members, but none in the institutions you
   * selected". The approver picker needs both numbers to label itself honestly.
   *
   * @param roleKey - The custom role key (empty string counts as no role)
   * @returns Number of users holding the role
   */
  static async getRoleMemberCount(roleKey: string): Promise<number> {
    if (!roleKey) return 0;

    try {
      const { data, error } = await (this.supabase as any).rpc(
        'get_user_ids_by_role_key',
        { p_role_key: roleKey }
      );

      if (error) {
        logger.error('profile-service', 'Error counting users by role', {
          roleKey,
          error
        });
        throw error;
      }

      return ((data as string[] | null) ?? []).length;
    } catch (error) {
      logger.error('profile-service', 'Error in getRoleMemberCount', {
        roleKey,
        error
      });
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
