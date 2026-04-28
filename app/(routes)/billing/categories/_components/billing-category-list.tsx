'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  CheckSquare,
  Square,
  Tags
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { BillingCategory } from '@/types/billing';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { usePermissions } from '@/hooks/use-permissions';
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
import { Pagination } from '@/components/pagination';

interface BillingCategoryListProps {
  categories: BillingCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

const frequencyLabel: Record<BillingCategory['frequency'], string> = {
  'one-time': 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly'
};

export function BillingCategoryList({
  categories,
  metadata,
  onPageChange,
  onRefresh
}: BillingCategoryListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<BillingCategory | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditCategories =
    isSuperAdmin || canAccess('billing.categories', 'edit');
  const canDeleteCategories =
    isSuperAdmin || canAccess('billing.categories', 'delete');
  const canViewCategories =
    isSuperAdmin || canAccess('billing.categories', 'view');

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      setIsLoading(true);
      await BillingCategoryService.deleteBillingCategory(categoryToDelete.id);
      toast.success('Billing category deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('[billing/categories] Error deleting category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete category'
      );
    } finally {
      setIsLoading(false);
      setCategoryToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCategories.length === 0) return;
    try {
      setIsLoading(true);
      const result =
        await BillingCategoryService.bulkDeleteBillingCategories(
          selectedCategories
        );

      if (result.success.length > 0) {
        toast.success(
          `${result.success.length} categor${
            result.success.length === 1 ? 'y' : 'ies'
          } deleted successfully`
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `Failed to delete ${result.failed.length} categor${
            result.failed.length === 1 ? 'y' : 'ies'
          } — ${result.failed[0].error}`
        );
      }

      setSelectedCategories([]);
      onRefresh();
    } catch (error) {
      console.error('[billing/categories] Error in bulk delete:', error);
      toast.error('Failed to delete categories');
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCategories.length === categories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(categories.map((cat) => cat.id));
    }
  };

  const toggleSelectCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  };

  const formatDate = (date: string) => format(new Date(date), 'MMM d, yyyy');
  const formatAmount = (amount: number | null) =>
    amount === null
      ? '—'
      : new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          minimumFractionDigits: 2
        }).format(amount);

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedCategories.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteCategories || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedCategories.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className='ml-auto'
          disabled={!canViewCategories}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteCategories && (
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
              <TableHead>Frequency</TableHead>
              <TableHead>Default Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteCategories ? 7 : 6}
                  className='text-center py-8'
                >
                  <div className='flex flex-col items-center space-y-3'>
                    <Tags className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>
                      No billing categories found
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <TableRow key={category.id}>
                  {canDeleteCategories && (
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
                    <div className='flex flex-col'>
                      <span>{category.category_name}</span>
                      {category.description && (
                        <span className='text-xs text-muted-foreground line-clamp-1'>
                          {category.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>
                      {frequencyLabel[category.frequency]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatAmount(category.amount)}</TableCell>
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
                        <DropdownMenuSeparator />
                        {canEditCategories && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/categories/${category.id}/edit`}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {canDeleteCategories && (
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => setCategoryToDelete(category)}
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Delete
                          </DropdownMenuItem>
                        )}
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
        <Pagination
          currentPage={metadata.page}
          totalPages={metadata.totalPages}
          onPageChange={onPageChange}
        />
      )}

      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={() => setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;
              {categoryToDelete?.category_name}&quot;. The action will fail if
              any student bill still references this category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete multiple categories?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete {selectedCategories.length} categor
              {selectedCategories.length === 1 ? 'y' : 'ies'}. Any that are
              referenced by existing bills will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
