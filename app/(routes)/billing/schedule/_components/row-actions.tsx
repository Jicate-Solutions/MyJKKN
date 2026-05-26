'use client';

import { useState } from 'react';
import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Eye, Edit, Trash2, Receipt, Ban } from 'lucide-react';
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
import {
  useDeleteStudentBill,
  useCancelStudentBill
} from '@/hooks/billing/use-student-bills';
import Link from 'next/link';

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
  const cancelStudentBill = useCancelStudentBill();

  const canEditBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  const canCancelBills = isSuperAdmin || canAccess('billing.schedule', 'update');
  const isCancellable = CANCELLABLE_STATUSES.includes(bill.status);

  const handleDelete = async () => {
    try {
      await deleteStudentBill.mutateAsync(bill.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Error deleting bill:', error);
    }
  };

  const handleCancel = async () => {
    if (cancelStudentBill.isPending) return;
    try {
      await cancelStudentBill.mutateAsync({ id: bill.id });
      setShowCancelDialog(false);
    } catch (error) {
      console.error('Error cancelling bill:', error);
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
            <Link href={`/billing/schedule/${bill.id}`}>
              <Eye className='mr-2 h-4 w-4' />
              View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/billing/schedule/students/${bill.student_id}`}>
              <Receipt className='mr-2 h-4 w-4' />
              Student Bills
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

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Student Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the bill &quot;
              {bill.bill_description}&quot; for{' '}
              {`${bill.student?.first_name || ''} ${
                bill.student?.last_name || ''
              }`.trim()}
              ? The outstanding balance will be set to zero. Existing
              payment records will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Bill</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className='bg-amber-600 hover:bg-amber-700 text-white'
              disabled={cancelStudentBill.isPending}
            >
              {cancelStudentBill.isPending ? 'Cancelling...' : 'Cancel Bill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
