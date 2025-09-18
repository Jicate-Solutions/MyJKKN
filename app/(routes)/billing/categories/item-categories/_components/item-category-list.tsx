'use client';
import { useState } from 'react';
import {
  Edit,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  CheckSquare,
  Square
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import { toast } from 'react-hot-toast';
import type { BillingItemCategory } from '@/types/billing';

interface ItemCategoryListProps {
  itemCategories: BillingItemCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function ItemCategoryList({
  itemCategories,
  metadata,
  onPageChange,
  onRefresh
}: ItemCategoryListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<BillingItemCategory | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { canAccess, isSuperAdmin } = usePermissions();

  const canEditItemCategories =
    isSuperAdmin || canAccess('billing.item_categories', 'edit');
  const canDeleteItemCategories =
    isSuperAdmin || canAccess('billing.item_categories', 'delete');

  const handleDelete = async (id: string, name: string) => {
    // Create a more user-friendly toast confirmation
    const confirmed = await new Promise((resolve) => {
      toast((t) => (
        <div className="flex flex-col gap-3 max-w-xs">
          <div className="font-semibold text-sm">Delete "{name}"?</div>
          <div className="text-xs text-gray-600">
            This action cannot be undone.
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(true);
              }}
            >
              Delete
            </button>
            <button
              className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
              onClick={() => {
                toast.dismiss(t.id);
                resolve(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ), {
        duration: Infinity,
        position: 'top-center'
      });
    });

    if (!confirmed) return;

    try {
      setDeletingId(id);
      await BillingItemCategoryService.deleteBillingItemCategory(id);
      toast.success('Item category deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting item category:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete item category'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleSingleDelete = async () => {
    if (!categoryToDelete) return;

    try {
      setIsLoading(true);
      await BillingItemCategoryService.deleteBillingItemCategory(
        categoryToDelete.id
      );
      toast.success('Item category deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting item category:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete item category'
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

      // Delete categories one by one since there's no bulk delete service method
      const results = await Promise.allSettled(
        selectedCategories.map((id) =>
          BillingItemCategoryService.deleteBillingItemCategory(id)
        )
      );

      const successful = results.filter(
        (result) => result.status === 'fulfilled'
      ).length;
      const failed = results.filter(
        (result) => result.status === 'rejected'
      ).length;

      if (successful > 0) {
        toast.success(`${successful} item categories deleted successfully`);
      }

      if (failed > 0) {
        toast.error(`Failed to delete ${failed} item categories`);
      }

      setSelectedCategories([]);
      onRefresh();
    } catch (error) {
      console.error('Error deleting item categories:', error);
      toast.error('Failed to delete item categories');
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCategories.length === itemCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(itemCategories.map((cat) => cat.id));
    }
  };

  const toggleSelectCategory = (id: string) => {
    if (selectedCategories.includes(id)) {
      setSelectedCategories(selectedCategories.filter((catId) => catId !== id));
    } else {
      setSelectedCategories([...selectedCategories, id]);
    }
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'Not set';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatFrequency = (frequency: string) => {
    return (
      frequency.charAt(0).toUpperCase() + frequency.slice(1).replace('-', ' ')
    );
  };

  if (itemCategories.length === 0) {
    return (
      <div className='text-center py-8'>
        <p className='text-muted-foreground'>No item categories found.</p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedCategories.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteItemCategories || isLoading}
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
              {canDeleteItemCategories && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedCategories.length === itemCategories.length &&
                    itemCategories.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Item Category</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Parent Category</TableHead>
              <TableHead>Sub Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='w-[100px]'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemCategories.map((itemCategory) => (
              <TableRow key={itemCategory.id}>
                {canDeleteItemCategories && (
                  <TableCell>
                    <div
                      className='flex items-center'
                      onClick={() => toggleSelectCategory(itemCategory.id)}
                    >
                      {selectedCategories.includes(itemCategory.id) ? (
                        <CheckSquare className='h-4 w-4 cursor-pointer' />
                      ) : (
                        <Square className='h-4 w-4 cursor-pointer' />
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell className='font-medium'>
                  {itemCategory.item_category_name}
                </TableCell>
                <TableCell>
                  <div className='flex flex-col'>
                    <span className='font-medium'>
                      {itemCategory.institution?.name}
                    </span>
                    <span className='text-sm text-muted-foreground'>
                      {itemCategory.institution?.counselling_code}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {itemCategory.parent_category?.parent_category_name}
                </TableCell>
                <TableCell>
                  {itemCategory.sub_category?.sub_category_name}
                </TableCell>
                <TableCell>{formatCurrency(itemCategory.amount)}</TableCell>
                <TableCell>{formatFrequency(itemCategory.frequency)}</TableCell>
                <TableCell>
                  <Badge
                    variant={itemCategory.is_active ? 'default' : 'secondary'}
                  >
                    {itemCategory.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' className='h-8 w-8 p-0'>
                        <span className='sr-only'>Open menu</span>
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      {canEditItemCategories && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/billing/categories/item-categories/${itemCategory.id}/edit`}
                          >
                            <Edit className='mr-2 h-4 w-4' />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                      )}

                      {canDeleteItemCategories && (
                        <DropdownMenuItem
                          className='text-destructive'
                          onClick={() => setCategoryToDelete(itemCategory)}
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <p className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} results
          </p>
          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              Previous
            </Button>
            <span className='text-sm'>
              Page {metadata.page} of {metadata.totalPages}
            </span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Single delete confirmation dialog */}
      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={() => setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              item category &quot;{categoryToDelete?.item_category_name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSingleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Item Categories</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCategories.length} item
              categories? This action cannot be undone.
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
