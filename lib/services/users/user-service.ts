import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Profile, UserRole } from '@/types/auth';
import {
  UserFilters,
  UserListResponse,
  UserStats,
  UpdateUserRequest as UpdateUserDto,
  CreateUserRequest as CreateUserDto
} from '@/types/users';
import { toast } from 'react-hot-toast';

// A simple delay utility
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export class UserService {
  static async getUsers(filters: UserFilters = {}): Promise<UserListResponse> {
    try {
      // Build query parameters
      const searchParams = new URLSearchParams();

      if (filters.page) searchParams.set('page', filters.page.toString());
      if (filters.limit) searchParams.set('limit', filters.limit.toString());
      if (filters.role) searchParams.set('role', filters.role);
      if (filters.institution) searchParams.set('institution', filters.institution);
      if (filters.search) searchParams.set('search', filters.search);

      const response = await fetch(`/api/users?${searchParams.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch users');
      }

      const result = await response.json();

      return {
        data: result.data || [],
        metadata: {
          total: result.metadata?.total || 0,
          page: result.metadata?.page || 1,
          limit: result.metadata?.limit || 10,
          totalPages: result.metadata?.totalPages || 0,
          hasNextPage: (result.metadata?.page || 1) < (result.metadata?.totalPages || 0),
          hasPreviousPage: (result.metadata?.page || 1) > 1
        }
      };
    } catch (error) {
      throw error;
    }
  }

  static async getUserStats(institutionId?: string): Promise<UserStats> {
    try {
      const supabase = createClientSupabaseClient();
      const fromProfiles = supabase.from('profiles');

      // Base queries
      let totalQuery = fromProfiles.select('*', {
        count: 'exact',
        head: true
      });
      let activeQuery = fromProfiles.select('*', {
        count: 'exact',
        head: true
      });
      let inactiveQuery = fromProfiles.select('*', {
        count: 'exact',
        head: true
      });
      let rolesQuery = fromProfiles.select('role');

      if (institutionId) {
        totalQuery = totalQuery.eq('institution_id', institutionId);
        activeQuery = activeQuery.eq('institution_id', institutionId);
        inactiveQuery = inactiveQuery.eq('institution_id', institutionId);
        rolesQuery = rolesQuery.eq('institution_id', institutionId);
      }

      // Get total users
      const { count: total, error: totalError } = (await totalQuery) as {
        count: number | null;
        error: any;
      };
      if (totalError) throw totalError;

      // Get active users
      const { count: active, error: activeError } = (await activeQuery.eq(
        'is_active',
        true
      )) as { count: number | null; error: any };
      if (activeError) throw activeError;

      // Get inactive users
      const { count: inactive, error: inactiveError } = (await inactiveQuery.eq(
        'is_active',
        false
      )) as { count: number | null; error: any };
      if (inactiveError) throw inactiveError;

      // Get all profiles with role data
      const { data: profiles, error: profilesError } = (await rolesQuery) as {
        data: { role: string | null }[] | null;
        error: any;
      };
      if (profilesError) throw profilesError;

      // Count roles manually on the client side
      const byRole: Record<string, number> = {};
      profiles?.forEach((profile) => {
        if (profile.role) {
          byRole[profile.role] = (byRole[profile.role] || 0) + 1;
        }
      });

      // Get counts by institution (if applicable)
      const byInstitution: Record<string, number> = {};

      return {
        total: total || 0,
        active: active || 0,
        inactive: inactive || 0,
        byRole,
        byInstitution
      };
    } catch (error) {
      throw error;
    }
  }

  static async getCurrentUserProfile(): Promise<{
    data: Profile | null;
    error: Error | null;
  }> {
    try {
      const supabase = createClientSupabaseClient();
      // Force refresh the user session to ensure we have the latest data
      await supabase.auth.refreshSession();

      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) {
        return { data: null, error: new Error('No active user') };
      }

      const { data, error } = (await supabase
        .from('profiles')
        .select(
          `
          *,
          institutions (
            id,
            name,
            category,
            institution_type,
            website,
            email,
            phone,
            city,
            state,
            country
          )
        `
        )
        .eq('id', userData.user.id)
        .single()) as { data: Profile | null; error: any };

      if (error) throw error;
      if (!data) throw new Error('Profile not found');

      // If user is a student, fetch their student record and status
      if (data && data.role === 'student') {
        let studentData = null;
        let studentError = null;

        // First try to find by college_email

        // If the profile doesn't have an institution_id, we need to use service role
        // to bypass RLS for finding the student's own record
        const shouldUseServiceRole = !data.institution_id;

        for (let i = 0; i < 2; i++) {
          const query = supabase
            .from('learners_profiles')
            .select(
              'id, status, is_profile_complete, first_name, last_name, college_email, institution_id'
            )
            .eq('college_email', data.email);

          // For students without institution_id in profile, we need to fetch their data differently

          const { data: sData, error: sError } = (await query.maybeSingle()) as {
            data: any | null;
            error: any;
          };

          if (!sError && sData) {
            studentData = sData;
            studentError = null;
            break; // Success, exit loop
          } else {
            studentError = sError;
            if (i === 0) {
              await delay(300); // Wait before retrying
            }
          }
        }

        // If not found by college_email, try alternative matching
        if (!studentData && data.full_name) {
          // Try to match by name (for cases where email doesn't match)
          const nameParts = data.full_name.trim().split(' ');
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(' ') || '';

          // Try exact name match first
          let nameQuery: any = supabase
            .from('learners_profiles')
            .select(
              'id, status, is_profile_complete, college_email, first_name, last_name'
            );

          // Build a more flexible query
          if (lastName) {
            nameQuery = nameQuery.or(
              `and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%),` +
                `and(first_name.ilike.%${data.full_name}%),` +
                `and(last_name.ilike.%${data.full_name}%)`
            );
          } else {
            nameQuery = nameQuery.or(
              `first_name.ilike.%${firstName}%,last_name.ilike.%${firstName}%`
            );
          }

          const { data: sDataByName, error: sErrorByName } = (await nameQuery
            .limit(1)
            .maybeSingle()) as { data: any | null; error: any };

          if (!sErrorByName && sDataByName) {
            studentData = sDataByName;
          }
        }

        // If still not found, try by personal email
        if (!studentData) {
          const { data: sDataByPersonal, error: sErrorByPersonal } =
            (await supabase
              .from('learners_profiles')
              .select(
                'id, status, is_profile_complete, college_email, student_email'
              )
              .eq('student_email', data.email)
              .maybeSingle()) as { data: any | null; error: any };

          if (!sErrorByPersonal && sDataByPersonal) {
            studentData = sDataByPersonal;
          }
        }

        if (studentData) {
          // Enhance profile with student information
          data.student_id = studentData.id;
          data.student_status = studentData.status;
          data.student_profile_complete = studentData.is_profile_complete;
        } else {
          // Student record not found - this is now a valid state
          // Some student profiles may not have corresponding student records yet
          data.student_id = null;
          data.student_status = 'pending'; // Set a default status
          data.student_profile_complete = false;
        }
      }

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  static async getUserById(id: string): Promise<Profile | null> {
    try {
      const response = await fetch(`/api/users/${id}`);

      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch user');
      }

      return result.data;
    } catch (error) {
      throw error;
    }
  }

  static async updateUserRole(userId: string, newRole: string): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update role');
      }
      
      toast.success(`User role updated to ${newRole} successfully`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update role';
      toast.error(message);
      throw error;
    }
  }

  static async bulkUpdateUserRoles(
    userIds: string[],
    newRole: string
  ): Promise<{
    success: string[];
    failed: Array<{ userId: string; error: string }>;
  }> {
    try {
      const response = await fetch('/api/users/bulk-role-update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userIds,
          role: newRole
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update roles');
      }

      const data = await response.json();

      if (data.success.length > 0) {
        toast.success(
          `Successfully updated ${data.success.length} user(s) roles to ${newRole}`
        );
      }

      if (data.failed.length > 0) {
        toast.error(`Failed to update ${data.failed.length} user(s) roles`);
      }

      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update roles';
      toast.error(message);
      throw error;
    }
  }

  static async deactivateUser(userId: string): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to deactivate user');
      }

      if (!data.success) {
        throw new Error('User deactivation failed');
      }

      toast.success('User deactivated successfully');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to deactivate user';
      toast.error(message);
      throw error;
    }
  }

  static async checkIsAdmin(): Promise<boolean> {
    try {
      const supabase = createClientSupabaseClient();
      const { data: userData, error } = await supabase.auth.getUser();

      if (error || !userData.user) return false;

      const { data: profile } = (await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single()) as { data: { role: string | null } | null; error: any };

      return (
        profile?.role === 'super_admin' || profile?.role === 'administrator'
      );
    } catch (error) {
      return false;
    }
  }

  static async getUsersWithRoles(): Promise<Profile[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = (await supabase
        .from('profiles')
        .select(
          `
          *,
          institutions (
            id,
            name,
            category,
            institution_type,
            website,
            email,
            phone,
            city,
            state,
            country
          )
        `
        )
        .order('full_name')) as { data: Profile[] | null; error: any };

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw error;
    }
  }

  static async updateUser(id: string, data: UpdateUserDto): Promise<Profile> {
    try {
      const supabase = createClientSupabaseClient();
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      // Note: 'users' table may not exist in schema - using type assertion to bypass strict typing
      const updateQuery = supabase.from('users' as any);
      const { data: user, error } = await updateQuery
        .update({
          ...data,
          updated_by: userData.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!user) throw new Error('User not found');

      return user as unknown as Profile;
    } catch (error) {
      throw error;
    }
  }

  static async createUser(data: CreateUserDto): Promise<Profile> {
    try {
      const supabase = createClientSupabaseClient();
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      // Note: 'users' table may not exist in schema - using type assertion to bypass strict typing
      const insertQuery = supabase.from('users' as any);
      const { data: user, error } = await insertQuery
        .insert([
          {
            ...data,
            created_by: userData.user.id,
            updated_by: userData.user.id
          }
        ])
        .select()
        .single();

      if (error) throw error;
      if (!user) throw new Error('Failed to create user');

      return user as unknown as Profile;
    } catch (error) {
      throw error;
    }
  }

  static async deleteUser(userId: string): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete user';
      toast.error(message);
      throw error;
    }
  }

  static async toggleUserStatus(userId: string): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}/toggle-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to toggle user status');
      }

      toast.success(data.message || 'User status updated successfully');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to toggle user status';
      toast.error(message);
      throw error;
    }
  }
}
