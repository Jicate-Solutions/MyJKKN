'use client';

import { useState } from 'react';
import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Edit, Trash2, ReceiptIndianRupee, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { StudentBill } from '@/types/billing-schedule';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteStudentBill } from '@/hooks/billing/use-student-bills';
import { useCancelBill } from '@/hooks/billing/use-bill-cancellation';
import { BillCancelDialog } from '@/components/billing/bill-cancel-dialog';
import Link from 'next/link';
import type {
  BillCancelReasonCode,
  BillCancellationAttachment
} from '@/types/billing-bill-cancellation';

const CANCELLABLE_STATUSES = ['unpaid', 'partially_paid', 'overdue'];

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const bill = row.original as StudentBill;
  const { canAccess, isSuperAdmin } = usePermissions();
  const deleteStudentBill = useDeleteStudentBill();
  const cancelBill = useCancelBill();

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  // Its own key, not billing.schedule.update: cancelling writes off money.
  const canCancelBills = isSuperAdmin || canAccess('billing.schedule', 'cancel');
  const isCancellable = CANCELLABLE_STATUSES.includes(bill.status);

  const handleDelete = async () => {
    try {
      await deleteStudentBill.mutateAsync(bill.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Error deleting bill:', error);
    }
  };

  // The dialog collects the reason code, notes and documents that
  // fn_cancel_student_bill requires. This used to send NOTHING but the id --
  // the service accepted a `reason` argument no caller ever passed.
  const handleCancel = async (payload: {
    reasonCode: BillCancelReasonCode;
    reason: string;
    attachments: BillCancellationAttachment[];
  }) => {
    if (cancelBill.isPending) return;
    try {
      await cancelBill.mutateAsync({ billId: bill.id, ...payload });
      setShowCancelDialog(false);
    } catch {
      // Guard message already surfaced by the hook; keep the dialog open so
      // the operator can read it beside what they typed.
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[200px]'>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/billing/schedule/students/${bill.student_id}?tab=bills`}>
              <ReceiptIndianRupee className='mr-2 h-4 w-4' />
              View / Student Bills
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canEditBills && (
            <DropdownMenuItem asChild>
              <Link href={`/billing/schedule/${bill.id}/edit`}>
                <Edit className='mr-2 h-4 w-4' />
                Edit Bill
              </Link>
            </DropdownMenuItem>
          )}
          {canCancelBills && isCancellable && (
            <DropdownMenuItem
              className='text-amber-700 focus:text-amber-800 focus:bg-amber-50'
              onClick={() => setShowCancelDialog(true)}
            >
              <Ban className='mr-2 h-4 w-4' />
              Cancel Bill
            </DropdownMenuItem>
          )}
          {isSuperAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className='text-destructive focus:text-destructive'
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete Bill
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <BillCancelDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        bills={[
          {
            id: bill.id,
            bill_description: bill.bill_description,
            final_amount: bill.final_amount,
            status: bill.status,
            student_name: `${bill.student?.first_name || ''} ${
              bill.student?.last_name || ''
            }`.trim()
          }
        ]}
        institutionName={bill.institution?.name || 'Unknown Institution'}
        isPending={cancelBill.isPending}
        onConfirm={handleCancel}
      />

      {/* Delete Dialog — super admin only */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the bill &quot;
              {bill.bill_description}&quot; for{' '}
              {`${bill.student?.first_name || ''} ${
                bill.student?.last_name || ''
              }`.trim()}
              ? This action cannot be undone. All related payments, receipts,
              discounts, and refunds will also be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={deleteStudentBill.isPending}
            >
              {deleteStudentBill.isPending ? 'Deleting...' : 'Delete Bill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
