'use client';

import { useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, Eye, Image as ImageIcon, MoreHorizontal } from 'lucide-react';
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
  useParentCategories,
  useParentCategoryOperations
} from '@/hooks/resource-management/use-parent-categories';
import { ParentCategoryEmptyState } from './_components/parent-category-empty-state';
import type {
  ParentCategory,
  ParentCategoryFilters as ParentCategoryFiltersType
} from '@/types/resource-management';
import { CATEGORY_STATUS } from '@/types/resource-management';
import Loading from '@/components/Loading/Loading';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';

export default function ParentCategoriesPage() {
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
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories
  } = useParentCategories(initialFilters);

  const { deleteCategory, bulkDeleteCategories } = useParentCategoryOperations();

  const canViewCategories =
    isSuperAdmin || canAccess('resources.categories', 'view');
  const canCreateCategories =
    isSuperAdmin || canAccess('resources.categories', 'create');
  const canEditCategories =
    isSuperAdmin || canAccess('resources.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('resources.categories', 'delete');

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle search for server-side filtering
  const handleSearch = useCallback(
    (searchQuery: string) => {
      updateFilters({ search: searchQuery, page: 1 });
    },
    [updateFilters]
  );

  // Handle page changes for server-side pagination
  const handlePageChange = useCallback(
    (page: number) => {
      changePage(page);
    },
    [changePage]
  );

  // Handle page size changes
  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      updateFilters({ limit: pageSize, page: 1 });
    },
    [updateFilters]
  );

  // Handle bulk delete action
  const handleBulkAction = useCallback(
    async (selectedRows: ParentCategory[]) => {
      const ids = selectedRows.map((row) => row.id);
      await bulkDeleteCategories(ids);
      fetchCategories();
    },
    [bulkDeleteCategories, fetchCategories]
  );

  // Get status badge component
  const getStatusBadge = (status: string) => {
    switch (status) {
      case CATEGORY_STATUS.ACTIVE:
        return <Badge variant='default'>Active</Badge>;
      case CATEGORY_STATUS.INACTIVE:
        return <Badge variant='secondary'>Inactive</Badge>;
      case CATEGORY_STATUS.ARCHIVED:
        return <Badge variant='destructive'>Archived</Badge>;
      default:
        return <Badge variant='outline'>{status}</Badge>;
    }
  };

  // Get category initials for avatar fallback
  const getCategoryInitials = (name: string) => {
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
      header: 'Category',
      accessorFn: (row: any) => row.name,
      cell: ({ row }: { row: any }) => {
        const category = row.original;
        return (
          <div className='flex items-center space-x-3'>
            <Avatar className='h-10 w-10'>
              <AvatarImage src={category.image_url} alt={category.name} />
              <AvatarFallback className='bg-primary/10'>
                {category.image_url ? (
                  <ImageIcon className='h-4 w-4' />
                ) : (
                  getCategoryInitials(category.name)
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <Link
                href={`/resource-management/categories/${category.id}`}
                className='font-medium hover:underline'
              >
                {category.name}
              </Link>
              {category.description && (
                <p className='text-sm text-muted-foreground line-clamp-1'>
                  {category.description}
                </p>
              )}
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: { row: any }) => getStatusBadge(row.getValue('status'))
    },
    {
      accessorKey: 'subcategories_count',
      header: 'Subcategories',
      cell: ({ row }: { row: any }) => {
        const count = row.original.subcategories?.length || 0;
        return <span className='text-sm'>{count}</span>;
      }
    },
    {
      accessorKey: 'usage_count',
      header: 'Resources',
      cell: ({ row }: { row: any }) => {
        const count = (row.getValue('usage_count') as number) || 0;
        return <span className='text-sm'>{count}</span>;
      }
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }: { row: any }) => {
        const date = row.getValue('created_at') as string;
        return (
          <span className='text-sm text-muted-foreground'>
            {format(new Date(date), 'MMM dd, yyyy')}
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }: { row: any }) => {
        const category = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' className='h-8 w-8'>
                <MoreHorizontal className='h-4 w-4' />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem asChild>
                <Link href={`/resource-management/categories/${category.id}`}>
                  <Eye className='mr-2 h-4 w-4' />
                  View Details
                </Link>
              </DropdownMenuItem>
              {canEditCategories && (
                <DropdownMenuItem asChild>
                  <Link href={`/resource-management/categories/${category.id}/edit`}>
                    <Edit className='mr-2 h-4 w-4' />
                    Edit Category
                  </Link>
                </DropdownMenuItem>
              )}
              {canDeleteCategories && (
                <>
                  <DropdownMenuSeparator />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        className='text-destructive focus:text-destructive'
                        onSelect={(e) => e.preventDefault()}
                      >
                        <Trash2 className='mr-2 h-4 w-4' />
                        Delete Category
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &quot;{category.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this category and all its subcategories.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                          onClick={async () => {
                            try {
                              await deleteCategory(category.id);
                              fetchCategories();
                            } catch {
                              // toast already shown by hook
                            }
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableSorting: false,
      enableHiding: false
    }
  ];

  if (!canViewCategories) {
    return <Loading title='Loading resource categories...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Resource Categories'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchCategories()}
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
      {canCreateCategories ? (
        <Button asChild>
          <Link href='/resource-management/categories/new'>
            <Plus className='mr-2 h-4 w-4' />
            Create Category
          </Link>
        </Button>
      ) : (
        <Button disabled variant='outline'>
          <Plus className='mr-2 h-4 w-4' />
          Create Category
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
    <ContentLayout title='Resource Categories'>
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
            <BreadcrumbPage>Categories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Resource Categories</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage resource categories and subcategories for resource
              organization
            </p>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            {!loading &&
            !error &&
            categories.length === 0 &&
            !filters.search ? (
              <ParentCategoryEmptyState canCreate={canCreateCategories} />
            ) : (
              <DataTable
                columns={columns}
                data={categories}
                searchPlaceholder='Search categories by name or description...'
                onSearch={handleSearch}
                permissions={{
                  module: 'resources.categories',
                  actions: {
                    view: canViewCategories,
                    create: canCreateCategories,
                    edit: canEditCategories,
                    delete: canDeleteCategories
                  },
                  showPermissionError: true
                }}
                tableTools={tableTools}
                onBulkAction={
                  canDeleteCategories ? handleBulkAction : undefined
                }
                bulkActionConfig={
                  canDeleteCategories
                    ? {
                        label: 'Delete Categories',
                        confirmTitle: 'Permanently Delete Categories',
                        confirmDescription:
                          'Are you sure you want to permanently delete the selected categories? This action is irreversible and cannot be undone.',
                        variant: 'destructive',
                        successMessage:
                          'Successfully deleted {count} categories',
                        errorMessage: 'Failed to delete categories'
                      }
                    : undefined
                }
                getRowId={(row) => row.id}
                onRefresh={fetchCategories}
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
