// app/(routes)/resource-management/resources/page.tsx

'use client';

import { useEffect, useMemo, useCallback } from 'react';
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
import { ResourceEmptyState } from './_components/resource-empty-state';
import { ResourceFiltersComponent } from './_components/resource-filters';
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

  const canViewResources =
    isSuperAdmin || canAccess('resources.resources', 'view');
  const canCreateResources =
    isSuperAdmin || canAccess('resources.resources', 'create');
  const canEditResources =
    isSuperAdmin || canAccess('resources.resources', 'edit');
  const canDeleteResources =
    isSuperAdmin || canAccess('resources.resources', 'delete');

  useEffect(() => {
    fetchResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      retired: 'bg-gray-100 text-gray-800'
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

  // Table tools (Create button)
  const tableTools = (
    <>
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
    </>
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
