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
  CreditCard,
  Filter,
  EllipsisVertical,
  MoreHorizontal,
  Undo
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
import { Card } from '@/components/ui/card';

interface StudentBillsTableProps {
  bills: StudentBill[];
  statusFilter: string;
  onRefresh: () => void;
  isStudentView?: boolean; // New prop to indicate if viewing as student
}

export function StudentBillsTable({
  bills,
  statusFilter,
  onRefresh,
  isStudentView = false
}: StudentBillsTableProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [selectedBills, setSelectedBills] = useState<string[]>([]);

  // Students have view-only access - hide all action permissions
  const canEditBills = !isStudentView && (isSuperAdmin || canAccess('billing.schedule', 'update'));
  const canDeleteBills =
    !isStudentView && (isSuperAdmin || canAccess('billing.schedule', 'delete'));
  const canCreateReceipts =
    !isStudentView && (isSuperAdmin || canAccess('billing.receipts', 'create'));
  const canApplyDiscounts =
    !isStudentView && (isSuperAdmin || canAccess('billing.discounts', 'create'));
  const canProcessRefunds =
    !isStudentView && (isSuperAdmin || canAccess('billing.refunds', 'create'));

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
      },
      refunded: {
        variant: 'outline' as const,
        className: 'bg-purple-100 text-purple-800 border-purple-200'
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
    // Students cannot select bills (view-only access)
    if (isStudentView) return false;
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

  return (
    <div className='space-y-4'>
      {/* Enhanced Action Bar - Responsive */}
      {selectedSelectableBills.length > 0 && (
        <div className='p-3 sm:p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg'>
          {/* Selection Summary - Mobile Friendly */}
          <div className='flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between'>
            <div className='space-y-2 sm:space-y-0'>
              <span className='text-sm font-medium text-blue-900 dark:text-blue-100'>
                {selectedSelectableBills.length} bill(s) selected
              </span>
              <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-blue-700 dark:text-blue-300'>
                <span className='flex items-center gap-1'>
                  <IndianRupee className='h-3 w-3' />
                  Total: {formatCurrency(totalSelectedAmount)}
                </span>
                <span className='flex items-center gap-1'>
                  <CreditCard className='h-3 w-3' />
                  Balance: {formatCurrency(totalSelectedBalance)}
                </span>
              </div>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setSelectedBills([])}
              className='self-start sm:self-auto'
            >
              Clear Selection
            </Button>
          </div>

          {/* Action Buttons - Mobile Responsive */}
          <div className='flex flex-col sm:flex-row gap-2 mt-3 sm:mt-4'>
            {canCreateReceipts && (
              <Button
                size='sm'
                onClick={handleGenerateReceipt}
                className='bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 flex-1 sm:flex-initial'
              >
                <Receipt className='mr-2 h-4 w-4' />
                <span className='hidden sm:inline'>Generate Receipt</span>
                <span className='sm:hidden'>Receipt</span>
                <span className='ml-1'>({selectedSelectableBills.length})</span>
              </Button>
            )}

            {canApplyDiscounts && (
              <Button
                size='sm'
                variant='secondary'
                onClick={handleApplyDiscount}
                className='bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600 flex-1 sm:flex-initial'
              >
                <Percent className='mr-2 h-4 w-4' />
                <span className='hidden sm:inline'>Apply Discount</span>
                <span className='sm:hidden'>Discount</span>
                <span className='ml-1'>({selectedSelectableBills.length})</span>
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
                  className='bg-orange-600 hover:bg-orange-700 text-white dark:bg-orange-700 dark:hover:bg-orange-600 flex-1 sm:flex-initial'
                >
                  <RefreshCw className='mr-2 h-4 w-4' />
                  <span className='hidden sm:inline'>Process Refund</span>
                  <span className='sm:hidden'>Refund</span>
                  <span className='ml-1'>
                    (
                    {
                      selectedSelectableBills.filter(
                        (bill) => bill.status === 'partially_paid'
                      ).length
                    }
                    )
                  </span>
                </Button>
              )}
          </div>
        </div>
      )}

      {/* Mobile Card Layout - Hidden on large screens */}
      <div className='lg:hidden space-y-3'>
        {filteredBills.map((bill) => (
          <Card key={bill.id} className='p-4 hover:shadow-md transition-shadow'>
            <div className='space-y-3'>
              {/* Card Header */}
              <div className='flex items-start justify-between'>
                <div className='flex items-start gap-3 flex-1 min-w-0'>
                  {canSelectBill(bill) && (
                    <div
                      className='cursor-pointer mt-1 shrink-0'
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
                  <div className='flex-1 min-w-0'>
                    <h3 className='font-semibold text-sm text-gray-900 dark:text-gray-100 truncate'>
                      {bill.bill_description}
                    </h3>
                    <p className='text-xs text-muted-foreground mt-1'>
                      {bill.item_category?.item_category_name}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                  {getStatusBadge(bill.status)}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='sm' className='h-8 w-8 p-0'>
                        <span className='sr-only'>Open menu</span>
                        <Eye className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/billing/schedule/${bill.id}`}>
                          <Eye className='mr-2 h-4 w-4' />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      {canEditBills && (
                        <DropdownMenuItem asChild>
                          <Link href={`/billing/schedule/${bill.id}/edit`}>
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Bill
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canSelectBill(bill) && canCreateReceipts && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/billing/receipts/new?bill_ids=${bill.id}`}
                          >
                            <Receipt className='mr-2 h-4 w-4' />
                            Generate Receipt
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canSelectBill(bill) && canApplyDiscounts && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/billing/discounts/new?bill_id=${bill.id}`}
                          >
                            <Percent className='mr-2 h-4 w-4' />
                            Apply Discount
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canSelectBill(bill) &&
                        bill.status === 'partially_paid' &&
                        canProcessRefunds && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/refunds/new?bill_id=${bill.id}`}
                            >
                              <Undo className='mr-2 h-4 w-4' />
                              Process Refund
                            </Link>
                          </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Card Body - Amount Details */}
              <div className='grid grid-cols-2 gap-4 pt-2 border-t'>
                <div>
                  <p className='text-xs text-muted-foreground'>Due Date</p>
                  <div className='flex items-center gap-1 mt-1'>
                    <Calendar className='h-3 w-3 text-muted-foreground' />
                    <span className='text-sm font-medium'>
                      {formatDate(bill.due_date)}
                    </span>
                    {isOverdue(bill.due_date, bill.status) && (
                      <AlertCircle className='h-3 w-3 text-red-600' />
                    )}
                  </div>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>Amount</p>
                  <p className='text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1'>
                    {formatCurrency(bill.final_amount)}
                  </p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>Balance Due</p>
                  <p className='text-sm font-semibold text-orange-600 mt-1'>
                    {bill.status === 'paid'
                      ? formatCurrency(0)
                      : formatCurrency(
                          bill.balance_amount > 0
                            ? bill.balance_amount
                            : bill.final_amount
                        )}
                  </p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>Category</p>
                  <p className='text-xs text-gray-600 dark:text-gray-400 mt-1 truncate'>
                    {bill.item_category?.parent_category?.parent_category_name}{' '}
                    → {bill.item_category?.sub_category?.sub_category_name}
                  </p>
                </div>
              </div>

              {/* Additional Info */}
              {(bill.remarks || bill.quantity > 1) && (
                <div className='pt-2 border-t space-y-1'>
                  {bill.quantity > 1 && (
                    <p className='text-xs text-muted-foreground'>
                      Qty: {bill.quantity} × {formatCurrency(bill.unit_amount)}
                    </p>
                  )}
                  {bill.remarks && (
                    <p className='text-xs text-muted-foreground'>
                      {bill.remarks}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop Table Layout - Hidden on mobile */}
      <div className='hidden lg:block rounded-md border overflow-hidden'>
        <Table>
          <TableHeader>
            <TableRow className='bg-gray-50 dark:bg-gray-800'>
              <TableHead className='w-12'>
                <div
                  className='flex items-center justify-center cursor-pointer'
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
              <TableHead className='font-semibold'>Category</TableHead>
              <TableHead className='font-semibold'>Due Date</TableHead>
              <TableHead className='text-right font-semibold'>Amount</TableHead>
              <TableHead className='text-right font-semibold'>
                Balance Due
              </TableHead>
              <TableHead className='text-center font-semibold'>
                Status
              </TableHead>
              <TableHead className='text-center font-semibold'>
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBills.map((bill, index) => (
              <TableRow
                key={bill.id}
                className={`hover:bg-muted/50 transition-colors ${
                  index % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50 dark:bg-gray-800'
                }`}
              >
                <TableCell>
                  {canSelectBill(bill) && (
                    <div
                      className='flex items-center justify-center cursor-pointer'
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

                <TableCell className='max-w-xs'>
                  <div className='space-y-1'>
                    <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                      {bill.item_category?.item_category_name}
                    </div>
                    <div className='text-xs text-muted-foreground truncate'>
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
                    <Calendar className='h-4 w-4 text-muted-foreground shrink-0' />
                    <div className='space-y-1'>
                      <div className='text-sm font-medium'>
                        {formatDate(bill.due_date)}
                      </div>
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
                    <div className='font-semibold text-gray-900 dark:text-gray-100'>
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
                    <div className='font-semibold text-orange-600'>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='sm' className='h-8 w-8 p-0'>
                        <span className='sr-only'>Open menu</span>
                        <EllipsisVertical className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/billing/schedule/${bill.id}`}>
                          <Eye className='mr-2 h-4 w-4' />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      {canEditBills && (
                        <DropdownMenuItem asChild>
                          <Link href={`/billing/schedule/${bill.id}/edit`}>
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Bill
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {canSelectBill(bill) && canCreateReceipts && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/billing/receipts/new?bill_ids=${bill.id}`}
                          >
                            <Receipt className='mr-2 h-4 w-4' />
                            Generate Receipt
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canSelectBill(bill) && canApplyDiscounts && (
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/billing/discounts/new?bill_id=${bill.id}`}
                          >
                            <Percent className='mr-2 h-4 w-4' />
                            Apply Discount
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {canSelectBill(bill) &&
                        bill.status === 'partially_paid' &&
                        canProcessRefunds && (
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/billing/refunds/new?bill_id=${bill.id}`}
                            >
                              <Undo className='mr-2 h-4 w-4' />
                              Process Refund
                            </Link>
                          </DropdownMenuItem>
                        )}
                      {canDeleteBills && (
                        <>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className='text-destructive'
                              >
                                <Trash2 className='mr-2 h-4 w-4' />
                                Delete Bill
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Bill</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this bill?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteBill(bill.id)}
                                  className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {filteredBills.length === 0 && (
        <Card className='p-8'>
          <div className='text-center space-y-4'>
            <FileText className='h-12 w-12 text-muted-foreground mx-auto' />
            <div>
              <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                No Bills Found
              </h3>
              <p className='text-muted-foreground mt-1'>
                {statusFilter === 'all'
                  ? 'No bills have been created for this student yet.'
                  : `No bills found with status: ${statusFilter.replace(
                      '_',
                      ' '
                    )}`}
              </p>
            </div>
            {statusFilter !== 'all' && (
              <Button variant='outline' onClick={() => {}}>
                <Filter className='mr-2 h-4 w-4' />
                Clear Filters
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
