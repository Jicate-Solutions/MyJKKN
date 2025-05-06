// app/(routes)/staff/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import { useStaff } from '@/hooks/staff/use-staff';
import { StaffFilters } from './_components/staff-filters';
import { StaffList } from './_components/staff-list';
import DownloadStaffTemplateButton from './_components/download-staff-template';
import BulkUploadStaff from './_components/bulk-upload-staff';
import { usePermissions } from '@/hooks/use-permissions';

export default function StaffPage() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const {
    staff,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStaff
  } = useStaff();

  // Use waitForLoad to ensure permissions are fully loaded before making decisions
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
  const canCreateStaff = isSuperAdmin || canAccess('staff', 'create');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit');

  // Debug permission values
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Staff permissions debug:', {
        isSuperAdmin,
        canViewStaff: canAccess('staff', 'view'),
        rawCheck: canViewStaff,
        permissionsLoaded: !permissionsLoading
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess, canViewStaff]);

  // Only fetch staff when permissions are loaded and user has view permission
  useEffect(() => {
    if (permissionsLoaded && (isSuperAdmin || canAccess('staff', 'view'))) {
      fetchStaff().catch((err) => {
        console.error('Error fetching staff:', err);
      });
    }
  }, [permissionsLoaded, isSuperAdmin, canAccess, fetchStaff]);

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Staff List'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
          <span className='ml-2'>Loading permissions...</span>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Staff List'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchStaff()}
            className='mt-4'
            disabled={!canViewStaff}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Staff List'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Staff List</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Staff List</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage staff members
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {isSuperAdmin && <DownloadStaffTemplateButton />}
            {isSuperAdmin && <BulkUploadStaff />}
            {canCreateStaff ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/staff/list/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Staff
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Staff
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <StaffFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : staff.length === 0 ? (
              <div className='text-center py-8 text-muted-foreground'>
                No staff members found
              </div>
            ) : (
              <StaffList
                staff={staff}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchStaff}
                canEdit={canEditStaff}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
