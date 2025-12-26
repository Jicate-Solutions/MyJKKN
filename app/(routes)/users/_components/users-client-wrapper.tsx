// ============================================
// USERS CLIENT WRAPPER - DYNAMIC CONTENT
// ============================================
// Created: 2025-01-26
// Purpose: Client component for dynamic user list with filters
// Architecture: Receives cached profile and stats from server parent
// ============================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserService } from '@/lib/services/users/user-service';
import { UserStats, UserFilters } from '@/types/users';
import { Profile } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { UserList } from './user-list';
import { UserFiltersComponent } from './user-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { Download } from 'lucide-react';

interface UsersClientWrapperProps {
  initialProfile: Profile | null;
  initialStats: UserStats;
}

export function UsersClientWrapper({
  initialProfile,
  initialStats
}: UsersClientWrapperProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats] = useState<UserStats>(initialStats); // Use initial stats from server
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 10
  });
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false
  });

  // Define fetchData as a useCallback function
  const fetchData = useCallback(
    async (showPaginationLoader = false) => {
      try {
        if (showPaginationLoader) {
          setPaginationLoading(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const fetchFilters: UserFilters = { ...filters };
        if (initialProfile && initialProfile.institution_id) {
          fetchFilters.institution = initialProfile.institution_id;
        }

        // Fetch users with filters (dynamic - not cached)
        const response = await UserService.getUsers(fetchFilters);
        setUsers(response.data);
        setMetadata(response.metadata);
      } catch (err) {
        console.error('[users/client-wrapper] Error fetching users:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
        setPaginationLoading(false);
      }
    },
    [filters, initialProfile]
  );

  // Fetch users on mount and filter changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (newFilters: Partial<UserFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1 // Reset to first page when filters change
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({
      ...prev,
      page
    }));
    fetchData(true); // Show pagination loader
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({
      ...prev,
      limit: pageSize,
      page: 1 // Reset to first page when page size changes
    }));
  };

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-destructive'>{error}</p>
        <Button
          variant='outline'
          onClick={() => window.location.reload()}
          className='mt-4'
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Stats Cards (using server-cached data) */}
      {stats && (
        <div className='grid gap-4 md:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Active Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Inactive Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{stats.inactive}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Roles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {Object.keys(stats.byRole || {}).length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User List Card (dynamic content) */}
      <Card>
        <CardContent className='p-6'>
          <UserFiltersComponent
            filters={filters}
            onFilterChange={handleFilterChange}
          />

          {isLoading ? (
            <div className='flex justify-center items-center p-8'>
              <BeatLoader color='#00e902' />
            </div>
          ) : (
            <UserList
              users={users}
              metadata={metadata}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onRefresh={() => fetchData()}
              paginationLoading={paginationLoading}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
