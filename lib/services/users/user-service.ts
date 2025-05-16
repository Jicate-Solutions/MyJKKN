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

export class UserService {
  private static supabase = createClientSupabaseClient();

  static async getUsers(filters: UserFilters = {}): Promise<UserListResponse> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;
      const end = start + limit - 1;

      let query = this.supabase
        .from('profiles')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.role) {
        query = query.eq('role', filters.role);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters.search) {
        query = query.or(
          `email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`
        );
      }

      // Pagination
      const { data, error, count } = await query.range(start, end);

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limit);

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      };
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  static async getUserStats(): Promise<UserStats> {
    try {
      // Get total users
      const { count: total, error: totalError } = await this.supabase
        .from('profiles')
        .select('*', { count: 'exact' });

      if (totalError) throw totalError;

      // Get active users
      const { count: active, error: activeError } = await this.supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .eq('is_active', true);

      if (activeError) throw activeError;

      // Get inactive users
      const { count: inactive, error: inactiveError } = await this.supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .eq('is_active', false);

      if (inactiveError) throw inactiveError;

      // Get all profiles with role data
      const { data: profiles, error: profilesError } = await this.supabase
        .from('profiles')
        .select('role');

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
      console.error('Error fetching user stats:', error);
      throw error;
    }
  }

  static async getCurrentUserProfile(): Promise<{
    data: Profile | null;
    error: Error | null;
  }> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) {
        return { data: null, error: new Error('No active user') };
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('Error getting current user profile:', error);
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  static async getUserById(id: string): Promise<Profile | null> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
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
    } catch (error) {
      console.error('Error updating user role:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to update role';
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
      console.error('Error deactivating user:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to deactivate user';
      toast.error(message);
      throw error;
    }
  }

  static async checkIsAdmin(): Promise<boolean> {
    try {
      const { data: userData, error } = await this.supabase.auth.getUser();

      if (error || !userData.user) return false;

      const { data: profile } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      return (
        profile?.role === 'super_admin' || profile?.role === 'administrator'
      );
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  static async getUsersWithRoles(): Promise<Profile[]> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching users with roles:', error);
      throw error;
    }
  }

  static async updateUser(id: string, data: UpdateUserDto): Promise<Profile> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      const { data: user, error } = await this.supabase
        .from('users')
        .update({
          ...data,
          updated_by: userData.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return user;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  static async createUser(data: CreateUserDto): Promise<Profile> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      const { data: user, error } = await this.supabase
        .from('users')
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

      return user;
    } catch (error) {
      console.error('Error creating user:', error);
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

      toast.success('User deleted successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to delete user';
      toast.error(message);
      throw error;
    }
  }
}
