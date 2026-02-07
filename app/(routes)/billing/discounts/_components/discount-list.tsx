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
  Percent,
  Eye,
  Check,
  X,
  FileText,
  Award
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { BillingDiscount } from '@/types/billing-schedule';
import { BillingDiscountService } from '@/lib/services/billing/discounts/billing-discount-service';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useApproveDiscount,
  useRejectDiscount
} from '@/hooks/billing/use-billing-discounts';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface DiscountListProps {
  discounts: BillingDiscount[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function DiscountList({
  discounts,
  metadata,
  onPageChange,
  onRefresh
}: DiscountListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [discountToDelete, setDiscountToDelete] =
    useState<BillingDiscount | null>(null);
  const [selectedDiscounts, setSelectedDiscounts] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    discountId: string;
  }>({
    open: false,
    discountId: ''
  });
  const [rejectionReason, setRejectionReason] = useState('');

  const { canAccess, isSuperAdmin } = usePermissions();
  const approveDiscountMutation = useApproveDiscount();
  const rejectDiscountMutation = useRejectDiscount();

  const canViewDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'view');
  const canEditDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'edit');
  const canDeleteDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'delete');
  const canApproveDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'approve');

  const handleDelete = async () => {
    if (!discountToDelete) return;

    try {
      setIsLoading(true);
      await BillingDiscountService.deleteBillingDiscount(discountToDelete.id);
      toast.success('Discount deleted successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting discount:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete discount'
      );
    } finally {
      setIsLoading(false);
      setDiscountToDelete(null);
    }
  };

  const handleApprove = async (discountId: string) => {
    try {
      await approveDiscountMutation.mutateAsync(discountId);
      onRefresh();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleReject = async () => {
    if (!rejectionReason || !rejectDialog.discountId) return;

    try {
      await rejectDiscountMutation.mutateAsync({
        id: rejectDialog.discountId,
        reason: rejectionReason
      });
      setRejectDialog({ open: false, discountId: '' });
      setRejectionReason('');
      onRefresh();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const toggleSelectAll = () => {
    if (selectedDiscounts.length === discounts.length) {
      setSelectedDiscounts([]);
    } else {
      setSelectedDiscounts(discounts.map((discount) => discount.id));
    }
  };

  const toggleSelectDiscount = (id: string) => {
    if (selectedDiscounts.includes(id)) {
      setSelectedDiscounts(
        selectedDiscounts.filter((discountId) => discountId !== id)
      );
    } else {
      setSelectedDiscounts([...selectedDiscounts, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getDiscountCategoryBadge = (category: string) => {
    const categoryConfig = {
      merit_scholarship: {
        variant: 'default' as const,
        label: 'Merit Scholarship'
      },
      financial_aid: { variant: 'secondary' as const, label: 'Financial Aid' },
      staff_quota: { variant: 'outline' as const, label: 'Staff Quota' },
      sports_quota: { variant: 'secondary' as const, label: 'Sports Quota' },
      special_circumstances: {
        variant: 'outline' as const,
        label: 'Special Circumstances'
      }
    };

    const config = categoryConfig[category as keyof typeof categoryConfig] || {
      variant: 'secondary' as const,
      label: category.replace('_', ' ').toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDiscountTypeBadge = (type: string) => {
    const typeConfig = {
      amount: { variant: 'default' as const, label: 'Fixed Amount' },
      percentage: { variant: 'secondary' as const, label: 'Percentage' }
    };

    const config = typeConfig[type as keyof typeof typeConfig] || {
      variant: 'secondary' as const,
      label: type.toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getApprovalStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        variant: 'outline' as const,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      approved: {
        variant: 'default' as const,
        className: 'bg-green-100 text-green-800 border-green-200'
      },
      rejected: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-800 border-red-200'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getOutcomeStatusBadge = (discount: BillingDiscount) => {
    if (!discount.is_outcome_based) return null;

    const verificationStatus = discount.outcome_verification?.status || 'pending';
    const statusConfig = {
      pending: {
        className: 'bg-amber-100 text-amber-800 border-amber-200',
        label: 'Outcome Pending'
      },
      verified: {
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        label: 'Outcome Verified'
      },
      rejected: {
        className: 'bg-red-100 text-red-800 border-red-200',
        label: 'Outcome Rejected'
      }
    };

    const config = statusConfig[verificationStatus as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <Badge variant='outline' className={config.className}>
        <Award className='mr-1 h-3 w-3' />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedDiscounts.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteDiscounts || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedDiscounts.length})
          </Button>
        )}

        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedDiscounts.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewDiscounts}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteDiscounts && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedDiscounts.length === discounts.length &&
                    discounts.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Student</TableHead>
              <TableHead>Bill Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Effective Date</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {discounts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteDiscounts ? 11 : 10}
                  className='text-center py-8'
                >
                  <div className='flex flex-col items-center space-y-3'>
                    <Percent className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>No discounts found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              discounts.map((discount) => (
                <TableRow key={discount.id}>
                  {canDeleteDiscounts && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectDiscount(discount.id)}
                      >
                        {selectedDiscounts.includes(discount.id) ? (
                          <CheckSquare className='h-4 w-4 cursor-pointer' />
                        ) : (
                          <Square className='h-4 w-4 cursor-pointer' />
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>
                        {`${discount.bill?.student?.first_name} ${
                          discount.bill?.student?.last_name || ''
                        }`.trim()}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        {discount.bill?.student?.roll_number}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col max-w-xs'>
                      <span className='font-medium truncate'>
                        {discount.bill?.bill_description}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        Total:{' '}
                        {formatCurrency(discount.bill?.total_amount || 0)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getDiscountCategoryBadge(discount.discount_category)}
                  </TableCell>
                  <TableCell>
                    {getDiscountTypeBadge(discount.discount_type)}
                  </TableCell>
                  <TableCell>
                    {discount.discount_type === 'percentage'
                      ? `${discount.discount_value}%`
                      : formatCurrency(discount.discount_value)}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(discount.discount_amount)}
                  </TableCell>
                  <TableCell>
                    {getApprovalStatusBadge(discount.approval_status)}
                  </TableCell>
                  <TableCell>{formatDate(discount.effective_date)}</TableCell>
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

                        <DropdownMenuItem asChild>
                          <Link href={`/billing/discounts/${discount.id}`}>
                            <Eye className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>

                        {discount.approval_status === 'pending' &&
                          canApproveDiscounts && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleApprove(discount.id)}
                                disabled={approveDiscountMutation.isPending}
                                className='text-green-600'
                              >
                                <Check className='mr-2 h-4 w-4' />
                                Approve
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() =>
                                  setRejectDialog({
                                    open: true,
                                    discountId: discount.id
                                  })
                                }
                                className='text-red-600'
                              >
                                <X className='mr-2 h-4 w-4' />
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}

                        {canEditDiscounts && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/discounts/${discount.id}/edit`}
                            >
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {canDeleteDiscounts && (
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => setDiscountToDelete(discount)}
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!discountToDelete}
        onOpenChange={() => setDiscountToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              discount for &quot;
              {`${discountToDelete?.bill?.student?.first_name} ${
                discountToDelete?.bill?.student?.last_name || ''
              }`.trim()}
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

      {/* Reject dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) =>
          setRejectDialog({
            open,
            discountId: open ? rejectDialog.discountId : ''
          })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Scholarship</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='reason'>Rejection Reason</Label>
              <Textarea
                id='reason'
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder='Enter reason for rejection'
                rows={3}
              />
            </div>
            <div className='flex justify-end space-x-2'>
              <Button
                variant='outline'
                onClick={() => setRejectDialog({ open: false, discountId: '' })}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={!rejectionReason || rejectDiscountMutation.isPending}
                variant='destructive'
              >
                {rejectDiscountMutation.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
