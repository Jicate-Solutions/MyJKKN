import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Profile } from '@/types/auth';
import { UserFilters, UserListResponse, UserStats } from '@/types/users';
import { toast } from 'react-hot-toast';

export class UserService {
  private static supabase = createClientComponentClient();

  static async getUsers(filters: UserFilters = {}): Promise<UserListResponse> {
    try {
      // Start building the query
      let query = this.supabase
        .from('profiles')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.role) {
        query = query.eq('role', filters.role);
      }

      if (filters.institution) {
        query = query.eq('institution', filters.institution);
      }

      if (filters.search) {
        query = query.or(
          `full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        );
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;
      const end = start + limit - 1;

      query = query.range(start, end).order('created_at', { ascending: false });

      // Execute query
      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  static async getUserStats(): Promise<UserStats> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('role, institution');

      if (error) throw error;

      const stats: UserStats = {
        total: data.length,
        active: 0, // You might want to add an is_active field to profiles
        inactive: 0,
        byRole: {},
        byInstitution: {}
      };

      // Calculate stats
      data.forEach((profile) => {
        // Count by role
        stats.byRole[profile.role] = (stats.byRole[profile.role] || 0) + 1;

        // Count by institution
        if (profile.institution) {
          stats.byInstitution[profile.institution] =
            (stats.byInstitution[profile.institution] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error fetching user stats:', error);
      throw error;
    }
  }

  static async getCurrentUserProfile() {
    try {
      const supabase = createClientComponentClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        return { data: null, error: new Error('No authenticated session') };
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
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

  static async updateUserRole(userId: string, newRole: string): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update role');
      }

      if (!data.success) {
        throw new Error('Role update failed');
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
      // This is a placeholder - you'll need to implement user deactivation
      // based on your requirements
      const { error } = await this.supabase
        .from('profiles')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success('User deactivated successfully');
    } catch (error) {
      console.error('Error deactivating user:', error);
      throw error;
    }
  }

  static async checkIsAdmin(): Promise<boolean> {
    try {
      const {
        data: { session },
        error
      } = await this.supabase.auth.getSession();

      if (error || !session) return false;

      const { data: profile } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      return (
        profile?.role === 'super_admin' || profile?.role === 'administrator'
      );
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }
}
