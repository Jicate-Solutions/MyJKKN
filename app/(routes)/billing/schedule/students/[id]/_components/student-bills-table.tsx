'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Eye,
  Edit,
  Trash2,
  Receipt,
  Percent,
  RefreshCw,
  Calendar,
  IndianRupee,
  FileText,
  AlertCircle
} from 'lucide-react';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
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
import type { StudentBill } from '@/types/billing-schedule';

interface StudentBillsTableProps {
  bills: StudentBill[];
  statusFilter: string;
  onRefresh: () => void;
}

export function StudentBillsTable({
  bills,
  statusFilter,
  onRefresh
}: StudentBillsTableProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  const canDeleteBills =
    isSuperAdmin || canAccess('billing.schedule', 'delete');

  // Filter bills based on status
  const filteredBills = useMemo(() => {
    if (statusFilter === 'all') return bills;
    return bills.filter((bill) => bill.status === statusFilter);
  }, [bills, statusFilter]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: {
        variant: 'default' as const,
        className: 'bg-green-100 text-green-800 border-green-200'
      },
      unpaid: {
        variant: 'secondary' as const,
        className: 'bg-orange-100 text-orange-800 border-orange-200'
      },
      partially_paid: {
        variant: 'outline' as const,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      overdue: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-800 border-red-200'
      },
      cancelled: {
        variant: 'outline' as const,
        className: 'bg-gray-100 text-gray-800 border-gray-200'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.unpaid;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const isOverdue = (dueDate: string, status: string) => {
    if (status === 'paid' || status === 'cancelled') return false;
    return new Date(dueDate) < new Date();
  };

  const handleDeleteBill = async (billId: string) => {
    try {
      setDeletingBillId(billId);
      // TODO: Implement delete bill functionality
      console.log('Deleting bill:', billId);
      onRefresh();
    } catch (error) {
      console.error('Error deleting bill:', error);
    } finally {
      setDeletingBillId(null);
    }
  };

  if (filteredBills.length === 0) {
    return (
      <div className='text-center py-12'>
        <FileText className='mx-auto h-12 w-12 text-muted-foreground' />
        <h3 className='mt-4 text-lg font-semibold'>
          {statusFilter === 'all'
            ? 'No bills found'
            : `No ${statusFilter.replace('_', ' ')} bills`}
        </h3>
        <p className='mt-2 text-muted-foreground'>
          {statusFilter === 'all'
            ? 'This student has no bills scheduled yet.'
            : `This student has no ${statusFilter.replace('_', ' ')} bills.`}
        </p>
        <Button variant='outline' onClick={onRefresh} className='mt-4'>
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className='text-right'>Amount</TableHead>
              <TableHead className='text-right'>Final Amount</TableHead>
              <TableHead className='text-center'>Status</TableHead>
              <TableHead className='text-center'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBills.map((bill) => (
              <TableRow key={bill.id} className='hover:bg-muted/50'>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='font-medium'>{bill.bill_description}</div>
                    {bill.remarks && (
                      <div className='text-xs text-muted-foreground'>
                        {bill.remarks}
                      </div>
                    )}
                    {bill.quantity > 1 && (
                      <div className='text-xs text-muted-foreground'>
                        Qty: {bill.quantity} ×{' '}
                        {formatCurrency(bill.unit_amount)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='space-y-1'>
                    <div className='text-sm font-medium'>
                      {bill.item_category?.item_category_name}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      {
                        bill.item_category?.parent_category
                          ?.parent_category_name
                      }{' '}
                      → {bill.item_category?.sub_category?.sub_category_name}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-4 w-4 text-muted-foreground' />
                    <div className='space-y-1'>
                      <div className='text-sm'>{formatDate(bill.due_date)}</div>
                      {isOverdue(bill.due_date, bill.status) && (
                        <div className='flex items-center gap-1 text-xs text-red-600'>
                          <AlertCircle className='h-3 w-3' />
                          Overdue
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className='text-right'>
                  <div className='space-y-1'>
                    <div className='font-medium'>
                      {formatCurrency(bill.total_amount)}
                    </div>
                    {bill.tax_amount > 0 && (
                      <div className='text-xs text-muted-foreground'>
                        Tax: {formatCurrency(bill.tax_amount)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-right'>
                  <div className='space-y-1'>
                    <div className='font-medium'>
                      {formatCurrency(bill.final_amount)}
                    </div>
                    {bill.balance_amount > 0 && (
                      <div className='text-xs text-orange-600'>
                        Balance: {formatCurrency(bill.balance_amount)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-center'>
                  {getStatusBadge(bill.status)}
                </TableCell>
                <TableCell className='text-center'>
                  <div className='flex items-center justify-center gap-1'>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant='ghost' size='sm' asChild>
                            <Link href={`/billing/schedule/${bill.id}`}>
                              <Eye className='h-4 w-4' />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View Details</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {bill.status === 'unpaid' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant='ghost' size='sm' asChild>
                              <Link
                                href={`/billing/receipts/new?bill_id=${bill.id}`}
                              >
                                <Receipt className='h-4 w-4' />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Create Receipt</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {canEditBills && bill.status !== 'paid' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant='ghost' size='sm' asChild>
                              <Link href={`/billing/schedule/${bill.id}/edit`}>
                                <Edit className='h-4 w-4' />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit Bill</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {canDeleteBills && bill.status !== 'paid' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='text-red-600 hover:text-red-700'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Bill</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this bill? This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteBill(bill.id)}
                              disabled={deletingBillId === bill.id}
                              className='bg-red-600 hover:bg-red-700'
                            >
                              {deletingBillId === bill.id
                                ? 'Deleting...'
                                : 'Delete'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className='flex items-center justify-between text-sm text-muted-foreground'>
        <div>
          Showing {filteredBills.length} of {bills.length} bills
        </div>
        <div className='flex items-center gap-4'>
          <div>
            Total Amount:{' '}
            {formatCurrency(
              filteredBills.reduce((sum, bill) => sum + bill.final_amount, 0)
            )}
          </div>
          <div>
            Outstanding:{' '}
            {formatCurrency(
              filteredBills
                .filter((bill) => bill.status !== 'paid')
                .reduce((sum, bill) => sum + bill.balance_amount, 0)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
