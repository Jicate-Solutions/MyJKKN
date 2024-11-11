import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { UserList, UserListResponse, UserFilters } from '@/types/users';
import { toast } from 'react-hot-toast';
import { handleApiResponse } from '../utils';

export class UserService {
  private static supabase = createClientComponentClient();

  static async getUsers(filters: UserFilters = {}): Promise<UserListResponse> {
    try {
      // Build query parameters
      const params = new URLSearchParams();

      if (filters.search) params.append('search', filters.search);
      if (filters.role) params.append('role', filters.role);
      if (filters.institution)
        params.append('institution', filters.institution);
      if (filters.isActive !== undefined)
        params.append('isActive', String(filters.isActive));
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));

      // Make API request
      const response = await fetch(`/api/users?${params.toString()}`, {
        credentials: 'include' // Important for cookies
      });

      return handleApiResponse(response);
    } catch (error) {
      console.error('Error fetching users:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch users'
      );
    }
  }

  static async updateUserStatus(
    userId: string,
    isActive: boolean
  ): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: isActive })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update user status');
      }

      toast.success('User status updated successfully');
    } catch (error) {
      console.error('Error updating user status:', error);
      toast.error('Failed to update user status');
      throw error;
    }
  }

  static async deleteUser(userId: string): Promise<void> {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete user');
      }

      toast.success('User deleted successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
      throw error;
    }
  }
}
