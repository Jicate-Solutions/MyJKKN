'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmploymentCategory } from '@/types/staff';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { CategoryService } from '@/lib/services/staff/category-service';

interface CategoryListProps {
  categories: EmploymentCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function CategoryList({
  categories,
  metadata,
  onPageChange,
  onRefresh,
  canEdit = false,
  canDelete = false
}: CategoryListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<EmploymentCategory | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const handleDelete = async () => {
    if (!categoryToDelete) return;

    try {
      setIsLoading(true);
      await CategoryService.deleteCategory(categoryToDelete.id);

      // Only update UI after successful deletion
      onRefresh();
      setCategoryToDelete(null);
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete category'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCategories.length === 0) return;

    try {
      setIsLoading(true);

      const result = await CategoryService.bulkDeleteCategories(
        selectedCategories
      );

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} categories`
        );
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} categories`);
        console.error('Failed deletions:', result.failed);
      }

      setSelectedCategories([]);
      onRefresh();
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete categories'
      );
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCategories.length === categories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(categories.map((c) => c.id));
    }
  };

  const toggleSelectCategory = (id: string) => {
    if (selectedCategories.includes(id)) {
      setSelectedCategories(selectedCategories.filter((catId) => catId !== id));
    } else {
      setSelectedCategories([...selectedCategories, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between'>
        {selectedCategories.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDelete || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedCategories.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedCategories.length > 0 ? 'ml-auto' : 'ml-auto'}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedCategories.length === categories.length &&
                    categories.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Category Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDelete ? 6 : 5}
                  className='text-center text-muted-foreground h-24'
                >
                  No categories found
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow
                  key={category.id}
                  className={
                    selectedCategories.includes(category.id)
                      ? 'bg-muted/50'
                      : ''
                  }
                >
                  {canDelete && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectCategory(category.id)}
                      >
                        {selectedCategories.includes(category.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className='font-medium'>
                    {category.category_name}
                  </TableCell>
                  <TableCell>{category.description || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={category.is_active ? 'default' : 'secondary'}
                    >
                      {category.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(category.created_at)}</TableCell>
                  <TableCell className='text-right'>
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
                            canDelete
                              ? () => setCategoryToDelete(category)
                              : undefined
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-end space-x-2 py-4'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page - 1)}
            disabled={metadata.page <= 1}
          >
            <ChevronLeft className='h-4 w-4' />
            <span className='sr-only'>Previous Page</span>
          </Button>
          <div className='text-sm text-muted-foreground'>
            Page {metadata.page} of {metadata.totalPages}
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(metadata.page + 1)}
            disabled={metadata.page >= metadata.totalPages}
          >
            <ChevronRight className='h-4 w-4' />
            <span className='sr-only'>Next Page</span>
          </Button>
        </div>
      )}

      {/* Single Category Delete Dialog */}
      <AlertDialog
        open={!!categoryToDelete && canDelete}
        onOpenChange={() => setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {categoryToDelete?.category_name}?
              This action cannot be undone, and will affect all staff members
              assigned to this category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog && canDelete}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Categories</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCategories.length}{' '}
              categories? This action cannot be undone and will affect all staff
              members assigned to these categories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading
                ? 'Deleting...'
                : `Delete ${selectedCategories.length} Categories`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
