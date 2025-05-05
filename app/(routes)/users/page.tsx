'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserService } from '@/lib/services/users/user-service';
import { UserStats, UserFilters } from '@/types/users';
import { Profile } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { UserList } from './_components/user-list';
import { UserFiltersComponent } from './_components/user-filters';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation';
import { BeatLoader } from 'react-spinners';
import { Plus, Download } from 'lucide-react';

export default function UsersPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
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
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch users with filters
      const response = await UserService.getUsers(filters);
      setUsers(response.data);
      setMetadata(response.metadata);

      // Fetch stats
      const statsData = await UserService.getUserStats();
      setStats(statsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [filters]); // Add filters as dependency

  // Fetch users and stats
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
  };

  if (error) {
    return (
      <ContentLayout title='Users'>
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
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Users'>
      <div className='flex justify-between items-center'>
        <div className='space-y-1'>
          <PageBreadcrumb
            items={[{ label: 'Home', href: '/' }, { label: 'Users' }]}
          />
          <h2 className='text-2xl font-bold'>User Management</h2>
          <p className='text-sm text-muted-foreground'>
            View and manage user accounts
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <Button variant='outline'>
            <Download className='mr-2 h-4 w-4' />
            Export
          </Button>
          <Button asChild>
            <Link href='/users/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add User
            </Link>
          </Button>
        </div>
      </div>

      <div className='space-y-6 mt-4'>
        {stats && (
          <div className='grid gap-4 md:grid-cols-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{stats.total}</div>
              </CardContent>
            </Card>
            {/* Add more stat cards as needed */}
          </div>
        )}

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
                onRefresh={fetchData}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
