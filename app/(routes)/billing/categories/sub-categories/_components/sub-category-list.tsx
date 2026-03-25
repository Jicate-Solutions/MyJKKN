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
  Building2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BillingSubCategory } from '@/types/billing';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
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

interface SubCategoryListProps {
  subCategories: BillingSubCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function SubCategoryList({
  subCategories,
  metadata,
  onPageChange,
  onRefresh
}: SubCategoryListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [subCategoryToDelete, setSubCategoryToDelete] =
    useState<BillingSubCategory | null>(null);
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>(
    []
  );
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewSubCategories =
    isSuperAdmin || canAccess('billing.sub_categories', 'view');
  const canEditSubCategories =
    isSuperAdmin || canAccess('billing.sub_categories', 'edit');
  const canDeleteSubCategories =
    isSuperAdmin || canAccess('billing.sub_categories', 'delete');

  const handleDelete = async () => {
    if (!subCategoryToDelete) return;

    try {
      setIsLoading(true);
      await BillingSubCategoryService.deleteBillingSubCategory(
        subCategoryToDelete.id
      );
      toast.success('Sub category deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting sub category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete sub category'
      );
    } finally {
      setIsLoading(false);
      setSubCategoryToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSubCategories.length === 0) return;

    try {
      setIsLoading(true);
      const result =
        await BillingSubCategoryService.bulkDeleteBillingSubCategories(
          selectedSubCategories
        );

      if (result.success.length > 0) {
        toast.success(
          `${result.success.length} sub categories deleted successfully`
        );
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} sub categories`);
      }

      setSelectedSubCategories([]);
      onRefresh();
    } catch (error) {
      console.error('Error deleting sub categories:', error);
      toast.error('Failed to delete sub categories');
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSubCategories.length === subCategories.length) {
      setSelectedSubCategories([]);
    } else {
      setSelectedSubCategories(subCategories.map((cat) => cat.id));
    }
  };

  const toggleSelectSubCategory = (id: string) => {
    if (selectedSubCategories.includes(id)) {
      setSelectedSubCategories(
        selectedSubCategories.filter((catId) => catId !== id)
      );
    } else {
      setSelectedSubCategories([...selectedSubCategories, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedSubCategories.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteSubCategories || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedSubCategories.length})
          </Button>
        )}

        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedSubCategories.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewSubCategories}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteSubCategories && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedSubCategories.length === subCategories.length &&
                    subCategories.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Sub Category Name</TableHead>
              <TableHead>Parent Category</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created Date</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subCategories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteSubCategories ? 7 : 6}
                  className='text-center py-8'
                >
                  <div className='flex flex-col items-center space-y-3'>
                    <Building2 className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>
                      No sub categories found
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              subCategories.map((subCategory) => (
                <TableRow key={subCategory.id}>
                  {canDeleteSubCategories && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectSubCategory(subCategory.id)}
                      >
                        {selectedSubCategories.includes(subCategory.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className='font-medium'>
                    {subCategory.sub_category_name}
                  </TableCell>
                  <TableCell>
                    <span className='font-medium'>
                      {subCategory.parent_category?.parent_category_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>
                        {subCategory.institution?.name}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        {subCategory.institution?.counselling_code}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={subCategory.is_active ? 'default' : 'secondary'}
                    >
                      {subCategory.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(subCategory.created_at)}</TableCell>
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

                        {canEditSubCategories && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/categories/sub-categories/${subCategory.id}/edit`}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {canDeleteSubCategories && (
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => setSubCategoryToDelete(subCategory)}
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!subCategoryToDelete}
        onOpenChange={() => setSubCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the sub
              category &quot;{subCategoryToDelete?.sub_category_name}
              &quot;.
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

      {/* Bulk delete confirmation dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Sub Categories</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedSubCategories.length} sub
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
