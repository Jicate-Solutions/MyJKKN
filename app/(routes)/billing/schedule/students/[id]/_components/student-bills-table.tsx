'use client';

import { Fragment, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Eye,
  Edit,
  Trash2,
  ReceiptIndianRupee,
  Percent,
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
  MoreHorizontal
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
import { toast } from 'react-hot-toast';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import type { StudentBill } from '@/types/billing-schedule';
import { isBillableBill } from '@/lib/billing/bill-status';
import { Card } from '@/components/ui/card';
import {
  useBillInstalments,
  useInvalidateBillInstalments,
} from '@/hooks/billing/use-bill-instalments';
import {
  BillInstalmentSchedule,
  instalmentSummary,
} from './bill-instalment-schedule';

interface StudentBillsTableProps {
  bills: StudentBill[];
  statusFilter: string;
  onRefresh: () => void;
  isStudentView?: boolean; // New prop to indicate if viewing as student
  /**
   * Collect payment WITHOUT navigating. When a host supplies this, Generate
   * Receipt calls it instead of doing a full-document
   * `window.location.href = '/billing/receipts/new?...'` — which is what used
   * to tear down the quick-bill popup (and the search results behind it) at
   * the fee counter. Hosts that want the standalone page simply omit it.
   */
  onGenerateReceipt?: (billIds: string[], studentId?: string) => void;
}

export function StudentBillsTable({
  bills,
  statusFilter,
  onRefresh,
  isStudentView = false,
  onGenerateReceipt
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

  // Filter bills based on status
  const filteredBills = useMemo(() => {
    if (statusFilter === 'all') return bills;
    return bills.filter((bill) => bill.status === statusFilter);
  }, [bills, statusFilter]);

  // A fee collectable in tranches is ONE bill of the full amount, and the
  // bill's due_date is only its NEXT unsettled tranche. Without this the row
  // read "1 Year Tuition Fee · ₹65,000 · due 30 Oct" with nothing to say the
  // ₹65,000 is actually two ₹32,500 collections on two dates — which is
  // exactly how a configured schedule looked like it had never been applied.
  const billIds = useMemo(
    () => filteredBills.map((bill) => bill.id),
    [filteredBills]
  );
  const { data: instalmentsByBill } = useBillInstalments(billIds);
  const invalidateInstalments = useInvalidateBillInstalments();
  const instalmentsFor = (billId: string) => instalmentsByBill?.get(billId) ?? [];

  // Group bills by the bill's own academic year. Null → "Unspecified".
  const billGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; name: string; bills: StudentBill[] }
    >();
    for (const bill of filteredBills) {
      const key = bill.academic_year_id || 'unspecified';
      const name = bill.academic_year?.academic_year_name || 'Unspecified';
      if (!groups.has(key)) groups.set(key, { key, name, bills: [] });
      groups.get(key)!.bills.push(bill);
    }
    // Named years descending (e.g. 2025-2026 before 2024-2025); Unspecified last.
    return Array.from(groups.values()).sort((a, b) => {
      if (a.key === 'unspecified') return 1;
      if (b.key === 'unspecified') return -1;
      return b.name.localeCompare(a.name);
    });
  }, [filteredBills]);

  // Total / paid / outstanding + an aggregate badge for one year's bills.
  //
  // `billed` must exclude BOTH void statuses. It previously excluded only
  // `superseded`, which produced two wrong numbers from one mistake: a
  // cancelled bill inflated `total`, and because `paid` is derived as
  // `total - outstanding` while a cancelled bill contributes nothing to
  // `outstanding`, the difference was reported as money received. A learner
  // with a ₹70,000 paid bill and a ₹35,000 cancelled one showed
  // "Total ₹1,05,000 · Paid ₹1,05,000".
  const summarizeGroup = (groupBills: StudentBill[]) => {
    const billed = groupBills.filter(isBillableBill);
    const total = billed.reduce((s, b) => s + b.final_amount, 0);
    const outstanding = billed.reduce(
      (s, b) =>
        s +
        (['unpaid', 'partially_paid', 'overdue'].includes(b.status)
          ? b.balance_amount > 0
            ? b.balance_amount
            : b.final_amount
          : 0),
      0
    );
    const paid = Math.max(0, total - outstanding);
    // Void bills are already filtered out of `billed`, so settlement is simply
    // "every remaining bill is paid" — listing 'cancelled' here as well was
    // what let an all-cancelled year still render a green PAID badge.
    const allSettled = billed.length > 0 && billed.every((b) => b.status === 'paid');
    const label = allSettled ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    return { total, paid, outstanding, label };
  };

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

  // Task 12: refund-workflow disbursement badge, shown next to the status
  // badge once billing_student_bills.refund_status is set by
  // fn_disburse_refund_request.
  const getRefundBadge = (bill: StudentBill) => {
    if (!bill.refund_status) return null;
    const refundedAmount = formatCurrency(Number(bill.refunded_amount ?? 0));
    if (bill.refund_status === 'refunded') {
      return (
        <Badge
          variant='destructive'
          className='bg-red-100 text-red-800 border-red-200'
        >
          Refunded {refundedAmount}
        </Badge>
      );
    }
    return (
      <Badge
        variant='outline'
        className='bg-orange-100 text-orange-800 border-orange-200'
      >
        Partially Refunded {refundedAmount}
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
      // Was previously a TODO stub that only console.log'd the id and called
      // onRefresh, which made the UI behave as if the delete succeeded while
      // leaving the row in the database. Now actually issues the delete.
      // FK cascades (billing_receipt_items, billing_discounts,
      // payment_transaction_items) clean up child rows automatically.
      await StudentBillService.deleteStudentBill(billId);
      toast.success('Bill deleted');
      // The deleted bill's tranches went with it (FK cascade), and this cache
      // is keyed on the bill-id set — drop it or the schedule of a bill that
      // no longer exists survives the refresh.
      invalidateInstalments();
      onRefresh();
    } catch (error) {
      console.error('Error deleting bill:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete bill'
      );
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

  // Single entry point for both the bulk action bar and the per-row menu, so
  // the popup-vs-navigate decision is made in exactly one place.
  const openReceiptFor = (billIds: string[], studentId?: string) => {
    if (billIds.length === 0) return;

    if (onGenerateReceipt) {
      onGenerateReceipt(billIds, studentId);
      return;
    }

    const query = new URLSearchParams({ bill_ids: billIds.join(',') });
    if (studentId) query.set('student_id', studentId);
    window.location.href = `/billing/receipts/new?${query.toString()}`;
  };

  const handleGenerateReceipt = () => {
    openReceiptFor(
      selectedSelectableBills.map((bill) => bill.id),
      selectedSelectableBills[0]?.student_id
    );
  };

  const handleApplyDiscount = () => {
    if (selectedSelectableBills.length === 0) return;

    const billIds = selectedSelectableBills.map((bill) => bill.id).join(',');
    const studentId = selectedSelectableBills[0]?.student_id;

    window.location.href = `/billing/discounts/new?bill_ids=${billIds}&student_id=${studentId}`;
  };

  const renderBillCard = (bill: StudentBill) => (
    <Card key={bill.id} className='p-4 hover:shadow-md transition-shadow'>
      <div className='space-y-3'>
        {/* Card Header */}
        <div className='flex items-start justify-between'>
          <div className='flex items-start gap-3 flex-1 min-w-0'>
            {canSelectBill(bill) && (
              <div
                className='cursor-pointer mt-1 shrink-0'
                onClick={() =>
                  handleSelectBill(bill.id, !selectedBills.includes(bill.id))
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
                {bill.item_category?.category_name}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            {getStatusBadge(bill.status)}
            {getRefundBadge(bill)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='sm' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <Eye className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                {canEditBills && (
                  <DropdownMenuItem asChild>
                    <Link href={`/billing/schedule/${bill.id}/edit`}>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Bill
                    </Link>
                  </DropdownMenuItem>
                )}
                {canSelectBill(bill) && canCreateReceipts && (
                  <DropdownMenuItem
                    onSelect={() => openReceiptFor([bill.id], bill.student_id)}
                  >
                    <ReceiptIndianRupee className='mr-2 h-4 w-4' />
                    Generate Receipt
                  </DropdownMenuItem>
                )}
                {canSelectBill(bill) && canApplyDiscounts && (
                  <DropdownMenuItem asChild>
                    <Link href={`/billing/discounts/new?bill_id=${bill.id}`}>
                      <Percent className='mr-2 h-4 w-4' />
                      Apply Discount
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
              {bill.item_category?.category_name || '—'}
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
              <p className='text-xs text-muted-foreground'>{bill.remarks}</p>
            )}
          </div>
        )}

        {/* The card view is what phones get; a schedule visible only on the
            desktop table would be the same missing-instalments bug there. */}
        {instalmentsFor(bill.id).length > 0 && (
          <BillInstalmentSchedule rows={instalmentsFor(bill.id)} />
        )}
      </div>
    </Card>
  );

  const renderBillRow = (bill: StudentBill, index: number) => (
    <Fragment key={bill.id}>
    <TableRow
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
              handleSelectBill(bill.id, !selectedBills.includes(bill.id))
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
            {bill.item_category?.category_name}
          </div>
          {bill.bill_description &&
            bill.bill_description !== bill.item_category?.category_name && (
              <div className='text-xs text-muted-foreground'>
                {bill.bill_description}
              </div>
            )}
          {bill.item_category?.frequency && (
            <div className='text-xs text-muted-foreground capitalize'>
              {bill.item_category.frequency}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className='flex items-center gap-2'>
          <Calendar className='h-4 w-4 text-muted-foreground shrink-0' />
          <div className='space-y-1'>
            <div className='text-sm font-medium'>
              {formatDate(bill.due_date)}
            </div>
            {instalmentsFor(bill.id).length > 0 && (
              // Says the date above is one of several, so nobody reads a
              // scheduled bill's next-tranche date as its only collection.
              <div className='text-xs text-muted-foreground'>
                {instalmentSummary(instalmentsFor(bill.id))}
              </div>
            )}
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
              Paid: {formatCurrency(bill.final_amount - bill.balance_amount)}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className='text-center'>
        <div className='flex flex-col items-center gap-1'>
          {getStatusBadge(bill.status)}
          {getRefundBadge(bill)}
        </div>
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
              <DropdownMenuItem
                onSelect={() => openReceiptFor([bill.id], bill.student_id)}
              >
                <ReceiptIndianRupee className='mr-2 h-4 w-4' />
                Generate Receipt
              </DropdownMenuItem>
            )}
            {canSelectBill(bill) && canApplyDiscounts && (
              <DropdownMenuItem asChild>
                <Link href={`/billing/discounts/new?bill_id=${bill.id}`}>
                  <Percent className='mr-2 h-4 w-4' />
                  Apply Discount
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
                        Are you sure you want to delete this bill? This action
                        cannot be undone.
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
    {instalmentsFor(bill.id).length > 0 && (
      <TableRow
        className={
          index % 2 === 0
            ? 'bg-white dark:bg-gray-900'
            : 'bg-gray-50 dark:bg-gray-800'
        }
      >
        {/* 7 columns: select, category, due date, amount, balance, status,
            actions. Spanning all of them keeps the schedule visually inside
            the bill it belongs to rather than beside it. */}
        <TableCell colSpan={7} className='pt-0'>
          <BillInstalmentSchedule rows={instalmentsFor(bill.id)} />
        </TableCell>
      </TableRow>
    )}
    </Fragment>
  );

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
                <ReceiptIndianRupee className='mr-2 h-4 w-4' />
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

          </div>
        </div>
      )}

      {/* Mobile Card Layout — grouped by academic year */}
      <div className='lg:hidden space-y-6'>
        {billGroups.map((group) => {
          const s = summarizeGroup(group.bills);
          return (
            <div key={group.key} className='space-y-3'>
              <div className='flex items-center justify-between rounded-md bg-muted px-3 py-2'>
                <div className='font-semibold text-sm'>{group.name}</div>
                <div className='flex items-center gap-2'>
                  <span className='text-xs text-muted-foreground'>
                    {formatCurrency(s.paid)} / {formatCurrency(s.total)}
                  </span>
                  <Badge
                    className={
                      s.label === 'PAID'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : s.label === 'PARTIAL'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                        : 'bg-orange-100 text-orange-800 border-orange-200'
                    }
                  >
                    {s.label}
                  </Badge>
                </div>
              </div>
              {group.bills.map((bill) => renderBillCard(bill))}
            </div>
          );
        })}
      </div>

      {/* Desktop Table Layout — grouped by academic year */}
      <div className='hidden lg:block space-y-6'>
        {billGroups.map((group) => {
          const s = summarizeGroup(group.bills);
          return (
            <div key={group.key} className='rounded-md border overflow-hidden'>
              <div className='flex items-center justify-between bg-muted px-4 py-2 border-b'>
                <div className='font-semibold'>{group.name}</div>
                <div className='flex items-center gap-4 text-sm'>
                  <span>Total: {formatCurrency(s.total)}</span>
                  <span className='text-green-600'>
                    Paid: {formatCurrency(s.paid)}
                  </span>
                  <span className='text-orange-600'>
                    Outstanding: {formatCurrency(s.outstanding)}
                  </span>
                  <Badge
                    className={
                      s.label === 'PAID'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : s.label === 'PARTIAL'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                        : 'bg-orange-100 text-orange-800 border-orange-200'
                    }
                  >
                    {s.label}
                  </Badge>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className='bg-gray-50 dark:bg-gray-800'>
                    <TableHead className='w-12'></TableHead>
                    <TableHead className='font-semibold'>Category</TableHead>
                    <TableHead className='font-semibold'>Due Date</TableHead>
                    <TableHead className='text-right font-semibold'>
                      Amount
                    </TableHead>
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
                  {group.bills.map((bill, index) => renderBillRow(bill, index))}
                </TableBody>
              </Table>
            </div>
          );
        })}
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
