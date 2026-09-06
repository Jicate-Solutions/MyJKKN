'use client';
// app/(routes)/staff/list/page.tsx


import { useState, useCallback, useMemo } from 'react';
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
import { StaffSearchInput } from './_components/staff-search-input';
import DownloadStaffTemplateButton from './_components/download-staff-template';
import BulkUploadStaff from './_components/bulk-upload-staff';
import { CreateMissingProfilesButton } from './_components/create-missing-profiles-button';
import { BulkUploadStaffImages } from './_components/bulk-upload-staff-images';
import { BulkEditStaffDialog } from './_components/bulk-edit-staff-dialog';
import { StaffFilters as StaffFiltersType, Staff } from '@/types/staff';
import { StaffProfileCompletionCard } from './_components/staff-profile-completion-card';
import { calculateStaffProfileCompletion } from '@/lib/utils/staff-profile-completion';
import { usePermissions } from '@/hooks/use-permissions';
import { Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function StaffPage() {
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
    getModuleScope
  } = usePermissions();

  // Effective module scope for the current user on the staff module. Mirrors
  // the SQL `get_user_module_scope('staff')` function so the UI hides
  // toolbar/filter chrome that would 403 on the API side for `own_records`
  // users (faculty, librarians, admission counselors, etc.). RLS already
  // enforces the row filter — this is pure UI polish.
  // `getModuleScope` returns a string once permissions have loaded; during
  // the `permissionsLoading` branch above we never reach this calculation,
  // so it's safe to treat the value as authoritative here.
  const staffScope = permissionsLoading ? null : getModuleScope('staff');
  const isOwnRecordsScope = staffScope === 'own_records';

  // Filter state for server-side filtering
  const [filters, setFilters] = useState<StaffFiltersType>({
    category_id: '',
    institution_id: '',
    department_id: '',
    role_key: undefined,
    is_teaching: undefined,
    isActive: undefined,
    page: 1,
    limit: 20 // Optimized limit to balance performance and user experience (reduced from 50)
  });

  // Raw text in the search box. Kept separate from filters.search, which only
  // receives it after the debounce — so typing does not refetch on every key.
  const [searchText, setSearchText] = useState('');

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
  const canCreateStaff = isSuperAdmin || canAccess('staff', 'create');
  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit');
  // Mirrors the bulk-edit routes' server-side gate exactly. All three
  // (template/preview/apply) use withAuth(..., { requirePermission: 'staff.manage_imports' }),
  // so gating the button on anything looser — e.g. staff.edit, held by 72 of 88 roles —
  // would show a button that 403s.
  const canManageStaffImports = isSuperAdmin || canAccess('staff', 'manage_imports');
  // const canDeleteStaff = isSuperAdmin || canAccess('staff', 'delete');

  const staffList = staffData?.data || [];

  // For `own_records` users (faculty, librarians, etc.) the list is a single
  // row — their own staff record. Compute its completion so they get the same
  // profile-completion bar learners see on /learners/my-profile.
  const ownRecord = isOwnRecordsScope ? staffList[0] : undefined;
  const ownRecordCompletion = useMemo(
    () => (ownRecord ? calculateStaffProfileCompletion(ownRecord) : null),
    [ownRecord]
  );

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

  // One term, matched against every searchable column. The per-field toggles
  // and case/exact modifiers are gone: they defaulted to excluding staff ID and
  // designation, so the most common searches silently returned nothing.
  const handleSearch = useCallback((query: string) => {
    setFilters((prev) => ({
      ...prev,
      search: query || undefined,
      page: 1
    }));
  }, []);

  // The page owns the text so the "Clear Search" button in the empty state can
  // reset the input as well as the filter; the debounce lives in the input.
  const handleSearchClear = useCallback(() => {
    setSearchText('');
  }, []);

  // Show loading while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Employees'>
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
      <ContentLayout title='Employees'>
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
      <ContentLayout title='Employees'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error Loading Employees</AlertTitle>
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
    <ContentLayout title='Employees'>
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
              <BreadcrumbPage>Employees</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Main Content */}
        <Card>
          <CardContent className='p-6'>
            {/* Header */}
            <div className='flex items-center justify-between mb-6'>
              <div className='flex items-center gap-3'>
                <div className='p-2 bg-primary/10 rounded-lg shrink-0'>
                  <Users className='h-6 w-6 text-primary' />
                </div>
                <div className='min-w-0'>
                  <h1 className='text-2xl font-semibold'>
                    Employee List
                  </h1>
                  <p className='text-muted-foreground'>
                    Full-time JKKN staff — teaching, facilitators, and
                    non-teaching. The HR module&apos;s read-only{' '}
                    <Link href='/hr/employees' className='underline'>HR Directory</Link>{' '}
                    shows all staff with HR context.
                  </p>
                </div>
              </div>
            </div>

            {/* Profile completion bar — own_records users (faculty et al.) see
                a personal completion summary for their single staff record,
                mirroring the learner /learners/my-profile experience. */}
            {!isLoading && isOwnRecordsScope && ownRecord && ownRecordCompletion && (
              <StaffProfileCompletionCard
                completion={ownRecordCompletion}
                canEdit={canEditStaff}
                editHref={`/staff/list/${ownRecord.id}/edit`}
              />
            )}

            {/* Action Buttons — gated by permissions:
                  - Download Template / Bulk Upload Images: read-only or edit-level
                  - Bulk Upload Staff: requires create permission
                  - Create Missing Profiles: super_admin maintenance action
                Hidden entirely for `own_records` users — their list is
                a single row, so bulk template/upload/maintenance actions
                are meaningless. */}
            {!isOwnRecordsScope && (
              <div className='flex flex-wrap items-center gap-2 mb-6'>
                {canViewStaff && <DownloadStaffTemplateButton />}
                {canCreateStaff && <BulkUploadStaff />}
                {canManageStaffImports && <BulkEditStaffDialog />}
                {isSuperAdmin && <CreateMissingProfilesButton />}
                {canEditStaff && <BulkUploadStaffImages />}
              </div>
            )}

            {/* Search — meaningless for a one-row table, so we hide it for
                `own_records` scope. */}
            {!isLoading && !isOwnRecordsScope && (
              <div className='mb-6'>
                <StaffSearchInput
                  value={searchText}
                  onValueChange={setSearchText}
                  onSearch={handleSearch}
                />
              </div>
            )}

            {/* Stats */}
            {!isLoading && staffData && (
              <div className='flex flex-wrap items-center gap-3 mb-6 p-4 bg-muted/50 rounded-lg'>
                <div className='flex items-center gap-2'>
                  <Users className='h-4 w-4 text-muted-foreground' />
                  <span className='text-sm font-medium'>
                    {filters.search ? 'Found' : filters.isActive === true ? 'Active' : filters.isActive === false ? 'Inactive' : 'Total'}
                    {': '}
                    <span className='font-bold'>{staffData.metadata?.total || 0}</span>
                    {' employees'}
                  </span>
                </div>

                {filters.isActive === true && (
                  <Badge className='bg-green-100 text-green-800 border border-green-300 hover:bg-green-100'>
                    Active Only
                  </Badge>
                )}
                {filters.isActive === false && (
                  <Badge className='bg-red-100 text-red-800 border border-red-300 hover:bg-red-100'>
                    Inactive Only
                  </Badge>
                )}
                {filters.search && staffList.length > 0 && (
                  <Badge className='bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-100'>
                    Search Active
                  </Badge>
                )}
                {staffData.metadata && staffData.metadata.total > 0 && (
                  <Badge variant='secondary' className='ml-auto'>
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
                    Loading employees data...
                  </p>
                </div>
              </div>
            )}

            {/* Filters — hidden for `own_records` scope (one-row table) */}
            {!isLoading && !isOwnRecordsScope && (
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
                scope={staffScope}
              />
            )}

            {/* No Search Results */}
            {!isLoading && filters.search && staffList.length === 0 && (
              <div className='text-center py-12'>
                <Users className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
                <h3 className='text-lg font-medium mb-2'>
                  No employees found
                </h3>
                <p className='text-muted-foreground mb-4'>
                  Every word has to match something. Try fewer words, or part of
                  a name, staff ID, email or phone number.
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
