'use client';
// app/(routes)/resource-management/resources/page.tsx


import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, Eye, Package, ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DataTable } from '@/components/ui/data-table';
import {
  useResources,
  useResourceOperations
} from '@/hooks/resource-management/use-resources';
import { ResourceService } from '@/lib/services/resource-management/resource-service';
import { ResourceEmptyState } from './_components/resource-empty-state';
import { ResourceFiltersComponent } from './_components/resource-filters';
import DownloadResourceTemplate from './_components/download-resource-template';
import BulkUploadResources from './_components/bulk-upload-resources';
import type { Resource, ResourceFilters } from '@/types/resource-management';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { Card, CardContent } from '@/components/ui/card';

export default function ResourcesPage() {
  const { canAccess, isSuperAdmin } = usePermissions();

  // Memoize the initial filters to prevent recreation on every render
  const initialFilters = useMemo(
    () => ({
      page: 1,
      limit: 10
    }),
    []
  );

  const {
    resources,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchResources
  } = useResources(initialFilters);

  const { bulkDeleteResources } = useResourceOperations();

  // Procurement-intake drafts awaiting room/caretaker ("needs-setup" tag) —
  // Director decision 2026-07-11: visible counter + one-click filter.
  // Scoped to the list's institution filter so count and click-through agree;
  // the sequence ref drops out-of-order responses when refetches overlap.
  const [needsSetupCount, setNeedsSetupCount] = useState<number | null>(null);
  const needsSetupReqSeq = useRef(0);
  useEffect(() => {
    const seq = ++needsSetupReqSeq.current;
    ResourceService.getNeedsSetupCount(filters.institution_id)
      .then((count) => {
        if (seq === needsSetupReqSeq.current) setNeedsSetupCount(count);
      })
      .catch(() => {
        if (seq === needsSetupReqSeq.current) setNeedsSetupCount(null);
      });
    // Deliberately keyed on the array IDENTITY: every list refetch (including
    // after completing a draft's setup, which changes tags but not length)
    // refreshes the badge. Reviewed both ways — identity refetches a cheap
    // head-only count more often; length went stale on same-length mutations
    // (review r3, MEDIUM). Freshness wins; the seq ref handles overlap.
  }, [resources, filters.institution_id]);

  const canViewResources =
    isSuperAdmin || canAccess('resources.resources', 'view');
  const canCreateResources =
    isSuperAdmin || canAccess('resources.resources', 'create');
  const canEditResources =
    isSuperAdmin || canAccess('resources.resources', 'edit');
  const canDeleteResources =
    isSuperAdmin || canAccess('resources.resources', 'delete');


  // Handle search
  const handleSearch = useCallback(
    (search: string) => {
      updateFilters({ search, page: 1 });
    },
    [updateFilters]
  );

  // Handle filter changes
  const handleFilterChange = useCallback(
    (newFilters: Partial<ResourceFilters>) => {
      updateFilters(newFilters);
    },
    [updateFilters]
  );

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      changePage(page);
    },
    [changePage]
  );

  // Handle page size change
  const handlePageSizeChange = useCallback(
    (limit: number) => {
      updateFilters({ limit, page: 1 });
    },
    [updateFilters]
  );

  // Handle bulk delete action
  const handleBulkAction = useCallback(
    async (selectedRows: Resource[]) => {
      const ids = selectedRows.map((row) => row.id);
      await bulkDeleteResources(ids);
      fetchResources();
    },
    [bulkDeleteResources, fetchResources]
  );

  // Status colors
  const getStatusColor = (status: string) => {
    const colors = {
      available: 'bg-green-100 text-green-800',
      occupied: 'bg-blue-100 text-blue-800',
      maintenance: 'bg-yellow-100 text-yellow-800',
      retired: 'bg-gray-100 text-gray-800',
      inactive: 'bg-slate-200 text-slate-600'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  // Booking type colors
  const getBookingTypeColor = (type: string) => {
    const colors = {
      reservation: 'bg-purple-100 text-purple-800',
      walk_in: 'bg-indigo-100 text-indigo-800',
      both: 'bg-blue-100 text-blue-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  // Get resource initials for avatar fallback
  const getResourceInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Define columns for the DataTable
  const columns = [
    {
      id: 'name',
      header: 'Resource',
      accessorFn: (row: any) => row.name,
      cell: ({ row }: { row: any }) => {
        const resource = row.original;
        return (
          <div className='flex items-center space-x-3'>
            <Avatar className='h-10 w-10'>
              <AvatarImage src={resource.image_urls?.[0]} alt={resource.name} />
              <AvatarFallback className='bg-primary/10'>
                {resource.image_urls && resource.image_urls.length > 0 ? (
                  <ImageIcon className='h-4 w-4' />
                ) : (
                  getResourceInitials(resource.name)
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <Link
                href={`/resource-management/resources/${resource.id}`}
                className='font-medium hover:underline'
              >
                {resource.name}
              </Link>
              {resource.description && (
                <p className='text-sm text-muted-foreground line-clamp-1'>
                  {resource.description}
                </p>
              )}
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: 'parent_category',
      header: 'Category',
      cell: ({ row }: { row: any }) => (
        <div>
          <div className='font-medium'>
            {row.original.parent_category?.name || 'N/A'}
          </div>
          <div className='text-sm text-muted-foreground'>
            {row.original.subcategory?.name || 'N/A'}
          </div>
        </div>
      )
    },
    {
      accessorKey: 'institution',
      header: 'Institution',
      cell: ({ row }: { row: any }) => (
        <div>
          <div className='font-medium'>
            {row.original.institution?.name || 'N/A'}
          </div>
          {row.original.department && (
            <div className='text-sm text-muted-foreground'>
              {row.original.department.department_name}
            </div>
          )}
        </div>
      )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: { row: any }) => (
        <Badge className={getStatusColor(row.getValue('status'))}>
          {row.getValue('status')}
        </Badge>
      )
    },

    {
      accessorKey: 'current_stock_quantity',
      header: 'Stock',
      cell: ({ row }: { row: any }) => {
        const current = row.getValue('current_stock_quantity') as number;
        const initial = row.original.initial_stock_quantity;
        return (
          <div className='text-center'>
            <div className='font-medium'>{current || 0}</div>
            {initial && (
              <div className='text-xs text-muted-foreground'>of {initial}</div>
            )}
          </div>
        );
      }
    },

    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: { row: any }) => {
        const resource = row.original;
        return (
          <div className='flex items-center space-x-2'>
            <Button variant='ghost' size='icon' asChild>
              <Link href={`/resource-management/resources/${resource.id}`}>
                <Eye className='h-4 w-4' />
              </Link>
            </Button>
            {canEditResources && (
              <Button variant='ghost' size='icon' asChild>
                <Link
                  href={`/resource-management/resources/${resource.id}/edit`}
                >
                  <Edit className='h-4 w-4' />
                </Link>
              </Button>
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      permissions: {
        view: canViewResources,
        edit: canEditResources
      }
    }
  ];

  if (!canViewResources) {
    return <Loading title='Loading resources...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Resources'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchResources()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Table tools (Create button + bulk import controls)
  const tableTools = (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
      {canCreateResources && (
        <>
          <DownloadResourceTemplate />
          <BulkUploadResources onImported={fetchResources} />
        </>
      )}
      {canCreateResources ? (
        <Button asChild>
          <Link href='/resource-management/resources/new'>
            <Plus className='mr-2 h-4 w-4' />
            Create Resource
          </Link>
        </Button>
      ) : (
        <Button disabled variant='outline'>
          <Plus className='mr-2 h-4 w-4' />
          Create Resource
        </Button>
      )}
    </div>
  );

  // Server-side pagination configuration
  const serverSidePagination = {
    currentPage: metadata.page,
    totalPages: metadata.totalPages,
    pageSize: metadata.limit,
    totalItems: metadata.total,
    hasNextPage: metadata.page < metadata.totalPages,
    hasPreviousPage: metadata.page > 1,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
    isLoading: loading
  };

  return (
    <ContentLayout title='Resources'>
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
              <Link href='/resource-management'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Resources</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Resources</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage and track all your institutional resources
            </p>
            {((needsSetupCount ?? 0) > 0 || filters.needs_setup) && (
              <button
                type='button'
                className='mt-2'
                onClick={() =>
                  // Turning the badge ON clears the secondary filters (search /
                  // status / category / department / assignment) so the list
                  // shows exactly what the count counted — the badge total is
                  // institution-scoped only (review r2: count vs click-through).
                  handleFilterChange(
                    filters.needs_setup
                      ? { needs_setup: undefined, page: 1 }
                      : {
                          needs_setup: true,
                          search: undefined,
                          status: undefined,
                          parent_category_id: undefined,
                          subcategory_id: undefined,
                          department_id: undefined,
                          booking_type: undefined,
                          caretaker_user_ids: undefined,
                          available_on: undefined,
                          assignee_type: undefined,
                          assignee_id: undefined,
                          page: 1
                        }
                  )
                }
                title='Resources received via procurement that still need a room and caretaker. Click to filter.'
              >
                <Badge
                  className={
                    filters.needs_setup
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  }
                >
                  {/* null = count unavailable (fetch failed) — show a neutral
                      dash rather than a misleading 0 while the filter is on */}
                  Needs setup: {needsSetupCount ?? '—'}
                </Badge>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <ResourceFiltersComponent
          filters={filters}
          onFilterChange={updateFilters}
          onSearch={handleSearch}
        />

        <Card>
          <CardContent className='p-6'>
            {!loading &&
            !error &&
            resources.length === 0 &&
            !filters.search &&
            !filters.parent_category_id &&
            !filters.subcategory_id &&
            !filters.department_id &&
            !filters.status &&
            !filters.booking_type ? (
              <ResourceEmptyState />
            ) : (
              <DataTable
                columns={columns}
                data={resources}
                searchPlaceholder='Search resources by name or description...'
                onSearch={handleSearch}
                permissions={{
                  module: 'resources.resources',
                  actions: {
                    view: canViewResources,
                    create: canCreateResources,
                    edit: canEditResources,
                    delete: canDeleteResources
                  },
                  showPermissionError: true
                }}
                tableTools={tableTools}
                onBulkAction={canDeleteResources ? handleBulkAction : undefined}
                bulkActionConfig={
                  canDeleteResources
                    ? {
                        label: 'Delete Resources',
                        confirmTitle: 'Permanently Delete Resources',
                        confirmDescription:
                          'Are you sure you want to permanently delete the selected resources? This action is irreversible and cannot be undone.',
                        variant: 'destructive',
                        successMessage:
                          'Successfully deleted {count} resources',
                        errorMessage: 'Failed to delete resources'
                      }
                    : undefined
                }
                getRowId={(row) => row.id}
                onRefresh={fetchResources}
                showRefresh={true}
                serverSidePagination={serverSidePagination}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
