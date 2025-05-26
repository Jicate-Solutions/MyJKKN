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
  AlertCircle,
  CheckSquare,
  Square,
  ArrowLeft,
  DollarSign,
  CreditCard
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
  const [selectedBills, setSelectedBills] = useState<string[]>([]);

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  const canDeleteBills =
    isSuperAdmin || canAccess('billing.schedule', 'delete');
  const canCreateReceipts =
    isSuperAdmin || canAccess('billing.receipts', 'create');
  const canApplyDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'create');
  const canProcessRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'create');

  // Filter bills based on status
  const filteredBills = useMemo(() => {
    if (statusFilter === 'all') return bills;
    return bills.filter((bill) => bill.status === statusFilter);
  }, [bills, statusFilter]);

  // Get bills that can be selected (unpaid and partially_paid)
  const selectableBills = filteredBills.filter(
    (bill) => bill.status === 'unpaid' || bill.status === 'partially_paid'
  );

  // Get currently selected bills from selectable bills
  const selectedSelectableBills = selectableBills.filter((bill) =>
    selectedBills.includes(bill.id)
  );

  // Calculate totals for selected bills
  const totalSelectedAmount = selectedSelectableBills.reduce(
    (sum, bill) => sum + bill.final_amount,
    0
  );

  const totalSelectedBalance = selectedSelectableBills.reduce(
    (sum, bill) =>
      sum + (bill.balance_amount > 0 ? bill.balance_amount : bill.final_amount),
    0
  );

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

  const canSelectBill = (bill: StudentBill) => {
    return bill.status === 'unpaid' || bill.status === 'partially_paid';
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

  const handleSelectBill = (billId: string, checked: boolean) => {
    if (checked) {
      setSelectedBills([...selectedBills, billId]);
    } else {
      setSelectedBills(selectedBills.filter((id) => id !== billId));
    }
  };

  const handleSelectAllSelectable = () => {
    const selectableBillIds = selectableBills.map((bill) => bill.id);

    if (selectedBills.length === selectableBillIds.length) {
      setSelectedBills([]);
    } else {
      setSelectedBills(selectableBillIds);
    }
  };

  const handleGenerateReceipt = () => {
    if (selectedSelectableBills.length === 0) return;

    const billIds = selectedSelectableBills.map((bill) => bill.id).join(',');
    const studentId = selectedSelectableBills[0]?.student_id;

    window.location.href = `/billing/receipts/new?bill_ids=${billIds}&student_id=${studentId}`;
  };

  const handleApplyDiscount = () => {
    if (selectedSelectableBills.length === 0) return;

    const billIds = selectedSelectableBills.map((bill) => bill.id).join(',');
    const studentId = selectedSelectableBills[0]?.student_id;

    window.location.href = `/billing/discounts/new?bill_ids=${billIds}&student_id=${studentId}`;
  };

  const handleProcessRefund = () => {
    if (selectedSelectableBills.length === 0) return;

    const billIds = selectedSelectableBills.map((bill) => bill.id).join(',');
    const studentId = selectedSelectableBills[0]?.student_id;

    window.location.href = `/billing/refunds/new?bill_ids=${billIds}&student_id=${studentId}`;
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
      {/* Enhanced Action Bar */}
      {selectedSelectableBills.length > 0 && (
        <div className='flex flex-col space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg'>
          {/* Selection Summary */}
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-4'>
              <span className='text-sm font-medium text-blue-900'>
                {selectedSelectableBills.length} bill(s) selected
              </span>
              <div className='flex items-center gap-4 text-sm text-blue-700'>
                <span>Total Amount: {formatCurrency(totalSelectedAmount)}</span>
                <span>Balance Due: {formatCurrency(totalSelectedBalance)}</span>
              </div>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setSelectedBills([])}
            >
              Clear Selection
            </Button>
          </div>

          {/* Action Buttons */}
          <div className='flex flex-wrap items-center gap-2'>
            {canCreateReceipts && (
              <Button
                size='sm'
                onClick={handleGenerateReceipt}
                className='bg-blue-600 hover:bg-blue-700'
              >
                <Receipt className='mr-2 h-4 w-4' />
                Generate Receipt ({selectedSelectableBills.length})
              </Button>
            )}

            {canApplyDiscounts && (
              <Button
                size='sm'
                variant='secondary'
                onClick={handleApplyDiscount}
                className='bg-green-600 hover:bg-green-700 text-white'
              >
                <Percent className='mr-2 h-4 w-4' />
                Apply Discount ({selectedSelectableBills.length})
              </Button>
            )}

            {canProcessRefunds &&
              selectedSelectableBills.some(
                (bill) => bill.status === 'partially_paid'
              ) && (
                <Button
                  size='sm'
                  variant='secondary'
                  onClick={handleProcessRefund}
                  className='bg-orange-600 hover:bg-orange-700 text-white'
                >
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Process Refund (
                  {
                    selectedSelectableBills.filter(
                      (bill) => bill.status === 'partially_paid'
                    ).length
                  }
                  )
                </Button>
              )}
          </div>
        </div>
      )}

      {/* Enhanced Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <div
                  className='flex items-center cursor-pointer'
                  onClick={handleSelectAllSelectable}
                >
                  {selectedBills.length > 0 &&
                  selectedBills.length === selectableBills.length ? (
                    <CheckSquare className='h-4 w-4 text-blue-600' />
                  ) : (
                    <Square className='h-4 w-4' />
                  )}
                </div>
              </TableHead>
              <TableHead>Bill Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className='text-right'>Amount</TableHead>
              <TableHead className='text-right'>Balance Due</TableHead>
              <TableHead className='text-center'>Status</TableHead>
              <TableHead className='text-center'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBills.map((bill) => (
              <TableRow key={bill.id} className='hover:bg-muted/50'>
                <TableCell>
                  {canSelectBill(bill) && (
                    <div
                      className='flex items-center cursor-pointer'
                      onClick={() =>
                        handleSelectBill(
                          bill.id,
                          !selectedBills.includes(bill.id)
                        )
                      }
                    >
                      {selectedBills.includes(bill.id) ? (
                        <CheckSquare className='h-4 w-4 text-blue-600' />
                      ) : (
                        <Square className='h-4 w-4' />
                      )}
                    </div>
                  )}
                </TableCell>
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
                      {formatCurrency(bill.final_amount)}
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
                      {bill.status === 'paid'
                        ? formatCurrency(0)
                        : formatCurrency(
                            bill.balance_amount > 0
                              ? bill.balance_amount
                              : bill.final_amount
                          )}
                    </div>
                    {bill.status === 'partially_paid' && (
                      <div className='text-xs text-green-600'>
                        Paid:{' '}
                        {formatCurrency(
                          bill.final_amount - bill.balance_amount
                        )}
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

                    {/* Individual Bill Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='sm'>
                          <DollarSign className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuLabel>Bill Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        {canSelectBill(bill) && canCreateReceipts && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/receipts/new?bill_id=${bill.id}&student_id=${bill.student_id}`}
                            >
                              <Receipt className='mr-2 h-4 w-4' />
                              Generate Receipt
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {canSelectBill(bill) && canApplyDiscounts && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/discounts/new?bill_id=${bill.id}&student_id=${bill.student_id}`}
                            >
                              <Percent className='mr-2 h-4 w-4' />
                              Apply Discount
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {bill.status === 'partially_paid' &&
                          canProcessRefunds && (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/billing/refunds/new?bill_id=${bill.id}&student_id=${bill.student_id}`}
                              >
                                <ArrowLeft className='mr-2 h-4 w-4' />
                                Process Refund
                              </Link>
                            </DropdownMenuItem>
                          )}

                        <DropdownMenuSeparator />

                        {canEditBills && bill.status !== 'paid' && (
                          <DropdownMenuItem asChild>
                            <Link href={`/billing/schedule/${bill.id}/edit`}>
                              <Edit className='mr-2 h-4 w-4' />
                              Edit Bill
                            </Link>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

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

      {/* Enhanced Summary */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm'>
        <div className='text-center p-3 bg-gray-50 rounded-lg'>
          <div className='text-muted-foreground'>Total Bills</div>
          <div className='font-semibold text-lg'>{filteredBills.length}</div>
        </div>
        <div className='text-center p-3 bg-blue-50 rounded-lg'>
          <div className='text-muted-foreground'>Total Amount</div>
          <div className='font-semibold text-lg text-blue-600'>
            {formatCurrency(
              filteredBills.reduce((sum, bill) => sum + bill.final_amount, 0)
            )}
          </div>
        </div>
        <div className='text-center p-3 bg-orange-50 rounded-lg'>
          <div className='text-muted-foreground'>Outstanding</div>
          <div className='font-semibold text-lg text-orange-600'>
            {formatCurrency(
              filteredBills
                .filter((bill) => bill.status !== 'paid')
                .reduce(
                  (sum, bill) =>
                    sum +
                    (bill.balance_amount > 0
                      ? bill.balance_amount
                      : bill.final_amount),
                  0
                )
            )}
          </div>
        </div>
        <div className='text-center p-3 bg-green-50 rounded-lg'>
          <div className='text-muted-foreground'>Selectable Bills</div>
          <div className='font-semibold text-lg text-green-600'>
            {selectableBills.length}
          </div>
        </div>
      </div>
    </div>
  );
}
