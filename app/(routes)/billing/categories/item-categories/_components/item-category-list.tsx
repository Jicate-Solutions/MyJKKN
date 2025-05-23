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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
  const { canAccess, isSuperAdmin } = usePermissions();

  const canEditItemCategories =
    isSuperAdmin || canAccess('billing.item_categories', 'edit');
  const canDeleteItemCategories =
    isSuperAdmin || canAccess('billing.item_categories', 'delete');

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

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
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell className='font-medium'>
                  {itemCategory.item_category_name}
                </TableCell>
                <TableCell>
                  {itemCategory.institution?.name} (
                  {itemCategory.institution?.counselling_code})
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
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
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
                          onClick={() =>
                            handleDelete(
                              itemCategory.id,
                              itemCategory.item_category_name
                            )
                          }
                          disabled={deletingId === itemCategory.id}
                          className='text-destructive'
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          {deletingId === itemCategory.id
                            ? 'Deleting...'
                            : 'Delete'}
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
    </div>
  );
}
