'use client';

import { useState } from 'react';
import { Edit, Trash2, MoreHorizontal } from 'lucide-react';
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
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { toast } from 'react-hot-toast';
import type { BillingCategory } from '@/types/billing';

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

export function BillingCategoryList({
  categories,
  metadata,
  onPageChange,
  onRefresh
}: BillingCategoryListProps) {
  const [categoryToDelete, setCategoryToDelete] =
    useState<BillingCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('billing.categories', 'edit');
  const canDelete = isSuperAdmin || canAccess('billing.categories', 'delete');

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      setDeleting(true);
      await BillingCategoryService.deleteBillingCategory(categoryToDelete.id);
      toast.success(`Deleted "${categoryToDelete.category_name}"`);
      setCategoryToDelete(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const formatAmount = (amount?: number | null) =>
    amount == null ? '—' : `₹ ${Number(amount).toLocaleString('en-IN')}`;

  return (
    <>
      <div className='border rounded-md'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category Name</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='w-16 text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='text-center py-8 text-muted-foreground'
                >
                  No billing categories found.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <div className='font-medium'>{cat.category_name}</div>
                    {cat.description && (
                      <div className='text-xs text-muted-foreground'>
                        {cat.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{cat.institution?.name || '—'}</TableCell>
                  <TableCell>{formatAmount(cat.amount)}</TableCell>
                  <TableCell className='capitalize'>{cat.frequency}</TableCell>
                  <TableCell>
                    <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='icon'>
                          <MoreHorizontal className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {canEdit && (
                          <DropdownMenuItem asChild>
                            <Link href={`/billing/categories/${cat.id}/edit`}>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => setCategoryToDelete(cat)}
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
        <div className='flex items-center justify-between mt-4'>
          <div className='text-sm text-muted-foreground'>
            Page {metadata.page} of {metadata.totalPages} ({metadata.total}{' '}
            total)
          </div>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={metadata.page <= 1}
              onClick={() => onPageChange(metadata.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={metadata.page >= metadata.totalPages}
              onClick={() => onPageChange(metadata.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={(open) => !open && setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete billing category?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete &quot;{categoryToDelete?.category_name}
              &quot;. Existing student bills referencing this category will keep
              their record but lose the link. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
