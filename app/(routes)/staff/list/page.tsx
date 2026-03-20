// app/(routes)/staff/list/page.tsx

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { AdvancedSearch, SearchOptions } from './_components/advanced-search';
import DownloadStaffTemplateButton from './_components/download-staff-template';
import BulkUploadStaff from './_components/bulk-upload-staff';
import { CreateMissingProfilesButton } from './_components/create-missing-profiles-button';
import { BulkUploadStaffImages } from './_components/bulk-upload-staff-images';
import { StaffFilters as StaffFiltersType, Staff } from '@/types/staff';
import { usePermissions } from '@/hooks/use-permissions';
import { Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function StaffPage() {
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  // Filter state for server-side filtering
  const [filters, setFilters] = useState<StaffFiltersType>({
    category_id: '',
    institution_id: '',
    department_id: '',
    isActive: undefined,
    page: 1,
    limit: 20 // Optimized limit to balance performance and user experience (reduced from 50)
  });

  // Use the simplified staff hook
  const {
    data: staffData,
    isLoading,
    refetch,
    isError,
    error
  } = useStaff(filters);

  // Permission checks
  const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
  // const canCreateStaff = isSuperAdmin || canAccess('staff', 'create');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit');
  // const canDeleteStaff = isSuperAdmin || canAccess('staff', 'delete');

  const staffList = staffData?.data || [];

  // Memoized filter change handler to prevent unnecessary re-renders
  const handleFilterChange = useCallback(
    (newFilters: Partial<StaffFiltersType>) => {
      setFilters((prev) => ({
        ...prev,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      }));
    },
    []
  );

  // Simple page change handler
  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  // Simple page size change handler
  const handlePageSizeChange = useCallback((pageSize: number) => {
    setFilters((prev) => ({ ...prev, limit: pageSize, page: 1 }));
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Handle search input - using inline function to avoid dependency issues
  const handleSearch = useCallback((query: string, options: SearchOptions) => {
    const activeFields = Object.entries(options.searchFields)
      .filter(([, enabled]) => enabled)
      .map(([field]) => {
        if (field === 'institutionEmail') return 'institution_email';
        if (field === 'staffId') return 'staff_id';
        return field;
      });

    setFilters((prev) => ({
      ...prev,
      search: query || undefined,
      search_case_sensitive: options.caseSensitive || undefined,
      search_exact_match: options.exactMatch || undefined,
      search_fields: activeFields.length ? activeFields : undefined,
      page: 1
    }));
  }, []);

  // Handle search clear
  const handleSearchClear = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      search: undefined,
      search_case_sensitive: undefined,
      search_exact_match: undefined,
      search_fields: undefined,
      page: 1
    }));
  }, []);

  // Show loading while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Staff'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <BeatLoader className='text-primary' size={8} />
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (!canViewStaff) {
    return (
      <ContentLayout title='Staff'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You don&apos;t have permission to view staff data.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  if (isError) {
    return (
      <ContentLayout title='Facilitators'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error Loading Facilitators</AlertTitle>
            <AlertDescription>
              {error?.message || 'An unexpected error occurred.'}
              <Button
                variant='outline'
                size='sm'
                onClick={handleRefresh}
                className='mt-4'
              >
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Facilitators'>
      <div className='space-y-6'>
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/dashboard'>Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Facilitators</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Main Content */}
        <Card>
          <CardContent className='p-6'>
            {/* Header */}
            <div className='flex items-center justify-between mb-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 bg-primary/10 rounded-lg'>
                  <Users className='h-6 w-6 text-primary' />
                </div>
                <div>
                  <h1 className='text-2xl font-semibold'>
                    Learning Facilitators Management
                  </h1>
                  <p className='text-muted-foreground'>
                    Manage learning facilitators and their information
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className='flex flex-wrap items-center gap-2 mb-6'>
              <DownloadStaffTemplateButton />
              <BulkUploadStaff />
              {isSuperAdmin && <CreateMissingProfilesButton />}
              <BulkUploadStaffImages />
            </div>

            {/* Advanced Search */}
            {!isLoading && (
              <div className='mb-6'>
                <AdvancedSearch
                  onSearch={handleSearch}
                  onClear={handleSearchClear}
                  placeholder='Search facilitators by name, email, institution email...'
                />
              </div>
            )}

            {/* Stats */}
            {!isLoading && staffData && (
              <div className='flex items-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg'>
                <div className='flex items-center gap-2'>
                  <Users className='h-4 w-4 text-muted-foreground' />
                  <span className='text-sm font-medium'>
                    {filters.search ? (
                      <>
                        Found: {staffData.metadata?.total || 0} facilitators
                      </>
                    ) : (
                      <>Total: {staffData.metadata?.total || 0} facilitators</>
                    )}
                  </span>
                </div>
                {filters.search && staffList.length > 0 && (
                  <Badge
                    variant='default'
                    className='bg-green-100 text-green-800 border-green-300'
                  >
                    Search Active
                  </Badge>
                )}
                {staffData.metadata &&
                  staffData.metadata.total > 0 &&
                  !filters.search && (
                    <Badge variant='secondary'>
                      Page {staffData.metadata.page} of{' '}
                      {staffData.metadata.totalPages}
                    </Badge>
                  )}
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className='flex items-center justify-center py-12'>
                <div className='text-center'>
                  <BeatLoader color='#2563eb' size={8} />
                  <p className='text-sm text-muted-foreground mt-2'>
                    Loading facilitators data...
                  </p>
                </div>
              </div>
            )}

            {/* Filters */}
            {!isLoading && (
              <StaffFilters
                filters={filters}
                onFilterChange={handleFilterChange}
              />
            )}

            {/* Staff List */}
            {!isLoading && staffData && (
              <StaffList
                staff={staffList}
                metadata={
                  staffData.metadata || {
                    total: 0,
                    page: 1,
                    limit: 10,
                    totalPages: 0
                  }
                }
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                onRefresh={handleRefresh}
                canEdit={canEditStaff}
              />
            )}

            {/* No Search Results */}
            {!isLoading && filters.search && staffList.length === 0 && (
              <div className='text-center py-12'>
                <Users className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
                <h3 className='text-lg font-medium mb-2'>
                  No learning facilitators found
                </h3>
                <p className='text-muted-foreground mb-4'>
                  Try adjusting your search terms or search options
                </p>
                <Button variant='outline' onClick={handleSearchClear}>
                  Clear Search
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
