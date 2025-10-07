'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useAdmissions } from '@/hooks/admission/use-admissions';
import { AdmissionFilters } from '@/types/admission';
import { AdmissionFilter } from './_components/admission-filters';
import { AdmissionDataTable } from './_components/admission-data-table';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

export default function AdmissionsPage() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<AdmissionFilters>({
    search: '',
    name: '',
    institution: '',
    department: '',
    entry_type: '',
    status: '',
    course: '',
    fromDate: undefined,
    toDate: undefined,
    page: 1,
    limit: 10
  });

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canViewAdmissions = isSuperAdmin || canAccess('admissions', 'view');
  const canCreateAdmissions = isSuperAdmin || canAccess('admissions', 'create');
  const canEditAdmissions = isSuperAdmin || canAccess('admissions', 'edit');
  const canDeleteAdmissions = isSuperAdmin || canAccess('admissions', 'delete');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Admissions permissions debug:', {
        isSuperAdmin,
        canViewAdmissions: canAccess('admissions', 'view'),
        canCreateAdmissions: canAccess('admissions', 'create'),
        canEditAdmissions: canAccess('admissions', 'edit'),
        canDeleteAdmissions: canAccess('admissions', 'delete')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  const {
    data: admissionsData,
    isLoading: dataLoading,
    refetch
  } = useAdmissions({
    ...filters,
    page: currentPage,
    limit: pageSize
  });

  const handleFilterChange = (newFilters: AdmissionFilters) => {
    console.log('Applying filters:', newFilters);
    setFilters(newFilters);
    // If the filter component is setting page to 1, we should update our local state
    if (newFilters.page === 1) {
      setCurrentPage(1);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Update the filter state when page or pageSize changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, page: currentPage, limit: pageSize }));
  }, [currentPage, pageSize]);

  const metadata = {
    currentPage,
    totalPages: admissionsData?.metadata.totalPages || 1,
    pageSize: admissionsData?.metadata.limit || 10,
    totalCount: admissionsData?.metadata.total || 0
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Admissions'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Check if user has permission to view admissions
  if (!canViewAdmissions) {
    return (
      <ContentLayout title='Admissions'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view admissions
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/'>Go to Dashboard</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Admissions'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admissions', href: '/admissions' },
            { label: 'Admissions' }
          ]}
        />
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Admissions</h1>
          <p className='text-muted-foreground'>
            Manage student admission applications
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Admission Applications</CardTitle>
            <CardDescription>
              View and manage all admission applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdmissionFilter
              filters={filters}
              onFilterChange={handleFilterChange}
            />

            <AdmissionDataTable
              data={admissionsData?.data || []}
              canEdit={canEditAdmissions}
              canDelete={canDeleteAdmissions}
              canCreate={canCreateAdmissions}
              onRefresh={refetch}
              isLoading={dataLoading}
              currentPage={metadata.currentPage}
              totalPages={metadata.totalPages}
              pageSize={metadata.pageSize}
              totalItems={metadata.totalCount}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
