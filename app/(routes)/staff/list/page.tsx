// app/(routes)/staff/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
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
import ExportStaff from './_components/export-staff';
import { CreateMissingProfilesButton } from './_components/create-missing-profiles-button';
import { usePermissions } from '@/hooks/use-permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { BulkUploadStaffImages } from './_components/bulk-upload-staff-images';

export default function StaffPage() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);

  const {
    staff,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchStaff,
    updateLimit
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

  // Handle page change with loading state
  const handlePageChange = async (page: number) => {
    setPaginationLoading(true);
    try {
      await changePage(page);
    } finally {
      setPaginationLoading(false);
    }
  };

  // Handle page size change
  const handlePageSizeChange = async (pageSize: number) => {
    setPaginationLoading(true);
    try {
      await updateLimit(pageSize);
    } finally {
      setPaginationLoading(false);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    await fetchStaff();
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Staff List'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Staff List'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
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
        <div className='flex flex-col gap-4 justify-between items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Staff List</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage staff members
            </p>
          </div>

          {/* Additional Tools Row */}
          <div className='flex flex-col sm:flex-row gap-2 sm:items-end w-full'>
            {canEditStaff && <DownloadStaffTemplateButton />}
            {isSuperAdmin && <ExportStaff />}
            {(isSuperAdmin || canAccess('user', 'create')) && (
              <CreateMissingProfilesButton />
            )}
            {canEditStaff && <BulkUploadStaff />}
            {canEditStaff && <BulkUploadStaffImages />}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <StaffFilters filters={filters} onFilterChange={updateFilters} />

            {loading && !paginationLoading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <StaffList
                staff={staff}
                metadata={metadata}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                onRefresh={handleRefresh}
                canEdit={canEditStaff}
                paginationLoading={paginationLoading}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
