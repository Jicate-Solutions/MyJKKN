// app/(routes)/applications/page.tsx
'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useApplications } from '@/hooks/use-applications';
import { ApplicationList } from './_components/application-list';
import { ApplicationFilters } from './_components/application-filters';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';

export default function ApplicationsPage() {
  const {
    applications,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchApplications
  } = useApplications();

  // Initial fetch only
  useEffect(() => {
    fetchApplications();
    // Empty dependency array means this only runs once on mount
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshApplications = useCallback(() => {
    fetchApplications();
  }, [fetchApplications]);

  return (
    <ContentLayout title='Applications'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Applications</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-2'>
        <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>Applications</h1>
            <p className='text-sm text-muted-foreground'>
              Manage and monitor applications
            </p>
          </div>
          <Button asChild>
            <Link href='/applications/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add New Application
            </Link>
          </Button>
        </div>

        <div className='grid gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{metadata.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Active Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {applications.filter((app) => app.is_active).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Inactive Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {applications.filter((app) => !app.is_active).length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ApplicationFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {error ? (
              <div className='text-center p-6 text-destructive'>{error}</div>
            ) : loading ? (
              <div className='flex justify-center items-center p-6'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ApplicationList
                applications={applications}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={refreshApplications}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
