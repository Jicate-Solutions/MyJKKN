'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
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
import { useUsers } from '@/hooks/use-users';
import { UsersListTable } from './_components/user-list';
import { UserFilters } from './_components/user-filters';
import { useAuth } from '@/providers/auth-provider';

export default function UsersPage() {
  const { user } = useAuth();
  const {
    users,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchUsers
  } = useUsers();

  // Initial fetch
  useEffect(() => {
    fetchUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only super admins and administrators can access this page
  if (user && !['super_admin', 'administrator'].includes(user.role)) {
    return (
      <ContentLayout title='Unauthorized'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <h1 className='text-2xl font-bold mb-2'>Access Denied</h1>
            <p className='text-muted-foreground'>
              You don&apos;t have permission to view this page.
            </p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Users'>
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Users</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Page Header */}
      <div className='flex justify-between items-center mt-4'>
        <div>
          <h1 className='text-3xl font-bold'>Users</h1>
          <p className='text-sm text-muted-foreground'>
            Manage and monitor user accounts
          </p>
        </div>
        <Button asChild>
          <Link href='/users/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add New User
          </Link>
        </Button>
      </div>

      {/* User Stats Cards */}
      <div className='grid gap-4 md:grid-cols-4 mt-6'>
        <Card>
          <CardContent className='p-6'>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Total Users
              </p>
              <p className='text-2xl font-bold'>{metadata.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-6'>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Active Users
              </p>
              <p className='text-2xl font-bold'>
                {users.filter((u) => u.is_active).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-6'>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Inactive Users
              </p>
              <p className='text-2xl font-bold'>
                {users.filter((u) => !u.is_active).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-6'>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Incomplete Profiles
              </p>
              <p className='text-2xl font-bold'>
                {users.filter((u) => !u.profile_completed).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card className='mt-6'>
        <CardContent className='p-6'>
          <UserFilters filters={filters} onFilterChange={updateFilters} />

          {error ? (
            <div className='text-center text-red-500 py-8'>{error}</div>
          ) : loading ? (
            <div className='flex justify-center items-center py-8'>
              <BeatLoader color='#00e902' />
            </div>
          ) : (
            <UsersListTable
              users={users}
              metadata={metadata}
              onPageChange={changePage}
              onRefresh={fetchUsers}
            />
          )}
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
