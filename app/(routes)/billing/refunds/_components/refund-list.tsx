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
  CreditCard,
  Eye,
  Check,
  X,
  FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { BillingRefund } from '@/types/billing-schedule';
import { BillingRefundService } from '@/lib/services/billing/refunds/billing-refund-service';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useApproveRefund,
  useProcessRefund
} from '@/hooks/billing/use-billing-refunds';
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

interface RefundListProps {
  refunds: BillingRefund[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function RefundList({
  refunds,
  metadata,
  onPageChange,
  onRefresh
}: RefundListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [refundToDelete, setRefundToDelete] = useState<BillingRefund | null>(
    null
  );
  const [selectedRefunds, setSelectedRefunds] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const { canAccess, isSuperAdmin } = usePermissions();
  const approveRefundMutation = useApproveRefund();
  const processRefundMutation = useProcessRefund();

  const canViewRefunds = isSuperAdmin || canAccess('billing.refunds', 'view');
  const canEditRefunds = isSuperAdmin || canAccess('billing.refunds', 'edit');
  const canDeleteRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'delete');
  const canApproveRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'approve');

  const handleDelete = async () => {
    if (!refundToDelete) return;

    try {
      setIsLoading(true);
      await BillingRefundService.deleteBillingRefund(refundToDelete.id);
      toast.success('Refund cancelled successfully');
      onRefresh();
    } catch (error) {
      console.error('Error deleting refund:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to cancel refund'
      );
    } finally {
      setIsLoading(false);
      setRefundToDelete(null);
    }
  };

  const handleApprove = async (refundId: string) => {
    try {
      await approveRefundMutation.mutateAsync(refundId);
      onRefresh();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleProcess = async (refundId: string) => {
    try {
      await processRefundMutation.mutateAsync(refundId);
      onRefresh();
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const toggleSelectAll = () => {
    if (selectedRefunds.length === refunds.length) {
      setSelectedRefunds([]);
    } else {
      setSelectedRefunds(refunds.map((refund) => refund.id));
    }
  };

  const toggleSelectRefund = (id: string) => {
    if (selectedRefunds.includes(id)) {
      setSelectedRefunds(selectedRefunds.filter((refundId) => refundId !== id));
    } else {
      setSelectedRefunds([...selectedRefunds, id]);
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

  const getRefundCategoryBadge = (category: string) => {
    const categoryConfig = {
      overpayment: { variant: 'default' as const, label: 'Overpayment' },
      duplicate_payment: {
        variant: 'secondary' as const,
        label: 'Duplicate Payment'
      },
      withdrawal: { variant: 'outline' as const, label: 'Withdrawal' },
      fee_adjustment: {
        variant: 'secondary' as const,
        label: 'Fee Adjustment'
      },
      other: { variant: 'outline' as const, label: 'Other' }
    };

    const config = categoryConfig[category as keyof typeof categoryConfig] || {
      variant: 'secondary' as const,
      label: category.replace('_', ' ').toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getRefundMethodBadge = (method: string) => {
    const methodConfig = {
      bank_transfer: { variant: 'default' as const, label: 'Bank Transfer' },
      cash: { variant: 'secondary' as const, label: 'Cash' },
      cheque: { variant: 'outline' as const, label: 'Cheque' },
      online: { variant: 'secondary' as const, label: 'Online' }
    };

    const config = methodConfig[method as keyof typeof methodConfig] || {
      variant: 'secondary' as const,
      label: method.toUpperCase()
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
        className: 'bg-blue-100 text-blue-800 border-blue-200'
      },
      completed: {
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

  return (
    <div className='space-y-4'>
      <div className='flex justify-between items-center'>
        {selectedRefunds.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={!canDeleteRefunds || isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Cancel Selected ({selectedRefunds.length})
          </Button>
        )}

        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedRefunds.length > 0 ? 'ml-auto' : 'ml-auto'}
          disabled={!canViewRefunds}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canDeleteRefunds && (
                <TableHead className='w-12'>
                  <div className='flex items-center' onClick={toggleSelectAll}>
                    {selectedRefunds.length === refunds.length &&
                    refunds.length > 0 ? (
                      <CheckSquare className='h-4 w-4 cursor-pointer' />
                    ) : (
                      <Square className='h-4 w-4 cursor-pointer' />
                    )}
                  </div>
                </TableHead>
              )}
              <TableHead>Student</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Net Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {refunds.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canDeleteRefunds ? 10 : 9}
                  className='text-center py-8'
                >
                  <div className='flex flex-col items-center space-y-3'>
                    <CreditCard className='h-8 w-8 text-muted-foreground' />
                    <p className='text-muted-foreground'>No refunds found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              refunds.map((refund) => (
                <TableRow key={refund.id}>
                  {canDeleteRefunds && (
                    <TableCell>
                      <div
                        className='flex items-center'
                        onClick={() => toggleSelectRefund(refund.id)}
                      >
                        {selectedRefunds.includes(refund.id) ? (
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
                        {`${refund.receipt?.student?.first_name} ${
                          refund.receipt?.student?.last_name || ''
                        }`.trim()}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        {refund.receipt?.student?.roll_number}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col'>
                      <span className='font-medium'>
                        {refund.receipt?.receipt_number}
                      </span>
                      <span className='text-sm text-muted-foreground'>
                        Paid:{' '}
                        {formatCurrency(refund.receipt?.payment_amount || 0)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getRefundCategoryBadge(refund.refund_category)}
                  </TableCell>
                  <TableCell>
                    {getRefundMethodBadge(refund.refund_method)}
                  </TableCell>
                  <TableCell>{formatCurrency(refund.refund_amount)}</TableCell>
                  <TableCell>
                    {formatCurrency(refund.net_refund_amount)}
                  </TableCell>
                  <TableCell>
                    {getApprovalStatusBadge(refund.approval_status)}
                  </TableCell>
                  <TableCell>{formatDate(refund.refund_date)}</TableCell>
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
                          <Link href={`/billing/refunds/${refund.id}`}>
                            <Eye className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>

                        {refund.approval_status === 'pending' &&
                          canApproveRefunds && (
                            <DropdownMenuItem
                              onClick={() => handleApprove(refund.id)}
                              disabled={approveRefundMutation.isPending}
                              className='text-green-600'
                            >
                              <Check className='mr-2 h-4 w-4' />
                              Approve
                            </DropdownMenuItem>
                          )}

                        {refund.approval_status === 'approved' &&
                          canApproveRefunds && (
                            <DropdownMenuItem
                              onClick={() => handleProcess(refund.id)}
                              disabled={processRefundMutation.isPending}
                              className='text-blue-600'
                            >
                              <FileText className='mr-2 h-4 w-4' />
                              Process
                            </DropdownMenuItem>
                          )}

                        {canEditRefunds && (
                          <DropdownMenuItem asChild>
                            <Link href={`/billing/refunds/${refund.id}/edit`}>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {canDeleteRefunds && (
                          <DropdownMenuItem
                            className='text-destructive'
                            onClick={() => setRefundToDelete(refund)}
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Cancel
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
        open={!!refundToDelete}
        onOpenChange={() => setRefundToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently cancel the
              refund for &quot;
              {`${refundToDelete?.receipt?.student?.first_name} ${
                refundToDelete?.receipt?.student?.last_name || ''
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
              {isLoading ? 'Cancelling...' : 'Cancel Refund'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
