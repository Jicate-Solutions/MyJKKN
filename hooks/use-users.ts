import { useState, useCallback } from 'react';
import { UserService } from '@/lib/services/users/user-service';
import { CreateUserRequest, UserFilters } from '@/types/users';
import { Profile } from '@/types/auth';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export function useUsers(initialFilters: UserFilters = {}) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<UserFilters>(initialFilters);

  const createUser = async (userData: CreateUserRequest) => {
    try {
      setLoading(true);
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      toast.success('User created successfully');
      router.refresh();
      return { data: data.data, error: null };
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create user'
      );
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = useCallback(
    async (newFilters?: UserFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await UserService.getUsers(currentFilters);

        setUsers(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<UserFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchUsers(updatedFilters);
    },
    [filters, fetchUsers]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchUsers(updatedFilters);
    },
    [filters, fetchUsers]
  );

  return {
    users,
    loading,
    error,
    metadata,
    filters,
    createUser,
    updateFilters,
    changePage,
    fetchUsers
  };
}
