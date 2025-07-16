'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';
import { EmploymentCategory } from '@/types/staff';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import {
  useDeleteCategory,
  useBulkDeleteCategories
} from '@/hooks/staff/use-categories';
import { toast } from 'react-hot-toast';

interface CategoryListProps {
  categories: EmploymentCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function CategoryList({
  categories,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  canEdit = false,
  canDelete = false
}: CategoryListProps) {
  // React Query mutations
  const deleteCategory = useDeleteCategory();
  const bulkDeleteCategories = useBulkDeleteCategories();

  // Handle single category deletion
  const handleDeleteCategory = async (category: EmploymentCategory) => {
    try {
      await deleteCategory.mutateAsync(category.id);
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete category'
      );
    }
  };

  // Handle bulk deletion through DataTable
  const handleBulkDelete = async (selectedRows: EmploymentCategory[]) => {
    if (selectedRows.length === 0) return;

    try {
      const categoryIds = selectedRows.map((category) => category.id);
      const result = await bulkDeleteCategories.mutateAsync(categoryIds);

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} categories`
        );
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} categories`);
        console.error('Failed deletions:', result.failed);
      }
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete categories'
      );
    }
  };

  // Format date helper
  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  // Column definitions for DataTable
  const columns = useMemo<PermissionColumnDef<EmploymentCategory, any>[]>(
    () => [
      {
        accessorKey: 'category_name',
        header: 'Category Name',
        cell: ({ row }) => (
          <div className='font-medium'>{row.getValue('category_name')}</div>
        )
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => {
          const description = row.getValue('description') as string | null;
          return <div>{description || 'N/A'}</div>;
        }
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => {
          const isActive = row.getValue('is_active') as boolean;
          return (
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          );
        }
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          const date = row.getValue('created_at') as string;
          return <div>{formatDate(date)}</div>;
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const category = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  asChild={canEdit}
                  disabled={!canEdit}
                  style={{ opacity: canEdit ? 1 : 0.5 }}
                >
                  {canEdit ? (
                    <Link
                      href={`/staff/category/${category.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Category
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Category
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDelete ? () => handleDeleteCategory(category) : undefined
                  }
                  disabled={!canDelete}
                  className={
                    canDelete
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDelete ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Category
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false
      }
    ],
    [canEdit, canDelete]
  );

  // Server-side pagination configuration
  const serverSidePagination = {
    currentPage: metadata.page,
    totalPages: metadata.totalPages,
    pageSize: metadata.limit,
    totalItems: metadata.total,
    hasNextPage: metadata.page < metadata.totalPages,
    hasPreviousPage: metadata.page > 1,
    onPageChange,
    onPageSizeChange
  };

  // Bulk action configuration
  const bulkActionConfig = {
    label: 'Delete',
    icon: Trash2,
    variant: 'destructive' as const,
    confirmTitle: 'Delete Categories',
    confirmDescription:
      'This will permanently delete {count} categor{plural}. This action cannot be undone and will affect all staff members assigned to these categories.',
    successMessage: 'Successfully deleted {count} categor{plural}',
    errorMessage: 'Failed to delete selected categories',
    loadingText: 'Deleting...'
  };

  return (
    <DataTable
      columns={columns}
      data={categories}
      searchPlaceholder='Search categories...'
      filterColumn='category_name'
      permissions={{
        module: 'staff',
        actions: {
          view: true,
          edit: canEdit,
          delete: canDelete
        }
      }}
      onBulkAction={canDelete ? handleBulkDelete : undefined}
      bulkActionConfig={canDelete ? bulkActionConfig : undefined}
      serverSidePagination={serverSidePagination}
      onRefresh={onRefresh}
      getRowId={(row) => row.id}
    />
  );
}
