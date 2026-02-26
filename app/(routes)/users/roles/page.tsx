'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Profile } from '@/types/auth';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { RolesList } from './_components/roles-list';
import { UserService } from '@/lib/services/users/user-service';
import { UserRolesService } from '@/lib/services/users/user-roles-service';
import { usePermissions } from '@/hooks/use-permissions';
import toast from 'react-hot-toast';
import { UserFilters } from '@/types/users';
import { UserFiltersComponent } from '../_components/user-filters';
import { UserAdvancedSearch, type UserSearchFilters } from '../_components/user-advanced-search';

export default function RolesPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const {
    hasAllPermissions,
    isLoading: permLoading,
    userProfile,
  } = usePermissions(['roles.assign']);
  const [advancedSearchFilters, setAdvancedSearchFilters] = useState<UserSearchFilters | null>(null);
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
  // Check super admin access
  useEffect(() => {
    if (permLoading) return;
    if (!userProfile) return; // profile not loaded yet — don't redirect
    if (!hasAllPermissions) {
      router.push('/unauthorized');
      return;
    }
    setIsSuperAdmin(true);
  }, [permLoading, hasAllPermissions, userProfile, router]);

  // Add filter change handler
  const handleFilterChange = (newFilters: Partial<UserFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1 // Reset to first page when filters change
    }));
  };

  // Update fetchUsers to use filters
  const fetchUsers = useCallback(
    async (showPaginationLoader = false) => {
      try {
        if (showPaginationLoader) {
          setPaginationLoading(true);
        } else {
          setIsLoading(true);
        }

        const fetchFilters: UserFilters = { ...filters };

        // Apply advanced search filters if present
        if (advancedSearchFilters) {
          const { fullNameQuery, emailQuery, phoneQuery, searchOptions } = advancedSearchFilters;

          // Build combined search query based on active fields
          const searchParts: string[] = [];

          if (fullNameQuery && searchOptions.searchFields.fullName) {
            searchParts.push(`name:${fullNameQuery}`);
          }
          if (emailQuery && searchOptions.searchFields.email) {
            searchParts.push(`email:${emailQuery}`);
          }
          if (phoneQuery && searchOptions.searchFields.phoneNumber) {
            searchParts.push(`phone:${phoneQuery}`);
          }

          // Combine search parts with separator
          if (searchParts.length > 0) {
            fetchFilters.search = searchParts.join('|');
          }
        } else {
          // Clear search when no advanced filters
          delete fetchFilters.search;
        }

        const response = await UserService.getUsers(fetchFilters);
        setUsers(response.data);
        setMetadata(response.metadata);
      } catch (err) {
        console.error('Error fetching users:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
        setPaginationLoading(false);
      }
    },
    [filters, advancedSearchFilters]
  );

  // Update useEffect to depend on filters
  useEffect(() => {
    if (isSuperAdmin) {
      fetchUsers();
    }
  }, [isSuperAdmin, fetchUsers]);

  const handleRoleUpdate = async (userId: string, newRole: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Prevent updating super_admin role
      const userToUpdate = users.find((user) => user.id === userId);
      if (userToUpdate?.role === 'super_admin' && newRole !== 'super_admin') {
        throw new Error("Cannot modify a super admin's role");
      }

      await UserService.updateUserRole(userId, newRole);

      // Refresh user list
      const response = await UserService.getUsers(filters);
      setUsers(response.data);
      setMetadata(response.metadata);
    } catch (error) {
      console.error('Error updating role:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to update role'
      );
      toast.error(
        error instanceof Error ? error.message : 'Failed to update role'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkRoleUpdate = async (userIds: string[], newRole: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Check for super_admin users in the selection
      const superAdminUsers = users.filter(
        (user) => userIds.includes(user.id) && user.role === 'super_admin'
      );

      if (superAdminUsers.length > 0 && newRole !== 'super_admin') {
        throw new Error(
          `Cannot modify super admin roles: ${superAdminUsers
            .map((u) => u.full_name || u.email)
            .join(', ')}`
        );
      }

      await UserService.bulkUpdateUserRoles(userIds, newRole);

      // Refresh user list
      const response = await UserService.getUsers(filters);
      setUsers(response.data);
      setMetadata(response.metadata);
    } catch (error) {
      console.error('Error updating roles:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to update roles'
      );
      toast.error(
        error instanceof Error ? error.message : 'Failed to update roles'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleMultiRoleUpdate = async (
    userId: string,
    roleIds: string[],
    primaryRoleId: string
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      // Prevent updating super_admin role
      const userToUpdate = users.find((user) => user.id === userId);
      if (userToUpdate?.role === 'super_admin') {
        throw new Error("Cannot modify a super admin's roles");
      }

      await UserRolesService.assignRoles(userId, roleIds, primaryRoleId);

      // Refresh user list
      const response = await UserService.getUsers(filters);
      setUsers(response.data);
      setMetadata(response.metadata);

      toast.success('User roles updated successfully');
    } catch (error) {
      console.error('Error updating roles:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to update roles'
      );
      toast.error(
        error instanceof Error ? error.message : 'Failed to update roles'
      );
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({
      ...prev,
      page
    }));
    fetchUsers(true); // Show pagination loader
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({
      ...prev,
      limit: pageSize,
      page: 1 // Reset to first page when page size changes
    }));
  };

  // Handle advanced search
  const handleAdvancedSearch = useCallback((searchFilters: UserSearchFilters) => {
    setAdvancedSearchFilters(searchFilters);
    setFilters((prev) => ({
      ...prev,
      page: 1 // Reset to first page when searching
    }));
  }, []);

  // Handle clear advanced search
  const handleClearAdvancedSearch = useCallback(() => {
    setAdvancedSearchFilters(null);
    setFilters((prev) => ({
      ...prev,
      page: 1, // Reset to first page when clearing
      search: undefined // Clear search from filters
    }));
  }, []);

  if (!isSuperAdmin) {
    return (
      <ContentLayout title='Roles & Permissions'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Roles & Permissions'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/users'>Users</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Roles & Permissions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Roles & Permissions</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage user roles and permissions. Only super admins can modify
            roles.
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            {/* Advanced Search */}
            <div className='mb-6'>
              <UserAdvancedSearch
                onSearch={handleAdvancedSearch}
                onClear={handleClearAdvancedSearch}
              />
            </div>

            <UserFiltersComponent
              filters={filters}
              onFilterChange={handleFilterChange}
            />

            {error ? (
              <div className='text-center text-red-500 py-4'>{error}</div>
            ) : isLoading ? (
              <div className='flex justify-center py-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <RolesList
                users={users}
                metadata={metadata}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                onRoleUpdate={handleRoleUpdate}
                onMultiRoleUpdate={handleMultiRoleUpdate}
                paginationLoading={paginationLoading}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
